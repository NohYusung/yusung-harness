import "dotenv/config";

import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, unlink } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import { resolveSqlitePath } from "./prepare-sqlite.mjs";

const defaultDatabaseUrl = "file:./harness-board.db";
const defaultSchemaDirectory = fileURLToPath(
  new URL("../prisma/", import.meta.url),
);
const defaultBackupDirectory = "/private/tmp";
const GUARD_LEASE_MS = 5 * 60 * 1_000;

/** Draft와 Research table 존재 여부로 migration 상태를 판별한다. */
function inspectMigrationState(database) {
  const tables = new Set(
    database
      .prepare(
        `SELECT "name" FROM sqlite_master
         WHERE "type" = 'table' AND "name" IN ('Draft', 'Research')`,
      )
      .all()
      .map(({ name }) => name),
  );
  const hasDraft = tables.has("Draft");
  const hasResearch = tables.has("Research");

  if (!hasDraft && !hasResearch) return "fresh";
  if (!hasDraft && hasResearch) return "already-migrated";
  if (hasDraft && !hasResearch) return "legacy";

  throw new Error(
    "Partial Research migration state: Draft and Research tables coexist",
  );
}

/** DB integrity와 foreign key 위반을 검사한다. */
function inspectHealth(database, label) {
  const integrityCheck = database.pragma("integrity_check", { simple: true });
  const foreignKeyViolationCount = database.pragma("foreign_key_check").length;

  if (integrityCheck !== "ok") {
    throw new Error(`${label} integrity_check failed: ${integrityCheck}`);
  }
  if (foreignKeyViolationCount > 0) {
    throw new Error(
      `${label} foreign_key_check failed: ${foreignKeyViolationCount} violation(s)`,
    );
  }

  return { integrityCheck, foreignKeyViolationCount };
}

/** table 존재 여부를 확인한다. */
function hasTable(database, tableName) {
  return Boolean(
    database
      .prepare(
        `SELECT 1 FROM sqlite_master WHERE "type" = 'table' AND "name" = ?`,
      )
      .get(tableName),
  );
}

/** migration 전 Draft·Research row와 결정론적 fingerprint를 계산한다. */
function readRowEvidence(database) {
  const drafts = hasTable(database, "Draft")
    ? database
        .prepare(
          `SELECT "id", "projectId", "createdAt", "updatedAt", "title", "content"
           FROM "Draft" ORDER BY "id"`,
        )
        .all()
    : [];
  const research = hasTable(database, "Research")
    ? database
        .prepare(
          `SELECT "id", "projectId", "createdAt", "updatedAt", "title", "content"
           FROM "Research" ORDER BY "id"`,
        )
        .all()
    : [];
  const fingerprint = (rows) =>
    createHash("sha256").update(JSON.stringify(rows)).digest("hex");

  return {
    counts: { drafts: drafts.length, research: research.length },
    rowFingerprints: {
      drafts: fingerprint(drafts),
      research: fingerprint(research),
    },
  };
}

