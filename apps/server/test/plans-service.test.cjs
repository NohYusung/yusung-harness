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
  "plans",
  "plans.service.ts",
);

const loadPlansService = () => {
  const source = readFileSync(servicePath, "utf8");
  const output = ts.transpileModule(source, {
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
      return {
        Prisma: {
          PrismaClientKnownRequestError: class PrismaClientKnownRequestError
            extends Error {},
        },
      };
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
  return loadedModule.exports.PlansService;
};

test("PlansService.list는 caller의 top-level 정렬 옵션을 Prisma에 전달한다", async () => {
  const calls = [];
  const plans = [{ id: 11, projectId: 7, version: 1 }];
  const prisma = {
    plan: {
      findMany: async (args) => {
        calls.push(["plan.findMany", args]);
        return plans;
      },
    },
  };
  const projectsService = {
    ensureProject: async (projectId) => {
      calls.push(["projects.ensureProject", projectId]);
    },
  };
  const options = {
    orderBy: [{ version: "asc" }, { id: "asc" }],
  };
  const PlansService = loadPlansService();
  const service = new PlansService(prisma, projectsService);

  const result = await service.list({ projectId: 7 }, options);

  assert.deepEqual(result, plans);
  assert.deepEqual(calls.map(([name]) => name), [
    "projects.ensureProject",
    "plan.findMany",
  ]);
  const findManyArgs = calls[1][1];
  assert.deepEqual(findManyArgs.where, { projectId: 7 });
  assert.deepEqual(findManyArgs.orderBy, options.orderBy);
  assert.deepEqual(findManyArgs.include, {
    tasks: { orderBy: { createdAt: "asc" } },
  });
  for (const relation of ["assets", "wireframes", "designs", "reviews"]) {
    assert.equal(Object.hasOwn(findManyArgs.include, relation), false);
  }
  for (const relation of ["assets", "wireframes", "designs"]) {
    assert.equal(Object.hasOwn(findManyArgs.include.tasks, relation), false);
  }
});

test("PlansService.create는 task 중첩 없이 다음 version의 Plan만 만든다", async () => {
  const calls = [];
  const createdPlan = { id: 12, projectId: 7, version: 5 };
  const transaction = {
    plan: {
      findFirst: async (args) => {
        calls.push(["plan.findFirst", args]);
        return { version: 4 };
      },
      create: async (args) => {
        calls.push(["plan.create", args]);
        return createdPlan;
      },
    },
  };
  const prisma = {
    $transaction: async (operation) => operation(transaction),
  };
  const projectsService = {
    ensureProject: async (projectId) => {
      calls.push(["projects.ensureProject", projectId]);
    },
  };
  const PlansService = loadPlansService();
  const service = new PlansService(prisma, projectsService);

  const result = await service.create({
    projectId: 7,
    title: "Version 5",
    content: "Plan content",
  });

  assert.deepEqual(result, createdPlan);
  assert.deepEqual(calls[1], [
    "plan.findFirst",
    {
      where: { projectId: 7 },
      orderBy: { version: "desc" },
      select: { version: true },
    },
  ]);
  assert.deepEqual(calls[2], [
    "plan.create",
    {
      data: {
        projectId: 7,
        title: "Version 5",
        content: "Plan content",
        version: 5,
      },
    },
  ]);
  assert.equal(Object.hasOwn(calls[2][1].data, "tasks"), false);
  assert.equal(Object.hasOwn(calls[2][1], "include"), false);
});
