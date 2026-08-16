import { convertLegacyErdHtml } from "./legacy-erd-to-excalidraw.mjs";
import sharedValidator from "./validate-erd-excalidraw-scene.cjs";

const { validateErdExcalidrawScene } = sharedValidator;

/** JSON object key를 재귀 정렬해 service 저장과 같은 canonical 문자열을 만든다. */
const sortJsonKeys = (value) => {
  if (Array.isArray(value)) {
    return value.map(sortJsonKeys);
  }

  /** null이 아닌 object만 key 정렬 대상으로 처리한다. */
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
        .map(([key, nestedValue]) => [key, sortJsonKeys(nestedValue)]),
    );
  }

  return value;
};

/** 변환 scene을 byte-for-byte 안정적인 JSON 문자열로 직렬화한다. */
export const canonicalStringify = (value) =>
  JSON.stringify(sortJsonKeys(value));

/** legacyHtml이 있고 최신 계약 scene이 없는 ERD 행을 한 트랜잭션에서 변환한다. */
export const backfillErdScenes = (database) => {
  const pendingRows = database
    .prepare(
      `SELECT "id", "scene", "legacyHtml"
       FROM "ERD"
       WHERE "legacyHtml" IS NOT NULL
         AND length(trim("legacyHtml")) > 0
       ORDER BY "id" ASC`,
    )
    .all();

  if (pendingRows.length === 0) {
    return { converted: 0, skipped: 0 };
  }

  const updateScene = database.prepare(
    `UPDATE "ERD"
     SET "scene" = ?
     WHERE "id" = ?
       AND "scene" IS ?
       AND "legacyHtml" = ?`,
  );

  /** 변환 또는 conditional update 하나라도 실패하면 모든 scene 갱신을 rollback한다. */
  const runTransaction = database.transaction(() => {
    let converted = 0;

    for (const row of pendingRows) {
      /** 최신 strict 계약을 이미 통과한 scene은 byte를 바꾸지 않고 건너뛴다. */
      if (typeof row.scene === "string" && row.scene.trim()) {
        try {
          validateErdExcalidrawScene(JSON.parse(row.scene));
          continue;
        } catch {
          // legacyHtml이 있으므로 아래에서 동일 source를 최신 계약으로 재변환한다.
        }
      }

      const scene = convertLegacyErdHtml(row.legacyHtml);
      validateErdExcalidrawScene(scene);
      const canonicalScene = canonicalStringify(scene);
      const result = updateScene.run(
        canonicalScene,
        row.id,
        row.scene,
        row.legacyHtml,
      );

      if (result.changes !== 1) {
        throw new Error(`ERD ${row.id} changed while backfill was running`);
      }

      converted += 1;
    }

    return { converted, skipped: 0 };
  });

  return runTransaction();
};