/** BEGIN IMMEDIATE 안에서 snapshot과 time-bounded Draft write-block guard를 설치한다. */
function installMigrationGuard(database) {
  const owner = randomUUID();
  const expiresAt = new Date(Date.now() + GUARD_LEASE_MS).toISOString();

  database.exec("BEGIN IMMEDIATE");
  try {
    /** 이전 실행의 guard를 같은 write lock 안에서 안전하게 교체한다. */
    database.exec(`
      DROP TRIGGER IF EXISTS "ResearchMigration_guard_draft_insert";
      DROP TRIGGER IF EXISTS "ResearchMigration_guard_draft_update";
      DROP TRIGGER IF EXISTS "ResearchMigration_guard_draft_delete";
      DROP TABLE IF EXISTS "_ResearchMigrationDraftSnapshot";
      DROP TABLE IF EXISTS "_ResearchMigrationGuard";
    `);

    const health = inspectHealth(database, "Research migration source");
    const rowEvidence = readRowEvidence(database);

    database.exec(`
      CREATE TABLE "_ResearchMigrationGuard" (
        "id" INTEGER NOT NULL PRIMARY KEY CHECK ("id" = 1),
        "owner" TEXT NOT NULL,
        "expiresAt" TEXT NOT NULL,
        "draftCount" INTEGER NOT NULL,
        "draftFingerprint" TEXT NOT NULL,
        "researchCount" INTEGER NOT NULL,
        "researchFingerprint" TEXT NOT NULL
      );
      CREATE TABLE "_ResearchMigrationDraftSnapshot" (
        "id" INTEGER NOT NULL PRIMARY KEY,
        "projectId" INTEGER NOT NULL,
        "createdAt" DATETIME NOT NULL,
        "updatedAt" DATETIME NOT NULL,
        "title" TEXT NOT NULL,
        "content" TEXT NOT NULL
      );
      INSERT INTO "_ResearchMigrationDraftSnapshot"
        ("id", "projectId", "createdAt", "updatedAt", "title", "content")
      SELECT "id", "projectId", "createdAt", "updatedAt", "title", "content"
      FROM "Draft";
    `);
    database
      .prepare(
        `INSERT INTO "_ResearchMigrationGuard"
          ("id", "owner", "expiresAt", "draftCount", "draftFingerprint",
           "researchCount", "researchFingerprint")
         VALUES (1, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        owner,
        expiresAt,
        rowEvidence.counts.drafts,
        rowEvidence.rowFingerprints.drafts,
        rowEvidence.counts.research,
        rowEvidence.rowFingerprints.research,
      );

    /** Lease가 유효한 동안 모든 Draft mutation을 차단한다. */
    for (const operation of ["INSERT", "UPDATE", "DELETE"]) {
      database.exec(`
        CREATE TRIGGER "ResearchMigration_guard_draft_${operation.toLowerCase()}"
        BEFORE ${operation} ON "Draft"
        WHEN EXISTS (
          SELECT 1 FROM "_ResearchMigrationGuard"
          WHERE "id" = 1
            AND "expiresAt" > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        )
        BEGIN
          SELECT RAISE(ABORT, 'Research migration guard blocks Draft writes');
        END;
      `);
    }

    database.exec("COMMIT");
    return { owner, expiresAt, health, rowEvidence };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

/** 현재 실행이 소유한 guard만 제거해 실패 후 Draft 쓰기를 즉시 복구한다. */
function releaseMigrationGuard(database, owner) {
  database.exec("BEGIN IMMEDIATE");
  try {
    const activeOwner = hasTable(database, "_ResearchMigrationGuard")
      ? database
          .prepare('SELECT "owner" FROM "_ResearchMigrationGuard" WHERE "id" = 1')
          .get()?.owner
      : null;

    if (activeOwner === owner) {
      database.exec(`
        DROP TRIGGER IF EXISTS "ResearchMigration_guard_draft_insert";
        DROP TRIGGER IF EXISTS "ResearchMigration_guard_draft_update";
        DROP TRIGGER IF EXISTS "ResearchMigration_guard_draft_delete";
        DROP TABLE IF EXISTS "_ResearchMigrationDraftSnapshot";
        DROP TABLE IF EXISTS "_ResearchMigrationGuard";
      `);
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

/** 큰 DB도 전체 메모리 적재 없이 SHA-256을 계산한다. */
async function sha256File(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolvePromise, rejectPromise) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", rejectPromise);
    stream.on("end", resolvePromise);
  });
  return hash.digest("hex");
}

/** Backup을 별도 파일로 복원해 health, count, fingerprint를 재검증한다. */
async function rehearseRestore({ backupPath, backupDirectory, expected }) {
  const rehearsalPath = resolve(
    backupDirectory,
    `.research-restore-rehearsal-${randomUUID()}.db`,
  );

  try {
    await copyFile(backupPath, rehearsalPath);
    const restored = new Database(rehearsalPath, {
      readonly: true,
      fileMustExist: true,
    });

    try {
      const health = inspectHealth(restored, "Research restore rehearsal");
      const evidence = readRowEvidence(restored);

      if (JSON.stringify(evidence) !== JSON.stringify(expected)) {
        throw new Error("Research restore rehearsal evidence mismatch");
      }

      return { ok: true, ...health, ...evidence };
    } finally {
      restored.close();
    }
  } finally {
    await unlink(rehearsalPath).catch(() => undefined);
  }
}

/** Draft 제거 migration 전에 backup과 복원 가능한 증거를 생성한다. */
export async function runResearchMigrationPreflight({
  databaseUrl = process.env.DATABASE_URL ?? defaultDatabaseUrl,
  schemaDirectory = defaultSchemaDirectory,
  backupDirectory = defaultBackupDirectory,
  logger = console,
} = {}) {
  const databasePath = resolveSqlitePath(databaseUrl, schemaDirectory);
  const database = new Database(databasePath, { fileMustExist: true });
  let guardOwner = null;

  try {
    database.pragma("foreign_keys = ON");
    const state = inspectMigrationState(database);
    if (state !== "legacy") {
      const result = { action: "noop", state };
      logger.log(`Research migration preflight: ${JSON.stringify(result)}`);
      return result;
    }

    const guard = installMigrationGuard(database);
    guardOwner = guard.owner;
    const { health, rowEvidence } = guard;
    const resolvedBackupDirectory = resolve(backupDirectory);
    await mkdir(resolvedBackupDirectory, { recursive: true });
    const extension = extname(databasePath) || ".db";
    const databaseName = basename(databasePath, extname(databasePath));
    const backupPath = resolve(
      resolvedBackupDirectory,
      `${databaseName}-research-migration-${new Date()
        .toISOString()
        .replace(/[^0-9TZ]/g, "")}-${randomUUID()}${extension}`,
    );

    await database.backup(backupPath);
    const sha256 = await sha256File(backupPath);
    const restoreRehearsal = await rehearseRestore({
      backupPath,
      backupDirectory: resolvedBackupDirectory,
      expected: rowEvidence,
    });
    const result = {
      action: "ready",
      databasePath,
      backupPath,
      sha256,
      ...rowEvidence,
      ...health,
      guardLeaseExpiresAt: guard.expiresAt,
      restoreRehearsal,
    };

    logger.log(`Research migration preflight: ${JSON.stringify(result)}`);
    return result;
  } catch (error) {
    if (guardOwner) {
      releaseMigrationGuard(database, guardOwner);
    }
    throw error;
  } finally {
    database.close();
  }
}

const executedScript = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;

/** 직접 실행된 경우에만 Research migration preflight를 수행한다. */
if (executedScript === import.meta.url) {
  await runResearchMigrationPreflight();
}
