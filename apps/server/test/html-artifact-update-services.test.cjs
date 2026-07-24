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

const loadService = (resource, exportName) => {
  const filename = join(
    serverRoot,
    "src",
    "services",
    resource,
    `${resource}.service.ts`,
  );
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

    return defaultRequire(request);
  };
  loadedModule._compile(output, filename);
  return loadedModule.exports[exportName];
};

const updateCases = [
  {
    resource: "assets",
    exportName: "AssetsService",
    model: "asset",
    label: "Asset",
    idField: "assetId",
    id: 41,
    existing: {
      id: 41,
      projectId: 7,
      title: "Before asset",
      html: "<main>Before asset</main>",
      designs: [{ id: 81 }],
    },
    immutableFields: ["projectId", "designs"],
  },
  {
    resource: "designs",
    exportName: "DesignsService",
    model: "design",
    label: "Design",
    idField: "designId",
    id: 51,
    existing: {
      id: 51,
      projectId: 7,
      wireframeId: 21,
      assetId: 22,
      version: 4,
      title: "Before design",
      html: "<main>Before design</main>",
    },
    immutableFields: ["projectId", "wireframeId", "assetId", "version"],
  },
];

test("HTML 산출물 update는 소유권을 검증한 뒤 title/html만 수정한다", async (t) => {
  for (const serviceCase of updateCases) {
    await t.test(serviceCase.exportName, async () => {
      const calls = [];
      const input = {
        projectId: 7,
        [serviceCase.idField]: serviceCase.id,
        title: `Updated ${serviceCase.label}`,
        html: `<main>Updated ${serviceCase.label}</main>`,
      };
      const updated = {
        ...serviceCase.existing,
        title: input.title,
        html: input.html,
      };
      const prisma = {
        [serviceCase.model]: {
          findUnique: async (args) => {
            calls.push([`${serviceCase.model}.findUnique`, args]);
            return serviceCase.existing;
          },
          update: async (args) => {
            calls.push([`${serviceCase.model}.update`, args]);
            return updated;
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

      const result = await service.update(input);

      assert.deepEqual(result, updated);
      assert.deepEqual(calls, [
        ["projects.ensureProject", 7],
        [
          `${serviceCase.model}.findUnique`,
          { where: { id: serviceCase.id } },
        ],
        [
          `${serviceCase.model}.update`,
          {
            where: { id: serviceCase.id },
            data: { title: input.title, html: input.html },
          },
        ],
      ]);
      assert.deepEqual(Object.keys(calls.at(-1)[1].data).sort(), [
        "html",
        "title",
      ]);
      for (const field of serviceCase.immutableFields) {
        assert.equal(result[field], serviceCase.existing[field]);
        assert.equal(Object.hasOwn(calls.at(-1)[1].data, field), false);
      }
    });
  }
});

test("HTML 산출물 update는 존재하지 않는 레코드를 NotFound로 거부한다", async (t) => {
  for (const serviceCase of updateCases) {
    await t.test(serviceCase.exportName, async () => {
      const calls = [];
      let updateCalled = false;
      const prisma = {
        [serviceCase.model]: {
          findUnique: async (args) => {
            calls.push([`${serviceCase.model}.findUnique`, args]);
            return null;
          },
          update: async () => {
            updateCalled = true;
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
      const input = {
        projectId: 7,
        [serviceCase.idField]: 404,
        title: "Updated title",
        html: "<main>Updated</main>",
      };

      await assert.rejects(
        service.update(input),
        (error) =>
          error instanceof NotFoundException &&
          error.message === `${serviceCase.label} 404 not found`,
      );
      assert.deepEqual(calls, [
        ["projects.ensureProject", 7],
        [`${serviceCase.model}.findUnique`, { where: { id: 404 } }],
      ]);
      assert.equal(updateCalled, false);
    });
  }
});

test("HTML 산출물 update는 다른 프로젝트가 소유한 레코드를 거부한다", async (t) => {
  for (const serviceCase of updateCases) {
    await t.test(serviceCase.exportName, async () => {
      const calls = [];
      let updateCalled = false;
      const prisma = {
        [serviceCase.model]: {
          findUnique: async (args) => {
            calls.push([`${serviceCase.model}.findUnique`, args]);
            return { ...serviceCase.existing, projectId: 8 };
          },
          update: async () => {
            updateCalled = true;
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
      const input = {
        projectId: 7,
        [serviceCase.idField]: serviceCase.id,
        title: "Updated title",
        html: "<main>Updated</main>",
      };

      await assert.rejects(
        service.update(input),
        (error) =>
          error instanceof BadRequestException &&
          error.message ===
            `${serviceCase.label} ${serviceCase.id} does not belong to project 7`,
      );
      assert.deepEqual(calls, [
        ["projects.ensureProject", 7],
        [
          `${serviceCase.model}.findUnique`,
          { where: { id: serviceCase.id } },
        ],
      ]);
      assert.equal(updateCalled, false);
    });
  }
});
