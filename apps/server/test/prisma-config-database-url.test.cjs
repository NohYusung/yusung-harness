const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { dirname, join } = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const { pathToFileURL } = require("node:url");
const ts = require("typescript");

const serverRoot = join(__dirname, "..");
const configPath = join(serverRoot, "prisma.config.ts");

const evaluatePrismaConfig = (databaseUrl, defineConfigCalls, moduleRequests) => {
  const source = readFileSync(configPath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: configPath,
  }).outputText;
  const loadedModule = new Module(configPath, module);
  const defaultRequire = loadedModule.require.bind(loadedModule);
  const hadDatabaseUrl = Object.hasOwn(process.env, "DATABASE_URL");
  const originalDatabaseUrl = process.env.DATABASE_URL;

  loadedModule.filename = configPath;
  loadedModule.paths = Module._nodeModulePaths(dirname(configPath));
  loadedModule.require = (request) => {
    if (request === "dotenv/config") {
      moduleRequests.push(request);
      return {};
    }
    if (request === "prisma/config") {
      moduleRequests.push(request);
      return {
        defineConfig: (config) => {
          defineConfigCalls.push(config);
          return config;
        },
      };
    }

    return defaultRequire(request);
  };

  if (databaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = databaseUrl;
  }

  try {
    loadedModule._compile(output, configPath);
    return loadedModule.exports.default;
  } finally {
    if (hadDatabaseUrl) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
  }
};

for (const [label, databaseUrl] of [
  ["undefined", undefined],
  ["빈 문자열", ""],
  ["공백 문자열", "   \t\n"],
]) {
  test(`prisma.config는 DATABASE_URL ${label}을 config 평가 시 거부한다`, () => {
    const defineConfigCalls = [];
    const moduleRequests = [];

    assert.throws(
      () => evaluatePrismaConfig(databaseUrl, defineConfigCalls, moduleRequests),
      (error) => {
        assert.match(error.message, /DATABASE_URL/);
        return true;
      },
    );
    assert.deepEqual(moduleRequests, ["dotenv/config", "prisma/config"]);
    assert.deepEqual(defineConfigCalls, []);
  });
}

test("prisma.config는 상대 SQLite URL을 prisma 디렉터리 기준 절대 file URL로 정규화한다", () => {
  const defineConfigCalls = [];
  const moduleRequests = [];
  const expectedDatabaseUrl = pathToFileURL(
    join(serverRoot, "prisma", "custom-harness.db"),
  ).href;

  const config = evaluatePrismaConfig(
    "  file:./custom-harness.db \t\n",
    defineConfigCalls,
    moduleRequests,
  );

  assert.deepEqual(moduleRequests, ["dotenv/config", "prisma/config"]);
  assert.equal(defineConfigCalls.length, 1);
  assert.equal(defineConfigCalls[0].datasource.url, expectedDatabaseUrl);
  assert.equal(config, defineConfigCalls[0]);
});

test("prisma.config는 절대 SQLite file URL을 그대로 보존한다", () => {
  const defineConfigCalls = [];
  const moduleRequests = [];
  const absoluteDatabaseUrl = pathToFileURL(
    join(serverRoot, "prisma", "absolute-harness.db"),
  ).href;

  const config = evaluatePrismaConfig(
    `  ${absoluteDatabaseUrl} \t\n`,
    defineConfigCalls,
    moduleRequests,
  );

  assert.deepEqual(moduleRequests, ["dotenv/config", "prisma/config"]);
  assert.equal(defineConfigCalls.length, 1);
  assert.equal(defineConfigCalls[0].datasource.url, absoluteDatabaseUrl);
  assert.equal(config, defineConfigCalls[0]);
});

test("prisma.config source에는 DATABASE_URL fallback과 AGENT 주석이 남지 않는다", () => {
  const source = readFileSync(configPath, "utf8");

  assert.doesNotMatch(source, /\bAGENT\b/);
  assert.doesNotMatch(source, /DATABASE_URL\s*(?:\?\?|\|\|)/);
  assert.doesNotMatch(source, /file:\.\/harness-board\.db/);
});
