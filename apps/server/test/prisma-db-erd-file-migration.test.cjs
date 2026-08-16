const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const serverRoot = join(__dirname, "..");
const schema = readFileSync(join(serverRoot, "prisma", "schema.prisma"), "utf8");
const migrationsRoot = join(serverRoot, "prisma", "migrations");

const contracts = {
  DB: [
    ["id", "Int", "INTEGER", 1],
    ["projectId", "Int", "INTEGER", 1],
    ["createdAt", "DateTime", "DATETIME", 1],
    ["updatedAt", "DateTime", "DATETIME", 1],
    ["title", "String", "TEXT", 1],
    ["content", "String", "TEXT", 1],
  ],
  ERD: [
    ["id", "Int", "INTEGER", 1],
    ["projectId", "Int", "INTEGER", 1],
    ["createdAt", "DateTime", "DATETIME", 1],
    ["updatedAt", "DateTime", "DATETIME", 1],
    ["title", "String", "TEXT", 1],
    ["scene", "String?", "TEXT", 0],
    ["legacyHtml", "String?", "TEXT", 0],
  ],
  File: [
    ["id", "Int", "INTEGER", 1],
    ["projectId", "Int", "INTEGER", 1],
    ["createdAt", "DateTime", "DATETIME", 1],
    ["updatedAt", "DateTime", "DATETIME", 1],
    ["title", "String", "TEXT", 1],
    ["mimeType", "String", "TEXT", 1],
    ["size", "Int", "INTEGER", 1],
    ["content", "Bytes?", "BLOB", 0],
    ["isUploaded", "Boolean", "BOOLEAN", 1],
    ["uploadUrl", "String?", "TEXT", 0],
  ],
};

const modelBody = (modelName) => {
  const match = schema.match(
    new RegExp(`model\\s+${modelName}\\s*\\{([\\s\\S]*?)\\n\\}`),
  );

  assert.ok(match, `${modelName} 모델이 존재해야 한다`);
  return match[1];
};

const migrationPaths = () =>
  readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => join(migrationsRoot, entry.name, "migration.sql"));

const sqlite = (databasePath, sql) =>
  execFileSync("/usr/bin/sqlite3", ["-batch", "-bail", databasePath], {
    encoding: "utf8",
    input: sql,
  }).trim();

const sqliteJson = (databasePath, sql) => {
  const output = execFileSync(
    "/usr/bin/sqlite3",
    ["-json", "-readonly", databasePath, sql],
    { encoding: "utf8" },
  ).trim();

  return output ? JSON.parse(output) : [];
};

