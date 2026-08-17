const assert = require("node:assert/strict");
const {
  mkdtempSync,
  readFileSync,
  rmSync,
} = require("node:fs");
const { execFileSync } = require("node:child_process");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const test = require("node:test");

const serverRoot = join(__dirname, "..");
const schemaPath = join(serverRoot, "prisma", "schema.prisma");
const migrationPath = join(
  serverRoot,
  "prisma",
  "migrations",
  "20260817000000_remove_design_management",
  "migration.sql",
);

/** Prisma model 본문을 추출한다. */
const modelBody = (schema, modelName) =>
  schema.match(new RegExp(`model ${modelName} \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? "";

/** 임시 SQLite database에 SQL을 실행한다. */
const sqlite = (databasePath, sql) =>
  execFileSync("/usr/bin/sqlite3", [databasePath, sql], {
    encoding: "utf8",
  }).trim();

test("현재 Prisma schema는 Design 모델과 역관계를 노출하지 않는다", () => {
  const schema = readFileSync(schemaPath, "utf8");

  assert.doesNotMatch(schema, /^model Design\s*\{/m);
  for (const modelName of ["Project", "Asset", "Wireframe"]) {
    assert.doesNotMatch(
      modelBody(schema, modelName),
      /^\s*designs\s+Design\[\]/m,
      `${modelName}는 제거된 Design 역관계를 가지면 안 된다`,
    );
  }
});

test("Design 제거 migration은 테이블을 삭제하고 Asset과 Wireframe을 보존한다", () => {
  const migration = readFileSync(migrationPath, "utf8");
  const directory = mkdtempSync(join(tmpdir(), "remove-design-management-"));
  const databasePath = join(directory, "migration.db");

  try {
    execFileSync("/usr/bin/sqlite3", [databasePath], {
      input: `
        PRAGMA foreign_keys=ON;
        CREATE TABLE "Project" (
          "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT
        );
        CREATE TABLE "Asset" (
          "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          "projectId" INTEGER NOT NULL,
          "html" TEXT NOT NULL,
          "title" TEXT NOT NULL,
          CONSTRAINT "Asset_projectId_fkey"
            FOREIGN KEY ("projectId") REFERENCES "Project" ("id")
        );
        CREATE TABLE "Wireframe" (
          "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          "projectId" INTEGER NOT NULL,
          "html" TEXT NOT NULL,
          "title" TEXT NOT NULL,
          CONSTRAINT "Wireframe_projectId_fkey"
            FOREIGN KEY ("projectId") REFERENCES "Project" ("id")
        );
        CREATE TABLE "Design" (
          "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          "projectId" INTEGER NOT NULL,
          "wireframeId" INTEGER NOT NULL,
          "assetId" INTEGER NOT NULL,
          "html" TEXT NOT NULL,
          "title" TEXT NOT NULL,
          CONSTRAINT "Design_projectId_fkey"
            FOREIGN KEY ("projectId") REFERENCES "Project" ("id"),
          CONSTRAINT "Design_wireframeId_fkey"
            FOREIGN KEY ("wireframeId") REFERENCES "Wireframe" ("id"),
          CONSTRAINT "Design_assetId_fkey"
            FOREIGN KEY ("assetId") REFERENCES "Asset" ("id")
        );
        INSERT INTO "Project" ("id") VALUES (7);
        INSERT INTO "Asset" ("id", "projectId", "html", "title")
          VALUES (21, 7, '<html>Asset</html>', 'Asset');
        INSERT INTO "Wireframe" ("id", "projectId", "html", "title")
          VALUES (22, 7, '<html>Wireframe</html>', 'Wireframe');
        INSERT INTO "Design" (
          "id", "projectId", "wireframeId", "assetId", "html", "title"
        ) VALUES (31, 7, 22, 21, '<html>Design</html>', 'Design');
      `,
    });

    execFileSync("/usr/bin/sqlite3", [databasePath], { input: migration });

    assert.equal(
      sqlite(
        databasePath,
        `SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'Design';`,
      ),
      "0",
    );
    assert.equal(sqlite(databasePath, 'SELECT COUNT(*) FROM "Asset";'), "1");
    assert.equal(sqlite(databasePath, 'SELECT COUNT(*) FROM "Wireframe";'), "1");
    assert.equal(sqlite(databasePath, "PRAGMA foreign_key_check;"), "");
    assert.match(migration, /^DROP TABLE "Design";\s*$/m);
    assert.doesNotMatch(migration, /CREATE TABLE\s+"Design"|ALTER TABLE.+Design/s);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
