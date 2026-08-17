-- Draft 데이터를 이관하지 않고 제거한 뒤 비어 있는 Research 저장소를 만든다.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
BEGIN IMMEDIATE;

-- Fresh migration chain은 Draft가 비어 있으므로 guard 없이 허용한다.
CREATE TABLE IF NOT EXISTS "_ResearchMigrationGuard" (
    "id" INTEGER NOT NULL PRIMARY KEY CHECK ("id" = 1),
    "owner" TEXT NOT NULL,
    "expiresAt" TEXT NOT NULL,
    "draftCount" INTEGER NOT NULL,
    "draftFingerprint" TEXT NOT NULL,
    "researchCount" INTEGER NOT NULL,
    "researchFingerprint" TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS "_ResearchMigrationDraftSnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY,
    "projectId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL
);
CREATE TEMP TABLE "__ResearchMigrationCheck" (
    "failure" INTEGER NOT NULL CHECK ("failure" = 0)
);

-- Draft가 존재하면 active guard, count, fingerprint snapshot이 모두 exact-match해야 한다.
INSERT INTO "__ResearchMigrationCheck" ("failure")
SELECT 1
WHERE (SELECT COUNT(*) FROM "Draft") > 0
  AND (
    (SELECT COUNT(*) FROM "_ResearchMigrationGuard"
     WHERE "id" = 1
       AND "expiresAt" > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) <> 1
    OR (SELECT "draftCount" FROM "_ResearchMigrationGuard" WHERE "id" = 1)
       <> (SELECT COUNT(*) FROM "Draft")
    OR (SELECT "researchCount" FROM "_ResearchMigrationGuard" WHERE "id" = 1) <> 0
    OR length((SELECT "draftFingerprint" FROM "_ResearchMigrationGuard" WHERE "id" = 1)) <> 64
    OR (SELECT "draftFingerprint" FROM "_ResearchMigrationGuard" WHERE "id" = 1)
       GLOB '*[^0-9a-f]*'
    OR (SELECT COUNT(*) FROM "_ResearchMigrationDraftSnapshot")
       <> (SELECT COUNT(*) FROM "Draft")
    OR EXISTS (
      SELECT "id", "projectId", "createdAt", "updatedAt", "title", "content"
      FROM "Draft"
      EXCEPT
      SELECT "id", "projectId", "createdAt", "updatedAt", "title", "content"
      FROM "_ResearchMigrationDraftSnapshot"
    )
    OR EXISTS (
      SELECT "id", "projectId", "createdAt", "updatedAt", "title", "content"
      FROM "_ResearchMigrationDraftSnapshot"
      EXCEPT
      SELECT "id", "projectId", "createdAt", "updatedAt", "title", "content"
      FROM "Draft"
    )
  );

CREATE TABLE "Research" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    CONSTRAINT "Research_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "Research_projectId_idx" ON "Research"("projectId");
-- SQLite 연결별 foreign_keys pragma와 무관하게 RESTRICT 의미를 보존한다.
CREATE TRIGGER "Research_project_delete_restrict"
BEFORE DELETE ON "Project"
WHEN EXISTS (
    SELECT 1 FROM "Research" WHERE "projectId" = OLD."id"
)
BEGIN
    SELECT RAISE(ABORT, 'Research project delete restricted');
END;
DROP TRIGGER IF EXISTS "ResearchMigration_guard_draft_insert";
DROP TRIGGER IF EXISTS "ResearchMigration_guard_draft_update";
DROP TRIGGER IF EXISTS "ResearchMigration_guard_draft_delete";
DROP TABLE "Draft";
DROP TABLE "_ResearchMigrationDraftSnapshot";
DROP TABLE "_ResearchMigrationGuard";
DROP TABLE "__ResearchMigrationCheck";

COMMIT;
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