test("DB, ERD, File schema와 migration은 동일한 저장 계약을 제공한다", () => {
  const project = modelBody("Project");
  const migrations = migrationPaths();
  const matchingMigrations = migrations.filter((migrationPath) => {
    const migration = readFileSync(migrationPath, "utf8");

    return Object.keys(contracts).every((modelName) =>
      migration.includes(`CREATE TABLE "${modelName}"`),
    );
  });

  assert.match(project, /^\s*databases\s+DB\[\]\s*$/m);
  assert.match(project, /^\s*erds\s+ERD\[\]\s*$/m);
  assert.match(project, /^\s*files\s+File\[\]\s*$/m);
  assert.equal(
    matchingMigrations.length,
    1,
    "DB, ERD, File을 함께 생성하는 migration이 하나 있어야 한다",
  );

  for (const [modelName, fields] of Object.entries(contracts)) {
    const model = modelBody(modelName);

    for (const [fieldName, prismaType] of fields) {
      assert.match(
        model,
        new RegExp(
          `^\\s*${fieldName}\\s+${prismaType.replace("?", "\\?")}(?=\\s|$)`,
          "m",
        ),
        `${modelName}.${fieldName}의 Prisma 타입이 일치해야 한다`,
      );
    }
    assert.match(model, /@@index\(\s*\[projectId\]\s*\)/);
  }

  const directory = mkdtempSync(join(tmpdir(), "db-erd-file-migration-"));
  const databasePath = join(directory, "migration.db");

  try {
    for (const migrationPath of migrations) {
      sqlite(databasePath, readFileSync(migrationPath, "utf8"));
    }

    for (const [modelName, fields] of Object.entries(contracts)) {
      const columns = sqliteJson(
        databasePath,
        `SELECT name, type, "notnull" AS "notNull",
                dflt_value AS "defaultValue", pk
         FROM pragma_table_info('${modelName}') ORDER BY cid;`,
      );

      assert.deepEqual(
        columns.map(({ name, type, notNull }) => [name, type, notNull]),
        fields.map(([name, , type, notNull]) => [name, type, notNull]),
      );
      assert.equal(columns.find(({ name }) => name === "id")?.pk, 1);
      assert.equal(
        columns.find(({ name }) => name === "createdAt")?.defaultValue,
        "CURRENT_TIMESTAMP",
      );
      if (modelName === "File") {
        assert.equal(
          columns.find(({ name }) => name === "isUploaded")?.defaultValue,
          "false",
        );
      }

      assert.deepEqual(
        sqliteJson(
          databasePath,
          `SELECT "table" AS "targetTable", "from" AS "sourceColumn",
                  "to" AS "targetColumn", on_delete AS "onDelete",
                  on_update AS "onUpdate"
           FROM pragma_foreign_key_list('${modelName}');`,
        ),
        [
          {
            targetTable: "Project",
            sourceColumn: "projectId",
            targetColumn: "id",
            onDelete: "RESTRICT",
            onUpdate: "CASCADE",
          },
        ],
      );
      assert.deepEqual(
        sqliteJson(
          databasePath,
          `SELECT name FROM pragma_index_info('${modelName}_projectId_idx') ORDER BY seqno;`,
        ),
        [{ name: "projectId" }],
      );
    }

    sqlite(
      databasePath,
      `PRAGMA foreign_keys=ON;
       INSERT INTO "Project" ("id", "title", "description")
       VALUES (701, 'Migration project', 'DB, ERD, File contract');
       INSERT INTO "DB" ("projectId", "updatedAt", "title", "content")
       VALUES (701, CURRENT_TIMESTAMP, 'users', '# users');
       INSERT INTO "ERD" ("projectId", "updatedAt", "title", "scene")
       VALUES (701, CURRENT_TIMESTAMP, 'main', '{"type":"excalidraw"}');
       INSERT INTO "File" ("projectId", "updatedAt", "title", "mimeType", "size")
       VALUES (701, CURRENT_TIMESTAMP, 'schema.png', 'image/png', 42);`,
    );

    assert.deepEqual(
      sqliteJson(
        databasePath,
        `SELECT "isUploaded", "content" IS NULL AS contentIsNull,
                "uploadUrl" IS NULL AS uploadUrlIsNull,
                "createdAt" IS NOT NULL AS createdAtDefaulted
         FROM "File" WHERE "projectId" = 701;`,
      ),
      [
        {
          isUploaded: 0,
          contentIsNull: 1,
          uploadUrlIsNull: 1,
          createdAtDefaulted: 1,
        },
      ],
    );

    sqlite(
      databasePath,
      `PRAGMA foreign_keys=ON;
       UPDATE "Project" SET "id" = 702 WHERE "id" = 701;`,
    );
    for (const modelName of Object.keys(contracts)) {
      assert.deepEqual(
        sqliteJson(
          databasePath,
          `SELECT "projectId" FROM "${modelName}";`,
        ),
        [{ projectId: 702 }],
      );
    }
    assert.throws(() =>
      execFileSync("/usr/bin/sqlite3", ["-batch", "-bail", databasePath], {
        input: `PRAGMA foreign_keys=ON;
                DELETE FROM "Project" WHERE "id" = 702;`,
        stdio: ["pipe", "ignore", "ignore"],
      }),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
