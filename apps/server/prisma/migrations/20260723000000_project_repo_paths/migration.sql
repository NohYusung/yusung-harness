PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Project" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL
);

CREATE TABLE "ProjectRepository" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "repoType" TEXT NOT NULL,
    CONSTRAINT "ProjectRepository_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_Project" ("id", "title", "description")
SELECT "id", "title", "description" FROM "Project";

INSERT INTO "ProjectRepository" ("projectId", "path", "repoType")
SELECT "id", "repoPath", "repoType" FROM "Project";

DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";

CREATE UNIQUE INDEX "ProjectRepository_path_repoType_key" ON "ProjectRepository"("path", "repoType");
CREATE INDEX "ProjectRepository_projectId_idx" ON "ProjectRepository"("projectId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
