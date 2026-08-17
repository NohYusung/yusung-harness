#!/usr/bin/env node

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  DINEUG_SCHEMA_URL,
  DINEUG_VERSION,
  MAXIMUM_CANVAS_SIZE,
  MAXIMUM_COLLECTION_ENTITIES,
  MAXIMUM_DOCUMENT_BYTES,
  MINIMUM_CANVAS_SIZE,
  assertDocumentBudgets,
  buildDocument,
  canonicalJson,
  collectionEntityCount,
  compareStrings,
  fingerprint,
  readJsonFile,
  relationshipKey,
  stableId,
} from "./build-dineug-erd.mjs";

const COLLECTION_NAMES = [
  "tableEntities",
  "tableColumnEntities",
  "relationshipEntities",
  "indexEntities",
  "indexColumnEntities",
  "memoEntities",
];
const DATABASE_CODES = new Set([1, 2, 4, 8, 16, 32]);
const RELATIONSHIP_TYPES = new Set([2, 4, 8, 16]);
const START_RELATIONSHIP_TYPES = new Set([1, 2]);
const DIRECTIONS = new Set([1, 2, 4, 8]);
const ENTITY_ID_PATTERN =
  /^(table|column|relationship|index|index-column)-[0-9a-f]{20}$/;

function fail(message) {
  throw new Error(message);
}

function isPlainObject(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function requireObject(value, path) {
  if (!isPlainObject(value)) {
    fail(`${path} must be an object`);
  }

  return value;
}

function requireString(
  value,
  path,
  { allowEmpty = false, maximumLength = Number.POSITIVE_INFINITY } = {},
) {
  if (
    typeof value !== "string" ||
    (!allowEmpty && value.trim().length === 0)
  ) {
    fail(`${path} must be ${allowEmpty ? "a string" : "a non-empty string"}`);
  }
  if (value.length > maximumLength) {
    fail(`${path} cannot exceed ${maximumLength} characters`);
  }

  return value;
}

function requireBoolean(value, path) {
  if (typeof value !== "boolean") {
    fail(`${path} must be a boolean`);
  }

  return value;
}

function requireFiniteNumber(value, path) {
  if (!Number.isFinite(value)) {
    fail(`${path} must be a finite number`);
  }

  return value;
}

function requireCoordinate(value, path) {
  requireFiniteNumber(value, path);
  if (value < -1_000_000 || value > 1_000_000) {
    fail(`${path} must be between -1000000 and 1000000`);
  }

  return value;
}

function requireInteger(value, path) {
  if (!Number.isInteger(value)) {
    fail(`${path} must be an integer`);
  }

  return value;
}

function requireExactKeys(value, keys, path) {
  const expected = [...keys].sort(compareStrings);
  const actual = Object.keys(value).sort(compareStrings);

  if (canonicalJson(actual) !== canonicalJson(expected)) {
    fail(`${path} keys must equal ${expected.join(", ")}`);
  }
}

function requireStringArray(value, path, { allowEmpty = true } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    fail(`${path} must be ${allowEmpty ? "an array" : "a non-empty array"}`);
  }

  const values = value.map((item, index) =>
    requireString(item, `${path}[${index}]`),
  );

  if (new Set(values).size !== values.length) {
    fail(`${path} cannot contain duplicate IDs`);
  }

  return values;
}

function requireEntityId(id, path, kind) {
  requireString(id, path);
  if (!ENTITY_ID_PATTERN.test(id) || !id.startsWith(`${kind}-`)) {
    fail(`${path} must be a stable ${kind} ID`);
  }

  return id;
}

function validateMeta(meta, path) {
  requireObject(meta, path);
  requireExactKeys(meta, ["createAt", "updateAt"], path);
  requireInteger(meta.createAt, `${path}.createAt`);
  requireInteger(meta.updateAt, `${path}.updateAt`);
  if (meta.createAt !== 0 || meta.updateAt !== 0) {
    fail(`${path} timestamps must be deterministic zero values`);
  }
}

