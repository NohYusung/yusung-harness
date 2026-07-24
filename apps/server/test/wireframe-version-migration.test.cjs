const assert = require("node:assert/strict");
const {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} = require("node:fs");
const { execFileSync } = require("node:child_process");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const serverRoot = join(__dirname, "..");
const schemaPath = join(serverRoot, "prisma", "schema.prisma");
const migrationsRoot = join(serverRoot, "prisma", "migrations");

/** Prisma schema에서 지정한 model 본문을 읽는다. */
function modelBody(schema, modelName) {
  const model = schema.match(
    new RegExp(`model\\s+${modelName}\\s*\\{([\\s\\S]*?)\\n\\}`),
  )?.[1];

  assert.ok(model, `${modelName} 모델이 존재해야 한다`);
  return model;
}

/** Wireframe version column만 추가하는 migration을 찾는다. */
function findWireframeVersionMigration() {
  const matches = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(migrationsRoot, entry.name, "migration.sql"))
    .filter((path) => {
      try {
        const migration = readFileSync(path, "utf8");
        return migration.includes(
          'ALTER TABLE "Wireframe" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1',
        );
      } catch {
        return false;
      }
    });

  assert.equal(
    matches.length,
    1,
    "Wireframe version을 추가하는 migration이 하나 있어야 한다",
  );
  return matches[0];
}

test("Wireframe schema는 기본값 1의 version을 가진다", () => {
  const schema = readFileSync(schemaPath, "utf8");
  const wireframe = modelBody(schema, "Wireframe");

  assert.match(wireframe, /^\s*version\s+Int\s+@default\(1\)\s*$/m);
  assert.match(
    wireframe,
    /@@unique\(\[projectId,\s*page,\s*version\]\)/,
  );
  assert.doesNotMatch(wireframe, /@@unique\(\[projectId,\s*page\]\)/);
  assert.doesNotMatch(schema, /\bAGENT\b/);
});

