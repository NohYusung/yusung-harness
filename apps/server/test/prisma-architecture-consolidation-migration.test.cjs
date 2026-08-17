const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const serverRoot = join(__dirname, "..");
const migrationsRoot = join(serverRoot, "prisma", "migrations");

const sqlite = (databasePath, sql) =>
  execFileSync(
    "/usr/bin/sqlite3",
    ["-batch", "-bail", "-separator", "|", databasePath],
    { encoding: "utf8", input: sql },
  ).trim();

const findConsolidationMigration = () => {
  const matches = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(migrationsRoot, entry.name, "migration.sql"))
    .map((path) => ({ path, sql: readFileSync(path, "utf8") }))
    .filter(({ sql }) =>
      /Architecture_projectId_type_key/.test(sql) &&
      /DROP TABLE\s+["']ArchitecturePlan["']/i.test(sql) &&
      /["']PRODUCTION["']/.test(sql) &&
      /["']PLAN["']/.test(sql),
    );

  assert.equal(
    matches.length,
    1,
    "Architecture PLAN·PRODUCTION 통합 migration이 하나 있어야 한다",
  );
  return matches[0].sql;
};

const sqlString = (value) => `'${String(value).replaceAll("'", "''")}'`;

const minimalDeployment = JSON.stringify({
  kind: "deployment-architecture",
  schemaVersion: 1,
  name: "Migration fixture",
  environments: [],
  nodes: [{ id: "api", name: "API", kind: "service" }],
  connections: [],
});

const createLegacyDatabase = ({
  databasePath,
  projects,
  architectures,
  architecturePlans = [],
}) => {
  sqlite(
    databasePath,
    `
      PRAGMA foreign_keys=OFF;
      CREATE TABLE "Project" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT
      );
      CREATE TABLE "Architecture" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "projectId" INTEGER NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        "title" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "html" TEXT NOT NULL DEFAULT '',
        CONSTRAINT "Architecture_projectId_fkey"
          FOREIGN KEY ("projectId") REFERENCES "Project" ("id")
          ON DELETE RESTRICT ON UPDATE CASCADE
      );
      CREATE TABLE "ArchitecturePlan" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "projectId" INTEGER NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        "title" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "html" TEXT NOT NULL DEFAULT '',
        CONSTRAINT "ArchitecturePlan_projectId_fkey"
          FOREIGN KEY ("projectId") REFERENCES "Project" ("id")
          ON DELETE RESTRICT ON UPDATE CASCADE
      );
      ${projects.map((id) => `INSERT INTO "Project" ("id") VALUES (${id});`).join("\n")}
      ${architectures
        .map(
          (row) => `INSERT INTO "Architecture"
            ("id", "projectId", "updatedAt", "title", "content", "html")
          VALUES
            (${row.id}, ${row.projectId}, '2026-08-17T00:00:00.000Z',
             ${sqlString(row.title)}, ${sqlString(row.content)}, '');`,
        )
        .join("\n")}
      ${architecturePlans
        .map(
          (row) => `INSERT INTO "ArchitecturePlan"
            ("id", "projectId", "updatedAt", "title", "content", "html")
          VALUES
            (${row.id}, ${row.projectId}, '2026-08-17T00:00:00.000Z',
             ${sqlString(row.title)}, '# Plan', '<!doctype html><html><head></head><body>Plan</body></html>');`,
        )
        .join("\n")}
    `,
  );
};

test("migration은 live 1 Current+4 Plan을 ID·byte·timestamp 보존하며 통합하고 type unique·FK를 보장한다", () => {
  const migration = findConsolidationMigration();
  const directory = mkdtempSync(join(tmpdir(), "architecture-consolidation-"));
  const databasePath = join(directory, "migration.db");
  const current = {
    id: 1,
    projectId: 6,
    createdAt: "2026-08-11T08:00:00.000Z",
    updatedAt: "2026-08-11T09:00:00.000Z",
    title: "BeaconOps current",
    content: JSON.stringify({
      kind: "deployment-architecture",
      schemaVersion: 1,
      name: "BeaconOps",
      generatedAt: "2026-08-11T09:00:00.000Z",
      sourceRevision: "synthetic-demo-v1",
      environments: [{ id: "prod", name: "Production", kind: "cloud" }],
      nodes: [
        {
          id: "api",
          name: "API",
          kind: "service",
          environmentId: "prod",
        },
      ],
      connections: [],
    }),
    html: "",
  };
  const plans = [1, 2, 3, 4].map((id) => ({
    id,
    projectId: id === 4 ? 6 : id,
    createdAt: `2026-08-1${id}T01:00:00.000Z`,
    updatedAt: `2026-08-1${id}T02:00:00.000Z`,
    title: `Plan ${id}`,
    content: `# Plan ${id}\n\n한글·quote ' ${id}`,
    html: `<!doctype html><html><head><title>Plan ${id}</title></head><body>→ ${id}</body></html>`,
  }));

  try {
    sqlite(
      databasePath,
      `
        PRAGMA foreign_keys=ON;
        CREATE TABLE "Project" (
          "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT
        );
        CREATE TABLE "Architecture" (
          "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          "projectId" INTEGER NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL,
          "title" TEXT NOT NULL,
          "content" TEXT NOT NULL,
          "html" TEXT NOT NULL DEFAULT '',
          CONSTRAINT "Architecture_projectId_fkey"
            FOREIGN KEY ("projectId") REFERENCES "Project" ("id")
            ON DELETE RESTRICT ON UPDATE CASCADE
        );
        CREATE TABLE "ArchitecturePlan" (
          "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          "projectId" INTEGER NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL,
          "title" TEXT NOT NULL,
          "content" TEXT NOT NULL,
          "html" TEXT NOT NULL DEFAULT '',
          CONSTRAINT "ArchitecturePlan_projectId_fkey"
            FOREIGN KEY ("projectId") REFERENCES "Project" ("id")
            ON DELETE RESTRICT ON UPDATE CASCADE
        );
        CREATE INDEX "Architecture_projectId_idx" ON "Architecture"("projectId");
        CREATE UNIQUE INDEX "ArchitecturePlan_projectId_key" ON "ArchitecturePlan"("projectId");
        INSERT INTO "Project" ("id") VALUES (1), (2), (3), (6);
        INSERT INTO "Architecture"
          ("id", "projectId", "createdAt", "updatedAt", "title", "content", "html")
        VALUES
          (${current.id}, ${current.projectId}, ${sqlString(current.createdAt)},
           ${sqlString(current.updatedAt)}, ${sqlString(current.title)},
           ${sqlString(current.content)}, ${sqlString(current.html)});
        ${plans
          .map(
            (plan) => `INSERT INTO "ArchitecturePlan"
              ("id", "projectId", "createdAt", "updatedAt", "title", "content", "html")
            VALUES
              (${plan.id}, ${plan.projectId}, ${sqlString(plan.createdAt)},
               ${sqlString(plan.updatedAt)}, ${sqlString(plan.title)},
               ${sqlString(plan.content)}, ${sqlString(plan.html)});`,
          )
          .join("\n")}
      `,
    );

    sqlite(databasePath, migration);

    const rows = JSON.parse(
      execFileSync(
        "/usr/bin/sqlite3",
        [
          "-json",
          databasePath,
          'SELECT id, projectId, type, createdAt, updatedAt, title, content, html FROM "Architecture" ORDER BY id',
        ],
        { encoding: "utf8" },
      ),
    );
    assert.deepEqual(rows, [
      { ...current, type: "PRODUCTION" },
      ...plans.map((plan) => ({ ...plan, id: 1 + plan.id, type: "PLAN" })),
    ]);
    assert.equal(
      sqlite(
        databasePath,
        `SELECT COUNT(*) FROM sqlite_master
         WHERE type = 'table' AND name = 'ArchitecturePlan';`,
      ),
      "0",
    );
    assert.equal(
      sqlite(
        databasePath,
        `SELECT "name" FROM pragma_index_list('Architecture')
         WHERE "name" = 'Architecture_projectId_type_key';`,
      ),
      "Architecture_projectId_type_key",
    );
    assert.throws(() =>
      sqlite(
        databasePath,
        `INSERT INTO "Architecture"
          ("projectId", "type", "updatedAt", "title", "content", "html")
         VALUES (6, 'PLAN', CURRENT_TIMESTAMP, 'duplicate', '# duplicate', '');`,
      ),
    );
    assert.equal(sqlite(databasePath, "PRAGMA foreign_key_check;"), "");
    assert.equal(sqlite(databasePath, "PRAGMA integrity_check;"), "ok");
    assert.equal(
      sqlite(databasePath, `SELECT seq FROM sqlite_sequence WHERE name = 'Architecture';`),
      "5",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("migration은 duplicate PRODUCTION, orphan, invalid JSON을 감지하면 원본 전체를 rollback한다", async (context) => {
  const migration = findConsolidationMigration();
  const cases = [
    {
      name: "duplicate PRODUCTION",
      projects: [1],
      architectures: [
        { id: 1, projectId: 1, title: "Current A", content: minimalDeployment },
        { id: 2, projectId: 1, title: "Current B", content: minimalDeployment },
      ],
    },
    {
      name: "orphan project",
      projects: [1],
      architectures: [
        { id: 1, projectId: 99, title: "Orphan", content: minimalDeployment },
      ],
    },
    {
      name: "invalid PRODUCTION JSON",
      projects: [1],
      architectures: [
        {
          id: 1,
          projectId: 1,
          title: "Invalid graph",
          content: '{"kind":"deployment-architecture"}',
        },
      ],
    },
  ];

  for (const fixture of cases) {
    await context.test(fixture.name, () => {
      const directory = mkdtempSync(join(tmpdir(), "architecture-rollback-"));
      const databasePath = join(directory, "migration.db");

      try {
        createLegacyDatabase({ databasePath, ...fixture });
        assert.throws(() => sqlite(databasePath, migration));

        assert.equal(
          sqlite(
            databasePath,
            `SELECT group_concat(name, ',')
             FROM (
               SELECT name FROM sqlite_master
               WHERE type = 'table' AND name IN ('Architecture', 'ArchitecturePlan')
               ORDER BY name
             );`,
          ),
          "Architecture,ArchitecturePlan",
        );
        assert.equal(
          sqlite(databasePath, `SELECT COUNT(*) FROM "Architecture";`),
          String(fixture.architectures.length),
        );
        assert.equal(
          sqlite(databasePath, `SELECT COUNT(*) FROM "ArchitecturePlan";`),
          String(fixture.architecturePlans?.length ?? 0),
        );
        assert.equal(sqlite(databasePath, "PRAGMA integrity_check;"), "ok");
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });
  }
});
