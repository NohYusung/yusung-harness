const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { dirname, join } = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const ts = require("typescript");

const serverRoot = join(__dirname, "..");

const loadTypeScriptExport = (relativePath, exportName) => {
  const filename = join(serverRoot, "src", relativePath);
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  const loadedModule = new Module(filename, module);

  loadedModule.filename = filename;
  loadedModule.paths = Module._nodeModulePaths(dirname(filename));
  loadedModule._compile(output, filename);
  return loadedModule.exports[exportName];
};

const canonicalizeExcalidrawScene = loadTypeScriptExport(
  "services/erd/excalidraw-scene.ts",
  "canonicalizeExcalidrawScene",
);

const createScene = (overrides = {}) => ({
  type: "excalidraw",
  version: 2,
  source: "yusung-harness:erd",
  elements: [
    {
      id: "users-table",
      type: "rectangle",
      x: 80,
      y: 80,
      width: 260,
      height: 180,
      isDeleted: false,
      link: null,
      groupIds: [],
      boundElements: null,
      customData: {
        contract: "ERDExcalidraw/1.0",
        kind: "table",
        qualifiedName: "users",
        columns: [
          {
            name: "id",
            type: "INTEGER",
            nullable: false,
            primaryKey: true,
            foreignKey: false,
            unique: true,
            default: null,
          },
        ],
      },
    },
    {
      id: "users-title",
      type: "text",
      x: 104,
      y: 104,
      width: 72,
      height: 24,
      text: "users",
      originalText: "users",
      fontSize: 18,
      isDeleted: false,
      link: null,
      groupIds: [],
      boundElements: null,
    },
    {
      id: "erd-metadata",
      type: "text",
      x: 40,
      y: 8,
      width: 320,
      height: 24,
      text: "Project database ERD",
      originalText: "Project database ERD",
      fontSize: 18,
      isDeleted: false,
      link: null,
      groupIds: [],
      boundElements: null,
      customData: {
        contract: "ERDExcalidraw/1.0",
        kind: "erd-metadata",
        name: "Project database ERD",
        scope: "main",
        engine: "SQLite",
        sourceRevision: "test-revision",
        inventoryFingerprint: "0".repeat(64),
      },
    },
  ],
  appState: { viewBackgroundColor: "#ffffff" },
  files: {},
  ...overrides,
});

const createRelationalScene = () => {
  const scene = createScene();
  const relationshipId = "posts-user-fk";

  return {
    ...scene,
    elements: [
      {
        ...scene.elements[0],
        boundElements: [{ id: relationshipId, type: "arrow" }],
      },
      {
        id: "posts-table",
        type: "rectangle",
        x: 440,
        y: 80,
        width: 260,
        height: 220,
        isDeleted: false,
        link: null,
        groupIds: [],
        boundElements: [{ id: relationshipId, type: "arrow" }],
        customData: {
          contract: "ERDExcalidraw/1.0",
          kind: "table",
          qualifiedName: "posts",
          columns: [
            {
              name: "id",
              type: "INTEGER",
              nullable: false,
              primaryKey: true,
              foreignKey: false,
              unique: true,
              default: null,
            },
            {
              name: "user_id",
              type: "INTEGER",
              nullable: false,
              primaryKey: false,
              foreignKey: true,
              unique: false,
              default: null,
            },
          ],
        },
      },
      scene.elements[1],
      scene.elements[2],
      {
        id: relationshipId,
        type: "arrow",
        x: 340,
        y: 170,
        width: 100,
        height: 0,
        isDeleted: false,
        link: null,
        groupIds: [],
        boundElements: null,
        points: [
          [0, 0],
          [100, 0],
        ],
        startBinding: { elementId: "posts-table" },
        endBinding: { elementId: "users-table" },
        customData: {
          contract: "ERDExcalidraw/1.0",
          kind: "foreign-key",
          constraint: "posts_user_id_fkey",
          sourceTable: "posts",
          sourceColumns: ["user_id"],
          sourceCardinality: "N",
          targetTable: "users",
          targetColumns: ["id"],
          targetCardinality: "1",
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },
      },
    ],
  };
};

