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

const serviceMethodSource = (source, methodName) => {
  const sourceFile = ts.createSourceFile(
    "service.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  let matchedMethod;

  const visit = (node) => {
    if (
      ts.isMethodDeclaration(node) &&
      node.name.getText(sourceFile) === methodName
    ) {
      matchedMethod = node;
      return;
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  assert.ok(matchedMethod, `${methodName} 메서드가 존재해야 한다`);
  return source.slice(
    matchedMethod.getStart(sourceFile),
    matchedMethod.getEnd(),
  );
};

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
    return defaultRequire(request);
  };
  loadedModule._compile(output, filename);
  return loadedModule.exports[exportName];
};

const createContracts = [
  {
    resource: "plans",
    model: "plan",
    fields: ["projectId", "title", "content"],
    forbiddenFields: ["tasks", "id"],
  },
  {
    resource: "assets",
    model: "asset",
    fields: ["projectId", "title", "html"],
    forbiddenFields: ["id", "taskId", "planId"],
  },
  {
    resource: "research",
    model: "research",
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
    fields: ["projectId", "parentId", "index", "title", "html"],
    forbiddenFields: ["id", "taskId", "planId", "page"],
  },
];

test("5개 직접 생성 service는 create 입력과 허용된 Prisma 쓰기 경계를 제공한다", () => {
  for (const contract of createContracts) {
    const source = serviceSource(contract.resource);
    const createSource = serviceMethodSource(source, "create");
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
      createSource,
      new RegExp(
        `(?:this\\.prisma|transaction)\\.${contract.model}\\.update\\s*\\(`,
      ),
      `${contract.resource}.create는 ${contract.model}.update를 호출하면 안 된다`,
    );
  }
});

const directCreateCases = [
  {
    resource: "research",
    exportName: "ResearchService",
    model: "research",
    input: {
      projectId: 7,
      title: "Research",
      content: "Research content",
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
      parentId: null,
      index: "1",
      title: "Wireframe",
      html: "<!doctype html><html><body>Wireframe</body></html>",
      version: 1,
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

test("직접 생성 service는 project를 검증한 뒤 create만 호출한다", async (t) => {
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
      prisma.$transaction = async (operation) => operation(prisma);
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
