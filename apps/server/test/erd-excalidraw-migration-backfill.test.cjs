const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join } = require("node:path");
const { pathToFileURL } = require("node:url");
const Module = require("node:module");
const test = require("node:test");
const Database = require("better-sqlite3");
const ts = require("typescript");

const serverRoot = join(__dirname, "..");
const migrationPath = join(
  serverRoot,
  "prisma",
  "migrations",
  "20260816000000_store_erd_excalidraw_scenes",
  "migration.sql",
);
const backfillModuleUrl = pathToFileURL(
  join(serverRoot, "scripts", "lib", "backfill-erd-scenes.mjs"),
).href;
const converterModuleUrl = pathToFileURL(
  join(serverRoot, "scripts", "lib", "legacy-erd-to-excalidraw.mjs"),
).href;
const validatorModuleUrl = pathToFileURL(
  join(serverRoot, "scripts", "lib", "validate-erd-excalidraw-scene.mjs"),
).href;

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
const excalidrawSceneSchema = loadTypeScriptExport(
  "services/erd/excalidraw-scene.ts",
  "excalidrawSceneSchema",
);
const canonicalizeErdExcalidrawScene = loadTypeScriptExport(
  "services/erd/excalidraw-scene.ts",
  "canonicalizeErdExcalidrawScene",
);
const canonicalizeExcalidrawScene = canonicalizeErdExcalidrawScene;

const legacyHtml = `<!doctype html>
<html><body>
  <article class="entity">
    <h3>users <small>identity</small></h3>
    <ul><li><b>id</b><span>INTEGER · PK · NOT NULL</span></li></ul>
  </article>
  <article class="entity">
    <h3>posts <small>content</small></h3>
    <ul>
      <li><b>id</b><span>INTEGER · PK · NOT NULL</span></li>
      <li><b>user_id</b><span>INTEGER · FK · NOT NULL</span></li>
    </ul>
  </article>
  <table>
    <thead><tr><th>From</th><th>Column</th><th>To</th><th>Policy</th></tr></thead>
    <tbody><tr><td>posts</td><td>user_id</td><td>users.id</td><td>CASCADE</td></tr></tbody>
  </table>
</body></html>`;

