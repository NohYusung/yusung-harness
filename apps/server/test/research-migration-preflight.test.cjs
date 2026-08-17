const assert = require("node:assert/strict");
const { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");
const Database = require("better-sqlite3");

const serverRoot = join(__dirname, "..");
const scriptPath = join(serverRoot, "scripts", "preflight-research-migration.mjs");
const loadPreflight = async () =>
  import(`${pathToFileURL(scriptPath).href}?test=${Date.now()}-${Math.random()}`);

const createDatabase = (databasePath, state) => {
  const database = new Database(databasePath);

  try {
    database.exec(`
      PRAGMA foreign_keys=ON;
      CREATE TABLE "Project" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT);
      INSERT INTO "Project" ("id") VALUES (1), (2);
    `);
    if (state === "legacy" || state === "partial") {
      database.exec(`
        CREATE TABLE "Draft" (
          "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          "projectId" INTEGER NOT NULL,
          "createdAt" DATETIME NOT NULL,
          "updatedAt" DATETIME NOT NULL,
          "title" TEXT NOT NULL,
          "content" TEXT NOT NULL,
          FOREIGN KEY ("projectId") REFERENCES "Project"("id")
        );
        INSERT INTO "Draft"
          ("id", "projectId", "createdAt", "updatedAt", "title", "content")
        VALUES
          (1, 1, '2026-08-10T00:00:00.000Z', '2026-08-10T01:00:00.000Z', 'Draft 1', '# One'),
          (2, 2, '2026-08-11T00:00:00.000Z', '2026-08-11T01:00:00.000Z', 'Draft 2', '# Two');
      `);
    }
    if (state === "migrated" || state === "partial") {
      database.exec(`
        CREATE TABLE "Research" (
          "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          "projectId" INTEGER NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL,
          "title" TEXT NOT NULL,
          "content" TEXT NOT NULL,
          FOREIGN KEY ("projectId") REFERENCES "Project"("id")
        );
      `);
    }
  } finally {
    database.close();
  }
};

test("Research preflight는 full backup SHA·count·row fingerprint·integrity·FK·restore evidence를 생성한다", async () => {
  const directory = mkdtempSync(join(tmpdir(), "research-preflight-ready-"));
  const databasePath = join(directory, "legacy.db");
  const backupDirectory = join(directory, "backups");
  const logs = [];

  try {
    createDatabase(databasePath, "legacy");
    const { runResearchMigrationPreflight } = await loadPreflight();
    const result = await runResearchMigrationPreflight({
      databaseUrl: pathToFileURL(databasePath).href,
      backupDirectory,
      logger: { log: (message) => logs.push(message) },
    });

    assert.equal(result.action, "ready");
    assert.equal(result.databasePath, resolve(databasePath));
    assert.deepEqual(result.counts, { drafts: 2, research: 0 });
    assert.match(result.sha256, /^[a-f0-9]{64}$/);
    assert.match(result.rowFingerprints.drafts, /^[a-f0-9]{64}$/);
    assert.match(result.rowFingerprints.research, /^[a-f0-9]{64}$/);
    assert.equal(result.integrityCheck, "ok");
    assert.equal(result.foreignKeyViolationCount, 0);
    assert.equal(result.restoreRehearsal.ok, true);
    assert.deepEqual(result.restoreRehearsal.counts, result.counts);
    assert.deepEqual(result.restoreRehearsal.rowFingerprints, result.rowFingerprints);
    assert.equal(existsSync(result.backupPath), true);
    assert.match(result.backupPath, /research-migration.*\.db$/);

    const guardedSource = new Database(databasePath);
    try {
      const guard = guardedSource
        .prepare(
          `SELECT "draftCount", "draftFingerprint", "expiresAt"
           FROM "_ResearchMigrationGuard" WHERE "id" = 1`,
        )
        .get();
      assert.equal(guard.draftCount, result.counts.drafts);
      assert.equal(guard.draftFingerprint, result.rowFingerprints.drafts);
      assert.equal(guard.expiresAt, result.guardLeaseExpiresAt);
      assert.throws(() =>
        guardedSource
          .prepare(
            `INSERT INTO "Draft"
              ("projectId", "createdAt", "updatedAt", "title", "content")
             VALUES (1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'Race', '# Race')`,
          )
          .run(),
      );
    } finally {
      guardedSource.close();
    }

    const backup = new Database(result.backupPath, { readonly: true, fileMustExist: true });
    try {
      assert.equal(backup.prepare('SELECT COUNT(*) AS count FROM "Draft"').get().count, 2);
      assert.equal(
        backup.prepare(`SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='Research'`).get().count,
        0,
      );
    } finally {
      backup.close();
    }

    assert.equal(logs.length, 1);
    const evidence = JSON.parse(logs[0].replace(/^Research migration preflight: /, ""));
    assert.equal(evidence.sha256, result.sha256);
    assert.deepEqual(evidence.counts, result.counts);
    assert.deepEqual(evidence.rowFingerprints, result.rowFingerprints);
    assert.equal(evidence.restoreRehearsal.ok, true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Research migration은 expired guard 뒤 변경된 Draft fingerprint를 감지해 DROP 전 rollback한다", async () => {
  const directory = mkdtempSync(join(tmpdir(), "research-preflight-race-"));
  const databasePath = join(directory, "legacy.db");
  const backupDirectory = join(directory, "backups");

  try {
    createDatabase(databasePath, "legacy");
    const { runResearchMigrationPreflight } = await loadPreflight();
    await runResearchMigrationPreflight({
      databaseUrl: pathToFileURL(databasePath).href,
      backupDirectory,
      logger: { log: () => undefined },
    });

    const database = new Database(databasePath);
    try {
      database
        .prepare(
          `UPDATE "_ResearchMigrationGuard"
           SET "expiresAt" = '2000-01-01T00:00:00.000Z' WHERE "id" = 1`,
        )
        .run();
      assert.doesNotThrow(() =>
        database
          .prepare(
            `INSERT INTO "Draft"
              ("projectId", "createdAt", "updatedAt", "title", "content")
             VALUES (1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'Late write', '# Changed')`,
          )
          .run(),
      );
    } finally {
      database.close();
    }

    const migration = readFileSync(
      join(
        serverRoot,
        "prisma",
        "migrations",
        "20260817010000_replace_draft_with_research",
        "migration.sql",
      ),
      "utf8",
    );
    const { execFileSync } = require("node:child_process");
    assert.throws(() =>
      execFileSync("/usr/bin/sqlite3", ["-batch", "-bail", databasePath], {
        input: migration,
      }),
    );

    const rolledBack = new Database(databasePath, {
      readonly: true,
      fileMustExist: true,
    });
    try {
      assert.equal(
        rolledBack.prepare('SELECT COUNT(*) AS count FROM "Draft"').get().count,
        3,
      );
      assert.equal(
        rolledBack
          .prepare(
            `SELECT COUNT(*) AS count FROM sqlite_master
             WHERE "type" = 'table' AND "name" = 'Research'`,
          )
          .get().count,
        0,
      );
    } finally {
      rolledBack.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Research preflight 실패는 owned guard를 제거해 Draft 쓰기를 즉시 복구한다", async () => {
  const directory = mkdtempSync(join(tmpdir(), "research-preflight-release-"));
  const databasePath = join(directory, "legacy.db");

  try {
    createDatabase(databasePath, "legacy");
    const { runResearchMigrationPreflight } = await loadPreflight();
    await assert.rejects(
      runResearchMigrationPreflight({
        databaseUrl: pathToFileURL(databasePath).href,
        backupDirectory: join(directory, "backups"),
        logger: { log: () => { throw new Error("evidence sink failed"); } },
      }),
      /evidence sink failed/,
    );

    const database = new Database(databasePath);
    try {
      assert.doesNotThrow(() =>
        database
          .prepare(
            `INSERT INTO "Draft"
              ("projectId", "createdAt", "updatedAt", "title", "content")
             VALUES (1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'Recovered', '# Writable')`,
          )
          .run(),
      );
      assert.equal(
        database
          .prepare(
            `SELECT COUNT(*) AS count FROM sqlite_master
             WHERE "name" IN (
               '_ResearchMigrationGuard',
               '_ResearchMigrationDraftSnapshot',
               'ResearchMigration_guard_draft_insert',
               'ResearchMigration_guard_draft_update',
               'ResearchMigration_guard_draft_delete'
             )`,
          )
          .get().count,
        0,
      );
    } finally {
      database.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Research preflight source는 BEGIN IMMEDIATE와 time-bounded write-block lease를 고정한다", () => {
  const source = readFileSync(scriptPath, "utf8");

  assert.match(source, /BEGIN IMMEDIATE/);
  assert.match(source, /GUARD_LEASE_MS/);
  assert.match(source, /BEFORE \$\{operation\} ON "Draft"/);
  assert.match(source, /expiresAt[\s\S]*strftime/);
  assert.match(source, /releaseMigrationGuard/);
});

test("Research preflight는 fresh·already-migrated DB를 backup 없이 no-op한다", async (t) => {
  const { runResearchMigrationPreflight } = await loadPreflight();

  for (const [state, setup] of [
    ["fresh", null],
    ["already-migrated", "migrated"],
  ]) {
    await t.test(state, async () => {
      const directory = mkdtempSync(join(tmpdir(), "research-preflight-noop-"));
      const databasePath = join(directory, "database.db");
      const backupDirectory = join(directory, "backups");
      const empty = new Database(databasePath);
      empty.close();
      if (setup) createDatabase(databasePath, setup);

      try {
        assert.deepEqual(
          await runResearchMigrationPreflight({
            databaseUrl: pathToFileURL(databasePath).href,
            backupDirectory,
            logger: { log: () => undefined },
          }),
          { action: "noop", state },
        );
        assert.equal(existsSync(backupDirectory), false);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });
  }
});

test("Research preflight는 Draft·Research가 공존하는 partial state를 migration 전에 차단한다", async () => {
  const directory = mkdtempSync(join(tmpdir(), "research-preflight-partial-"));
  const databasePath = join(directory, "partial.db");
  const backupDirectory = join(directory, "backups");

  try {
    createDatabase(databasePath, "partial");
    const { runResearchMigrationPreflight } = await loadPreflight();
    await assert.rejects(
      runResearchMigrationPreflight({
        databaseUrl: pathToFileURL(databasePath).href,
        backupDirectory,
        logger: { log: () => undefined },
      }),
      /partial|Draft.*Research|Research.*Draft/i,
    );
    assert.deepEqual(existsSync(backupDirectory) ? readdirSync(backupDirectory) : [], []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("DB scripts는 prepare→Architecture preflight→Research preflight→migrate→backfill 순서를 고정한다", () => {
  const packageJson = JSON.parse(readFileSync(join(serverRoot, "package.json"), "utf8"));

  for (const [scriptName, migrateCommand] of [
    ["predev", "prisma migrate deploy"],
    ["prestart", "prisma migrate deploy"],
    ["prisma:migrate", "prisma migrate dev"],
  ]) {
    const command = packageJson.scripts[scriptName];
    const prepare = command.indexOf("node scripts/prepare-sqlite.mjs");
    const architecture = command.indexOf("node scripts/preflight-architecture-consolidation.mjs");
    const research = command.indexOf("node scripts/preflight-research-migration.mjs");
    const migrate = command.indexOf(migrateCommand);
    const backfill = command.indexOf("node scripts/backfill-erd-documents.mjs");

    assert.ok(prepare >= 0, `${scriptName}: prepare 누락`);
    assert.ok(architecture > prepare, `${scriptName}: Architecture preflight 순서`);
    assert.ok(research > architecture, `${scriptName}: Research preflight 순서`);
    assert.ok(migrate > research, `${scriptName}: migrate 순서`);
    assert.ok(backfill > migrate, `${scriptName}: backfill 순서`);
    assert.match(
      command,
      new RegExp(
        `node scripts/prepare-sqlite\\.mjs && node scripts/preflight-architecture-consolidation\\.mjs && node scripts/preflight-research-migration\\.mjs && ${migrateCommand.replaceAll(" ", "\\s+")} && node scripts/backfill-erd-documents\\.mjs`,
      ),
    );
  }
});
