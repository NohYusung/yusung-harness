-- Domain은 ERD snapshot이 아니라 프로젝트별 Markdown 비즈니스 페이지 트리로 관리한다.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
BEGIN IMMEDIATE;

CREATE TABLE "new_Domain" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "parentId" INTEGER,
    CONSTRAINT "Domain_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Domain_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Domain" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Markdown/prose 행의 식별자와 timestamp를 보존하고 exact Domain ERD v1 JSON만 제외한다.
INSERT INTO "new_Domain" ("id", "projectId", "createdAt", "updatedAt", "title", "content", "parentId")
SELECT "id", "projectId", "createdAt", "updatedAt", trim("title"), "content", NULL
FROM "Domain"
WHERE NOT (
  CASE
    WHEN json_valid("content") THEN
      CASE
        WHEN json_extract("content", '$.kind') = 'domain-erd'
          AND json_extract("content", '$.schemaVersion') = 1
          AND json_type("content", '$.entities') = 'array'
          AND json_type("content", '$.relationships') = 'array'
        THEN 1
        ELSE 0
      END
    ELSE 0
  END
);

-- 보존 대상 Markdown끼리의 trim 제목 중복만 migration을 중단한다.
-- explicit transaction 안에서 실패하므로 기존 Domain과 재시도 가능 상태가 보존된다.
CREATE UNIQUE INDEX "Domain_projectId_title_key"
ON "new_Domain"("projectId", "title");

DROP TABLE "Domain";
ALTER TABLE "new_Domain" RENAME TO "Domain";
CREATE INDEX "Domain_projectId_idx" ON "Domain"("projectId");
CREATE INDEX "Domain_parentId_idx" ON "Domain"("parentId");

COMMIT;

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
