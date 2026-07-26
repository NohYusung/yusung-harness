-- Design 버전의 범위를 프로젝트가 아닌 Wireframe과 Asset 조합으로 변경한다.
DROP INDEX "Design_projectId_assetId_version_key";
CREATE UNIQUE INDEX "Design_wireframeId_assetId_version_key" ON "Design"("wireframeId", "assetId", "version");

-- 구현 전 아키텍처 설계 계획을 기존 프로젝트에 연결해 저장한다.
CREATE TABLE "ArchitecturePlan" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    CONSTRAINT "ArchitecturePlan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- 프로젝트에 등록된 작업 요청과 진행 상태를 저장한다.
CREATE TABLE "Request" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    CONSTRAINT "Request_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- 프로젝트에서 수행한 작업 내역을 저장한다.
CREATE TABLE "WorkLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    CONSTRAINT "WorkLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- 프로젝트별 문서 조회를 위한 외래 키 인덱스를 생성한다.
CREATE INDEX "ArchitecturePlan_projectId_idx" ON "ArchitecturePlan"("projectId");
CREATE INDEX "Request_projectId_idx" ON "Request"("projectId");
CREATE INDEX "WorkLog_projectId_idx" ON "WorkLog"("projectId");
