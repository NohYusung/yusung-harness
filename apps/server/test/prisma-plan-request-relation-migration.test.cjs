const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const serverRoot = join(__dirname, "..");
const schemaPath = join(serverRoot, "prisma", "schema.prisma");
const migrationPath = join(
  serverRoot,
  "prisma",
  "migrations",
  "20260728010000_link_plans_to_requests",
  "migration.sql",
);

function modelBody(schema, modelName) {
  const model = schema.match(
    new RegExp(`model\\s+${modelName}\\s*\\{([\\s\\S]*?)\\n\\}`),
  )?.[1];

  assert.ok(model, `${modelName} 모델이 존재해야 한다`);
  return model;
}

function readRelationMigration() {
  assert.equal(
    existsSync(migrationPath),
    true,
    "Plan과 Request를 연결하는 migration이 존재해야 한다",
  );
  return readFileSync(migrationPath, "utf8");
}

function sqlite(databasePath, sql) {
  return execFileSync(
    "/usr/bin/sqlite3",
    ["-batch", "-bail", "-separator", "|", databasePath],
    { encoding: "utf8", input: sql },
  ).trim();
}

function createPreRelationSchema(databasePath) {
  sqlite(
    databasePath,
    `
      PRAGMA foreign_keys=ON;
      CREATE TABLE "Project" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT
      );
      CREATE TABLE "Request" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "projectId" INTEGER NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        "title" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        CONSTRAINT "Request_projectId_fkey"
          FOREIGN KEY ("projectId") REFERENCES "Project" ("id")
          ON DELETE RESTRICT ON UPDATE CASCADE
      );
      CREATE TABLE "Plan" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "projectId" INTEGER NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "content" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        CONSTRAINT "Plan_projectId_fkey"
          FOREIGN KEY ("projectId") REFERENCES "Project" ("id")
          ON DELETE RESTRICT ON UPDATE CASCADE
      );
      CREATE TABLE "Task" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "projectId" INTEGER NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        "planId" INTEGER NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "title" TEXT NOT NULL,
        "content" TEXT,
        CONSTRAINT "Task_projectId_fkey"
          FOREIGN KEY ("projectId") REFERENCES "Project" ("id")
          ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "Task_planId_fkey"
          FOREIGN KEY ("planId") REFERENCES "Plan" ("id")
          ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE INDEX "Request_projectId_idx" ON "Request"("projectId");
      CREATE INDEX "Plan_projectId_idx" ON "Plan"("projectId");
      CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");
      CREATE INDEX "Task_planId_idx" ON "Task"("planId");

      INSERT INTO "Project" ("id") VALUES (1);
      INSERT INTO "Request"
        ("id", "projectId", "createdAt", "updatedAt", "title", "content", "status")
      VALUES
        (201, 1, '2026-07-28 01:00:00', '2026-07-28 02:00:00', 'First request', 'Request one', 'PENDING'),
        (202, 1, '2026-07-28 03:00:00', '2026-07-28 04:00:00', 'Second request', 'Request two', 'COMPLETED');
      INSERT INTO "Plan"
        ("id", "projectId", "createdAt", "updatedAt", "status", "content", "title")
      VALUES
        (10, 1, '2026-07-28 05:00:00', '2026-07-28 06:00:00', 'PENDING', 'Plan one', 'First plan'),
        (20, 1, '2026-07-28 07:00:00', '2026-07-28 08:00:00', 'COMPLETED', 'Plan two', 'Second plan');
      INSERT INTO "Task"
        ("id", "projectId", "createdAt", "updatedAt", "planId", "status", "title", "content")
      VALUES
        (101, 1, '2026-07-28 09:00:00', '2026-07-28 10:00:00', 10, 'PENDING', 'First child', 'Child one'),
        (102, 1, '2026-07-28 09:00:00', '2026-07-28 10:00:00', 10, 'COMPLETED', 'Second child', NULL),
        (103, 1, '2026-07-28 09:00:00', '2026-07-28 10:00:00', 20, 'PENDING', 'Other plan child', 'Child three');
    `,
  );
}

