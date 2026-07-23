const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join } = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const ts = require("typescript");

const serverRoot = join(__dirname, "..");
const prismaServicePath = join(serverRoot, "src", "prisma", "prisma.service.ts");
const mcpServicePath = join(serverRoot, "src", "mcp", "mcp.service.ts");

const loadPrismaService = () => {
  const output = ts.transpileModule(readFileSync(prismaServicePath, "utf8"), {
    compilerOptions: {
      experimentalDecorators: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: prismaServicePath,
  }).outputText;
  const loadedModule = new Module(prismaServicePath, module);

  loadedModule.filename = prismaServicePath;
  loadedModule.paths = Module._nodeModulePaths(dirname(prismaServicePath));
  loadedModule._compile(output, prismaServicePath);
  return loadedModule.exports.PrismaService;
};

const loadMcpService = () => {
  const output = ts.transpileModule(readFileSync(mcpServicePath, "utf8"), {
    compilerOptions: {
      experimentalDecorators: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: mcpServicePath,
  }).outputText;
  const loadedModule = new Module(mcpServicePath, module);

  loadedModule.filename = mcpServicePath;
  loadedModule.paths = Module._nodeModulePaths(dirname(mcpServicePath));
  loadedModule._compile(output, mcpServicePath);
  return loadedModule.exports.McpService;
};

test("McpService는 table, column, index, FK, view, trigger schema를 조회한다", async () => {
  const directory = mkdtempSync(join(tmpdir(), "prisma-schema-context-"));
  const databasePath = join(directory, "schema.db");
  const originalDatabaseUrl = process.env.DATABASE_URL;

  try {
    execFileSync("/usr/bin/sqlite3", [databasePath], {
      input: `
        PRAGMA foreign_keys=ON;
        CREATE TABLE "Parent" (
          "id" INTEGER NOT NULL,
          "code" TEXT NOT NULL,
          "name" TEXT NOT NULL UNIQUE,
          PRIMARY KEY ("id", "code")
        );
        CREATE TABLE "Child" (
          "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          "parentId" INTEGER NOT NULL,
          "parentCode" TEXT NOT NULL,
          "name" TEXT DEFAULT 'child',
          "normalizedName" TEXT GENERATED ALWAYS AS (lower("name")) STORED,
          CONSTRAINT "Child_parent_fkey"
            FOREIGN KEY ("parentId", "parentCode")
            REFERENCES "Parent" ("id", "code")
            ON DELETE CASCADE ON UPDATE CASCADE
        );
        CREATE INDEX "Child_parentId_name_idx"
          ON "Child"("parentId" DESC, "name" COLLATE NOCASE)
          WHERE "name" IS NOT NULL;
        CREATE VIEW "ChildNames" AS SELECT "name" FROM "Child";
        CREATE TRIGGER "Child_name_guard"
          BEFORE INSERT ON "Child"
          WHEN NEW."name" = ''
          BEGIN
            SELECT RAISE(ABORT, 'name required');
          END;
      `,
    });
    process.env.DATABASE_URL = `file:${databasePath}`;

    const PrismaService = loadPrismaService();
    const McpService = loadMcpService();
    const prismaService = new PrismaService();
    const service = Object.assign(new McpService(), { prismaService });
    await prismaService.onModuleInit();

    try {
      const context = await service.getSchemaContext();
      const child = context.tables.find(({ name }) => name === "Child");

      assert.equal(context.dialect, "sqlite");
      assert.doesNotThrow(() => JSON.stringify(context));
      assert.ok(child);
      assert.deepEqual(
        child.columns.map(
          ({ name, dataType, notNull, defaultValue, primaryKeyOrdinal, hidden }) => ({
            name,
            dataType,
            notNull,
            defaultValue,
            primaryKeyOrdinal,
            hidden,
          }),
        ),
        [
          {
            name: "id",
            dataType: "INTEGER",
            notNull: true,
            defaultValue: null,
            primaryKeyOrdinal: 1,
            hidden: 0,
          },
          {
            name: "parentId",
            dataType: "INTEGER",
            notNull: true,
            defaultValue: null,
            primaryKeyOrdinal: 0,
            hidden: 0,
          },
          {
            name: "parentCode",
            dataType: "TEXT",
            notNull: true,
            defaultValue: null,
            primaryKeyOrdinal: 0,
            hidden: 0,
          },
          {
            name: "name",
            dataType: "TEXT",
            notNull: false,
            defaultValue: "'child'",
            primaryKeyOrdinal: 0,
            hidden: 0,
          },
          {
            name: "normalizedName",
            dataType: "TEXT",
            notNull: false,
            defaultValue: null,
            primaryKeyOrdinal: 0,
            hidden: 3,
          },
        ],
      );
      const childIndex = child.indexes.find(
        ({ name }) => name === "Child_parentId_name_idx",
      );
      assert.equal(childIndex?.partial, true);
      assert.deepEqual(childIndex?.columns, [
        {
          sequence: 0,
          columnId: 1,
          name: "parentId",
          descending: true,
          collation: "BINARY",
          key: true,
        },
        {
          sequence: 1,
          columnId: 3,
          name: "name",
          descending: false,
          collation: "NOCASE",
          key: true,
        },
        {
          sequence: 2,
          columnId: -1,
          name: null,
          descending: false,
          collation: "BINARY",
          key: false,
        },
      ]);
      assert.deepEqual(child.foreignKeys, [
        {
          id: 0,
          referencedTable: "Parent",
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
          match: "NONE",
          columns: [
            { sequence: 0, from: "parentId", to: "id" },
            { sequence: 1, from: "parentCode", to: "code" },
          ],
        },
      ]);
      assert.equal(
        context.schemaObjects.some(
          ({ type, name }) => type === "view" && name === "ChildNames",
        ),
        true,
      );
      assert.equal(
        context.schemaObjects.some(
          ({ type, name, tableName }) =>
            type === "trigger" &&
            name === "Child_name_guard" &&
            tableName === "Child",
        ),
        true,
      );
      assert.equal(
        context.schemaObjects.some(({ name }) => name.startsWith("sqlite_")),
        false,
      );
      assert.deepEqual(
        context.tables.map(({ name }) => name),
        ["Child", "Parent"],
      );
    } finally {
      await prismaService.onModuleDestroy();
    }
  } finally {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
    rmSync(directory, { recursive: true, force: true });
  }
});
