const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { dirname, join, resolve } = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const ts = require("typescript");

const serverRoot = join(__dirname, "..");
const servicePath = join(serverRoot, "src", "prisma", "prisma.service.ts");

const loadPrismaService = () => {
  const adapterOptions = [];
  const clientOptions = [];
  const output = ts.transpileModule(readFileSync(servicePath, "utf8"), {
    compilerOptions: {
      experimentalDecorators: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: servicePath,
  }).outputText;
  const loadedModule = new Module(servicePath, module);
  const defaultRequire = loadedModule.require.bind(loadedModule);

  class PrismaBetterSqlite3 {
    constructor(options) {
      adapterOptions.push(options);
      this.options = options;
    }
  }

  class PrismaClient {
    constructor(options) {
      clientOptions.push(options);
    }
  }

  loadedModule.filename = servicePath;
  loadedModule.paths = Module._nodeModulePaths(dirname(servicePath));
  loadedModule.require = (request) => {
    if (request === "@nestjs/common") {
      return {
        Injectable: () => (target) => target,
      };
    }
    if (request === "@prisma/adapter-better-sqlite3") {
      return { PrismaBetterSqlite3 };
    }
    if (request === "@prisma/client") {
      return { PrismaClient };
    }

    return defaultRequire(request);
  };
  loadedModule._compile(output, servicePath);

  return {
    PrismaService: loadedModule.exports.PrismaService,
    adapterOptions,
    clientOptions,
  };
};

const withDatabaseUrl = async (value, operation) => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  try {
    if (value === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = value;
    }

    await operation();
  } finally {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  }
};

test("PrismaService는 DATABASE_URL이 없거나 공백이면 생성 시 명확히 실패한다", async (t) => {
  for (const databaseUrl of [undefined, "", "   "]) {
    await t.test(
      databaseUrl === undefined
        ? "undefined"
        : databaseUrl.length === 0
          ? "empty"
          : "whitespace",
      async () => {
        await withDatabaseUrl(databaseUrl, () => {
          const { PrismaService, adapterOptions, clientOptions } =
            loadPrismaService();

          assert.throws(
            () => new PrismaService(),
            (error) =>
              error instanceof Error &&
              /DATABASE_URL/i.test(error.message) &&
              /required|must be set|missing|필수|누락/i.test(error.message),
          );
          assert.deepEqual(adapterOptions, []);
          assert.deepEqual(clientOptions, []);
        });
      },
    );
  }
});

test("PrismaService는 설정된 DATABASE_URL을 adapter에 정확히 전달한다", async () => {
  const configuredUrl = "file:/var/data/yusung-harness.db";

  await withDatabaseUrl(configuredUrl, () => {
    const { PrismaService, adapterOptions, clientOptions } =
      loadPrismaService();

    new PrismaService();

    assert.deepEqual(adapterOptions, [{ url: configuredUrl }]);
    assert.equal(clientOptions.length, 1);
    assert.equal(clientOptions[0].adapter.options.url, configuredUrl);
  });
});

test("PrismaService는 file:./ 상대경로를 기존 prisma 디렉터리의 절대 URL로 변환한다", async () => {
  const configuredUrl = "file:./data/yusung-harness.db";
  const expectedUrl = `file:${resolve(
    dirname(servicePath),
    "../../prisma",
    "data/yusung-harness.db",
  )}`;

  await withDatabaseUrl(configuredUrl, () => {
    const { PrismaService, adapterOptions, clientOptions } =
      loadPrismaService();

    new PrismaService();

    assert.deepEqual(adapterOptions, [{ url: expectedUrl }]);
    assert.equal(clientOptions.length, 1);
    assert.equal(clientOptions[0].adapter.options.url, expectedUrl);
    assert.equal(
      expectedUrl,
      `file:${join(serverRoot, "prisma", "data", "yusung-harness.db")}`,
    );
  });
});

test("PrismaService source에는 DATABASE_URL fallback과 AGENT 주석이 남지 않는다", () => {
  const source = readFileSync(servicePath, "utf8");

  assert.doesNotMatch(source, /\bAGENT\b/);
  assert.doesNotMatch(source, /file:\.\/harness-board\.db/);
});
