#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const INVENTORY_CONTRACT = "ERDInventory/2.0";
export const DINEUG_SCHEMA_URL =
  "https://raw.githubusercontent.com/dineug/erd-editor/main/json-schema/schema.json";
export const DINEUG_VERSION = "3.0.0";
export const METADATA_MEMO_PREFIX = "[yusung-harness:erd-meta/1.0]\n";
export const FOREIGN_KEY_MEMO_PREFIX = "[yusung-harness:fk/1.0]\n";
export const MAXIMUM_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const MAXIMUM_COLLECTION_ENTITIES = 5_000;
export const MINIMUM_CANVAS_SIZE = 2_000;
export const MAXIMUM_CANVAS_SIZE = 20_000;

const CARD_WIDTH = 440;
const CARD_HEADER_HEIGHT = 72;
const CARD_ROW_HEIGHT = 30;
const CARD_BOTTOM_PADDING = 24;
const LAYER_GAP = 180;
const COMPONENT_GAP = 140;
const TABLE_GAP = 90;
const CANVAS_PADDING = 120;
const MEMO_WIDTH = 520;
const METADATA_MEMO_HEIGHT = 160;
const FOREIGN_KEY_MEMO_HEIGHT = 150;
const MEMO_GAP = 28;
const DATABASE_CODES = new Map([
  ["mariadb", 1],
  ["mssql", 2],
  ["sqlserver", 2],
  ["mysql", 4],
  ["oracle", 8],
  ["postgresql", 16],
  ["postgres", 16],
  ["sqlite", 32],
]);
const SOURCE_CARDINALITIES = new Set(["1", "0..1", "1..N", "0..N"]);
const TARGET_CARDINALITIES = new Set(["1", "0..1"]);

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

function requireString(value, path) {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(`${path} must be a non-empty string`);
  }

  return value.trim();
}

function optionalString(value, path, fallback = null) {
  if (value === undefined || value === null) {
    return fallback;
  }

  return requireString(value, path);
}

function requireBoolean(value, path) {
  if (typeof value !== "boolean") {
    fail(`${path} must be a boolean`);
  }

  return value;
}

export function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort(compareStrings)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

