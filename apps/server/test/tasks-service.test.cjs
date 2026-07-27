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

test("TasksService.list는 선택한 project와 plan에 속한 Task만 조회한다", async () => {
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

  const result = await service.list({ projectId: 7, planId: 3 });

  assert.deepEqual(result, tasks);
  assert.deepEqual(calls, [
    ["projects.ensureProject", 7],
    [
      "task.findMany",
      {
        where: { projectId: 7, planId: 3 },
        orderBy: { updatedAt: "desc" },
      },
    ],
  ]);
  assert.equal(Object.hasOwn(calls[1][1], "include"), false);
});

test("TasksService.create는 task 생성과 Plan IN_PROGRESS 동기화를 같은 transaction에서 수행한다", async () => {
  const calls = [];
  const createdTask = {
    id: 51,
    projectId: 7,
    planId: 3,
    status: "PENDING",
  };
  const transaction = {
    plan: {
      findUnique: async (args) => {
        calls.push(["tx.plan.findUnique", args]);
        return { id: 3, projectId: 7, status: "PENDING" };
      },
      update: async (args) => {
        calls.push(["tx.plan.update", args]);
      },
    },
    task: {
      create: async (args) => {
        calls.push(["tx.task.create", args]);
        return createdTask;
      },
      findMany: async (args) => {
        calls.push(["tx.task.findMany", args]);
        return [{ status: "PENDING" }];
      },
    },
  };
  const prisma = {
    $transaction: async (operation) => {
      calls.push(["prisma.$transaction"]);
      return operation(transaction);
    },
  };
  const projectsService = {
    ensureProject: async (projectId) => {
      calls.push(["projects.ensureProject", projectId]);
    },
  };
  const TasksService = loadTasksService();
  const service = new TasksService(prisma, projectsService);

  assert.deepEqual(
    await service.create({
      projectId: 7,
      planId: 3,
      title: "First task",
      content: "Task content",
    }),
    createdTask,
  );
  assert.deepEqual(calls, [
    ["projects.ensureProject", 7],
    ["prisma.$transaction"],
    ["tx.plan.findUnique", { where: { id: 3 } }],
    [
      "tx.task.create",
      {
        data: {
          projectId: 7,
          planId: 3,
          title: "First task",
          content: "Task content",
        },
      },
    ],
    [
      "tx.task.findMany",
      { where: { planId: 3 }, select: { status: true } },
    ],
    [
      "tx.plan.update",
      { where: { id: 3 }, data: { status: "IN_PROGRESS" } },
    ],
  ]);
});

test("TasksService.updateStatus는 갱신 후 같은 transaction에서 Plan COMPLETED를 동기화한다", async () => {
  const calls = [];
  const updatedTask = {
    id: 51,
    projectId: 7,
    planId: 3,
    status: "COMPLETED",
  };
  const transaction = {
    plan: {
      update: async (args) => {
        calls.push(["tx.plan.update", args]);
      },
    },
    task: {
      findUnique: async (args) => {
        calls.push(["tx.task.findUnique", args]);
        return { id: 51, projectId: 7, planId: 3, status: "PENDING" };
      },
      update: async (args) => {
        calls.push(["tx.task.update", args]);
        return updatedTask;
      },
      findMany: async (args) => {
        calls.push(["tx.task.findMany", args]);
        return [{ status: "COMPLETED" }, { status: "COMPLETED" }];
      },
    },
  };
  const prisma = {
    $transaction: async (operation) => {
      calls.push(["prisma.$transaction"]);
      return operation(transaction);
    },
  };
  const projectsService = {
    ensureProject: async (projectId) => {
      calls.push(["projects.ensureProject", projectId]);
    },
  };
  const TasksService = loadTasksService();
  const service = new TasksService(prisma, projectsService);

  assert.deepEqual(
    await service.updateStatus(7, 51, "COMPLETED"),
    updatedTask,
  );
  assert.deepEqual(calls, [
    ["projects.ensureProject", 7],
    ["prisma.$transaction"],
    ["tx.task.findUnique", { where: { id: 51 } }],
    [
      "tx.task.update",
      { where: { id: 51 }, data: { status: "COMPLETED" } },
    ],
    [
      "tx.task.findMany",
      { where: { planId: 3 }, select: { status: true } },
    ],
    [
      "tx.plan.update",
      { where: { id: 3 }, data: { status: "COMPLETED" } },
    ],
  ]);
});