function validateRoot(document) {
  requireObject(document, "document");

  let compactJson;

  try {
    compactJson = JSON.stringify(document);
  } catch (error) {
    fail(`Dineug document must be JSON serializable: ${error.message}`);
  }
  if (Buffer.byteLength(compactJson, "utf8") > MAXIMUM_DOCUMENT_BYTES) {
    fail(`Dineug document exceeds ${MAXIMUM_DOCUMENT_BYTES} UTF-8 bytes`);
  }

  requireExactKeys(
    document,
    ["$schema", "version", "settings", "doc", "collections"],
    "document",
  );
  if (document.$schema !== DINEUG_SCHEMA_URL) {
    fail(`document.$schema must equal ${DINEUG_SCHEMA_URL}`);
  }
  if (document.version !== DINEUG_VERSION) {
    fail(`document.version must equal ${DINEUG_VERSION}`);
  }
  requireObject(document.settings, "document.settings");
  requireObject(document.doc, "document.doc");
  requireObject(document.collections, "document.collections");
  requireExactKeys(document.collections, COLLECTION_NAMES, "document.collections");

  if (collectionEntityCount(document) > MAXIMUM_COLLECTION_ENTITIES) {
    fail(
      `Dineug collections cannot contain more than ${MAXIMUM_COLLECTION_ENTITIES} total entities`,
    );
  }
}

function validateSettings(settings) {
  const path = "document.settings";
  requireExactKeys(
    settings,
    [
      "width",
      "height",
      "scrollTop",
      "scrollLeft",
      "zoomLevel",
      "show",
      "database",
      "databaseName",
      "canvasType",
      "language",
      "tableNameCase",
      "columnNameCase",
      "bracketType",
      "relationshipDataTypeSync",
      "relationshipOptimization",
      "columnOrder",
      "maxWidthComment",
      "ignoreSaveSettings",
    ],
    path,
  );

  for (const dimension of ["width", "height"]) {
    requireFiniteNumber(settings[dimension], `${path}.${dimension}`);
    if (
      settings[dimension] < MINIMUM_CANVAS_SIZE ||
      settings[dimension] > MAXIMUM_CANVAS_SIZE
    ) {
      fail(`${path}.${dimension} must be between ${MINIMUM_CANVAS_SIZE} and ${MAXIMUM_CANVAS_SIZE}`);
    }
  }
  requireFiniteNumber(settings.scrollTop, `${path}.scrollTop`);
  requireFiniteNumber(settings.scrollLeft, `${path}.scrollLeft`);
  requireFiniteNumber(settings.zoomLevel, `${path}.zoomLevel`);
  if (settings.zoomLevel < 0.1 || settings.zoomLevel > 1) {
    fail(`${path}.zoomLevel must be between 0.1 and 1`);
  }
  for (const field of [
    "show",
    "database",
    "language",
    "tableNameCase",
    "columnNameCase",
    "bracketType",
    "maxWidthComment",
    "ignoreSaveSettings",
  ]) {
    requireInteger(settings[field], `${path}.${field}`);
  }
  if (settings.show < 0 || settings.show > 511) {
    fail(`${path}.show must be between 0 and 511`);
  }
  if (!DATABASE_CODES.has(settings.database)) {
    fail(`${path}.database is not a Dineug v3 database bit`);
  }
  requireString(settings.databaseName, `${path}.databaseName`, {
    maximumLength: 512,
  });
  if (settings.canvasType !== "ERD") {
    fail(`${path}.canvasType must equal ERD`);
  }
  if (![1, 2, 4, 8, 16, 32, 64].includes(settings.language)) {
    fail(`${path}.language is not supported`);
  }
  if (![1, 2, 4, 8].includes(settings.tableNameCase)) {
    fail(`${path}.tableNameCase is not supported`);
  }
  if (![1, 2, 4, 8].includes(settings.columnNameCase)) {
    fail(`${path}.columnNameCase is not supported`);
  }
  if (![1, 2, 4, 8].includes(settings.bracketType)) {
    fail(`${path}.bracketType is not supported`);
  }
  requireBoolean(
    settings.relationshipDataTypeSync,
    `${path}.relationshipDataTypeSync`,
  );
  requireBoolean(
    settings.relationshipOptimization,
    `${path}.relationshipOptimization`,
  );
  if (
    !Array.isArray(settings.columnOrder) ||
    settings.columnOrder.length !== 7 ||
    canonicalJson(settings.columnOrder) !==
      canonicalJson([1, 2, 4, 8, 16, 32, 64])
  ) {
    fail(`${path}.columnOrder must equal 1,2,4,8,16,32,64`);
  }
  if (![0, 1, 2, 3].includes(settings.ignoreSaveSettings)) {
    fail(`${path}.ignoreSaveSettings must be 0, 1, 2, or 3`);
  }
}

