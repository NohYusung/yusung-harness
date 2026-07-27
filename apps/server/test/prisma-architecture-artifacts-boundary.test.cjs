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
const schemaPath = join(serverRoot, "prisma", "schema.prisma");
const migrationsRoot = join(serverRoot, "prisma", "migrations");
const schema = readFileSync(schemaPath, "utf8");

const modelBody = (modelName) => {
  const match = schema.match(
    new RegExp(`model\\s+${modelName}\\s*\\{([\\s\\S]*?)\\n\\}`),
  );

  assert.ok(match, `${modelName} 모델이 존재해야 한다`);
  return match[1];
};

const findArchitectureArtifactsMigration = () => {
  const matches = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(migrationsRoot, entry.name, "migration.sql"))
    .filter((path) => {
      try {
        const migration = readFileSync(path, "utf8");

        return (
          migration.includes('"architecturePlanId"') &&
          migration.includes('"Plan_architecturePlanId_idx"') &&
          migration.includes("ON DELETE SET NULL") &&
          migration.includes('"html"') &&
          migration.includes('"version"')
        );
      } catch {
        return false;
      }
    });

  assert.equal(
    matches.length,
    1,
    "Architecture 산출물 필드와 Plan FK를 반영하는 migration이 하나 있어야 한다",
  );
  return matches[0];
};

const sqlite = (databasePath, sql) =>
  execFileSync(
    "/usr/bin/sqlite3",
    ["-batch", "-bail", "-separator", "|", databasePath],
    { encoding: "utf8", input: sql },
  ).trim();

test("Plan은 version과 ArchitecturePlan relation 없이 lifecycle status를 저장한다", () => {
  const plan = modelBody("Plan");

  assert.match(
    plan,
    /^\s*status\s+PlanStatus\s+@default\(PENDING\)\s*$/m,
  );
  assert.doesNotMatch(plan, /^\s*version\s+/m);
  assert.doesNotMatch(plan, /^\s*architecturePlanId\s+/m);
  assert.doesNotMatch(plan, /^\s*architecturePlan\s+/m);
  assert.doesNotMatch(plan, /@@unique\(\[projectId,\s*version\]\)/);
  assert.doesNotMatch(plan, /@@index\(\[architecturePlanId\]\)/);
});

test("ArchitecturePlan은 project당 하나이며 version과 Plan relation을 갖지 않는다", () => {
  const architecture = modelBody("Architecture");
  const architecturePlan = modelBody("ArchitecturePlan");

  assert.match(architecture, /^\s*html\s+String\b/m);
  assert.match(architecturePlan, /^\s*html\s+String\b/m);
  assert.match(architecturePlan, /^\s*projectId\s+Int(?:\s+@unique)?\s*$/m);
  assert.ok(
    /^\s*projectId\s+Int\s+@unique\s*$/m.test(architecturePlan) ||
      /@@unique\(\[projectId\]\)/.test(architecturePlan),
    "ArchitecturePlan.projectId에 단일-column unique가 있어야 한다",
  );
  assert.doesNotMatch(architecturePlan, /^\s*version\s+/m);
  assert.doesNotMatch(architecturePlan, /^\s*plans\s+Plan\[\]\s*$/m);
});

test("Plan lifecycle schema에는 처리되지 않은 AGENT 주석이 남지 않는다", () => {
  assert.doesNotMatch(schema, /\bAGENT\b/);
});

test("변경된 relation을 포함한 Prisma schema는 유효하다", () => {
  assert.doesNotThrow(() =>
    execFileSync(
      join(serverRoot, "node_modules", ".bin", "prisma"),
      ["validate", "--schema", schemaPath],
      {
        cwd: serverRoot,
        env: { ...process.env, DATABASE_URL: "file:./test.db" },
        stdio: "pipe",
      },
    ),
  );
});

