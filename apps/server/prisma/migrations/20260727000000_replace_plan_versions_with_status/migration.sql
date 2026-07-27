-- Plan version과 ArchitecturePlan 연결을 제거하고 Task 집계 기반 상태를 저장한다.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
BEGIN IMMEDIATE;

CREATE TABLE "new_Plan" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "content" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    CONSTRAINT "Plan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- 기존 Task가 없으면 PENDING, 모두 완료면 COMPLETED, 그 외에는 IN_PROGRESS로 이전한다.
INSERT INTO "new_Plan" ("content", "createdAt", "id", "projectId", "status", "title", "updatedAt")
SELECT
    "Plan"."content",
    "Plan"."createdAt",
    "Plan"."id",
    "Plan"."projectId",
    CASE
        WHEN NOT EXISTS (
            SELECT 1 FROM "Task" WHERE "Task"."planId" = "Plan"."id"
        ) THEN 'PENDING'
        WHEN NOT EXISTS (
            SELECT 1
            FROM "Task"
            WHERE "Task"."planId" = "Plan"."id"
              AND "Task"."status" <> 'COMPLETED'
        ) THEN 'COMPLETED'
        ELSE 'IN_PROGRESS'
    END,
    "Plan"."title",
    "Plan"."updatedAt"
FROM "Plan";

DROP TABLE "Plan";
ALTER TABLE "new_Plan" RENAME TO "Plan";
CREATE INDEX "Plan_projectId_idx" ON "Plan"("projectId");

-- ArchitecturePlan의 version을 제거하되 기존 행은 누락 없이 모두 복사한다.
CREATE TABLE "new_ArchitecturePlan" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "html" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "ArchitecturePlan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_ArchitecturePlan" ("content", "createdAt", "html", "id", "projectId", "title", "updatedAt")
SELECT "content", "createdAt", "html", "id", "projectId", "title", "updatedAt"
FROM "ArchitecturePlan";

DROP TABLE "ArchitecturePlan";
ALTER TABLE "new_ArchitecturePlan" RENAME TO "ArchitecturePlan";

-- 중복 projectId가 있으면 이 단계에서 명시적으로 실패해 기존 데이터 손실을 막는다.
CREATE UNIQUE INDEX "ArchitecturePlan_projectId_key" ON "ArchitecturePlan"("projectId");

COMMIT;
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
