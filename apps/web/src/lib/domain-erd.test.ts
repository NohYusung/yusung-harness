import { describe, expect, it } from "vitest";
import { parseDomainErd } from "@/lib/domain-erd";

const validSnapshot = {
  kind: "domain-erd",
  schemaVersion: 1,
  name: "Commerce domain",
  generatedAt: "2026-07-20T00:00:00.000Z",
  sourceRevision: "abc123",
  entities: [
    {
      id: "project",
      name: "Project",
      domain: "Core",
      description: "Completed project aggregate root.",
      fields: [
        {
          name: "id",
          type: "Int",
          nullable: false,
          primaryKey: true,
          unique: true,
        },
      ],
    },
    {
      id: "plan",
      name: "Plan",
      fields: [
        {
          name: "id",
          type: "Int",
          nullable: false,
          primaryKey: true,
        },
        {
          name: "projectId",
          type: "Int",
          nullable: false,
          foreignKey: true,
        },
      ],
    },
  ],
  relationships: [
    {
      id: "project-plans",
      label: "owns",
      source: {
        entityId: "project",
        field: "id",
        cardinality: "1",
      },
      target: {
        entityId: "plan",
        field: "projectId",
        cardinality: "N",
      },
    },
  ],
} as const;

describe("parseDomainErd", () => {
  it("raw JSON domain ERD snapshot을 파싱한다", () => {
    const snapshot = parseDomainErd(JSON.stringify(validSnapshot));

    expect(snapshot).toEqual(validSnapshot);
    expect(snapshot.entities.map(({ name }) => name)).toEqual([
      "Project",
      "Plan",
    ]);
  });

  it("markdown json fence 안의 domain ERD snapshot을 파싱한다", () => {
    const content = [
      "완성 프로젝트의 도메인 모델입니다.",
      "```json",
      JSON.stringify(validSnapshot, null, 2),
      "```",
    ].join("\n");

    expect(parseDomainErd(content)).toEqual(validSnapshot);
  });

  it("legacy plain text와 깨진 relationship endpoint를 거부한다", () => {
    expect(() =>
      parseDomainErd("Project는 여러 Plan을 소유합니다."),
    ).toThrow();

    const brokenEndpoint = {
      ...validSnapshot,
      relationships: [
        {
          ...validSnapshot.relationships[0],
          target: {
            ...validSnapshot.relationships[0].target,
            entityId: "missing-entity",
          },
        },
      ],
    };

    expect(() => parseDomainErd(JSON.stringify(brokenEndpoint))).toThrow();
  });

  it("중복 entity id/name과 존재하지 않는 endpoint field를 거부한다", () => {
    const duplicateEntity = {
      ...validSnapshot,
      entities: [validSnapshot.entities[0], validSnapshot.entities[0]],
    };
    expect(() => parseDomainErd(JSON.stringify(duplicateEntity))).toThrow();

    const missingField = {
      ...validSnapshot,
      relationships: [
        {
          ...validSnapshot.relationships[0],
          source: {
            ...validSnapshot.relationships[0].source,
            field: "missingField",
          },
        },
      ],
    };
    expect(() => parseDomainErd(JSON.stringify(missingField))).toThrow();
  });

  it("server가 허용하는 timezone offset과 빈 default를 동일하게 파싱한다", () => {
    const snapshot = {
      ...validSnapshot,
      generatedAt: "2026-07-20T09:00:00+09:00",
      entities: validSnapshot.entities.map((entity, entityIndex) => ({
        ...entity,
        fields: entity.fields.map((field, fieldIndex) => ({
          ...field,
          ...(entityIndex === 0 && fieldIndex === 0 ? { default: "" } : {}),
        })),
      })),
    };

    expect(parseDomainErd(JSON.stringify(snapshot)).generatedAt).toBe(
      "2026-07-20T09:00:00+09:00",
    );
  });

  it("browser가 감당할 수 없는 총 2,000개 초과 field snapshot을 거부한다", () => {
    const entities = Array.from({ length: 21 }, (_, entityIndex) => ({
      id: `entity-${entityIndex}`,
      name: `Entity ${entityIndex}`,
      fields: Array.from({ length: 100 }, (_, fieldIndex) => ({
        name: `field-${fieldIndex}`,
        type: "String",
        nullable: false,
      })),
    }));
    const snapshot = {
      kind: "domain-erd",
      schemaVersion: 1,
      name: "Oversized domain",
      entities,
      relationships: [],
    };

    expect(() => parseDomainErd(JSON.stringify(snapshot))).toThrow();
  });
});
