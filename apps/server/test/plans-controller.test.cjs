const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { dirname, join } = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const ts = require("typescript");

const serverRoot = join(__dirname, "..");
const controllerPath = join(
  serverRoot,
  "src",
  "services",
  "plans",
  "plans.controller.ts",
);

const loadPlansController = () => {
  const output = ts.transpileModule(readFileSync(controllerPath, "utf8"), {
    compilerOptions: {
      experimentalDecorators: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: controllerPath,
  }).outputText;
  const loadedModule = new Module(controllerPath, module);
  const defaultRequire = loadedModule.require.bind(loadedModule);

  loadedModule.filename = controllerPath;
  loadedModule.paths = Module._nodeModulePaths(dirname(controllerPath));
  loadedModule.require = (request) => {
    if (request === "./plans.service") {
      return { PlansService: class PlansService {} };
    }

    return defaultRequire(request);
  };
  loadedModule._compile(output, controllerPath);
  return loadedModule.exports.PlansController;
};

test("PlansController는 versionOrder 없이 project Plan 목록을 요청한다", async () => {
  const calls = [];
  const plans = [{ id: 1, projectId: 7, status: "PENDING" }];
  const plansService = {
    list: async (...args) => {
      calls.push(args);
      return plans;
    },
  };
  const PlansController = loadPlansController();
  const controller = new PlansController(plansService);

  const result = await controller.list(7);

  assert.deepEqual(result, { data: plans });
  assert.deepEqual(calls, [[{ projectId: 7 }]]);
  assert.doesNotMatch(readFileSync(controllerPath, "utf8"), /versionOrder|PlanVersionOrder/);
});
