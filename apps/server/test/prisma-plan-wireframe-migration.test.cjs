const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const serverRoot = join(__dirname, "..");
const migrationPath = join(
  serverRoot,
  "prisma",
  "migrations",
  "20260728020000_link_plans_to_wireframes",
  "migration.sql",
);

function readRelationMigration() {
  assert.equal(
    existsSync(migrationPath),
    true,
    "Plan과 Wireframe을 연결하는 migration이 존재해야 한다",
  );
  return readFileSync(migrationPath, "utf8");
}

function sqlite(databasePath, sql) {
  return execFileSync(
    "/usr/bin/sqlite3",
    ["-batch", "-bail", "-separator", "|", databasePath],
    { encoding: "utf8", input: sql },
  ).trim();
}

function createPreRelationSchema(databasePath) {
  sqlite(
    databasePath,
    `
      CREATE TABLE "Plan" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "title" TEXT NOT NULL
      );
      CREATE TABLE "Wireframe" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "title" TEXT NOT NULL
      );

      INSERT INTO "Plan" ("id", "title")
      VALUES (10, 'First plan'), (20, 'Second plan');
      INSERT INTO "Wireframe" ("id", "title")
      VALUES (100, 'First wireframe'), (200, 'Second wireframe');
    `,
  );
}

function withMigratedDatabase(assertions) {
  const migration = readRelationMigration();
  const directory = mkdtempSync(join(tmpdir(), "plan-wireframe-relation-"));
  const databasePath = join(directory, "migration.db");

  try {
    createPreRelationSchema(databasePath);
    sqlite(databasePath, `PRAGMA foreign_keys=ON;\n${migration}`);
    assertions({ databasePath, migration });
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

test("migration은 PlanWireframes implicit M:N join table과 index를 정의한다", () => {
  const migration = readRelationMigration();

  assert.match(migration, /CREATE TABLE\s+"_PlanWireframes"/);
  assert.match(
    migration,
    /CONSTRAINT\s+"_PlanWireframes_A_fkey"\s+FOREIGN KEY\s*\("A"\)\s+REFERENCES\s+"Plan"\s*\("id"\)\s+ON DELETE CASCADE\s+ON UPDATE CASCADE/,
  );
  assert.match(
    migration,
    /CONSTRAINT\s+"_PlanWireframes_B_fkey"\s+FOREIGN KEY\s*\("B"\)\s+REFERENCES\s+"Wireframe"\s*\("id"\)\s+ON DELETE CASCADE\s+ON UPDATE CASCADE/,
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX\s+"_PlanWireframes_AB_unique"\s+ON\s+"_PlanWireframes"\s*\("A",\s*"B"\)/,
  );
  assert.match(
    migration,
    /CREATE INDEX\s+"_PlanWireframes_B_index"\s+ON\s+"_PlanWireframes"\s*\("B"\)/,
  );
});

test("migration은 기존 Plan과 Wireframe을 미연결 상태로 보존한다", () => {
  withMigratedDatabase(({ databasePath }) => {
    assert.equal(
      sqlite(
        databasePath,
        `SELECT "name" FROM sqlite_master
         WHERE "type" = 'table' AND "name" = '_PlanWireframes';`,
      ),
      "_PlanWireframes",
    );
    assert.equal(
      sqlite(databasePath, `SELECT "id", "title" FROM "Plan" ORDER BY "id";`),
      "10|First plan\n20|Second plan",
    );
    assert.equal(
      sqlite(
        databasePath,
        `SELECT "id", "title" FROM "Wireframe" ORDER BY "id";`,
      ),
      "100|First wireframe\n200|Second wireframe",
    );
    assert.equal(
      sqlite(databasePath, `SELECT COUNT(*) FROM "_PlanWireframes";`),
      "0",
    );
    assert.equal(
      sqlite(
        databasePath,
        `SELECT "table", "from", "to", "on_update", "on_delete"
         FROM pragma_foreign_key_list('_PlanWireframes')
         ORDER BY "from";`,
      ),
      "Plan|A|id|CASCADE|CASCADE\nWireframe|B|id|CASCADE|CASCADE",
    );
    assert.equal(
      sqlite(
        databasePath,
        `SELECT "name", "unique" FROM pragma_index_list('_PlanWireframes')
         WHERE "name" IN ('_PlanWireframes_AB_unique', '_PlanWireframes_B_index')
         ORDER BY "name";`,
      ),
      "_PlanWireframes_AB_unique|1\n_PlanWireframes_B_index|0",
    );
    assert.equal(sqlite(databasePath, "PRAGMA foreign_key_check;"), "");
  });
});

test("Plan-Wireframe 연결은 중복을 거부하고 양쪽 삭제에 cascade한다", () => {
  withMigratedDatabase(({ databasePath }) => {
    sqlite(
      databasePath,
      `PRAGMA foreign_keys=ON;
       INSERT INTO "_PlanWireframes" ("A", "B")
       VALUES (10, 100), (10, 200), (20, 200);`,
    );
    assert.equal(
      sqlite(
        databasePath,
        `SELECT "A", "B" FROM "_PlanWireframes" ORDER BY "A", "B";`,
      ),
      "10|100\n10|200\n20|200",
    );

    assert.throws(() =>
      sqlite(
        databasePath,
        `PRAGMA foreign_keys=ON;
         INSERT INTO "_PlanWireframes" ("A", "B") VALUES (10, 100);`,
      ),
    );
    assert.equal(
      sqlite(databasePath, `SELECT COUNT(*) FROM "_PlanWireframes";`),
      "3",
    );

    assert.equal(
      sqlite(
        databasePath,
        `PRAGMA foreign_keys=ON;
         DELETE FROM "Plan" WHERE "id" = 10;
         SELECT "A", "B" FROM "_PlanWireframes" ORDER BY "A", "B";`,
      ),
      "20|200",
    );
    assert.equal(
      sqlite(databasePath, `SELECT "id" FROM "Wireframe" ORDER BY "id";`),
      "100\n200",
    );

    assert.equal(
      sqlite(
        databasePath,
        `PRAGMA foreign_keys=ON;
         DELETE FROM "Wireframe" WHERE "id" = 200;
         SELECT COUNT(*) FROM "_PlanWireframes";`,
      ),
      "0",
    );
    assert.equal(sqlite(databasePath, `SELECT "id" FROM "Plan";`), "20");
    assert.equal(
      sqlite(databasePath, `SELECT "id" FROM "Wireframe" ORDER BY "id";`),
      "100",
    );
    assert.equal(sqlite(databasePath, "PRAGMA foreign_key_check;"), "");
  });
});
