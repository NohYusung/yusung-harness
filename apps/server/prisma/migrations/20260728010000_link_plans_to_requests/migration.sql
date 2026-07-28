-- Plan이 선택적으로 하나의 Request 기획 근거를 참조하도록 nullable 1:1 관계를 추가한다.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
BEGIN IMMEDIATE;

-- 기존 Plan은 임의 Request와 자동 연결하지 않고 requestId NULL로 전부 보존한다.
CREATE TABLE "new_Plan" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "content" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "requestId" INTEGER,
    CONSTRAINT "Plan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Plan_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_Plan" ("content", "createdAt", "id", "projectId", "status", "title", "updatedAt")
SELECT "content", "createdAt", "id", "projectId", "status", "title", "updatedAt"
FROM "Plan";

DROP TABLE "Plan";
ALTER TABLE "new_Plan" RENAME TO "Plan";
CREATE INDEX "Plan_projectId_idx" ON "Plan"("projectId");
CREATE UNIQUE INDEX "Plan_requestId_key" ON "Plan"("requestId");

COMMIT;
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
