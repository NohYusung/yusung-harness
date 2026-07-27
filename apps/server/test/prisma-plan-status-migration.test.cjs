const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const serverRoot = join(__dirname, "..");
const migrationPath = join(
  serverRoot,
  "prisma",
  "migrations",
  "20260727000000_replace_plan_versions_with_status",
  "migration.sql",
);

const sqlite = (databasePath, sql) =>
  execFileSync(
    "/usr/bin/sqlite3",
    ["-batch", "-bail", "-separator", "|", databasePath],
    { encoding: "utf8", input: sql },
  ).trim();

const createCurrentSchema = (databasePath, { duplicateArchitecturePlans }) => {
  sqlite(
    databasePath,
    `
      PRAGMA foreign_keys=ON;
      CREATE TABLE "Project" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT
      );
      CREATE TABLE "ArchitecturePlan" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "projectId" INTEGER NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        "title" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "html" TEXT NOT NULL DEFAULT '',
        "version" INTEGER NOT NULL DEFAULT 1,
        CONSTRAINT "ArchitecturePlan_projectId_fkey"
          FOREIGN KEY ("projectId") REFERENCES "Project" ("id")
          ON DELETE RESTRICT ON UPDATE CASCADE
      );
      CREATE TABLE "Plan" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "projectId" INTEGER NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        "version" INTEGER NOT NULL DEFAULT 1,
        "content" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "architecturePlanId" INTEGER,
        CONSTRAINT "Plan_projectId_fkey"
          FOREIGN KEY ("projectId") REFERENCES "Project" ("id")
          ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "Plan_architecturePlanId_fkey"
          FOREIGN KEY ("architecturePlanId") REFERENCES "ArchitecturePlan" ("id")
          ON DELETE SET NULL ON UPDATE CASCADE
      );
      CREATE TABLE "Task" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "projectId" INTEGER NOT NULL,
        "planId" INTEGER NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "title" TEXT NOT NULL,
        "content" TEXT,
        CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id"),
        CONSTRAINT "Task_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan" ("id") ON DELETE CASCADE
      );
      CREATE INDEX "ArchitecturePlan_projectId_idx" ON "ArchitecturePlan"("projectId");
      CREATE UNIQUE INDEX "Plan_projectId_version_key" ON "Plan"("projectId", "version");
      CREATE INDEX "Plan_projectId_idx" ON "Plan"("projectId");
      CREATE INDEX "Plan_architecturePlanId_idx" ON "Plan"("architecturePlanId");

      INSERT INTO "Project" ("id") VALUES (7), (8);
      INSERT INTO "ArchitecturePlan"
        ("id", "projectId", "createdAt", "updatedAt", "title", "content", "html", "version")
      VALUES
        (21, 7, '2026-07-20 01:00:00', '2026-07-20 02:00:00', 'Project 7 architecture', 'architecture content', '<!doctype html>', 2),
        (24, 8, '2026-07-20 01:00:00', '2026-07-20 02:00:00', 'Project 8 architecture', 'other content', '<!doctype html>', 1);
      ${duplicateArchitecturePlans ? `INSERT INTO "ArchitecturePlan"
        ("id", "projectId", "createdAt", "updatedAt", "title", "content", "html", "version")
        VALUES
        (22, 7, '2026-07-20 03:00:00', '2026-07-20 04:00:00', 'Duplicate architecture', 'must not be deleted', '<!doctype html>', 3);` : ""}
      INSERT INTO "Plan"
        ("id", "projectId", "createdAt", "updatedAt", "version", "content", "title", "architecturePlanId")
      VALUES
        (31, 7, '2026-07-20 05:00:00', '2026-07-20 06:00:00', 1, 'zero tasks', 'Pending plan', 21),
        (32, 7, '2026-07-20 05:00:00', '2026-07-20 06:00:00', 2, 'partial tasks', 'In progress plan', 21),
        (33, 7, '2026-07-20 05:00:00', '2026-07-20 06:00:00', 3, 'done tasks', 'Completed plan', 21),
        (34, 8, '2026-07-20 05:00:00', '2026-07-20 06:00:00', 1, 'pending task', 'Started plan', 24);
      INSERT INTO "Task"
        ("id", "projectId", "planId", "updatedAt", "status", "title")
      VALUES
        (41, 7, 32, '2026-07-20 07:00:00', 'COMPLETED', 'Done'),
        (42, 7, 32, '2026-07-20 07:00:00', 'PENDING', 'Todo'),
        (43, 7, 33, '2026-07-20 07:00:00', 'COMPLETED', 'Done A'),
        (44, 7, 33, '2026-07-20 07:00:00', 'COMPLETED', 'Done B'),
        (45, 8, 34, '2026-07-20 07:00:00', 'PENDING', 'Started');
    `,
  );
};

