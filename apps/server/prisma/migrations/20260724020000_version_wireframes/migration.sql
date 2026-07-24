-- 기존 Wireframe과 계층 관계를 보존하며 version 기본값을 추가한다.
ALTER TABLE "Wireframe" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- 같은 page의 버전을 분리하되 동일 version 중복은 금지한다.
DROP INDEX "Wireframe_projectId_page_key";
CREATE UNIQUE INDEX "Wireframe_projectId_page_version_key" ON "Wireframe"("projectId", "page", "version");
