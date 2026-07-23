-- Add stable page identifiers to wireframes and per-asset versions to designs
-- while preserving existing rows and foreign-key relationships.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Wireframe" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    CONSTRAINT "Wireframe_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Wireframe" ("createdAt", "html", "id", "page", "projectId", "title", "updatedAt")
SELECT "createdAt", "html", "id", 'legacy-' || "id", "projectId", "title", "updatedAt"
FROM "Wireframe";
DROP TABLE "Wireframe";
ALTER TABLE "new_Wireframe" RENAME TO "Wireframe";
CREATE UNIQUE INDEX "Wireframe_projectId_page_key" ON "Wireframe"("projectId", "page");
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
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "Design_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Design_wireframeId_fkey" FOREIGN KEY ("wireframeId") REFERENCES "Wireframe" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Design_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Design" ("assetId", "createdAt", "html", "id", "projectId", "title", "updatedAt", "version", "wireframeId")
SELECT
    "assetId",
    "createdAt",
    "html",
    "id",
    "projectId",
    "title",
    "updatedAt",
    ROW_NUMBER() OVER (
        PARTITION BY "projectId", "assetId"
        ORDER BY "createdAt" ASC, "id" ASC
    ),
    "wireframeId"
FROM "Design";
DROP TABLE "Design";
ALTER TABLE "new_Design" RENAME TO "Design";
CREATE UNIQUE INDEX "Design_projectId_assetId_version_key" ON "Design"("projectId", "assetId", "version");
CREATE INDEX "Design_projectId_idx" ON "Design"("projectId");
CREATE INDEX "Design_assetId_idx" ON "Design"("assetId");
CREATE INDEX "Design_wireframeId_idx" ON "Design"("wireframeId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
