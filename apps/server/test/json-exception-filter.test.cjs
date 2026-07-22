const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { dirname, join } = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const ts = require("typescript");

const serverRoot = join(__dirname, "..");
const controllerPath = join(serverRoot, "src", "mcp", "mcp.controller.ts");
const filterPath = join(
  serverRoot,
  "src",
  "libs",
  "json-exception.filter.ts",
);

const loadJsonExceptionFilter = () => {
  const output = ts.transpileModule(readFileSync(filterPath, "utf8"), {
    compilerOptions: {
      experimentalDecorators: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filterPath,
  }).outputText;
  const loadedModule = new Module(filterPath, module);

  loadedModule.filename = filterPath;
  loadedModule.paths = Module._nodeModulePaths(dirname(filterPath));
  loadedModule._compile(output, filterPath);
  return loadedModule.exports.JsonExceptionFilter;
};

const createHost = (response) => ({
  switchToHttp: () => ({
    getResponse: () => response,
  }),
});

test("MCP controller는 JsonExceptionFilter에 처리되지 않은 오류 응답을 위임한다", () => {
  const controller = readFileSync(controllerPath, "utf8");
  const filter = readFileSync(filterPath, "utf8");

  assert.match(
    controller,
    /import\s*\{\s*JsonExceptionFilter\s*\}\s*from\s*["']\.\.\/libs\/json-exception\.filter["']/,
  );
  assert.match(controller, /@UseFilters\(\s*JsonExceptionFilter\s*\)/);
  assert.doesNotMatch(controller, /\bAGENT\b|private\s+sendError\s*\(|this\.sendError\s*\(/);
  assert.doesNotMatch(controller, /}\s*catch\s*\(\s*error/);

  assert.match(filter, /@Catch\(\s*\)/);
  assert.match(filter, /export\s+class\s+JsonExceptionFilter\s+implements\s+ExceptionFilter/);
  assert.match(filter, /response\.headersSent/);
  assert.match(filter, /response\.status\(\s*500\s*\)\.json\s*\(/);
  assert.match(filter, /jsonrpc:\s*["']2\.0["']/);
  assert.match(filter, /code:\s*-32603/);
  assert.match(filter, /message:\s*["']Internal server error["']/);
  assert.match(filter, /id:\s*null/);
});

test("JsonExceptionFilter는 500 JSON-RPC envelope를 응답한다", () => {
  const JsonExceptionFilter = loadJsonExceptionFilter();
  const calls = [];
  const response = {
    headersSent: false,
    status(status) {
      calls.push(["status", status]);
      return this;
    },
    json(payload) {
      calls.push(["json", payload]);
      return this;
    },
  };
  const filter = new JsonExceptionFilter();

  filter.catch(new Error("transport exploded"), createHost(response));

  assert.deepEqual(calls, [
    ["status", 500],
    [
      "json",
      {
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      },
    ],
  ]);
});

test("JsonExceptionFilter는 headersSent 응답을 다시 쓰지 않는다", () => {
  const JsonExceptionFilter = loadJsonExceptionFilter();
  const calls = [];
  const response = {
    headersSent: true,
    status(status) {
      calls.push(["status", status]);
      return this;
    },
    json(payload) {
      calls.push(["json", payload]);
      return this;
    },
  };
  const filter = new JsonExceptionFilter();

  filter.catch(new Error("late transport error"), createHost(response));

  assert.deepEqual(calls, []);
});
