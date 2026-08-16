import { load } from "cheerio";
import { createHash } from "node:crypto";

const cardWidth = 340;
const columnGap = 150;
const rowGap = 130;
const canvasPadding = 80;
const erdCustomDataContract = "ERDExcalidraw/1.0";
const inventoryContract = "ERDInventory/1.0";

/** HTML 표시 문자열을 scene 텍스트에 적합한 한 줄 값으로 정규화한다. */
const cleanText = (value) =>
  value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

/** 안정적인 element id와 seed를 만들기 위한 SHA-256 digest를 계산한다. */
const digest = (value) => createHash("sha256").update(value).digest("hex");

/** object key만 재귀 정렬하고 배열 순서는 보존해 skill builder와 같은 fingerprint 입력을 만든다. */
const canonicalJson = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
};

/** inventory/scene 의미 fingerprint를 byte-for-byte 안정적으로 계산한다. */
const fingerprint = (value) => digest(canonicalJson(value));

/** 같은 legacy HTML을 변환할 때 항상 같은 Excalidraw element id를 만든다. */
const stableId = (namespace, value) =>
  `${namespace}-${digest(`${namespace}:${value}`).slice(0, 16)}`;

/** Excalidraw의 난수 필드도 입력 의미에 대해 결정적으로 계산한다. */
const stableSeed = (value) => Number.parseInt(digest(value).slice(0, 8), 16);

/** 모든 scene element가 공유하는 렌더링·버전 필드를 만든다. */
const baseElement = ({ id, type, x, y, width, height, groupIds = [] }) => ({
  id,
  type,
  x,
  y,
  width,
  height,
  angle: 0,
  strokeColor: "#1e1e1e",
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: 1,
  strokeStyle: "solid",
  roughness: 0,
  opacity: 100,
  groupIds,
  frameId: null,
  roundness: null,
  seed: stableSeed(id),
  version: 1,
  versionNonce: stableSeed(`${id}:version`),
  isDeleted: false,
  boundElements: null,
  updated: 1,
  link: null,
  locked: true,
});

/** 엔터티 카드와 배경에 사용하는 rectangle element를 만든다. */
const rectangleElement = ({
  id,
  x,
  y,
  width,
  height,
  groupId,
  customData,
  boundElements = [],
}) => ({
  ...baseElement({
    id,
    type: "rectangle",
    x,
    y,
    width,
    height,
    groupIds: [groupId],
  }),
  backgroundColor: "#ffffff",
  fillStyle: "solid",
  roundness: { type: 3 },
  customData,
  boundElements: boundElements.length > 0 ? boundElements : null,
});

/** 엔터티·필드·관계 설명에 사용하는 text element를 만든다. */
const textElement = ({
  id,
  x,
  y,
  text,
  fontSize,
  width,
  groupId = null,
  color = "#1e1e1e",
  customData,
}) => {
  const lineCount = text.split("\n").length;

  return {
    ...baseElement({
      id,
      type: "text",
      x,
      y,
      width,
      height: Math.ceil(lineCount * fontSize * 1.25),
      groupIds: groupId ? [groupId] : [],
    }),
    strokeColor: color,
    text,
    originalText: text,
    fontSize,
    fontFamily: 1,
    textAlign: "left",
    verticalAlign: "top",
    containerId: null,
    autoResize: true,
    lineHeight: 1.25,
    ...(customData ? { customData } : {}),
  };
};

/** 엔터티 사이의 외래 키 방향을 나타내는 arrow element를 만든다. */
const arrowElement = ({
  id,
  start,
  end,
  points,
  customData,
  sourceElementId,
  targetElementId,
}) => ({
  ...baseElement({
    id,
    type: "arrow",
    x: start.x,
    y: start.y,
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  }),
  points: points ?? [
    [0, 0],
    [end.x - start.x, end.y - start.y],
  ],
  lastCommittedPoint: null,
  startBinding: { elementId: sourceElementId, focus: 0, gap: 8 },
  endBinding: { elementId: targetElementId, focus: 0, gap: 8 },
  startArrowhead: null,
  endArrowhead: "arrow",
  elbowed: false,
  customData,
});

/** 여러 HTML 셀에 쓰인 slash 구분 목록을 개별 의미 값으로 나눈다. */
const splitValues = (value) =>
  cleanText(value)
    .split(/\s*\/\s*/)
    .map(cleanText)
    .filter(Boolean);

