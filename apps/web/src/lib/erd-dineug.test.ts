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
    expect(
      (
        document.collections as {
          memoEntities: Record<string, { value: string }>;
        }
      ).memoEntities["memo-45447b7afbd5e544f7d0"]?.value,
    ).toContain('"scope":"main"');
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

  it("databaseName 또는 full inventory fingerprint 변조를 거부한다", async () => {
    const databaseNameTamper = JSON.parse(
      JSON.stringify(createErdDocument()),
    );
    databaseNameTamper.settings.databaseName = "main";

    const fingerprintTamper = JSON.parse(
      JSON.stringify(createErdDocument()),
    );
    const metadata = fingerprintTamper.collections.memoEntities[
      "memo-45447b7afbd5e544f7d0"
    ];
    metadata.value = metadata.value.replace(
      "aa9617591e09d1950a341027458cd78dfdd2bdca7763b2846d2938bd012c50e4",
      "f".repeat(64),
    );

    for (const invalid of [databaseNameTamper, fingerprintTamper]) {
      const result = await parseErdDineugDocument(JSON.stringify(invalid));

      expect(result.data).toBeNull();
      expect(result.error).toEqual(expect.any(String));
    }
  });

  it("비ASCII table·UK·FK는 locale과 무관한 builder/server/web fingerprint를 유지한다", async () => {
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