test("migration은 기존 Architecture 산출물과 Plan을 보존하며 nullable FK를 추가한다", () => {
  const migration = readFileSync(findArchitectureArtifactsMigration(), "utf8");
  const directory = mkdtempSync(join(tmpdir(), "architecture-artifacts-migration-"));
  const databasePath = join(directory, "migration.db");

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
          CONSTRAINT "Plan_projectId_fkey"
            FOREIGN KEY ("projectId") REFERENCES "Project" ("id")
            ON DELETE RESTRICT ON UPDATE CASCADE
        );
        CREATE INDEX "Architecture_projectId_idx" ON "Architecture"("projectId");
        CREATE INDEX "ArchitecturePlan_projectId_idx" ON "ArchitecturePlan"("projectId");
        CREATE UNIQUE INDEX "Plan_projectId_version_key" ON "Plan"("projectId", "version");
        CREATE INDEX "Plan_projectId_idx" ON "Plan"("projectId");

        INSERT INTO "Project" ("id") VALUES (7);
        INSERT INTO "Architecture"
          ("id", "projectId", "createdAt", "updatedAt", "title", "content")
        VALUES
          (11, 7, '2026-07-20 01:00:00', '2026-07-20 02:00:00', 'Current', 'architecture markdown');
        INSERT INTO "ArchitecturePlan"
          ("id", "projectId", "createdAt", "updatedAt", "title", "content")
        VALUES
          (21, 7, '2026-07-20 03:00:00', '2026-07-20 04:00:00', 'Proposed', 'plan markdown');
        INSERT INTO "Plan"
          ("id", "projectId", "createdAt", "updatedAt", "version", "content", "title")
        VALUES
          (31, 7, '2026-07-20 05:00:00', '2026-07-20 06:00:00', 3, 'work plan', 'Iteration 3');
      `,
    );

    sqlite(databasePath, migration);

    assert.equal(
      sqlite(
        databasePath,
        `SELECT "id", "projectId", "createdAt", "updatedAt", "title", "content", "html"
         FROM "Architecture" WHERE "id" = 11;`,
      ),
      "11|7|2026-07-20 01:00:00|2026-07-20 02:00:00|Current|architecture markdown|",
    );
    assert.equal(
      sqlite(
        databasePath,
        `SELECT "id", "projectId", "createdAt", "updatedAt", "title", "content", "html", "version"
         FROM "ArchitecturePlan" WHERE "id" = 21;`,
      ),
      "21|7|2026-07-20 03:00:00|2026-07-20 04:00:00|Proposed|plan markdown||1",
    );
    assert.equal(
      sqlite(
        databasePath,
        `SELECT "id", "projectId", "createdAt", "updatedAt", "version", "content", "title",
                COALESCE("architecturePlanId", 'NULL')
         FROM "Plan" WHERE "id" = 31;`,
      ),
      "31|7|2026-07-20 05:00:00|2026-07-20 06:00:00|3|work plan|Iteration 3|NULL",
    );

    sqlite(
      databasePath,
      `INSERT INTO "Architecture"
         ("projectId", "updatedAt", "title", "content")
       VALUES (7, CURRENT_TIMESTAMP, 'Default architecture', 'md');
       INSERT INTO "ArchitecturePlan"
         ("projectId", "updatedAt", "title", "content")
       VALUES (7, CURRENT_TIMESTAMP, 'Default plan', 'md');`,
    );
    assert.equal(
      sqlite(
        databasePath,
        `SELECT "html" FROM "Architecture" WHERE "title" = 'Default architecture';`,
      ),
      "",
    );
    assert.equal(
      sqlite(
        databasePath,
        `SELECT "html", "version"
         FROM "ArchitecturePlan" WHERE "title" = 'Default plan';`,
      ),
      "|1",
    );

    assert.equal(
      sqlite(
        databasePath,
        `SELECT "table", "from", "to", "on_update", "on_delete"
         FROM pragma_foreign_key_list('Plan')
         WHERE "from" = 'architecturePlanId';`,
      ),
      "ArchitecturePlan|architecturePlanId|id|CASCADE|SET NULL",
    );
    assert.equal(
      sqlite(
        databasePath,
        `SELECT "notnull" FROM pragma_table_info('Plan')
         WHERE "name" = 'architecturePlanId';`,
      ),
      "0",
    );
    assert.equal(
      sqlite(
        databasePath,
        `SELECT "name" FROM pragma_index_list('Plan')
         WHERE "name" = 'Plan_architecturePlanId_idx';`,
      ),
      "Plan_architecturePlanId_idx",
    );
    assert.equal(
      sqlite(
        databasePath,
        `SELECT "name" FROM pragma_index_info('Plan_architecturePlanId_idx')
         ORDER BY "seqno";`,
      ),
      "architecturePlanId",
    );

    assert.equal(
      sqlite(
        databasePath,
        `PRAGMA foreign_keys=ON;
         UPDATE "Plan" SET "architecturePlanId" = 21 WHERE "id" = 31;
         DELETE FROM "ArchitecturePlan" WHERE "id" = 21;
         SELECT COALESCE("architecturePlanId", 'NULL') FROM "Plan" WHERE "id" = 31;
         PRAGMA foreign_key_check;`,
      ),
      "NULL",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