function validateDoc(doc) {
  requireExactKeys(
    doc,
    ["tableIds", "relationshipIds", "indexIds", "memoIds"],
    "document.doc",
  );

  const memoIds = requireStringArray(
    doc.memoIds,
    "document.doc.memoIds",
  );
  if (memoIds.length !== 0) {
    fail("document.doc.memoIds must be empty");
  }

  return {
    tableIds: requireStringArray(doc.tableIds, "document.doc.tableIds", {
      allowEmpty: false,
    }),
    relationshipIds: requireStringArray(
      doc.relationshipIds,
      "document.doc.relationshipIds",
    ),
    indexIds: requireStringArray(doc.indexIds, "document.doc.indexIds"),
    memoIds,
  };
}

function validateUiNumbers(ui, fields, path) {
  requireObject(ui, path);
  for (const field of fields) {
    requireCoordinate(ui[field], `${path}.${field}`);
  }
}

function relationshipCoreKeyFromEntity(relationship, tableMap, columnMap) {
  return relationshipKey({
    sourceTable: tableMap.get(relationship.end.tableId).name,
    sourceColumns: relationship.end.columnIds.map(
      (columnId) => columnMap.get(columnId).name,
    ),
    targetTable: tableMap.get(relationship.start.tableId).name,
    targetColumns: relationship.start.columnIds.map(
      (columnId) => columnMap.get(columnId).name,
    ),
  });
}

