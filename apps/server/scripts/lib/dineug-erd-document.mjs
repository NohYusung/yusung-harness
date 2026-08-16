import { createHash } from "node:crypto";
import { parseLegacyErdHtml } from "./legacy-erd-to-excalidraw.mjs";
import sharedExcalidrawValidator from "./validate-erd-excalidraw-scene.cjs";

const { validateErdExcalidrawScene } = sharedExcalidrawValidator;

export const DINEUG_SCHEMA_URL =
  "https://raw.githubusercontent.com/dineug/erd-editor/main/json-schema/schema.json";
export const DINEUG_VERSION = "3.0.0";
export const INVENTORY_CONTRACT = "ERDInventory/2.0";
export const METADATA_MEMO_PREFIX = "[yusung-harness:erd-meta/1.0]\n";
export const FOREIGN_KEY_MEMO_PREFIX = "[yusung-harness:fk/1.0]\n";
export const MAXIMUM_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const MAXIMUM_COLLECTION_ENTITIES = 5_000;

const maximumCanvasSize = 20_000;
const minimumCanvasSize = 2_000;
const maximumCoordinate = 1_000_000;
const maximumIdentifierLength = 512;
const maximumDisplayStringLength = 50_000;
const idPattern = /^(?:table|column|relationship|index|index-column|memo)-[a-f0-9]{20}$/u;
const sourceCardinalities = new Set(["1", "0..1", "1..N", "0..N"]);
const targetCardinalities = new Set(["1", "0..1"]);
const collectionNames = [
  "tableEntities",
  "tableColumnEntities",
  "relationshipEntities",
  "indexEntities",
  "indexColumnEntities",
  "memoEntities",
];
const metadataKeys = [
  "engine",
  "inventoryFingerprint",
  "scope",
  "sourceRevision",
];
const foreignKeyKeys = [
  "constraint",
  "onDelete",
  "onUpdate",
  "sourceCardinality",
  "sourceColumns",
  "sourceTable",
  "targetCardinality",
  "targetColumns",
  "targetTable",
];

/** Dineug 문서 계약 오류를 일관된 TypeError로 노출한다. */
const fail = (message) => {
  throw new TypeError(`Invalid Dineug ERD document: ${message}`);
};

/** 배열이 아닌 JSON object만 허용한다. */
const isObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** 런타임 locale과 무관한 ECMAScript UTF-16 코드 단위 순서를 제공한다. */
const compareStrings = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;

