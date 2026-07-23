const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { dirname, join } = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const ts = require("typescript");

const serverRoot = join(__dirname, "..");

const servicePath = (resource) =>
  join(serverRoot, "src", "services", resource, `${resource}.service.ts`);

const serviceSource = (resource) => readFileSync(servicePath(resource), "utf8");

const loadService = (resource, exportName) => {
  const filename = servicePath(resource);
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      experimentalDecorators: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  const loadedModule = new Module(filename, module);
  const defaultRequire = loadedModule.require.bind(loadedModule);

  loadedModule.filename = filename;
  loadedModule.paths = Module._nodeModulePaths(dirname(filename));
  loadedModule.require = (request) => {
    if (request === "../../prisma/prisma.service") {
      return { PrismaService: class PrismaService {} };
    }
    if (request === "../projects/projects.service") {
      return { ProjectsService: class ProjectsService {} };
    }
    if (request === "../tasks/tasks.service") {
      return { TasksService: class TasksService {} };
    }
    if (request === "../plans/plans.service") {
      return { PlansService: class PlansService {} };
    }
    if (request === "./deployment-architecture") {
      return {
        deploymentArchitectureSchema: { parse: (input) => input },
        serializeDeploymentArchitecture: (input) => JSON.stringify(input),
      };
    }

    return defaultRequire(request);
  };
  loadedModule._compile(output, filename);
  return loadedModule.exports[exportName];
};

const createOnlyContracts = [
  {
    resource: "plans",
    model: "plan",
    fields: ["projectId", "title", "content"],
    forbiddenFields: ["tasks", "id"],
  },
  {
    resource: "architectures",
    model: "architecture",
    fields: ["projectId", "title", "diagram"],
    forbiddenFields: ["id"],
  },
  {
    resource: "assets",
    model: "asset",
    fields: ["projectId", "title", "html"],
    forbiddenFields: ["id", "taskId", "planId"],
  },
  {
    resource: "designs",
    model: "design",
    fields: [
      "projectId",
      "wireframeId",
      "assetId",
      "title",
      "html",
    ],
    forbiddenFields: ["id", "taskId", "planId"],
  },
  {
    resource: "drafts",
    model: "draft",
    fields: ["projectId", "title", "content"],
    forbiddenFields: ["id"],
  },
  {
    resource: "reviews",
    model: "review",
    fields: ["projectId", "title", "content"],
    forbiddenFields: ["id", "planId"],
  },
  {
    resource: "wireframes",
    model: "wireframe",
    fields: ["projectId", "title", "html"],
    forbiddenFields: ["id", "taskId", "planId"],
  },
];

