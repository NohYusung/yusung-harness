import { describe, expect, it } from "vitest";
import {
  dineugErdDocumentSchema,
  parseErdDineugDocument,
} from "./erd-dineug";
import { createErdDocument } from "@/test/fixtures/dashboard";
import internationalInventory from "../../../server/test/fixtures/dineug-international-inventory.json";
import {
  buildDineugErdDocument,
  canonicalizeDineugErdDocument,
} from "../../../server/scripts/lib/dineug-erd-document.mjs";

describe("ERD Dineug v3 document contract", () => {
  it("canonical .erd를 검증된 custom element 입력으로 복원한다", async () => {
    const document = createErdDocument();

    expect(dineugErdDocumentSchema.safeParse(document).success).toBe(true);
    await expect(
      parseErdDineugDocument(JSON.stringify(document)),
    ).resolves.toEqual({ data: document, error: null });
    expect(document.settings).toMatchObject({ databaseName: "harness" });
    expect(document).toMatchObject({
      doc: { memoIds: [] },
      collections: { memoEntities: {} },
    });
  });

  it.each([null, "", "   \n\t"])(
    "document가 %p이면 null-safe unavailable 결과를 반환한다",
    async (document) => {
      const result = await parseErdDineugDocument(document);

      expect(result.data).toBeNull();
      expect(result.error).toEqual(expect.any(String));
    },
  );

  it.each([
    ["legacy HTML", "<!doctype html><html><body>ERD</body></html>"],
    ["legacy Excalidraw scene", '{"type":"excalidraw","version":2}'],
    ["malformed JSON", "{"],
  ])(
    "%s을 Dineug document로 가장하지 않는다",
    async (_label, document) => {
      const result = await parseErdDineugDocument(document);

      expect(result.data).toBeNull();
      expect(result.error).toEqual(expect.any(String));
    },
  );

  it.each([
    ["wrong version", createErdDocument({ version: "2.0.0" })],
    [
      "missing collection",
      createErdDocument({
        collections: {
          tableEntities: {},
          tableColumnEntities: {},
          relationshipEntities: {},
          indexEntities: {},
          indexColumnEntities: {},
        },
      }),
    ],
    [
      "dangling table id",
      createErdDocument({
        doc: {
          tableIds: ["missing-table"],
          relationshipIds: [],
          indexIds: [],
          memoIds: [],
        },
      }),
    ],
  ])(
    "%s을 renderer 경계에서 거부한다",
    async (_label, document) => {
      const result = await parseErdDineugDocument(JSON.stringify(document));

      expect(result.data).toBeNull();
      expect(result.error).toEqual(expect.any(String));
    },
  );

  it("UTF-8 기준 5 MiB를 넘는 document를 JSON parse 전에 차단한다", async () => {
    const oversized = JSON.stringify({ value: "가".repeat(2 * 1024 * 1024) });
    const result = await parseErdDineugDocument(oversized);

    expect(new TextEncoder().encode(oversized).byteLength).toBeGreaterThan(
      5 * 1024 * 1024,
    );
    expect(result.data).toBeNull();
    expect(result.error).toEqual(expect.any(String));
  });

  it("비어 있지 않은 memo collection을 거부한다", async () => {
    const document = JSON.parse(JSON.stringify(createErdDocument()));
    const memoId = "memo-45447b7afbd5e544f7d0";
    document.doc.memoIds = [memoId];
    document.collections.memoEntities = {
      [memoId]: {
        id: memoId,
        value: "legacy memo",
        ui: {
          x: 700,
          y: 100,
          zIndex: 2,
          width: 620,
          height: 130,
          color: "#ede9fe",
        },
        meta: { updateAt: 0, createAt: 0 },
      },
    };

    expect(dineugErdDocumentSchema.safeParse(document).success).toBe(false);
    await expect(
      parseErdDineugDocument(JSON.stringify(document)),
    ).resolves.toMatchObject({ data: null });
  });

  it("core endpoint와 일치하지 않는 relationship ID를 거부한다", async () => {
    const document = buildDineugErdDocument(internationalInventory) as {
      doc: { relationshipIds: string[] };
      collections: {
        relationshipEntities: Record<string, { id: string }>;
      };
    };
    const originalId = document.doc.relationshipIds[0]!;
    const invalidId = `relationship-${"f".repeat(20)}`;
    const relationship = document.collections.relationshipEntities[originalId]!;
    delete document.collections.relationshipEntities[originalId];
    relationship.id = invalidId;
    document.collections.relationshipEntities[invalidId] = relationship;
    document.doc.relationshipIds[0] = invalidId;

    await expect(
      parseErdDineugDocument(JSON.stringify(document)),
    ).resolves.toMatchObject({
      data: null,
      error: expect.stringContaining("core endpoints"),
    });
  });

  it("stable table ID와 canonical table/index 순서를 검증한다", async () => {
    const tableNameTamper = JSON.parse(JSON.stringify(createErdDocument()));
    tableNameTamper.collections.tableEntities[
      tableNameTamper.doc.tableIds[0]
    ].name = "renamed_users";

    const orderTamper = buildDineugErdDocument(internationalInventory) as {
      doc: { indexIds: string[]; tableIds: string[] };
    };
    orderTamper.doc.tableIds.reverse();
    orderTamper.doc.indexIds.reverse();

    for (const invalid of [tableNameTamper, orderTamper]) {
      await expect(
        parseErdDineugDocument(JSON.stringify(invalid)),
      ).resolves.toMatchObject({ data: null });
    }
  });

  it("composite relationship 길이와 single-column UK option bit를 대칭 검증한다", async () => {
    const relationshipTamper = JSON.parse(
      JSON.stringify(buildDineugErdDocument(internationalInventory)),
    );
    const relationship = Object.values(
      relationshipTamper.collections.relationshipEntities,
    )[0] as { start: { columnIds: string[]; tableId: string } };
    const targetTable =
      relationshipTamper.collections.tableEntities[relationship.start.tableId];
    const extraColumnId = targetTable.columnIds.find(
      (id: string) => !relationship.start.columnIds.includes(id),
    );
    expect(extraColumnId).toEqual(expect.any(String));
    relationship.start.columnIds.push(extraColumnId);

    const uniqueBitTamper = JSON.parse(JSON.stringify(createErdDocument()));
    const column = uniqueBitTamper.collections.tableColumnEntities[
      uniqueBitTamper.collections.tableEntities[
        uniqueBitTamper.doc.tableIds[0]
      ].columnIds[0]
    ];
    column.options |= 4;

    for (const invalid of [relationshipTamper, uniqueBitTamper]) {
      await expect(
        parseErdDineugDocument(JSON.stringify(invalid)),
      ).resolves.toMatchObject({ data: null });
    }
  });

  it("비ASCII table·UK·FK는 locale과 무관한 canonical document를 유지한다", async () => {
    const baseline = buildDineugErdDocument(internationalInventory);
    const baselineCanonical = canonicalizeDineugErdDocument(baseline);
    const originalLocaleCompare = String.prototype.localeCompare;
    let localePerturbed: unknown;
    let localePerturbedCanonical: string | undefined;
    let parsed: Awaited<ReturnType<typeof parseErdDineugDocument>> | undefined;

    try {
      String.prototype.localeCompare = function reverseCodeUnitOrder(other) {
        const left = String(this);
        const right = String(other);
        return left < right ? 1 : left > right ? -1 : 0;
      };
      localePerturbed = buildDineugErdDocument(internationalInventory);
      localePerturbedCanonical = canonicalizeDineugErdDocument(
        localePerturbed,
      );
      parsed = await parseErdDineugDocument(
        JSON.stringify(localePerturbed),
      );
    } finally {
      String.prototype.localeCompare = originalLocaleCompare;
    }

    expect(localePerturbed).toEqual(baseline);
    expect(localePerturbedCanonical).toBe(baselineCanonical);
    expect(parsed).toEqual({ data: baseline, error: null });
  });

  it("서로 다른 source table의 같은 FK constraint 이름을 허용한다", async () => {
    const document = buildDineugErdDocument(internationalInventory);

    expect(() => canonicalizeDineugErdDocument(document)).not.toThrow();
    const result = await parseErdDineugDocument(JSON.stringify(document));

    expect(result.error).toBeNull();
    expect(result.data?.doc.relationshipIds).toHaveLength(2);
  });
});
