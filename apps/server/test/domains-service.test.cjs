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

const serverRoot = join(__dirname, "..");
const servicePath = join(
  serverRoot,
  "src",
  "services",
  "domains",
  "domains.service.ts",
);

const loadDomainsService = () => {
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
    if (request === "../../prisma/prisma.service") {
      return { PrismaService: class PrismaService {} };
    }
    if (request === "../projects/projects.service") {
      return { ProjectsService: class ProjectsService {} };
    }

    return defaultRequire(request);
  };
  loadedModule._compile(output, servicePath);
  return loadedModule.exports.DomainsService;
};

test("DomainsService.create는 프로젝트 존재를 확인한 뒤 raw 분석 문서를 생성한다", async () => {
  const calls = [];
  const createdDomain = {
    id: 31,
    projectId: 7,
    title: "Order domain",
    content: "Order, Payment, Shipment",
  };
  const prisma = {
    domain: {
      create: async (args) => {
        calls.push(["domain.create", args]);
        return createdDomain;
      },
    },
  };
  const projectsService = {
    ensureProject: async (projectId) => {
      calls.push(["projects.ensureProject", projectId]);
    },
  };
  const DomainsService = loadDomainsService();
  const service = new DomainsService(prisma, projectsService);

  const result = await service.create({
    projectId: 7,
    title: "Order domain",
    content: "Order, Payment, Shipment",
  });

  assert.deepEqual(result, createdDomain);
  assert.deepEqual(calls, [
    ["projects.ensureProject", 7],
    [
      "domain.create",
      {
        data: {
          projectId: 7,
          title: "Order domain",
          content: "Order, Payment, Shipment",
        },
      },
    ],
  ]);
});

test("DomainsService.create는 존재하지 않는 프로젝트에 문서를 만들지 않는다", async () => {
  let createCalled = false;
  const prisma = {
    domain: {
      create: async () => {
        createCalled = true;
      },
    },
  };
  const projectsService = {
    ensureProject: async (projectId) => {
      throw new NotFoundException(`Project ${projectId} not found`);
    },
  };
  const DomainsService = loadDomainsService();
  const service = new DomainsService(prisma, projectsService);

  await assert.rejects(
    service.create({
      projectId: 404,
      title: "Missing project domain",
      content: "content",
    }),
    (error) =>
      error instanceof NotFoundException &&
      error.message === "Project 404 not found",
  );
  assert.equal(createCalled, false);
});

test("DomainsService.update는 같은 프로젝트의 Domain만 수정한다", async () => {
  const calls = [];
  const updatedDomain = {
    id: 31,
    projectId: 7,
    title: "Updated order domain",
    content: "Updated domain content",
  };
  const prisma = {
    domain: {
      findUnique: async (args) => {
        calls.push(["domain.findUnique", args]);
        return { id: 31, projectId: 7 };
      },
      update: async (args) => {
        calls.push(["domain.update", args]);
        return updatedDomain;
      },
    },
  };
  const projectsService = {
    ensureProject: async (projectId) => {
      calls.push(["projects.ensureProject", projectId]);
    },
  };
  const DomainsService = loadDomainsService();
  const service = new DomainsService(prisma, projectsService);

  const result = await service.update({
    projectId: 7,
    domainId: 31,
    title: "Updated order domain",
    content: "Updated domain content",
  });

  assert.deepEqual(result, updatedDomain);
  assert.deepEqual(calls, [
    ["projects.ensureProject", 7],
    ["domain.findUnique", { where: { id: 31 } }],
    [
      "domain.update",
      {
        where: { id: 31 },
        data: {
          title: "Updated order domain",
          content: "Updated domain content",
        },
      },
    ],
  ]);
});

test("DomainsService.update는 존재하지 않는 Domain을 NotFound로 거부한다", async () => {
  let updateCalled = false;
  const prisma = {
    domain: {
      findUnique: async () => null,
      update: async () => {
        updateCalled = true;
      },
    },
  };
  const projectsService = { ensureProject: async () => {} };
  const DomainsService = loadDomainsService();
  const service = new DomainsService(prisma, projectsService);

  await assert.rejects(
    service.update({
      projectId: 7,
      domainId: 404,
      title: "Missing domain",
      content: "content",
    }),
    (error) =>
      error instanceof NotFoundException &&
      error.message === "Domain 404 not found",
  );
  assert.equal(updateCalled, false);
});

test("DomainsService.update는 다른 프로젝트가 소유한 Domain을 거부한다", async () => {
  let updateCalled = false;
  const prisma = {
    domain: {
      findUnique: async () => ({ id: 31, projectId: 8 }),
      update: async () => {
        updateCalled = true;
      },
    },
  };
  const projectsService = { ensureProject: async () => {} };
  const DomainsService = loadDomainsService();
  const service = new DomainsService(prisma, projectsService);

  await assert.rejects(
    service.update({
      projectId: 7,
      domainId: 31,
      title: "Cross-project update",
      content: "content",
    }),
    (error) =>
      error instanceof BadRequestException &&
      error.message === "Domain 31 does not belong to project 7",
  );
  assert.equal(updateCalled, false);
});
