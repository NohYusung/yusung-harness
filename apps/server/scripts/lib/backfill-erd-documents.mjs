import {
  buildDineugErdDocument,
  canonicalizeDineugErdDocument,
  extractInventoryFromExcalidrawScene,
  inventoryFromLegacyErdHtml,
} from "./dineug-erd-document.mjs";

/** JSON 문자열을 source label이 포함된 오류로 파싱한다. */
const parseJson = (value, label) => {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new TypeError(`${label} is not valid JSON`, { cause: error });
  }
};

/** legacy scene을 우선하고 HTML을 fallback으로 사용해 Dineug v3를 만든다. */
const convertLegacyRow = (row) => {
  const failures = [];

  if (typeof row.legacyScene === "string" && row.legacyScene.trim()) {
    try {
      const inventory = extractInventoryFromExcalidrawScene(
        parseJson(row.legacyScene, `ERD ${row.id} legacyScene`),
      );
      return buildDineugErdDocument(inventory);
    } catch (error) {
      failures.push(`legacyScene: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (typeof row.legacyHtml === "string" && row.legacyHtml.trim()) {
    try {
      return buildDineugErdDocument(
        inventoryFromLegacyErdHtml(row.legacyHtml),
      );
    } catch (error) {
      failures.push(`legacyHtml: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new TypeError(
    `ERD ${row.id} cannot be converted to Dineug v3 (${failures.join("; ") || "no legacy source"})`,
  );
};

/** 모든 ERD row를 한 transaction에서 canonical Dineug v3로 backfill한다. */
export const backfillErdDocuments = (database) => {
  const rows = database
    .prepare(
      `SELECT "id", "document", "legacyScene", "legacyHtml"
       FROM "ERD"
       ORDER BY "id" ASC`,
    )
    .all();

  if (rows.length === 0) return { converted: 0, skipped: 0 };

  const updateDocument = database.prepare(
    `UPDATE "ERD"
     SET "document" = ?
     WHERE "id" = ?
       AND "document" IS ?
       AND "legacyScene" IS ?
       AND "legacyHtml" IS ?`,
  );

  /** 한 행의 변환·검증·conditional update 실패도 batch 전체를 rollback한다. */
  const runTransaction = database.transaction(() => {
    let converted = 0;
    let skipped = 0;

    for (const row of rows) {
      let canonicalDocument = null;

      /** 이미 strict-valid canonical document이면 byte를 유지한다. */
      if (typeof row.document === "string" && row.document.trim()) {
        try {
          canonicalDocument = canonicalizeDineugErdDocument(
            parseJson(row.document, `ERD ${row.id} document`),
          );
          if (canonicalDocument === row.document) {
            skipped += 1;
            continue;
          }
        } catch {
          // 아래 legacy sources 중 하나로 invalid document를 복구한다.
        }
      }

      if (canonicalDocument === null) {
        canonicalDocument = canonicalizeDineugErdDocument(
          convertLegacyRow(row),
        );
      }
      const result = updateDocument.run(
        canonicalDocument,
        row.id,
        row.document,
        row.legacyScene,
        row.legacyHtml,
      );
      if (result.changes !== 1) {
        throw new Error(`ERD ${row.id} changed while backfill was running`);
      }
      converted += 1;
    }

    return { converted, skipped };
  });

  return runTransaction();
};
