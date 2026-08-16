const maximumSceneBytes = 5 * 1024 * 1024;
const maximumElements = 5_000;
const maximumCoordinate = 1_000_000;
const allowedElementTypes = new Set(["rectangle", "text", "arrow"]);
const cardinalities = new Set(["1", "0..1", "N", "1..N", "0..N"]);
const contract = "ERDExcalidraw/1.0";

const fail = (message) => {
  throw new TypeError(`Invalid ERD Excalidraw scene: ${message}`);
};

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const requireNonEmptyString = (
  value,
  path,
  { maximum = Number.POSITIVE_INFINITY } = {},
) => {
  if (typeof value !== "string") {
    fail(`${path} must be a non-empty string`);
  }

  const normalized = value.trim();

  if (!normalized || normalized.length > maximum) {
    fail(`${path} must be a non-empty string no longer than ${maximum} characters`);
  }

  return normalized;
};

/** 표시 문자열은 원문을 보존하되 whitespace-only와 raw 길이 초과를 거부한다. */
const requireDisplayString = (value, path) => {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 50_000
  ) {
    fail(`${path} must contain non-whitespace text within 50000 characters`);
  }

  return value;
};

const requireFiniteCoordinate = (value, path, { nonnegative = false } = {}) => {
  if (
    !Number.isFinite(value) ||
    Math.abs(value) > maximumCoordinate ||
    (nonnegative && value < 0)
  ) {
    fail(`${path} must be a finite in-range${nonnegative ? " nonnegative" : ""} number`);
  }
};

const requireStringArray = (
  value,
  path,
  { maximum = 64, itemMaximum = 255 } = {},
) => {
  if (!Array.isArray(value) || value.length === 0 || value.length > maximum) {
    fail(`${path} must contain between 1 and ${maximum} strings`);
  }

  return value.map((item, index) =>
    requireNonEmptyString(item, `${path}[${index}]`, {
      maximum: itemMaximum,
    }),
  );
};

const relationshipKey = (relationship) =>
  JSON.stringify({
    constraint: relationship.constraint,
    sourceTable: relationship.sourceTable,
    sourceColumns: relationship.sourceColumns,
    sourceCardinality: relationship.sourceCardinality,
    targetTable: relationship.targetTable,
    targetColumns: relationship.targetColumns,
    targetCardinality: relationship.targetCardinality,
    onUpdate: relationship.onUpdate,
    onDelete: relationship.onDelete,
  });

