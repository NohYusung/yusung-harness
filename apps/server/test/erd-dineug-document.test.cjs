const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { dirname, join } = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const ts = require("typescript");
const {
  cloneDocument,
  createDineugDocument,
} = require("./helpers/dineug-document.cjs");
const internationalInventory = require(
  "./fixtures/dineug-international-inventory.json",
);

const serverRoot = join(__dirname, "..");

const loadTypeScriptModule = (relativePath, moduleStubs = {}) => {
  const filename = join(serverRoot, "src", relativePath);
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  const loadedModule = new Module(filename, module);
  const defaultRequire = loadedModule.require.bind(loadedModule);

  loadedModule.filename = filename;
  loadedModule.paths = Module._nodeModulePaths(dirname(filename));
  loadedModule.require = (request) =>
    Object.hasOwn(moduleStubs, request)
      ? moduleStubs[request]
      : defaultRequire(request);
  loadedModule._compile(output, filename);
  return loadedModule.exports;
};

let canonicalizeDineugErdDocument;
let buildDineugErdDocument;
let dineugErdDocumentSchema;
let normalizeInventory;
let validateDineugErdDocument;

test.before(async () => {
  const sharedDocument = await import(
    join(serverRoot, "scripts", "lib", "dineug-erd-document.mjs")
  );
  const serviceDocument = loadTypeScriptModule(
    "services/erd/dineug-document.ts",
    { "../../../scripts/lib/dineug-erd-document.mjs": sharedDocument },
  );

  canonicalizeDineugErdDocument =
    serviceDocument.canonicalizeDineugErdDocument;
  buildDineugErdDocument = sharedDocument.buildDineugErdDocument;
  normalizeInventory = sharedDocument.normalizeInventory;
  dineugErdDocumentSchema = serviceDocument.dineugErdDocumentSchema;
  validateDineugErdDocument = sharedDocument.validateDineugErdDocument;
});

const reverseObjectKeys = (value) => {
  if (Array.isArray(value)) {
    return value.map(reverseObjectKeys);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([key, child]) => [key, reverseObjectKeys(child)]),
  );
};

test("Dineug v3 document를 key 순서와 무관한 canonical JSON으로 저장한다", () => {
  const document = createDineugDocument();
  const reordered = reverseObjectKeys(document);

  const canonical = canonicalizeDineugErdDocument(document);
  const parsedCanonical = JSON.parse(canonical);

  assert.equal(canonicalizeDineugErdDocument(reordered), canonical);
  assert.deepEqual(parsedCanonical, document);
  assert.equal(parsedCanonical.settings.databaseName, "harness");
  assert.deepEqual(parsedCanonical.doc.memoIds, []);
  assert.deepEqual(parsedCanonical.collections.memoEntities, {});
  assert.equal(dineugErdDocumentSchema.safeParse(document).success, true);
});

test("Dineug document schema는 v3 root와 complete collections를 요구한다", () => {
  const wrongVersion = createDineugDocument({ version: "2.0.0" });
  const missingCollection = createDineugDocument();
  delete missingCollection.collections.relationshipEntities;

  for (const invalid of [wrongVersion, missingCollection]) {
    assert.equal(dineugErdDocumentSchema.safeParse(invalid).success, false);
    assert.throws(() => canonicalizeDineugErdDocument(invalid));
  }
});

test("canonicalizer는 doc와 entity collection 사이의 dangling reference를 거부한다", () => {
  const danglingTable = createDineugDocument();
  danglingTable.doc.tableIds = ["missing-table"];

  const mismatchedColumn = createDineugDocument();
  mismatchedColumn.collections.tableColumnEntities[
    "column-ea72dfea08f0938f4531"
  ].tableId = "missing-table";

  const danglingColumn = createDineugDocument();
  danglingColumn.collections.tableEntities[
    "table-7dfb4cf67742cb066030"
  ].columnIds = ["missing-column"];
  danglingColumn.collections.tableEntities[
    "table-7dfb4cf67742cb066030"
  ].seqColumnIds = ["missing-column"];

  for (const invalid of [danglingTable, mismatchedColumn, danglingColumn]) {
    assert.throws(() => canonicalizeDineugErdDocument(invalid));
  }
});

test("canonicalizer는 entity key/id 불일치와 중복 doc id를 거부한다", () => {
  const mismatchedEntityId = createDineugDocument();
  mismatchedEntityId.collections.tableEntities[
    "table-7dfb4cf67742cb066030"
  ].id = "different-table";

  const duplicateDocId = cloneDocument(createDineugDocument());
  duplicateDocId.doc.tableIds.push("table-7dfb4cf67742cb066030");

  for (const invalid of [mismatchedEntityId, duplicateDocId]) {
    assert.throws(() => canonicalizeDineugErdDocument(invalid));
  }
});

test("canonicalizer는 비어 있지 않은 memo 계약을 거부한다", () => {
  const document = cloneDocument(createDineugDocument());
  document.doc.memoIds = ["memo-45447b7afbd5e544f7d0"];
  document.collections.memoEntities["memo-45447b7afbd5e544f7d0"] = {
    id: "memo-45447b7afbd5e544f7d0",
    value: "legacy metadata",
  };

  assert.equal(dineugErdDocumentSchema.safeParse(document).success, false);
  assert.throws(() => canonicalizeDineugErdDocument(document));
});

