const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { dirname, join } = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const ts = require("typescript");

const serverRoot = join(__dirname, "..");

const loadTypeScriptExport = (
  relativePath,
  exportName,
  moduleStubs = {},
) => {
  const filename = join(serverRoot, "src", relativePath);
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
  loadedModule.require = (request) =>
    Object.hasOwn(moduleStubs, request)
      ? moduleStubs[request]
      : defaultRequire(request);
  loadedModule._compile(output, filename);
  return loadedModule.exports[exportName];
};

const contracts = [
  {
    resource: "requests",
    delegate: "request",
    serviceName: "RequestsService",
    controllerName: "RequestsController",
  },
  {
    resource: "worklogs",
    delegate: "workLog",
    serviceName: "WorklogsService",
    controllerName: "WorklogsController",
  },
];

test("Requests와 Worklogs 목록 API는 project 검증 후 최근 수정순 결과를 반환한다", async (t) => {
  for (const contract of contracts) {
    await t.test(contract.resource, async () => {
      const calls = [];
      const rows = [
        {
          id: 31,
          projectId: 17,
          title: `${contract.resource} result`,
        },
      ];
      const created = {
        id: 32,
        projectId: 17,
        title: `${contract.resource} created`,
        content: "Created content",
      };
      const prisma = {
        [contract.delegate]: {
          findMany: async (args) => {
            calls.push(["prisma", contract.delegate, "findMany", args]);
            return rows;
          },
          create: async (args) => {
            calls.push(["prisma", contract.delegate, "create", args]);
            return created;
          },
        },
      };
      const projectsService = {
        ensureProject: async (projectId) => {
          calls.push(["projectsService", "ensureProject", projectId]);
        },
      };
      const Service = loadTypeScriptExport(
        `services/${contract.resource}/${contract.resource}.service.ts`,
        contract.serviceName,
        {
          "../../prisma/prisma.service": {
            PrismaService: class PrismaService {},
          },
          "../projects/projects.service": {
            ProjectsService: class ProjectsService {},
          },
        },
      );
      const service = new Service(prisma, projectsService);

      assert.deepEqual(await service.list({ projectId: 17 }), rows);
      assert.deepEqual(calls, [
        ["projectsService", "ensureProject", 17],
        [
          "prisma",
          contract.delegate,
          "findMany",
          {
            where: { projectId: 17 },
            orderBy: { updatedAt: "desc" },
          },
        ],
      ]);

      calls.length = 0;
      const Controller = loadTypeScriptExport(
        `services/${contract.resource}/${contract.resource}.controller.ts`,
        contract.controllerName,
        {
          [`./${contract.resource}.service`]: {
            [contract.serviceName]: class ServiceStub {},
          },
        },
      );
      const controller = new Controller(service);

      assert.deepEqual(await controller.list(17), { data: rows });
      assert.deepEqual(calls, [
        ["projectsService", "ensureProject", 17],
        [
          "prisma",
          contract.delegate,
          "findMany",
          {
            where: { projectId: 17 },
            orderBy: { updatedAt: "desc" },
          },
        ],
      ]);

      calls.length = 0;
      const createInput = {
        projectId: 17,
        title: `${contract.resource} created`,
        content: "Created content",
      };

      assert.deepEqual(await service.create(createInput), created);
      assert.deepEqual(calls, [
        ["projectsService", "ensureProject", 17],
        [
          "prisma",
          contract.delegate,
          "create",
          { data: createInput },
        ],
      ]);
    });
  }
});
