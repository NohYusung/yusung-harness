#!/usr/bin/env node

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  ALLOWED_SCENE_ELEMENT_TYPES,
  MAXIMUM_ELEMENTS,
  MAXIMUM_SCENE_BYTES,
  SCENE_CONTRACT,
  SCENE_SOURCE,
  fingerprint,
  inventoryFingerprint,
  normalizeInventory,
  readJsonFile,
} from "./build-erd-excalidraw.mjs";

const ALLOWED_ELEMENT_TYPES = new Set(ALLOWED_SCENE_ELEMENT_TYPES);
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

  return value;
}

function requireFiniteNumber(value, path, { nonnegative = false } = {}) {
  if (!Number.isFinite(value)) {
    fail(`${path} must be a finite number`);
  }
  if (nonnegative && value < 0) {
    fail(`${path} must be nonnegative`);
  }
}

function semanticRelationship(relationship) {
  return {
    constraint: relationship.constraint,
    sourceTable: relationship.sourceTable,
    sourceColumns: relationship.sourceColumns,
    sourceCardinality: relationship.sourceCardinality,
    targetTable: relationship.targetTable,
    targetColumns: relationship.targetColumns,
    targetCardinality: relationship.targetCardinality,
    onUpdate: relationship.onUpdate ?? null,
    onDelete: relationship.onDelete ?? null,
  };
}

function relationshipKey(relationship) {
  return fingerprint(semanticRelationship(relationship));
}

function validateStringArray(value, path) {
  if (!Array.isArray(value) || value.length === 0) {
    fail(`${path} must contain at least one string`);
  }

  return value.map((item, index) =>
    requireString(item, `${path}[${index}]`),
  );
}

function validateTableSemantic(customData, elementId) {
  const qualifiedName = requireString(
    customData.qualifiedName,
    `table ${elementId}.customData.qualifiedName`,
  );
  if (!Array.isArray(customData.columns) || customData.columns.length === 0) {
    fail(`table ${elementId}.customData.columns must not be empty`);
  }

  const columnNames = new Set();
  const columns = customData.columns.map((column, index) => {
    const path = `table ${elementId}.customData.columns[${index}]`;

    if (!isPlainObject(column)) {
      fail(`${path} must be an object`);
    }
    const name = requireString(column.name, `${path}.name`);
    const type = requireString(column.type, `${path}.type`);

    if (columnNames.has(name)) {
      fail(`table ${elementId} contains duplicate semantic column ${name}`);
    }
    columnNames.add(name);
    for (const flag of ["nullable", "primaryKey", "foreignKey", "unique"]) {
      if (typeof column[flag] !== "boolean") {
        fail(`${path}.${flag} must be a boolean`);
      }
    }
    if (
      column.default !== null &&
      (typeof column.default !== "string" || column.default.length === 0)
    ) {
      fail(`${path}.default must be null or a non-empty string`);
    }

    return {
      name,
      type,
      nullable: column.nullable,
      primaryKey: column.primaryKey,
      foreignKey: column.foreignKey,
      unique: column.unique,
      default: column.default,
    };
  });

  return { qualifiedName, columns };
}

function validateRelationshipSemantic(customData, elementId) {
  const path = `arrow ${elementId}.customData`;
  const relationship = semanticRelationship(customData);

  requireString(relationship.constraint, `${path}.constraint`);
  requireString(relationship.sourceTable, `${path}.sourceTable`);
  relationship.sourceColumns = validateStringArray(
    relationship.sourceColumns,
    `${path}.sourceColumns`,
  );
  requireString(relationship.targetTable, `${path}.targetTable`);
  relationship.targetColumns = validateStringArray(
    relationship.targetColumns,
    `${path}.targetColumns`,
  );
  if (relationship.sourceColumns.length !== relationship.targetColumns.length) {
    fail(`${path} has mismatched composite FK column counts`);
  }
  for (const cardinalityName of [
    "sourceCardinality",
    "targetCardinality",
  ]) {
    if (!CARDINALITIES.has(relationship[cardinalityName])) {
      fail(`${path}.${cardinalityName} is not supported`);
    }
  }
  for (const actionName of ["onUpdate", "onDelete"]) {
    const value = relationship[actionName];

    if (value !== null && (typeof value !== "string" || value.length === 0)) {
      fail(`${path}.${actionName} must be null or a non-empty string`);
    }
  }

  return relationship;
}

