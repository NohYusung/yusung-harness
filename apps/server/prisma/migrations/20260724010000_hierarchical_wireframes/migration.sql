-- 기존 순번을 계층 path 문자열로 전환하고 self hierarchy를 추가한다.
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
    "index" TEXT NOT NULL,
    "parentId" INTEGER,
    CONSTRAINT "Wireframe_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Wireframe_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Wireframe" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_Wireframe" ("createdAt", "html", "id", "index", "page", "parentId", "projectId", "title", "updatedAt")
SELECT
    "createdAt",
    "html",
    "id",
    CAST("index" AS TEXT),
    "page",
    NULL,
    "projectId",
    "title",
    "updatedAt"
FROM "Wireframe";

DROP TABLE "Wireframe";
ALTER TABLE "new_Wireframe" RENAME TO "Wireframe";
CREATE UNIQUE INDEX "Wireframe_projectId_page_key" ON "Wireframe"("projectId", "page");
CREATE INDEX "Wireframe_projectId_index_idx" ON "Wireframe"("projectId", "index");
CREATE INDEX "Wireframe_parentId_idx" ON "Wireframe"("parentId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
