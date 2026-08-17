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
  "projects",
  "projects.service.ts",
);

const loadProjectsService = () => {
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
      return { RepoType: { LOCAL: "LOCAL", REMOTE: "REMOTE" } };
    }
    if (request === "../../prisma/prisma.service") {
      return { PrismaService: class PrismaService {} };
    }

    return defaultRequire(request);
  };
  loadedModule._compile(output, servicePath);
  return loadedModule.exports.ProjectsService;
};

test("ProjectsService.create는 Project와 repository 경로를 nested create로 생성한다", async () => {
  const calls = [];
  const input = {
    title: "Harness",
    repoPaths: [
      { path: "/workspace/harness-backend", repoType: "LOCAL" },
      { path: "https://github.com/yusung/harness-web", repoType: "REMOTE" },
    ],
    description: "Harness project",
  };
  const createdProject = { id: 1, ...input };
  const prisma = {
    project: {
      create: async (args) => {
        calls.push(["create", args]);
        return createdProject;
      },
      upsert: async (args) => {
        calls.push(["upsert", args]);
        throw new Error("upsert must not be called");
      },
      update: async (args) => {
        calls.push(["update", args]);
        throw new Error("update must not be called");
      },
    },
  };
  const ProjectsService = loadProjectsService();
  const service = new ProjectsService(prisma);

  const result = await service.create(input);

  assert.deepEqual(result, createdProject);
  assert.deepEqual(calls, [
    [
      "create",
      {
        data: {
          title: input.title,
          description: input.description,
          repoPaths: { create: input.repoPaths },
        },
        include: {
          repoPaths: {
            select: { path: true, repoType: true },
            orderBy: [{ path: "asc" }, { id: "asc" }],
          },
        },
      },
    ],
  ]);
  assert.equal(calls.some(([method]) => method === "upsert"), false);
  assert.equal(calls.some(([method]) => method === "update"), false);
});

test("ProjectsService.list는 repository 경로와 모든 project record count를 조회한다", async () => {
  const calls = [];
  const prisma = {
    project: {
      findMany: async (args) => {
        calls.push(["findMany", args]);
        return [];
      },
    },
  };
  const ProjectsService = loadProjectsService();
  const service = new ProjectsService(prisma);

  await service.list();

  assert.deepEqual(calls[0][1].select.repoPaths, {
    select: { path: true, repoType: true },
    orderBy: [{ path: "asc" }, { id: "asc" }],
  });
  assert.deepEqual(calls[0][1].select._count, {
    select: {
      plans: true,
      tasks: true,
      drafts: true,
      domains: true,
      architectures: true,
      wireframes: true,
      assets: true,
      reviews: true,
      requests: true,
      workLogs: true,
      architecturePlans: true,
      databases: true,
      erds: true,
    },
  });
  assert.equal(Object.hasOwn(calls[0][1].select, "repoPath"), false);
  assert.equal(Object.hasOwn(calls[0][1].select, "repoType"), false);
});

test("ProjectsService.create는 빈 repository 경로 목록을 거부한다", async () => {
  const calls = [];
  const prisma = {
    project: {
      create: async (args) => {
        calls.push(["create", args]);
      },
    },
  };
  const ProjectsService = loadProjectsService();
  const service = new ProjectsService(prisma);

  await assert.rejects(
    () =>
      service.create({
        title: "Empty repositories",
        repoPaths: [],
        description: "Invalid Project",
      }),
    /at least one repository/i,
  );
  assert.deepEqual(calls, []);
});
