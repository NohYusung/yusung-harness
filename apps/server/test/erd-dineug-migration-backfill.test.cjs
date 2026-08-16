const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { mkdtempSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");
const Database = require("better-sqlite3");
const { createDineugDocument } = require("./helpers/dineug-document.cjs");

const serverRoot = join(__dirname, "..");
const migrationPath = join(
  serverRoot,
  "prisma",
  "migrations",
  "20260816010000_store_erd_dineug_documents",
  "migration.sql",
);
const backfillModuleUrl = pathToFileURL(
  join(serverRoot, "scripts", "lib", "backfill-erd-documents.mjs"),
).href;
const documentModuleUrl = pathToFileURL(
  join(serverRoot, "scripts", "lib", "dineug-erd-document.mjs"),
).href;
const legacySceneBuilderUrl = pathToFileURL(
  join(serverRoot, "scripts", "lib", "legacy-erd-to-excalidraw.mjs"),
).href;

const legacyHtml = `<!doctype html>
<html><head><title>Fixture SQLite main.db</title></head><body>
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

const createPreDineugDatabase = () => {
  const directory = mkdtempSync(join(tmpdir(), "erd-dineug-backfill-"));
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
      "scene" TEXT,
      "legacyHtml" TEXT,
      CONSTRAINT "ERD_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    );
    CREATE INDEX "ERD_projectId_idx" ON "ERD"("projectId");
    INSERT INTO "Project" ("id", "title") VALUES (7, 'Migration fixture');
  `);

  return { database, directory };
};

const migrate = (database) =>
  database.exec(readFileSync(migrationPath, "utf8"));

