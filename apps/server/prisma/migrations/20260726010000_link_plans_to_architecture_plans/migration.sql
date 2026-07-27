-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- 기존 Architecture 데이터를 보존하면서 HTML 저장 컬럼을 추가한다.
CREATE TABLE "new_Architecture" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "html" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "Architecture_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Architecture" ("content", "createdAt", "id", "projectId", "title", "updatedAt")
SELECT "content", "createdAt", "id", "projectId", "title", "updatedAt" FROM "Architecture";
DROP TABLE "Architecture";
ALTER TABLE "new_Architecture" RENAME TO "Architecture";
CREATE INDEX "Architecture_projectId_idx" ON "Architecture"("projectId");

-- 기존 ArchitecturePlan 데이터를 보존하면서 HTML과 버전 컬럼을 추가한다.
CREATE TABLE "new_ArchitecturePlan" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "html" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "ArchitecturePlan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ArchitecturePlan" ("content", "createdAt", "id", "projectId", "title", "updatedAt")
SELECT "content", "createdAt", "id", "projectId", "title", "updatedAt" FROM "ArchitecturePlan";
DROP TABLE "ArchitecturePlan";
ALTER TABLE "new_ArchitecturePlan" RENAME TO "ArchitecturePlan";
CREATE INDEX "ArchitecturePlan_projectId_idx" ON "ArchitecturePlan"("projectId");

-- 기존 Plan 데이터를 보존하면서 선택적 ArchitecturePlan 외래 키를 추가한다.
CREATE TABLE "new_Plan" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "content" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "architecturePlanId" INTEGER,
    CONSTRAINT "Plan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Plan_architecturePlanId_fkey" FOREIGN KEY ("architecturePlanId") REFERENCES "ArchitecturePlan" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Plan" ("content", "createdAt", "id", "projectId", "title", "updatedAt", "version")
SELECT "content", "createdAt", "id", "projectId", "title", "updatedAt", "version" FROM "Plan";
DROP TABLE "Plan";
ALTER TABLE "new_Plan" RENAME TO "Plan";
CREATE INDEX "Plan_projectId_idx" ON "Plan"("projectId");
CREATE INDEX "Plan_architecturePlanId_idx" ON "Plan"("architecturePlanId");
CREATE UNIQUE INDEX "Plan_projectId_version_key" ON "Plan"("projectId", "version");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