/** backfill이 기존 scene의 최신 ERDExcalidraw/1.0 적합성을 독립적으로 판정한다. */
const validateErdExcalidrawScene = (scene) => {
  if (!isObject(scene)) fail("root must be an object");

  let serialized;

  try {
    serialized = JSON.stringify(scene);
  } catch (error) {
    throw new TypeError("Invalid ERD Excalidraw scene: root is not serializable", {
      cause: error,
    });
  }

  if (!serialized || Buffer.byteLength(serialized, "utf8") > maximumSceneBytes) {
    fail(`root exceeds ${maximumSceneBytes} UTF-8 bytes`);
  }
  const rootKeys = Object.keys(scene).sort();
  const expectedRootKeys = [
    "appState",
    "elements",
    "files",
    "source",
    "type",
    "version",
  ];

  if (JSON.stringify(rootKeys) !== JSON.stringify(expectedRootKeys)) {
    fail("root contains unsupported fields");
  }
  if (scene.type !== "excalidraw" || scene.version !== 2) {
    fail("type/version must equal excalidraw/2");
  }
  if (scene.source !== "yusung-harness:erd") {
    fail("source must equal yusung-harness:erd");
  }
  if (!isObject(scene.appState)) fail("appState must be an object");
  if (!isObject(scene.files) || Object.keys(scene.files).length !== 0) {
    fail("files must be an empty object");
  }
  if (
    !Array.isArray(scene.elements) ||
    scene.elements.length === 0 ||
    scene.elements.length > maximumElements
  ) {
    fail(`elements must contain between 1 and ${maximumElements} items`);
  }

  const elementsById = new Map();
  const normalizedElementIdByElement = new Map();
  const tablesByName = new Map();
  const relationshipsByElement = new Map();
  const relationshipKeys = new Set();
  const scopeNames = new Set();
  const scopeTablesByElement = new Map();
  let metadataCount = 0;

  for (const [index, element] of scene.elements.entries()) {
    const path = `elements[${index}]`;

    if (!isObject(element)) fail(`${path} must be an object`);
    const id = requireNonEmptyString(element.id, `${path}.id`, {
      maximum: 255,
    });

    if (elementsById.has(id)) {
      fail(`${path}.id must be unique and no longer than 255 characters`);
    }
    elementsById.set(id, element);
    normalizedElementIdByElement.set(element, id);
    if (!allowedElementTypes.has(element.type)) {
      fail(`${path}.type is not allowed`);
    }
    requireFiniteCoordinate(element.x, `${path}.x`);
    requireFiniteCoordinate(element.y, `${path}.y`);
    requireFiniteCoordinate(element.width, `${path}.width`, {
      nonnegative: true,
    });
    requireFiniteCoordinate(element.height, `${path}.height`, {
      nonnegative: true,
    });
    if (element.angle !== undefined && !Number.isFinite(element.angle)) {
      fail(`${path}.angle must be finite`);
    }
    if (element.isDeleted !== false) fail(`${path}.isDeleted must be false`);
    if (element.link !== null) fail(`${path}.link must be null`);
    if (!Array.isArray(element.groupIds)) fail(`${path}.groupIds must be an array`);
    element.groupIds.forEach((groupId, groupIndex) => {
      if (typeof groupId !== "string") {
        fail(`${path}.groupIds[${groupIndex}] must be a string`);
      }
    });
    if (
      element.boundElements !== null &&
      !Array.isArray(element.boundElements)
    ) {
      fail(`${path}.boundElements must be null or an array`);
    }
    if ((element.boundElements?.length ?? 0) > maximumElements) {
      fail(`${path}.boundElements exceeds ${maximumElements}`);
    }

    if (element.text !== undefined) {
      requireDisplayString(element.text, `${path}.text`);
    }
    if (element.originalText !== undefined) {
      requireDisplayString(element.originalText, `${path}.originalText`);
    }
    if (
      element.fontSize !== undefined &&
      (!Number.isFinite(element.fontSize) || element.fontSize < 0)
    ) {
      fail(`${path}.fontSize must be finite and nonnegative`);
    }
    if (element.type === "text") {
      if (
        element.text === undefined ||
        element.originalText === undefined ||
        element.fontSize === undefined
      ) {
        fail(`${path} text elements require text, originalText and fontSize`);
      }
    }

    if (element.points !== undefined) {
      if (
        !Array.isArray(element.points) ||
        element.points.length < 2 ||
        element.points.length > 10_000
      ) {
        fail(`${path}.points must contain between 2 and 10000 points`);
      }
      for (const [pointIndex, point] of element.points.entries()) {
        if (!Array.isArray(point) || point.length !== 2) {
          fail(`${path}.points[${pointIndex}] must be an [x, y] pair`);
        }
        requireFiniteCoordinate(point[0], `${path}.points[${pointIndex}][0]`);
        requireFiniteCoordinate(point[1], `${path}.points[${pointIndex}][1]`);
      }
    }
    if (element.type === "arrow" && element.points === undefined) {
      fail(`${path}.points must contain between 2 and 10000 points`);
    }

    for (const bindingName of ["startBinding", "endBinding"]) {
      const binding = element[bindingName];

      if (binding !== undefined && binding !== null) {
        if (!isObject(binding)) fail(`${path}.${bindingName} must be an object`);
        requireNonEmptyString(
          binding.elementId,
          `${path}.${bindingName}.elementId`,
          { maximum: 255 },
        );
      }
    }

    if (element.customData === undefined) continue;
    if (!isObject(element.customData) || element.customData.contract !== contract) {
      fail(`${path}.customData must use ${contract}`);
    }

    const customData = element.customData;

    if (customData.kind === "erd-metadata") {
      if (element.type !== "text") fail(`${path} metadata must be text`);
      metadataCount += 1;
      requireNonEmptyString(customData.name, `${path}.customData.name`, {
        maximum: 512,
      });
      requireNonEmptyString(customData.scope, `${path}.customData.scope`, {
        maximum: 512,
      });
      requireNonEmptyString(
        customData.sourceRevision,
        `${path}.customData.sourceRevision`,
        { maximum: 512 },
      );
      if (
        customData.engine !== null &&
        (typeof customData.engine !== "string" ||
          !customData.engine.trim() ||
          customData.engine.trim().length > 512)
      ) {
        fail(`${path}.customData.engine must be null or a non-empty string`);
      }
      if (!/^[a-f0-9]{64}$/u.test(customData.inventoryFingerprint)) {
        fail(`${path}.customData.inventoryFingerprint must be SHA-256 hex`);
      }
      continue;
    }

    if (customData.kind === "table") {
      if (element.type !== "rectangle") fail(`${path} table must be rectangle`);
      const qualifiedName = requireNonEmptyString(
        customData.qualifiedName,
        `${path}.customData.qualifiedName`,
        { maximum: 512 },
      );
      if (tablesByName.has(qualifiedName)) {
        fail(`${path} duplicates table ${qualifiedName}`);
      }
      if (
        !Array.isArray(customData.columns) ||
        customData.columns.length === 0 ||
        customData.columns.length > 2_000
      ) {
        fail(`${path}.customData.columns must contain between 1 and 2000 items`);
      }
      const columnNames = new Set();

      for (const [columnIndex, column] of customData.columns.entries()) {
        const columnPath = `${path}.customData.columns[${columnIndex}]`;

        if (!isObject(column)) fail(`${columnPath} must be an object`);
        if (
          JSON.stringify(Object.keys(column).sort()) !==
          JSON.stringify([
            "default",
            "foreignKey",
            "name",
            "nullable",
            "primaryKey",
            "type",
            "unique",
          ])
        ) {
          fail(`${columnPath} contains unsupported or missing fields`);
        }
        const columnName = requireNonEmptyString(column.name, `${columnPath}.name`, {
          maximum: 255,
        });
        requireNonEmptyString(column.type, `${columnPath}.type`, {
          maximum: 255,
        });
        if (columnNames.has(columnName)) {
          fail(`${columnPath} duplicates column ${qualifiedName}.${columnName}`);
        }
        columnNames.add(columnName);
        for (const flag of ["nullable", "primaryKey", "foreignKey", "unique"]) {
          if (typeof column[flag] !== "boolean") {
            fail(`${columnPath}.${flag} must be boolean`);
          }
        }
        if (
          column.default !== null &&
          (typeof column.default !== "string" || !column.default.trim())
        ) {
          fail(`${columnPath}.default must be null or a non-empty string`);
        }
      }
      tablesByName.set(qualifiedName, { element, columnNames });
      continue;
    }

    if (customData.kind === "foreign-key") {
      if (element.type !== "arrow") fail(`${path} foreign-key must be arrow`);
      const relationship = {
        constraint: requireNonEmptyString(
          customData.constraint,
          `${path}.customData.constraint`,
          { maximum: 512 },
        ),
        sourceTable: requireNonEmptyString(
          customData.sourceTable,
          `${path}.customData.sourceTable`,
          { maximum: 512 },
        ),
        sourceColumns: requireStringArray(
          customData.sourceColumns,
          `${path}.customData.sourceColumns`,
        ),
        sourceCardinality: customData.sourceCardinality,
        targetTable: requireNonEmptyString(
          customData.targetTable,
          `${path}.customData.targetTable`,
          { maximum: 512 },
        ),
        targetColumns: requireStringArray(
          customData.targetColumns,
          `${path}.customData.targetColumns`,
        ),
        targetCardinality: customData.targetCardinality,
        onUpdate:
          customData.onUpdate === null
            ? null
            : requireNonEmptyString(
                customData.onUpdate,
                `${path}.customData.onUpdate`,
              ),
        onDelete:
          customData.onDelete === null
            ? null
            : requireNonEmptyString(
                customData.onDelete,
                `${path}.customData.onDelete`,
              ),
      };

      if (relationship.sourceColumns.length !== relationship.targetColumns.length) {
        fail(`${path}.customData has mismatched FK column counts`);
      }
      for (const cardinalityName of ["sourceCardinality", "targetCardinality"]) {
        if (!cardinalities.has(relationship[cardinalityName])) {
          fail(`${path}.customData.${cardinalityName} is not supported`);
        }
      }
      const key = relationshipKey(relationship);

      if (relationshipKeys.has(key)) fail(`${path} duplicates FK semantics`);
      relationshipKeys.add(key);
      relationshipsByElement.set(element, relationship);
      continue;
    }

    if (customData.kind === "schema-scope") {
      if (element.type !== "rectangle") fail(`${path} scope must be rectangle`);
      const scopeName = requireNonEmptyString(
        customData.scopeName,
        `${path}.customData.scopeName`,
        { maximum: 512 },
      );
      const tableNames = requireStringArray(customData.tableNames, `${path}.customData.tableNames`, {
        maximum: maximumElements,
        itemMaximum: 512,
      });
      if (scopeNames.has(scopeName)) fail(`${path} duplicates scope ${scopeName}`);
      scopeNames.add(scopeName);
      scopeTablesByElement.set(element, tableNames);
      continue;
    }

    fail(`${path}.customData.kind is not supported`);
  }

  if (metadataCount !== 1) fail("scene must contain exactly one metadata text");
  if (tablesByName.size === 0) fail("scene must contain at least one table");

  for (const [index, element] of scene.elements.entries()) {
    const path = `elements[${index}]`;
    const elementId = normalizedElementIdByElement.get(element);

    for (const [boundIndex, boundElement] of (
      element.boundElements ?? []
    ).entries()) {
      const boundElementId = isObject(boundElement)
        ? requireNonEmptyString(
            boundElement.id,
            `${path}.boundElements[${boundIndex}].id`,
            { maximum: 255 },
          )
        : null;

      if (
        !isObject(boundElement) ||
        boundElement.type !== "arrow" ||
        elementsById.get(boundElementId)?.type !== "arrow"
      ) {
        fail(`${path}.boundElements[${boundIndex}] is invalid`);
      }
    }

    if (element.type === "arrow") {
      for (const [bindingName, semanticTableField] of [
        ["startBinding", "sourceTable"],
        ["endBinding", "targetTable"],
      ]) {
        const binding = element[bindingName];

        if (!isObject(binding)) fail(`${path}.${bindingName} must be an object`);
        const bindingElementId = requireNonEmptyString(
          binding.elementId,
          `${path}.${bindingName}.elementId`,
          { maximum: 255 },
        );
        const tableElement = elementsById.get(bindingElementId);
        const relationship = relationshipsByElement.get(element);

        if (tableElement?.customData?.kind !== "table") {
          fail(`${path}.${bindingName} must reference a table`);
        }
        if (
          relationship &&
          requireNonEmptyString(
            tableElement.customData.qualifiedName,
            `${path}.${bindingName}.qualifiedName`,
            { maximum: 512 },
          ) !== relationship[semanticTableField]
        ) {
          fail(`${path}.${bindingName} does not match FK semantics`);
        }
        if (
          !(tableElement.boundElements ?? []).some(
            (candidate) =>
              isObject(candidate) &&
              typeof candidate.id === "string" &&
              candidate.id.trim() === elementId &&
              candidate.type === "arrow",
          )
        ) {
          fail(`${path}.${bindingName} lacks reciprocal table binding`);
        }
      }
    } else {
      for (const bindingName of ["startBinding", "endBinding"]) {
        if (element[bindingName] !== undefined && element[bindingName] !== null) {
          fail(`${path}.${bindingName} is only valid on arrow elements`);
        }
      }
    }

    const relationship = relationshipsByElement.get(element);

    if (relationship) {
      for (const [tableField, columnsField] of [
        ["sourceTable", "sourceColumns"],
        ["targetTable", "targetColumns"],
      ]) {
        const table = tablesByName.get(relationship[tableField]);

        if (!table) fail(`${path}.${tableField} references an unknown table`);
        for (const columnName of relationship[columnsField]) {
          if (!table.columnNames.has(columnName)) {
            fail(`${path}.${columnsField} references an unknown column`);
          }
        }
      }
    }

    const scopeTables = scopeTablesByElement.get(element);

    if (scopeTables) {
      for (const tableName of scopeTables) {
        if (!tablesByName.has(tableName)) {
          fail(`${path}.customData.tableNames references an unknown table`);
        }
      }
    }
  }

  return scene;
};

module.exports = { validateErdExcalidrawScene };
