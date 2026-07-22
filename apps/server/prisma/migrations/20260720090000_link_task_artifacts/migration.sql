-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Asset" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "taskId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "content" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    CONSTRAINT "Asset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Asset_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Asset" ("content", "createdAt", "id", "projectId", "taskId", "title", "updatedAt")
SELECT "content", "createdAt", "id", "projectId",
       (SELECT MIN("Task"."id") FROM "Task" WHERE "Task"."projectId" = "Asset"."projectId"),
       "title", "updatedAt"
FROM "Asset";
DROP TABLE "Asset";
ALTER TABLE "new_Asset" RENAME TO "Asset";
CREATE INDEX "Asset_projectId_idx" ON "Asset"("projectId");
CREATE INDEX "Asset_taskId_idx" ON "Asset"("taskId");

CREATE TABLE "new_Wireframe" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "taskId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    CONSTRAINT "Wireframe_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Wireframe_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Wireframe" ("content", "createdAt", "id", "projectId", "taskId", "title", "updatedAt")
SELECT "content", "createdAt", "id", "projectId",
       (SELECT MIN("Task"."id") FROM "Task" WHERE "Task"."projectId" = "Wireframe"."projectId"),
       "title", "updatedAt"
FROM "Wireframe";
DROP TABLE "Wireframe";
ALTER TABLE "new_Wireframe" RENAME TO "Wireframe";
CREATE INDEX "Wireframe_projectId_idx" ON "Wireframe"("projectId");
CREATE INDEX "Wireframe_taskId_idx" ON "Wireframe"("taskId");

CREATE TABLE "new_Design" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "taskId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "wireframeId" INTEGER NOT NULL,
    "assetId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    CONSTRAINT "Design_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Design_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Design_wireframeId_fkey" FOREIGN KEY ("wireframeId") REFERENCES "Wireframe" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Design_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Design" ("assetId", "content", "createdAt", "id", "projectId", "taskId", "title", "updatedAt", "wireframeId")
SELECT "assetId", "content", "createdAt", "id", "projectId",
       (SELECT MIN("Task"."id") FROM "Task" WHERE "Task"."projectId" = "Design"."projectId"),
       "title", "updatedAt", "wireframeId"
FROM "Design";
DROP TABLE "Design";
ALTER TABLE "new_Design" RENAME TO "Design";
CREATE INDEX "Design_projectId_idx" ON "Design"("projectId");
CREATE INDEX "Design_taskId_idx" ON "Design"("taskId");
CREATE INDEX "Design_assetId_idx" ON "Design"("assetId");
CREATE INDEX "Design_wireframeId_idx" ON "Design"("wireframeId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
