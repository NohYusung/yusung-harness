const assert = require("node:assert/strict");
const {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { execFileSync } = require("node:child_process");
const test = require("node:test");

const serverRoot = join(__dirname, "..");
const migrationsRoot = join(serverRoot, "prisma", "migrations");

/** new_Domain self hierarchy를 생성하는 신규 migration을 찾는다. */
function findDomainHierarchyMigration() {
  const migrations = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(migrationsRoot, entry.name, "migration.sql"))
    .filter((path) => {
      const sql = readFileSync(path, "utf8");
      return /CREATE TABLE\s+["']new_Domain["']/.test(sql) &&
        /Domain_parentId_fkey/.test(sql);
    });

  assert.equal(migrations.length, 1, "Domain hierarchy migration이 하나여야 한다");
  return migrations[0];
}

/** SQLite SQL literal에 넣을 text를 안전하게 quote한다. */
function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

test("Domain Prisma model은 project/title unique와 nullable unlimited self hierarchy를 선언한다", () => {
  const schema = readFileSync(join(serverRoot, "prisma", "schema.prisma"), "utf8");
  const domain = schema.match(/model\s+Domain\s*\{([\s\S]*?)\n\}/)?.[1];

  assert.ok(domain, "Domain model이 존재해야 한다");
  assert.match(domain, /^\s*parentId\s+Int\?\s*$/m);
  assert.match(
    domain,
    /parent\s+Domain\?\s+@relation\("DomainHierarchy",\s*fields:\s*\[parentId\],\s*references:\s*\[id\],\s*onDelete:\s*Restrict,\s*onUpdate:\s*Cascade\)/,
  );
  assert.match(domain, /children\s+Domain\[\]\s+@relation\("DomainHierarchy"\)/);
  assert.match(domain, /@@unique\(\[projectId,\s*title\]\)/);
  assert.match(domain, /@@index\(\[projectId\]\)/);
  assert.match(domain, /@@index\(\[parentId\]\)/);
});

test("Domain hierarchy migration은 Markdown metadata를 보존하고 exact ERD v1만 제거한다", () => {
  const migration = readFileSync(findDomainHierarchyMigration(), "utf8");
  const directory = mkdtempSync(join(tmpdir(), "domain-hierarchy-"));
  const databasePath = join(directory, "migration.db");
  const createdAt = "2026-08-01 01:02:03";
  const updatedAt = "2026-08-02 04:05:06";
  const records = [
    [1, 7, "  Orders  ", "# Orders\n\nOrder lifecycle."],
    [2, 7, "Legacy ERD", JSON.stringify({
      kind: "domain-erd",
      schemaVersion: 1,
      entities: [],
      relationships: [],
    })],
    [8, 7, "Orders", JSON.stringify({
      kind: "domain-erd",
      schemaVersion: 1,
      entities: [],
      relationships: [],
    })],
    [9, 7, "Legacy ERD", JSON.stringify({
      kind: "domain-erd",
      schemaVersion: 1,
      entities: [],
      relationships: [],
    })],
    [3, 7, "Malformed ERD", JSON.stringify({
      kind: "domain-erd",
      schemaVersion: 1,
    })],
    [4, 7, "ERD v2", JSON.stringify({
      kind: "domain-erd",
      schemaVersion: 2,
      entities: [],
      relationships: [],
    })],
    [5, 7, "JSON prose", "{not-json"],
    [6, 7, "Fenced ERD", "```json\n{\"kind\":\"domain-erd\",\"schemaVersion\":1,\"entities\":[],\"relationships\":[]}\n```"],
    [7, 8, "Orders", "# Other project orders"],
  ];

  try {
    execFileSync("/usr/bin/sqlite3", [databasePath], {
      input: `
        PRAGMA foreign_keys=ON;
        CREATE TABLE "Project" (
          "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT
        );
        CREATE TABLE "Domain" (
          "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          "projectId" INTEGER NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL,
          "title" TEXT NOT NULL,
          "content" TEXT NOT NULL,
          CONSTRAINT "Domain_projectId_fkey"
            FOREIGN KEY ("projectId") REFERENCES "Project" ("id")
            ON DELETE RESTRICT ON UPDATE CASCADE
        );
        CREATE INDEX "Domain_projectId_idx" ON "Domain"("projectId");
        INSERT INTO "Project" ("id") VALUES (7), (8);
        ${records.map(([id, projectId, title, content]) => `
          INSERT INTO "Domain"
            ("id", "projectId", "createdAt", "updatedAt", "title", "content")
          VALUES
            (${id}, ${projectId}, ${sqlString(createdAt)}, ${sqlString(updatedAt)}, ${sqlString(title)}, ${sqlString(content)});
        `).join("\n")}
      `,
    });

    execFileSync("/usr/bin/sqlite3", [databasePath], { input: migration });

    const rows = JSON.parse(
      execFileSync(
        "/usr/bin/sqlite3",
        [
          "-json",
          databasePath,
          `SELECT "id", "projectId", "createdAt", "updatedAt", "title", "content", "parentId" FROM "Domain" ORDER BY "id";`,
        ],
        { encoding: "utf8" },
      ),
    );
    assert.deepEqual(
      rows.map(({ id }) => id),
      [1, 3, 4, 5, 6, 7],
    );
    assert.deepEqual(rows[0], {
      id: 1,
      projectId: 7,
      createdAt,
      updatedAt,
      title: "Orders",
      content: "# Orders\n\nOrder lifecycle.",
      parentId: null,
    });
    assert.equal(rows.every(({ parentId }) => parentId === null), true);

    const indexes = execFileSync(
      "/usr/bin/sqlite3",
      [
        databasePath,
        `SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'Domain' ORDER BY name;`,
      ],
      { encoding: "utf8" },
    ).trim();
    const parentForeignKey = execFileSync(
      "/usr/bin/sqlite3",
      [
        databasePath,
        `SELECT "table" || '|' || "from" || '|' || "to" || '|' || on_update || '|' || on_delete FROM pragma_foreign_key_list('Domain') WHERE "from" = 'parentId';`,
      ],
      { encoding: "utf8" },
    ).trim();
    const foreignKeyViolations = execFileSync(
      "/usr/bin/sqlite3",
      [databasePath, "PRAGMA foreign_key_check;"],
      { encoding: "utf8" },
    ).trim();

    assert.equal(
      indexes,
      "Domain_parentId_idx\nDomain_projectId_idx\nDomain_projectId_title_key",
    );
    assert.equal(parentForeignKey, "Domain|parentId|id|CASCADE|RESTRICT");
    assert.equal(foreignKeyViolations, "");

    assert.throws(() =>
      execFileSync(
        "/usr/bin/sqlite3",
        [
          databasePath,
          `INSERT INTO "Domain" ("projectId", "updatedAt", "title", "content") VALUES (7, CURRENT_TIMESTAMP, 'Orders', '# Duplicate');`,
        ],
        { stdio: "ignore" },
      ),
    );
    execFileSync(
      "/usr/bin/sqlite3",
      [
        databasePath,
        `PRAGMA foreign_keys=ON; INSERT INTO "Domain" ("projectId", "updatedAt", "title", "content", "parentId") VALUES (7, CURRENT_TIMESTAMP, 'Payment', '# Payment', 1);`,
      ],
    );
    assert.throws(() =>
      execFileSync(
        "/usr/bin/sqlite3",
        [
          databasePath,
          `PRAGMA foreign_keys=ON; INSERT INTO "Domain" ("projectId", "updatedAt", "title", "content", "parentId") VALUES (7, CURRENT_TIMESTAMP, 'Orphan', '# Orphan', 999);`,
        ],
        { stdio: "ignore" },
      ),
    );
    assert.throws(() =>
      execFileSync(
        "/usr/bin/sqlite3",
        [databasePath, `PRAGMA foreign_keys=ON; DELETE FROM "Domain" WHERE "id" = 1;`],
        { stdio: "ignore" },
      ),
    );
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("Domain hierarchy migration은 보존 대상의 trim 중복만 중단하고 원본 보존 후 재시도할 수 있다", () => {
  const migration = readFileSync(findDomainHierarchyMigration(), "utf8");
  const directory = mkdtempSync(join(tmpdir(), "domain-hierarchy-duplicate-"));
  const databasePath = join(directory, "migration.db");

  try {
    execFileSync("/usr/bin/sqlite3", [databasePath], {
      input: `
        CREATE TABLE "Project" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT);
        CREATE TABLE "Domain" (
          "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          "projectId" INTEGER NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL,
          "title" TEXT NOT NULL,
          "content" TEXT NOT NULL
        );
        INSERT INTO "Project" ("id") VALUES (7);
        INSERT INTO "Domain" ("id", "projectId", "updatedAt", "title", "content")
        VALUES
          (1, 7, CURRENT_TIMESTAMP, 'Orders', '# Orders'),
          (2, 7, CURRENT_TIMESTAMP, ' Orders ', '# Duplicate');
      `,
    });

    assert.throws(() =>
      execFileSync("/usr/bin/sqlite3", ["-bail", databasePath], {
        input: migration,
        stdio: ["pipe", "ignore", "ignore"],
      }),
    );
    const remaining = execFileSync(
      "/usr/bin/sqlite3",
      [databasePath, `SELECT count(*) || '|' || group_concat(quote("title"), ',') FROM "Domain" ORDER BY "id";`],
      { encoding: "utf8" },
    ).trim();
    const parentColumnCount = execFileSync(
      "/usr/bin/sqlite3",
      [databasePath, `SELECT count(*) FROM pragma_table_info('Domain') WHERE name = 'parentId';`],
      { encoding: "utf8" },
    ).trim();

    assert.equal(remaining, "2|'Orders',' Orders '");
    assert.equal(parentColumnCount, "0");

    execFileSync(
      "/usr/bin/sqlite3",
      [databasePath, `DELETE FROM "Domain" WHERE "id" = 2;`],
    );
    execFileSync("/usr/bin/sqlite3", ["-bail", databasePath], {
      input: migration,
    });
    const migrated = execFileSync(
      "/usr/bin/sqlite3",
      [databasePath, `SELECT count(*) || '|' || min("title") || '|' || count("parentId") FROM "Domain";`],
      { encoding: "utf8" },
    ).trim();

    assert.equal(migrated, "1|Orders|0");
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});