function validateCollections(document, docIds) {
  const collections = document.collections;
  const tableMap = new Map();
  const columnMap = new Map();
  const relationshipMap = new Map();
  const relationshipForeignColumnIds = new Set();
  const relationshipCoreKeys = new Set();
  const indexMap = new Map();
  const indexColumnMap = new Map();

  for (const collectionName of COLLECTION_NAMES) {
    requireObject(
      collections[collectionName],
      `document.collections.${collectionName}`,
    );
  }

  for (const [key, table] of Object.entries(collections.tableEntities)) {
    const path = `tableEntities.${key}`;
    requireObject(table, path);
    requireExactKeys(
      table,
      ["id", "name", "comment", "columnIds", "seqColumnIds", "ui", "meta"],
      path,
    );
    requireEntityId(table.id, `${path}.id`, "table");
    if (key !== table.id) fail(`${path} key must equal entity.id`);
    requireString(table.name, `${path}.name`, { maximumLength: 512 });
    if (table.id !== stableId("table", table.name)) {
      fail(`${path}.id does not match the table name`);
    }
    requireString(table.comment, `${path}.comment`, {
      allowEmpty: true,
      maximumLength: 50_000,
    });
    const columnIds = requireStringArray(table.columnIds, `${path}.columnIds`, {
      allowEmpty: false,
    });
    const seqColumnIds = requireStringArray(
      table.seqColumnIds,
      `${path}.seqColumnIds`,
      { allowEmpty: false },
    );
    if (canonicalJson(columnIds) !== canonicalJson(seqColumnIds)) {
      fail(`${path}.columnIds and seqColumnIds must preserve the same order`);
    }
    requireExactKeys(
      requireObject(table.ui, `${path}.ui`),
      ["x", "y", "zIndex", "widthName", "widthComment", "color"],
      `${path}.ui`,
    );
    validateUiNumbers(
      table.ui,
      ["x", "y", "zIndex", "widthName", "widthComment"],
      `${path}.ui`,
    );
    requireString(table.ui.color, `${path}.ui.color`, { maximumLength: 64 });
    validateMeta(table.meta, `${path}.meta`);
    if ([...tableMap.values()].some((candidate) => candidate.name === table.name)) {
      fail(`duplicate table name ${table.name}`);
    }
    tableMap.set(table.id, table);
  }

  for (const [key, column] of Object.entries(collections.tableColumnEntities)) {
    const path = `tableColumnEntities.${key}`;
    requireObject(column, path);
    requireExactKeys(
      column,
      [
        "id",
        "tableId",
        "name",
        "comment",
        "dataType",
        "default",
        "options",
        "ui",
        "meta",
      ],
      path,
    );
    requireEntityId(column.id, `${path}.id`, "column");
    if (key !== column.id) fail(`${path} key must equal entity.id`);
    requireEntityId(column.tableId, `${path}.tableId`, "table");
    requireString(column.name, `${path}.name`, { maximumLength: 255 });
    const owningTable = tableMap.get(column.tableId);
    if (!owningTable) {
      fail(`${path}.tableId references an unknown table`);
    }
    if (column.id !== stableId("column", `${owningTable.name}.${column.name}`)) {
      fail(`${path}.id does not match its table and name`);
    }
    requireString(column.comment, `${path}.comment`, {
      allowEmpty: true,
      maximumLength: 50_000,
    });
    requireString(column.dataType, `${path}.dataType`, { maximumLength: 255 });
    requireString(column.default, `${path}.default`, {
      allowEmpty: true,
      maximumLength: 50_000,
    });
    requireInteger(column.options, `${path}.options`);
    if (column.options < 0 || (column.options & ~15) !== 0) {
      fail(`${path}.options contains an unknown Dineug bit`);
    }
    requireExactKeys(
      requireObject(column.ui, `${path}.ui`),
      ["keys", "widthName", "widthComment", "widthDataType", "widthDefault"],
      `${path}.ui`,
    );
    requireInteger(column.ui.keys, `${path}.ui.keys`);
    if (column.ui.keys < 0 || (column.ui.keys & ~3) !== 0) {
      fail(`${path}.ui.keys contains an unknown Dineug bit`);
    }
    if (Boolean(column.options & 2) !== Boolean(column.ui.keys & 1)) {
      fail(`${path} primary-key option and UI key must agree`);
    }
    validateUiNumbers(
      column.ui,
      ["widthName", "widthComment", "widthDataType", "widthDefault"],
      `${path}.ui`,
    );
    validateMeta(column.meta, `${path}.meta`);
    columnMap.set(column.id, column);
  }

  for (const [tableId, table] of tableMap) {
    for (const columnId of table.columnIds) {
      const column = columnMap.get(columnId);
      if (!column || column.tableId !== tableId) {
        fail(`table ${tableId} references an invalid column ${columnId}`);
      }
    }
  }
  for (const [columnId, column] of columnMap) {
    const table = tableMap.get(column.tableId);
    if (!table || !table.columnIds.includes(columnId)) {
      fail(`column ${columnId} is not owned by table ${column.tableId}`);
    }
  }

  for (const [key, relationship] of Object.entries(
    collections.relationshipEntities,
  )) {
    const path = `relationshipEntities.${key}`;
    requireObject(relationship, path);
    requireExactKeys(
      relationship,
      [
        "id",
        "identification",
        "relationshipType",
        "startRelationshipType",
        "start",
        "end",
        "meta",
      ],
      path,
    );
    requireEntityId(relationship.id, `${path}.id`, "relationship");
    if (key !== relationship.id) fail(`${path} key must equal entity.id`);
    requireBoolean(relationship.identification, `${path}.identification`);
    requireInteger(relationship.relationshipType, `${path}.relationshipType`);
    if (!RELATIONSHIP_TYPES.has(relationship.relationshipType)) {
      fail(`${path}.relationshipType is not supported by Dineug v3`);
    }
    requireInteger(
      relationship.startRelationshipType,
      `${path}.startRelationshipType`,
    );
    if (!START_RELATIONSHIP_TYPES.has(relationship.startRelationshipType)) {
      fail(`${path}.startRelationshipType is not supported by Dineug v3`);
    }

    for (const pointName of ["start", "end"]) {
      const point = requireObject(relationship[pointName], `${path}.${pointName}`);
      requireExactKeys(
        point,
        ["tableId", "columnIds", "x", "y", "direction"],
        `${path}.${pointName}`,
      );
      requireEntityId(point.tableId, `${path}.${pointName}.tableId`, "table");
      point.columnIds = requireStringArray(
        point.columnIds,
        `${path}.${pointName}.columnIds`,
        { allowEmpty: false },
      );
      requireCoordinate(point.x, `${path}.${pointName}.x`);
      requireCoordinate(point.y, `${path}.${pointName}.y`);
      requireInteger(point.direction, `${path}.${pointName}.direction`);
      if (!DIRECTIONS.has(point.direction)) {
        fail(`${path}.${pointName}.direction is not supported`);
      }
      if (!tableMap.has(point.tableId)) {
        fail(`${path}.${pointName} references unknown table ${point.tableId}`);
      }
      for (const columnId of point.columnIds) {
        const column = columnMap.get(columnId);
        if (!column || column.tableId !== point.tableId) {
          fail(`${path}.${pointName} references invalid column ${columnId}`);
        }
      }
    }
    if (relationship.start.columnIds.length !== relationship.end.columnIds.length) {
      fail(`${path} has mismatched composite FK column counts`);
    }
    const sourceColumns = relationship.end.columnIds.map((columnId) =>
      columnMap.get(columnId),
    );
    if (sourceColumns.some((column) => (column.ui.keys & 2) === 0)) {
      fail(`${path}.end columns must carry the Dineug foreign-key UI bit`);
    }
    relationship.end.columnIds.forEach((columnId) =>
      relationshipForeignColumnIds.add(columnId),
    );
    const expectedIdentification = sourceColumns.every(
      (column) => (column.options & 2) !== 0,
    );
    if (relationship.identification !== expectedIdentification) {
      fail(`${path}.identification does not match source PK columns`);
    }
    const coreKey = relationshipCoreKeyFromEntity(
      relationship,
      tableMap,
      columnMap,
    );
    if (relationshipCoreKeys.has(coreKey)) {
      fail(`${path} duplicates core relationship ${coreKey}`);
    }
    if (relationship.id !== stableId("relationship", coreKey)) {
      fail(`${path}.id does not match core relationship semantics`);
    }
    relationshipCoreKeys.add(coreKey);
    relationshipMap.set(relationship.id, relationship);
  }
  for (const [columnId, column] of columnMap) {
    const hasForeignKeyBit = (column.ui.keys & 2) !== 0;
    if (hasForeignKeyBit !== relationshipForeignColumnIds.has(columnId)) {
      fail(
        `column ${columnId} foreign-key UI bit must exactly match relationship end endpoints`,
      );
    }
  }

  for (const [key, index] of Object.entries(collections.indexEntities)) {
    const path = `indexEntities.${key}`;
    requireObject(index, path);
    requireExactKeys(
      index,
      [
        "id",
        "name",
        "tableId",
        "indexColumnIds",
        "seqIndexColumnIds",
        "unique",
        "meta",
      ],
      path,
    );
    requireEntityId(index.id, `${path}.id`, "index");
    if (key !== index.id) fail(`${path} key must equal entity.id`);
    requireString(index.name, `${path}.name`, { maximumLength: 512 });
    requireEntityId(index.tableId, `${path}.tableId`, "table");
    const indexTable = tableMap.get(index.tableId);
    if (!indexTable) {
      fail(`${path}.tableId references an unknown table`);
    }
    if (index.id !== stableId("index", `${indexTable.name}.${index.name}`)) {
      fail(`${path}.id does not match its table and name`);
    }
    const indexColumnIds = requireStringArray(
      index.indexColumnIds,
      `${path}.indexColumnIds`,
      { allowEmpty: false },
    );
    const seqIndexColumnIds = requireStringArray(
      index.seqIndexColumnIds,
      `${path}.seqIndexColumnIds`,
      { allowEmpty: false },
    );
    if (canonicalJson(indexColumnIds) !== canonicalJson(seqIndexColumnIds)) {
      fail(`${path}.indexColumnIds and seqIndexColumnIds must match`);
    }
    requireBoolean(index.unique, `${path}.unique`);
    if (!index.unique) {
      fail(`${path}.unique must be true; only named UK entities are allowed`);
    }
    validateMeta(index.meta, `${path}.meta`);
    indexMap.set(index.id, index);
  }

  for (const [key, indexColumn] of Object.entries(
    collections.indexColumnEntities,
  )) {
    const path = `indexColumnEntities.${key}`;
    requireObject(indexColumn, path);
    requireExactKeys(
      indexColumn,
      ["id", "indexId", "columnId", "orderType", "meta"],
      path,
    );
    requireEntityId(indexColumn.id, `${path}.id`, "index-column");
    if (key !== indexColumn.id) fail(`${path} key must equal entity.id`);
    requireEntityId(indexColumn.indexId, `${path}.indexId`, "index");
    requireEntityId(indexColumn.columnId, `${path}.columnId`, "column");
    requireInteger(indexColumn.orderType, `${path}.orderType`);
    if (![1, 2].includes(indexColumn.orderType)) {
      fail(`${path}.orderType must be ASC(1) or DESC(2)`);
    }
    const index = indexMap.get(indexColumn.indexId);
    const column = columnMap.get(indexColumn.columnId);
    if (!index || !column || column.tableId !== index.tableId) {
      fail(`${path} references an invalid index or column`);
    }
    const ordinal = index.indexColumnIds.indexOf(indexColumn.id);
    if (ordinal < 0) {
      fail(`${path} is not sequenced by its index`);
    }
    const table = tableMap.get(index.tableId);
    if (
      indexColumn.id !==
      stableId(
        "index-column",
        `${table.name}.${index.name}|${ordinal}|${column.name}`,
      )
    ) {
      fail(`${path}.id does not match index semantics`);
    }
    validateMeta(indexColumn.meta, `${path}.meta`);
    indexColumnMap.set(indexColumn.id, indexColumn);
  }
  for (const [indexId, index] of indexMap) {
    for (const indexColumnId of index.indexColumnIds) {
      const indexColumn = indexColumnMap.get(indexColumnId);
      if (!indexColumn || indexColumn.indexId !== indexId) {
        fail(`index ${indexId} references invalid index column ${indexColumnId}`);
      }
    }
    if (index.indexColumnIds.length === 1) {
      const indexColumn = indexColumnMap.get(index.indexColumnIds[0]);
      const column = columnMap.get(indexColumn.columnId);
      if ((column.options & 4) === 0) {
        fail(`single-column UK index ${indexId} must set the column unique option bit`);
      }
    }
  }
  const singleColumnUniqueIds = new Set(
    [...indexMap.values()]
      .filter((index) => index.indexColumnIds.length === 1)
      .map((index) => indexColumnMap.get(index.indexColumnIds[0]).columnId),
  );
  for (const [columnId, column] of columnMap) {
    if (Boolean(column.options & 4) !== singleColumnUniqueIds.has(columnId)) {
      fail(`column ${columnId} unique option bit must match a single-column UK index`);
    }
  }
  for (const [indexColumnId, indexColumn] of indexColumnMap) {
    const index = indexMap.get(indexColumn.indexId);
    if (!index || !index.indexColumnIds.includes(indexColumnId)) {
      fail(`index column ${indexColumnId} is not owned by index ${indexColumn.indexId}`);
    }
  }

  if (Object.keys(collections.memoEntities).length !== 0) {
    fail("document.collections.memoEntities must be empty");
  }

  const docCollections = [
    ["tableIds", docIds.tableIds, tableMap],
    ["relationshipIds", docIds.relationshipIds, relationshipMap],
    ["indexIds", docIds.indexIds, indexMap],
  ];
  for (const [field, ids, map] of docCollections) {
    if (
      canonicalJson([...ids].sort(compareStrings)) !==
      canonicalJson([...map.keys()].sort(compareStrings))
    ) {
      fail(`document.doc.${field} must reference every collection entity exactly once`);
    }
  }

  return {
    tableMap,
    columnMap,
    relationshipMap,
    indexMap,
    indexColumnMap,
  };
}

