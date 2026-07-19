const assert = require("node:assert/strict");
const {
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { dirname, join } = require("node:path");
const { pathToFileURL } = require("node:url");
const { afterEach, test } = require("node:test");

const scriptUrl = pathToFileURL(
  join(__dirname, "..", "scripts", "prepare-sqlite.mjs"),
).href;
const temporaryDirectories = [];

async function createTemporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "yusung-sqlite-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

test("상대 file URL은 Prisma schema 디렉터리를 기준으로 DB를 준비하고 기존 내용을 보존한다", async () => {
  const { prepareSqliteDatabase } = await import(scriptUrl);
  const root = await createTemporaryDirectory();
  const schemaDirectory = join(root, "prisma");
  const expectedDatabasePath = join(schemaDirectory, "data", "dashboard.db");

  const databasePath = await prepareSqliteDatabase({
    databaseUrl: "file:./data/dashboard.db",
    schemaDirectory,
  });

  assert.equal(databasePath, expectedDatabasePath);
  assert.equal((await stat(databasePath)).isFile(), true);

  await writeFile(databasePath, "existing-data");
  await prepareSqliteDatabase({
    databaseUrl: "file:./data/dashboard.db",
    schemaDirectory,
  });

  assert.equal(await readFile(databasePath, "utf8"), "existing-data");
});

test("absolute file URL은 schema 디렉터리와 무관하게 부모 디렉터리와 DB를 준비한다", async () => {
  const { prepareSqliteDatabase } = await import(scriptUrl);
  const root = await createTemporaryDirectory();
  const expectedDatabasePath = join(root, "absolute", "dashboard.db");

  const databasePath = await prepareSqliteDatabase({
    databaseUrl: pathToFileURL(expectedDatabasePath).href,
    schemaDirectory: join(root, "ignored-schema-directory"),
  });

  assert.equal(databasePath, expectedDatabasePath);
  assert.equal(dirname(databasePath), join(root, "absolute"));
  assert.equal((await stat(databasePath)).size, 0);
});
