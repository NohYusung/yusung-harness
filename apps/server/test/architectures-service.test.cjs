const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { dirname, join } = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const { BadRequestException } = require("@nestjs/common");
const ts = require("typescript");

const serverRoot = join(__dirname, "..");
const servicePath = join(
  serverRoot,
  "src",
  "services",
  "architectures",
  "architectures.service.ts",
);
const controllerPath = join(
  serverRoot,
  "src",
  "services",
  "architectures",
  "architectures.controller.ts",
);
const modulePath = join(
  serverRoot,
  "src",
  "services",
  "architectures",
  "architectures.module.ts",
);

const architecturePlanContent = [
  "# 기술 스택",
  "",
  "| 영역 | 선택 |",
  "| --- | --- |",
  "| 배포 | GitHub Pages |",
  "",
  "# 배포 전략",
  "",
  "검증된 정적 산출물만 배포한다.",
].join("\n");
const architecturePlanHtml = [
  "<!doctype html>",
  '<html lang="ko"><head><meta charset="utf-8"><title>배포 인프라 구조도</title></head>',
  '<body><main><h1>배포 인프라 구조도</h1><p>Repository → Actions → Pages</p></main></body></html>',
].join("");

const validDeployment = () => ({
  kind: "deployment-architecture",
  schemaVersion: 1,
  name: "Harness production",
  generatedAt: "2026-07-21T09:00:00+09:00",
  sourceRevision: "abc123",
  environments: [
    { id: "browser", name: "Browser", kind: "client" },
    {
      id: "production",
      name: "Production",
      kind: "cloud",
      provider: "Vercel",
      region: "icn1",
    },
  ],
  nodes: [
    {
      id: "web",
      name: "Next.js Web",
      kind: "client",
      environmentId: "browser",
      runtime: "Node.js 24",
    },
    {
      id: "api",
      name: "Nest API",
      kind: "service",
      environmentId: "production",
      runtime: "Node.js 24",
    },
  ],
  connections: [
    {
      id: "web-api",
      sourceNodeId: "web",
      targetNodeId: "api",
      label: "Dashboard API",
      protocol: "HTTPS",
    },
  ],
});

const transpile = (path) =>
  ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: {
      esModuleInterop: true,
      experimentalDecorators: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: path,
  }).outputText;

const loadDeploymentSchema = () => {
  const path = join(
    serverRoot,
    "src",
    "services",
    "architectures",
    "deployment-architecture.ts",
  );
  const loadedModule = new Module(path, module);

  loadedModule.filename = path;
  loadedModule.paths = Module._nodeModulePaths(dirname(path));
  loadedModule._compile(transpile(path), path);
  return loadedModule.exports;
};

const loadArchitecturesService = () => {
  const loadedModule = new Module(servicePath, module);
  const defaultRequire = loadedModule.require.bind(loadedModule);

  loadedModule.filename = servicePath;
  loadedModule.paths = Module._nodeModulePaths(dirname(servicePath));
  loadedModule.require = (request) => {
    if (request === "@prisma/client") {
      return {
        ArchitectureType: { PLAN: "PLAN", PRODUCTION: "PRODUCTION" },
      };
    }
    if (request === "../../prisma/prisma.service") {
      return { PrismaService: class PrismaService {} };
    }
    if (request === "../projects/projects.service") {
      return { ProjectsService: class ProjectsService {} };
    }
    if (request === "./deployment-architecture") {
      return loadDeploymentSchema();
    }
    return defaultRequire(request);
  };
  loadedModule._compile(transpile(servicePath), servicePath);
  return loadedModule.exports.ArchitecturesService;
};

const loadArchitecturesController = () => {
  const loadedModule = new Module(controllerPath, module);
  const defaultRequire = loadedModule.require.bind(loadedModule);

  loadedModule.filename = controllerPath;
  loadedModule.paths = Module._nodeModulePaths(dirname(controllerPath));
  loadedModule.require = (request) => {
    if (request === "./architectures.service") {
      return { ArchitecturesService: class ArchitecturesService {} };
    }
    return defaultRequire(request);
  };
  loadedModule._compile(transpile(controllerPath), controllerPath);
  return loadedModule.exports.ArchitecturesController;
};

test("Architectures 목록은 project 검증 후 PLAN·PRODUCTION 레코드를 반환한다", async () => {
  const calls = [];
  const rows = [
    { id: 8, projectId: 17, type: "PRODUCTION", title: "Current" },
    { id: 7, projectId: 17, type: "PLAN", title: "Plan" },
  ];
  const prisma = {
    architecture: {
      findMany: async (args) => {
        calls.push(["architecture.findMany", args]);
        return rows;
      },
    },
  };
  const projectsService = {
    ensureProject: async (projectId) => {
      calls.push(["projects.ensureProject", projectId]);
    },
  };
  const ArchitecturesService = loadArchitecturesService();
  const service = new ArchitecturesService(prisma, projectsService);

  assert.deepEqual(await service.list({ projectId: 17 }), rows);
  assert.deepEqual(calls, [
    ["projects.ensureProject", 17],
    [
      "architecture.findMany",
      { where: { projectId: 17 }, orderBy: [{ type: "asc" }] },
    ],
  ]);

  calls.length = 0;
  const ArchitecturesController = loadArchitecturesController();
  const controller = new ArchitecturesController(service);

  assert.deepEqual(await controller.list(17), { data: rows });
});