test("migration은 Plan 데이터를 보존하고 Task 집계로 status를 backfill한다", () => {
  const migration = readFileSync(migrationPath, "utf8");
  const directory = mkdtempSync(join(tmpdir(), "plan-status-migration-"));
  const databasePath = join(directory, "migration.db");

  try {
    createCurrentSchema(databasePath, { duplicateArchitecturePlans: false });
    sqlite(databasePath, migration);

    assert.equal(
      sqlite(
        databasePath,
        `SELECT "id", "projectId", "createdAt", "updatedAt", "content", "title", "status"
         FROM "Plan" ORDER BY "id";`,
      ),
      [
        "31|7|2026-07-20 05:00:00|2026-07-20 06:00:00|zero tasks|Pending plan|PENDING",
        "32|7|2026-07-20 05:00:00|2026-07-20 06:00:00|partial tasks|In progress plan|IN_PROGRESS",
        "33|7|2026-07-20 05:00:00|2026-07-20 06:00:00|done tasks|Completed plan|COMPLETED",
        "34|8|2026-07-20 05:00:00|2026-07-20 06:00:00|pending task|Started plan|IN_PROGRESS",
      ].join("\n"),
    );
    assert.equal(
      sqlite(
        databasePath,
        `SELECT COUNT(*) FROM pragma_table_info('Plan')
         WHERE "name" IN ('version', 'architecturePlanId');`,
      ),
      "0",
    );
    assert.equal(
      sqlite(
        databasePath,
        `SELECT COUNT(*) FROM pragma_index_list('Plan')
         WHERE "name" IN ('Plan_projectId_version_key', 'Plan_architecturePlanId_idx');`,
      ),
      "0",
    );
    assert.equal(
      sqlite(databasePath, `SELECT COUNT(*) FROM "Task";`),
      "5",
    );
    assert.equal(sqlite(databasePath, "PRAGMA foreign_key_check;"), "");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("migration은 ArchitecturePlan 모든 행을 보존하고 projectId unique를 추가한다", () => {
  const migration = readFileSync(migrationPath, "utf8");
  const directory = mkdtempSync(join(tmpdir(), "architecture-plan-unique-"));
  const databasePath = join(directory, "migration.db");

  try {
    createCurrentSchema(databasePath, { duplicateArchitecturePlans: false });
    sqlite(databasePath, migration);

    assert.equal(
      sqlite(
        databasePath,
        `SELECT "id", "projectId", "createdAt", "updatedAt", "title", "content", "html"
         FROM "ArchitecturePlan" ORDER BY "id";`,
      ),
      [
        "21|7|2026-07-20 01:00:00|2026-07-20 02:00:00|Project 7 architecture|architecture content|<!doctype html>",
        "24|8|2026-07-20 01:00:00|2026-07-20 02:00:00|Project 8 architecture|other content|<!doctype html>",
      ].join("\n"),
    );
    assert.equal(
      sqlite(
        databasePath,
        `SELECT COUNT(*) FROM pragma_table_info('ArchitecturePlan') WHERE "name" = 'version';`,
      ),
      "0",
    );
    assert.equal(
      sqlite(
        databasePath,
        `SELECT "name" FROM pragma_index_list('ArchitecturePlan')
         WHERE "unique" = 1;`,
      ),
      "ArchitecturePlan_projectId_key",
    );
    assert.throws(() =>
      sqlite(
        databasePath,
        `INSERT INTO "ArchitecturePlan"
          ("projectId", "updatedAt", "title", "content", "html")
         VALUES (7, CURRENT_TIMESTAMP, 'Duplicate', 'content', 'html');`,
      ),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("migration은 기존 ArchitecturePlan 중복을 삭제하지 않고 unique 위반으로 중단한다", () => {
  const migration = readFileSync(migrationPath, "utf8");
  const directory = mkdtempSync(join(tmpdir(), "architecture-plan-duplicate-"));
  const databasePath = join(directory, "migration.db");

  try {
    createCurrentSchema(databasePath, { duplicateArchitecturePlans: true });
    assert.throws(() => sqlite(databasePath, migration));
    assert.equal(
      sqlite(
        databasePath,
        `SELECT "id", "title" FROM "ArchitecturePlan"
         WHERE "projectId" = 7 ORDER BY "id";`,
      ),
      "21|Project 7 architecture\n22|Duplicate architecture",
    );
    assert.equal(
      sqlite(
        databasePath,
        `SELECT "name" FROM pragma_table_info('Plan')
         WHERE "name" IN ('version', 'architecturePlanId') ORDER BY "cid";`,
      ),
      "version\narchitecturePlanId",
    );
    assert.equal(
      sqlite(
        databasePath,
        `SELECT COUNT(*) FROM pragma_table_info('Plan') WHERE "name" = 'status';`,
      ),
      "0",
    );
    assert.equal(
      sqlite(
        databasePath,
        `SELECT COUNT(*) FROM pragma_table_info('ArchitecturePlan') WHERE "name" = 'version';`,
      ),
      "1",
    );
    assert.equal(
      sqlite(
        databasePath,
        `SELECT COUNT(*) FROM pragma_index_list('ArchitecturePlan') WHERE "unique" = 1;`,
      ),
      "0",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
