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

function modelBody(schema, modelName) {
  const model = schema.match(
    new RegExp(`model\\s+${modelName}\\s*\\{([\\s\\S]*?)\\n\\}`),
  )?.[1];

  assert.ok(model, `${modelName} 모델이 존재해야 한다`);
  return model;
}

function findIntegerIndexMigration() {
  const matches = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(migrationsRoot, entry.name, "migration.sql"))
    .filter((path) => {
      try {
        const migration = readFileSync(path, "utf8");
        return (
          migration.includes('"index" INTEGER NOT NULL') &&
          migration.includes("ROW_NUMBER() OVER") &&
          migration.includes("Wireframe_projectId_index_idx")
        );
      } catch {
        return false;
      }
    });

  assert.equal(
    matches.length,
    1,
    "Wireframe journey index를 반영하는 migration이 하나 있어야 한다",
  );
  return matches[0];
}

function findHierarchyMigration() {
  const matches = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(migrationsRoot, entry.name, "migration.sql"))
    .filter((path) => {
      try {
        const migration = readFileSync(path, "utf8");
        return (
          migration.includes('"index" TEXT NOT NULL') &&
          migration.includes('"parentId" INTEGER') &&
          migration.includes("Wireframe_parentId_idx")
        );
      } catch {
        return false;
      }
    });

  assert.equal(
    matches.length,
    1,
    "Wireframe hierarchy를 반영하는 migration이 하나 있어야 한다",
  );
  return matches[0];
}

test("Wireframe schema는 String path와 제한 삭제 self hierarchy를 가진다", () => {
  const schema = readFileSync(schemaPath, "utf8");
  const wireframe = modelBody(schema, "Wireframe");

  assert.match(wireframe, /^\s*index\s+String\s*$/m);
  assert.match(wireframe, /^\s*parentId\s+Int\?\s*$/m);
  assert.match(
    wireframe,
    /\bparent\s+Wireframe\?\s+@relation\(\s*"WireframeHierarchy"\s*,\s*fields:\s*\[parentId\]\s*,\s*references:\s*\[id\]\s*,\s*onDelete:\s*Restrict\s*,\s*onUpdate:\s*Cascade\s*\)/,
  );
  assert.match(
    wireframe,
    /^\s*children\s+Wireframe\[\]\s+@relation\("WireframeHierarchy"\)\s*$/m,
  );
  assert.match(wireframe, /@@index\(\[projectId,\s*index\]\)/);
  assert.match(wireframe, /@@index\(\[parentId\]\)/);
  assert.doesNotMatch(wireframe, /@@unique\(\[projectId,\s*index\]\)/);
  assert.doesNotMatch(schema, /\bAGENT\b/);
});

