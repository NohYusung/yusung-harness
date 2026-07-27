const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { dirname, join } = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const {
  BadRequestException,
  NotFoundException,
} = require("@nestjs/common");
const ts = require("typescript");

class PrismaClientKnownRequestError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const serverRoot = join(__dirname, "..");
const controllerPath = join(
  serverRoot,
  "src",
  "services",
  "architecture-plans",
  "architecture-plans.controller.ts",
);
const servicePath = join(
  serverRoot,
  "src",
  "services",
  "architecture-plans",
  "architecture-plans.service.ts",
);
const modulePath = join(
  serverRoot,
  "src",
  "services",
  "architecture-plans",
  "architecture-plans.module.ts",
);

const loadArchitecturePlansService = () => {
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
      return {
        Prisma: { PrismaClientKnownRequestError },
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
  return loadedModule.exports.ArchitecturePlansService;
};

const loadArchitecturePlansController = () => {
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
    if (request === "./architecture-plans.service") {
      return { ArchitecturePlansService: class ArchitecturePlansService {} };
    }
    return defaultRequire(request);
  };
  loadedModule._compile(output, controllerPath);
  return loadedModule.exports.ArchitecturePlansController;
};

test("ArchitecturePlans 목록은 project 검증 후 최신 수정 순으로 조회해 HTTP data로 반환한다", async () => {
  const calls = [];
  const rows = [
    {
      id: 31,
      projectId: 17,
      title: "Deployment architecture plan",
      content:
        "<!doctype html><html><head></head><body>Architecture</body></html>",
    },
  ];
  const prisma = {
    architecturePlan: {
      findMany: async (args) => {
        calls.push(["prisma", "architecturePlan", "findMany", args]);
        return rows;
      },
    },
  };
  const projectsService = {
    ensureProject: async (projectId) => {
      calls.push(["projectsService", "ensureProject", projectId]);
    },
  };
  const ArchitecturePlansService = loadArchitecturePlansService();
  const service = new ArchitecturePlansService(prisma, projectsService);

  assert.deepEqual(await service.list({ projectId: 17 }), rows);
  assert.deepEqual(calls, [
    ["projectsService", "ensureProject", 17],
    [
      "prisma",
      "architecturePlan",
      "findMany",
      { where: { projectId: 17 }, orderBy: { updatedAt: "desc" } },
    ],
  ]);

  calls.length = 0;
  const ArchitecturePlansController = loadArchitecturePlansController();
  const controller = new ArchitecturePlansController(service);

  assert.deepEqual(await controller.list(17), { data: rows });
  assert.deepEqual(calls, [
    ["projectsService", "ensureProject", 17],
    [
      "prisma",
      "architecturePlan",
      "findMany",
      { where: { projectId: 17 }, orderBy: { updatedAt: "desc" } },
    ],
  ]);

  assert.doesNotMatch(readFileSync(servicePath, "utf8"), /\bAGENT\b/);
  assert.doesNotMatch(readFileSync(controllerPath, "utf8"), /\bAGENT\b/);
});

test("ArchitecturePlansService.create는 project 검증 후 HTML 계획을 저장한다", async () => {
  const calls = [];
  const input = {
    projectId: 17,
    title: "Deployment architecture plan",
    content:
      "<!doctype html><html><head></head><body>Architecture</body></html>",
  };
  const created = { id: 31, ...input };
  const prisma = {
    architecturePlan: {
      create: async (args) => {
        calls.push(["prisma", "architecturePlan", "create", args]);
        return created;
      },
    },
  };
  const projectsService = {
    ensureProject: async (projectId) => {
      calls.push(["projectsService", "ensureProject", projectId]);
    },
  };
  const ArchitecturePlansService = loadArchitecturePlansService();
  const service = new ArchitecturePlansService(prisma, projectsService);

  assert.deepEqual(await service.create(input), created);
  assert.deepEqual(calls, [
    ["projectsService", "ensureProject", 17],
    ["prisma", "architecturePlan", "create", { data: input }],
  ]);
});

test("ArchitecturePlansService.create는 projectId unique P2002를 BadRequest로 변환한다", async () => {
  const calls = [];
  const prisma = {
    architecturePlan: {
      create: async (args) => {
        calls.push(["architecturePlan.create", args]);
        throw new PrismaClientKnownRequestError("P2002");
      },
    },
  };
  const projectsService = {
    ensureProject: async (projectId) => {
      calls.push(["projects.ensureProject", projectId]);
    },
  };
  const ArchitecturePlansService = loadArchitecturePlansService();
  const service = new ArchitecturePlansService(prisma, projectsService);

  await assert.rejects(
    service.create({
      projectId: 17,
      title: "Duplicate architecture plan",
      content: "<!doctype html><html><body>Duplicate</body></html>",
    }),
    (error) =>
      error instanceof BadRequestException &&
      error.message === "Architecture Plan already exists for project 17",
  );
  assert.deepEqual(calls, [
    ["projects.ensureProject", 17],
    [
      "architecturePlan.create",
      {
        data: {
          projectId: 17,
          title: "Duplicate architecture plan",
          content: "<!doctype html><html><body>Duplicate</body></html>",
        },
      },
    ],
  ]);
});