export function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function fingerprint(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function stableId(kind, key) {
  return `${kind}-${createHash("sha256").update(key).digest("hex").slice(0, 20)}`;
}

export function relationshipKey(relationship) {
  return [
    relationship.sourceTable,
    relationship.constraint,
    relationship.sourceColumns.join(","),
    relationship.targetTable,
    relationship.targetColumns.join(","),
  ].join("|");
}

function columnKey(tableName, columnName) {
  return `${tableName}.${columnName}`;
}

function indexKey(tableName, indexName) {
  return `${tableName}.${indexName}`;
}

function normalizeColumn(column, tablePath, columnIndex) {
  const path = `${tablePath}.columns[${columnIndex}]`;

  if (!isPlainObject(column)) {
    fail(`${path} must be an object`);
  }

  return {
    name: requireString(column.name, `${path}.name`),
    type: requireString(column.type, `${path}.type`),
    nullable: requireBoolean(column.nullable, `${path}.nullable`),
    foreignKey: requireBoolean(column.foreignKey, `${path}.foreignKey`),
    autoIncrement: requireBoolean(
      column.autoIncrement,
      `${path}.autoIncrement`,
    ),
    default: optionalString(column.default, `${path}.default`),
    comment: optionalString(column.comment, `${path}.comment`, ""),
  };
}

function normalizeConstraintColumns(value, path) {
  const columns = normalizeColumnList(value, path);

  if (new Set(columns).size !== columns.length) {
    fail(`${path} cannot contain duplicate column names`);
  }

  return columns;
}

function normalizePrimaryKey(primaryKey, tablePath) {
  if (primaryKey === null) return null;
  if (!isPlainObject(primaryKey)) {
    fail(`${tablePath}.primaryKey must be an object or null`);
  }
  if (
    canonicalJson(Object.keys(primaryKey).sort(compareStrings)) !==
    '["columns"]'
  ) {
    fail(`${tablePath}.primaryKey may contain only columns; PK names are not stored`);
  }

  return {
    columns: normalizeConstraintColumns(
      primaryKey.columns,
      `${tablePath}.primaryKey.columns`,
    ),
  };
}

function normalizeUniqueConstraint(constraint, tablePath, constraintIndex) {
  const path = `${tablePath}.uniqueConstraints[${constraintIndex}]`;

  if (!isPlainObject(constraint)) {
    fail(`${path} must be an object`);
  }

  return {
    name: requireString(constraint.name, `${path}.name`),
    columns: normalizeConstraintColumns(
      constraint.columns,
      `${path}.columns`,
    ),
  };
}

function normalizeTable(table, tableIndex) {
  const path = `tables[${tableIndex}]`;

  if (!isPlainObject(table)) {
    fail(`${path} must be an object`);
  }
  if (!Array.isArray(table.columns) || table.columns.length === 0) {
    fail(`${path}.columns must contain at least one column`);
  }
  if (!Array.isArray(table.uniqueConstraints)) {
    fail(`${path}.uniqueConstraints must be an array`);
  }

  const columns = table.columns.map((column, columnIndex) =>
    normalizeColumn(column, path, columnIndex),
  );
  const columnNames = new Set();

  for (const column of columns) {
    if (columnNames.has(column.name)) {
      fail(`${path} contains duplicate column ${column.name}`);
    }
    columnNames.add(column.name);
  }

  const primaryKey = normalizePrimaryKey(table.primaryKey, path);
  const uniqueConstraints = table.uniqueConstraints
    .map((constraint, constraintIndex) =>
      normalizeUniqueConstraint(constraint, path, constraintIndex),
    )
    .sort((left, right) => compareStrings(left.name, right.name));
  const uniqueNames = new Set();

  if (primaryKey) {
    for (const columnName of primaryKey.columns) {
      if (!columnNames.has(columnName)) {
        fail(`${path}.primaryKey references unknown column ${columnName}`);
      }
    }
  }
  for (const constraint of uniqueConstraints) {
    if (uniqueNames.has(constraint.name)) {
      fail(`${path} contains duplicate unique constraint ${constraint.name}`);
    }
    uniqueNames.add(constraint.name);
    for (const columnName of constraint.columns) {
      if (!columnNames.has(columnName)) {
        fail(`${path}.unique constraint ${constraint.name} references unknown column ${columnName}`);
      }
    }
  }

  return {
    qualifiedName: requireString(table.qualifiedName, `${path}.qualifiedName`),
    comment: optionalString(table.comment, `${path}.comment`, ""),
    columns,
    primaryKey,
    uniqueConstraints,
  };
}

function normalizeColumnList(value, path) {
  if (!Array.isArray(value) || value.length === 0) {
    fail(`${path} must contain at least one column name`);
  }

  return value.map((column, index) =>
    requireString(column, `${path}[${index}]`),
  );
}

function normalizeCardinality(value, path, allowed) {
  const cardinality = requireString(value, path);

  if (!allowed.has(cardinality)) {
    fail(`${path} must be one of ${[...allowed].join(", ")}`);
  }

  return cardinality;
}

function normalizeRelationship(relationship, relationshipIndex) {
  const path = `relationships[${relationshipIndex}]`;

  if (!isPlainObject(relationship)) {
    fail(`${path} must be an object`);
  }

  return {
    constraint: requireString(relationship.constraint, `${path}.constraint`),
    sourceTable: requireString(
      relationship.sourceTable,
      `${path}.sourceTable`,
    ),
    sourceColumns: normalizeColumnList(
      relationship.sourceColumns,
      `${path}.sourceColumns`,
    ),
    sourceCardinality: normalizeCardinality(
      relationship.sourceCardinality,
      `${path}.sourceCardinality`,
      SOURCE_CARDINALITIES,
    ),
    targetTable: requireString(
      relationship.targetTable,
      `${path}.targetTable`,
    ),
    targetColumns: normalizeColumnList(
      relationship.targetColumns,
      `${path}.targetColumns`,
    ),
    targetCardinality: normalizeCardinality(
      relationship.targetCardinality,
      `${path}.targetCardinality`,
      TARGET_CARDINALITIES,
    ),
    onUpdate: optionalString(relationship.onUpdate, `${path}.onUpdate`),
    onDelete: optionalString(relationship.onDelete, `${path}.onDelete`),
  };
}

function engineKey(engine) {
  return engine.toLowerCase().replace(/[^a-z]/g, "");
}

export function databaseCode(engine) {
  const normalized = engineKey(engine);

  for (const [name, code] of DATABASE_CODES) {
    if (normalized.includes(name)) {
      return code;
    }
  }

  fail(`engine ${engine} is not supported by Dineug v3`);
}

export function normalizeInventory(rawInventory) {
  if (!isPlainObject(rawInventory)) {
    fail("inventory root must be an object");
  }
  if (rawInventory.contract !== INVENTORY_CONTRACT) {
    fail(`inventory.contract must equal ${INVENTORY_CONTRACT}`);
  }
  if (!Array.isArray(rawInventory.tables) || rawInventory.tables.length === 0) {
    fail("inventory.tables must contain at least one table");
  }
  if (!Array.isArray(rawInventory.relationships)) {
    fail("inventory.relationships must be an array");
  }

  const engine = requireString(rawInventory.engine, "inventory.engine");
  databaseCode(engine);
  const tables = rawInventory.tables
    .map(normalizeTable)
    .sort((left, right) =>
      compareStrings(left.qualifiedName, right.qualifiedName),
    );
  const tableMap = new Map();

  for (const table of tables) {
    if (tableMap.has(table.qualifiedName)) {
      fail(`inventory contains duplicate table ${table.qualifiedName}`);
    }
    tableMap.set(table.qualifiedName, table);
  }

  const relationships = rawInventory.relationships
    .map(normalizeRelationship)
    .sort((left, right) =>
      compareStrings(relationshipKey(left), relationshipKey(right)),
    );
  const relationshipKeys = new Set();
  const relationshipForeignKeys = new Set();

  for (const relationship of relationships) {
    const key = relationshipKey(relationship);

    if (relationshipKeys.has(key)) {
      fail(`inventory contains duplicate relationship ${key}`);
    }
    relationshipKeys.add(key);
    if (relationship.sourceColumns.length !== relationship.targetColumns.length) {
      fail(`relationship ${relationship.constraint} has mismatched column counts`);
    }

    const sourceTable = tableMap.get(relationship.sourceTable);
    const targetTable = tableMap.get(relationship.targetTable);

    if (!sourceTable || !targetTable) {
      fail(`relationship ${relationship.constraint} references an unknown table`);
    }
    const sourceColumnMap = new Map(
      sourceTable.columns.map((column) => [column.name, column]),
    );
    const targetColumnNames = new Set(
      targetTable.columns.map((column) => column.name),
    );

    for (const sourceColumnName of relationship.sourceColumns) {
      const sourceColumn = sourceColumnMap.get(sourceColumnName);

      if (!sourceColumn) {
        fail(`relationship ${relationship.constraint} references unknown source column ${sourceColumnName}`);
      }
      relationshipForeignKeys.add(
        columnKey(relationship.sourceTable, sourceColumnName),
      );
    }
    for (const targetColumnName of relationship.targetColumns) {
      if (!targetColumnNames.has(targetColumnName)) {
        fail(`relationship ${relationship.constraint} references unknown target column ${targetColumnName}`);
      }
    }
  }

  const declaredForeignKeys = new Set(
    tables.flatMap((table) =>
      table.columns
        .filter((column) => column.foreignKey)
        .map((column) => columnKey(table.qualifiedName, column.name)),
    ),
  );
  if (
    canonicalJson([...declaredForeignKeys].sort(compareStrings)) !==
    canonicalJson([...relationshipForeignKeys].sort(compareStrings))
  ) {
    fail(
      "column.foreignKey flags must exactly match relationship sourceTable/sourceColumns",
    );
  }

  return {
    contract: INVENTORY_CONTRACT,
    name: requireString(rawInventory.name, "inventory.name"),
    scope: requireString(rawInventory.scope, "inventory.scope"),
    engine,
    sourceRevision: requireString(
      rawInventory.sourceRevision,
      "inventory.sourceRevision",
    ),
    tables,
    relationships,
  };
}

export function inventoryFingerprint(inventory) {
  return fingerprint({
    contract: inventory.contract,
    name: inventory.name,
    scope: inventory.scope,
    engine: inventory.engine,
    sourceRevision: inventory.sourceRevision,
    tables: inventory.tables,
    relationships: inventory.relationships,
  });
}

function tableHeight(table) {
  return CARD_HEADER_HEIGHT + table.columns.length * CARD_ROW_HEIGHT + CARD_BOTTOM_PADDING;
}

function stronglyConnectedComponents(tableNames, graph) {
  let currentIndex = 0;
  const indexes = new Map();
  const lowLinks = new Map();
  const stack = [];
  const onStack = new Set();
  const components = [];

  function visit(tableName) {
    indexes.set(tableName, currentIndex);
    lowLinks.set(tableName, currentIndex);
    currentIndex += 1;
    stack.push(tableName);
    onStack.add(tableName);

    for (const neighbor of [...(graph.get(tableName) ?? [])].sort(compareStrings)) {
      if (!indexes.has(neighbor)) {
        visit(neighbor);
        lowLinks.set(
          tableName,
          Math.min(lowLinks.get(tableName), lowLinks.get(neighbor)),
        );
      } else if (onStack.has(neighbor)) {
        lowLinks.set(
          tableName,
          Math.min(lowLinks.get(tableName), indexes.get(neighbor)),
        );
      }
    }

    if (lowLinks.get(tableName) === indexes.get(tableName)) {
      const component = [];
      let member;

      do {
        member = stack.pop();
        onStack.delete(member);
        component.push(member);
      } while (member !== tableName);

      components.push(component.sort(compareStrings));
    }
  }

  for (const tableName of [...tableNames].sort(compareStrings)) {
    if (!indexes.has(tableName)) {
      visit(tableName);
    }
  }

  return components.sort((left, right) => compareStrings(left[0], right[0]));
}

function layoutTables(inventory) {
  const tableNames = inventory.tables.map((table) => table.qualifiedName);
  const tableMap = new Map(
    inventory.tables.map((table) => [table.qualifiedName, table]),
  );
  const graph = new Map(tableNames.map((tableName) => [tableName, new Set()]));

  for (const relationship of inventory.relationships) {
    graph.get(relationship.targetTable).add(relationship.sourceTable);
  }

  const components = stronglyConnectedComponents(tableNames, graph);
  const componentByTable = new Map();

  components.forEach((component, componentIndex) => {
    component.forEach((tableName) => componentByTable.set(tableName, componentIndex));
  });

  const componentGraph = new Map(
    components.map((_, componentIndex) => [componentIndex, new Set()]),
  );
  const indegrees = new Map(components.map((_, componentIndex) => [componentIndex, 0]));

  for (const [tableName, neighbors] of graph) {
    const sourceComponent = componentByTable.get(tableName);

    for (const neighbor of neighbors) {
      const targetComponent = componentByTable.get(neighbor);

      if (
        sourceComponent !== targetComponent &&
        !componentGraph.get(sourceComponent).has(targetComponent)
      ) {
        componentGraph.get(sourceComponent).add(targetComponent);
        indegrees.set(targetComponent, indegrees.get(targetComponent) + 1);
      }
    }
  }

  const componentKey = (componentIndex) => components[componentIndex][0];
  const queue = [...indegrees.entries()]
    .filter(([, indegree]) => indegree === 0)
    .map(([componentIndex]) => componentIndex)
    .sort((left, right) => compareStrings(componentKey(left), componentKey(right)));
  const layers = new Map(components.map((_, componentIndex) => [componentIndex, 0]));
  const orderedComponents = [];

  while (queue.length > 0) {
    const componentIndex = queue.shift();
    orderedComponents.push(componentIndex);

    for (const neighbor of [...componentGraph.get(componentIndex)].sort(
      (left, right) => compareStrings(componentKey(left), componentKey(right)),
    )) {
      layers.set(neighbor, Math.max(layers.get(neighbor), layers.get(componentIndex) + 1));
      indegrees.set(neighbor, indegrees.get(neighbor) - 1);
      if (indegrees.get(neighbor) === 0) {
        queue.push(neighbor);
        queue.sort((left, right) => compareStrings(componentKey(left), componentKey(right)));
      }
    }
  }

  if (orderedComponents.length !== components.length) {
    fail("SCC condensation graph unexpectedly contains a cycle");
  }

  const componentsByLayer = new Map();

  for (const componentIndex of orderedComponents) {
    const layer = layers.get(componentIndex);
    const layerComponents = componentsByLayer.get(layer) ?? [];
    layerComponents.push(componentIndex);
    layerComponents.sort((left, right) => compareStrings(componentKey(left), componentKey(right)));
    componentsByLayer.set(layer, layerComponents);
  }

  const positions = new Map();
  let maximumTableRight = 0;
  let maximumTableBottom = 0;

  for (const [layer, layerComponents] of [...componentsByLayer.entries()].sort(
    ([left], [right]) => left - right,
  )) {
    let y = CANVAS_PADDING;
    const x = CANVAS_PADDING + layer * (CARD_WIDTH + LAYER_GAP);

    for (const componentIndex of layerComponents) {
      for (const tableName of components[componentIndex]) {
        const table = tableMap.get(tableName);
        const height = tableHeight(table);
        positions.set(tableName, { x, y, width: CARD_WIDTH, height });
        maximumTableRight = Math.max(maximumTableRight, x + CARD_WIDTH);
        maximumTableBottom = Math.max(maximumTableBottom, y + height);
        y += height + TABLE_GAP;
      }
      y += COMPONENT_GAP;
    }
  }

  const annotationX = maximumTableRight + LAYER_GAP;
  let memoBottom = CANVAS_PADDING + METADATA_MEMO_HEIGHT;

  if (inventory.relationships.length > 0) {
    memoBottom =
      CANVAS_PADDING +
      METADATA_MEMO_HEIGHT +
      MEMO_GAP +
      inventory.relationships.length * (FOREIGN_KEY_MEMO_HEIGHT + MEMO_GAP) -
      MEMO_GAP;
  }

  const width = Math.max(
    MINIMUM_CANVAS_SIZE,
    Math.ceil(annotationX + MEMO_WIDTH + CANVAS_PADDING),
  );
  const height = Math.max(
    MINIMUM_CANVAS_SIZE,
    Math.ceil(Math.max(maximumTableBottom, memoBottom) + CANVAS_PADDING),
  );

  if (width > MAXIMUM_CANVAS_SIZE || height > MAXIMUM_CANVAS_SIZE) {
    fail(
      `SCC layout requires ${width}x${height}; Dineug canvas maximum is ${MAXIMUM_CANVAS_SIZE}x${MAXIMUM_CANVAS_SIZE}`,
    );
  }

  return { positions, annotationX, width, height };
}

function entityMeta() {
  return { updateAt: 0, createAt: 0 };
}

function relationshipType(cardinality) {
  return {
    "0..1": 2,
    "0..N": 4,
    "1": 8,
    "1..N": 16,
  }[cardinality];
}

function relationshipPoint(layout, columnIndex, direction) {
  const rowY =
    layout.y + CARD_HEADER_HEIGHT + columnIndex * CARD_ROW_HEIGHT + CARD_ROW_HEIGHT / 2;

  if (direction === 1) {
    return { x: layout.x, y: rowY, direction };
  }
  if (direction === 2) {
    return { x: layout.x + layout.width, y: rowY, direction };
  }
  if (direction === 4) {
    return { x: layout.x + layout.width / 2, y: layout.y, direction };
  }

  return {
    x: layout.x + layout.width / 2,
    y: layout.y + layout.height,
    direction: 8,
  };
}

function relationshipDirections(startLayout, endLayout) {
  if (startLayout.x < endLayout.x) return [2, 1];
  if (startLayout.x > endLayout.x) return [1, 2];
  if (startLayout.y < endLayout.y) return [8, 4];
  if (startLayout.y > endLayout.y) return [4, 8];
  return [2, 1];
}

function memoValue(prefix, payload) {
  return `${prefix}${canonicalJson(payload)}`;
}

export function collectionEntityCount(document) {
  return Object.values(document.collections).reduce(
    (count, collection) => count + Object.keys(collection).length,
    0,
  );
}

export function assertDocumentBudgets(document) {
  const entityCount = collectionEntityCount(document);

  if (entityCount > MAXIMUM_COLLECTION_ENTITIES) {
    fail(
      `Dineug collections cannot contain more than ${MAXIMUM_COLLECTION_ENTITIES} total entities`,
    );
  }
  if (
    document.settings.width < MINIMUM_CANVAS_SIZE ||
    document.settings.height < MINIMUM_CANVAS_SIZE ||
    document.settings.width > MAXIMUM_CANVAS_SIZE ||
    document.settings.height > MAXIMUM_CANVAS_SIZE
  ) {
    fail(
      `Dineug canvas dimensions must be between ${MINIMUM_CANVAS_SIZE} and ${MAXIMUM_CANVAS_SIZE}`,
    );
  }

  let json;

  try {
    json = JSON.stringify(document);
  } catch (error) {
    fail(`Dineug document must be JSON serializable: ${error.message}`);
  }
  const bytes = Buffer.byteLength(json, "utf8");

  if (bytes > MAXIMUM_DOCUMENT_BYTES) {
    fail(`Dineug document exceeds ${MAXIMUM_DOCUMENT_BYTES} UTF-8 bytes`);
  }

  return { bytes, entities: entityCount };
}

export function buildDocument(rawInventory) {
  const inventory = normalizeInventory(rawInventory);
  const semanticFingerprint = inventoryFingerprint(inventory);
  const { positions, annotationX, width, height } = layoutTables(inventory);
  const tableEntities = {};
  const tableColumnEntities = {};
  const relationshipEntities = {};
  const indexEntities = {};
  const indexColumnEntities = {};
  const memoEntities = {};
  const tableIds = [];
  const relationshipIds = [];
  const indexIds = [];
  const memoIds = [];
  const tableIdsByName = new Map();
  const columnIdsByKey = new Map();
  const foreignKeyColumnKeys = new Set(
    inventory.relationships.flatMap((relationship) =>
      relationship.sourceColumns.map((columnName) =>
        columnKey(relationship.sourceTable, columnName),
      ),
    ),
  );

  inventory.tables.forEach((table, tablePosition) => {
    const id = stableId("table", table.qualifiedName);
    const layout = positions.get(table.qualifiedName);
    const columnIds = [];
    const primaryKeyColumns = new Set(table.primaryKey?.columns ?? []);
    const singleColumnUniqueColumns = new Set(
      table.uniqueConstraints
        .filter((constraint) => constraint.columns.length === 1)
        .map((constraint) => constraint.columns[0]),
    );

    tableIds.push(id);
    tableIdsByName.set(table.qualifiedName, id);
    table.columns.forEach((column) => {
      const key = columnKey(table.qualifiedName, column.name);
      const columnId = stableId("column", key);
      let options = 0;
      let keys = 0;

      if (column.autoIncrement) options |= 1;
      if (primaryKeyColumns.has(column.name)) {
        options |= 2;
        keys |= 1;
      }
      if (singleColumnUniqueColumns.has(column.name)) options |= 4;
      if (!column.nullable) options |= 8;
      if (foreignKeyColumnKeys.has(key)) keys |= 2;

      columnIds.push(columnId);
      columnIdsByKey.set(key, columnId);
      tableColumnEntities[columnId] = {
        id: columnId,
        tableId: id,
        name: column.name,
        comment: column.comment,
        dataType: column.type,
        default: column.default ?? "",
        options,
        ui: {
          keys,
          widthName: 180,
          widthComment: 160,
          widthDataType: 180,
          widthDefault: 180,
        },
        meta: entityMeta(),
      };
    });

    tableEntities[id] = {
      id,
      name: table.qualifiedName,
      comment: table.comment,
      columnIds,
      seqColumnIds: [...columnIds],
      ui: {
        x: layout.x,
        y: layout.y,
        zIndex: tablePosition + 2,
        widthName: 260,
        widthComment: 180,
        color: "#ffffff",
      },
      meta: entityMeta(),
    };

    for (const constraint of table.uniqueConstraints) {
      const key = indexKey(table.qualifiedName, constraint.name);
      const indexId = stableId("index", key);
      const indexColumnIds = [];

      constraint.columns.forEach((columnName, columnPosition) => {
        const indexColumnId = stableId(
          "index-column",
          `${key}|${columnPosition}|${columnName}`,
        );

        indexColumnIds.push(indexColumnId);
        indexColumnEntities[indexColumnId] = {
          id: indexColumnId,
          indexId,
          columnId: columnIdsByKey.get(
            columnKey(table.qualifiedName, columnName),
          ),
          orderType: 1,
          meta: entityMeta(),
        };
      });

      indexIds.push(indexId);
      indexEntities[indexId] = {
        id: indexId,
        name: constraint.name,
        tableId: id,
        indexColumnIds,
        seqIndexColumnIds: [...indexColumnIds],
        unique: true,
        meta: entityMeta(),
      };
    }
  });

  const metadataMemoId = stableId("memo", "metadata");
  memoIds.push(metadataMemoId);
  memoEntities[metadataMemoId] = {
    id: metadataMemoId,
    value: memoValue(METADATA_MEMO_PREFIX, {
      engine: inventory.engine,
      inventoryFingerprint: semanticFingerprint,
      scope: inventory.scope,
      sourceRevision: inventory.sourceRevision,
    }),
    ui: {
      x: annotationX,
      y: CANVAS_PADDING,
      zIndex: inventory.tables.length + 2,
      width: MEMO_WIDTH,
      height: METADATA_MEMO_HEIGHT,
      color: "#fff7ed",
    },
    meta: entityMeta(),
  };

  inventory.relationships.forEach((relationship, relationshipPosition) => {
    const key = relationshipKey(relationship);
    const id = stableId("relationship", key);
    const sourceTable = inventory.tables.find(
      (table) => table.qualifiedName === relationship.sourceTable,
    );
    const targetTable = inventory.tables.find(
      (table) => table.qualifiedName === relationship.targetTable,
    );
    const sourceLayout = positions.get(relationship.sourceTable);
    const targetLayout = positions.get(relationship.targetTable);
    const [startDirection, endDirection] = relationshipDirections(
      targetLayout,
      sourceLayout,
    );
    const startPoint = relationshipPoint(
      targetLayout,
      targetTable.columns.findIndex(
        (column) => column.name === relationship.targetColumns[0],
      ),
      startDirection,
    );
    const endPoint = relationshipPoint(
      sourceLayout,
      sourceTable.columns.findIndex(
        (column) => column.name === relationship.sourceColumns[0],
      ),
      endDirection,
    );

    relationshipIds.push(id);
    relationshipEntities[id] = {
      id,
      identification: relationship.sourceColumns.every((columnName) =>
        (sourceTable.primaryKey?.columns ?? []).includes(columnName),
      ),
      relationshipType: relationshipType(relationship.sourceCardinality),
      startRelationshipType:
        relationship.targetCardinality === "0..1" ? 1 : 2,
      start: {
        tableId: tableIdsByName.get(relationship.targetTable),
        columnIds: relationship.targetColumns.map((columnName) =>
          columnIdsByKey.get(columnKey(relationship.targetTable, columnName)),
        ),
        ...startPoint,
      },
      end: {
        tableId: tableIdsByName.get(relationship.sourceTable),
        columnIds: relationship.sourceColumns.map((columnName) =>
          columnIdsByKey.get(columnKey(relationship.sourceTable, columnName)),
        ),
        ...endPoint,
      },
      meta: entityMeta(),
    };

    const memoId = stableId("memo", key);
    memoIds.push(memoId);
    memoEntities[memoId] = {
      id: memoId,
      value: memoValue(FOREIGN_KEY_MEMO_PREFIX, {
        constraint: relationship.constraint,
        onDelete: relationship.onDelete,
        onUpdate: relationship.onUpdate,
        sourceCardinality: relationship.sourceCardinality,
        sourceColumns: relationship.sourceColumns,
        sourceTable: relationship.sourceTable,
        targetCardinality: relationship.targetCardinality,
        targetColumns: relationship.targetColumns,
        targetTable: relationship.targetTable,
      }),
      ui: {
        x: annotationX,
        y:
          CANVAS_PADDING +
          METADATA_MEMO_HEIGHT +
          MEMO_GAP +
          relationshipPosition * (FOREIGN_KEY_MEMO_HEIGHT + MEMO_GAP),
        zIndex: inventory.tables.length + 3 + relationshipPosition,
        width: MEMO_WIDTH,
        height: FOREIGN_KEY_MEMO_HEIGHT,
        color: "#f8fafc",
      },
      meta: entityMeta(),
    };
  });

  const document = {
    $schema: DINEUG_SCHEMA_URL,
    version: DINEUG_VERSION,
    settings: {
      width,
      height,
      scrollTop: 0,
      scrollLeft: 0,
      zoomLevel: 1,
      show: 511,
      database: databaseCode(inventory.engine),
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
    doc: { tableIds, relationshipIds, indexIds, memoIds },
    collections: {
      tableEntities,
      tableColumnEntities,
      relationshipEntities,
      indexEntities,
      indexColumnEntities,
      memoEntities,
    },
  };

  assertDocumentBudgets(document);
  return document;
}

function parseArguments(argv) {
  const options = { force: false };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--force") {
      options.force = true;
      continue;
    }
    if (argument === "--input" || argument === "--output") {
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

  if (!options.input || !options.output) {
    fail("usage: build-dineug-erd.mjs --input <inventory.json> --output <document.erd> [--force]");
  }

  return options;
}

export function readJsonFile(path) {
  let text;

  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    fail(`cannot read ${path}: ${error.message}`);
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`cannot parse JSON ${path}: ${error.message}`);
  }
}

function main() {
  const options = parseArguments(process.argv.slice(2));

  if (existsSync(options.output) && !options.force) {
    fail(`output already exists: ${options.output}; pass --force to replace it`);
  }

  const inventory = normalizeInventory(readJsonFile(options.input));
  const document = buildDocument(inventory);
  const budgets = assertDocumentBudgets(document);

  mkdirSync(dirname(options.output), { recursive: true });
  writeFileSync(options.output, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  process.stdout.write(
    `${JSON.stringify({
      status: "built",
      output: options.output,
      inventoryFingerprint: inventoryFingerprint(inventory),
      tables: inventory.tables.length,
      relationships: inventory.relationships.length,
      indexes: inventory.tables.reduce(
        (count, table) => count + table.uniqueConstraints.length,
        0,
      ),
      entities: budgets.entities,
      bytes: budgets.bytes,
    })}\n`,
  );
}

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMainModule) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`build-dineug-erd: ${error.message}\n`);
    process.exitCode = 1;
  }
}
