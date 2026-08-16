-- ERD의 공개 저장 계약을 HTML에서 canonical Excalidraw scene 문자열로 전환한다.
-- 기존 HTML은 backfill과 장애 복구를 위해 legacyHtml에 그대로 보존한다.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_ERD" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "scene" TEXT,
    "legacyHtml" TEXT,
    CONSTRAINT "ERD_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_ERD" ("createdAt", "id", "legacyHtml", "projectId", "title", "updatedAt")
SELECT "createdAt", "id", "html", "projectId", "title", "updatedAt"
FROM "ERD";

DROP TABLE "ERD";
ALTER TABLE "new_ERD" RENAME TO "ERD";

CREATE INDEX "ERD_projectId_idx" ON "ERD"("projectId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