/** `table.column` 표기에서 Excalidraw 카드 이름으로 연결할 table 부분만 남긴다. */
const referencedEntityName = (value) =>
  cleanText(value).replace(/^[`"']|[`"']$/g, "").split(".", 1)[0];

/** legacy 컬럼 label을 versioned ERD table customData의 컬럼 배열로 변환한다. */
const legacyColumnMetadata = (field) => {
  const parts = field.split(" · ").map(cleanText).filter(Boolean);
  const declaration = parts[0] ?? "unknown";
  const type = parts[1] ?? "";
  const constraints = parts.slice(2).join(" ");
  const flags = `${declaration} ${constraints}`;
  const names = declaration
    .replace(/\b(?:PK|FK)\b/giu, "")
    .split(/\s*\/\s*/)
    .map(cleanText)
    .filter(Boolean);
  const sharedSuffix = names[1]?.match(/^[a-z]+([A-Z].*)$/u)?.[1];

  /** `start/endCanvasMediaId` 축약은 두 실제 camelCase 컬럼명으로 복원한다. */
  if (/^(?:start|end)$/u.test(names[0] ?? "") && sharedSuffix) {
    names[0] = `${names[0]}${sharedSuffix}`;
  }
  const defaultMatch = flags.match(/\bDEFAULT\s+(.+?)(?=\s+(?:NOT NULL|UNIQUE|PK|FK)\b|$)/iu);

  /** 복합 legacy 표기를 각 논리 컬럼의 동일 제약 메타데이터로 확장한다. */
  return (names.length ? names : [declaration]).map((name) => ({
    name,
    type,
    nullable:
      /\bnullable\b/iu.test(flags) ||
      !/(?:\bNOT NULL\b|\brequired\b)/iu.test(flags),
    primaryKey: /\bPK\b/iu.test(flags),
    foreignKey: /\bFK\b/iu.test(flags),
    unique: /\bUNIQUE\b/iu.test(flags),
    default: defaultMatch?.[1] ?? null,
  }));
};

/** 축약형 catalog 문단에서 실제 column 선언만 보수적으로 추출한다. */
const parseCompactCatalogFields = (article, $) => {
  const fields = [];

  article.find(".body p").each((_paragraphIndex, paragraph) => {
    const segments = cleanText($(paragraph).text()).split(/\s*·\s*/);

    for (const segment of segments) {
      const declaration = cleanText(segment);
      const columnMatch = declaration.match(
        /^([A-Za-z_][\w$]*)\s+([A-Z][A-Z0-9]*(?:\([^)]*\))?)(?:\s+(.*))?$/u,
      );

      /** 일반 `name TYPE constraints` 선언을 표시 label로 정규화한다. */
      if (columnMatch) {
        fields.push(
          [columnMatch[1], columnMatch[2], columnMatch[3]]
            .filter(Boolean)
            .join(" · "),
        );
        continue;
      }

      /** FTS catalog의 자연어 `content 단일 선언 열` 표기를 실제 컬럼으로 보존한다. */
      const ftsColumnMatch = declaration.match(
        /^([A-Za-z_][\w$]*)\s+단일 선언 열/u,
      );

      if (ftsColumnMatch) {
        fields.push(`${ftsColumnMatch[1]} · FTS5 virtual column`);
      }
    }
  });

  return fields;
};

/** 파싱한 엔터티와 관계 이름을 중복 없이 안정적으로 정리한다. */
const normalizeModel = ({ entities, relationships, format }) => {
  const entityMap = new Map();

  /** 같은 엔터티가 HTML의 여러 표현에 중복 등장하면 필드를 합친다. */
  for (const entity of entities) {
    const name = cleanText(entity.name);

    if (!name) {
      continue;
    }

    const existing = entityMap.get(name);
    const fields = [...new Set(entity.fields.map(cleanText).filter(Boolean))];

    if (existing) {
      existing.fields = [...new Set([...existing.fields, ...fields])];
      existing.subtitle ||= cleanText(entity.subtitle ?? "");
      continue;
    }

    entityMap.set(name, {
      name,
      subtitle: cleanText(entity.subtitle ?? ""),
      fields,
    });
  }

  const normalizedEntities = [...entityMap.values()].map((entity) => {
    const columns = entity.fields.flatMap(legacyColumnMetadata);

    if (columns.length === 0) {
      throw new TypeError(
        `Legacy ERD entity ${entity.name} does not expose physical columns`,
      );
    }
    for (const column of columns) {
      if (!column.name || !column.type) {
        throw new TypeError(
          `Legacy ERD entity ${entity.name} contains an incomplete column declaration`,
        );
      }
    }

    return { ...entity, columns };
  });
  const normalizedEntityMap = new Map(
    normalizedEntities.map((entity) => [entity.name, entity]),
  );
  const knownNames = new Set(normalizedEntities.map(({ name }) => name));
  const relationshipMap = new Map();

  /** 존재하는 엔터티끼리의 관계만 scene 화살표로 연결하고 중복을 제거한다. */
  for (const relationship of relationships) {
    const source = referencedEntityName(relationship.source);
    const target = referencedEntityName(relationship.target);

    if (!knownNames.has(source) || !knownNames.has(target)) {
      throw new TypeError(
        `Legacy ERD relationship references an unknown entity: ${source} -> ${target}`,
      );
    }

    const label = cleanText(relationship.label);
    const sourceColumns = (relationship.sourceColumns ?? [])
      .map(cleanText)
      .filter(Boolean);
    let targetColumns = (relationship.targetColumns ?? [])
      .map(cleanText)
      .filter(Boolean);

    /** target column 생략은 catalog에 단일 PK가 있을 때만 보완한다. */
    if (targetColumns.length === 0) {
      const targetEntity = normalizedEntityMap.get(target);
      const primaryKeyColumns = targetEntity.columns
        .filter(({ primaryKey }) => primaryKey)
        .map(({ name }) => name);

      if (primaryKeyColumns.length !== 1) {
        throw new TypeError(
          `Legacy ERD relationship target ${target} omits a column and does not have exactly one catalog PK`,
        );
      }

      targetColumns = primaryKeyColumns;
    }

    /** FK 양 끝의 ordered column 수가 다르면 의미를 추측하지 않는다. */
    if (
      sourceColumns.length === 0 ||
      sourceColumns.length !== targetColumns.length
    ) {
      throw new TypeError(
        `Legacy ERD relationship column mismatch: ${source}.${sourceColumns.join(",")} -> ${target}.${targetColumns.join(",")}`,
      );
    }

    const sourceEntity = normalizedEntityMap.get(source);
    const targetEntity = normalizedEntityMap.get(target);
    const sourceColumnMap = new Map(
      sourceEntity.columns.map((column) => [column.name, column]),
    );
    const targetColumnNames = new Set(
      targetEntity.columns.map((column) => column.name),
    );
    const sourceColumnMetadata = sourceColumns.map((columnName) => {
      const column = sourceColumnMap.get(columnName);

      if (!column) {
        throw new TypeError(
          `Legacy ERD relationship references an unknown source column: ${source}.${columnName}`,
        );
      }

      return column;
    });

    for (const columnName of targetColumns) {
      if (!targetColumnNames.has(columnName)) {
        throw new TypeError(
          `Legacy ERD relationship references an unknown target column: ${target}.${columnName}`,
        );
      }
    }

    /** FK owner 쪽 multiplicity는 확인된 uniqueness/PK 정보로만 보수적으로 결정한다. */
    const sourceIsUnique = sourceColumnMetadata.every(
      ({ primaryKey, unique }) => primaryKey || unique,
    );
    const sourceCardinality = sourceIsUnique ? "0..1" : "0..N";

    /** 참조 대상 필수성은 FK 컬럼 집합의 실제 nullability에서만 결정한다. */
    const targetCardinality = sourceColumnMetadata.some(
      ({ nullable }) => nullable,
    )
      ? "0..1"
      : "1";

    const key = `${source}:${target}:${label}`;
    relationshipMap.set(key, {
      source,
      target,
      label,
      constraint:
        cleanText(relationship.constraint ?? "") ||
        `legacy_${source}_${target}_${relationshipMap.size + 1}`,
      sourceColumns,
      targetColumns,
      sourceCardinality,
      targetCardinality,
      onUpdate: cleanText(relationship.onUpdate ?? "") || null,
      onDelete: cleanText(relationship.onDelete ?? "") || null,
    });
  }

  if (normalizedEntities.length === 0) {
    throw new TypeError(`Legacy ERD ${format} HTML has no entity catalog`);
  }

  return {
    format,
    entities: normalizedEntities,
    relationships: [...relationshipMap.values()],
  };
};

/** 카드 헤더·컬럼 카드·관계 정책 표로 구성된 첫 번째 legacy HTML을 파싱한다. */
const parseCatalogCardFormat = ($) => {
  const entities = [];

  /** `.card-head h3`를 기준으로 엔터티 카드와 모든 필드 설명을 수집한다. */
  $(".card-head h3").each((_index, heading) => {
    const article = $(heading).closest("article");
    const fields = [];

    article.find(".columns .col").each((_columnIndex, column) => {
      const name = cleanText($(column).find("b").first().text());
      const type = cleanText($(column).find(".type").first().text());
      const constraint = cleanText(
        $(column).find(".constraint").first().text(),
      );
      const field = [name, type, constraint].filter(Boolean).join(" · ");

      if (field) {
        fields.push(field);
      }
    });

    /** 축약형 카드에는 `.col` 대신 본문 문단에 컬럼 의미가 들어 있다. */
    if (fields.length === 0) {
      fields.push(...parseCompactCatalogFields(article, $));
    }

    entities.push({
      name: cleanText($(heading).text()),
      subtitle: cleanText(article.find(".card-head .tag").first().text()),
      fields,
    });
  });

  const relationships = [];

  /** `a.column → b.column` 관계 셀을 cardinality와 함께 구조화한다. */
  $("table").each((_tableIndex, table) => {
    const headers = $(table)
      .find("thead th")
      .map((_headerIndex, header) => cleanText($(header).text()))
      .get();

    if (!headers.some((header) => /관계/.test(header))) {
      return;
    }

    $(table)
      .find("tbody tr")
      .each((_rowIndex, row) => {
        /** 논리 관계와 FTS projection은 physical FK scene에서 제외한다. */
        if ($(row).find(".relation-physical").length === 0) {
          return;
        }

        const cells = $(row)
          .find("td")
          .map((_cellIndex, cell) => cleanText($(cell).text()))
          .get();
        const match = cells[0]?.match(
          /^([\w$-]+)\.([^\s]+)\s*[→⇢]\s*([\w$-]+)\.([^\s]+)$/u,
        );

        if (!match) {
          throw new TypeError(
            `Malformed physical relationship row: ${cells[0] ?? ""}`,
          );
        }

        relationships.push({
          source: match[1],
          target: match[3],
          constraint: `legacy_${match[1]}_${match[2]}_${match[3]}_${match[4]}`,
          sourceColumns: [match[2]],
          targetColumns: [match[4]],
          onDelete: cells[3]?.match(/ON DELETE\s+([A-Z ]+)/u)?.[1]?.trim(),
          label: [
            `${match[2]} → ${match[4]}`,
            cells[2],
            cells[3],
          ]
            .filter(Boolean)
            .join(" · "),
        });
      });
  });

  return normalizeModel({
    entities,
    relationships,
    format: "catalog-card",
  });
};

/** FK Matrix 한 행의 다중 source/column/target 표기를 개별 관계로 확장한다. */
const expandMatrixRelationship = ({ sourceCell, columnCell, targetCell, note }) => {
  const sources = splitValues(sourceCell);
  const columns = splitValues(columnCell);
  const targets = splitValues(targetCell);
  const expanded = [];
  const pairCount = Math.max(sources.length, targets.length, columns.length);

  /** 빈 endpoint 또는 서로 대응할 수 없는 다중 셀은 추측하지 않고 변환을 중단한다. */
  for (const [label, values] of [
    ["From", sources],
    ["Column", columns],
    ["To", targets],
  ]) {
    if (
      values.length === 0 ||
      (values.length !== 1 && values.length !== pairCount)
    ) {
      throw new TypeError(
        `Ambiguous FK Matrix ${label} cell: expected 1 or ${pairCount} values, received ${values.length}`,
      );
    }
  }

  /** 단일 값은 각 관계에 재사용하고, 다중 값은 같은 위치끼리 대응한다. */
  for (let index = 0; index < pairCount; index += 1) {
    const source = sources[sources.length === 1 ? 0 : index];
    const targetReference = targets[targets.length === 1 ? 0 : index];
    const column = columns[columns.length === 1 ? 0 : index];

    const target = referencedEntityName(targetReference);
    const targetColumn = cleanText(targetReference).split(".").slice(1).join(".");

    expanded.push({
      source,
      target,
      constraint: `legacy_${source}_${column}_${target}_${targetColumn || "reference"}`,
      sourceColumns: [column],
      targetColumns: targetColumn ? [targetColumn] : [],
      label: [column, note].filter(Boolean).join(" · "),
    });
  }

  return expanded;
};

/** `article.entity`와 FK Matrix로 구성된 두 번째 legacy HTML을 파싱한다. */
const parseEntityListFormat = ($) => {
  const entities = [];

  /** entity article의 제목·분류·li 컬럼 목록을 의미 모델로 옮긴다. */
  $("article.entity").each((_index, articleElement) => {
    const article = $(articleElement);
    const heading = article.find("h3").first();
    const subtitle = cleanText(heading.find("small").first().text());
    const titleWithoutSubtitle = heading.clone();
    titleWithoutSubtitle.find("small").remove();
    const fields = article
      .find("li")
      .map((_fieldIndex, field) => {
        const fieldNameElement = $(field).find("b").first();
        const rawName = cleanText(fieldNameElement.text());
        const markers = [];

        /** 일부 legacy 문서는 PK/FK를 텍스트가 아니라 CSS class로만 표기한다. */
        if (fieldNameElement.hasClass("pk") && !/\bPK\b/iu.test(rawName)) {
          markers.push("PK");
        }
        if (fieldNameElement.hasClass("fk") && !/\bFK\b/iu.test(rawName)) {
          markers.push("FK");
        }

        const name = [...markers, rawName].filter(Boolean).join(" ");
        const detail = cleanText($(field).find("span").first().text());
        return [name, detail].filter(Boolean).join(" · ");
      })
      .get()
      .filter(Boolean);

    entities.push({
      name: cleanText(titleWithoutSubtitle.text()),
      subtitle,
      fields,
    });
  });

  const relationships = [];

  /** From/Column/To 헤더가 있는 FK Matrix만 찾아 행별 관계를 확장한다. */
  $("table").each((_tableIndex, table) => {
    const headers = $(table)
      .find("thead th")
      .map((_headerIndex, header) => cleanText($(header).text()).toLowerCase())
      .get();
    const fromIndex = headers.indexOf("from");
    const columnIndex = headers.indexOf("column");
    const toIndex = headers.indexOf("to");

    if (fromIndex < 0 || columnIndex < 0 || toIndex < 0) {
      return;
    }

    $(table)
      .find("tbody tr")
      .each((_rowIndex, row) => {
        const cells = $(row)
          .find("td")
          .map((_cellIndex, cell) => cleanText($(cell).text()))
          .get();
        const remainingCells = cells.filter(
          (_cell, index) =>
            index !== fromIndex && index !== columnIndex && index !== toIndex,
        );

        relationships.push(
          ...expandMatrixRelationship({
            sourceCell: cells[fromIndex] ?? "",
            columnCell: cells[columnIndex] ?? "",
            targetCell: cells[toIndex] ?? "",
            note: remainingCells.filter(Boolean).join(" · "),
          }),
        );
      });
  });

  return normalizeModel({
    entities,
    relationships,
    format: "entity-list",
  });
};

/** legacy HTML의 알려진 두 구조를 식별하고 공통 의미 모델로 변환한다. */
export const parseLegacyErdHtml = (html) => {
  if (typeof html !== "string" || !html.trim()) {
    throw new TypeError("Legacy ERD HTML must be a non-empty string");
  }

  const $ = load(html);

  let model;

  /** 보다 구체적인 `article.entity` 형식을 먼저 판별한다. */
  if ($("article.entity").length > 0) {
    model = parseEntityListFormat($);
  }

  /** 카드 catalog 형식은 `.card-head h3` 존재 여부로 판별한다. */
  if (!model && $(".card-head h3").length > 0) {
    model = parseCatalogCardFormat($);
  }

  if (!model) {
    throw new TypeError("Unsupported legacy ERD HTML format");
  }

  const documentName = cleanText($("title").first().text()) ||
    cleanText($("h1").first().text()) ||
    "Legacy ERD conversion";
  const sourceRevision = `legacy-html:${digest(html)}`;

  return {
    ...model,
    name: documentName,
    scope: `legacy-html:${model.format}`,
    engine: null,
    sourceRevision,
  };
};

/** fingerprint에 사용하는 ERDInventory/1.0 의미를 builder 정규화 순서로 구성한다. */
const inventorySemantics = (model) => ({
  contract: inventoryContract,
  name: model.name,
  scope: model.scope,
  engine: model.engine,
  sourceRevision: model.sourceRevision,
  tables: model.entities
    .map(({ name, columns }) => ({
      qualifiedName: name,
      columns,
    }))
    .sort((left, right) =>
      left.qualifiedName.localeCompare(right.qualifiedName),
    ),
  relationships: model.relationships
    .map((relationship) => ({
      constraint: relationship.constraint,
      sourceTable: relationship.source,
      sourceColumns: relationship.sourceColumns,
      sourceCardinality: relationship.sourceCardinality,
      targetTable: relationship.target,
      targetColumns: relationship.targetColumns,
      targetCardinality: relationship.targetCardinality,
      onUpdate: relationship.onUpdate,
      onDelete: relationship.onDelete,
    }))
    .sort((left, right) =>
      [
        left.sourceTable,
        left.constraint,
        left.sourceColumns.join(","),
        left.targetTable,
        left.targetColumns.join(","),
      ]
        .join("|")
        .localeCompare(
          [
            right.sourceTable,
            right.constraint,
            right.sourceColumns.join(","),
            right.targetTable,
            right.targetColumns.join(","),
          ].join("|"),
        ),
    ),
});

/** 행별 최대 카드 높이를 반영해 엔터티 카드의 격자 좌표를 계산한다. */
const layoutEntities = (entities) => {
  const columnCount = entities.length > 12 ? 4 : 3;
  const layouts = [];
  let rowY = canvasPadding;

  /** 카드 수에 따라 행을 나누고 가장 높은 카드 아래에 다음 행을 배치한다. */
  for (let rowStart = 0; rowStart < entities.length; rowStart += columnCount) {
    const row = entities.slice(rowStart, rowStart + columnCount);
    const heights = row.map(({ fields }) =>
      Math.max(120, 78 + Math.max(fields.length, 1) * 21),
    );

    for (const [columnIndex, entity] of row.entries()) {
      layouts.push({
        entity,
        x: canvasPadding + columnIndex * (cardWidth + columnGap),
        y: rowY,
        width: cardWidth,
        height: heights[columnIndex],
      });
    }

    rowY += Math.max(...heights) + rowGap;
  }

  return layouts;
};

/** 의미 모델을 읽기 전용 Excalidraw ERD scene으로 렌더링한다. */
export const createExcalidrawScene = (model) => {
  const modelFingerprint = fingerprint(inventorySemantics(model));
  const layouts = layoutEntities(model.entities);
  const layoutByName = new Map(
    layouts.map((layout) => [layout.entity.name, layout]),
  );
  const relationshipElements = [];
  const metadataElements = [
    textElement({
      id: stableId("erd-metadata", model.sourceRevision),
      x: canvasPadding,
      y: 24,
      text: `${model.name}\n${model.scope} · ${model.sourceRevision}`,
      fontSize: 18,
      width: 720,
      customData: {
        contract: erdCustomDataContract,
        kind: "erd-metadata",
        name: model.name,
        scope: model.scope,
        engine: model.engine,
        sourceRevision: model.sourceRevision,
        inventoryFingerprint: modelFingerprint,
      },
    }),
  ];

  /** 관계 화살표와 label을 카드보다 먼저 그려 카드 가독성을 유지한다. */
  for (const [relationshipIndex, relationship] of model.relationships.entries()) {
    const source = layoutByName.get(relationship.source);
    const target = layoutByName.get(relationship.target);

    if (!source || !target) {
      throw new TypeError(
        `Legacy ERD layout is missing a relationship endpoint: ${relationship.source} -> ${relationship.target}`,
      );
    }

    const arrowId = stableId(
      "relationship",
      `${relationshipIndex}:${relationship.source}:${relationship.target}:${relationship.label}`,
    );
    const start = {
      x: source.x + source.width,
      y: source.y + source.height / 2,
    };
    const end = {
      x: target.x,
      y: target.y + target.height / 2,
    };
    const selfPoints = source === target
      ? [
          [0, 0],
          [80, 0],
          [80, -70],
          [0, -70],
        ]
      : undefined;
    const sourceElementId = stableId("entity", relationship.source);
    const targetElementId = stableId("entity", relationship.target);

    relationshipElements.push(
      arrowElement({
        id: arrowId,
        start,
        end,
        points: selfPoints,
        sourceElementId,
        targetElementId,
        customData: {
          contract: erdCustomDataContract,
          kind: "foreign-key",
          constraint: relationship.constraint,
          sourceTable: relationship.source,
          sourceColumns: relationship.sourceColumns,
          sourceCardinality: relationship.sourceCardinality,
          targetTable: relationship.target,
          targetColumns: relationship.targetColumns,
          targetCardinality: relationship.targetCardinality,
          onUpdate: relationship.onUpdate,
          onDelete: relationship.onDelete,
        },
      }),
    );

    /** 관계 label은 source와 target의 중간 지점에 별도 텍스트로 배치한다. */
    const relationshipLabel = [
      `${relationship.sourceCardinality} → ${relationship.targetCardinality}`,
      relationship.constraint,
      relationship.onUpdate ? `ON UPDATE ${relationship.onUpdate}` : null,
      relationship.onDelete ? `ON DELETE ${relationship.onDelete}` : null,
      relationship.label,
    ]
      .filter(Boolean)
      .join(" · ");

    if (relationshipLabel) {
      relationshipElements.push(
        textElement({
          id: stableId("relationship-label", arrowId),
          x: (start.x + end.x) / 2,
          y: (start.y + end.y) / 2 - 18,
          text: relationshipLabel,
          fontSize: 12,
          width: 260,
          color: "#5f6b7a",
        }),
      );
    }
  }

  const entityElements = [];
  const boundArrowIdsByTable = new Map();

  /** table rectangle의 boundElements 역참조를 관계 arrow 집합에서 계산한다. */
  for (const [relationshipIndex, relationship] of model.relationships.entries()) {
    const arrowId = stableId(
      "relationship",
      `${relationshipIndex}:${relationship.source}:${relationship.target}:${relationship.label}`,
    );

    for (const tableName of [relationship.source, relationship.target]) {
      const boundArrowIds = boundArrowIdsByTable.get(tableName) ?? new Set();
      boundArrowIds.add(arrowId);
      boundArrowIdsByTable.set(tableName, boundArrowIds);
    }
  }

  /** 각 엔터티를 배경 rectangle, 제목, 전체 필드 목록으로 구성한다. */
  for (const layout of layouts) {
    const groupId = stableId("entity-group", layout.entity.name);
    const rectangleId = stableId("entity", layout.entity.name);
    const title = layout.entity.subtitle
      ? `${layout.entity.name} · ${layout.entity.subtitle}`
      : layout.entity.name;
    const fields = layout.entity.fields.length
      ? layout.entity.fields.map((field) => `• ${field}`).join("\n")
      : "• (field metadata unavailable)";

    entityElements.push(
      rectangleElement({
        id: rectangleId,
        x: layout.x,
        y: layout.y,
        width: layout.width,
        height: layout.height,
        groupId,
        boundElements: [...(boundArrowIdsByTable.get(layout.entity.name) ?? [])]
          .sort()
          .map((id) => ({ id, type: "arrow" })),
        customData: {
          contract: erdCustomDataContract,
          kind: "table",
          qualifiedName: layout.entity.name,
          columns: layout.entity.columns,
        },
      }),
      textElement({
        id: stableId("entity-title", layout.entity.name),
        x: layout.x + 16,
        y: layout.y + 14,
        text: title,
        fontSize: 18,
        width: layout.width - 32,
        groupId,
      }),
      textElement({
        id: stableId("entity-fields", layout.entity.name),
        x: layout.x + 16,
        y: layout.y + 50,
        text: fields,
        fontSize: 13,
        width: layout.width - 32,
        groupId,
        color: "#344054",
      }),
    );
  }

  return {
    type: "excalidraw",
    version: 2,
    source: "yusung-harness:erd",
    elements: [
      ...metadataElements,
      ...relationshipElements,
      ...entityElements,
    ],
    appState: {
      gridSize: null,
      viewBackgroundColor: "#f5f3ef",
    },
    files: {},
  };
};

/** 알려진 legacy ERD HTML을 의미 보존 Excalidraw scene으로 변환한다. */
export const convertLegacyErdHtml = (html) =>
  createExcalidrawScene(parseLegacyErdHtml(html));
