const assert = require("node:assert/strict");
const { existsSync, readdirSync, readFileSync, rmSync, mkdtempSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");
const Database = require("better-sqlite3");

const serverRoot = join(__dirname, "..");
const scriptPath = join(
  serverRoot,
  "scripts",
  "preflight-architecture-consolidation.mjs",
);

/** 신규 preflight ESM module을 cache-busting URL로 불러온다. */
const loadPreflight = async () =>
  import(`${pathToFileURL(scriptPath).href}?test=${Date.now()}-${Math.random()}`);

/** deployment graph 기본 fixture를 생성한다. */
const validDeployment = () => ({
  kind: "deployment-architecture",
  schemaVersion: 1,
  name: "Preflight deployment",
  generatedAt: "2026-08-17T09:00:00+09:00",
  sourceRevision: "preflight-test",
  environments: [
    { id: "production", name: "Production", kind: "cloud" },
  ],
  nodes: [
    {
      id: "api",
      name: "API",
      kind: "service",
      environmentId: "production",
    },
    {
      id: "database",
      name: "Database",
      kind: "database",
      environmentId: "production",
    },
  ],
  connections: [
    {
      id: "api-database",
      sourceNodeId: "api",
      targetNodeId: "database",
      protocol: "TCP",
    },
  ],
});

/** legacy Architecture/ArchitecturePlan schema fixture를 만든다. */
const createLegacyDatabase = (databasePath, deployments = [validDeployment()]) => {
  const database = new Database(databasePath);

  try {
    database.exec(`
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
        "html" TEXT NOT NULL DEFAULT ''
      );
      INSERT INTO "Project" ("id") VALUES (1);
    `);

    const insertArchitecture = database.prepare(`
      INSERT INTO "Architecture"
        ("projectId", "updatedAt", "title", "content", "html")
      VALUES
        (1, '2026-08-17T00:00:00.000Z', ?, ?, '')
    `);
    deployments.forEach((deployment, index) => {
      const content =
        typeof deployment === "string"
          ? deployment
          : JSON.stringify(deployment);
      insertArchitecture.run(`Current ${index + 1}`, content);
    });
    database.prepare(`
      INSERT INTO "ArchitecturePlan"
        ("projectId", "updatedAt", "title", "content", "html")
      VALUES
        (1, '2026-08-17T00:00:00.000Z', 'Plan', '# Plan',
         '<!doctype html><html><head></head><body>Plan</body></html>')
    `).run();
  } finally {
    database.close();
  }
};

/** 통합 이후 typed Architecture schema fixture를 만든다. */
const createConsolidatedDatabase = (databasePath) => {
  const database = new Database(databasePath);

  try {
    database.exec(`
      CREATE TABLE "Architecture" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "projectId" INTEGER NOT NULL,
        "type" TEXT NOT NULL,
        "updatedAt" DATETIME NOT NULL,
        "title" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "html" TEXT NOT NULL DEFAULT ''
      );
    `);
  } finally {
    database.close();
  }
};

test("legacy DB preflight는 full backup과 검증·복원 evidence를 생성한다", async () => {
  const directory = mkdtempSync(join(tmpdir(), "architecture-preflight-happy-"));
  const databasePath = join(directory, "legacy.db");
  const backupDirectory = join(directory, "backups");
  const logs = [];

  try {
    createLegacyDatabase(databasePath);
    const { runArchitectureConsolidationPreflight } = await loadPreflight();
    const result = await runArchitectureConsolidationPreflight({
      databaseUrl: pathToFileURL(databasePath).href,
      backupDirectory,
      logger: { log: (message) => logs.push(message) },
    });

    assert.equal(result.action, "ready");
    assert.equal(result.databasePath, resolve(databasePath));
    assert.equal(result.counts.architectures, 1);
    assert.equal(result.counts.architecturePlans, 1);
    assert.equal(result.integrityCheck, "ok");
    assert.equal(result.foreignKeyViolationCount, 0);
    assert.match(result.sha256, /^[a-f0-9]{64}$/);
    assert.equal(result.restoreRehearsal.ok, true);
    assert.equal(existsSync(result.backupPath), true);
    assert.match(result.backupPath, /architecture-consolidation.*\.db$/);

    const backup = new Database(result.backupPath, {
      readonly: true,
      fileMustExist: true,
    });
    try {
      assert.equal(
        backup.prepare('SELECT COUNT(*) AS count FROM "Architecture"').get().count,
        1,
      );
      assert.equal(
        backup.prepare('SELECT COUNT(*) AS count FROM "ArchitecturePlan"').get().count,
        1,
      );
    } finally {
      backup.close();
    }

    assert.equal(logs.length, 1);
    const evidence = JSON.parse(logs[0].replace(/^Architecture consolidation preflight: /, ""));
    assert.equal(evidence.backupPath, result.backupPath);
    assert.equal(evidence.sha256, result.sha256);
    assert.equal(evidence.restoreRehearsal.ok, true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("preflight는 deployment schema의 전체 상한·strict·참조 무결성 위반을 거부한다", async (context) => {
  const { runArchitectureConsolidationPreflight } = await loadPreflight();
  const cases = [
    ["invalid JSON", () => "{invalid"],
    ["environment upper bound", (graph) => {
      graph.environments = Array.from({ length: 51 }, (_, index) => ({
        id: `env-${index}`,
        name: `Environment ${index}`,
        kind: "cloud",
      }));
    }],
    ["node upper bound", (graph) => {
      graph.nodes = Array.from({ length: 101 }, (_, index) => ({
        id: `node-${index}`,
        name: `Node ${index}`,
        kind: "service",
        environmentId: "production",
      }));
      graph.connections = [];
    }],
    ["connection upper bound", (graph) => {
      graph.connections = Array.from({ length: 1_001 }, (_, index) => ({
        id: `connection-${index}`,
        sourceNodeId: "api",
        targetNodeId: "database",
      }));
    }],
    ["strict unknown field", (graph) => {
      graph.nodes[0].unknown = true;
    }],
    ["duplicate environment id", (graph) => {
      graph.environments.push({ id: "production", name: "Other", kind: "cloud" });
    }],
    ["duplicate environment name", (graph) => {
      graph.environments.push({ id: "other", name: "Production", kind: "cloud" });
    }],
    ["duplicate node id", (graph) => {
      graph.nodes[1].id = "api";
    }],
    ["duplicate node name", (graph) => {
      graph.nodes[1].name = "API";
    }],
    ["unknown environment reference", (graph) => {
      graph.nodes[0].environmentId = "missing";
    }],
    ["unknown node endpoint", (graph) => {
      graph.connections[0].targetNodeId = "missing";
    }],
    ["self loop", (graph) => {
      graph.connections[0].targetNodeId = "api";
    }],
    ["duplicate connection id", (graph) => {
      graph.connections.push({
        id: "api-database",
        sourceNodeId: "database",
        targetNodeId: "api",
      });
    }],
    ["duplicate directed endpoint", (graph) => {
      graph.connections.push({
        id: "duplicate-endpoint",
        sourceNodeId: "api",
        targetNodeId: "database",
      });
    }],
  ];

  for (const [name, mutate] of cases) {
    await context.test(name, async () => {
      const directory = mkdtempSync(join(tmpdir(), "architecture-preflight-invalid-"));
      const databasePath = join(directory, "legacy.db");
      const backupDirectory = join(directory, "backups");
      const graph = validDeployment();
      const replacement = mutate(graph);

      try {
        createLegacyDatabase(databasePath, [replacement ?? graph]);
        await assert.rejects(
          runArchitectureConsolidationPreflight({
            databaseUrl: pathToFileURL(databasePath).href,
            backupDirectory,
            logger: { log: () => undefined },
          }),
          /Architecture 1/i,
        );
        assert.deepEqual(
          existsSync(backupDirectory) ? readdirSync(backupDirectory) : [],
          [],
        );
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });
  }
});

test("fresh DB와 이미 통합된 DB는 backup 없이 safe no-op한다", async (context) => {
  const { runArchitectureConsolidationPreflight } = await loadPreflight();
  const fixtures = [
    ["fresh", () => undefined],
    ["already-consolidated", createConsolidatedDatabase],
  ];

  for (const [expectedState, setup] of fixtures) {
    await context.test(expectedState, async () => {
      const directory = mkdtempSync(join(tmpdir(), "architecture-preflight-noop-"));
      const databasePath = join(directory, "database.db");
      const backupDirectory = join(directory, "backups");
      const database = new Database(databasePath);
      database.close();
      setup(databasePath);

      try {
        const result = await runArchitectureConsolidationPreflight({
          databaseUrl: pathToFileURL(databasePath).href,
          backupDirectory,
          logger: { log: () => undefined },
        });

        assert.deepEqual(result, { action: "noop", state: expectedState });
        assert.equal(existsSync(backupDirectory), false);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });
  }
});

test("DB migration scripts는 prepare→preflight→migrate 순서를 고정한다", () => {
  const packageJson = JSON.parse(
    readFileSync(join(serverRoot, "package.json"), "utf8"),
  );

  for (const [scriptName, migrateCommand] of [
    ["predev", "prisma migrate deploy"],
    ["prestart", "prisma migrate deploy"],
    ["prisma:migrate", "prisma migrate dev"],
  ]) {
    const command = packageJson.scripts[scriptName];
    const prepareIndex = command.indexOf("node scripts/prepare-sqlite.mjs");
    const preflightIndex = command.indexOf(
      "node scripts/preflight-architecture-consolidation.mjs",
    );
    const migrateIndex = command.indexOf(migrateCommand);

    assert.ok(prepareIndex >= 0);
    assert.ok(preflightIndex > prepareIndex);
    assert.ok(migrateIndex > preflightIndex);
    assert.match(
      command,
      new RegExp(
        `node scripts/prepare-sqlite\\.mjs && node scripts/preflight-architecture-consolidation\\.mjs && ${migrateCommand.replaceAll(" ", "\\s+")}`,
      ),
      `${scriptName}는 preflight 실패 시 migrate deploy를 실행하지 않아야 한다`,
    );
  }
});
