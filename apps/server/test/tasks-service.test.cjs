const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { dirname, join } = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const ts = require("typescript");

const serverRoot = join(__dirname, "..");
const servicePath = join(
  serverRoot,
  "src",
  "services",
  "tasks",
  "tasks.service.ts",
);

const loadTasksService = () => {
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

  loadedModule.filename = servicePath;
  loadedModule.paths = Module._nodeModulePaths(dirname(servicePath));
  loadedModule.require = (request) => {
    if (request === "@prisma/client") {
      return { TaskStatus: {} };
    }
    if (request === "../../prisma/prisma.service") {
      return { PrismaService: class PrismaService {} };
    }
    if (request === "../projects/projects.service") {
      return { ProjectsService: class ProjectsService {} };
    }

    return defaultRequire(request);
  };
  loadedModule._compile(output, servicePath);
  return loadedModule.exports.TasksService;
};

test("TasksService.list는 제거된 산출물 relation 없이 project의 Task만 조회한다", async () => {
  const calls = [];
  const tasks = [{ id: 11, projectId: 7, planId: 3 }];
  const prisma = {
    task: {
      findMany: async (args) => {
        calls.push(["task.findMany", args]);
        return tasks;
      },
    },
  };
  const projectsService = {
    ensureProject: async (projectId) => {
      calls.push(["projects.ensureProject", projectId]);
    },
  };
  const TasksService = loadTasksService();
  const service = new TasksService(prisma, projectsService);

  const result = await service.list({ projectId: 7 });

  assert.deepEqual(result, tasks);
  assert.deepEqual(calls, [
    ["projects.ensureProject", 7],
    [
      "task.findMany",
      {
        where: { projectId: 7 },
        orderBy: { updatedAt: "desc" },
      },
    ],
  ]);
  assert.equal(Object.hasOwn(calls[1][1], "include"), false);
});
