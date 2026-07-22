const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, readdirSync, rmSync } = require("node:fs");
const { execFileSync } = require("node:child_process");
const { tmpdir } = require("node:os");
const { dirname, join } = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const ts = require("typescript");

const serverRoot = join(__dirname, "..");

const loadTypeScriptModule = (relativePath) => {
  const filename = join(serverRoot, "src", relativePath);
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  const loadedModule = new Module(filename, module);

  loadedModule.filename = filename;
  loadedModule.paths = Module._nodeModulePaths(dirname(filename));
  loadedModule._compile(output, filename);
  return loadedModule.exports;
};

const validDeployment = () => ({
  kind: "deployment-architecture",
  schemaVersion: 1,
  name: "Harness production",
  generatedAt: "2026-07-21T09:00:00+09:00",
  sourceRevision: "abc123",
  environments: [
    { id: "browser", name: "Browser", kind: "client" },
    {
      id: "production",
      name: "Production",
      kind: "cloud",
      provider: "Vercel",
      region: "icn1",
    },
  ],
  nodes: [
    {
      id: "web",
      name: "Next.js Web",
      kind: "client",
      environmentId: "browser",
      runtime: "Node.js 24",
    },
    {
      id: "api",
      name: "Nest API",
      kind: "service",
      environmentId: "production",
      runtime: "Node.js 24",
      description: "MCP and dashboard API",
    },
  ],
  connections: [
    {
      id: "web-api",
      sourceNodeId: "web",
      targetNodeId: "api",
      label: "Dashboard API",
      protocol: "HTTPS",
    },
  ],
});

test("deployment architecture parser는 정규 graph를 허용하고 unknown field를 거부한다", () => {
  const { deploymentArchitectureSchema } = loadTypeScriptModule(
    "services/architectures/deployment-architecture.ts",
  );

  assert.equal(deploymentArchitectureSchema.safeParse(validDeployment()).success, true);
  assert.equal(
    deploymentArchitectureSchema.safeParse({
      ...validDeployment(),
      unexpected: true,
    }).success,
    false,
  );
});

test("deployment architecture parser는 ID·name 중복을 거부한다", () => {
  const { deploymentArchitectureSchema } = loadTypeScriptModule(
    "services/architectures/deployment-architecture.ts",
  );

  for (const mutate of [
    (value) => ({ ...value, environments: [value.environments[0], value.environments[0]] }),
    (value) => ({
      ...value,
      nodes: [value.nodes[0], { ...value.nodes[1], id: value.nodes[0].id }],
    }),
    (value) => ({
      ...value,
      nodes: [value.nodes[0], { ...value.nodes[1], name: value.nodes[0].name }],
    }),
    (value) => ({
      ...value,
      connections: [value.connections[0], value.connections[0]],
    }),
  ]) {
    assert.equal(deploymentArchitectureSchema.safeParse(mutate(validDeployment())).success, false);
  }
});

test("deployment architecture parser는 깨진 참조·self connection·중복 directed pair를 거부한다", () => {
  const { deploymentArchitectureSchema } = loadTypeScriptModule(
    "services/architectures/deployment-architecture.ts",
  );

  for (const mutate of [
    (value) => ({
      ...value,
      nodes: [{ ...value.nodes[0], environmentId: "missing" }, value.nodes[1]],
    }),
    (value) => ({
      ...value,
      connections: [{ ...value.connections[0], targetNodeId: "missing" }],
    }),
    (value) => ({
      ...value,
      connections: [{ ...value.connections[0], targetNodeId: "web" }],
    }),
    (value) => ({
      ...value,
      connections: [
        value.connections[0],
        { ...value.connections[0], id: "web-api-copy" },
      ],
    }),
  ]) {
    assert.equal(deploymentArchitectureSchema.safeParse(mutate(validDeployment())).success, false);
  }
});

test("Domain migration은 valid ERD만 이동하고 prose·malformed·deployment Architecture를 보존한다", () => {
  const migrationsRoot = join(serverRoot, "prisma", "migrations");
  const migration = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(migrationsRoot, entry.name, "migration.sql"))
    .map((path) => ({ path, sql: readFileSync(path, "utf8") }))
    .find(({ sql }) => /CREATE TABLE\s+["']Domain["']/.test(sql));

  assert.ok(migration, "Domain migration이 존재해야 한다");

  const temporaryDirectory = mkdtempSync(join(tmpdir(), "domain-migration-"));
  const databasePath = join(temporaryDirectory, "migration.db");
  const sqlString = (value) => `'${String(value).replaceAll("'", "''")}'`;
  const createdAt = "2026-07-20T01:00:00.000Z";
  const updatedAt = "2026-07-20T02:00:00.000Z";
  const records = [
    [10, "Domain", JSON.stringify({
      kind: "domain-erd",
      schemaVersion: 1,
      name: "Valid domain",
      entities: [{ id: "project", name: "Project", fields: [{ name: "id", type: "Int", nullable: false }] }],
      relationships: [],
    })],
    [11, "Broken domain", JSON.stringify({ kind: "domain-erd", schemaVersion: 1 })],
    [12, "Legacy prose", "Agent -> API -> SQLite"],
    [13, "Deployment", JSON.stringify(validDeployment())],
  ];
  const setupSql = `
    CREATE TABLE "Project" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT);
    CREATE TABLE "Architecture" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "projectId" INTEGER NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      "title" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      CONSTRAINT "Architecture_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id")
    );
    INSERT INTO "Project" ("id") VALUES (1);
    ${records.map(([id, title, content]) => `
      INSERT INTO "Architecture" (id, projectId, createdAt, updatedAt, title, content)
      VALUES (${id}, 1, ${sqlString(createdAt)}, ${sqlString(updatedAt)}, ${sqlString(title)}, ${sqlString(content)});
    `).join("\n")}
  `;

  try {
    execFileSync("/usr/bin/sqlite3", [databasePath], { input: setupSql });
    execFileSync("/usr/bin/sqlite3", [databasePath], { input: migration.sql });

    const domains = JSON.parse(
      execFileSync(
        "/usr/bin/sqlite3",
        ["-json", databasePath, 'SELECT id, projectId, createdAt, updatedAt, title FROM "Domain"'],
        { encoding: "utf8" },
      ),
    );
    const architectureIds = JSON.parse(
      execFileSync(
        "/usr/bin/sqlite3",
        ["-json", databasePath, 'SELECT id FROM "Architecture" ORDER BY id'],
        { encoding: "utf8" },
      ),
    ).map(({ id }) => id);

    assert.deepEqual(domains, [
      { id: 10, projectId: 1, createdAt, updatedAt, title: "Domain" },
    ]);
    assert.deepEqual(architectureIds, [11, 12, 13]);
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
});
