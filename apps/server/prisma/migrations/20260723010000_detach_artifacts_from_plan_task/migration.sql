-- Redefine artifact tables so assets, wireframes, designs, and reviews belong
-- directly to a project while preserving all existing artifact rows.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Asset" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "html" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    CONSTRAINT "Asset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Asset" ("createdAt", "html", "id", "projectId", "title", "updatedAt")
SELECT "createdAt", "html", "id", "projectId", "title", "updatedAt"
FROM "Asset";
DROP TABLE "Asset";
ALTER TABLE "new_Asset" RENAME TO "Asset";
CREATE INDEX "Asset_projectId_idx" ON "Asset"("projectId");

CREATE TABLE "new_Wireframe" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    CONSTRAINT "Wireframe_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Wireframe" ("createdAt", "html", "id", "projectId", "title", "updatedAt")
SELECT "createdAt", "html", "id", "projectId", "title", "updatedAt"
FROM "Wireframe";
DROP TABLE "Wireframe";
ALTER TABLE "new_Wireframe" RENAME TO "Wireframe";
CREATE INDEX "Wireframe_projectId_idx" ON "Wireframe"("projectId");

CREATE TABLE "new_Design" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "wireframeId" INTEGER NOT NULL,
    "assetId" INTEGER NOT NULL,
    "html" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    CONSTRAINT "Design_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Design_wireframeId_fkey" FOREIGN KEY ("wireframeId") REFERENCES "Wireframe" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Design_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Design" ("assetId", "createdAt", "html", "id", "projectId", "title", "updatedAt", "wireframeId")
SELECT "assetId", "createdAt", "html", "id", "projectId", "title", "updatedAt", "wireframeId"
FROM "Design";
DROP TABLE "Design";
ALTER TABLE "new_Design" RENAME TO "Design";
CREATE INDEX "Design_projectId_idx" ON "Design"("projectId");
CREATE INDEX "Design_assetId_idx" ON "Design"("assetId");
CREATE INDEX "Design_wireframeId_idx" ON "Design"("wireframeId");

CREATE TABLE "new_Review" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    CONSTRAINT "Review_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Review" ("content", "createdAt", "id", "projectId", "title", "updatedAt")
SELECT "content", "createdAt", "id", "projectId", "title", "updatedAt"
FROM "Review";
DROP TABLE "Review";
ALTER TABLE "new_Review" RENAME TO "Review";
CREATE INDEX "Review_projectId_idx" ON "Review"("projectId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
