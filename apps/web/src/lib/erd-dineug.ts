import { z } from "zod";

export const dineugSchemaUrl =
  "https://raw.githubusercontent.com/dineug/erd-editor/main/json-schema/schema.json";

const maximumDocumentBytes = 5 * 1024 * 1024;
const maximumEntityCount = 5_000;
const maximumTextLength = 50_000;
const dangerousObjectKeys = new Set(["__proto__", "constructor", "prototype"]);

const identifierSchema = z.string().min(1).max(512);
const entityIdSchema = z
  .string()
  .regex(/^(?:table|column|relationship|index|index-column|memo)-[0-9a-f]{20}$/);
const textSchema = z.string().max(maximumTextLength);
const finiteNumberSchema = z.number().finite();
const entityMetaSchema = z
  .object({
    createAt: z.literal(0),
    updateAt: z.literal(0),
  })
  .strict();

const tableSchema = z
  .object({
    id: entityIdSchema,
    name: identifierSchema,
    comment: textSchema,
    columnIds: z.array(entityIdSchema).min(1),
    seqColumnIds: z.array(entityIdSchema).min(1),
    ui: z
      .object({
        x: finiteNumberSchema,
        y: finiteNumberSchema,
        zIndex: finiteNumberSchema,
        widthName: finiteNumberSchema.nonnegative(),
        widthComment: finiteNumberSchema.nonnegative(),
        color: z.string().regex(/^#[0-9a-f]{6}$/i),
      })
      .strict(),
    meta: entityMetaSchema,
  })
  .strict();

const columnSchema = z
  .object({
    id: entityIdSchema,
    tableId: entityIdSchema,
    name: identifierSchema,
    comment: textSchema,
    dataType: identifierSchema,
    default: textSchema,
    options: z.number().int().min(0).max(15),
    ui: z
      .object({
        keys: z.number().int().min(0).max(3),
        widthName: finiteNumberSchema.nonnegative(),
        widthComment: finiteNumberSchema.nonnegative(),
        widthDataType: finiteNumberSchema.nonnegative(),
        widthDefault: finiteNumberSchema.nonnegative(),
      })
      .strict(),
    meta: entityMetaSchema,
  })
  .strict();

const relationshipPointSchema = z
  .object({
    tableId: entityIdSchema,
    columnIds: z.array(entityIdSchema).min(1),
    x: finiteNumberSchema,
    y: finiteNumberSchema,
    direction: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(4),
      z.literal(8),
    ]),
  })
  .strict();

const relationshipSchema = z
  .object({
    id: entityIdSchema,
    identification: z.boolean(),
    relationshipType: z.union([
      z.literal(2),
      z.literal(4),
      z.literal(8),
      z.literal(16),
    ]),
    startRelationshipType: z.union([z.literal(1), z.literal(2)]),
    start: relationshipPointSchema,
    end: relationshipPointSchema,
    meta: entityMetaSchema,
  })
  .strict();

const indexSchema = z
  .object({
    id: entityIdSchema,
    name: identifierSchema,
    tableId: entityIdSchema,
    indexColumnIds: z.array(entityIdSchema).min(1),
    seqIndexColumnIds: z.array(entityIdSchema).min(1),
    unique: z.literal(true),
    meta: entityMetaSchema,
  })
  .strict();

const indexColumnSchema = z
  .object({
    id: entityIdSchema,
    indexId: entityIdSchema,
    columnId: entityIdSchema,
    orderType: z.union([z.literal(1), z.literal(2)]),
    meta: entityMetaSchema,
  })
  .strict();

const emptyMemoEntitiesSchema = z.record(z.string(), z.never());

function hasDangerousObjectKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasDangerousObjectKey);
  if (typeof value !== "object" || value === null) return false;

  return Object.keys(value).some(
    (key) =>
      dangerousObjectKeys.has(key) ||
      hasDangerousObjectKey((value as Record<string, unknown>)[key]),
  );
}

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

