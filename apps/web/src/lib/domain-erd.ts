import { z } from "zod";

const identifierSchema = z.string().trim().min(1).max(120);
const optionalTextSchema = z.string().trim().min(1).max(2_000).optional();
const cardinalitySchema = z.enum(["1", "0..1", "N", "1..N", "0..N"]);
const MAX_DOMAIN_ENTITIES = 100;
const MAX_DOMAIN_FIELDS_PER_ENTITY = 100;
const MAX_DOMAIN_TOTAL_FIELDS = 2_000;
const MAX_DOMAIN_RELATIONSHIPS = 1_000;

const domainFieldSchema = z
  .object({
    name: identifierSchema,
    type: z.string().trim().min(1).max(200),
    nullable: z.boolean(),
    primaryKey: z.boolean().optional(),
    foreignKey: z.boolean().optional(),
    unique: z.boolean().optional(),
    default: z.string().max(500).optional(),
  })
  .strict();

const domainEntitySchema = z
  .object({
    id: identifierSchema,
    name: identifierSchema,
    domain: optionalTextSchema,
    description: optionalTextSchema,
    fields: z
      .array(domainFieldSchema)
      .min(1)
      .max(MAX_DOMAIN_FIELDS_PER_ENTITY),
  })
  .strict();

const relationshipEndpointSchema = z
  .object({
    entityId: identifierSchema,
    field: identifierSchema.optional(),
    cardinality: cardinalitySchema,
  })
  .strict();

const domainRelationshipSchema = z
  .object({
    id: identifierSchema,
    label: optionalTextSchema,
    source: relationshipEndpointSchema,
    target: relationshipEndpointSchema,
  })
  .strict();

/** 완성된 프로젝트의 도메인 엔티티와 관계를 표현하는 ERD 계약. */
export const domainErdSchema = z
  .object({
    kind: z.literal("domain-erd"),
    schemaVersion: z.literal(1),
    name: z.string().trim().min(1).max(200),
    generatedAt: z.iso.datetime({ offset: true }).optional(),
    sourceRevision: z.string().trim().min(1).max(200).optional(),
    entities: z.array(domainEntitySchema).min(1).max(MAX_DOMAIN_ENTITIES),
    relationships: z
      .array(domainRelationshipSchema)
      .max(MAX_DOMAIN_RELATIONSHIPS),
  })
  .strict()
  .superRefine(({ entities, relationships }, context) => {
    const totalFieldCount = entities.reduce(
      (count, entity) => count + entity.fields.length,
      0,
    );
    if (totalFieldCount > MAX_DOMAIN_TOTAL_FIELDS) {
      context.addIssue({
        code: "custom",
        message: `Domain ERD cannot contain more than ${MAX_DOMAIN_TOTAL_FIELDS} fields`,
        path: ["entities"],
      });
    }

    const entityIds = new Set<string>();
    const entityNames = new Set<string>();

    for (const [entityIndex, entity] of entities.entries()) {
      if (entityIds.has(entity.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate entity id: ${entity.id}`,
          path: ["entities", entityIndex, "id"],
        });
      }
      entityIds.add(entity.id);

      if (entityNames.has(entity.name)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate entity name: ${entity.name}`,
          path: ["entities", entityIndex, "name"],
        });
      }
      entityNames.add(entity.name);

      const fieldNames = new Set<string>();
      for (const [fieldIndex, field] of entity.fields.entries()) {
        if (fieldNames.has(field.name)) {
          context.addIssue({
            code: "custom",
            message: `Duplicate field name: ${entity.name}.${field.name}`,
            path: ["entities", entityIndex, "fields", fieldIndex, "name"],
          });
        }
        fieldNames.add(field.name);
      }
    }

    const entitiesById = new Map(entities.map((entity) => [entity.id, entity]));
    const relationshipIds = new Set<string>();

    for (const [relationshipIndex, relationship] of relationships.entries()) {
      if (relationshipIds.has(relationship.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate relationship id: ${relationship.id}`,
          path: ["relationships", relationshipIndex, "id"],
        });
      }
      relationshipIds.add(relationship.id);

      for (const endpointName of ["source", "target"] as const) {
        const endpoint = relationship[endpointName];
        const entity = entitiesById.get(endpoint.entityId);

        if (!entity) {
          context.addIssue({
            code: "custom",
            message: `Unknown relationship entity: ${endpoint.entityId}`,
            path: [
              "relationships",
              relationshipIndex,
              endpointName,
              "entityId",
            ],
          });
          continue;
        }

        if (
          endpoint.field &&
          !entity.fields.some((field) => field.name === endpoint.field)
        ) {
          context.addIssue({
            code: "custom",
            message: `Unknown relationship field: ${entity.name}.${endpoint.field}`,
            path: [
              "relationships",
              relationshipIndex,
              endpointName,
              "field",
            ],
          });
        }
      }
    }
  });

/** 런타임 검증을 통과한 Domain ERD snapshot. */
export type DomainErd = z.infer<typeof domainErdSchema>;
/** Domain ERD의 entity node. */
export type DomainEntity = DomainErd["entities"][number];
/** Domain entity의 field. */
export type DomainField = DomainEntity["fields"][number];
/** Domain entity 간 relationship. */
export type DomainRelationship = DomainErd["relationships"][number];

/** JSON 원문 또는 markdown JSON fence에서 snapshot JSON을 추출한다. */
function extractJson(content: string): string {
  const trimmed = content.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fencedJson = trimmed.match(/```json\s*([\s\S]*?)\s*```/i)?.[1];
  if (!fencedJson) {
    throw new Error("Domain content does not contain a domain ERD JSON snapshot");
  }

  return fencedJson;
}

/** 저장된 content를 검증된 Domain ERD로 파싱한다. */
export function parseDomainErd(content: string): DomainErd {
  return domainErdSchema.parse(JSON.parse(extractJson(content)));
}

/** 파싱 실패를 legacy record로 취급할 수 있도록 null로 반환한다. */
export function safeParseDomainErd(
  content: string,
): DomainErd | null {
  try {
    return parseDomainErd(content);
  } catch {
    return null;
  }
}

/** 최신 valid Domain ERD와 파싱되지 않은 legacy record를 분리한다. */
export function getLatestDomainErd<
  RecordType extends { content: string; updatedAt: string },
>(records: RecordType[]): {
  legacyCount: number;
  legacyRecords: RecordType[];
  record: RecordType;
  snapshot: DomainErd;
} | null {
  const parsedRecords = records.map((record) => ({
    record,
    snapshot: safeParseDomainErd(record.content),
  }));
  const parsed = parsedRecords
    .filter(
      (
        item,
      ): item is { record: RecordType; snapshot: DomainErd } =>
        item.snapshot !== null,
    )
    .sort(
      (left, right) =>
        Date.parse(right.record.updatedAt) - Date.parse(left.record.updatedAt),
    );
  const legacyRecords = parsedRecords
    .filter((item) => item.snapshot === null)
    .map((item) => item.record);
  const latest = parsed[0];

  return latest
    ? {
        ...latest,
        legacyCount: legacyRecords.length,
        legacyRecords,
      }
    : null;
}
