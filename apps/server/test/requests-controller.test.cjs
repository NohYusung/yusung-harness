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
  "requests",
  "requests.controller.ts",
);

const loadRequestsController = () => {
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
    if (request === "./requests.service") {
      return { RequestsService: class RequestsService {} };
    }
    return defaultRequire(request);
  };
  loadedModule._compile(output, controllerPath);
  return loadedModule.exports.RequestsController;
};

test("RequestsController create API는 project ID와 body를 service에 전달하고 생성 결과를 반환한다", async () => {
  const calls = [];
  const created = {
    id: 31,
    projectId: 17,
    title: "Add dashboard filter",
    content: "Filter project artifacts by type.",
    status: "PENDING",
  };
  const requestsService = {
    create: async (input) => {
      calls.push(input);
      return created;
    },
  };
  const RequestsController = loadRequestsController();
  const controller = new RequestsController(requestsService);

  const result = await controller.create(17, {
    title: created.title,
    content: created.content,
  });

  assert.deepEqual(result, { data: created });
  assert.deepEqual(calls, [
    {
      projectId: 17,
      title: created.title,
      content: created.content,
    },
  ]);
});

test("RequestsController update API는 project/request ID와 body를 service에 전달하고 수정 결과를 반환한다", async () => {
  const calls = [];
  const body = {
    title: "Updated dashboard filter",
    content: "Filter project artifacts by type and status.",
    status: "IN_PROGRESS",
  };
  const updated = { id: 31, projectId: 17, ...body };
  const requestsService = {
    update: async (input) => {
      calls.push(input);
      return updated;
    },
  };
  const RequestsController = loadRequestsController();
  const controller = new RequestsController(requestsService);

  const result = await controller.update(17, 31, body);

  assert.deepEqual(result, { data: updated });
  assert.deepEqual(calls, [{ projectId: 17, requestId: 31, ...body }]);
});

test("RequestsController create/update route는 숫자 path param을 검증하고 작업 메모를 남기지 않는다", () => {
  const controller = readFileSync(controllerPath, "utf8");
  const createHandler = controller.match(
    /@Post\(\)[\s\S]*?(?=@Put\(|\n})/,
  )?.[0];
  const updateHandler = controller.match(
    /@Put\(["']:requestId["']\)[\s\S]*?(?=\n})/,
  )?.[0];

  assert.match(controller, /@Controller\(["']requests\/:projectId["']\)/);
  assert.ok(createHandler, "POST create handler가 필요하다");
  assert.match(
    createHandler,
    /@Param\(["']projectId["'],\s*ParseIntPipe\)\s*projectId:\s*number/,
  );
  assert.match(createHandler, /@Body\(\)\s*body:/);

  assert.ok(updateHandler, "PUT :requestId update handler가 필요하다");
  assert.match(
    updateHandler,
    /@Param\(["']projectId["'],\s*ParseIntPipe\)\s*projectId:\s*number/,
  );
  assert.match(
    updateHandler,
    /@Param\(["']requestId["'],\s*ParseIntPipe\)\s*requestId:\s*number/,
  );
  assert.match(updateHandler, /@Body\(\)\s*body:/);
  assert.doesNotMatch(controller, /\bAGENT\b/);
});