const insertLegacy = (database, { html = null, id, scene = null, title }) =>
  database
    .prepare(
      `INSERT INTO "ERD"
         ("id", "projectId", "createdAt", "updatedAt", "title", "scene", "legacyHtml")
       VALUES (?, 7, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      "2026-07-18T01:00:00.000Z",
      "2026-07-18T02:00:00.000Z",
      title,
      scene,
      html,
    );

test("migration은 scene과 HTML 원본 byte를 보존하고 nullable Dineug document를 추가한다", () => {
  const { database, directory } = createPreDineugDatabase();
  const rawScene = '\n { "type" : "excalidraw", "version" : 2 } \r\n';
  const rawHtml = "<!doctype html>\r\n<html><body>원본  공백</body></html>\n";

  try {
    insertLegacy(database, {
      html: rawHtml,
      id: 31,
      scene: rawScene,
      title: "Legacy project ERD",
    });

    migrate(database);

    assert.deepEqual(
      database
        .prepare(
          `SELECT name, type, "notnull" AS "notNull"
           FROM pragma_table_info('ERD') ORDER BY cid`,
        )
        .all(),
      [
        { name: "id", type: "INTEGER", notNull: 1 },
        { name: "projectId", type: "INTEGER", notNull: 1 },
        { name: "createdAt", type: "DATETIME", notNull: 1 },
        { name: "updatedAt", type: "DATETIME", notNull: 1 },
        { name: "title", type: "TEXT", notNull: 1 },
        { name: "legacyScene", type: "TEXT", notNull: 0 },
        { name: "legacyHtml", type: "TEXT", notNull: 0 },
        { name: "document", type: "TEXT", notNull: 0 },
      ],
    );
    assert.deepEqual(
      database
        .prepare(
          `SELECT "id", "projectId", "createdAt", "updatedAt", "title",
                  "document", "legacyScene", "legacyHtml"
           FROM "ERD" WHERE "id" = 31`,
        )
        .get(),
      {
        id: 31,
        projectId: 7,
        createdAt: "2026-07-18T01:00:00.000Z",
        updatedAt: "2026-07-18T02:00:00.000Z",
        title: "Legacy project ERD",
        document: null,
        legacyScene: rawScene,
        legacyHtml: rawHtml,
      },
    );
    assert.deepEqual(
      database.prepare(`PRAGMA foreign_key_list('ERD')`).all().map((row) => ({
        from: row.from,
        onDelete: row.on_delete,
        onUpdate: row.on_update,
        table: row.table,
        to: row.to,
      })),
      [
        {
          from: "projectId",
          onDelete: "RESTRICT",
          onUpdate: "CASCADE",
          table: "Project",
          to: "id",
        },
      ],
    );
    assert.deepEqual(
      database
        .prepare(`SELECT name FROM pragma_index_info('ERD_projectId_idx')`)
        .all(),
      [{ name: "projectId" }],
    );
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Dineug builder는 autoIncrement option bit를 보존하고 PK를 index collection에 중복하지 않는다", async () => {
  const {
    buildDineugErdDocument,
    validateDineugErdDocument,
  } = await import(documentModuleUrl);
  const inventory = {
    contract: "ERDInventory/2.0",
    name: "main",
    scope: "main",
    engine: "SQLite",
    sourceRevision: "test-revision",
    tables: [
      {
        qualifiedName: "users",
        comment: "identity table",
        columns: [
          {
            name: "id",
            type: "INTEGER",
            nullable: false,
            foreignKey: false,
            autoIncrement: true,
            default: null,
            comment: "primary identifier",
          },
          {
            name: "email",
            type: "TEXT",
            nullable: false,
            foreignKey: false,
            autoIncrement: false,
            default: null,
            comment: "login address",
          },
        ],
        primaryKey: { columns: ["id"] },
        uniqueConstraints: [
          { name: "users_email_key", columns: ["email"] },
        ],
      },
    ],
    relationships: [],
  };
  const document = buildDineugErdDocument(inventory);
  const columns = Object.values(document.collections.tableColumnEntities);
  const primaryColumn = columns.find(({ name }) => name === "id");
  const uniqueColumn = columns.find(({ name }) => name === "email");
  const indexes = Object.values(document.collections.indexEntities);

  assert.ok(primaryColumn);
  assert.ok(uniqueColumn);
  assert.equal(primaryColumn.options & 1, 1, "option bit 1은 autoIncrement다");
  assert.equal(primaryColumn.options & 2, 2, "option bit 2는 primaryKey다");
  assert.equal(uniqueColumn.options & 4, 4, "option bit 4는 단일 UK다");
  assert.equal(indexes.length, 1, "PK가 아니라 이름 있는 UK만 index가 된다");
  assert.equal(indexes[0].name, "users_email_key");
  assert.equal(document.doc.indexIds.length, 1);
  assert.equal(
    Object.values(document.collections.indexColumnEntities).length,
    1,
  );
  assert.doesNotThrow(() => validateDineugErdDocument(document));
  assert.throws(() =>
    buildDineugErdDocument({
      ...inventory,
      tables: [
        {
          ...inventory.tables[0],
          primaryKey: { name: "users_pkey", columns: ["id"] },
        },
      ],
    }),
  );
});

test("backfill은 legacy scene과 HTML을 canonical Dineug document로 변환하고 원본을 보존한다", async () => {
  const { backfillErdDocuments } = await import(backfillModuleUrl);
  const { canonicalJson, validateDineugErdDocument } = await import(
    documentModuleUrl
  );
  const { convertLegacyErdHtml } = await import(legacySceneBuilderUrl);
  const { database, directory } = createPreDineugDatabase();
  const legacySceneDocument = convertLegacyErdHtml(legacyHtml);
  const metadata = legacySceneDocument.elements.find(
    (element) => element.customData?.kind === "erd-metadata",
  )?.customData;

  assert.ok(metadata);
  metadata.engine = "SQLite";
  const legacyInventory = {
    contract: "ERDInventory/1.0",
    name: metadata.name,
    scope: metadata.scope,
    engine: metadata.engine,
    sourceRevision: metadata.sourceRevision,
    tables: legacySceneDocument.elements
      .filter((element) => element.customData?.kind === "table")
      .map(({ customData }) => ({
        qualifiedName: customData.qualifiedName,
        columns: customData.columns,
      }))
      .sort((left, right) =>
        left.qualifiedName.localeCompare(right.qualifiedName),
      ),
    relationships: legacySceneDocument.elements
      .filter((element) => element.customData?.kind === "foreign-key")
      .map(({ customData }) => ({
        constraint: customData.constraint,
        onDelete: customData.onDelete,
        onUpdate: customData.onUpdate,
        sourceCardinality: customData.sourceCardinality,
        sourceColumns: customData.sourceColumns,
        sourceTable: customData.sourceTable,
        targetCardinality: customData.targetCardinality,
        targetColumns: customData.targetColumns,
        targetTable: customData.targetTable,
      })),
  };
  metadata.inventoryFingerprint = createHash("sha256")
    .update(canonicalJson(legacyInventory))
    .digest("hex");
  const legacyScene = JSON.stringify(legacySceneDocument);

  try {
    insertLegacy(database, {
      id: 31,
      scene: legacyScene,
      title: "Scene source",
    });
    insertLegacy(database, {
      html: legacyHtml,
      id: 32,
      title: "HTML source",
    });
    migrate(database);

    assert.equal(backfillErdDocuments(database).converted, 2);

    const rows = database
      .prepare(
        `SELECT "id", "document", "legacyScene", "legacyHtml", "updatedAt"
         FROM "ERD" ORDER BY "id"`,
      )
      .all();
    assert.equal(rows[0].legacyScene, legacyScene);
    assert.equal(rows[0].legacyHtml, null);
    assert.equal(rows[1].legacyScene, null);
    assert.equal(rows[1].legacyHtml, legacyHtml);
    assert.equal(rows[0].updatedAt, "2026-07-18T02:00:00.000Z");
    assert.equal(rows[1].updatedAt, "2026-07-18T02:00:00.000Z");

    for (const row of rows) {
      const document = JSON.parse(row.document);

      assert.equal(document.version, "3.0.0");
      assert.doesNotThrow(() => validateDineugErdDocument(document));
      assert.deepEqual(
        Object.values(document.collections.tableEntities)
          .map(({ name }) => name)
          .sort(),
        ["posts", "users"],
      );
    }

    const firstDocuments = rows.map(({ document }) => document);
    assert.equal(backfillErdDocuments(database).converted, 0);
    assert.deepEqual(
      database
        .prepare(`SELECT "document" FROM "ERD" ORDER BY "id"`)
        .all()
        .map(({ document }) => document),
      firstDocuments,
    );
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("backfill은 valid document를 byte 그대로 skip하고 invalid document는 legacy 원본으로 복구한다", async () => {
  const { backfillErdDocuments } = await import(backfillModuleUrl);
  const { canonicalizeDineugErdDocument } = await import(documentModuleUrl);
  const { database, directory } = createPreDineugDatabase();
  const validDocument = canonicalizeDineugErdDocument(createDineugDocument());

  try {
    insertLegacy(database, {
      html: legacyHtml,
      id: 31,
      title: "Already migrated",
    });
    insertLegacy(database, {
      html: legacyHtml,
      id: 32,
      title: "Needs repair",
    });
    migrate(database);
    database
      .prepare(`UPDATE "ERD" SET "document" = ? WHERE "id" = 31`)
      .run(validDocument);
    database
      .prepare(`UPDATE "ERD" SET "document" = ? WHERE "id" = 32`)
      .run('{"version":"2.0.0"}');

    assert.equal(backfillErdDocuments(database).converted, 1);
    assert.equal(
      database.prepare(`SELECT "document" FROM "ERD" WHERE "id" = 31`).get()
        .document,
      validDocument,
    );
    assert.doesNotThrow(() =>
      canonicalizeDineugErdDocument(
        JSON.parse(
          database.prepare(`SELECT "document" FROM "ERD" WHERE "id" = 32`).get()
            .document,
        ),
      ),
    );
    assert.equal(backfillErdDocuments(database).converted, 0);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("backfill 변환 하나가 실패하면 같은 batch의 모든 document 갱신을 rollback한다", async () => {
  const { backfillErdDocuments } = await import(backfillModuleUrl);
  const { database, directory } = createPreDineugDatabase();
  const invalidHtml = "<html><body>No entity catalog</body></html>";

  try {
    insertLegacy(database, {
      html: legacyHtml,
      id: 31,
      title: "Valid legacy ERD",
    });
    insertLegacy(database, {
      html: invalidHtml,
      id: 32,
      title: "Unsupported legacy ERD",
    });
    migrate(database);

    assert.throws(() => backfillErdDocuments(database));
    assert.deepEqual(
      database
        .prepare(
          `SELECT "id", "document", "legacyScene", "legacyHtml"
           FROM "ERD" ORDER BY "id"`,
        )
        .all(),
      [
        {
          id: 31,
          document: null,
          legacyScene: null,
          legacyHtml,
        },
        {
          id: 32,
          document: null,
          legacyScene: null,
          legacyHtml: invalidHtml,
        },
      ],
    );
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
