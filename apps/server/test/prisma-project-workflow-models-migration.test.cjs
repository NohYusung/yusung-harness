const assert = require("node:assert/strict");
const {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} = require("node:fs");
const { execFileSync } = require("node:child_process");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const serverRoot = join(__dirname, "..");
const schemaPath = join(serverRoot, "prisma", "schema.prisma");
const migrationsRoot = join(serverRoot, "prisma", "migrations");

function modelBody(schema, modelName) {
  const model = schema.match(
    new RegExp(`model\\s+${modelName}\\s*\\{([\\s\\S]*?)\\n\\}`),
  )?.[1];

  assert.ok(model, `${modelName} 모델이 존재해야 한다`);
  return model;
}

function findProjectWorkflowMigration() {
  const matches = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(migrationsRoot, entry.name, "migration.sql"))
    .filter((path) => {
      try {
        const migration = readFileSync(path, "utf8");
        return (
          migration.includes('CREATE TABLE "ArchitecturePlan"') &&
          migration.includes('CREATE TABLE "Request"') &&
          migration.includes('CREATE TABLE "WorkLog"') &&
          migration.includes('DROP INDEX "Design_projectId_assetId_version_key"') &&
          migration.includes(
            'CREATE UNIQUE INDEX "Design_wireframeId_assetId_version_key"',
          )
        );
      } catch {
        return false;
      }
    });

  assert.equal(
    matches.length,
    1,
    "프로젝트 workflow 모델과 Design identity를 반영하는 migration이 하나 있어야 한다",
  );
  return matches[0];
}

function sqlite(databasePath, sql) {
  return execFileSync("/usr/bin/sqlite3", ["-separator", "|", databasePath], {
    encoding: "utf8",
    input: sql,
  }).trim();
}

function assertProjectOwnedDocument(
  model,
  modelName,
  { uniqueProject = false } = {},
) {
  assert.match(model, /^\s*id\s+Int\s+@id\s+@default\(autoincrement\(\)\)\s*$/m);
  assert.match(model, /^\s*projectId\s+Int(?:\s+@unique)?\s*$/m);
  assert.match(
    model,
    /^\s*project\s+Project\s+@relation\(fields:\s*\[projectId\],\s*references:\s*\[id\]\)\s*$/m,
  );
  assert.match(model, /^\s*createdAt\s+DateTime\s+@default\(now\(\)\)\s*$/m);
  assert.match(model, /^\s*updatedAt\s+DateTime\s+@updatedAt\s*$/m);
  assert.match(model, /^\s*title\s+String\s*$/m);
  assert.match(model, /^\s*content\s+String\s*$/m);
  if (uniqueProject) {
    assert.ok(
      /^\s*projectId\s+Int\s+@unique\s*$/m.test(model) ||
        /@@unique\(\[projectId\]\)/.test(model),
      `${modelName}.projectId unique`,
    );
  } else {
    assert.match(model, /@@index\(\[projectId\]\)/, `${modelName}.projectId index`);
  }
}