test("7개 AGENT 대상 service는 create-only 입력과 Prisma 쓰기 경계를 제공한다", () => {
  for (const contract of createOnlyContracts) {
    const source = serviceSource(contract.resource);
    const signature = source.match(
      /async\s+create\s*\(\s*\{([\s\S]*?)\}\s*:\s*\{([\s\S]*?)\}\s*\)\s*\{/,
    );

    assert.doesNotMatch(source, /\bAGENT\b/, `${contract.resource} AGENT 주석 제거`);
    assert.ok(signature, `${contract.resource}.create가 존재해야 한다`);
    const inputContract = `${signature[1]}\n${signature[2]}`;

    for (const field of contract.fields) {
      assert.match(inputContract, new RegExp(`\\b${field}\\b`));
    }
    for (const field of contract.forbiddenFields) {
      assert.doesNotMatch(
        inputContract,
        new RegExp(`\\b${field}\\b`),
        `${contract.resource}.create 입력에서 ${field}를 제거해야 한다`,
      );
    }

    assert.doesNotMatch(source, /async\s+(?:save|createVersion)\s*\(/);
    assert.doesNotMatch(
      source,
      new RegExp(
        `(?:this\\.prisma|transaction)\\.${contract.model}\\.update\\s*\\(`,
      ),
      `${contract.resource}는 ${contract.model}.update를 호출하면 안 된다`,
    );
  }
});

const directCreateCases = [
  {
    resource: "architectures",
    exportName: "ArchitecturesService",
    model: "architecture",
    input: {
      projectId: 7,
      title: "Production architecture",
      diagram: {
        kind: "deployment-architecture",
        schemaVersion: 1,
        name: "Production",
        environments: [],
        nodes: [{ id: "api", name: "API", kind: "service" }],
        connections: [],
      },
    },
    expectedData(input) {
      return {
        projectId: input.projectId,
        title: input.title,
        content: JSON.stringify(input.diagram),
      };
    },
  },
  {
    resource: "drafts",
    exportName: "DraftsService",
    model: "draft",
    input: {
      projectId: 7,
      title: "Draft",
      content: "Draft content",
    },
    expectedData: (input) => input,
  },
  {
    resource: "assets",
    exportName: "AssetsService",
    model: "asset",
    input: {
      projectId: 7,
      title: "Asset",
      html: "<!doctype html><html><body>Asset</body></html>",
    },
    expectedData: (input) => input,
  },
  {
    resource: "wireframes",
    exportName: "WireframesService",
    model: "wireframe",
    input: {
      projectId: 7,
      title: "Wireframe",
      html: "<!doctype html><html><body>Wireframe</body></html>",
    },
    expectedData: (input) => input,
  },
  {
    resource: "reviews",
    exportName: "ReviewsService",
    model: "review",
    input: {
      projectId: 7,
      title: "Review",
      content: "Review content",
    },
    expectedData: (input) => input,
  },
];

test("create-only service는 project를 검증한 뒤 create만 호출한다", async (t) => {
  for (const serviceCase of directCreateCases) {
    await t.test(serviceCase.exportName, async () => {
      const calls = [];
      const created = { id: 31, ...serviceCase.expectedData(serviceCase.input) };
      const prisma = {
        [serviceCase.model]: {
          create: async (args) => {
            calls.push([`${serviceCase.model}.create`, args]);
            return created;
          },
          update: async () => {
            calls.push([`${serviceCase.model}.update`]);
            throw new Error(`${serviceCase.model}.update must not be called`);
          },
        },
      };
      const projectsService = {
        ensureProject: async (projectId) => {
          calls.push(["projects.ensureProject", projectId]);
        },
      };
      const Service = loadService(serviceCase.resource, serviceCase.exportName);
      const service = new Service(prisma, projectsService);

      const result = await service.create(serviceCase.input);

      assert.deepEqual(result, created);
      assert.equal(service.save, undefined);
      assert.deepEqual(calls[0], ["projects.ensureProject", 7]);
      assert.deepEqual(calls.at(-1), [
        `${serviceCase.model}.create`,
        { data: serviceCase.expectedData(serviceCase.input) },
      ]);
      assert.equal(
        calls.some(([name]) => name === `${serviceCase.model}.update`),
        false,
      );
    });
  }
});

test("DesignsService.create는 관련 산출물을 검증하고 design.create만 호출한다", async () => {
  const calls = [];
  const input = {
    projectId: 7,
    wireframeId: 21,
    assetId: 22,
    title: "Design",
    html: "<!doctype html><html><body>Design</body></html>",
  };
  const created = { id: 31, ...input };
  const transaction = {
    wireframe: {
      findUnique: async (args) => {
        calls.push(["wireframe.findUnique", args]);
        return { id: 21, projectId: 7 };
      },
    },
    asset: {
      findUnique: async (args) => {
        calls.push(["asset.findUnique", args]);
        return { id: 22, projectId: 7 };
      },
    },
    design: {
      findUnique: async () => {
        throw new Error("design.findUnique must not be called");
      },
      create: async (args) => {
        calls.push(["design.create", args]);
        return created;
      },
      update: async () => {
        throw new Error("design.update must not be called");
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
  const DesignsService = loadService("designs", "DesignsService");
  const service = new DesignsService(prisma, projectsService);

  const result = await service.create(input);

  assert.deepEqual(result, created);
  assert.equal(service.save, undefined);
  assert.deepEqual(calls, [
    ["projects.ensureProject", 7],
    ["wireframe.findUnique", { where: { id: 21 } }],
    ["asset.findUnique", { where: { id: 22 } }],
    [
      "design.create",
      {
        data: {
          projectId: 7,
          wireframeId: 21,
          assetId: 22,
          title: "Design",
          html: "<!doctype html><html><body>Design</body></html>",
        },
      },
    ],
  ]);
});

test("DesignsService.create는 같은 project의 Asset과 Wireframe만 조합한다", async (t) => {
  const input = {
    projectId: 7,
    wireframeId: 21,
    assetId: 22,
    title: "Design",
    html: "<!doctype html><html><body>Design</body></html>",
  };

  for (const foreignRelation of ["wireframe", "asset"]) {
    await t.test(`${foreignRelation}이 다른 project에 속하면 거부한다`, async () => {
      let createCalled = false;
      const transaction = {
        wireframe: {
          findUnique: async () => ({
            id: 21,
            projectId: foreignRelation === "wireframe" ? 8 : 7,
          }),
        },
        asset: {
          findUnique: async () => ({
            id: 22,
            projectId: foreignRelation === "asset" ? 8 : 7,
          }),
        },
        design: {
          create: async () => {
            createCalled = true;
          },
        },
      };
      const prisma = {
        $transaction: async (operation) => operation(transaction),
      };
      const projectsService = { ensureProject: async () => undefined };
      const DesignsService = loadService("designs", "DesignsService");
      const service = new DesignsService(prisma, projectsService);

      await assert.rejects(
        service.create(input),
        new RegExp(`does not belong to project ${input.projectId}`),
      );
      assert.equal(createCalled, false);
    });
  }
});