test("비ASCII table·UK·FK는 runtime locale과 무관한 canonical document를 유지한다", () => {
  const baseline = buildDineugErdDocument(internationalInventory);
  const baselineCanonical = canonicalizeDineugErdDocument(baseline);
  const originalLocaleCompare = String.prototype.localeCompare;
  let localePerturbed;
  let localePerturbedCanonical;

  try {
    String.prototype.localeCompare = function reverseCodeUnitOrder(other) {
      const left = String(this);
      const right = String(other);
      return left < right ? 1 : left > right ? -1 : 0;
    };
    localePerturbed = buildDineugErdDocument(internationalInventory);
    localePerturbedCanonical =
      canonicalizeDineugErdDocument(localePerturbed);
  } finally {
    String.prototype.localeCompare = originalLocaleCompare;
  }

  assert.deepEqual(localePerturbed, baseline);
  assert.equal(localePerturbedCanonical, baselineCanonical);
});

test("폐기되는 provenance와 FK 부가정보는 canonical document에 영향을 주지 않는다", () => {
  const document = buildDineugErdDocument(internationalInventory);
  const changedDiscardedFields = cloneDocument(internationalInventory);
  changedDiscardedFields.scope = "다른 scope";
  changedDiscardedFields.sourceRevision = "another-revision";
  changedDiscardedFields.relationships = changedDiscardedFields.relationships.map(
    (relationship, index) => ({
      ...relationship,
      constraint: `discarded-${index}`,
      onDelete: "NO ACTION",
      onUpdate: null,
    }),
  );
  const changedDocument = buildDineugErdDocument(changedDiscardedFields);

  assert.equal(document.doc.relationshipIds.length, 2);
  assert.deepEqual(document.doc.memoIds, []);
  assert.deepEqual(document.collections.memoEntities, {});
  assert.deepEqual(changedDocument, document);
  assert.doesNotThrow(() => validateDineugErdDocument(document));
  assert.doesNotThrow(() => canonicalizeDineugErdDocument(document));
});

test("같은 core endpoint 관계는 동일 cardinality만 한 선으로 축약한다", () => {
  const duplicate = cloneDocument(internationalInventory);
  duplicate.relationships.push({
    ...duplicate.relationships[0],
    constraint: "duplicate-constraint",
    onDelete: "RESTRICT",
  });
  const document = buildDineugErdDocument(duplicate);

  assert.equal(document.doc.relationshipIds.length, 2);

  const conflicting = cloneDocument(duplicate);
  conflicting.relationships.at(-1).sourceCardinality = "0..N";
  assert.throws(() => buildDineugErdDocument(conflicting));
});

test("canonicalizer는 core endpoint와 일치하지 않는 relationship ID를 거부한다", () => {
  const document = buildDineugErdDocument(internationalInventory);
  const currentId = document.doc.relationshipIds[0];
  const invalidId = `relationship-${"f".repeat(20)}`;
  const relationship = document.collections.relationshipEntities[currentId];

  delete document.collections.relationshipEntities[currentId];
  document.collections.relationshipEntities[invalidId] = {
    ...relationship,
    id: invalidId,
  };
  document.doc.relationshipIds[0] = invalidId;

  assert.throws(() => canonicalizeDineugErdDocument(document));
});

test("builder canvas는 마지막 table 경계에 padding 100만 더한다", () => {
  const inventory = cloneDocument(internationalInventory);
  const tableTemplate = inventory.tables[0];
  inventory.tables = Array.from({ length: 10 }, (_, index) => ({
    ...cloneDocument(tableTemplate),
    qualifiedName: `schema.table_${index.toString().padStart(2, "0")}`,
    columns: tableTemplate.columns.map((column) => ({
      ...cloneDocument(column),
      foreignKey: false,
    })),
  }));
  inventory.relationships = [];
  const document = buildDineugErdDocument(inventory);
  const tableBottom = Math.max(
    ...Object.values(document.collections.tableEntities).map(
      (table) => table.ui.y + 88 + table.columnIds.length * 30,
    ),
  );
  const tableRight = Math.max(
    ...Object.values(document.collections.tableEntities).map(
      (table) => table.ui.x + 420,
    ),
  );

  assert.equal(document.settings.height, tableBottom + 100);
  assert.equal(document.settings.width, Math.max(2000, tableRight + 100));
});

test("inventory collection budget은 memo 없는 실제 5개 entity collection만 계산한다", () => {
  const inventory = {
    contract: "ERDInventory/2.0",
    name: "budget",
    scope: "main",
    engine: "SQLite",
    sourceRevision: "budget-test",
    tables: [
      {
        qualifiedName: "wide_table",
        comment: "",
        columns: Array.from({ length: 4_999 }, (_, index) => ({
          name: `column_${index}`,
          type: "INTEGER",
          nullable: true,
          foreignKey: false,
          autoIncrement: false,
          default: null,
          comment: "",
        })),
        primaryKey: null,
        uniqueConstraints: [],
      },
    ],
    relationships: [],
  };

  assert.doesNotThrow(() => normalizeInventory(inventory));
  inventory.tables[0].columns.push({
    name: "column_4999",
    type: "INTEGER",
    nullable: true,
    foreignKey: false,
    autoIncrement: false,
    default: null,
    comment: "",
  });
  assert.throws(() => normalizeInventory(inventory));
});