function validateCanonicalSemanticOrder(docIds, semantics) {
  const expected = {
    tableIds: [...semantics.tableMap.values()]
      .sort((left, right) => compareStrings(left.name, right.name))
      .map(({ id }) => id),
    relationshipIds: [...semantics.relationshipMap.values()]
      .sort((left, right) =>
        compareStrings(
          relationshipCoreKeyFromEntity(
            left,
            semantics.tableMap,
            semantics.columnMap,
          ),
          relationshipCoreKeyFromEntity(
            right,
            semantics.tableMap,
            semantics.columnMap,
          ),
        ),
      )
      .map(({ id }) => id),
    indexIds: [...semantics.indexMap.values()]
      .sort((left, right) => {
        const leftTable = semantics.tableMap.get(left.tableId);
        const rightTable = semantics.tableMap.get(right.tableId);
        return (
          compareStrings(leftTable.name, rightTable.name) ||
          compareStrings(left.name, right.name)
        );
      })
      .map(({ id }) => id),
    memoIds: [],
  };

  for (const field of Object.keys(expected)) {
    if (canonicalJson(docIds[field]) !== canonicalJson(expected[field])) {
      fail(`document.doc.${field} must use canonical semantic order`);
    }
  }
}

export function validateDocument(document, rawInventory = null) {
  validateRoot(document);
  validateSettings(document.settings);
  const docIds = validateDoc(document.doc);
  const semantics = validateCollections(document, docIds);
  const budgets = assertDocumentBudgets(document);
  validateCanonicalSemanticOrder(docIds, semantics);

  if (rawInventory) {
    const expectedDocument = buildDocument(rawInventory);

    if (canonicalJson(expectedDocument) !== canonicalJson(document)) {
      fail("Dineug document does not exactly match the deterministic inventory build");
    }
  }

  return {
    tables: semantics.tableMap.size,
    columns: semantics.columnMap.size,
    relationships: semantics.relationshipMap.size,
    indexes: semantics.indexMap.size,
    memos: 0,
    entities: budgets.entities,
    bytes: budgets.bytes,
    documentFingerprint: fingerprint(document),
  };
}

function parseArguments(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--document" || argument === "--inventory") {
      const value = argv[index + 1];

      if (!value || value.startsWith("--")) {
        fail(`${argument} requires a path`);
      }
      options[argument.slice(2)] = resolve(value);
      index += 1;
      continue;
    }

    fail(`unknown argument ${argument}`);
  }

  if (!options.document) {
    fail("usage: validate-dineug-erd.mjs --document <document.erd> [--inventory <inventory.json>]");
  }

  return options;
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const document = readJsonFile(options.document);
  const inventory = options.inventory ? readJsonFile(options.inventory) : null;
  const result = validateDocument(document, inventory);

  process.stdout.write(
    `${JSON.stringify({ status: "valid", document: options.document, ...result })}\n`,
  );
}

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMainModule) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`validate-dineug-erd: ${error.message}\n`);
    process.exitCode = 1;
  }
}
