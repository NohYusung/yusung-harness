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

function findArtifactIdentityMigration() {
  const matches = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(migrationsRoot, entry.name, "migration.sql"))
    .filter((path) => {
      try {
        const migration = readFileSync(path, "utf8");
        return (
          migration.includes("Design_projectId_assetId_version_key") &&
          migration.includes("Wireframe_projectId_page_key")
        );
      } catch {
        return false;
      }
    });

  assert.equal(
    matches.length,
    1,
    "Design version과 Wireframe page를 함께 반영하는 migration이 하나 있어야 한다",
  );
  return matches[0];
}

test("Design version과 Wireframe page 식별자는 schema의 복합 unique 계약을 가진다", () => {
  const schema = readFileSync(schemaPath, "utf8");
  const design = modelBody(schema, "Design");
  const wireframe = modelBody(schema, "Wireframe");

  assert.match(design, /^\s*version\s+Int\s+@default\(1\)\s*$/m);
  assert.match(
    design,
    /@@unique\(\[wireframeId,\s*assetId,\s*version\]\)/,
  );
  assert.match(wireframe, /^\s*page\s+String\s+@default\(cuid\(\)\)\s*$/m);
  assert.match(wireframe, /@@unique\(\[projectId,\s*page,\s*version\]\)/);
  assert.doesNotMatch(schema, /\bAGENT\b/);
});

test("artifact identity migration은 기존 행을 손실 없이 고유 version과 page로 backfill한다", () => {
  const migration = readFileSync(findArtifactIdentityMigration(), "utf8");
  const directory = mkdtempSync(join(tmpdir(), "artifact-identities-"));
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
          CONSTRAINT "Wireframe_projectId_fkey"
            FOREIGN KEY ("projectId") REFERENCES "Project" ("id")
            ON DELETE RESTRICT ON UPDATE CASCADE
        );
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
        CREATE INDEX "Design_projectId_idx" ON "Design"("projectId");
        CREATE INDEX "Design_assetId_idx" ON "Design"("assetId");
        CREATE INDEX "Design_wireframeId_idx" ON "Design"("wireframeId");

        INSERT INTO "Project" ("id") VALUES (7);
        INSERT INTO "Asset" ("id", "projectId") VALUES (22, 7);
        INSERT INTO "Wireframe"
          ("id", "projectId", "createdAt", "updatedAt", "title", "html")
        VALUES
          (21, 7, '2026-07-20 01:00:00', '2026-07-20 01:00:00', 'Home', '<html>Home</html>'),
          (23, 7, '2026-07-20 02:00:00', '2026-07-20 02:00:00', 'Detail', '<html>Detail</html>');
        INSERT INTO "Design"
          ("id", "projectId", "createdAt", "updatedAt", "wireframeId", "assetId", "html", "title")
        VALUES
          (31, 7, '2026-07-20 03:00:00', '2026-07-20 03:00:00', 21, 22, '<html>V1</html>', 'Design V1'),
          (32, 7, '2026-07-20 04:00:00', '2026-07-20 04:00:00', 23, 22, '<html>V2</html>', 'Design V2');
      `,
    });

    execFileSync("/usr/bin/sqlite3", [databasePath], { input: migration });

    const versions = execFileSync(
      "/usr/bin/sqlite3",
      [
        "-separator",
        "|",
        databasePath,
        `SELECT "id", "version" FROM "Design" ORDER BY "id";`,
      ],
      { encoding: "utf8" },
    ).trim();
    const pages = execFileSync(
      "/usr/bin/sqlite3",
      [
        "-separator",
        "|",
        databasePath,
        `SELECT COUNT(*), COUNT(DISTINCT "page"), SUM(LENGTH("page") > 0) FROM "Wireframe";`,
      ],
      { encoding: "utf8" },
    ).trim();
    const indexes = execFileSync(
      "/usr/bin/sqlite3",
      [
        "-separator",
        "|",
        databasePath,
        `SELECT name FROM sqlite_master WHERE type = 'index' AND name IN ('Design_projectId_assetId_version_key', 'Wireframe_projectId_page_key') ORDER BY name;`,
      ],
      { encoding: "utf8" },
    ).trim();
    const foreignKeyViolations = execFileSync(
      "/usr/bin/sqlite3",
      [databasePath, "PRAGMA foreign_key_check;"],
      { encoding: "utf8" },
    ).trim();

    assert.equal(versions, "31|1\n32|2");
    assert.equal(pages, "2|2|2");
    assert.equal(
      indexes,
      "Design_projectId_assetId_version_key\nWireframe_projectId_page_key",
    );
    assert.equal(foreignKeyViolations, "");

    assert.throws(() =>
      execFileSync(
        "/usr/bin/sqlite3",
        [
          databasePath,
          `INSERT INTO "Design" ("projectId", "updatedAt", "wireframeId", "assetId", "html", "title", "version") VALUES (7, CURRENT_TIMESTAMP, 21, 22, '<html>Duplicate</html>', 'Duplicate', 1);`,
        ],
        { stdio: "ignore" },
      ),
    );
    assert.throws(() =>
      execFileSync(
        "/usr/bin/sqlite3",
        [
          databasePath,
          `INSERT INTO "Wireframe" ("projectId", "updatedAt", "title", "html", "page") SELECT "projectId", CURRENT_TIMESTAMP, "title", "html", "page" FROM "Wireframe" WHERE "id" = 21;`,
        ],
        { stdio: "ignore" },
      ),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