function compareStableText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sameOrderedValues(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function sameValueSet<T>(left: readonly T[], right: readonly T[]) {
  return (
    left.length === right.length &&
    left.every((value) => right.includes(value))
  );
}

function relationshipCoreKey({
  sourceColumns,
  sourceTable,
  targetColumns,
  targetTable,
}: {
  sourceColumns: readonly string[];
  sourceTable: string;
  targetColumns: readonly string[];
  targetTable: string;
}) {
  return [
    sourceTable,
    sourceColumns.join(","),
    targetTable,
    targetColumns.join(","),
  ].join("|");
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function addIssue(
  context: z.RefinementCtx,
  message: string,
  path: PropertyKey[] = [],
) {
  context.addIssue({ code: "custom", message, path });
}

export const dineugErdDocumentSchema = z
  .object({
    $schema: z.literal(dineugSchemaUrl),
    version: z.literal("3.0.0"),
    settings: z
      .object({
        width: finiteNumberSchema.min(2_000).max(20_000),
        height: finiteNumberSchema.min(2_000).max(20_000),
        scrollTop: finiteNumberSchema,
        scrollLeft: finiteNumberSchema,
        zoomLevel: finiteNumberSchema.min(0.1).max(1),
        show: z.number().int().min(0).max(511),
        database: z.union([
          z.literal(1),
          z.literal(2),
          z.literal(4),
          z.literal(8),
          z.literal(16),
          z.literal(32),
        ]),
        databaseName: z.string().min(1).max(512),
        canvasType: z.literal("ERD"),
        language: z.union([
          z.literal(1),
          z.literal(2),
          z.literal(4),
          z.literal(8),
          z.literal(16),
          z.literal(32),
          z.literal(64),
        ]),
        tableNameCase: z.union([
          z.literal(1),
          z.literal(2),
          z.literal(4),
          z.literal(8),
        ]),
        columnNameCase: z.union([
          z.literal(1),
          z.literal(2),
          z.literal(4),
          z.literal(8),
        ]),
        bracketType: z.union([
          z.literal(1),
          z.literal(2),
          z.literal(4),
          z.literal(8),
        ]),
        relationshipDataTypeSync: z.boolean(),
        relationshipOptimization: z.boolean(),
        columnOrder: z
          .tuple([
            z.number().int(),
            z.number().int(),
            z.number().int(),
            z.number().int(),
            z.number().int(),
            z.number().int(),
            z.number().int(),
          ])
          .refine(
            (values) =>
              sameValueSet(values, [1, 2, 4, 8, 16, 32, 64]),
            "Dineug columnOrder must contain every supported column field once",
          ),
        maxWidthComment: z.number().int(),
        ignoreSaveSettings: z.number().int().min(0).max(3),
      })
      .strict(),
    doc: z
      .object({
        tableIds: z.array(entityIdSchema).min(1),
        relationshipIds: z.array(entityIdSchema),
        indexIds: z.array(entityIdSchema),
        memoIds: z.array(entityIdSchema).length(0),
      })
      .strict(),
    collections: z
      .object({
        tableEntities: z.record(z.string(), tableSchema),
        tableColumnEntities: z.record(z.string(), columnSchema),
        relationshipEntities: z.record(z.string(), relationshipSchema),
        indexEntities: z.record(z.string(), indexSchema),
        indexColumnEntities: z.record(z.string(), indexColumnSchema),
        memoEntities: emptyMemoEntitiesSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((document, context) => {
    const { collections, doc } = document;
    const entityCollections = [
      collections.tableEntities,
      collections.tableColumnEntities,
      collections.relationshipEntities,
      collections.indexEntities,
      collections.indexColumnEntities,
      collections.memoEntities,
    ] as const;
    const entityCount = entityCollections.reduce(
      (count, entities) => count + Object.keys(entities).length,
      0,
    );

    if (entityCount > maximumEntityCount) {
      addIssue(context, "Dineug ERD exceeds the entity count limit", [
        "collections",
      ]);
    }

    const allIds = new Set<string>();
    for (const [collectionIndex, entities] of entityCollections.entries()) {
      for (const [key, entity] of Object.entries(entities)) {
        if (key !== entity.id) {
          addIssue(context, `Dineug entity key does not match id: ${key}`, [
            "collections",
            collectionIndex,
            key,
          ]);
        }
        if (allIds.has(entity.id)) {
          addIssue(context, `Duplicate Dineug entity id: ${entity.id}`, [
            "collections",
            collectionIndex,
            key,
          ]);
        }
        allIds.add(entity.id);
      }
    }

    const collectionLists = [
      ["tableIds", doc.tableIds, Object.keys(collections.tableEntities)],
      [
        "relationshipIds",
        doc.relationshipIds,
        Object.keys(collections.relationshipEntities),
      ],
      ["indexIds", doc.indexIds, Object.keys(collections.indexEntities)],
      ["memoIds", doc.memoIds, Object.keys(collections.memoEntities)],
    ] as const;

    for (const [name, ids, collectionIds] of collectionLists) {
      if (hasDuplicates(ids) || !sameValueSet(ids, collectionIds)) {
        addIssue(context, `doc.${name} does not match its collection`, [
          "doc",
          name,
        ]);
      }
    }

    const columnIdsByTable = new Map<string, string[]>();
    for (const column of Object.values(collections.tableColumnEntities)) {
      if (!collections.tableEntities[column.tableId]) {
        addIssue(context, `Column references unknown table: ${column.tableId}`);
        continue;
      }
      const columnIds = columnIdsByTable.get(column.tableId) ?? [];
      columnIds.push(column.id);
      columnIdsByTable.set(column.tableId, columnIds);

      const primaryKeyOption = (column.options & 2) === 2;
      const primaryKeyUi = (column.ui.keys & 1) === 1;
      if (primaryKeyOption !== primaryKeyUi) {
        addIssue(context, `Column PK option and UI key disagree: ${column.id}`);
      }
    }

    for (const table of Object.values(collections.tableEntities)) {
      const ownedColumnIds = columnIdsByTable.get(table.id) ?? [];
      if (
        hasDuplicates(table.columnIds) ||
        !sameValueSet(table.columnIds, ownedColumnIds) ||
        !sameOrderedValues(table.columnIds, table.seqColumnIds)
      ) {
        addIssue(context, `Table column references are inconsistent: ${table.id}`);
      }
    }
    const expectedTableIds = Object.values(collections.tableEntities)
      .toSorted((left, right) => compareStableText(left.name, right.name))
      .map(({ id }) => id);
    if (!sameOrderedValues(doc.tableIds, expectedTableIds)) {
      addIssue(context, "Dineug tables must use canonical name order");
    }

    const indexColumnIdsByIndex = new Map<string, string[]>();
    const singleColumnUniqueIds = new Set<string>();
    for (const indexColumn of Object.values(collections.indexColumnEntities)) {
      const index = collections.indexEntities[indexColumn.indexId];
      const column = collections.tableColumnEntities[indexColumn.columnId];
      if (!index || !column || column.tableId !== index.tableId) {
        addIssue(context, `Index column endpoint is invalid: ${indexColumn.id}`);
        continue;
      }
      const ids = indexColumnIdsByIndex.get(index.id) ?? [];
      ids.push(indexColumn.id);
      indexColumnIdsByIndex.set(index.id, ids);
    }

    for (const index of Object.values(collections.indexEntities)) {
      if (!collections.tableEntities[index.tableId]) {
        addIssue(context, `Index references unknown table: ${index.tableId}`);
      }
      const ownedIds = indexColumnIdsByIndex.get(index.id) ?? [];
      if (
        hasDuplicates(index.indexColumnIds) ||
        !sameValueSet(index.indexColumnIds, ownedIds) ||
        !sameOrderedValues(index.indexColumnIds, index.seqIndexColumnIds)
      ) {
        addIssue(context, `Index column references are inconsistent: ${index.id}`);
      }
      if (index.indexColumnIds.length === 1) {
        const indexColumn =
          collections.indexColumnEntities[index.indexColumnIds[0] ?? ""];
        if (indexColumn) singleColumnUniqueIds.add(indexColumn.columnId);
      }
    }
    for (const column of Object.values(collections.tableColumnEntities)) {
      if (((column.options & 4) === 4) !== singleColumnUniqueIds.has(column.id)) {
        addIssue(context, `Column unique option is inconsistent: ${column.id}`);
      }
    }
    const expectedIndexIds = Object.values(collections.indexEntities)
      .toSorted((left, right) => {
        const leftTable = collections.tableEntities[left.tableId];
        const rightTable = collections.tableEntities[right.tableId];
        const tableOrder = compareStableText(
          leftTable?.name ?? "",
          rightTable?.name ?? "",
        );
        if (tableOrder !== 0) return tableOrder;
        return compareStableText(left.name, right.name);
      })
      .map(({ id }) => id);
    if (!sameOrderedValues(doc.indexIds, expectedIndexIds)) {
      addIssue(context, "Dineug indexes must use canonical table/name order");
    }

    const relationshipKeysById = new Map<string, string>();
    const foreignKeyColumnIds = new Set<string>();
    for (const relationship of Object.values(
      collections.relationshipEntities,
    )) {
      const startTable = collections.tableEntities[relationship.start.tableId];
      const endTable = collections.tableEntities[relationship.end.tableId];
      if (!startTable || !endTable) {
        addIssue(context, `Relationship references an unknown table: ${relationship.id}`);
        continue;
      }

      const endpointColumns = [
        [relationship.start, startTable],
        [relationship.end, endTable],
      ] as const;
      let endpointsValid = true;
      for (const [point, table] of endpointColumns) {
        if (
          hasDuplicates(point.columnIds) ||
          point.columnIds.some((columnId) => !table.columnIds.includes(columnId))
        ) {
          endpointsValid = false;
          addIssue(context, `Relationship column endpoint is invalid: ${relationship.id}`);
        }
      }
      if (!endpointsValid) continue;
      if (relationship.start.columnIds.length !== relationship.end.columnIds.length) {
        addIssue(context, `Relationship column counts differ: ${relationship.id}`);
        continue;
      }

      relationship.end.columnIds.forEach((id) => foreignKeyColumnIds.add(id));
      const isIdentifying = relationship.end.columnIds.every(
        (id) =>
          ((collections.tableColumnEntities[id]?.options ?? 0) & 2) === 2,
      );
      if (relationship.identification !== isIdentifying) {
        addIssue(context, `Relationship identification is inconsistent: ${relationship.id}`);
      }

      const coreKey = relationshipCoreKey({
        sourceColumns: relationship.end.columnIds.map(
          (id) => collections.tableColumnEntities[id]?.name ?? "",
        ),
        sourceTable: endTable.name,
        targetColumns: relationship.start.columnIds.map(
          (id) => collections.tableColumnEntities[id]?.name ?? "",
        ),
        targetTable: startTable.name,
      });
      if ([...relationshipKeysById.values()].includes(coreKey)) {
        addIssue(context, `Duplicate core relationship: ${coreKey}`);
      }
      relationshipKeysById.set(relationship.id, coreKey);
    }

    for (const column of Object.values(collections.tableColumnEntities)) {
      const hasForeignKeyUi = (column.ui.keys & 2) === 2;
      if (hasForeignKeyUi !== foreignKeyColumnIds.has(column.id)) {
        addIssue(context, `Column FK UI key is inconsistent: ${column.id}`);
      }
    }

    const orderedRelationshipKeys = doc.relationshipIds.map(
      (id) => relationshipKeysById.get(id) ?? "",
    );
    if (
      !sameOrderedValues(
        orderedRelationshipKeys,
        orderedRelationshipKeys.toSorted(),
      )
    ) {
      addIssue(context, "Dineug relationships must use canonical core order");
    }
  });

export type DineugErdDocument = z.infer<typeof dineugErdDocumentSchema>;

export type ErdDineugParseResult =
  | { data: DineugErdDocument; error: null }
  | { data: null; error: string };

async function stableEntityId(kind: string, key: string): Promise<string> {
  return `${kind}-${(await sha256Hex(key)).slice(0, 20)}`;
}

async function canonicalEntityIdError(
  document: DineugErdDocument,
): Promise<string | null> {
  const { collections } = document;

  for (const table of Object.values(collections.tableEntities)) {
    if (table.id !== (await stableEntityId("table", table.name))) {
      return `Dineug table ID does not match its name: ${table.id}`;
    }
  }
  for (const column of Object.values(collections.tableColumnEntities)) {
    const table = collections.tableEntities[column.tableId];
    if (
      !table ||
      column.id !== (await stableEntityId("column", `${table.name}.${column.name}`))
    ) {
      return `Dineug column ID does not match its table/name: ${column.id}`;
    }
  }
  for (const index of Object.values(collections.indexEntities)) {
    const table = collections.tableEntities[index.tableId];
    if (
      !table ||
      index.id !== (await stableEntityId("index", `${table.name}.${index.name}`))
    ) {
      return `Dineug index ID does not match its table/name: ${index.id}`;
    }
  }
  for (const indexColumn of Object.values(
    collections.indexColumnEntities,
  )) {
    const index = collections.indexEntities[indexColumn.indexId];
    const column = collections.tableColumnEntities[indexColumn.columnId];
    const table = index ? collections.tableEntities[index.tableId] : undefined;
    const ordinal = index?.indexColumnIds.indexOf(indexColumn.id) ?? -1;
    if (
      !index ||
      !column ||
      !table ||
      ordinal < 0 ||
      indexColumn.id !==
        (await stableEntityId(
          "index-column",
          `${table.name}.${index.name}|${ordinal}|${column.name}`,
        ))
    ) {
      return `Dineug index-column ID does not match its semantics: ${indexColumn.id}`;
    }
  }
  for (const relationshipId of document.doc.relationshipIds) {
    const relationship = collections.relationshipEntities[relationshipId];
    if (!relationship) return `Dineug relationship is unavailable: ${relationshipId}`;
    const sourceTable = collections.tableEntities[relationship.end.tableId];
    const targetTable = collections.tableEntities[relationship.start.tableId];
    if (!sourceTable || !targetTable) {
      return `Dineug relationship references an unknown table: ${relationshipId}`;
    }

    const key = relationshipCoreKey({
      sourceColumns: relationship.end.columnIds.map(
        (id) => collections.tableColumnEntities[id]?.name ?? "",
      ),
      sourceTable: sourceTable.name,
      targetColumns: relationship.start.columnIds.map(
        (id) => collections.tableColumnEntities[id]?.name ?? "",
      ),
      targetTable: targetTable.name,
    });
    const expectedId = await stableEntityId("relationship", key);
    if (relationshipId !== expectedId) {
      return "Dineug ERD relationship IDs do not match their core endpoints.";
    }
  }

  return null;
}

/** 저장된 Dineug 문서를 파싱하고 custom element에 전달할 보안 경계를 검증한다. */
export async function parseErdDineugDocument(
  serializedDocument: string | null,
): Promise<ErdDineugParseResult> {
  if (serializedDocument === null || serializedDocument.trim() === "") {
    return { data: null, error: "Dineug ERD document is not available." };
  }

  if (
    new TextEncoder().encode(serializedDocument).byteLength >
    maximumDocumentBytes
  ) {
    return { data: null, error: "Dineug ERD document exceeds the size limit." };
  }

  let parsedDocument: unknown;
  try {
    parsedDocument = JSON.parse(serializedDocument);
  } catch {
    return { data: null, error: "Dineug ERD document is not valid JSON." };
  }

  if (hasDangerousObjectKey(parsedDocument)) {
    return { data: null, error: "Dineug ERD document contains an unsafe key." };
  }

  const result = dineugErdDocumentSchema.safeParse(parsedDocument);
  if (!result.success) {
    return {
      data: null,
      error:
        result.error.issues[0]?.message ?? "Dineug ERD document is invalid.",
    };
  }

  const entityIdError = await canonicalEntityIdError(result.data);
  if (entityIdError) {
    return {
      data: null,
      error: entityIdError,
    };
  }

  return { data: result.data, error: null };
}
