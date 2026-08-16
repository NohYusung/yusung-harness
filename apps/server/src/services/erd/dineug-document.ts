import { z } from "zod/v4";

/** Node 22의 synchronous require(ESM)로 Nest CommonJS build와 shared ESM 경계를 잇는다. */
const {
  canonicalizeDineugErdDocument: canonicalizeSharedDocument,
  DINEUG_SCHEMA_URL,
  validateDineugErdDocument,
} = require("../../../scripts/lib/dineug-erd-document.mjs") as {
  canonicalizeDineugErdDocument: (document: unknown) => string;
  DINEUG_SCHEMA_URL: string;
  validateDineugErdDocument: <T>(document: T) => T;
};

const maximumCoordinate = 1_000_000;
const maximumCollectionEntities = 5_000;
const identifierSchema = z.string().trim().min(1).max(512);
const idSchema = z
  .string()
  .regex(/^(?:table|column|relationship|index|index-column|memo)-[a-f0-9]{20}$/u);
const displayStringSchema = z.string().max(50_000);
const coordinateSchema = z
  .number()
  .finite()
  .min(-maximumCoordinate)
  .max(maximumCoordinate);

/** Dineug entity의 deterministic timestamp metadata. */
const entityMetaSchema = z
  .object({
    createAt: z.literal(0),
    updateAt: z.literal(0),
  })
  .strict();

/** Dineug table 카드의 위치와 표시 폭. */
const tableUiSchema = z
  .object({
    x: coordinateSchema,
    y: coordinateSchema,
    zIndex: coordinateSchema,
    widthName: coordinateSchema,
    widthComment: coordinateSchema,
    color: z.string().trim().min(1).max(64),
  })
  .strict();

/** Dineug column의 key bit와 표시 폭. */
const columnUiSchema = z
  .object({
    keys: z.number().int().min(0).max(3),
    widthName: coordinateSchema,
    widthComment: coordinateSchema,
    widthDataType: coordinateSchema,
    widthDefault: coordinateSchema,
  })
  .strict();

/** 화면을 압박하지 않는 provenance memo의 위치와 크기. */
const memoUiSchema = z
  .object({
    x: coordinateSchema,
    y: coordinateSchema,
    zIndex: coordinateSchema,
    width: coordinateSchema,
    height: coordinateSchema,
    color: z.string().trim().min(1).max(64),
  })
  .strict();

/** Dineug table entity의 공개 JSON shape. */
const tableEntitySchema = z
  .object({
    id: idSchema,
    name: identifierSchema,
    comment: displayStringSchema,
    columnIds: z.array(idSchema).min(1).max(maximumCollectionEntities),
    seqColumnIds: z.array(idSchema).min(1).max(maximumCollectionEntities),
    ui: tableUiSchema,
    meta: entityMetaSchema,
  })
  .strict();

/** Dineug table column entity의 공개 JSON shape. */
const tableColumnEntitySchema = z
  .object({
    id: idSchema,
    tableId: idSchema,
    name: z.string().trim().min(1).max(255),
    comment: displayStringSchema,
    dataType: z.string().trim().min(1).max(255),
    default: displayStringSchema,
    options: z.number().int().min(0).max(15),
    ui: columnUiSchema,
    meta: entityMetaSchema,
  })
  .strict();

/** relationship endpoint가 참조하는 table/ordered column과 canvas 좌표. */
const relationshipPointSchema = z
  .object({
    tableId: idSchema,
    columnIds: z.array(idSchema).min(1).max(64),
    x: coordinateSchema,
    y: coordinateSchema,
    direction: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(4),
      z.literal(8),
    ]),
  })
  .strict();