test("Project workflow 모델은 상태와 프로젝트 소유권 계약을 제공한다", () => {
  const schema = readFileSync(schemaPath, "utf8");
  const project = modelBody(schema, "Project");
  const architecture = modelBody(schema, "Architecture");
  const request = modelBody(schema, "Request");
  const workLog = modelBody(schema, "WorkLog");
  const requestStatus = schema.match(
    /enum\s+RequestStatus\s*\{([\s\S]*?)\n\}/,
  )?.[1];

  assert.ok(requestStatus, "RequestStatus enum이 존재해야 한다");
  assert.deepEqual(
    requestStatus.match(/^\s*[A-Z][A-Z_]*\s*$/gm)?.map((value) => value.trim()),
    ["PENDING", "IN_PROGRESS", "COMPLETED"],
  );

  for (const [field, type] of [
    ["architectures", "Architecture"],
    ["requests", "Request"],
    ["workLogs", "WorkLog"],
  ]) {
    assert.match(project, new RegExp(`^\\s*${field}\\s+${type}\\[\\]\\s*$`, "m"));
  }

  assertProjectOwnedDocument(architecture, "Architecture");
  assert.match(architecture, /^\s*type\s+ArchitectureType\s*$/m);
  assert.match(architecture, /@@unique\(\[projectId,\s*type\]\)/);
  assert.doesNotMatch(schema, /model\s+ArchitecturePlan\s*\{/);
  assertProjectOwnedDocument(request, "Request");
  assertProjectOwnedDocument(workLog, "WorkLog");
  assert.match(
    request,
    /^\s*status\s+RequestStatus\s+@default\(PENDING\)\s*$/m,
  );
  assert.doesNotMatch(schema, /\bAGENT\b/);
});

test("workflow migration은 기존 Design을 보존하고 identity와 신규 테이블을 전환한다", () => {
  const migration = readFileSync(findProjectWorkflowMigration(), "utf8");
  const directory = mkdtempSync(join(tmpdir(), "project-workflow-migration-"));
  const databasePath = join(directory, "migration.db");

  try {
    sqlite(
      databasePath,
      `
        PRAGMA foreign_keys=ON;
        CREATE TABLE "Project" (
          "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT
        );
        CREATE TABLE "Asset" (
          "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          "projectId" INTEGER NOT NULL,
          CONSTRAINT "Asset_projectId_fkey"
            FOREIGN KEY ("projectId") REFERENCES "Project" ("id")
            ON DELETE RESTRICT ON UPDATE CASCADE
        );
        CREATE TABLE "Wireframe" (
          "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          "projectId" INTEGER NOT NULL,
          CONSTRAINT "Wireframe_projectId_fkey"
            FOREIGN KEY ("projectId") REFERENCES "Project" ("id")
            ON DELETE RESTRICT ON UPDATE CASCADE
        );
        CREATE TABLE "Design" (
          "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          "projectId" INTEGER NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL,
          "wireframeId" INTEGER NOT NULL,
          "assetId" INTEGER NOT NULL,
          "html" TEXT NOT NULL,
          "title" TEXT NOT NULL,
          "version" INTEGER NOT NULL DEFAULT 1,
          CONSTRAINT "Design_projectId_fkey"
            FOREIGN KEY ("projectId") REFERENCES "Project" ("id")
            ON DELETE RESTRICT ON UPDATE CASCADE,
          CONSTRAINT "Design_wireframeId_fkey"
            FOREIGN KEY ("wireframeId") REFERENCES "Wireframe" ("id")
            ON DELETE RESTRICT ON UPDATE CASCADE,
          CONSTRAINT "Design_assetId_fkey"
            FOREIGN KEY ("assetId") REFERENCES "Asset" ("id")
            ON DELETE RESTRICT ON UPDATE CASCADE
        );
        CREATE UNIQUE INDEX "Design_projectId_assetId_version_key"
          ON "Design"("projectId", "assetId", "version");

        INSERT INTO "Project" ("id") VALUES (7);
        INSERT INTO "Asset" ("id", "projectId") VALUES (22, 7);
        INSERT INTO "Wireframe" ("id", "projectId") VALUES (21, 7), (23, 7);
        INSERT INTO "Design"
          ("id", "projectId", "updatedAt", "wireframeId", "assetId", "html", "title", "version")
        VALUES
          (31, 7, '2026-07-20 03:00:00', 21, 22, '<html>V1</html>', 'Design V1', 1);
      `,
    );

    sqlite(databasePath, migration);

    assert.equal(
      sqlite(
        databasePath,
        `SELECT "id", "projectId", "wireframeId", "assetId", "version", "title"
         FROM "Design" ORDER BY "id";`,
      ),
      "31|7|21|22|1|Design V1",
    );
    assert.equal(
      sqlite(
        databasePath,
        `SELECT name FROM sqlite_master
         WHERE type = 'index'
           AND name IN (
             'Design_projectId_assetId_version_key',
             'Design_wireframeId_assetId_version_key'
           )
         ORDER BY name;`,
      ),
      "Design_wireframeId_assetId_version_key",
    );

    sqlite(
      databasePath,
      `INSERT INTO "Design"
        ("projectId", "updatedAt", "wireframeId", "assetId", "html", "title", "version")
       VALUES
        (7, CURRENT_TIMESTAMP, 23, 22, '<html>Other wireframe</html>', 'Other wireframe', 1);`,
    );
    try {
      sqlite(
        databasePath,
        `INSERT INTO "Design"
          ("projectId", "updatedAt", "wireframeId", "assetId", "html", "title", "version")
         VALUES
          (7, CURRENT_TIMESTAMP, 21, 22, '<html>Duplicate</html>', 'Duplicate', 1);`,
      );
    } catch {
      // SQLite CLI 버전과 무관하게 아래 row count로 unique 거부를 검증한다.
    }
    assert.equal(sqlite(databasePath, 'SELECT COUNT(*) FROM "Design";'), "2");

    assert.equal(
      sqlite(
        databasePath,
        `SELECT name FROM sqlite_master
         WHERE type = 'table'
           AND name IN ('ArchitecturePlan', 'Request', 'WorkLog')
         ORDER BY name;`,
      ),
      "ArchitecturePlan\nRequest\nWorkLog",
    );
    assert.equal(
      sqlite(
        databasePath,
        `SELECT name FROM sqlite_master
         WHERE type = 'index'
           AND name IN (
             'ArchitecturePlan_projectId_idx',
             'Request_projectId_idx',
             'WorkLog_projectId_idx'
           )
         ORDER BY name;`,
      ),
      "ArchitecturePlan_projectId_idx\nRequest_projectId_idx\nWorkLog_projectId_idx",
    );

    for (const table of ["ArchitecturePlan", "Request", "WorkLog"]) {
      assert.match(
        sqlite(databasePath, `PRAGMA foreign_key_list("${table}");`),
        /^0\|0\|Project\|projectId\|id\|CASCADE\|RESTRICT\|NONE$/,
        `${table}.projectId foreign key`,
      );
    }

    sqlite(
      databasePath,
      `INSERT INTO "Request"
        ("projectId", "updatedAt", "title", "content")
       VALUES
        (7, CURRENT_TIMESTAMP, 'Add API', 'Create the endpoint');`,
    );
    assert.equal(sqlite(databasePath, 'SELECT "status" FROM "Request";'), "PENDING");
    try {
      sqlite(
        databasePath,
        `PRAGMA foreign_keys=ON;
         INSERT INTO "WorkLog"
           ("projectId", "updatedAt", "title", "content")
         VALUES
           (999, CURRENT_TIMESTAMP, 'Invalid', 'Missing project');`,
      );
    } catch {
      // SQLite CLI 버전과 무관하게 아래 row count로 FK 거부를 검증한다.
    }
    assert.equal(sqlite(databasePath, 'SELECT COUNT(*) FROM "WorkLog";'), "0");
    assert.equal(
      sqlite(databasePath, "PRAGMA foreign_key_check;"),
      "",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