test("ArchitecturesService.upsert는 PLAN Markdown·완전한 HTML을 type별 한 행에 저장한다", async () => {
  const calls = [];
  const input = {
    projectId: 17,
    type: "PLAN",
    title: "Deployment architecture plan",
    content: architecturePlanContent,
    html: architecturePlanHtml,
  };
  const existingCreatedAt = new Date("2026-08-10T00:00:00.000Z");
  const saved = { id: 31, createdAt: existingCreatedAt, ...input };
  const prisma = {
    architecture: {
      upsert: async (args) => {
        calls.push(["architecture.upsert", args]);
        return saved;
      },
    },
  };
  const projectsService = {
    ensureProject: async (projectId) => {
      calls.push(["projects.ensureProject", projectId]);
    },
  };
  const ArchitecturesService = loadArchitecturesService();
  const service = new ArchitecturesService(prisma, projectsService);

  assert.deepEqual(await service.upsert(input), saved);
  assert.deepEqual(calls, [
    ["projects.ensureProject", 17],
    [
      "architecture.upsert",
      {
        where: { projectId_type: { projectId: 17, type: "PLAN" } },
        create: input,
        update: {
          title: input.title,
          content: input.content,
          html: input.html,
        },
      },
    ],
  ]);
  assert.equal(saved.id, 31);
  assert.equal(saved.createdAt, existingCreatedAt);
});

test("ArchitecturesService.upsert는 PRODUCTION graph를 canonical JSON으로 저장하고 HTML을 비운다", async () => {
  const calls = [];
  const diagram = validDeployment();
  const saved = {
    id: 32,
    projectId: 17,
    type: "PRODUCTION",
    title: "Current deployment",
    content: JSON.stringify(diagram),
    html: "",
  };
  const prisma = {
    architecture: {
      upsert: async (args) => {
        calls.push(args);
        return saved;
      },
    },
  };
  const projectsService = { ensureProject: async () => {} };
  const ArchitecturesService = loadArchitecturesService();
  const service = new ArchitecturesService(prisma, projectsService);

  assert.deepEqual(
    await service.upsert({
      projectId: 17,
      type: "PRODUCTION",
      title: "Current deployment",
      diagram,
    }),
    saved,
  );
  assert.deepEqual(calls, [
    {
      where: {
        projectId_type: { projectId: 17, type: "PRODUCTION" },
      },
      create: {
        projectId: 17,
        type: "PRODUCTION",
        title: "Current deployment",
        content: JSON.stringify(diagram),
        html: "",
      },
      update: {
        title: "Current deployment",
        content: JSON.stringify(diagram),
        html: "",
      },
    },
  ]);
});

test("ArchitecturesService.upsert는 빈 PLAN Markdown과 불완전한 HTML을 저장 전에 거부한다", async () => {
  const calls = [];
  const prisma = {
    architecture: {
      upsert: async (args) => calls.push(args),
    },
  };
  const projectsService = {
    ensureProject: async (projectId) => calls.push(["ensure", projectId]),
  };
  const ArchitecturesService = loadArchitecturesService();
  const service = new ArchitecturesService(prisma, projectsService);

  for (const invalid of [
    { content: "   ", html: architecturePlanHtml },
    { content: architecturePlanContent, html: "<main>fragment</main>" },
  ]) {
    await assert.rejects(
      service.upsert({
        projectId: 17,
        type: "PLAN",
        title: "Invalid plan",
        ...invalid,
      }),
      BadRequestException,
    );
  }

  assert.equal(calls.some((call) => !Array.isArray(call)), false);
});

test("ArchitecturesService.upsert는 invalid PRODUCTION graph를 저장하지 않는다", async () => {
  const calls = [];
  const prisma = {
    architecture: {
      upsert: async (args) => calls.push(args),
    },
  };
  const projectsService = {
    ensureProject: async (projectId) => calls.push(["ensure", projectId]),
  };
  const ArchitecturesService = loadArchitecturesService();
  const service = new ArchitecturesService(prisma, projectsService);

  await assert.rejects(
    service.upsert({
      projectId: 17,
      type: "PRODUCTION",
      title: "Broken deployment",
      diagram: { kind: "deployment-architecture", schemaVersion: 1 },
    }),
  );
  assert.equal(calls.some((call) => !Array.isArray(call)), false);
});

test("ArchitecturesModule은 통합 controller와 service만 공개한다", () => {
  const moduleSource = readFileSync(modulePath, "utf8");

  assert.doesNotMatch(moduleSource, /ArchitecturePlans/);
  assert.match(moduleSource, /imports:\s*\[\s*PrismaModule\s*,\s*ProjectsModule\s*\]/);
  assert.match(moduleSource, /providers:\s*\[\s*ArchitecturesService\s*\]/);
  assert.match(moduleSource, /exports:\s*\[\s*ArchitecturesService\s*\]/);
  assert.match(moduleSource, /controllers:\s*\[\s*ArchitecturesController\s*\]/);
});
