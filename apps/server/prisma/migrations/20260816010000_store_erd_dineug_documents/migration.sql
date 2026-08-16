-- ERD의 공개 저장 계약을 Excalidraw scene에서 canonical Dineug v3 JSON으로 전환한다.
-- 기존 scene과 HTML은 semantic backfill 및 장애 복구를 위해 비공개 legacy 컬럼에 보존한다.
ALTER TABLE "ERD" RENAME COLUMN "scene" TO "legacyScene";
ALTER TABLE "ERD" ADD COLUMN "document" TEXT;
