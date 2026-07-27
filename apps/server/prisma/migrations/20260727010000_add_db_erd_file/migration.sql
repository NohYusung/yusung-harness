-- 프로젝트의 현행 DB 스키마를 테이블 단위 Markdown으로 저장한다.
CREATE TABLE "DB" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    CONSTRAINT "DB_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- 프로젝트의 현행 DB 스키마 ERD를 HTML로 저장한다.
CREATE TABLE "ERD" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    CONSTRAINT "ERD_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- 프로젝트 파일과 원격 저장소 업로드 전이 상태를 저장한다.
CREATE TABLE "File" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "content" BLOB,
    "isUploaded" BOOLEAN NOT NULL DEFAULT false,
    "uploadUrl" TEXT,
    CONSTRAINT "File_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- 프로젝트별 산출물 조회를 위한 외래 키 인덱스를 생성한다.
CREATE INDEX "DB_projectId_idx" ON "DB"("projectId");
CREATE INDEX "ERD_projectId_idx" ON "ERD"("projectId");
CREATE INDEX "File_projectId_idx" ON "File"("projectId");