const createLegacyDatabase = () => {
  const directory = mkdtempSync(join(tmpdir(), "erd-scene-backfill-"));
  const databasePath = join(directory, "legacy.db");
  const database = new Database(databasePath);

  database.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE "Project" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "title" TEXT NOT NULL
    );
    CREATE TABLE "ERD" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "projectId" INTEGER NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      "title" TEXT NOT NULL,
      "html" TEXT NOT NULL,
      CONSTRAINT "ERD_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    );
    CREATE INDEX "ERD_projectId_idx" ON "ERD"("projectId");
    INSERT INTO "Project" ("id", "title") VALUES (7, 'Migration fixture');
  `);

  return { database, databasePath, directory };
};

test("migration은 ERD html을 legacyHtml로 byte 보존하고 nullable scene 계약을 만든다", () => {
  const { database, directory } = createLegacyDatabase();

  try {
    database
      .prepare(
        `INSERT INTO "ERD"
           ("id", "projectId", "createdAt", "updatedAt", "title", "html")
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        31,
        7,
        "2026-07-18T01:00:00.000Z",
        "2026-07-18T02:00:00.000Z",
        "Legacy project ERD",
        legacyHtml,
      );

    database.exec(readFileSync(migrationPath, "utf8"));

    assert.deepEqual(
      database
        .prepare(`SELECT name, type, "notnull" AS "notNull" FROM pragma_table_info('ERD') ORDER BY cid`)
        .all(),
      [
        { name: "id", type: "INTEGER", notNull: 1 },
        { name: "projectId", type: "INTEGER", notNull: 1 },
        { name: "createdAt", type: "DATETIME", notNull: 1 },
        { name: "updatedAt", type: "DATETIME", notNull: 1 },
        { name: "title", type: "TEXT", notNull: 1 },
        { name: "scene", type: "TEXT", notNull: 0 },
        { name: "legacyHtml", type: "TEXT", notNull: 0 },
      ],
    );
    assert.deepEqual(
      database
        .prepare(
          `SELECT "id", "projectId", "createdAt", "updatedAt", "title", "scene", "legacyHtml"
           FROM "ERD" WHERE "id" = 31`,
        )
        .get(),
      {
        id: 31,
        projectId: 7,
        createdAt: "2026-07-18T01:00:00.000Z",
        updatedAt: "2026-07-18T02:00:00.000Z",
        title: "Legacy project ERD",
        scene: null,
        legacyHtml,
      },
    );
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("service schema/canonicalizer와 backfill validator는 동일 mutation corpus를 판정한다", async () => {
  const { convertLegacyErdHtml } = await import(converterModuleUrl);
  const { validateErdExcalidrawScene } = await import(validatorModuleUrl);
  const builderScene = convertLegacyErdHtml(legacyHtml);
  const cloneBuilderScene = () => JSON.parse(JSON.stringify(builderScene));
  const element = (scene, predicate, label) => {
    const found = scene.elements.find(predicate);

    assert.ok(found, `${label} fixture element must exist`);
    return found;
  };
  const accepts = (callback) => {
    try {
      callback();
      return true;
    } catch {
      return false;
    }
  };
  const mutationCorpus = [
    {
      label: "builder scene with allowed rectangle/text/arrow types",
      accepted: true,
      mutate() {},
    },
    {
      label: "groupIds containing a non-string",
      accepted: false,
      mutate(scene) {
        scene.elements[0].groupIds = ["valid-group", 1];
      },
    },
    {
      label: "whitespace-only text",
      accepted: false,
      mutate(scene) {
        element(
          scene,
          (candidate) => candidate.type === "text" && !candidate.customData,
          "display text",
        ).text = "  \t\n";
      },
    },
    {
      label: "whitespace-only originalText",
      accepted: false,
      mutate(scene) {
        element(
          scene,
          (candidate) => candidate.type === "text" && !candidate.customData,
          "display text",
        ).originalText = "  \t\n";
      },
    },
    {
      label: "50,001-character text",
      accepted: false,
      mutate(scene) {
        element(
          scene,
          (candidate) => candidate.type === "text" && !candidate.customData,
          "display text",
        ).text = "x".repeat(50_001);
      },
    },
    {
      label: "10,001-point arrow",
      accepted: false,
      mutate(scene) {
        element(scene, (candidate) => candidate.type === "arrow", "arrow").points =
          Array.from({ length: 10_001 }, (_value, index) => [index, 0]);
      },
    },
    {
      label: "oversized metadata name",
      accepted: false,
      mutate(scene) {
        element(
          scene,
          (candidate) => candidate.customData?.kind === "erd-metadata",
          "metadata",
        ).customData.name = "m".repeat(513);
      },
    },
    {
      label: "oversized table qualifiedName",
      accepted: false,
      mutate(scene) {
        const table = element(
          scene,
          (candidate) => candidate.customData?.kind === "table",
          "table",
        );
        const originalName = table.customData.qualifiedName;
        const oversizedName = "t".repeat(513);

        table.customData.qualifiedName = oversizedName;
        for (const candidate of scene.elements) {
          if (candidate.customData?.kind === "foreign-key") {
            if (candidate.customData.sourceTable === originalName) {
              candidate.customData.sourceTable = oversizedName;
            }
            if (candidate.customData.targetTable === originalName) {
              candidate.customData.targetTable = oversizedName;
            }
          }
          if (candidate.customData?.kind === "schema-scope") {
            candidate.customData.tableNames = candidate.customData.tableNames.map(
              (tableName) =>
                tableName === originalName ? oversizedName : tableName,
            );
          }
        }
      },
    },
    {
      label: "oversized foreign-key constraint",
      accepted: false,
      mutate(scene) {
        element(
          scene,
          (candidate) => candidate.customData?.kind === "foreign-key",
          "foreign-key arrow",
        ).customData.constraint = "f".repeat(513);
      },
    },
    {
      label: "binding on a non-arrow element",
      accepted: false,
      mutate(scene) {
        const table = element(
          scene,
          (candidate) => candidate.customData?.kind === "table",
          "table",
        );
        element(
          scene,
          (candidate) => candidate.type === "text" && !candidate.customData,
          "display text",
        ).startBinding = { elementId: table.id };
      },
    },
    {
      label: "forbidden line element type",
      accepted: false,
      mutate(scene) {
        const displayText = element(
          scene,
          (candidate) => candidate.type === "text" && !candidate.customData,
          "display text",
        );

        displayText.type = "line";
        displayText.points = [
          [0, 0],
          [100, 0],
        ];
      },
    },
  ];

  assert.deepEqual(
    [...new Set(builderScene.elements.map(({ type }) => type))].sort(),
    ["arrow", "rectangle", "text"],
  );

  for (const { label, accepted, mutate } of mutationCorpus) {
    const scene = cloneBuilderScene();
    mutate(scene);
    const outcomes = {
      serviceSchema: excalidrawSceneSchema.safeParse(scene).success,
      serviceCanonicalizer: accepts(() =>
        canonicalizeErdExcalidrawScene(scene),
      ),
      backfillValidator: accepts(() => validateErdExcalidrawScene(scene)),
    };

    assert.deepEqual(
      outcomes,
      {
        serviceSchema: accepted,
        serviceCanonicalizer: accepted,
        backfillValidator: accepted,
      },
      label,
    );
  }
});

