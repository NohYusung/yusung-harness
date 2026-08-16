import { z } from "zod";

export const dineugSchemaUrl =
  "https://raw.githubusercontent.com/dineug/erd-editor/main/json-schema/schema.json";

export const erdMetadataMemoPrefix = "[yusung-harness:erd-meta/1.0]\n";
export const erdForeignKeyMemoPrefix = "[yusung-harness:fk/1.0]\n";

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

const memoSchema = z
  .object({
    id: entityIdSchema,
    value: textSchema,
    ui: z
      .object({
        x: finiteNumberSchema,
        y: finiteNumberSchema,
        width: finiteNumberSchema.positive(),
        height: finiteNumberSchema.positive(),
        zIndex: finiteNumberSchema,
        color: z.string().regex(/^#[0-9a-f]{6}$/i),
      })
      .strict(),
    meta: entityMetaSchema,
  })
  .strict();

const erdMetadataMemoSchema = z
  .object({
    engine: z.string().min(1).max(512),
    inventoryFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
    scope: z.string().min(1).max(512),
    sourceRevision: z.string().min(1).max(512),
  })
  .strict();

const sourceCardinalitySchema = z.enum(["1", "0..1", "1..N", "0..N"]);
const targetCardinalitySchema = z.enum(["1", "0..1"]);
const erdForeignKeyMemoSchema = z
  .object({
    constraint: z.string().min(1).max(512),
    onDelete: z.string().min(1).max(128).nullable(),
    onUpdate: z.string().min(1).max(128).nullable(),
    sourceCardinality: sourceCardinalitySchema,
    sourceColumns: z.array(identifierSchema).min(1),
    sourceTable: identifierSchema,
    targetCardinality: targetCardinalitySchema,
    targetColumns: z.array(identifierSchema).min(1),
    targetTable: identifierSchema,
  })
  .strict();

type ErdForeignKeyMemo = z.infer<typeof erdForeignKeyMemoSchema>;
type ErdMetadataMemo = z.infer<typeof erdMetadataMemoSchema>;

function databaseBitForEngine(engine: string): 1 | 2 | 4 | 8 | 16 | 32 | null {
  const normalized = engine.toLowerCase();
  if (normalized.includes("mariadb")) return 1;
  if (normalized.includes("mssql") || normalized.includes("sql server")) return 2;
  if (normalized.includes("mysql")) return 4;
  if (normalized.includes("oracle")) return 8;
  if (normalized.includes("postgres")) return 16;
  if (normalized.includes("sqlite")) return 32;
  return null;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson(
            (value as Record<string, unknown>)[key],
          )}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function compareStableText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

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

function requireEntity<T>(value: T | undefined, label: string): T {
  if (value === undefined) {
    throw new TypeError(`Validated Dineug entity is unavailable: ${label}`);
  }
  return value;
}

function parseCanonicalMemo<T>(
  value: string,
  prefix: string,
  schema: z.ZodType<T>,
): T | null {
  if (!value.startsWith(prefix)) return null;

  const serializedPayload = value.slice(prefix.length);
  let payload: unknown;
  try {
    payload = JSON.parse(serializedPayload);
  } catch {
    return null;
  }

  const result = schema.safeParse(payload);
  if (!result.success || canonicalJson(result.data) !== serializedPayload) {
    return null;
  }
  return result.data;
}

function relationshipTypeToCardinality(value: 2 | 4 | 8 | 16) {
  if (value === 2) return "0..1";
  if (value === 4) return "0..N";
  if (value === 8) return "1";
  return "1..N";
}

function startRelationshipTypeToCardinality(value: 1 | 2) {
  return value === 1 ? "0..1" : "1";
}

function relationshipSemanticKey({
  sourceCardinality,
  sourceColumns,
  sourceTable,
  targetCardinality,
  targetColumns,
  targetTable,
}: Omit<ErdForeignKeyMemo, "constraint" | "onDelete" | "onUpdate">) {
  return [
    sourceTable,
    sourceColumns.join(","),
    sourceCardinality,
    targetTable,
    targetColumns.join(","),
    targetCardinality,
  ].join("|");
}

function inventoryRelationshipKey(relationship: ErdForeignKeyMemo) {
  return [
    relationship.sourceTable,
    relationship.constraint,
    relationship.sourceColumns.join(","),
    relationship.targetTable,
    relationship.targetColumns.join(","),
  ].join("|");
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function reconstructInventory(
  document: DineugErdDocument,
  metadata: ErdMetadataMemo,
  relationships: ErdForeignKeyMemo[],
) {
  const { collections } = document;
  const tables = Object.values(collections.tableEntities)
    .toSorted((left, right) => compareStableText(left.name, right.name))
    .map((table) => {
      const columns = table.columnIds.map((columnId) => {
        const column = requireEntity(
          collections.tableColumnEntities[columnId],
          columnId,
        );
        return {
          name: column.name,
          type: column.dataType,
          nullable: (column.options & 8) === 0,
          foreignKey: (column.ui.keys & 2) === 2,
          autoIncrement: (column.options & 1) === 1,
          default: column.default === "" ? null : column.default,
          comment: column.comment,
        };
      });
      const primaryKeyColumns = table.columnIds
        .filter(
          (columnId) => {
            const column = requireEntity(
              collections.tableColumnEntities[columnId],
              columnId,
            );
            return (column.options & 2) === 2;
          },
        )
        .map(
          (columnId) =>
            requireEntity(
              collections.tableColumnEntities[columnId],
              columnId,
            ).name,
        );
      const uniqueConstraints = Object.values(collections.indexEntities)
        .filter((index) => index.tableId === table.id)
        .map((index) => ({
          name: index.name,
          columns: index.indexColumnIds.map((indexColumnId) => {
            const indexColumn = requireEntity(
              collections.indexColumnEntities[indexColumnId],
              indexColumnId,
            );
            return requireEntity(
              collections.tableColumnEntities[indexColumn.columnId],
              indexColumn.columnId,
            ).name;
          }),
        }))
        .toSorted((left, right) => compareStableText(left.name, right.name));

      return {
        qualifiedName: table.name,
        comment: table.comment,
        columns,
        primaryKey:
          primaryKeyColumns.length === 0
            ? null
            : { columns: primaryKeyColumns },
        uniqueConstraints,
      };
    });

  return {
    contract: "ERDInventory/2.0",
    name: document.settings.databaseName,
    scope: metadata.scope,
    engine: metadata.engine,
    sourceRevision: metadata.sourceRevision,
    tables,
    relationships: relationships.toSorted((left, right) =>
      compareStableText(
        inventoryRelationshipKey(left),
        inventoryRelationshipKey(right),
      ),
    ),
  };
}

async function hasValidInventoryFingerprint(
  document: DineugErdDocument,
): Promise<boolean> {
  let metadata: ErdMetadataMemo | null = null;
  const relationships: ErdForeignKeyMemo[] = [];

  for (const memoId of document.doc.memoIds) {
    const memo = requireEntity(
      document.collections.memoEntities[memoId],
      memoId,
    );
    const parsedMetadata = parseCanonicalMemo(
      memo.value,
      erdMetadataMemoPrefix,
      erdMetadataMemoSchema,
    );
    if (parsedMetadata) {
      metadata = parsedMetadata;
      continue;
    }
    const relationship = parseCanonicalMemo(
      memo.value,
      erdForeignKeyMemoPrefix,
      erdForeignKeyMemoSchema,
    );
    if (relationship) relationships.push(relationship);
  }

  if (!metadata) return false;
  const inventory = reconstructInventory(document, metadata, relationships);
  return (await sha256Hex(canonicalJson(inventory))) === metadata.inventoryFingerprint;
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
        memoIds: z.array(entityIdSchema).min(1),
      })
      .strict(),
    collections: z
      .object({
        tableEntities: z.record(z.string(), tableSchema),
        tableColumnEntities: z.record(z.string(), columnSchema),
        relationshipEntities: z.record(z.string(), relationshipSchema),
        indexEntities: z.record(z.string(), indexSchema),
        indexColumnEntities: z.record(z.string(), indexColumnSchema),
        memoEntities: z.record(z.string(), memoSchema),
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

    const indexColumnIdsByIndex = new Map<string, string[]>();
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
    }

    const relationshipKeys: string[] = [];
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

      relationship.end.columnIds.forEach((id) => foreignKeyColumnIds.add(id));
      const isIdentifying = relationship.end.columnIds.every(
        (id) =>
          ((collections.tableColumnEntities[id]?.options ?? 0) & 2) === 2,
      );
      if (relationship.identification !== isIdentifying) {
        addIssue(context, `Relationship identification is inconsistent: ${relationship.id}`);
      }

      relationshipKeys.push(
        relationshipSemanticKey({
          sourceCardinality: relationshipTypeToCardinality(
            relationship.relationshipType,
          ),
          sourceColumns: relationship.end.columnIds.map(
            (id) => collections.tableColumnEntities[id]?.name ?? "",
          ),
          sourceTable: endTable.name,
          targetCardinality: startRelationshipTypeToCardinality(
            relationship.startRelationshipType,
          ),
          targetColumns: relationship.start.columnIds.map(
            (id) => collections.tableColumnEntities[id]?.name ?? "",
          ),
          targetTable: startTable.name,
        }),
      );
    }

    for (const column of Object.values(collections.tableColumnEntities)) {
      const hasForeignKeyUi = (column.ui.keys & 2) === 2;
      if (hasForeignKeyUi !== foreignKeyColumnIds.has(column.id)) {
        addIssue(context, `Column FK UI key is inconsistent: ${column.id}`);
      }
    }

    let metadataMemoCount = 0;
    let metadataEngine: string | null = null;
    const memoRelationshipKeys: string[] = [];
    for (const memo of Object.values(collections.memoEntities)) {
      const metadata = parseCanonicalMemo(
        memo.value,
        erdMetadataMemoPrefix,
        erdMetadataMemoSchema,
      );
      if (metadata) {
        metadataMemoCount += 1;
        metadataEngine = metadata.engine;
        continue;
      }

      const foreignKey = parseCanonicalMemo(
        memo.value,
        erdForeignKeyMemoPrefix,
        erdForeignKeyMemoSchema,
      );
      if (!foreignKey) {
        addIssue(context, `Unknown or invalid ERD memo: ${memo.id}`);
        continue;
      }
      memoRelationshipKeys.push(relationshipSemanticKey(foreignKey));
    }

    if (metadataMemoCount !== 1) {
      addIssue(context, "Dineug ERD must contain exactly one metadata memo");
    } else if (
      metadataEngine === null ||
      databaseBitForEngine(metadataEngine) !== document.settings.database
    ) {
      addIssue(context, "Dineug database setting does not match metadata engine");
    }
    const sortedRelationshipKeys = relationshipKeys.toSorted();
    const sortedMemoRelationshipKeys = memoRelationshipKeys.toSorted();
    if (
      sortedRelationshipKeys.length !== sortedMemoRelationshipKeys.length ||
      sortedRelationshipKeys.some(
        (value, index) => value !== sortedMemoRelationshipKeys[index],
      )
    ) {
      addIssue(context, "Dineug relationships and FK memos do not match");
    }
  });

export type DineugErdDocument = z.infer<typeof dineugErdDocumentSchema>;

export type ErdDineugParseResult =
  | { data: DineugErdDocument; error: null }
  | { data: null; error: string };

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

  try {
    if (!(await hasValidInventoryFingerprint(result.data))) {
      return {
        data: null,
        error: "Dineug ERD inventory fingerprint does not match its document.",
      };
    }
  } catch {
    return {
      data: null,
      error: "Dineug ERD inventory fingerprint could not be verified.",
    };
  }

  return { data: result.data, error: null };
}
