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
  assert.match(
    parsedCanonical.collections.memoEntities[
      "memo-45447b7afbd5e544f7d0"
    ].value,
    /"scope":"main"/,
  );
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

test("canonicalizer는 databaseName 또는 full inventory fingerprint 변조를 거부한다", () => {
  const databaseNameTamper = cloneDocument(createDineugDocument());
  databaseNameTamper.settings.databaseName = "main";

  const fingerprintTamper = cloneDocument(createDineugDocument());
  fingerprintTamper.collections.memoEntities[
    "memo-45447b7afbd5e544f7d0"
  ].value = fingerprintTamper.collections.memoEntities[
    "memo-45447b7afbd5e544f7d0"
  ].value.replace(
    "aa9617591e09d1950a341027458cd78dfdd2bdca7763b2846d2938bd012c50e4",
    "f".repeat(64),
  );

  for (const invalid of [databaseNameTamper, fingerprintTamper]) {
    assert.equal(dineugErdDocumentSchema.safeParse(invalid).success, false);
    assert.throws(() => canonicalizeDineugErdDocument(invalid));
  }
});

test("비ASCII table·UK·FK는 runtime locale과 무관한 builder/server fingerprint를 유지한다", () => {
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

test("서로 다른 source table은 같은 FK constraint 이름을 재사용할 수 있다", () => {
  const document = buildDineugErdDocument(internationalInventory);
  const foreignKeyMemos = Object.values(
    document.collections.memoEntities,
  ).filter(({ value }) =>
    value.startsWith("[yusung-harness:fk/1.0]\n"),
  );

  assert.equal(document.doc.relationshipIds.length, 2);
  assert.equal(foreignKeyMemos.length, 2);
  const foreignKeys = foreignKeyMemos.map(({ value }) =>
    JSON.parse(value.slice(value.indexOf("\n") + 1)),
  );
  assert.deepEqual(
    new Set(foreignKeys.map(({ constraint }) => constraint)),
    new Set(["사용자_외래키"]),
  );
  assert.deepEqual(
    new Set(foreignKeys.map(({ sourceTable }) => sourceTable)),
    new Set(["스키마.주문", "스키마.Z문의"]),
  );
  assert.doesNotThrow(() => validateDineugErdDocument(document));
  assert.doesNotThrow(() => canonicalizeDineugErdDocument(document));
});
