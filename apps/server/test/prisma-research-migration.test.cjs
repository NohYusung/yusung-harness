const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, readFileSync, readdirSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const serverRoot = join(__dirname, "..");
const migrationsRoot = join(serverRoot, "prisma", "migrations");
const sqlite = (databasePath, sql) =>
  execFileSync(
    "/usr/bin/sqlite3",
    ["-batch", "-bail", "-separator", "|", databasePath],
    { encoding: "utf8", input: sql },
  ).trim();

const findResearchMigration = () => {
  const matches = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(migrationsRoot, entry.name, "migration.sql"))
    .map((path) => ({ path, sql: readFileSync(path, "utf8") }))
    .filter(({ sql }) =>
      /CREATE TABLE\s+["']Research["']/i.test(sql) &&
      /DROP TABLE\s+["']Draft["']/i.test(sql) &&
      /Research_projectId_idx/.test(sql),
    );

  assert.equal(matches.length, 1, "Draft 제거와 빈 Research 생성을 수행하는 migration이 하나여야 한다");
  return matches[0].sql;
};

const createLegacyDatabase = (databasePath, { withPartialResearch = false } = {}) => {
  sqlite(
    databasePath,
    `
      PRAGMA foreign_keys=ON;
      CREATE TABLE "Project" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT
      );
      CREATE TABLE "Draft" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "projectId" INTEGER NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        "title" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        CONSTRAINT "Draft_projectId_fkey"
          FOREIGN KEY ("projectId") REFERENCES "Project" ("id")
          ON DELETE RESTRICT ON UPDATE CASCADE
      );
      CREATE INDEX "Draft_projectId_idx" ON "Draft"("projectId");
      INSERT INTO "Project" ("id") VALUES (1), (2);
      INSERT INTO "Draft" ("id", "projectId", "createdAt", "updatedAt", "title", "content")
      VALUES
        (1, 1, '2026-08-10T00:00:00.000Z', '2026-08-10T01:00:00.000Z', 'Draft 1', '# Old draft 1'),
        (2, 2, '2026-08-11T00:00:00.000Z', '2026-08-11T01:00:00.000Z', 'Draft 2', '# Old draft 2');
      ${
        withPartialResearch
          ? `CREATE TABLE "Research" (
               "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
               "projectId" INTEGER NOT NULL,
               "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
               "updatedAt" DATETIME NOT NULL,
               "title" TEXT NOT NULL,
               "content" TEXT NOT NULL
             );`
          : ""
      }
    `,
  );
};

test("migration은 guarded Draft 2행을 이관하지 않고 빈 Research를 만들며 FK·index·sequence를 초기화한다", async () => {
  const migration = findResearchMigration();
  const directory = mkdtempSync(join(tmpdir(), "research-migration-"));
  const databasePath = join(directory, "migration.db");

  try {
    createLegacyDatabase(databasePath);
    const { runResearchMigrationPreflight } = await import(
      `${pathToFileURL(join(serverRoot, "scripts", "preflight-research-migration.mjs")).href}?test=${Date.now()}`
    );
    await runResearchMigrationPreflight({
      databaseUrl: pathToFileURL(databasePath).href,
      backupDirectory: directory,
      logger: { log: () => undefined },
    });
    sqlite(databasePath, migration);

    assert.equal(sqlite(databasePath, `SELECT COUNT(*) FROM "Research";`), "0");
    assert.equal(
      sqlite(databasePath, `SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='Draft';`),
      "0",
    );
    assert.equal(
      sqlite(
        databasePath,
        `SELECT "name" FROM pragma_index_list('Research') WHERE "name"='Research_projectId_idx';`,
      ),
      "Research_projectId_idx",
    );
    assert.equal(
      sqlite(
        databasePath,
        `SELECT "table", "from", "to", "on_update", "on_delete"
         FROM pragma_foreign_key_list('Research') WHERE "from"='projectId';`,
      ),
      "Project|projectId|id|CASCADE|RESTRICT",
    );
    sqlite(
      databasePath,
      `INSERT INTO "Research" ("projectId", "updatedAt", "title", "content")
       VALUES (1, CURRENT_TIMESTAMP, 'First research', '# Research');`,
    );
    assert.equal(sqlite(databasePath, `SELECT id FROM "Research";`), "1");
    assert.throws(() => sqlite(databasePath, `DELETE FROM "Project" WHERE id=1;`));
    assert.equal(sqlite(databasePath, "PRAGMA foreign_key_check;"), "");
    assert.equal(sqlite(databasePath, "PRAGMA integrity_check;"), "ok");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("migration은 Draft·Research가 함께 있는 partial state에서 전체 rollback한다", () => {
  const migration = findResearchMigration();
  const directory = mkdtempSync(join(tmpdir(), "research-migration-rollback-"));
  const databasePath = join(directory, "migration.db");

  try {
    createLegacyDatabase(databasePath, { withPartialResearch: true });
    assert.throws(() => sqlite(databasePath, migration));
    assert.equal(sqlite(databasePath, `SELECT COUNT(*) FROM "Draft";`), "2");
    assert.equal(sqlite(databasePath, `SELECT COUNT(*) FROM "Research";`), "0");
    assert.equal(sqlite(databasePath, "PRAGMA foreign_key_check;"), "");
    assert.equal(sqlite(databasePath, "PRAGMA integrity_check;"), "ok");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
