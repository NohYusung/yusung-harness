const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const { dirname, join } = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const {
  BadRequestException,
  NotFoundException,
} = require("@nestjs/common");
const ts = require("typescript");

const serverRoot = join(__dirname, "..");
const servicePath = join(serverRoot, "src", "services", "research", "research.service.ts");
const controllerPath = join(serverRoot, "src", "services", "research", "research.controller.ts");
const modulePath = join(serverRoot, "src", "services", "research", "research.module.ts");

const transpile = (path) =>
  ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: {
      experimentalDecorators: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: path,
  }).outputText;

const loadResearchService = () => {
  const loadedModule = new Module(servicePath, module);
  const defaultRequire = loadedModule.require.bind(loadedModule);

  loadedModule.filename = servicePath;
  loadedModule.paths = Module._nodeModulePaths(dirname(servicePath));
  loadedModule.require = (request) => {
    if (request === "../../prisma/prisma.service") {
      return { PrismaService: class PrismaService {} };
    }
    if (request === "../projects/projects.service") {
      return { ProjectsService: class ProjectsService {} };
    }
    return defaultRequire(request);
  };
  loadedModule._compile(transpile(servicePath), servicePath);
  return loadedModule.exports.ResearchService;
};

const loadResearchController = () => {
  const loadedModule = new Module(controllerPath, module);
  const defaultRequire = loadedModule.require.bind(loadedModule);

  loadedModule.filename = controllerPath;
  loadedModule.paths = Module._nodeModulePaths(dirname(controllerPath));
  loadedModule.require = (request) => {
    if (request === "./research.service") {
      return { ResearchService: class ResearchService {} };
    }
    return defaultRequire(request);
  };
  loadedModule._compile(transpile(controllerPath), controllerPath);
  return loadedModule.exports.ResearchController;
};

test("ResearchService.list는 project 검증 후 최신 수정순으로 조회하고 controller가 data로 반환한다", async () => {
  const calls = [];
  const rows = [{ id: 11, projectId: 7, title: "Current ecosystem research" }];
  const prisma = {
    research: {
      findMany: async (args) => {
        calls.push(["research.findMany", args]);
        return rows;
      },
    },
  };
  const projectsService = {
    ensureProject: async (projectId) => calls.push(["ensureProject", projectId]),
  };
  const ResearchService = loadResearchService();
  const service = new ResearchService(prisma, projectsService);

  assert.deepEqual(await service.list({ projectId: 7 }), rows);
  assert.deepEqual(calls, [
    ["ensureProject", 7],
    ["research.findMany", { where: { projectId: 7 }, orderBy: { updatedAt: "desc" } }],
  ]);

  calls.length = 0;
  const ResearchController = loadResearchController();
  assert.deepEqual(await new ResearchController(service).list(7), { data: rows });
});

test("ResearchService.create는 project 검증 후 Research를 생성한다", async () => {
  const calls = [];
  const input = { projectId: 7, title: "Research", content: "# Sources\n\n- Official docs" };
  const created = { id: 11, ...input };
  const prisma = {
    research: {
      create: async (args) => {
        calls.push(["research.create", args]);
        return created;
      },
    },
  };
  const projectsService = {
    ensureProject: async (projectId) => calls.push(["ensureProject", projectId]),
  };
  const ResearchService = loadResearchService();

  assert.deepEqual(await new ResearchService(prisma, projectsService).create(input), created);
  assert.deepEqual(calls, [
    ["ensureProject", 7],
    ["research.create", { data: input }],
  ]);
});

test("ResearchService.update는 같은 project의 Research만 수정하며 id·createdAt을 보존한다", async () => {
  const calls = [];
  const createdAt = new Date("2026-08-10T00:00:00.000Z");
  const input = {
    projectId: 7,
    researchId: 11,
    title: "Updated research",
    content: "# Updated findings",
  };
  const updated = { id: 11, projectId: 7, createdAt, title: input.title, content: input.content };
  const prisma = {
    research: {
      findUnique: async (args) => {
        calls.push(["research.findUnique", args]);
        return { id: 11, projectId: 7, createdAt };
      },
      update: async (args) => {
        calls.push(["research.update", args]);
        return updated;
      },
    },
  };
  const projectsService = {
    ensureProject: async (projectId) => calls.push(["ensureProject", projectId]),
  };
  const ResearchService = loadResearchService();
  const result = await new ResearchService(prisma, projectsService).update(input);

  assert.deepEqual(result, updated);
  assert.equal(result.id, 11);
  assert.equal(result.createdAt, createdAt);
  assert.deepEqual(calls, [
    ["ensureProject", 7],
    ["research.findUnique", { where: { id: 11 } }],
    [
      "research.update",
      { where: { id: 11 }, data: { title: input.title, content: input.content } },
    ],
  ]);
});

test("ResearchService.update는 missing·cross-project Research를 거부하고 update하지 않는다", async (t) => {
  for (const [name, existing, ErrorType, message] of [
    ["missing", null, NotFoundException, /Research 404 not found/],
    ["cross-project", { id: 11, projectId: 8 }, BadRequestException, /does not belong to project 7/],
  ]) {
    await t.test(name, async () => {
      let updateCalled = false;
      const prisma = {
        research: {
          findUnique: async () => existing,
          update: async () => {
            updateCalled = true;
          },
        },
      };
      const ResearchService = loadResearchService();
      const service = new ResearchService(prisma, { ensureProject: async () => undefined });

      await assert.rejects(
        service.update({
          projectId: 7,
          researchId: existing?.id ?? 404,
          title: "Invalid update",
          content: "Invalid",
        }),
        (error) => error instanceof ErrorType && message.test(error.message),
      );
      assert.equal(updateCalled, false);
    });
  }
});

test("Research controller/module은 존재하고 Draft controller/module은 제거된다", () => {
  const moduleSource = readFileSync(modulePath, "utf8");
  const controllerSource = readFileSync(controllerPath, "utf8");

  assert.match(controllerSource, /@Controller\(\s*["']research\/:projectId["']\s*\)/);
  assert.match(moduleSource, /imports:\s*\[\s*PrismaModule\s*,\s*ProjectsModule\s*\]/);
  assert.match(moduleSource, /controllers:\s*\[\s*ResearchController\s*\]/);
  assert.match(moduleSource, /providers:\s*\[\s*ResearchService\s*\]/);
  assert.match(moduleSource, /exports:\s*\[\s*ResearchService\s*\]/);
  assert.equal(existsSync(join(serverRoot, "src", "services", "drafts")), false);
});