/** 정의된 key 집합 외의 숨은 payload를 거부한다. */
const requireExactKeys = (value, expectedKeys, path) => {
  const actual = Object.keys(value).sort(compareStrings);
  const expected = [...expectedKeys].sort(compareStrings);

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${path} must contain exactly ${expected.join(", ")}`);
  }
};

/** 길이 제한을 포함한 문자열 필드를 검증한다. */
const requireString = (
  value,
  path,
  { allowEmpty = false, maximum = maximumIdentifierLength } = {},
) => {
  if (
    typeof value !== "string" ||
    (!allowEmpty && value.trim().length === 0) ||
    value.length > maximum
  ) {
    fail(`${path} must be ${allowEmpty ? "a" : "a non-empty"} string within ${maximum} characters`);
  }

  return allowEmpty ? value : value.trim();
};

/** nullable 문자열을 inventory 표현으로 정규화한다. */
const optionalString = (value, path) => {
  if (value === null || value === undefined) return null;
  return requireString(value, path, { maximum: maximumDisplayStringLength });
};

/** 유한 숫자와 선택적 범위를 검증한다. */
const requireNumber = (
  value,
  path,
  { integer = false, minimum = -maximumCoordinate, maximum = maximumCoordinate } = {},
) => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    (integer && !Number.isInteger(value)) ||
    value < minimum ||
    value > maximum
  ) {
    fail(`${path} must be a finite${integer ? " integer" : " number"} between ${minimum} and ${maximum}`);
  }

  return value;
};

/** ID 배열의 타입, 길이와 중복을 검증한다. */
const requireIdArray = (value, path, { allowEmpty = true } = {}) => {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    fail(`${path} must be ${allowEmpty ? "an" : "a non-empty"} array`);
  }

  const result = value.map((id, index) =>
    requireString(id, `${path}[${index}]`, { maximum: 255 }),
  );
  if (new Set(result).size !== result.length) {
    fail(`${path} cannot contain duplicate IDs`);
  }

  return result;
};

/** 객체 key를 재귀 정렬해 동일 의미의 JSON을 같은 byte로 만든다. */
export const sortJsonKeys = (value) => {
  if (Array.isArray(value)) return value.map(sortJsonKeys);
  if (!isObject(value)) return value;

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => compareStrings(left, right))
      .map(([key, nested]) => [key, sortJsonKeys(nested)]),
  );
};

/** fingerprint와 memo payload에 사용하는 compact canonical JSON. */
export const canonicalJson = (value) => JSON.stringify(sortJsonKeys(value));

/** 의미 key로부터 반복 실행에도 같은 Dineug ID를 만든다. */
export const stableId = (kind, key) =>
  `${kind}-${createHash("sha256").update(key).digest("hex").slice(0, 20)}`;

/** 관계의 ordered physical identity를 문자열 key로 고정한다. */
export const relationshipKey = (relationship) =>
  [
    relationship.sourceTable,
    relationship.constraint,
    relationship.sourceColumns.join(","),
    relationship.targetTable,
    relationship.targetColumns.join(","),
  ].join("|");

/** inventory column을 모든 boolean/default 필드가 존재하는 형태로 만든다. */
const normalizeColumn = (column, path) => {
  if (!isObject(column)) fail(`${path} must be an object`);
  requireExactKeys(
    column,
    [
      "name",
      "type",
      "nullable",
      "foreignKey",
      "autoIncrement",
      "default",
      "comment",
    ],
    path,
  );

  for (const flag of [
    "nullable",
    "foreignKey",
    "autoIncrement",
  ]) {
    if (typeof column[flag] !== "boolean") fail(`${path}.${flag} must be boolean`);
  }

  return {
    name: requireString(column.name, `${path}.name`, { maximum: 255 }),
    type: requireString(column.type, `${path}.type`, { maximum: 255 }),
    nullable: column.nullable,
    foreignKey: column.foreignKey,
    autoIncrement: column.autoIncrement,
    default: optionalString(column.default, `${path}.default`),
    comment:
      column.comment === ""
        ? ""
        : optionalString(column.comment, `${path}.comment`) ?? "",
  };
};

/** 이름 있는 UNIQUE constraint의 이름과 ordered column을 정규화한다. */
const normalizeKeyConstraint = (constraint, path) => {
  if (!isObject(constraint)) fail(`${path} must be an object`);
  requireExactKeys(constraint, ["name", "columns"], path);

  return {
    name: requireString(constraint.name, `${path}.name`),
    columns: requireIdArray(constraint.columns, `${path}.columns`, {
      allowEmpty: false,
    }),
  };
};

/** Dineug column option으로만 투영되는 ordered composite PK를 정규화한다. */
const normalizePrimaryKey = (constraint, path) => {
  if (!isObject(constraint)) fail(`${path} must be an object`);
  requireExactKeys(constraint, ["columns"], path);

  return {
    columns: requireIdArray(constraint.columns, `${path}.columns`, {
      allowEmpty: false,
    }),
  };
};

/** physical inventory를 결정론적 table/FK 순서로 정규화한다. */
export const normalizeInventory = (rawInventory) => {
  if (!isObject(rawInventory)) fail("inventory root must be an object");
  requireExactKeys(
    rawInventory,
    [
      "contract",
      "name",
      "scope",
      "engine",
      "sourceRevision",
      "tables",
      "relationships",
    ],
    "inventory",
  );
  if (rawInventory.contract !== INVENTORY_CONTRACT) {
    fail(`inventory.contract must equal ${INVENTORY_CONTRACT}`);
  }
  if (!Array.isArray(rawInventory.tables) || rawInventory.tables.length === 0) {
    fail("inventory.tables must contain at least one table");
  }
  if (!Array.isArray(rawInventory.relationships)) {
    fail("inventory.relationships must be an array");
  }

  const tables = rawInventory.tables
    .map((table, tableIndex) => {
      const path = `inventory.tables[${tableIndex}]`;
      if (!isObject(table)) fail(`${path} must be an object`);
      requireExactKeys(
        table,
        [
          "qualifiedName",
          "comment",
          "columns",
          "primaryKey",
          "uniqueConstraints",
        ],
        path,
      );
      if (!Array.isArray(table.columns) || table.columns.length === 0) {
        fail(`${path}.columns must contain at least one column`);
      }

      const columns = table.columns.map((column, columnIndex) =>
        normalizeColumn(column, `${path}.columns[${columnIndex}]`),
      );
      if (new Set(columns.map(({ name }) => name)).size !== columns.length) {
        fail(`${path}.columns contains duplicate names`);
      }

      const primaryKey =
        table.primaryKey === null
          ? null
          : normalizePrimaryKey(table.primaryKey, `${path}.primaryKey`);
      if (!Array.isArray(table.uniqueConstraints)) {
        fail(`${path}.uniqueConstraints must be an array`);
      }
      const uniqueConstraints = table.uniqueConstraints
        .map((constraint, constraintIndex) =>
          normalizeKeyConstraint(
            constraint,
            `${path}.uniqueConstraints[${constraintIndex}]`,
          ),
        )
        .sort((left, right) => compareStrings(left.name, right.name));
      const availableColumns = new Set(columns.map(({ name }) => name));
      const constraintNames = new Set();

      for (const constraint of uniqueConstraints) {
        if (constraintNames.has(constraint.name)) {
          fail(`${path} contains duplicate constraint ${constraint.name}`);
        }
        constraintNames.add(constraint.name);
        for (const column of constraint.columns) {
          if (!availableColumns.has(column)) {
            fail(`${path} constraint ${constraint.name} references unknown column ${column}`);
          }
        }
      }
      if (primaryKey) {
        for (const column of primaryKey.columns) {
          if (!availableColumns.has(column)) {
            fail(`${path}.primaryKey references unknown column ${column}`);
          }
        }
      }
      return {
        qualifiedName: requireString(table.qualifiedName, `${path}.qualifiedName`),
        comment:
          table.comment === ""
            ? ""
            : optionalString(table.comment, `${path}.comment`) ?? "",
        columns,
        primaryKey,
        uniqueConstraints,
      };
    })
    .sort((left, right) =>
      compareStrings(left.qualifiedName, right.qualifiedName),
    );
  const tablesByName = new Map(tables.map((table) => [table.qualifiedName, table]));
  if (tablesByName.size !== tables.length) fail("inventory contains duplicate tables");

  const relationships = rawInventory.relationships
    .map((relationship, relationshipIndex) => {
      const path = `inventory.relationships[${relationshipIndex}]`;
      if (!isObject(relationship)) fail(`${path} must be an object`);
      requireExactKeys(relationship, foreignKeyKeys, path);

      const sourceColumns = requireIdArray(
        relationship.sourceColumns,
        `${path}.sourceColumns`,
        { allowEmpty: false },
      );
      const targetColumns = requireIdArray(
        relationship.targetColumns,
        `${path}.targetColumns`,
        { allowEmpty: false },
      );
      if (sourceColumns.length !== targetColumns.length) {
        fail(`${path} has mismatched composite FK column counts`);
      }

      const result = {
        constraint: requireString(relationship.constraint, `${path}.constraint`),
        onDelete: optionalString(relationship.onDelete, `${path}.onDelete`),
        onUpdate: optionalString(relationship.onUpdate, `${path}.onUpdate`),
        sourceCardinality: requireString(
          relationship.sourceCardinality,
          `${path}.sourceCardinality`,
          { maximum: 8 },
        ),
        sourceColumns,
        sourceTable: requireString(relationship.sourceTable, `${path}.sourceTable`),
        targetCardinality: requireString(
          relationship.targetCardinality,
          `${path}.targetCardinality`,
          { maximum: 8 },
        ),
        targetColumns,
        targetTable: requireString(relationship.targetTable, `${path}.targetTable`),
      };
      if (!sourceCardinalities.has(result.sourceCardinality)) {
        fail(`${path}.sourceCardinality is unsupported`);
      }
      if (!targetCardinalities.has(result.targetCardinality)) {
        fail(`${path}.targetCardinality is unsupported`);
      }

      return result;
    })
    .sort((left, right) =>
      compareStrings(relationshipKey(left), relationshipKey(right)),
    );
  const relationshipKeys = new Set();
  const foreignKeyColumnKeys = new Set();

  for (const relationship of relationships) {
    const key = relationshipKey(relationship);
    if (relationshipKeys.has(key)) fail(`inventory contains duplicate relationship ${key}`);
    relationshipKeys.add(key);

    const sourceTable = tablesByName.get(relationship.sourceTable);
    const targetTable = tablesByName.get(relationship.targetTable);
    if (!sourceTable || !targetTable) fail(`relationship ${key} references an unknown table`);
    const sourceNames = new Set(sourceTable.columns.map(({ name }) => name));
    const targetNames = new Set(targetTable.columns.map(({ name }) => name));
    for (const column of relationship.sourceColumns) {
      if (!sourceNames.has(column)) fail(`relationship ${key} references unknown source column ${column}`);
      foreignKeyColumnKeys.add(`${relationship.sourceTable}.${column}`);
    }
    for (const column of relationship.targetColumns) {
      if (!targetNames.has(column)) fail(`relationship ${key} references unknown target column ${column}`);
    }
  }
  for (const table of tables) {
    for (const column of table.columns) {
      const participatesInForeignKey = foreignKeyColumnKeys.has(
        `${table.qualifiedName}.${column.name}`,
      );
      if (column.foreignKey !== participatesInForeignKey) {
        fail(
          `inventory column ${table.qualifiedName}.${column.name} foreignKey flag must match relationship source columns`,
        );
      }
    }
  }

  const engine = requireString(rawInventory.engine, "inventory.engine");
  databaseBit(engine);
  const inventory = {
    contract: INVENTORY_CONTRACT,
    name: requireString(rawInventory.name, "inventory.name"),
    scope: requireString(rawInventory.scope, "inventory.scope"),
    engine,
    sourceRevision: requireString(rawInventory.sourceRevision, "inventory.sourceRevision"),
    tables,
    relationships,
  };
  const constraintCount = tables.reduce(
    (count, table) => count + table.uniqueConstraints.length,
    0,
  );
  const constraintColumnCount = tables.reduce(
    (count, table) =>
      count +
      table.uniqueConstraints.reduce(
        (nestedCount, constraint) => nestedCount + constraint.columns.length,
        0,
      ),
    0,
  );
  const collectionCount =
    tables.length +
    tables.reduce((count, table) => count + table.columns.length, 0) +
    relationships.length * 2 +
    constraintCount +
    constraintColumnCount +
    1;
  if (collectionCount > MAXIMUM_COLLECTION_ENTITIES) {
    fail(`inventory expands beyond ${MAXIMUM_COLLECTION_ENTITIES} collection entities`);
  }

  return inventory;
};

/** canonical physical inventory의 SHA-256 fingerprint를 계산한다. */
export const inventoryFingerprint = (rawInventory) =>
  createHash("sha256")
    .update(canonicalJson(normalizeInventory(rawInventory)))
    .digest("hex");

/** 이름이 없던 V1 key constraint에 충돌 없는 legacy 이름을 부여한다. */
const legacyConstraintName = (kind, tableName, columns) =>
  `legacy:${tableName}:${kind}:${columns.join(",")}`;

/** ERDInventory/1.0 의미를 constraint-aware V2로 승격한다. */
export const upgradeInventoryV1 = (inventory) => {
  if (!isObject(inventory) || inventory.contract !== "ERDInventory/1.0") {
    fail("legacy inventory.contract must equal ERDInventory/1.0");
  }

  const foreignKeyColumnKeys = new Set(
    inventory.relationships.flatMap((relationship) =>
      relationship.sourceColumns.map(
        (column) => `${relationship.sourceTable}.${column}`,
      ),
    ),
  );

  return normalizeInventory({
    ...inventory,
    contract: INVENTORY_CONTRACT,
    tables: inventory.tables.map((table) => {
      const primaryColumns = table.columns
        .filter(({ primaryKey }) => primaryKey)
        .map(({ name }) => name);
      const uniqueConstraints = table.columns
        .filter(({ unique }) => unique)
        .map(({ name }) => ({
          name: legacyConstraintName("unique", table.qualifiedName, [name]),
          columns: [name],
        }));
      const columns = table.columns.map((column) => ({
        name: column.name,
        type: column.type,
        nullable: column.nullable,
        foreignKey: foreignKeyColumnKeys.has(
          `${table.qualifiedName}.${column.name}`,
        ),
        autoIncrement: false,
        default: column.default,
        comment: column.comment ?? "",
      }));

      return {
        qualifiedName: table.qualifiedName,
        comment: table.comment ?? "",
        columns,
        primaryKey:
          primaryColumns.length === 0
            ? null
            : {
                columns: primaryColumns,
              },
        uniqueConstraints,
      };
    }),
  });
};

/** 이전 Excalidraw metadata와 비교할 V1 canonical fingerprint를 계산한다. */
const inventoryV1Fingerprint = (inventory) =>
  createHash("sha256").update(canonicalJson(inventory)).digest("hex");

/** legacy HTML parser 결과를 ERDInventory/1.0으로 변환한다. */
const inventoryFromLegacyModel = (model) => {
  const upgraded = upgradeInventoryV1({
    contract: "ERDInventory/1.0",
    name: model.name,
    scope: model.scope,
    engine: model.engine,
    sourceRevision: model.sourceRevision,
    tables: model.entities.map(({ name, subtitle, columns }) => ({
      qualifiedName: name,
      comment: subtitle ?? "",
      columns,
    })),
    relationships: model.relationships.map((relationship) => ({
      constraint: relationship.constraint,
      onDelete: relationship.onDelete,
      onUpdate: relationship.onUpdate,
      sourceCardinality: relationship.sourceCardinality,
      sourceColumns: relationship.sourceColumns,
      sourceTable: relationship.source,
      targetCardinality: relationship.targetCardinality,
      targetColumns: relationship.targetColumns,
      targetTable: relationship.target,
    })),
  });

  /** legacy field 선언에 남아 있는 AUTO_INCREMENT를 V2 option 의미로 복구한다. */
  const fieldsByTable = new Map(
    model.entities.map((entity) => [entity.name, entity.fields ?? []]),
  );
  return normalizeInventory({
    ...upgraded,
    tables: upgraded.tables.map((table) => ({
      ...table,
      columns: table.columns.map((column) => ({
        ...column,
        autoIncrement: fieldsByTable.get(table.qualifiedName).some((field) => {
          const escapedName = column.name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
          return (
            new RegExp(`(?:^|\\W)${escapedName}(?:\\W|$)`, "u").test(field) &&
            /\bAUTO(?:_|\s*)INCREMENT\b/iu.test(field)
          );
        }),
      })),
    })),
  });
};

/** legacy HTML의 명시된 database engine 표기를 지원 bit 이름으로 정규화한다. */
const legacyEngine = (html, documentName) => {
  const matchers = [
    [/\bmariadb\b/iu, "MariaDB"],
    [/\b(?:mssql|sql\s*server)\b/iu, "MSSQL"],
    [/\bmysql\b/iu, "MySQL"],
    [/\boracle\b/iu, "Oracle"],
    [/\bpostgres(?:ql)?\b/iu, "PostgreSQL"],
    [/\bsqlite\b/iu, "SQLite"],
  ];
  if (/\.db\b/iu.test(documentName)) return "SQLite";
  const nameMatches = matchers
    .filter(([pattern]) => pattern.test(documentName))
    .map(([, engine]) => engine);
  if (nameMatches.length === 1) return nameMatches[0];

  const documentMatches = matchers
    .filter(([pattern]) => pattern.test(html))
    .map(([, engine]) => engine);
  if (documentMatches.length === 1) return documentMatches[0];
  if (documentMatches.length > 1) {
    fail("legacy HTML mentions multiple database engines without a title-level engine");
  }

  return null;
};

/** 알려진 legacy HTML 형식을 physical inventory로 복구한다. */
export const inventoryFromLegacyErdHtml = (html) => {
  const model = parseLegacyErdHtml(html);
  return inventoryFromLegacyModel({
    ...model,
    engine: model.engine ?? legacyEngine(html, model.name),
  });
};

/** strict legacy Excalidraw customData에서 physical inventory를 복구한다. */
export const extractInventoryFromExcalidrawScene = (scene) => {
  validateErdExcalidrawScene(scene);
  const metadata = scene.elements.find(
    (element) => element.customData?.kind === "erd-metadata",
  )?.customData;
  if (!metadata) fail("legacy Excalidraw scene does not contain metadata");

  const legacyInventory = {
    contract: "ERDInventory/1.0",
    name: metadata.name,
    scope: metadata.scope,
    engine: metadata.engine,
    sourceRevision: metadata.sourceRevision,
    tables: scene.elements
      .filter((element) => element.customData?.kind === "table")
      .map(({ customData }) => ({
        qualifiedName: customData.qualifiedName,
        columns: customData.columns,
      })),
    relationships: scene.elements
      .filter((element) => element.customData?.kind === "foreign-key")
      .map(({ customData }) => ({
        constraint: customData.constraint,
        onDelete: customData.onDelete,
        onUpdate: customData.onUpdate,
        sourceCardinality: customData.sourceCardinality,
        sourceColumns: customData.sourceColumns,
        sourceTable: customData.sourceTable,
        targetCardinality: customData.targetCardinality,
        targetColumns: customData.targetColumns,
        targetTable: customData.targetTable,
      })),
  };
  legacyInventory.tables.sort((left, right) =>
    compareStrings(left.qualifiedName, right.qualifiedName),
  );
  legacyInventory.relationships.sort((left, right) =>
    compareStrings(relationshipKey(left), relationshipKey(right)),
  );
  if (inventoryV1Fingerprint(legacyInventory) !== metadata.inventoryFingerprint) {
    fail("legacy Excalidraw inventory fingerprint does not match its semantics");
  }

  return upgradeInventoryV1(legacyInventory);
};

/** database engine 이름을 Dineug Database bit로 매핑한다. */
const databaseBit = (engine) => {
  const normalized = engine?.toLowerCase() ?? "";
  if (normalized.includes("mariadb")) return 1;
  if (normalized.includes("mssql") || normalized.includes("sql server")) return 2;
  if (normalized.includes("mysql")) return 4;
  if (normalized.includes("oracle")) return 8;
  if (normalized.includes("postgres")) return 16;
  if (normalized.includes("sqlite")) return 32;
  fail("inventory.engine must identify MariaDB, MSSQL, MySQL, Oracle, PostgreSQL, or SQLite");
};

/** Dineug relationship type bit를 source multiplicity에서 결정한다. */
const relationshipTypeForCardinality = (cardinality) => {
  if (cardinality === "0..1") return 2;
  if (cardinality === "0..N") return 4;
  if (cardinality === "1") return 8;
  return 16;
};

/** FK graph를 deterministic strongly-connected component 목록으로 축약한다. */
const stronglyConnectedComponents = (tables, relationships) => {
  const tableNames = tables.map(({ qualifiedName }) => qualifiedName);
  const adjacency = new Map(tableNames.map((name) => [name, new Set()]));
  for (const relationship of relationships) {
    adjacency.get(relationship.targetTable).add(relationship.sourceTable);
  }

  const indices = new Map();
  const lowLinks = new Map();
  const stack = [];
  const inStack = new Set();
  const components = [];
  let nextIndex = 0;

  const visit = (name) => {
    indices.set(name, nextIndex);
    lowLinks.set(name, nextIndex);
    nextIndex += 1;
    stack.push(name);
    inStack.add(name);

    for (const neighbor of [...adjacency.get(name)].sort(compareStrings)) {
      if (!indices.has(neighbor)) {
        visit(neighbor);
        lowLinks.set(name, Math.min(lowLinks.get(name), lowLinks.get(neighbor)));
      } else if (inStack.has(neighbor)) {
        lowLinks.set(name, Math.min(lowLinks.get(name), indices.get(neighbor)));
      }
    }

    if (lowLinks.get(name) !== indices.get(name)) return;
    const component = [];
    let member;
    do {
      member = stack.pop();
      inStack.delete(member);
      component.push(member);
    } while (member !== name);
    components.push(component.sort(compareStrings));
  };

  for (const name of [...tableNames].sort(compareStrings)) {
    if (!indices.has(name)) visit(name);
  }

  return components;
};

/** SCC condensation DAG를 위상 계층화해 referenced table을 왼쪽에 둔다. */
const topologicalLayers = (tables, relationships) => {
  const components = stronglyConnectedComponents(tables, relationships);
  const componentByTable = new Map();
  components.forEach((component, componentIndex) => {
    for (const tableName of component) componentByTable.set(tableName, componentIndex);
  });
  const outgoing = new Map(components.map((_, index) => [index, new Set()]));
  const indegree = new Map(components.map((_, index) => [index, 0]));

  for (const relationship of relationships) {
    const sourceComponent = componentByTable.get(relationship.targetTable);
    const targetComponent = componentByTable.get(relationship.sourceTable);
    if (sourceComponent === targetComponent || outgoing.get(sourceComponent).has(targetComponent)) {
      continue;
    }
    outgoing.get(sourceComponent).add(targetComponent);
    indegree.set(targetComponent, indegree.get(targetComponent) + 1);
  }

  const componentKey = (index) => components[index][0];
  const queue = [...indegree.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([index]) => index)
    .sort((left, right) =>
      compareStrings(componentKey(left), componentKey(right)),
    );
  const layerByComponent = new Map(queue.map((index) => [index, 0]));

  while (queue.length > 0) {
    const componentIndex = queue.shift();
    for (const neighbor of [...outgoing.get(componentIndex)].sort(
      (left, right) => compareStrings(componentKey(left), componentKey(right)),
    )) {
      layerByComponent.set(
        neighbor,
        Math.max(
          layerByComponent.get(neighbor) ?? 0,
          (layerByComponent.get(componentIndex) ?? 0) + 1,
        ),
      );
      indegree.set(neighbor, indegree.get(neighbor) - 1);
      if (indegree.get(neighbor) === 0) {
        queue.push(neighbor);
        queue.sort((left, right) =>
          compareStrings(componentKey(left), componentKey(right)),
        );
      }
    }
  }

  return components
    .map((tableNames, componentIndex) => ({
      tableNames,
      layer: layerByComponent.get(componentIndex) ?? 0,
    }))
    .sort(
      (left, right) =>
        left.layer - right.layer ||
        compareStrings(left.tableNames[0], right.tableNames[0]),
    );
};

/** SCC 축약·위상 계층과 annotation rail을 반영한 bounded 좌표를 만든다. */
const layoutTables = (tables, relationships) => {
  const tableWidth = 420;
  const horizontalGap = 180;
  const verticalGap = 100;
  const padding = 100;
  const tableByName = new Map(tables.map((table) => [table.qualifiedName, table]));
  const components = topologicalLayers(tables, relationships);
  const componentsByLayer = new Map();
  for (const component of components) {
    const layerComponents = componentsByLayer.get(component.layer) ?? [];
    layerComponents.push(component);
    componentsByLayer.set(component.layer, layerComponents);
  }
  const positions = new Map();
  let tableBottom = padding;
  for (const [layer, layerComponents] of [...componentsByLayer.entries()].sort(
    ([left], [right]) => left - right,
  )) {
    let nextY = padding;
    for (const component of layerComponents) {
      for (const tableName of component.tableNames) {
        const table = tableByName.get(tableName);
        const height = 88 + table.columns.length * 30;
        positions.set(tableName, {
          x: padding + layer * (tableWidth + horizontalGap),
          y: nextY,
          width: tableWidth,
          height,
        });
        nextY += height + verticalGap;
        tableBottom = Math.max(tableBottom, nextY);
      }
      nextY += verticalGap;
    }
  }

  const layerCount = Math.max(...components.map(({ layer }) => layer)) + 1;
  const annotationX =
    padding + layerCount * tableWidth + Math.max(0, layerCount - 1) * horizontalGap + 180;
  const annotationWidth = 620;
  const annotationHeight = 250 + relationships.length * 190;
  const width = Math.max(
    minimumCanvasSize,
    annotationX + annotationWidth + padding,
  );
  const height = Math.max(
    minimumCanvasSize,
    tableBottom + padding,
    annotationHeight + padding,
  );
  if (width > maximumCanvasSize || height > maximumCanvasSize) {
    fail(`inventory layout exceeds ${maximumCanvasSize}x${maximumCanvasSize}; reduce the database scope`);
  }

  return { annotationX, height, positions, width };
};

/** 두 table 사이의 Dineug relationship endpoint와 direction을 계산한다. */
const relationshipPoints = (target, source) => {
  const targetCenter = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
  const sourceCenter = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
  const horizontal = Math.abs(sourceCenter.x - targetCenter.x) >= Math.abs(sourceCenter.y - targetCenter.y);

  if (horizontal) {
    const sourceIsRight = sourceCenter.x >= targetCenter.x;
    return {
      start: {
        x: sourceIsRight ? target.x + target.width : target.x,
        y: targetCenter.y,
        direction: sourceIsRight ? 2 : 1,
      },
      end: {
        x: sourceIsRight ? source.x : source.x + source.width,
        y: sourceCenter.y,
        direction: sourceIsRight ? 1 : 2,
      },
    };
  }

  const sourceIsBelow = sourceCenter.y >= targetCenter.y;
  return {
    start: {
      x: targetCenter.x,
      y: sourceIsBelow ? target.y + target.height : target.y,
      direction: sourceIsBelow ? 8 : 4,
    },
    end: {
      x: sourceCenter.x,
      y: sourceIsBelow ? source.y : source.y + source.height,
      direction: sourceIsBelow ? 4 : 8,
    },
  };
};

/** 모든 Dineug entity에 고정 epoch metadata를 제공한다. */
const entityMeta = () => ({ createAt: 0, updateAt: 0 });

/** provenance payload를 화면에 영향을 주지 않는 memo entity로 저장한다. */
const createMemo = (id, value, ui) => ({
  id,
  value,
  ui,
  meta: entityMeta(),
});

/** canonical inventory를 공식 Dineug ERDEditorSchemaV3 문서로 만든다. */
export const buildDineugErdDocument = (rawInventory) => {
  const inventory = normalizeInventory(rawInventory);
  const layout = layoutTables(inventory.tables, inventory.relationships);
  const tableEntities = {};
  const tableColumnEntities = {};
  const tableIds = [];
  const tableIdByName = new Map();
  const columnIdByName = new Map();

  inventory.tables.forEach((table, tableIndex) => {
    const tableId = stableId("table", table.qualifiedName);
    const position = layout.positions.get(table.qualifiedName);
    const primaryKeyColumns = new Set(table.primaryKey?.columns ?? []);
    const singleColumnUniqueColumns = new Set(
      table.uniqueConstraints
        .filter((constraint) => constraint.columns.length === 1)
        .map((constraint) => constraint.columns[0]),
    );
    const columnIds = table.columns.map((column) => {
      const columnId = stableId("column", `${table.qualifiedName}.${column.name}`);
      const options =
        (column.autoIncrement ? 1 : 0) |
        (primaryKeyColumns.has(column.name) ? 2 : 0) |
        (singleColumnUniqueColumns.has(column.name) ? 4 : 0) |
        (!column.nullable ? 8 : 0);
      const keys =
        (primaryKeyColumns.has(column.name) ? 1 : 0) |
        (column.foreignKey ? 2 : 0);

      columnIdByName.set(`${table.qualifiedName}.${column.name}`, columnId);
      tableColumnEntities[columnId] = {
        id: columnId,
        tableId,
        name: column.name,
        comment: column.comment,
        dataType: column.type,
        default: column.default ?? "",
        options,
        ui: {
          keys,
          widthName: 180,
          widthComment: 60,
          widthDataType: 180,
          widthDefault: 180,
        },
        meta: entityMeta(),
      };

      return columnId;
    });

    tableIds.push(tableId);
    tableIdByName.set(table.qualifiedName, tableId);
    tableEntities[tableId] = {
      id: tableId,
      name: table.qualifiedName,
      comment: table.comment,
      columnIds,
      seqColumnIds: [...columnIds],
      ui: {
        x: position.x,
        y: position.y,
        zIndex: tableIndex + 1,
        widthName: 300,
        widthComment: 60,
        color: "#8b5cf6",
      },
      meta: entityMeta(),
    };
  });

  const relationshipEntities = {};
  const relationshipIds = [];
  const indexEntities = {};
  const indexColumnEntities = {};
  const indexIds = [];
  const memoEntities = {};
  const metadataMemoId = stableId("memo", "metadata");
  const metadata = {
    engine: inventory.engine,
    inventoryFingerprint: inventoryFingerprint(inventory),
    scope: inventory.scope,
    sourceRevision: inventory.sourceRevision,
  };

  memoEntities[metadataMemoId] = createMemo(
    metadataMemoId,
    `${METADATA_MEMO_PREFIX}${canonicalJson(metadata)}`,
    {
      x: layout.annotationX,
      y: 100,
      zIndex: inventory.tables.length + 1,
      width: 620,
      height: 130,
      color: "#ede9fe",
    },
  );
  const memoIds = [metadataMemoId];

  /** 이름 있는 UNIQUE constraint만 Dineug index collections에 투영한다. */
  for (const table of inventory.tables) {
    const tableId = tableIdByName.get(table.qualifiedName);
    const constraints = table.uniqueConstraints;

    for (const constraint of constraints) {
      const indexId = stableId(
        "index",
        `${table.qualifiedName}.${constraint.name}`,
      );
      const indexColumnIds = constraint.columns.map((columnName, ordinal) => {
        const columnId = columnIdByName.get(
          `${table.qualifiedName}.${columnName}`,
        );
        const indexColumnId = stableId(
          "index-column",
          `${table.qualifiedName}.${constraint.name}|${ordinal}|${columnName}`,
        );

        indexColumnEntities[indexColumnId] = {
          id: indexColumnId,
          indexId,
          columnId,
          orderType: 1,
          meta: entityMeta(),
        };
        return indexColumnId;
      });

      indexIds.push(indexId);
      indexEntities[indexId] = {
        id: indexId,
        name: constraint.name,
        tableId,
        indexColumnIds,
        seqIndexColumnIds: [...indexColumnIds],
        unique: true,
        meta: entityMeta(),
      };
    }
  }

  for (const [relationshipIndex, relationship] of inventory.relationships.entries()) {
    const key = relationshipKey(relationship);
    const relationshipId = stableId("relationship", key);
    const memoId = stableId("memo", key);
    const sourceTable = inventory.tables.find(
      ({ qualifiedName }) => qualifiedName === relationship.sourceTable,
    );
    const endpoints = relationshipPoints(
      layout.positions.get(relationship.targetTable),
      layout.positions.get(relationship.sourceTable),
    );

    relationshipIds.push(relationshipId);
    relationshipEntities[relationshipId] = {
      id: relationshipId,
      identification: relationship.sourceColumns.every((name) =>
        (sourceTable.primaryKey?.columns ?? []).includes(name),
      ),
      relationshipType: relationshipTypeForCardinality(
        relationship.sourceCardinality,
      ),
      startRelationshipType:
        relationship.targetCardinality === "0..1" ? 1 : 2,
      start: {
        tableId: tableIdByName.get(relationship.targetTable),
        columnIds: relationship.targetColumns.map((column) =>
          columnIdByName.get(`${relationship.targetTable}.${column}`),
        ),
        ...endpoints.start,
      },
      end: {
        tableId: tableIdByName.get(relationship.sourceTable),
        columnIds: relationship.sourceColumns.map((column) =>
          columnIdByName.get(`${relationship.sourceTable}.${column}`),
        ),
        ...endpoints.end,
      },
      meta: entityMeta(),
    };
    memoEntities[memoId] = createMemo(
      memoId,
      `${FOREIGN_KEY_MEMO_PREFIX}${canonicalJson(relationship)}`,
      {
        x: layout.annotationX,
        y: 260 + relationshipIndex * 190,
        zIndex: inventory.tables.length + relationshipIndex + 2,
        width: 620,
        height: 170,
        color: "#dbeafe",
      },
    );
    memoIds.push(memoId);
  }

  const document = {
    $schema: DINEUG_SCHEMA_URL,
    version: DINEUG_VERSION,
    settings: {
      width: layout.width,
      height: layout.height,
      scrollTop: 0,
      scrollLeft: 0,
      zoomLevel: 1,
      show: 511,
      database: databaseBit(inventory.engine),
      databaseName: inventory.name,
      canvasType: "ERD",
      language: 16,
      tableNameCase: 1,
      columnNameCase: 1,
      bracketType: 1,
      relationshipDataTypeSync: true,
      relationshipOptimization: false,
      columnOrder: [1, 2, 4, 8, 16, 32, 64],
      maxWidthComment: -1,
      ignoreSaveSettings: 3,
    },
    doc: {
      tableIds,
      relationshipIds,
      indexIds,
      memoIds,
    },
    collections: {
      tableEntities,
      tableColumnEntities,
      relationshipEntities,
      indexEntities,
      indexColumnEntities,
      memoEntities,
    },
  };

  validateDineugErdDocument(document);
  return document;
};

/** EntityMeta의 deterministic epoch 계약을 검증한다. */
const validateMeta = (meta, path) => {
  if (!isObject(meta)) fail(`${path} must be an object`);
  requireExactKeys(meta, ["createAt", "updateAt"], path);
  if (meta.createAt !== 0 || meta.updateAt !== 0) {
    fail(`${path} timestamps must equal 0`);
  }
};

/** Dineug UI 좌표 필드를 유한 숫자로 제한한다. */
const validateUiNumbers = (ui, fields, path) => {
  if (!isObject(ui)) fail(`${path} must be an object`);
  requireExactKeys(ui, fields, path);
  for (const field of fields) {
    if (field === "color") {
      requireString(ui[field], `${path}.${field}`, { maximum: 64 });
    } else {
      requireNumber(ui[field], `${path}.${field}`);
    }
  }
};

/** prefix 뒤의 canonical JSON memo payload를 strict key 집합으로 파싱한다. */
const parseMemoPayload = (value, prefix, keys, path) => {
  requireString(value, path, {
    allowEmpty: false,
    maximum: maximumDisplayStringLength,
  });
  if (!value.startsWith(prefix)) fail(`${path} has an unsupported memo prefix`);

  let payload;
  try {
    payload = JSON.parse(value.slice(prefix.length));
  } catch (error) {
    throw new TypeError(`Invalid Dineug ERD document: ${path} contains invalid JSON`, {
      cause: error,
    });
  }
  if (!isObject(payload)) fail(`${path} payload must be an object`);
  requireExactKeys(payload, keys, `${path} payload`);
  if (`${prefix}${canonicalJson(payload)}` !== value) {
    fail(`${path} payload must use compact key-sorted JSON`);
  }

  return payload;
};

/** 공식 v3 shape와 yusung-harness physical 의미 무결성을 함께 검증한다. */
export const validateDineugErdDocument = (document) => {
  if (!isObject(document)) fail("root must be an object");

  let serialized;
  try {
    serialized = JSON.stringify(document);
  } catch (error) {
    throw new TypeError("Invalid Dineug ERD document: root is not serializable", {
      cause: error,
    });
  }
  if (!serialized || Buffer.byteLength(serialized, "utf8") > MAXIMUM_DOCUMENT_BYTES) {
    fail(`serialized document must not exceed ${MAXIMUM_DOCUMENT_BYTES} bytes`);
  }

  requireExactKeys(document, ["$schema", "version", "settings", "doc", "collections"], "root");
  if (document.$schema !== DINEUG_SCHEMA_URL) fail("$schema is unsupported");
  if (document.version !== DINEUG_VERSION) fail(`version must equal ${DINEUG_VERSION}`);

  const settings = document.settings;
  if (!isObject(settings)) fail("settings must be an object");
  const settingsKeys = [
    "width", "height", "scrollTop", "scrollLeft", "zoomLevel", "show",
    "database", "databaseName", "canvasType", "language", "tableNameCase",
    "columnNameCase", "bracketType", "relationshipDataTypeSync",
    "relationshipOptimization", "columnOrder", "maxWidthComment",
    "ignoreSaveSettings",
  ];
  requireExactKeys(settings, settingsKeys, "settings");
  requireNumber(settings.width, "settings.width", { minimum: minimumCanvasSize, maximum: maximumCanvasSize });
  requireNumber(settings.height, "settings.height", { minimum: minimumCanvasSize, maximum: maximumCanvasSize });
  requireNumber(settings.scrollTop, "settings.scrollTop");
  requireNumber(settings.scrollLeft, "settings.scrollLeft");
  requireNumber(settings.zoomLevel, "settings.zoomLevel", { minimum: 0.1, maximum: 1 });
  requireNumber(settings.show, "settings.show", { integer: true, minimum: 0, maximum: 511 });
  if (![1, 2, 4, 8, 16, 32].includes(settings.database)) {
    fail("settings.database must identify a supported database engine");
  }
  requireString(settings.databaseName, "settings.databaseName", { allowEmpty: false });
  if (settings.canvasType !== "ERD") fail("settings.canvasType must equal ERD");
  for (const [field, allowed] of [
    ["language", [1, 2, 4, 8, 16, 32, 64]],
    ["tableNameCase", [1, 2, 4, 8]],
    ["columnNameCase", [1, 2, 4, 8]],
    ["bracketType", [1, 2, 4, 8]],
    ["ignoreSaveSettings", [0, 1, 2, 3]],
  ]) {
    if (!allowed.includes(settings[field])) fail(`settings.${field} is unsupported`);
  }
  if (typeof settings.relationshipDataTypeSync !== "boolean") fail("settings.relationshipDataTypeSync must be boolean");
  if (typeof settings.relationshipOptimization !== "boolean") fail("settings.relationshipOptimization must be boolean");
  if (JSON.stringify(settings.columnOrder) !== JSON.stringify([1, 2, 4, 8, 16, 32, 64])) {
    fail("settings.columnOrder must use the canonical Dineug order");
  }
  requireNumber(settings.maxWidthComment, "settings.maxWidthComment", { integer: true });

  const doc = document.doc;
  if (!isObject(doc)) fail("doc must be an object");
  requireExactKeys(doc, ["tableIds", "relationshipIds", "indexIds", "memoIds"], "doc");
  const tableIds = requireIdArray(doc.tableIds, "doc.tableIds", { allowEmpty: false });
  const relationshipIds = requireIdArray(doc.relationshipIds, "doc.relationshipIds");
  const indexIds = requireIdArray(doc.indexIds, "doc.indexIds");
  const memoIds = requireIdArray(doc.memoIds, "doc.memoIds", { allowEmpty: false });

  const collections = document.collections;
  if (!isObject(collections)) fail("collections must be an object");
  requireExactKeys(collections, collectionNames, "collections");
  for (const collectionName of collectionNames) {
    if (!isObject(collections[collectionName])) fail(`collections.${collectionName} must be an object`);
  }
  const entityCount = collectionNames.reduce(
    (count, name) => count + Object.keys(collections[name]).length,
    0,
  );
  if (entityCount > MAXIMUM_COLLECTION_ENTITIES) {
    fail(`collections cannot contain more than ${MAXIMUM_COLLECTION_ENTITIES} entities`);
  }

  const tableEntries = Object.entries(collections.tableEntities);
  const columnEntries = Object.entries(collections.tableColumnEntities);
  const relationshipEntries = Object.entries(collections.relationshipEntities);
  const indexEntries = Object.entries(collections.indexEntities);
  const indexColumnEntries = Object.entries(collections.indexColumnEntities);
  const memoEntries = Object.entries(collections.memoEntities);
  const requireDocParity = (ids, entries, path) => {
    const keys = entries.map(([key]) => key);
    if (keys.length !== ids.length || keys.some((key) => !ids.includes(key))) {
      fail(`${path} must reference every collection entity exactly once`);
    }
  };
  requireDocParity(tableIds, tableEntries, "doc.tableIds");
  requireDocParity(relationshipIds, relationshipEntries, "doc.relationshipIds");
  requireDocParity(indexIds, indexEntries, "doc.indexIds");
  requireDocParity(memoIds, memoEntries, "doc.memoIds");

  const tablesById = new Map();
  const tableNames = new Set();
  for (const [recordKey, table] of tableEntries) {
    const path = `collections.tableEntities.${recordKey}`;
    if (!isObject(table)) fail(`${path} must be an object`);
    requireExactKeys(table, ["id", "name", "comment", "columnIds", "seqColumnIds", "ui", "meta"], path);
    if (table.id !== recordKey || !idPattern.test(table.id)) fail(`${path}.id must equal its hash-derived record key`);
    const name = requireString(table.name, `${path}.name`);
    if (table.id !== stableId("table", name)) fail(`${path}.id does not match table name`);
    if (tableNames.has(name)) fail(`duplicate table name ${name}`);
    tableNames.add(name);
    requireString(table.comment, `${path}.comment`, { allowEmpty: true, maximum: maximumDisplayStringLength });
    const columnIds = requireIdArray(table.columnIds, `${path}.columnIds`, { allowEmpty: false });
    const seqColumnIds = requireIdArray(table.seqColumnIds, `${path}.seqColumnIds`, { allowEmpty: false });
    if (JSON.stringify(columnIds) !== JSON.stringify(seqColumnIds)) fail(`${path}.columnIds and seqColumnIds must match`);
    validateUiNumbers(table.ui, ["x", "y", "zIndex", "widthName", "widthComment", "color"], `${path}.ui`);
    validateMeta(table.meta, `${path}.meta`);
    tablesById.set(table.id, { ...table, name, columnIds });
  }

  const columnsById = new Map();
  for (const [recordKey, column] of columnEntries) {
    const path = `collections.tableColumnEntities.${recordKey}`;
    if (!isObject(column)) fail(`${path} must be an object`);
    requireExactKeys(column, ["id", "tableId", "name", "comment", "dataType", "default", "options", "ui", "meta"], path);
    if (column.id !== recordKey || !idPattern.test(column.id)) fail(`${path}.id must equal its hash-derived record key`);
    const table = tablesById.get(column.tableId);
    if (!table) fail(`${path}.tableId references an unknown table`);
    const name = requireString(column.name, `${path}.name`, { maximum: 255 });
    if (column.id !== stableId("column", `${table.name}.${name}`)) fail(`${path}.id does not match its table and name`);
    requireString(column.comment, `${path}.comment`, { allowEmpty: true, maximum: maximumDisplayStringLength });
    requireString(column.dataType, `${path}.dataType`, { maximum: 255 });
    requireString(column.default, `${path}.default`, { allowEmpty: true, maximum: maximumDisplayStringLength });
    requireNumber(column.options, `${path}.options`, { integer: true, minimum: 0, maximum: 15 });
    validateUiNumbers(column.ui, ["keys", "widthName", "widthComment", "widthDataType", "widthDefault"], `${path}.ui`);
    requireNumber(column.ui.keys, `${path}.ui.keys`, { integer: true, minimum: 0, maximum: 3 });
    if (Boolean(column.options & 2) !== Boolean(column.ui.keys & 1)) {
      fail(`${path} primary-key option and UI key must agree`);
    }
    validateMeta(column.meta, `${path}.meta`);
    columnsById.set(column.id, { ...column, name, table });
  }

  for (const table of tablesById.values()) {
    for (const columnId of table.columnIds) {
      const column = columnsById.get(columnId);
      if (!column || column.tableId !== table.id) fail(`table ${table.name} references an unknown or foreign column`);
    }
    const ownedColumns = [...columnsById.values()].filter(({ tableId }) => tableId === table.id);
    if (ownedColumns.length !== table.columnIds.length) fail(`table ${table.name} does not sequence every owned column`);
  }

  const relationshipsById = new Map();
  const validatePoint = (point, path) => {
    if (!isObject(point)) fail(`${path} must be an object`);
    requireExactKeys(point, ["tableId", "columnIds", "x", "y", "direction"], path);
    const table = tablesById.get(point.tableId);
    if (!table) fail(`${path}.tableId references an unknown table`);
    const columnIds = requireIdArray(point.columnIds, `${path}.columnIds`, { allowEmpty: false });
    for (const columnId of columnIds) {
      const column = columnsById.get(columnId);
      if (!column || column.tableId !== table.id) fail(`${path}.columnIds references an unknown or foreign column`);
    }
    requireNumber(point.x, `${path}.x`);
    requireNumber(point.y, `${path}.y`);
    if (![1, 2, 4, 8].includes(point.direction)) fail(`${path}.direction is unsupported`);
    return { table, columnIds };
  };

  for (const [recordKey, relationship] of relationshipEntries) {
    const path = `collections.relationshipEntities.${recordKey}`;
    if (!isObject(relationship)) fail(`${path} must be an object`);
    requireExactKeys(relationship, ["id", "identification", "relationshipType", "startRelationshipType", "start", "end", "meta"], path);
    if (relationship.id !== recordKey || !idPattern.test(relationship.id)) fail(`${path}.id must equal its hash-derived record key`);
    if (typeof relationship.identification !== "boolean") fail(`${path}.identification must be boolean`);
    if (![2, 4, 8, 16].includes(relationship.relationshipType)) fail(`${path}.relationshipType is unsupported`);
    if (![1, 2].includes(relationship.startRelationshipType)) fail(`${path}.startRelationshipType is unsupported`);
    const start = validatePoint(relationship.start, `${path}.start`);
    const end = validatePoint(relationship.end, `${path}.end`);
    if (start.columnIds.length !== end.columnIds.length) fail(`${path} has mismatched composite FK column counts`);
    validateMeta(relationship.meta, `${path}.meta`);
    relationshipsById.set(relationship.id, { relationship, start, end });
  }

  const indexesById = new Map();
  for (const [recordKey, index] of indexEntries) {
    const path = `collections.indexEntities.${recordKey}`;
    if (!isObject(index)) fail(`${path} must be an object`);
    requireExactKeys(index, ["id", "name", "tableId", "indexColumnIds", "seqIndexColumnIds", "unique", "meta"], path);
    const table = tablesById.get(index.tableId);
    if (!table) fail(`${path}.tableId references an unknown table`);
    const name = requireString(index.name, `${path}.name`);
    if (index.id !== recordKey || index.id !== stableId("index", `${table.name}.${name}`)) fail(`${path}.id does not match its table and name`);
    const columnIds = requireIdArray(index.indexColumnIds, `${path}.indexColumnIds`, { allowEmpty: false });
    const seqIds = requireIdArray(index.seqIndexColumnIds, `${path}.seqIndexColumnIds`, { allowEmpty: false });
    if (JSON.stringify(columnIds) !== JSON.stringify(seqIds)) fail(`${path} index column order must match`);
    if (typeof index.unique !== "boolean") fail(`${path}.unique must be boolean`);
    if (!index.unique) fail(`${path}.unique must be true for ERDInventory/2.0 key constraints`);
    validateMeta(index.meta, `${path}.meta`);
    indexesById.set(index.id, { ...index, table, columnIds });
  }

  const indexColumnsById = new Map();
  for (const [recordKey, indexColumn] of indexColumnEntries) {
    const path = `collections.indexColumnEntities.${recordKey}`;
    if (!isObject(indexColumn)) fail(`${path} must be an object`);
    requireExactKeys(indexColumn, ["id", "indexId", "columnId", "orderType", "meta"], path);
    const index = indexesById.get(indexColumn.indexId);
    const column = columnsById.get(indexColumn.columnId);
    if (!index || !column || column.tableId !== index.tableId) fail(`${path} references an unknown index or foreign column`);
    const ordinal = index.columnIds.indexOf(indexColumn.id);
    if (ordinal < 0) fail(`${path} is not sequenced by its index`);
    if (
      indexColumn.id !== recordKey ||
      indexColumn.id !==
        stableId(
          "index-column",
          `${index.table.name}.${index.name}|${ordinal}|${column.name}`,
        )
    ) fail(`${path}.id does not match index semantics`);
    if (![1, 2].includes(indexColumn.orderType)) fail(`${path}.orderType is unsupported`);
    validateMeta(indexColumn.meta, `${path}.meta`);
    indexColumnsById.set(indexColumn.id, indexColumn);
  }
  for (const index of indexesById.values()) {
    for (const indexColumnId of index.columnIds) {
      const indexColumn = indexColumnsById.get(indexColumnId);
      if (!indexColumn || indexColumn.indexId !== index.id) fail(`index ${index.name} references an unknown index column`);
    }
  }
  if (indexColumnsById.size !== indexColumnEntries.length || [...indexesById.values()].reduce((count, index) => count + index.columnIds.length, 0) !== indexColumnEntries.length) {
    fail("indexColumnEntities must be sequenced exactly once by an index");
  }

  /** Dineug table/index collections를 fingerprint 가능한 V2 table semantics로 복구한다. */
  const inventoryTables = [...tablesById.values()].map((table) => {
    const columns = table.columnIds.map((columnId) => {
      const column = columnsById.get(columnId);
      return {
        name: column.name,
        type: column.dataType,
        nullable: !(column.options & 8),
        foreignKey: Boolean(column.ui.keys & 2),
        autoIncrement: Boolean(column.options & 1),
        default: column.default === "" ? null : column.default,
        comment: column.comment,
      };
    });
    const primaryColumns = table.columnIds
      .map((columnId) => columnsById.get(columnId))
      .filter((column) => column.options & 2)
      .map(({ name }) => name);
    const constraints = indexIds
      .map((indexId) => indexesById.get(indexId))
      .filter(({ tableId }) => tableId === table.id)
      .map((index) => ({
        name: index.name,
        columns: index.columnIds.map((indexColumnId) => {
          const indexColumn = indexColumnsById.get(indexColumnId);
          return columnsById.get(indexColumn.columnId).name;
        }),
      }));
    const singleColumnUniqueNames = new Set(
      constraints
        .filter((constraint) => constraint.columns.length === 1)
        .map((constraint) => constraint.columns[0]),
    );
    for (const columnId of table.columnIds) {
      const column = columnsById.get(columnId);
      if (
        Boolean(column.options & 4) !==
        singleColumnUniqueNames.has(column.name)
      ) {
        fail(`table ${table.name} unique option bits must match named UKs`);
      }
    }
    return {
      qualifiedName: table.name,
      comment: table.comment,
      columns,
      primaryKey:
        primaryColumns.length === 0
          ? null
          : {
              columns: primaryColumns,
            },
      uniqueConstraints: constraints,
    };
  });

  let metadata = null;
  const foreignKeys = [];
  for (const [recordKey, memo] of memoEntries) {
    const path = `collections.memoEntities.${recordKey}`;
    if (!isObject(memo)) fail(`${path} must be an object`);
    requireExactKeys(memo, ["id", "value", "ui", "meta"], path);
    if (memo.id !== recordKey || !idPattern.test(memo.id)) fail(`${path}.id must equal its hash-derived record key`);
    validateUiNumbers(memo.ui, ["x", "y", "zIndex", "width", "height", "color"], `${path}.ui`);
    if (memo.ui.width <= 0 || memo.ui.height <= 0) {
      fail(`${path}.ui must render as a positive-size annotation`);
    }
    validateMeta(memo.meta, `${path}.meta`);

    if (memo.value.startsWith(METADATA_MEMO_PREFIX)) {
      if (metadata) fail("document must contain exactly one metadata memo");
      metadata = parseMemoPayload(memo.value, METADATA_MEMO_PREFIX, metadataKeys, `${path}.value`);
      if (memo.id !== stableId("memo", "metadata")) fail(`${path}.id does not match metadata memo`);
    } else if (memo.value.startsWith(FOREIGN_KEY_MEMO_PREFIX)) {
      const foreignKey = parseMemoPayload(memo.value, FOREIGN_KEY_MEMO_PREFIX, foreignKeyKeys, `${path}.value`);
      foreignKeys.push({ foreignKey, memoId: memo.id, path });
    } else {
      fail(`${path}.value has an unsupported memo contract`);
    }
  }
  if (!metadata) fail("document must contain exactly one metadata memo");
  requireString(metadata.scope, "metadata.scope");
  requireString(metadata.sourceRevision, "metadata.sourceRevision");
  const metadataEngine = requireString(metadata.engine, "metadata.engine");
  if (settings.database !== databaseBit(metadataEngine)) {
    fail("settings.database must match metadata.engine");
  }
  if (typeof metadata.inventoryFingerprint !== "string" || !/^[a-f0-9]{64}$/u.test(metadata.inventoryFingerprint)) {
    fail("metadata.inventoryFingerprint must be a SHA-256 hex digest");
  }
  if (foreignKeys.length !== relationshipEntries.length) fail("every relationship must have exactly one FK memo");

  /** 모든 FK를 함께 정규화해 column foreignKey flag와 source-column union도 검증한다. */
  const inventory = normalizeInventory({
    contract: INVENTORY_CONTRACT,
    name: settings.databaseName,
    scope: metadata.scope,
    engine: metadata.engine,
    sourceRevision: metadata.sourceRevision,
    tables: inventoryTables,
    relationships: foreignKeys.map(({ foreignKey }) => foreignKey),
  });
  const normalizedRelationshipsByKey = new Map(
    inventory.relationships.map((relationship) => [
      relationshipKey(relationship),
      relationship,
    ]),
  );

  const foreignKeyKeysSeen = new Set();
  const relationshipSourceColumnIds = new Set();
  for (const { foreignKey, memoId, path } of foreignKeys) {
    const key = relationshipKey(foreignKey);
    const normalized = normalizedRelationshipsByKey.get(key);
    if (!normalized) fail(`${path} does not normalize to an inventory relationship`);
    if (foreignKeyKeysSeen.has(key)) fail(`${path} duplicates FK semantics`);
    foreignKeyKeysSeen.add(key);
    if (memoId !== stableId("memo", key)) fail(`${path}.id does not match FK semantics`);
    const relationshipId = stableId("relationship", key);
    const stored = relationshipsById.get(relationshipId);
    if (!stored) fail(`${path} has no matching relationship entity`);
    const targetTable = [...tablesById.values()].find(({ name }) => name === normalized.targetTable);
    const sourceTable = [...tablesById.values()].find(({ name }) => name === normalized.sourceTable);
    if (!targetTable || !sourceTable || stored.start.table.id !== targetTable.id || stored.end.table.id !== sourceTable.id) {
      fail(`${path} relationship endpoints do not match FK tables`);
    }
    const targetColumnIds = normalized.targetColumns.map((name) => stableId("column", `${normalized.targetTable}.${name}`));
    const sourceColumnIds = normalized.sourceColumns.map((name) => stableId("column", `${normalized.sourceTable}.${name}`));
    for (const sourceColumnId of sourceColumnIds) {
      relationshipSourceColumnIds.add(sourceColumnId);
    }
    if (JSON.stringify(stored.start.columnIds) !== JSON.stringify(targetColumnIds) || JSON.stringify(stored.end.columnIds) !== JSON.stringify(sourceColumnIds)) {
      fail(`${path} relationship endpoints do not match FK columns`);
    }
    const sourceColumns = sourceColumnIds.map((id) => columnsById.get(id));
    if (stored.relationship.relationshipType !== relationshipTypeForCardinality(normalized.sourceCardinality)) {
      fail(`${path} relationshipType does not match source cardinality`);
    }
    if (
      stored.relationship.startRelationshipType !==
      (normalized.targetCardinality === "0..1" ? 1 : 2)
    ) {
      fail(`${path} startRelationshipType does not match target cardinality`);
    }
    if (stored.relationship.identification !== sourceColumns.every((column) => column.options & 2)) {
      fail(`${path} identification does not match FK primary-key membership`);
    }
  }
  for (const column of columnsById.values()) {
    if (
      Boolean(column.ui.keys & 2) !==
      relationshipSourceColumnIds.has(column.id)
    ) {
      fail(
        `column ${column.table.name}.${column.name} FK UI key must match relationship source columns`,
      );
    }
  }

  if (inventoryFingerprint(inventory) !== metadata.inventoryFingerprint) {
    fail("metadata inventory fingerprint does not match document semantics");
  }
  const expectedTableIds = inventory.tables.map((table) =>
    stableId("table", table.qualifiedName),
  );
  const expectedIndexIds = inventory.tables.flatMap((table) =>
    table.uniqueConstraints.map((constraint) =>
      stableId("index", `${table.qualifiedName}.${constraint.name}`),
    ),
  );
  const expectedRelationshipIds = inventory.relationships.map((relationship) =>
    stableId("relationship", relationshipKey(relationship)),
  );
  const expectedMemoIds = [
    stableId("memo", "metadata"),
    ...inventory.relationships.map((relationship) =>
      stableId("memo", relationshipKey(relationship)),
    ),
  ];
  for (const [actual, expected, path] of [
    [tableIds, expectedTableIds, "doc.tableIds"],
    [indexIds, expectedIndexIds, "doc.indexIds"],
    [relationshipIds, expectedRelationshipIds, "doc.relationshipIds"],
    [memoIds, expectedMemoIds, "doc.memoIds"],
  ]) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      fail(`${path} must use canonical semantic order`);
    }
  }

  return document;
};

/** strict validation 뒤 key-sorted compact JSON 문자열을 반환한다. */
export const canonicalizeDineugErdDocument = (document) => {
  validateDineugErdDocument(document);
  return canonicalJson(document);
};
