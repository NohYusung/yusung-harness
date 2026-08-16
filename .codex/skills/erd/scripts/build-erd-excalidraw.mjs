#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const INVENTORY_CONTRACT = "ERDInventory/1.0";
export const SCENE_CONTRACT = "ERDExcalidraw/1.0";
export const SCENE_SOURCE = "yusung-harness:erd";
export const MAXIMUM_SCENE_BYTES = 5 * 1024 * 1024;
export const MAXIMUM_ELEMENTS = 5_000;
export const ALLOWED_SCENE_ELEMENT_TYPES = Object.freeze([
  "rectangle",
  "text",
  "arrow",
]);

const CARD_MIN_WIDTH = 420;
const CARD_HEADER_HEIGHT = 48;
const CARD_ROW_HEIGHT = 28;
const CARD_BOTTOM_PADDING = 14;
const GROUP_COLUMNS_MAX = 3;
const GROUP_GAP = 110;
const GROUP_HEADER_HEIGHT = 54;
const GROUP_PADDING = 48;
const TABLE_GAP_X = 100;
const TABLE_GAP_Y = 100;
const CARD_TEXT_SIZE = 15;
const TITLE_TEXT_SIZE = 18;
const META_TEXT_SIZE = 20;
const BASE62 =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const CARDINALITIES = new Set(["1", "0..1", "N", "1..N", "0..N"]);

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

function optionalString(value, path) {
  if (value === undefined || value === null) {
    return null;
  }

  return requireString(value, path);
}

function optionalBoolean(value, path) {
  if (value === undefined) {
    return false;
  }
  if (typeof value !== "boolean") {
    fail(`${path} must be a boolean`);
  }

  return value;
}