test("Wireframe version migration은 관계와 page CUID별 version 무결성을 보존한다", () => {
  const migration = readFileSync(findWireframeVersionMigration(), "utf8");
  const directory = mkdtempSync(join(tmpdir(), "wireframe-version-"));
  const databasePath = join(directory, "migration.db");
  const pageCuid = "cmwireframepage000000000001";

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
          CONSTRAINT "Asset_projectId_fkey"
            FOREIGN KEY ("projectId") REFERENCES "Project" ("id")
            ON DELETE RESTRICT ON UPDATE CASCADE
        );
        CREATE TABLE "Wireframe" (
          "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          "projectId" INTEGER NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL,
          "title" TEXT NOT NULL,
          "html" TEXT NOT NULL,
          "page" TEXT NOT NULL,
          "index" TEXT NOT NULL,
          "parentId" INTEGER,
          CONSTRAINT "Wireframe_projectId_fkey"
            FOREIGN KEY ("projectId") REFERENCES "Project" ("id")
            ON DELETE RESTRICT ON UPDATE CASCADE,
          CONSTRAINT "Wireframe_parentId_fkey"
            FOREIGN KEY ("parentId") REFERENCES "Wireframe" ("id")
            ON DELETE RESTRICT ON UPDATE CASCADE
        );
        CREATE UNIQUE INDEX "Wireframe_projectId_page_key"
          ON "Wireframe"("projectId", "page");
        CREATE INDEX "Wireframe_projectId_index_idx"
          ON "Wireframe"("projectId", "index");
        CREATE INDEX "Wireframe_parentId_idx"
          ON "Wireframe"("parentId");
        CREATE TABLE "Design" (
          "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          "projectId" INTEGER NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL,
          "wireframeId" INTEGER NOT NULL,
          "assetId" INTEGER NOT NULL,
          "html" TEXT NOT NULL,
          "title" TEXT NOT NULL,
          "version" INTEGER NOT NULL DEFAULT 1,
          CONSTRAINT "Design_projectId_fkey"
            FOREIGN KEY ("projectId") REFERENCES "Project" ("id")
            ON DELETE RESTRICT ON UPDATE CASCADE,
          CONSTRAINT "Design_wireframeId_fkey"
            FOREIGN KEY ("wireframeId") REFERENCES "Wireframe" ("id")
            ON DELETE RESTRICT ON UPDATE CASCADE,
          CONSTRAINT "Design_assetId_fkey"
            FOREIGN KEY ("assetId") REFERENCES "Asset" ("id")
            ON DELETE RESTRICT ON UPDATE CASCADE
        );

        INSERT INTO "Project" ("id") VALUES (7);
        INSERT INTO "Asset" ("id", "projectId") VALUES (41, 7);
        INSERT INTO "Wireframe"
          ("id", "projectId", "createdAt", "updatedAt", "title", "html", "page", "index", "parentId")
        VALUES
          (21, 7, '2026-07-20 01:00:00', '2026-07-21 00:00:00', 'Home', '<html>Home</html>', 'home', '1', NULL),
          (22, 7, '2026-07-20 02:00:00', '2026-07-21 01:00:00', 'Login', '<html>Login</html>', '${pageCuid}', '1.1', 21);
        INSERT INTO "Design"
          ("id", "projectId", "updatedAt", "wireframeId", "assetId", "html", "title", "version")
        VALUES
          (51, 7, '2026-07-22 01:00:00', 22, 41, '<html>Design</html>', 'Login design', 1);
      `,
    });

    execFileSync("/usr/bin/sqlite3", [databasePath], { input: migration });

    const rows = execFileSync(
      "/usr/bin/sqlite3",
      [
        "-separator",
        "|",
        databasePath,
        `SELECT "id", "projectId", "createdAt", "updatedAt", "title", "html", "page", "index", COALESCE(CAST("parentId" AS TEXT), 'NULL'), "version" FROM "Wireframe" ORDER BY "id";`,
      ],
      { encoding: "utf8" },
    ).trim();
    const versionColumn = execFileSync(
      "/usr/bin/sqlite3",
      [
        databasePath,
        `SELECT name || '|' || type || '|' || "notnull" || '|' || dflt_value FROM pragma_table_info('Wireframe') WHERE name = 'version';`,
      ],
      { encoding: "utf8" },
    ).trim();
    const indexes = execFileSync(
      "/usr/bin/sqlite3",
      [
        databasePath,
        `SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'Wireframe' ORDER BY name;`,
      ],
      { encoding: "utf8" },
    ).trim();
    const versionUniqueColumns = execFileSync(
      "/usr/bin/sqlite3",
      [
        databasePath,
        `SELECT group_concat(name, '|') FROM (SELECT name FROM pragma_index_info('Wireframe_projectId_page_version_key') ORDER BY seqno);`,
      ],
      { encoding: "utf8" },
    ).trim();
    const parentForeignKey = execFileSync(
      "/usr/bin/sqlite3",
      [
        databasePath,
        `SELECT "table" || '|' || "from" || '|' || "to" || '|' || on_update || '|' || on_delete FROM pragma_foreign_key_list('Wireframe') WHERE "from" = 'parentId';`,
      ],
      { encoding: "utf8" },
    ).trim();
    const designs = execFileSync(
      "/usr/bin/sqlite3",
      [databasePath, `SELECT "id" || '|' || "wireframeId" FROM "Design";`],
      { encoding: "utf8" },
    ).trim();
    const foreignKeyViolations = execFileSync(
      "/usr/bin/sqlite3",
      [databasePath, "PRAGMA foreign_key_check;"],
      { encoding: "utf8" },
    ).trim();

    assert.equal(
      rows,
      [
        "21|7|2026-07-20 01:00:00|2026-07-21 00:00:00|Home|<html>Home</html>|home|1|NULL|1",
        `22|7|2026-07-20 02:00:00|2026-07-21 01:00:00|Login|<html>Login</html>|${pageCuid}|1.1|21|1`,
      ].join("\n"),
    );
    assert.equal(versionColumn, "version|INTEGER|1|1");
    assert.equal(
      indexes,
      "Wireframe_parentId_idx\nWireframe_projectId_index_idx\nWireframe_projectId_page_version_key",
    );
    assert.equal(versionUniqueColumns, "projectId|page|version");
    assert.equal(parentForeignKey, "Wireframe|parentId|id|CASCADE|RESTRICT");
    assert.equal(designs, "51|22");
    assert.equal(foreignKeyViolations, "");

    execFileSync(
      "/usr/bin/sqlite3",
      [
        databasePath,
        `PRAGMA foreign_keys=ON; INSERT INTO "Wireframe" ("projectId", "updatedAt", "title", "html", "page", "index", "parentId") VALUES (7, CURRENT_TIMESTAMP, 'Login error', '<html>Error</html>', 'login-error', '1.1.1', 22);`,
      ],
    );
    const insertedVersion = execFileSync(
      "/usr/bin/sqlite3",
      [databasePath, `SELECT "version" FROM "Wireframe" WHERE "page" = 'login-error';`],
      { encoding: "utf8" },
    ).trim();
    assert.equal(insertedVersion, "1");

    execFileSync(
      "/usr/bin/sqlite3",
      [
        databasePath,
        `INSERT INTO "Wireframe" ("projectId", "updatedAt", "title", "html", "page", "index", "parentId", "version") VALUES (7, CURRENT_TIMESTAMP, 'Login version 2', '<html>Login v2</html>', '${pageCuid}', '1.1', 21, 2);`,
      ],
    );
    const loginVersions = execFileSync(
      "/usr/bin/sqlite3",
      [
        databasePath,
        `SELECT "version" FROM "Wireframe" WHERE "projectId" = 7 AND "page" = '${pageCuid}' ORDER BY "version";`,
      ],
      { encoding: "utf8" },
    ).trim();
    assert.equal(loginVersions, "1\n2");

    assert.throws(() =>
      execFileSync(
        "/usr/bin/sqlite3",
        [
          databasePath,
          `INSERT INTO "Wireframe" ("projectId", "updatedAt", "title", "html", "page", "index", "parentId", "version") VALUES (7, CURRENT_TIMESTAMP, 'Duplicate login version 2', '<html>Duplicate</html>', '${pageCuid}', '1.1', 21, 2);`,
        ],
        { stdio: "ignore" },
      ),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