function validateRoot(scene) {
  if (!isPlainObject(scene)) {
    fail("scene root must be an object");
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
  if (Buffer.byteLength(serializedScene, "utf8") > MAXIMUM_SCENE_BYTES) {
    fail(`scene exceeds ${MAXIMUM_SCENE_BYTES} UTF-8 bytes`);
  }

  if (scene.type !== "excalidraw") {
    fail('scene.type must equal "excalidraw"');
  }
  if (scene.version !== 2) {
    fail("scene.version must equal 2");
  }
  if (scene.source !== SCENE_SOURCE) {
    fail(`scene.source must equal ${SCENE_SOURCE}`);
  }
  if (!Array.isArray(scene.elements) || scene.elements.length === 0) {
    fail("scene.elements must contain at least one element");
  }
  if (scene.elements.length > MAXIMUM_ELEMENTS) {
    fail(`scene.elements cannot contain more than ${MAXIMUM_ELEMENTS} elements`);
  }
  if (!isPlainObject(scene.appState)) {
    fail("scene.appState must be an object");
  }
  if (!isPlainObject(scene.files) || Object.keys(scene.files).length !== 0) {
    fail("scene.files must be an empty object; ERD scenes cannot embed files");
  }
}

function validateElementShape(element, index) {
  const path = `scene.elements[${index}]`;

  if (!isPlainObject(element)) {
    fail(`${path} must be an object`);
  }
  requireString(element.id, `${path}.id`);
  if (!ALLOWED_ELEMENT_TYPES.has(element.type)) {
    fail(`${path}.type ${String(element.type)} is not allowed`);
  }
  requireFiniteNumber(element.x, `${path}.x`);
  requireFiniteNumber(element.y, `${path}.y`);
  requireFiniteNumber(element.width, `${path}.width`, { nonnegative: true });
  requireFiniteNumber(element.height, `${path}.height`, { nonnegative: true });
  if (element.isDeleted !== false) {
    fail(`${path}.isDeleted must be false`);
  }
  if (element.link !== null) {
    fail(`${path}.link must be null; ERD scenes cannot contain links`);
  }
  if (!Array.isArray(element.groupIds)) {
    fail(`${path}.groupIds must be an array`);
  }

  if (element.type === "text") {
    requireString(element.text, `${path}.text`);
    requireString(element.originalText, `${path}.originalText`);
    requireFiniteNumber(element.fontSize, `${path}.fontSize`, {
      nonnegative: true,
    });
  }

  if (element.type === "arrow") {
    if (!Array.isArray(element.points) || element.points.length < 2) {
      fail(`${path}.points must contain at least two points`);
    }
    element.points.forEach((point, pointIndex) => {
      if (!Array.isArray(point) || point.length !== 2) {
        fail(`${path}.points[${pointIndex}] must be an [x, y] pair`);
      }
      requireFiniteNumber(point[0], `${path}.points[${pointIndex}][0]`);
      requireFiniteNumber(point[1], `${path}.points[${pointIndex}][1]`);
    });
  }
}

function validateReferences(scene) {
  const elementsById = new Map();

  scene.elements.forEach((element, index) => {
    validateElementShape(element, index);
    if (elementsById.has(element.id)) {
      fail(`scene contains duplicate element ID ${element.id}`);
    }
    elementsById.set(element.id, element);
  });

  for (const element of scene.elements) {
    if (element.boundElements !== null && !Array.isArray(element.boundElements)) {
      fail(`element ${element.id}.boundElements must be null or an array`);
    }
    for (const boundElement of element.boundElements ?? []) {
      const referenced = elementsById.get(boundElement.id);

      if (!referenced || referenced.type !== boundElement.type) {
        fail(`element ${element.id} has invalid bound element ${boundElement.id}`);
      }
    }

    if (element.type !== "arrow") {
      continue;
    }

    for (const [bindingName, binding] of [
      ["startBinding", element.startBinding],
      ["endBinding", element.endBinding],
    ]) {
      if (!isPlainObject(binding)) {
        fail(`arrow ${element.id}.${bindingName} must be an object`);
      }
      const referenced = elementsById.get(binding.elementId);

      if (referenced?.customData?.kind !== "table") {
        fail(`arrow ${element.id}.${bindingName} must reference a table element`);
      }
      if (element.customData?.kind === "foreign-key") {
        const expectedTable =
          bindingName === "startBinding"
            ? element.customData.sourceTable
            : element.customData.targetTable;

        if (referenced.customData.qualifiedName !== expectedTable) {
          fail(
            `arrow ${element.id}.${bindingName} does not match its semantic table`,
          );
        }
      }
      const reciprocalBinding = (referenced.boundElements ?? []).some(
        (candidate) =>
          candidate.id === element.id && candidate.type === "arrow",
      );
      if (!reciprocalBinding) {
        fail(
          `table ${referenced.id} does not reciprocally bind arrow ${element.id}`,
        );
      }
    }
  }

  return elementsById;
}

function collectSemantics(scene) {
  const metadata = [];
  const tables = [];
  const relationships = [];
  const scopes = [];

  for (const element of scene.elements) {
    const customData = element.customData;

    if (!isPlainObject(customData)) {
      continue;
    }
    if (customData.contract !== SCENE_CONTRACT) {
      fail(`element ${element.id} has an unsupported customData contract`);
    }

    if (customData.kind === "erd-metadata") {
      requireString(customData.name, `metadata ${element.id}.name`);
      requireString(customData.scope, `metadata ${element.id}.scope`);
      requireString(
        customData.sourceRevision,
        `metadata ${element.id}.sourceRevision`,
      );
      requireString(
        customData.inventoryFingerprint,
        `metadata ${element.id}.inventoryFingerprint`,
      );
      if (!/^[a-f0-9]{64}$/.test(customData.inventoryFingerprint)) {
        fail(`metadata ${element.id}.inventoryFingerprint must be SHA-256 hex`);
      }
      if (
        customData.engine !== null &&
        (typeof customData.engine !== "string" || customData.engine.length === 0)
      ) {
        fail(`metadata ${element.id}.engine must be null or a non-empty string`);
      }
      metadata.push(customData);
    } else if (customData.kind === "table") {
      if (element.type !== "rectangle") {
        fail(`table element ${element.id} must be a rectangle`);
      }
      tables.push(validateTableSemantic(customData, element.id));
    } else if (customData.kind === "foreign-key") {
      if (element.type !== "arrow") {
        fail(`foreign-key element ${element.id} must be an arrow`);
      }
      relationships.push(validateRelationshipSemantic(customData, element.id));
    } else if (customData.kind === "schema-scope") {
      scopes.push({
        scopeName: requireString(
          customData.scopeName,
          `scope ${element.id}.scopeName`,
        ),
        tableNames: validateStringArray(
          customData.tableNames,
          `scope ${element.id}.tableNames`,
        ),
      });
    } else {
      fail(`element ${element.id} has unknown customData kind ${customData.kind}`);
    }
  }

  if (metadata.length !== 1) {
    fail("scene must contain exactly one erd-metadata element");
  }
  if (tables.length === 0) {
    fail("scene must contain at least one table element");
  }

  const tableNames = tables.map((table) => requireString(
    table.qualifiedName,
    "table.customData.qualifiedName",
  ));
  if (new Set(tableNames).size !== tableNames.length) {
    fail("scene contains duplicate table semantic elements");
  }
  const tablesByName = new Map(
    tables.map((table) => [table.qualifiedName, table]),
  );
  for (const relationship of relationships) {
    const sourceTable = tablesByName.get(relationship.sourceTable);
    const targetTable = tablesByName.get(relationship.targetTable);

    if (!sourceTable || !targetTable) {
      fail(
        `relationship ${relationship.constraint} references an unknown semantic table`,
      );
    }
    const sourceColumnNames = new Set(
      sourceTable.columns.map((column) => column.name),
    );
    const targetColumnNames = new Set(
      targetTable.columns.map((column) => column.name),
    );
    if (
      relationship.sourceColumns.some((column) => !sourceColumnNames.has(column)) ||
      relationship.targetColumns.some((column) => !targetColumnNames.has(column))
    ) {
      fail(
        `relationship ${relationship.constraint} references an unknown semantic column`,
      );
    }
  }
  const relationshipKeys = relationships.map(relationshipKey);
  if (new Set(relationshipKeys).size !== relationshipKeys.length) {
    fail("scene contains duplicate relationship semantic elements");
  }
  const scopeNames = scopes.map((scope) => scope.scopeName);
  if (new Set(scopeNames).size !== scopeNames.length) {
    fail("scene contains duplicate schema scope elements");
  }

  return { metadata: metadata[0], relationships, scopes, tables };
}

function validateAgainstInventory(semantics, rawInventory) {
  const inventory = normalizeInventory(rawInventory);
  const metadata = semantics.metadata;

  if (metadata.scope !== inventory.scope) {
    fail("scene metadata scope does not match inventory");
  }
  if (metadata.sourceRevision !== inventory.sourceRevision) {
    fail("scene metadata sourceRevision does not match inventory");
  }
  if (metadata.name !== inventory.name) {
    fail("scene metadata name does not match inventory");
  }
  if (metadata.engine !== inventory.engine) {
    fail("scene metadata engine does not match inventory");
  }
  if (metadata.inventoryFingerprint !== inventoryFingerprint(inventory)) {
    fail("scene metadata inventoryFingerprint does not match inventory");
  }

  const expectedTables = new Map(
    inventory.tables.map((table) => [table.qualifiedName, fingerprint(table)]),
  );
  const actualTables = new Map(
    semantics.tables.map((table) => [table.qualifiedName, fingerprint(table)]),
  );

  if (expectedTables.size !== actualTables.size) {
    fail("scene table count does not match inventory");
  }
  for (const [qualifiedName, tableFingerprint] of expectedTables) {
    if (actualTables.get(qualifiedName) !== tableFingerprint) {
      fail(`scene table ${qualifiedName} does not match inventory`);
    }
  }

  const expectedRelationships = inventory.relationships.map(relationshipKey).sort();
  const actualRelationships = semantics.relationships
    .map(relationshipKey)
    .sort();

  if (fingerprint(expectedRelationships) !== fingerprint(actualRelationships)) {
    fail("scene relationship set does not match inventory");
  }

  const expectedScopes = new Map();
  for (const table of inventory.tables) {
    const parts = table.qualifiedName.split(".");
    const scopeName =
      parts.length > 1 ? parts.slice(0, -1).join(".") : "default";
    const tableNames = expectedScopes.get(scopeName) ?? [];

    tableNames.push(table.qualifiedName);
    expectedScopes.set(scopeName, tableNames);
  }
  const actualScopes = new Map(
    semantics.scopes.map((scope) => [
      scope.scopeName,
      [...scope.tableNames].sort(),
    ]),
  );
  if (actualScopes.size !== expectedScopes.size) {
    fail("scene schema scope count does not match inventory");
  }
  for (const [scopeName, tableNames] of expectedScopes) {
    if (
      fingerprint([...tableNames].sort()) !==
      fingerprint(actualScopes.get(scopeName) ?? [])
    ) {
      fail(`scene schema scope ${scopeName} does not match inventory`);
    }
  }

  return inventory;
}

export function validateScene(scene, rawInventory = null) {
  validateRoot(scene);
  validateReferences(scene);
  const semantics = collectSemantics(scene);
  const inventory = rawInventory
    ? validateAgainstInventory(semantics, rawInventory)
    : null;

  return {
    tables: semantics.tables.length,
    relationships: semantics.relationships.length,
    scopes: semantics.scopes.length,
    elements: scene.elements.length,
    inventoryFingerprint: inventory
      ? inventoryFingerprint(inventory)
      : requireString(
          semantics.metadata.inventoryFingerprint,
          "metadata.inventoryFingerprint",
        ),
  };
}

function parseArguments(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--scene" || argument === "--inventory") {
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

  if (!options.scene) {
    fail("usage: validate-erd-excalidraw.mjs --scene <scene.excalidraw> [--inventory <inventory.json>]");
  }

  return options;
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const scene = readJsonFile(options.scene);
  const rawInventory = options.inventory
    ? readJsonFile(options.inventory)
    : null;
  const result = validateScene(scene, rawInventory);

  process.stdout.write(
    `${JSON.stringify({ status: "valid", scene: options.scene, ...result })}\n`,
  );
}

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMainModule) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`validate-erd-excalidraw: ${error.message}\n`);
    process.exitCode = 1;
  }
}
