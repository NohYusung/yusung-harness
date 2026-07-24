-- Add a required, project-scoped user journey order to wireframes while
-- preserving stable page identifiers and existing Design relationships.
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
    "index" INTEGER NOT NULL,
    CONSTRAINT "Wireframe_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_Wireframe" ("createdAt", "html", "id", "index", "page", "projectId", "title", "updatedAt")
SELECT
    "createdAt",
    "html",
    "id",
    ROW_NUMBER() OVER (
        PARTITION BY "projectId"
        ORDER BY "createdAt" ASC, "id" ASC
    ),
    "page",
    "projectId",
    "title",
    "updatedAt"
FROM "Wireframe";

DROP TABLE "Wireframe";
ALTER TABLE "new_Wireframe" RENAME TO "Wireframe";
CREATE UNIQUE INDEX "Wireframe_projectId_page_key" ON "Wireframe"("projectId", "page");
CREATE INDEX "Wireframe_projectId_index_idx" ON "Wireframe"("projectId", "index");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
