-- ArchitecturePlan과 실제 Architecture를 type별 단일 Architecture 테이블로 통합한다.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
BEGIN IMMEDIATE;

-- 데이터 전제 위반 시 CHECK 제약으로 transaction 전체를 중단한다.
CREATE TEMP TABLE "__ArchitectureConsolidationGuard" (
    "failure" INTEGER NOT NULL CHECK ("failure" = 0)
);

-- 기존 Architecture는 project별 PRODUCTION 한 건만 허용한다.
INSERT INTO "__ArchitectureConsolidationGuard" ("failure")
SELECT 1
WHERE EXISTS (
    SELECT 1
    FROM "Architecture"
    GROUP BY "projectId"
    HAVING COUNT(*) > 1
);

-- 기존 ArchitecturePlan은 project별 PLAN 한 건만 허용한다.
INSERT INTO "__ArchitectureConsolidationGuard" ("failure")
SELECT 1
WHERE EXISTS (
    SELECT 1
    FROM "ArchitecturePlan"
    GROUP BY "projectId"
    HAVING COUNT(*) > 1
);

-- 두 원본 테이블의 project 외래 키가 실제 Project를 가리켜야 한다.
INSERT INTO "__ArchitectureConsolidationGuard" ("failure")
SELECT 1
WHERE EXISTS (
    SELECT 1
    FROM "Architecture" AS source
    LEFT JOIN "Project" AS project ON project."id" = source."projectId"
    WHERE project."id" IS NULL
)
OR EXISTS (
    SELECT 1
    FROM "ArchitecturePlan" AS source
    LEFT JOIN "Project" AS project ON project."id" = source."projectId"
    WHERE project."id" IS NULL
);

-- PLAN ID 오프셋 계산이 SQLite signed integer 범위를 넘지 않아야 한다.
INSERT INTO "__ArchitectureConsolidationGuard" ("failure")
SELECT 1
WHERE COALESCE((SELECT MAX("id") FROM "ArchitecturePlan"), 0)
    > 9223372036854775807 - COALESCE((SELECT MAX("id") FROM "Architecture"), 0);

-- 기존 PRODUCTION content는 최소 canonical deployment graph 구조를 만족해야 한다.
INSERT INTO "__ArchitectureConsolidationGuard" ("failure")
SELECT 1
WHERE EXISTS (
    SELECT 1
    FROM "Architecture"
    WHERE CASE
        WHEN json_valid("content") THEN NOT COALESCE((
            json_type("content") = 'object'
            AND json_extract("content", '$.kind') = 'deployment-architecture'
            AND json_extract("content", '$.schemaVersion') = 1
            AND json_type("content", '$.name') = 'text'
            AND length(trim(json_extract("content", '$.name'))) > 0
            AND json_type("content", '$.environments') = 'array'
            AND json_type("content", '$.nodes') = 'array'
            AND json_array_length("content", '$.nodes') > 0
            AND json_type("content", '$.connections') = 'array'
        ), 0)
        ELSE 1
    END
);

CREATE TABLE "new_Architecture" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "type" TEXT NOT NULL CHECK ("type" IN ('PLAN', 'PRODUCTION')),
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "html" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "Architecture_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);

-- 실제 Architecture의 공개 ID와 원문 바이트·timestamp를 보존한다.
INSERT INTO "new_Architecture"
    ("id", "projectId", "createdAt", "updatedAt", "type", "title", "content", "html")
SELECT
    "id", "projectId", "createdAt", "updatedAt", 'PRODUCTION', "title", "content", "html"
FROM "Architecture";

-- PLAN ID는 maxOldArchitectureId + oldArchitecturePlanId로 결정론적으로 이전한다.
INSERT INTO "new_Architecture"
    ("id", "projectId", "createdAt", "updatedAt", "type", "title", "content", "html")
SELECT
    COALESCE((SELECT MAX("id") FROM "Architecture"), 0) + "id",
    "projectId",
    "createdAt",
    "updatedAt",
    'PLAN',
    "title",
    "content",
    "html"
FROM "ArchitecturePlan";

DROP TABLE "Architecture";
DROP TABLE "ArchitecturePlan";
ALTER TABLE "new_Architecture" RENAME TO "Architecture";

CREATE UNIQUE INDEX "Architecture_projectId_type_key"
ON "Architecture"("projectId", "type");
CREATE INDEX "Architecture_projectId_idx" ON "Architecture"("projectId");

DROP TABLE "__ArchitectureConsolidationGuard";
COMMIT;
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