function withMigratedDatabase(assertions) {
  const migration = readRelationMigration();
  const directory = mkdtempSync(join(tmpdir(), "plan-request-relation-"));
  const databasePath = join(directory, "migration.db");

  try {
    createPreRelationSchema(databasePath);
    sqlite(databasePath, migration);
    assertions({ databasePath, migration });
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

test("Prisma schema는 Plan과 Request의 nullable optional 1:1을 정의한다", () => {
  const schema = readFileSync(schemaPath, "utf8");
  const plan = modelBody(schema, "Plan");
  const request = modelBody(schema, "Request");
  const requestRelation = plan.match(
    /^\s*request\s+Request\?\s+@relation\(([^)]*)\)\s*$/m,
  )?.[1];

  assert.match(plan, /^\s*requestId\s+Int\?\s+@unique\s*$/m);
  assert.ok(requestRelation, "Plan.request optional relation이 존재해야 한다");
  assert.match(requestRelation, /fields:\s*\[requestId\]/);
  assert.match(requestRelation, /references:\s*\[id\]/);
  assert.match(requestRelation, /onDelete:\s*SetNull/);
  assert.match(request, /^\s*plan\s+Plan\?\s*$/m);
});

test("migration은 기존 행을 보존하고 nullable requestId와 unique FK를 추가한다", () => {
  withMigratedDatabase(({ databasePath, migration }) => {
    assert.match(migration, /"requestId"\s+INTEGER(?!\s+NOT NULL)/);
    assert.match(
      migration,
      /CONSTRAINT\s+"Plan_requestId_fkey"\s+FOREIGN KEY\s*\("requestId"\)\s+REFERENCES\s+"Request"\s*\("id"\)\s+ON DELETE SET NULL\s+ON UPDATE CASCADE/,
    );
    assert.match(
      migration,
      /CREATE UNIQUE INDEX\s+"Plan_requestId_key"\s+ON\s+"Plan"\s*\("requestId"\)/,
    );

    assert.equal(
      sqlite(
        databasePath,
        `SELECT "id", "projectId", "createdAt", "updatedAt", "status", "content", "title",
                COALESCE(CAST("requestId" AS TEXT), 'NULL')
         FROM "Plan" ORDER BY "id";`,
      ),
      [
        "10|1|2026-07-28 05:00:00|2026-07-28 06:00:00|PENDING|Plan one|First plan|NULL",
        "20|1|2026-07-28 07:00:00|2026-07-28 08:00:00|COMPLETED|Plan two|Second plan|NULL",
      ].join("\n"),
    );
    assert.equal(
      sqlite(databasePath, `SELECT "id" FROM "Request" ORDER BY "id";`),
      "201\n202",
    );
    assert.equal(
      sqlite(
        databasePath,
        `SELECT "id", "planId" FROM "Task" ORDER BY "id";`,
      ),
      "101|10\n102|10\n103|20",
    );
    assert.equal(
      sqlite(
        databasePath,
        `SELECT "table", "from", "to", "on_update", "on_delete"
         FROM pragma_foreign_key_list('Plan')
         WHERE "from" = 'requestId';`,
      ),
      "Request|requestId|id|CASCADE|SET NULL",
    );
    assert.equal(
      sqlite(
        databasePath,
        `SELECT "name" FROM pragma_index_list('Plan')
         WHERE "name" = 'Plan_requestId_key' AND "unique" = 1;`,
      ),
      "Plan_requestId_key",
    );
    assert.equal(sqlite(databasePath, "PRAGMA foreign_key_check;"), "");
  });
});

test("Request 삭제는 연결된 Plan.requestId만 NULL로 전환한다", () => {
  withMigratedDatabase(({ databasePath }) => {
    assert.equal(
      sqlite(
        databasePath,
        `PRAGMA foreign_keys=ON;
         UPDATE "Plan" SET "requestId" = 201 WHERE "id" = 10;
         DELETE FROM "Request" WHERE "id" = 201;
         SELECT "id", COALESCE(CAST("requestId" AS TEXT), 'NULL')
         FROM "Plan" ORDER BY "id";`,
      ),
      "10|NULL\n20|NULL",
    );
    assert.equal(
      sqlite(databasePath, `SELECT "id" FROM "Request" ORDER BY "id";`),
      "202",
    );
    assert.equal(sqlite(databasePath, `SELECT COUNT(*) FROM "Task";`), "3");
    assert.equal(sqlite(databasePath, "PRAGMA foreign_key_check;"), "");
  });
});

test("동일 Request를 두 Plan에 연결하면 unique constraint가 거부한다", () => {
  withMigratedDatabase(({ databasePath }) => {
    sqlite(
      databasePath,
      `PRAGMA foreign_keys=ON;
       UPDATE "Plan" SET "requestId" = 201 WHERE "id" = 10;`,
    );

    assert.throws(() =>
      sqlite(
        databasePath,
        `UPDATE "Plan" SET "requestId" = 201 WHERE "id" = 20;`,
      ),
    );
    assert.equal(
      sqlite(
        databasePath,
        `SELECT "id", COALESCE(CAST("requestId" AS TEXT), 'NULL')
         FROM "Plan" ORDER BY "id";`,
      ),
      "10|201\n20|NULL",
    );
  });
});

test("Plan-Request migration 이후에도 Plan 삭제는 소유 Task에 cascade한다", () => {
  withMigratedDatabase(({ databasePath }) => {
    assert.equal(
      sqlite(
        databasePath,
        `SELECT "table", "from", "to", "on_update", "on_delete"
         FROM pragma_foreign_key_list('Task')
         WHERE "from" = 'planId';`,
      ),
      "Plan|planId|id|CASCADE|CASCADE",
    );
    assert.equal(
      sqlite(
        databasePath,
        `PRAGMA foreign_keys=ON;
         DELETE FROM "Plan" WHERE "id" = 10;
         SELECT "id", "planId" FROM "Task" ORDER BY "id";`,
      ),
      "103|20",
    );
    assert.equal(
      sqlite(databasePath, `SELECT "id" FROM "Plan" ORDER BY "id";`),
      "20",
    );
    assert.equal(
      sqlite(databasePath, `SELECT "id" FROM "Request" ORDER BY "id";`),
      "201\n202",
    );
    assert.equal(sqlite(databasePath, "PRAGMA foreign_key_check;"), "");
  });
});
