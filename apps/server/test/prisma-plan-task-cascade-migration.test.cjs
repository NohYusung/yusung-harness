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
  "20260728000000_cascade_tasks_on_plan_delete",
  "migration.sql",
);

function modelBody(schema, modelName) {
  const model = schema.match(
    new RegExp(`model\\s+${modelName}\\s*\\{([\\s\\S]*?)\\n\\}`),
  )?.[1];

  assert.ok(model, `${modelName} 모델이 존재해야 한다`);
  return model;
}

function readCascadeMigration() {
  assert.equal(
    existsSync(migrationPath),
    true,
    "Plan 삭제 cascade 전용 migration이 존재해야 한다",
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

function createRestrictivePlanTaskSchema(databasePath) {
  sqlite(
    databasePath,
    `
      PRAGMA foreign_keys=ON;
      CREATE TABLE "Project" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT
      );
      CREATE TABLE "Plan" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "projectId" INTEGER NOT NULL,
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
          ON DELETE RESTRICT ON UPDATE CASCADE
      );
      CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");
      CREATE INDEX "Task_planId_idx" ON "Task"("planId");

      INSERT INTO "Project" ("id") VALUES (1);
      INSERT INTO "Plan" ("id", "projectId") VALUES (10, 1), (20, 1);
      INSERT INTO "Task"
        ("id", "projectId", "updatedAt", "planId", "status", "title")
      VALUES
        (101, 1, '2026-07-28 01:00:00', 10, 'PENDING', 'First child'),
        (102, 1, '2026-07-28 01:00:00', 10, 'COMPLETED', 'Second child'),
        (103, 1, '2026-07-28 01:00:00', 20, 'PENDING', 'Other plan child');
    `,
  );
}

test("Task.plan Prisma relation은 Plan 삭제를 Task에 cascade한다", () => {
  const schema = readFileSync(schemaPath, "utf8");
  const task = modelBody(schema, "Task");
  const planRelation = task.match(
    /^\s*plan\s+Plan\s+@relation\(([^)]*)\)\s*$/m,
  )?.[1];

  assert.ok(planRelation, "Task.plan relation이 존재해야 한다");
  assert.match(planRelation, /fields:\s*\[planId\]/);
  assert.match(planRelation, /references:\s*\[id\]/);
  assert.match(planRelation, /onDelete:\s*Cascade/);
});

test("cascade migration은 Task를 재정의하고 기존 행과 index를 보존한다", () => {
  const migration = readCascadeMigration();

  assert.match(migration, /CREATE TABLE\s+"new_Task"/);
  assert.match(
    migration,
    /CONSTRAINT\s+"Task_planId_fkey"\s+FOREIGN KEY\s*\("planId"\)\s+REFERENCES\s+"Plan"\s*\("id"\)\s+ON DELETE CASCADE\s+ON UPDATE CASCADE/,
  );
  assert.match(
    migration,
    /INSERT INTO\s+"new_Task"[\s\S]*SELECT[\s\S]*FROM\s+"Task"/,
  );
  assert.match(migration, /DROP TABLE\s+"Task"/);
  assert.match(migration, /ALTER TABLE\s+"new_Task"\s+RENAME TO\s+"Task"/);
  assert.match(
    migration,
    /CREATE INDEX\s+"Task_projectId_idx"\s+ON\s+"Task"\s*\("projectId"\)/,
  );
  assert.match(
    migration,
    /CREATE INDEX\s+"Task_planId_idx"\s+ON\s+"Task"\s*\("planId"\)/,
  );
});

test("migration 적용 후 Plan 삭제는 연결 Task만 실제 제거한다", () => {
  const migration = readCascadeMigration();
  const directory = mkdtempSync(join(tmpdir(), "plan-task-cascade-"));
  const databasePath = join(directory, "migration.db");

  try {
    createRestrictivePlanTaskSchema(databasePath);
    sqlite(databasePath, migration);

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
        `SELECT "id", "planId" FROM "Task" ORDER BY "id";`,
      ),
      "101|10\n102|10\n103|20",
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
    assert.equal(sqlite(databasePath, "PRAGMA foreign_key_check;"), "");
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});
