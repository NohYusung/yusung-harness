import { z } from "zod/v4";
import { validateErdExcalidrawScene } from "../../../scripts/lib/validate-erd-excalidraw-scene.cjs";

const maximumSceneBytes = 5 * 1024 * 1024;
const maximumElements = 5_000;
const maximumCoordinate = 1_000_000;
const allowedElementTypes = ["rectangle", "text", "arrow"] as const;
const erdCustomDataContract = "ERDExcalidraw/1.0" as const;
const cardinalitySchema = z.enum(["1", "0..1", "N", "1..N", "0..N"]);
const nonEmptyStringSchema = z.string().trim().min(1);
const displayStringSchema = z
  .string()
  .min(1)
  .max(50_000)
  .refine((value) => value.trim().length > 0, "Text cannot be whitespace-only");

/** Excalidraw 좌표와 크기에 허용할 유한 숫자 범위를 검증한다. */
const coordinateSchema = z
  .number()
  .finite()
  .min(-maximumCoordinate)
  .max(maximumCoordinate);

/** Excalidraw binding이 가리키는 element ID 구조를 공개 schema에 표현한다. */
const bindingSchema = z
  .object({
    elementId: z.string().trim().min(1).max(255),
  })
  .passthrough();

/** rectangle이 binding된 arrow를 역참조하는 공개 schema 계약. */
const boundElementSchema = z
  .object({
    id: z.string().trim().min(1).max(255),
    type: z.literal("arrow"),
  })
  .passthrough();

/** 테이블 rectangle의 의미 메타데이터 구조. */
const tableCustomDataSchema = z
  .object({
    contract: z.literal(erdCustomDataContract),
    kind: z.literal("table"),
    qualifiedName: z.string().trim().min(1).max(512),
    columns: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(255),
            type: z.string().trim().min(1).max(255),
            nullable: z.boolean(),
            primaryKey: z.boolean(),
            foreignKey: z.boolean(),
            unique: z.boolean(),
            default: nonEmptyStringSchema.nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(2_000),
  })
  .passthrough();

/** 외래 키 arrow의 관계 endpoint 의미 구조. */
const foreignKeyCustomDataSchema = z
  .object({
    contract: z.literal(erdCustomDataContract),
    kind: z.literal("foreign-key"),
    constraint: z.string().trim().min(1).max(512),
    sourceTable: z.string().trim().min(1).max(512),
    sourceColumns: z.array(z.string().trim().min(1).max(255)).min(1).max(64),
    sourceCardinality: cardinalitySchema,
    targetTable: z.string().trim().min(1).max(512),
    targetColumns: z.array(z.string().trim().min(1).max(255)).min(1).max(64),
    targetCardinality: cardinalitySchema,
    onUpdate: nonEmptyStringSchema.nullable(),
    onDelete: nonEmptyStringSchema.nullable(),
  })
  .passthrough();

/** ERD provenance text와 schema 범위 의미 구조. */
const supportingCustomDataSchema = z.discriminatedUnion("kind", [
  z
    .object({
      contract: z.literal(erdCustomDataContract),
      kind: z.literal("erd-metadata"),
      name: nonEmptyStringSchema.max(512),
      scope: nonEmptyStringSchema.max(512),
      engine: nonEmptyStringSchema.max(512).nullable(),
      sourceRevision: nonEmptyStringSchema.max(512),
      inventoryFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
    })
    .passthrough(),
  z
    .object({
      contract: z.literal(erdCustomDataContract),
      kind: z.literal("schema-scope"),
      scopeName: z.string().trim().min(1).max(512),
      tableNames: z
        .array(z.string().trim().min(1).max(512))
        .min(1)
        .max(maximumElements),
    })
    .passthrough(),
]);

const customDataSchema = z.union([
  tableCustomDataSchema,
  foreignKeyCustomDataSchema,
  supportingCustomDataSchema,
]);

/** JSON schema 표현과 입력 정규화를 담당하고 의미 검증은 shared validator에 위임한다. */
const elementSchema = z
  .object({
    id: z.string().trim().min(1).max(255),
    type: z.enum(allowedElementTypes),
    x: coordinateSchema,
    y: coordinateSchema,
    width: coordinateSchema.nonnegative(),
    height: coordinateSchema.nonnegative(),
    angle: z.number().finite().optional(),
    isDeleted: z.literal(false),
    link: z.null(),
    groupIds: z.array(z.string()),
    startBinding: bindingSchema.nullable().optional(),
    endBinding: bindingSchema.nullable().optional(),
    boundElements: z.array(boundElementSchema).max(maximumElements).nullable(),
    customData: customDataSchema.optional(),
    text: displayStringSchema.optional(),
    originalText: displayStringSchema.optional(),
    fontSize: z.number().finite().nonnegative().optional(),
    points: z
      .array(z.tuple([coordinateSchema, coordinateSchema]))
      .min(2)
      .max(10_000)
      .optional(),
  })
  .passthrough();

const structuredExcalidrawSceneSchema = z
  .object({
    type: z.literal("excalidraw"),
    version: z.literal(2),
    source: z.literal("yusung-harness:erd"),
    elements: z.array(elementSchema).min(1).max(maximumElements),
    appState: z.record(z.string(), z.unknown()),
    files: z.record(z.string(), z.unknown()),
  })
  .strict();

/** MCP, service와 backfill이 공유하는 ERDExcalidraw/1.0 acceptance 경계. */
export const excalidrawSceneSchema = z.preprocess(
  (scene, context) => {
    try {
      validateErdExcalidrawScene(scene);
    } catch (error: unknown) {
      context.addIssue({
        code: "custom",
        message:
          error instanceof Error
            ? error.message
            : "Invalid ERD Excalidraw scene",
      });
    }

    return scene;
  },
  structuredExcalidrawSceneSchema,
);

/** MCP 입력으로 전달되는 구조화된 Excalidraw scene 타입. */
export type ExcalidrawSceneInput = z.infer<typeof excalidrawSceneSchema>;

/** JSON 객체의 키를 재귀적으로 정렬해 안정적인 저장 문자열을 만든다. */
const sortJsonKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortJsonKeys);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
        .map(([key, nestedValue]) => [key, sortJsonKeys(nestedValue)]),
    );
  }

  return value;
};

/** 구조화된 scene을 shared validator로 검증하고 canonical JSON으로 직렬화한다. */
export const canonicalizeErdExcalidrawScene = (scene: unknown): string => {
  let json: string | undefined;

  try {
    json = JSON.stringify(scene);
  } catch (error: unknown) {
    throw new TypeError("Excalidraw scene must be JSON serializable", {
      cause: error,
    });
  }

  if (!json) {
    throw new TypeError("Excalidraw scene must be JSON serializable");
  }
  if (Buffer.byteLength(json, "utf8") > maximumSceneBytes) {
    throw new TypeError(`Excalidraw scene exceeds ${maximumSceneBytes} bytes`);
  }

  const parsedScene = excalidrawSceneSchema.parse(JSON.parse(json));
  return JSON.stringify(sortJsonKeys(parsedScene));
};

/** 기존 service import 이름과 canonical JSON public interface를 유지한다. */
export const canonicalizeExcalidrawScene = canonicalizeErdExcalidrawScene;