/** Dineug FK relationship entity의 공개 JSON shape. */
const relationshipEntitySchema = z
  .object({
    id: idSchema,
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

/** Dineug index entity의 공개 JSON shape. */
const indexEntitySchema = z
  .object({
    id: idSchema,
    name: identifierSchema,
    tableId: idSchema,
    indexColumnIds: z.array(idSchema).min(1).max(maximumCollectionEntities),
    seqIndexColumnIds: z.array(idSchema).min(1).max(maximumCollectionEntities),
    unique: z.boolean(),
    meta: entityMetaSchema,
  })
  .strict();

/** Dineug index column entity의 공개 JSON shape. */
const indexColumnEntitySchema = z
  .object({
    id: idSchema,
    indexId: idSchema,
    columnId: idSchema,
    orderType: z.union([z.literal(1), z.literal(2)]),
    meta: entityMetaSchema,
  })
  .strict();

/** harness provenance와 FK 의미를 담는 Dineug memo entity. */
const memoEntitySchema = z
  .object({
    id: idSchema,
    value: z.string().trim().min(1).max(50_000),
    ui: memoUiSchema,
    meta: entityMetaSchema,
  })
  .strict();

/** 공식 ERDEditorSchemaV3 settings shape를 고정한다. */
const settingsSchema = z
  .object({
    width: z.number().finite().min(2_000).max(20_000),
    height: z.number().finite().min(2_000).max(20_000),
    scrollTop: coordinateSchema,
    scrollLeft: coordinateSchema,
    zoomLevel: z.number().finite().min(0.1).max(1),
    show: z.number().int().min(0).max(511),
    database: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(4),
      z.literal(8),
      z.literal(16),
      z.literal(32),
    ]),
    databaseName: identifierSchema,
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
    columnOrder: z.tuple([
      z.literal(1),
      z.literal(2),
      z.literal(4),
      z.literal(8),
      z.literal(16),
      z.literal(32),
      z.literal(64),
    ]),
    maxWidthComment: z.number().int(),
    ignoreSaveSettings: z.union([
      z.literal(0),
      z.literal(1),
      z.literal(2),
      z.literal(3),
    ]),
  })
  .strict();

/** shared semantic validator 뒤 구조화 타입을 제공하는 Dineug v3 입력 schema. */
const structuredDineugDocumentSchema = z
  .object({
    $schema: z.literal(DINEUG_SCHEMA_URL),
    version: z.literal("3.0.0"),
    settings: settingsSchema,
    doc: z
      .object({
        tableIds: z.array(idSchema).min(1).max(maximumCollectionEntities),
        relationshipIds: z.array(idSchema).max(maximumCollectionEntities),
        indexIds: z.array(idSchema).max(maximumCollectionEntities),
        memoIds: z.array(idSchema).min(1).max(maximumCollectionEntities),
      })
      .strict(),
    collections: z
      .object({
        tableEntities: z.record(idSchema, tableEntitySchema),
        tableColumnEntities: z.record(idSchema, tableColumnEntitySchema),
        relationshipEntities: z.record(idSchema, relationshipEntitySchema),
        indexEntities: z.record(idSchema, indexEntitySchema),
        indexColumnEntities: z.record(idSchema, indexColumnEntitySchema),
        memoEntities: z.record(idSchema, memoEntitySchema),
      })
      .strict(),
  })
  .strict();

/** MCP, service와 backfill이 공유하는 Dineug v3 acceptance 경계. */
export const dineugErdDocumentSchema = z.preprocess(
  (document, context) => {
    try {
      validateDineugErdDocument(document);
    } catch (error: unknown) {
      context.addIssue({
        code: "custom",
        message:
          error instanceof Error ? error.message : "Invalid Dineug ERD document",
      });
    }

    return document;
  },
  structuredDineugDocumentSchema,
);

/** MCP 입력으로 전달되는 구조화된 Dineug v3 문서 타입. */
export type DineugErdDocumentInput = z.infer<
  typeof structuredDineugDocumentSchema
>;

/** Dineug v3 문서를 semantic 검증하고 canonical JSON 문자열로 저장한다. */
export const canonicalizeDineugErdDocument = (document: unknown): string => {
  const parsed = dineugErdDocumentSchema.parse(document);
  return canonicalizeSharedDocument(parsed);
};