test("ArchitecturePlansService.update는 같은 프로젝트의 계획만 수정한다", async () => {
  const calls = [];
  const input = {
    projectId: 17,
    architecturePlanId: 31,
    title: "Updated deployment architecture plan",
    content:
      "<!doctype html><html><head></head><body>Updated architecture</body></html>",
  };
  const updated = { id: input.architecturePlanId, ...input };
  const prisma = {
    architecturePlan: {
      findUnique: async (args) => {
        calls.push(["architecturePlan.findUnique", args]);
        return { id: 31, projectId: 17 };
      },
      update: async (args) => {
        calls.push(["architecturePlan.update", args]);
        return updated;
      },
    },
  };
  const projectsService = {
    ensureProject: async (projectId) => {
      calls.push(["projects.ensureProject", projectId]);
    },
  };
  const ArchitecturePlansService = loadArchitecturePlansService();
  const service = new ArchitecturePlansService(prisma, projectsService);

  assert.deepEqual(await service.update(input), updated);
  assert.deepEqual(calls, [
    ["projects.ensureProject", 17],
    ["architecturePlan.findUnique", { where: { id: 31 } }],
    [
      "architecturePlan.update",
      {
        where: { id: 31 },
        data: {
          title: "Updated deployment architecture plan",
          content:
            "<!doctype html><html><head></head><body>Updated architecture</body></html>",
        },
      },
    ],
  ]);
});

test("ArchitecturePlansService.update는 없는 계획을 NotFound로 거부한다", async () => {
  const calls = [];
  const prisma = {
    architecturePlan: {
      findUnique: async (args) => {
        calls.push(["architecturePlan.findUnique", args]);
        return null;
      },
      update: async () => {
        calls.push(["architecturePlan.update"]);
      },
    },
  };
  const projectsService = {
    ensureProject: async (projectId) => {
      calls.push(["projects.ensureProject", projectId]);
    },
  };
  const ArchitecturePlansService = loadArchitecturePlansService();
  const service = new ArchitecturePlansService(prisma, projectsService);

  await assert.rejects(
    service.update({
      projectId: 17,
      architecturePlanId: 404,
      title: "Missing architecture plan",
      content: "<!doctype html><html><head></head><body>Missing</body></html>",
    }),
    (error) =>
      error instanceof NotFoundException &&
      error.message === "ArchitecturePlan 404 not found",
  );
  assert.deepEqual(calls, [
    ["projects.ensureProject", 17],
    ["architecturePlan.findUnique", { where: { id: 404 } }],
  ]);
});

test("ArchitecturePlansService.update는 다른 프로젝트의 계획을 BadRequest로 거부한다", async () => {
  const calls = [];
  const prisma = {
    architecturePlan: {
      findUnique: async (args) => {
        calls.push(["architecturePlan.findUnique", args]);
        return { id: 31, projectId: 18 };
      },
      update: async () => {
        calls.push(["architecturePlan.update"]);
      },
    },
  };
  const projectsService = {
    ensureProject: async (projectId) => {
      calls.push(["projects.ensureProject", projectId]);
    },
  };
  const ArchitecturePlansService = loadArchitecturePlansService();
  const service = new ArchitecturePlansService(prisma, projectsService);

  await assert.rejects(
    service.update({
      projectId: 17,
      architecturePlanId: 31,
      title: "Cross-project architecture plan",
      content:
        "<!doctype html><html><head></head><body>Cross-project</body></html>",
    }),
    (error) =>
      error instanceof BadRequestException &&
      error.message ===
        "ArchitecturePlan 31 does not belong to project 17",
  );
  assert.deepEqual(calls, [
    ["projects.ensureProject", 17],
    ["architecturePlan.findUnique", { where: { id: 31 } }],
  ]);
});

test("ArchitecturePlansModule은 Prisma와 Projects를 가져오고 controller와 service를 공개한다", () => {
  const moduleSource = readFileSync(modulePath, "utf8");

  assert.doesNotMatch(moduleSource, /\bAGENT\b/);
  assert.match(moduleSource, /imports:\s*\[\s*PrismaModule\s*,\s*ProjectsModule\s*\]/);
  assert.match(
    moduleSource,
    /providers:\s*\[\s*ArchitecturePlansService\s*\]/,
  );
  assert.match(
    moduleSource,
    /exports:\s*\[\s*ArchitecturePlansService\s*\]/,
  );
  assert.match(
    moduleSource,
    /controllers:\s*\[\s*ArchitecturePlansController\s*\]/,
  );
});