test("초기 Wireframe index migration은 프로젝트별 여정 순서를 backfill한다", () => {
  const migration = readFileSync(findIntegerIndexMigration(), "utf8");
  const directory = mkdtempSync(join(tmpdir(), "wireframe-index-"));
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
          CONSTRAINT "Wireframe_projectId_fkey"
            FOREIGN KEY ("projectId") REFERENCES "Project" ("id")
            ON DELETE RESTRICT ON UPDATE CASCADE
        );
        CREATE UNIQUE INDEX "Wireframe_projectId_page_key"
          ON "Wireframe"("projectId", "page");
        CREATE INDEX "Wireframe_projectId_idx" ON "Wireframe"("projectId");
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

        INSERT INTO "Project" ("id") VALUES (7), (8);
        INSERT INTO "Asset" ("id", "projectId") VALUES (41, 7), (42, 8);
        INSERT INTO "Wireframe"
          ("id", "projectId", "createdAt", "updatedAt", "title", "html", "page")
        VALUES
          (23, 7, '2026-07-20 02:00:00', '2026-07-21 02:00:00', 'Checkout', '<html>Checkout</html>', 'checkout'),
          (22, 7, '2026-07-20 01:00:00', '2026-07-21 01:00:00', 'Cart', '<html>Cart</html>', 'cart'),
          (21, 7, '2026-07-20 01:00:00', '2026-07-21 00:00:00', 'Home', '<html>Home</html>', 'home'),
          (24, 8, '2026-07-19 01:00:00', '2026-07-21 03:00:00', 'Other home', '<html>Other</html>', 'home');
        INSERT INTO "Design"
          ("id", "projectId", "createdAt", "updatedAt", "wireframeId", "assetId", "html", "title", "version")
        VALUES
          (51, 7, '2026-07-22 01:00:00', '2026-07-22 01:00:00', 21, 41, '<html>Design home</html>', 'Design home', 1),
          (52, 8, '2026-07-22 02:00:00', '2026-07-22 02:00:00', 24, 42, '<html>Design other</html>', 'Design other', 1);
      `,
    });

    execFileSync("/usr/bin/sqlite3", [databasePath], { input: migration });

    const rows = execFileSync(
      "/usr/bin/sqlite3",
      [
        "-separator",
        "|",
        databasePath,
        `SELECT "id", "projectId", "createdAt", "updatedAt", "title", "html", "page", "index" FROM "Wireframe" ORDER BY "id";`,
      ],
      { encoding: "utf8" },
    ).trim();
    const designs = execFileSync(
      "/usr/bin/sqlite3",
      [databasePath, `SELECT "id" || '|' || "wireframeId" FROM "Design" ORDER BY "id";`],
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
    const standaloneProjectIndexCount = execFileSync(
      "/usr/bin/sqlite3",
      [
        databasePath,
        `SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'Wireframe_projectId_idx';`,
      ],
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
        "21|7|2026-07-20 01:00:00|2026-07-21 00:00:00|Home|<html>Home</html>|home|1",
        "22|7|2026-07-20 01:00:00|2026-07-21 01:00:00|Cart|<html>Cart</html>|cart|2",
        "23|7|2026-07-20 02:00:00|2026-07-21 02:00:00|Checkout|<html>Checkout</html>|checkout|3",
        "24|8|2026-07-19 01:00:00|2026-07-21 03:00:00|Other home|<html>Other</html>|home|1",
      ].join("\n"),
    );
    assert.equal(designs, "51|21\n52|24");
    assert.equal(
      indexes,
      "Wireframe_projectId_index_idx\nWireframe_projectId_page_key",
    );
    assert.equal(standaloneProjectIndexCount, "0");
    assert.equal(foreignKeyViolations, "");

    assert.throws(() =>
      execFileSync(
        "/usr/bin/sqlite3",
        [
          databasePath,
          `INSERT INTO "Wireframe" ("projectId", "updatedAt", "title", "html", "page") VALUES (7, CURRENT_TIMESTAMP, 'Missing index', '<html>Missing</html>', 'missing');`,
        ],
        { stdio: "ignore" },
      ),
    );
    execFileSync(
      "/usr/bin/sqlite3",
      [
        databasePath,
        `INSERT INTO "Wireframe" ("projectId", "updatedAt", "title", "html", "page", "index") VALUES (7, CURRENT_TIMESTAMP, 'Duplicate index', '<html>Duplicate</html>', 'duplicate-index', 1);`,
      ],
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Wireframe hierarchy migration은 Int index를 root String path로 전환하고 관계를 보존한다", () => {
  const migration = readFileSync(findHierarchyMigration(), "utf8");
  const directory = mkdtempSync(join(tmpdir(), "wireframe-hierarchy-"));
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
          "index" INTEGER NOT NULL,
          CONSTRAINT "Wireframe_projectId_fkey"
            FOREIGN KEY ("projectId") REFERENCES "Project" ("id")
            ON DELETE RESTRICT ON UPDATE CASCADE
        );
        CREATE UNIQUE INDEX "Wireframe_projectId_page_key"
          ON "Wireframe"("projectId", "page");
        CREATE INDEX "Wireframe_projectId_index_idx"
          ON "Wireframe"("projectId", "index");
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

        INSERT INTO "Project" ("id") VALUES (7), (8);
        INSERT INTO "Asset" ("id", "projectId") VALUES (41, 7), (42, 8);
        INSERT INTO "Wireframe"
          ("id", "projectId", "createdAt", "updatedAt", "title", "html", "page", "index")
        VALUES
          (21, 7, '2026-07-20 01:00:00', '2026-07-21 00:00:00', 'Home', '<html>Home</html>', 'home', 1),
          (22, 7, '2026-07-20 02:00:00', '2026-07-21 01:00:00', 'Cart', '<html>Cart</html>', 'cart', 2),
          (24, 8, '2026-07-19 01:00:00', '2026-07-21 03:00:00', 'Other home', '<html>Other</html>', 'home', 1);
        INSERT INTO "Design"
          ("id", "projectId", "createdAt", "updatedAt", "wireframeId", "assetId", "html", "title", "version")
        VALUES
          (51, 7, '2026-07-22 01:00:00', '2026-07-22 01:00:00', 21, 41, '<html>Design home</html>', 'Design home', 1),
          (52, 8, '2026-07-22 02:00:00', '2026-07-22 02:00:00', 24, 42, '<html>Design other</html>', 'Design other', 1);
      `,
    });

    execFileSync("/usr/bin/sqlite3", [databasePath], { input: migration });

    const rows = execFileSync(
      "/usr/bin/sqlite3",
      [
        "-separator",
        "|",
        databasePath,
        `SELECT "id", "projectId", "createdAt", "updatedAt", "title", "html", "page", "index", typeof("index"), COALESCE(CAST("parentId" AS TEXT), 'NULL') FROM "Wireframe" ORDER BY "id";`,
      ],
      { encoding: "utf8" },
    ).trim();
    const designs = execFileSync(
      "/usr/bin/sqlite3",
      [databasePath, `SELECT "id" || '|' || "wireframeId" FROM "Design" ORDER BY "id";`],
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
    const parentColumn = execFileSync(
      "/usr/bin/sqlite3",
      [
        databasePath,
        `SELECT name || '|' || type || '|' || "notnull" FROM pragma_table_info('Wireframe') WHERE name = 'parentId';`,
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
    const foreignKeyViolations = execFileSync(
      "/usr/bin/sqlite3",
      [databasePath, "PRAGMA foreign_key_check;"],
      { encoding: "utf8" },
    ).trim();

    assert.equal(
      rows,
      [
        "21|7|2026-07-20 01:00:00|2026-07-21 00:00:00|Home|<html>Home</html>|home|1|text|NULL",
        "22|7|2026-07-20 02:00:00|2026-07-21 01:00:00|Cart|<html>Cart</html>|cart|2|text|NULL",
        "24|8|2026-07-19 01:00:00|2026-07-21 03:00:00|Other home|<html>Other</html>|home|1|text|NULL",
      ].join("\n"),
    );
    assert.equal(designs, "51|21\n52|24");
    assert.equal(
      indexes,
      "Wireframe_parentId_idx\nWireframe_projectId_index_idx\nWireframe_projectId_page_key",
    );
    assert.equal(parentColumn, "parentId|INTEGER|0");
    assert.equal(parentForeignKey, "Wireframe|parentId|id|CASCADE|RESTRICT");
    assert.equal(foreignKeyViolations, "");

    execFileSync(
      "/usr/bin/sqlite3",
      [
        databasePath,
        `INSERT INTO "Wireframe" ("projectId", "updatedAt", "title", "html", "page", "index", "parentId") VALUES (7, CURRENT_TIMESTAMP, 'Duplicate root', '<html>Duplicate</html>', 'duplicate-root', '1', NULL);`,
      ],
    );
    execFileSync(
      "/usr/bin/sqlite3",
      [
        databasePath,
        `PRAGMA foreign_keys=ON; INSERT INTO "Wireframe" ("projectId", "updatedAt", "title", "html", "page", "index", "parentId") VALUES (7, CURRENT_TIMESTAMP, 'Child', '<html>Child</html>', 'child', '1.1', 21);`,
      ],
    );
    assert.throws(() =>
      execFileSync(
        "/usr/bin/sqlite3",
        [
          databasePath,
          `PRAGMA foreign_keys=ON; INSERT INTO "Wireframe" ("projectId", "updatedAt", "title", "html", "page", "index", "parentId") VALUES (7, CURRENT_TIMESTAMP, 'Orphan', '<html>Orphan</html>', 'orphan', '1.2', 999);`,
        ],
        { stdio: "ignore" },
      ),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