test("backfill은 알려진 legacy HTML을 의미 보존 scene으로 변환하고 재실행에 idempotent하다", async () => {
  const { backfillErdScenes, canonicalStringify } = await import(backfillModuleUrl);
  const { convertLegacyErdHtml } = await import(converterModuleUrl);
  const { validateErdExcalidrawScene } = await import(validatorModuleUrl);
  const { database, directory } = createLegacyDatabase();

  try {
    database
      .prepare(
        `INSERT INTO "ERD" ("id", "projectId", "updatedAt", "title", "html")
         VALUES (31, 7, '2026-07-18T02:00:00.000Z', 'Legacy project ERD', ?)`,
      )
      .run(legacyHtml);
    database.exec(readFileSync(migrationPath, "utf8"));

    const convertedScene = convertLegacyErdHtml(legacyHtml);
    const expectedScene = canonicalStringify(convertedScene);
    assert.doesNotThrow(() => canonicalizeExcalidrawScene(convertedScene));
    assert.doesNotThrow(() => validateErdExcalidrawScene(convertedScene));
    assert.equal(canonicalizeExcalidrawScene(convertedScene), expectedScene);
    assert.deepEqual(backfillErdScenes(database), { converted: 1, skipped: 0 });

    const firstBackfill = database
      .prepare(
        `SELECT "scene", "legacyHtml", "updatedAt" FROM "ERD" WHERE "id" = 31`,
      )
      .get();
    assert.equal(firstBackfill.scene, expectedScene);
    assert.equal(firstBackfill.legacyHtml, legacyHtml);
    assert.equal(firstBackfill.updatedAt, "2026-07-18T02:00:00.000Z");

    const scene = JSON.parse(firstBackfill.scene);
    assert.equal(scene.type, "excalidraw");
    assert.equal(scene.version, 2);
    assert.equal(scene.source, "yusung-harness:erd");
    assert.deepEqual(scene.files, {});
    assert.doesNotThrow(() => canonicalizeExcalidrawScene(scene));
    assert.deepEqual(
      scene.elements
        .filter((element) => element.customData?.kind === "table")
        .map((element) => element.customData.qualifiedName)
        .sort(),
      ["posts", "users"],
    );
    assert.equal(
      scene.elements.some(
        (element) =>
          element.customData?.kind === "foreign-key" &&
          element.customData.sourceTable === "posts" &&
          element.customData.targetTable === "users",
      ),
      true,
    );

    assert.deepEqual(backfillErdScenes(database), { converted: 0, skipped: 0 });
    assert.equal(
      database.prepare(`SELECT "scene" FROM "ERD" WHERE "id" = 31`).get()
        .scene,
      expectedScene,
    );
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("backfill은 새 계약에 invalid인 기존 scene을 legacyHtml로 재변환하고 다음 실행은 0건이다", async () => {
  const { backfillErdScenes, canonicalStringify } = await import(backfillModuleUrl);
  const { convertLegacyErdHtml } = await import(converterModuleUrl);
  const { validateErdExcalidrawScene } = await import(validatorModuleUrl);
  const { database, directory } = createLegacyDatabase();

  try {
    database
      .prepare(
        `INSERT INTO "ERD" ("id", "projectId", "updatedAt", "title", "html")
         VALUES (31, 7, '2026-07-18T02:00:00.000Z', 'Legacy project ERD', ?)`,
      )
      .run(legacyHtml);
    database.exec(readFileSync(migrationPath, "utf8"));

    const convertedScene = convertLegacyErdHtml(legacyHtml);
    const invalidStoredScene = JSON.parse(JSON.stringify(convertedScene));
    const metadata = invalidStoredScene.elements.find(
      (element) => element.customData?.kind === "erd-metadata",
    );

    assert.ok(metadata);
    delete metadata.customData.inventoryFingerprint;
    assert.throws(() => canonicalizeExcalidrawScene(invalidStoredScene));
    assert.throws(() => validateErdExcalidrawScene(invalidStoredScene));

    database
      .prepare(`UPDATE "ERD" SET "scene" = ? WHERE "id" = 31`)
      .run(canonicalStringify(invalidStoredScene));

    assert.equal(backfillErdScenes(database).converted, 1);

    const repairedScene = database
      .prepare(`SELECT "scene" FROM "ERD" WHERE "id" = 31`)
      .get().scene;
    assert.equal(repairedScene, canonicalizeExcalidrawScene(convertedScene));
    assert.doesNotThrow(() =>
      canonicalizeExcalidrawScene(JSON.parse(repairedScene)),
    );
    assert.equal(backfillErdScenes(database).converted, 0);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("backfill 변환 하나가 실패하면 같은 batch의 모든 scene 갱신을 rollback한다", async () => {
  const { backfillErdScenes } = await import(backfillModuleUrl);
  const { database, directory } = createLegacyDatabase();

  try {
    const insert = database.prepare(
      `INSERT INTO "ERD" ("id", "projectId", "updatedAt", "title", "html")
       VALUES (?, 7, CURRENT_TIMESTAMP, ?, ?)`,
    );
    insert.run(31, "Valid legacy ERD", legacyHtml);
    insert.run(32, "Unsupported legacy ERD", "<html><body>No entity catalog</body></html>");
    database.exec(readFileSync(migrationPath, "utf8"));

    assert.throws(
      () => backfillErdScenes(database),
      /Unsupported legacy ERD HTML format/,
    );
    assert.deepEqual(
      database.prepare(`SELECT "id", "scene" FROM "ERD" ORDER BY "id"`).all(),
      [
        { id: 31, scene: null },
        { id: 32, scene: null },
      ],
    );
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