test("ERD scene을 검증하고 key 순서와 무관한 canonical JSON으로 저장한다", () => {
  const first = createScene({
    appState: { zoom: { value: 1 }, viewBackgroundColor: "#ffffff" },
  });
  const second = {
    files: {},
    appState: { viewBackgroundColor: "#ffffff", zoom: { value: 1 } },
    elements: first.elements.map((element) => ({
      boundElements: element.boundElements,
      groupIds: element.groupIds,
      link: element.link,
      isDeleted: element.isDeleted,
      height: element.height,
      width: element.width,
      y: element.y,
      x: element.x,
      fontSize: element.fontSize,
      originalText: element.originalText,
      text: element.text,
      customData: element.customData,
      type: element.type,
      id: element.id,
    })),
    source: "yusung-harness:erd",
    version: 2,
    type: "excalidraw",
  };

  const firstCanonical = canonicalizeExcalidrawScene(first);
  const secondCanonical = canonicalizeExcalidrawScene(second);

  assert.equal(firstCanonical, secondCanonical);
  assert.deepEqual(JSON.parse(firstCanonical), JSON.parse(JSON.stringify(first)));
});

test("strict-valid ERD scene은 metadata와 FK 의미 계약을 보존해 canonicalize한다", () => {
  const scene = createRelationalScene();
  const canonicalScene = canonicalizeExcalidrawScene(scene);

  assert.deepEqual(JSON.parse(canonicalScene), scene);
});

test("server canonicalizer는 허용 element 집합에 없는 line을 거부한다", () => {
  const scene = createScene({
    elements: [
      ...createScene().elements,
      {
        id: "unsupported-line",
        type: "line",
        x: 0,
        y: 0,
        width: 100,
        height: 0,
        isDeleted: false,
        link: null,
        groupIds: [],
        boundElements: null,
        points: [
          [0, 0],
          [100, 0],
        ],
      },
    ],
  });

  assert.throws(() => canonicalizeExcalidrawScene(scene));
});

for (const metadataField of [
  "name",
  "scope",
  "engine",
  "sourceRevision",
  "inventoryFingerprint",
]) {
  test(`server canonicalizer는 ERD metadata의 ${metadataField} 누락을 거부한다`, () => {
    const scene = createScene();
    const metadata = scene.elements.find(
      (element) => element.customData?.kind === "erd-metadata",
    );

    assert.ok(metadata);
    delete metadata.customData[metadataField];
    assert.throws(() => canonicalizeExcalidrawScene(scene));
  });
}

for (const cardinalityField of [
  "sourceCardinality",
  "targetCardinality",
]) {
  test(`server canonicalizer는 FK ${cardinalityField} 누락을 거부한다`, () => {
    const scene = createRelationalScene();
    const relationship = scene.elements.find(
      (element) => element.customData?.kind === "foreign-key",
    );

    assert.ok(relationship);
    delete relationship.customData[cardinalityField];
    assert.throws(() => canonicalizeExcalidrawScene(scene));
  });
}

test("서버 scene 계약은 dashboard parser와 같은 source/version 및 안전한 element만 허용한다", () => {
  for (const invalidScene of [
    createScene({ source: "https://example.invalid" }),
    createScene({ version: 1 }),
    createScene({ elements: [] }),
    createScene({
      elements: [
        ...createScene().elements,
        {
          id: "unsupported-frame",
          type: "frame",
          x: 0,
          y: 0,
          width: 300,
          height: 200,
          link: null,
        },
      ],
    }),
    createScene({ files: { embedded: { dataURL: "data:image/png;base64,AA==" } } }),
    createScene({
      elements: [
        ...createScene().elements,
        {
          id: "external-link",
          type: "rectangle",
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          link: "https://example.invalid",
        },
      ],
    }),
    createScene({
      elements: [
        createScene().elements[0],
        { ...createScene().elements[1], id: "users-table" },
      ],
    }),
    createScene({
      elements: [
        createScene().elements[0],
        { ...createScene().elements[1], text: "" },
      ],
    }),
    createScene({
      elements: [
        { ...createScene().elements[0], x: Number.POSITIVE_INFINITY },
        createScene().elements[1],
      ],
    }),
    createScene({
      elements: [
        ...createScene().elements,
        ...Array.from({ length: 4_998 }, (_value, index) => ({
          id: `table-${index}`,
          type: "rectangle",
          x: index,
          y: 0,
          width: 10,
          height: 10,
          link: null,
        })),
      ],
    }),
  ]) {
    assert.throws(() => canonicalizeExcalidrawScene(invalidScene));
  }
});

test("순환 참조와 5 MiB 초과 payload를 저장 전에 차단한다", () => {
  const circularScene = createScene();
  circularScene.appState.circular = circularScene;

  assert.throws(
    () => canonicalizeExcalidrawScene(circularScene),
    /JSON serializable/,
  );
  assert.throws(
    () =>
      canonicalizeExcalidrawScene({
        ...createScene(),
        padding: "x".repeat(5 * 1024 * 1024),
      }),
    /exceeds 5242880 bytes/,
  );
});