function requireBoolean(value, path) {
  if (typeof value !== "boolean") {
    fail(`${path} must be a boolean`);
  }

  return value;
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

export function fingerprint(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
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
    primaryKey: optionalBoolean(column.primaryKey, `${path}.primaryKey`),
    foreignKey: optionalBoolean(column.foreignKey, `${path}.foreignKey`),
    unique: optionalBoolean(column.unique, `${path}.unique`),
    default: optionalString(column.default, `${path}.default`),
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

  return {
    qualifiedName: requireString(table.qualifiedName, `${path}.qualifiedName`),
    columns,
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

function normalizeCardinality(value, path) {
  const cardinality = requireString(value, path);

  if (!CARDINALITIES.has(cardinality)) {
    fail(
      `${path} must be one of ${[...CARDINALITIES].sort().join(", ")}`,
    );
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
    ),
    onUpdate: optionalString(relationship.onUpdate, `${path}.onUpdate`),
    onDelete: optionalString(relationship.onDelete, `${path}.onDelete`),
  };
}

function relationshipKey(relationship) {
  return [
    relationship.sourceTable,
    relationship.constraint,
    relationship.sourceColumns.join(","),
    relationship.targetTable,
    relationship.targetColumns.join(","),
  ].join("|");
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

  const tables = rawInventory.tables
    .map(normalizeTable)
    .sort((left, right) =>
      left.qualifiedName.localeCompare(right.qualifiedName),
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
      relationshipKey(left).localeCompare(relationshipKey(right)),
    );
  const relationshipKeys = new Set();

  for (const relationship of relationships) {
    const key = relationshipKey(relationship);
    const sourceTable = tableMap.get(relationship.sourceTable);
    const targetTable = tableMap.get(relationship.targetTable);

    if (relationshipKeys.has(key)) {
      fail(`inventory contains duplicate relationship ${key}`);
    }
    relationshipKeys.add(key);

    if (!sourceTable) {
      fail(`relationship ${key} references unknown source table`);
    }
    if (!targetTable) {
      fail(`relationship ${key} references unknown target table`);
    }
    if (
      relationship.sourceColumns.length !== relationship.targetColumns.length
    ) {
      fail(`relationship ${key} has mismatched composite FK column counts`);
    }

    const sourceColumnNames = new Set(
      sourceTable.columns.map((column) => column.name),
    );
    const targetColumnNames = new Set(
      targetTable.columns.map((column) => column.name),
    );

    for (const column of relationship.sourceColumns) {
      if (!sourceColumnNames.has(column)) {
        fail(`relationship ${key} references unknown source column ${column}`);
      }
    }
    for (const column of relationship.targetColumns) {
      if (!targetColumnNames.has(column)) {
        fail(`relationship ${key} references unknown target column ${column}`);
      }
    }
  }

  return {
    contract: INVENTORY_CONTRACT,
    name: requireString(rawInventory.name, "inventory.name"),
    scope: requireString(rawInventory.scope, "inventory.scope"),
    engine: optionalString(rawInventory.engine, "inventory.engine"),
    sourceRevision: requireString(
      rawInventory.sourceRevision,
      "inventory.sourceRevision",
    ),
    tables,
    relationships,
  };
}

function toBase62(value) {
  let remaining = value;
  let result = "";

  do {
    result = BASE62[remaining % BASE62.length] + result;
    remaining = Math.floor(remaining / BASE62.length);
  } while (remaining > 0);

  return result;
}

function createIndex(index) {
  return `a${toBase62(index).padStart(6, "0")}`;
}

function stableId(kind, key) {
  const digest = createHash("sha256")
    .update(`${kind}:${key}`)
    .digest("base64url")
    .slice(0, 20);

  return `${kind}-${digest}`;
}

function stablePositiveInteger(key) {
  const value = Number.parseInt(
    createHash("sha256").update(key).digest("hex").slice(0, 8),
    16,
  );

  return (value % 2_147_483_646) + 1;
}

function createElementFactory() {
  let nextIndex = 0;

  return function createBaseElement({
    backgroundColor = "transparent",
    boundElements = null,
    fillStyle = "solid",
    groupIds = [],
    height,
    id,
    opacity = 100,
    roughness = 0,
    roundness = null,
    strokeColor = "#334155",
    strokeStyle = "solid",
    strokeWidth = 1,
    type,
    width,
    x,
    y,
  }) {
    return {
      id,
      type,
      x,
      y,
      width,
      height,
      angle: 0,
      strokeColor,
      backgroundColor,
      fillStyle,
      strokeWidth,
      strokeStyle,
      roughness,
      opacity,
      groupIds,
      frameId: null,
      index: createIndex(nextIndex++),
      roundness,
      seed: stablePositiveInteger(`${id}:seed`),
      version: 1,
      versionNonce: stablePositiveInteger(`${id}:versionNonce`),
      isDeleted: false,
      boundElements,
      updated: 1,
      link: null,
      locked: true,
    };
  };
}

function createTextElement(createBaseElement, {
  color = "#0f172a",
  customData,
  fontFamily = 2,
  fontSize,
  groupIds = [],
  id,
  text,
  textAlign = "left",
  width,
  x,
  y,
}) {
  const lines = text.split("\n");
  const lineHeight = 1.25;

  return {
    ...createBaseElement({
      height: Math.ceil(lines.length * fontSize * lineHeight),
      id,
      type: "text",
      width,
      x,
      y,
      strokeColor: color,
      groupIds,
    }),
    fontSize,
    fontFamily,
    text,
    textAlign,
    verticalAlign: "top",
    containerId: null,
    originalText: text,
    autoResize: true,
    lineHeight,
    ...(customData ? { customData } : {}),
  };
}

function formatColumn(column) {
  const badges = [
    column.primaryKey ? "PK" : null,
    column.foreignKey ? "FK" : null,
    column.unique ? "UQ" : null,
  ].filter(Boolean);
  const badgeText = badges.length > 0 ? `[${badges.join("/")}]` : "[--]";
  const nullable = column.nullable ? "NULL" : "NOT NULL";

  return `${badgeText.padEnd(10)} ${column.name} : ${column.type} · ${nullable}`;
}

function tableScope(qualifiedName) {
  const parts = qualifiedName.split(".");

  return parts.length > 1 ? parts.slice(0, -1).join(".") : "default";
}

function tableDimensions(table) {
  const lines = table.columns.map(formatColumn);
  const longestLine = [table.qualifiedName, ...lines].reduce(
    (maximum, line) => Math.max(maximum, line.length),
    0,
  );

  return {
    width: Math.max(CARD_MIN_WIDTH, Math.ceil(longestLine * 8.8 + 44)),
    height:
      CARD_HEADER_HEIGHT +
      table.columns.length * CARD_ROW_HEIGHT +
      CARD_BOTTOM_PADDING,
    columnText: lines.join("\n"),
  };
}

function layoutTables(tables) {
  const tablesByScope = new Map();

  for (const table of tables) {
    const scopeName = tableScope(table.qualifiedName);
    const scopedTables = tablesByScope.get(scopeName) ?? [];

    scopedTables.push({ table, ...tableDimensions(table) });
    tablesByScope.set(scopeName, scopedTables);
  }

  const tableLayouts = new Map();
  const scopeLayouts = [];
  let groupY = 130;

  for (const [scopeName, scopedTables] of [...tablesByScope.entries()].sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    const columns = Math.min(
      GROUP_COLUMNS_MAX,
      Math.ceil(Math.sqrt(scopedTables.length)),
    );
    const cellWidth = Math.max(...scopedTables.map((table) => table.width));
    const rowCount = Math.ceil(scopedTables.length / columns);
    const rowHeights = Array.from({ length: rowCount }, () => 0);

    scopedTables.forEach((table, index) => {
      const row = Math.floor(index / columns);
      rowHeights[row] = Math.max(rowHeights[row], table.height);
    });

    const groupWidth =
      GROUP_PADDING * 2 +
      columns * cellWidth +
      Math.max(0, columns - 1) * TABLE_GAP_X;
    const groupHeight =
      GROUP_HEADER_HEIGHT +
      GROUP_PADDING * 2 +
      rowHeights.reduce((sum, height) => sum + height, 0) +
      Math.max(0, rowCount - 1) * TABLE_GAP_Y;
    const groupX = 40;
    const rowOffsets = [];
    let currentRowOffset = GROUP_HEADER_HEIGHT + GROUP_PADDING;

    for (const rowHeight of rowHeights) {
      rowOffsets.push(currentRowOffset);
      currentRowOffset += rowHeight + TABLE_GAP_Y;
    }

    scopedTables.forEach((tableLayout, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x =
        groupX +
        GROUP_PADDING +
        column * (cellWidth + TABLE_GAP_X) +
        (cellWidth - tableLayout.width) / 2;
      const y = groupY + rowOffsets[row];

      tableLayouts.set(tableLayout.table.qualifiedName, {
        ...tableLayout,
        x,
        y,
      });
    });

    scopeLayouts.push({
      scopeName,
      tableNames: scopedTables.map(({ table }) => table.qualifiedName),
      x: groupX,
      y: groupY,
      width: groupWidth,
      height: groupHeight,
    });
    groupY += groupHeight + GROUP_GAP;
  }

  return { tableLayouts, scopeLayouts };
}

function rectangleEdgePoint(tableLayout, towardX, towardY, gap = 10) {
  const centerX = tableLayout.x + tableLayout.width / 2;
  const centerY = tableLayout.y + tableLayout.height / 2;
  const dx = towardX - centerX;
  const dy = towardY - centerY;

  if (dx === 0 && dy === 0) {
    return { x: tableLayout.x + tableLayout.width + gap, y: centerY };
  }

  const scale = Math.min(
    (tableLayout.width / 2 + gap) / Math.max(Math.abs(dx), 0.0001),
    (tableLayout.height / 2 + gap) / Math.max(Math.abs(dy), 0.0001),
  );

  return { x: centerX + dx * scale, y: centerY + dy * scale };
}

function relationshipPairKey(relationship) {
  return [relationship.sourceTable, relationship.targetTable].sort().join("|");
}

function relationshipOffsets(relationships) {
  const relationshipsByPair = new Map();

  for (const relationship of relationships) {
    const key = relationshipPairKey(relationship);
    const pairRelationships = relationshipsByPair.get(key) ?? [];

    pairRelationships.push(relationshipKey(relationship));
    relationshipsByPair.set(key, pairRelationships);
  }

  const offsets = new Map();

  for (const relationshipKeys of relationshipsByPair.values()) {
    relationshipKeys.sort();
    relationshipKeys.forEach((key, index) => {
      offsets.set(key, (index - (relationshipKeys.length - 1) / 2) * 34);
    });
  }

  return offsets;
}

function createRelationshipGeometry(
  relationship,
  sourceLayout,
  targetLayout,
  offset,
) {
  if (relationship.sourceTable === relationship.targetTable) {
    const x = sourceLayout.x + sourceLayout.width + 10;
    const y = sourceLayout.y + sourceLayout.height / 2 - 30 + offset;

    return {
      x,
      y,
      width: 100,
      height: 90,
      points: [
        [0, 0],
        [100, 0],
        [100, 90],
        [0, 90],
      ],
      labelX: x + 112,
      labelY: y + 28,
    };
  }

  const sourceCenter = {
    x: sourceLayout.x + sourceLayout.width / 2,
    y: sourceLayout.y + sourceLayout.height / 2,
  };
  const targetCenter = {
    x: targetLayout.x + targetLayout.width / 2,
    y: targetLayout.y + targetLayout.height / 2,
  };
  const source = rectangleEdgePoint(
    sourceLayout,
    targetCenter.x,
    targetCenter.y,
  );
  const target = rectangleEdgePoint(
    targetLayout,
    sourceCenter.x,
    sourceCenter.y,
  );
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const length = Math.max(Math.hypot(dx, dy), 1);
  const perpendicular = { x: (-dy / length) * offset, y: (dx / length) * offset };
  const midpoint = {
    x: dx / 2 + perpendicular.x,
    y: dy / 2 + perpendicular.y,
  };

  return {
    x: source.x,
    y: source.y,
    width: Math.max(Math.abs(dx), Math.abs(midpoint.x)),
    height: Math.max(Math.abs(dy), Math.abs(midpoint.y)),
    points: [
      [0, 0],
      [midpoint.x, midpoint.y],
      [dx, dy],
    ],
    labelX: source.x + midpoint.x + 12,
    labelY: source.y + midpoint.y - 24,
  };
}

function inventorySemantics(inventory) {
  return {
    contract: inventory.contract,
    name: inventory.name,
    scope: inventory.scope,
    engine: inventory.engine,
    sourceRevision: inventory.sourceRevision,
    tables: inventory.tables,
    relationships: inventory.relationships,
  };
}

export function inventoryFingerprint(inventory) {
  return fingerprint(inventorySemantics(inventory));
}

export function assertSceneBudgets(scene) {
  if (!Array.isArray(scene?.elements)) {
    fail("scene.elements must be an array before budget validation");
  }
  if (scene.elements.length > MAXIMUM_ELEMENTS) {
    fail(`scene.elements cannot contain more than ${MAXIMUM_ELEMENTS} elements`);
  }

  const allowedTypes = new Set(ALLOWED_SCENE_ELEMENT_TYPES);

  for (const [index, element] of scene.elements.entries()) {
    if (!allowedTypes.has(element?.type)) {
      fail(
        `scene.elements[${index}].type ${String(element?.type)} is not allowed; ` +
          `expected ${ALLOWED_SCENE_ELEMENT_TYPES.join(", ")}`,
      );
    }
  }

  let serializedScene;

  try {
    serializedScene = JSON.stringify(scene);
  } catch (error) {
    fail(`scene must be JSON serializable: ${error.message}`);
  }
  if (serializedScene === undefined) {
    fail("scene must be JSON serializable");
  }

  const sceneBytes = Buffer.byteLength(serializedScene, "utf8");

  if (sceneBytes > MAXIMUM_SCENE_BYTES) {
    fail(`scene exceeds ${MAXIMUM_SCENE_BYTES} UTF-8 bytes`);
  }

  return { elements: scene.elements.length, bytes: sceneBytes };
}

export function buildScene(rawInventory) {
  const inventory = normalizeInventory(rawInventory);
  const semanticFingerprint = inventoryFingerprint(inventory);
  const createBaseElement = createElementFactory();
  const { tableLayouts, scopeLayouts } = layoutTables(inventory.tables);
  const tableElementIds = new Map(
    inventory.tables.map((table) => [
      table.qualifiedName,
      stableId("table", table.qualifiedName),
    ]),
  );
  const boundElementsByTable = new Map(
    inventory.tables.map((table) => [table.qualifiedName, []]),
  );
  const relationshipLabels = [];
  const elements = [];

  elements.push(
    createTextElement(createBaseElement, {
      id: stableId("meta", `${inventory.scope}:${inventory.sourceRevision}`),
      x: 48,
      y: 36,
      width: 1_200,
      fontSize: META_TEXT_SIZE,
      text: `${inventory.name}\n${inventory.scope} · ${inventory.engine ?? "engine unknown"} · ${inventory.sourceRevision}`,
      customData: {
        contract: SCENE_CONTRACT,
        kind: "erd-metadata",
        name: inventory.name,
        scope: inventory.scope,
        engine: inventory.engine,
        sourceRevision: inventory.sourceRevision,
        inventoryFingerprint: semanticFingerprint,
      },
    }),
  );

  for (const scopeLayout of scopeLayouts) {
    elements.push({
      ...createBaseElement({
        id: stableId("scope", scopeLayout.scopeName),
        type: "rectangle",
        x: scopeLayout.x,
        y: scopeLayout.y,
        width: scopeLayout.width,
        height: scopeLayout.height,
        strokeColor: "#94a3b8",
        strokeStyle: "dashed",
        strokeWidth: 2,
        roundness: { type: 3 },
      }),
      customData: {
        contract: SCENE_CONTRACT,
        kind: "schema-scope",
        scopeName: scopeLayout.scopeName,
        tableNames: scopeLayout.tableNames,
      },
    });
    elements.push(
      createTextElement(createBaseElement, {
        id: stableId("scope-label", scopeLayout.scopeName),
        x: scopeLayout.x + 24,
        y: scopeLayout.y + 16,
        width: scopeLayout.width - 48,
        fontSize: TITLE_TEXT_SIZE,
        color: "#475569",
        text: scopeLayout.scopeName,
      }),
    );
  }

  const offsets = relationshipOffsets(inventory.relationships);

  for (const relationship of inventory.relationships) {
    const key = relationshipKey(relationship);
    const arrowId = stableId("fk", key);
    const sourceLayout = tableLayouts.get(relationship.sourceTable);
    const targetLayout = tableLayouts.get(relationship.targetTable);
    const sourceElementId = tableElementIds.get(relationship.sourceTable);
    const targetElementId = tableElementIds.get(relationship.targetTable);
    const geometry = createRelationshipGeometry(
      relationship,
      sourceLayout,
      targetLayout,
      offsets.get(key) ?? 0,
    );

    boundElementsByTable
      .get(relationship.sourceTable)
      .push({ id: arrowId, type: "arrow" });
    if (relationship.targetTable !== relationship.sourceTable) {
      boundElementsByTable
        .get(relationship.targetTable)
        .push({ id: arrowId, type: "arrow" });
    }

    elements.push({
      ...createBaseElement({
        id: arrowId,
        type: "arrow",
        x: geometry.x,
        y: geometry.y,
        width: geometry.width,
        height: geometry.height,
        strokeColor: "#475569",
        strokeWidth: 2,
        roundness: { type: 2 },
      }),
      points: geometry.points,
      lastCommittedPoint: null,
      startBinding: { elementId: sourceElementId, focus: 0, gap: 10 },
      endBinding: { elementId: targetElementId, focus: 0, gap: 10 },
      startArrowhead: null,
      endArrowhead: "arrow",
      elbowed: false,
      customData: {
        contract: SCENE_CONTRACT,
        kind: "foreign-key",
        ...relationship,
      },
    });

    const labelLines = [
      `${relationship.sourceCardinality} → ${relationship.targetCardinality}`,
      relationship.constraint,
    ];
    const actionParts = [
      relationship.onUpdate ? `U:${relationship.onUpdate}` : null,
      relationship.onDelete ? `D:${relationship.onDelete}` : null,
    ].filter(Boolean);

    if (actionParts.length > 0) {
      labelLines.push(actionParts.join(" · "));
    }
    relationshipLabels.push({
      id: stableId("fk-label", key),
      text: labelLines.join("\n"),
      x: geometry.labelX,
      y: geometry.labelY,
    });
  }

  for (const table of inventory.tables) {
    const layout = tableLayouts.get(table.qualifiedName);
    const tableId = tableElementIds.get(table.qualifiedName);
    const groupId = stableId("group", table.qualifiedName);
    const boundElements = boundElementsByTable.get(table.qualifiedName);

    elements.push({
      ...createBaseElement({
        id: tableId,
        type: "rectangle",
        x: layout.x,
        y: layout.y,
        width: layout.width,
        height: layout.height,
        backgroundColor: "#ffffff",
        strokeColor: "#334155",
        strokeWidth: 2,
        groupIds: [groupId],
        boundElements,
        roundness: { type: 3 },
      }),
      customData: {
        contract: SCENE_CONTRACT,
        kind: "table",
        qualifiedName: table.qualifiedName,
        columns: table.columns,
      },
    });
    elements.push(
      createBaseElement({
        id: stableId("header", table.qualifiedName),
        type: "rectangle",
        x: layout.x,
        y: layout.y,
        width: layout.width,
        height: CARD_HEADER_HEIGHT,
        backgroundColor: "#dbeafe",
        strokeColor: "#334155",
        strokeWidth: 2,
        groupIds: [groupId],
        roundness: { type: 3 },
      }),
    );
    elements.push(
      createTextElement(createBaseElement, {
        id: stableId("title", table.qualifiedName),
        x: layout.x + 18,
        y: layout.y + 12,
        width: layout.width - 36,
        fontSize: TITLE_TEXT_SIZE,
        color: "#1e3a8a",
        groupIds: [groupId],
        text: table.qualifiedName,
      }),
    );
    elements.push(
      createTextElement(createBaseElement, {
        id: stableId("columns", table.qualifiedName),
        x: layout.x + 18,
        y: layout.y + CARD_HEADER_HEIGHT + 11,
        width: layout.width - 36,
        fontSize: CARD_TEXT_SIZE,
        fontFamily: 3,
        color: "#0f172a",
        groupIds: [groupId],
        text: layout.columnText,
      }),
    );
  }

  for (const label of relationshipLabels) {
    elements.push(
      createTextElement(createBaseElement, {
        ...label,
        width: Math.max(180, label.text.split("\n").reduce(
          (maximum, line) => Math.max(maximum, line.length * 8.5),
          0,
        )),
        fontSize: 14,
        color: "#334155",
      }),
    );
  }

  const scene = {
    type: "excalidraw",
    version: 2,
    source: SCENE_SOURCE,
    elements,
    appState: {
      gridSize: null,
      viewBackgroundColor: "#f8fafc",
    },
    files: {},
  };

  assertSceneBudgets(scene);
  return scene;
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
    fail("usage: build-erd-excalidraw.mjs --input <inventory.json> --output <scene.excalidraw> [--force]");
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
  const scene = buildScene(inventory);

  mkdirSync(dirname(options.output), { recursive: true });
  writeFileSync(options.output, `${JSON.stringify(scene, null, 2)}\n`, "utf8");
  process.stdout.write(
    `${JSON.stringify({
      status: "built",
      output: options.output,
      inventoryFingerprint: inventoryFingerprint(inventory),
      tables: inventory.tables.length,
      relationships: inventory.relationships.length,
      elements: scene.elements.length,
    })}\n`,
  );
}

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMainModule) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`build-erd-excalidraw: ${error.message}\n`);
    process.exitCode = 1;
  }
}
