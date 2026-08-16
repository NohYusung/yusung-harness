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

const loadTypeScriptExport = (relativePath, exportName, moduleStubs = {}) => {
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

const erdScene = {
  type: "excalidraw",
  version: 2,
  source: "yusung-harness:erd",
  elements: [
    {
      id: "users-table",
      type: "rectangle",
      x: 40,
      y: 40,
      width: 240,
      height: 160,
      angle: 0,
      strokeColor: "#1e1e1e",
      backgroundColor: "#ffffff",
      fillStyle: "solid",
      strokeWidth: 1,
      strokeStyle: "solid",
      roughness: 0,
      opacity: 100,
      groupIds: ["users-group"],
      frameId: null,
      roundness: { type: 3 },
      seed: 1,
      version: 1,
      versionNonce: 2,
      isDeleted: false,
      boundElements: null,
      updated: 1,
      link: null,
      locked: true,
      customData: {
        contract: "ERDExcalidraw/1.0",
        kind: "table",
        qualifiedName: "users",
        columns: [
          {
            name: "id",
            type: "INTEGER",
            nullable: false,
            primaryKey: true,
            foreignKey: false,
            unique: true,
            default: null,
          },
        ],
      },
    },
    {
      id: "users-title",
      type: "text",
      x: 64,
      y: 64,
      width: 64,
      height: 24,
      angle: 0,
      strokeColor: "#1e1e1e",
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 1,
      strokeStyle: "solid",
      roughness: 0,
      opacity: 100,
      groupIds: ["users-group"],
      frameId: null,
      roundness: null,
      seed: 3,
      version: 1,
      versionNonce: 4,
      isDeleted: false,
      boundElements: null,
      updated: 1,
      text: "users",
      originalText: "users",
      fontSize: 18,
      fontFamily: 1,
      textAlign: "left",
      verticalAlign: "top",
      containerId: null,
      autoResize: true,
      lineHeight: 1.25,
      link: null,
      locked: true,
    },
    {
      id: "erd-metadata",
      type: "text",
      x: 40,
      y: 8,
      width: 320,
      height: 24,
      angle: 0,
      strokeColor: "#1e1e1e",
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 1,
      strokeStyle: "solid",
      roughness: 0,
      opacity: 100,
      groupIds: [],
      frameId: null,
      roundness: null,
      seed: 5,
      version: 1,
      versionNonce: 6,
      isDeleted: false,
      boundElements: null,
      updated: 1,
      text: "Project database ERD",
      originalText: "Project database ERD",
      fontSize: 18,
      fontFamily: 1,
      textAlign: "left",
      verticalAlign: "top",
      containerId: null,
      autoResize: true,
      lineHeight: 1.25,
      link: null,
      locked: true,
      customData: {
        contract: "ERDExcalidraw/1.0",
        kind: "erd-metadata",
        name: "Project database ERD",
        scope: "main",
        engine: "SQLite",
        sourceRevision: "test-revision",
        inventoryFingerprint: "0".repeat(64),
      },
    },
  ],
  appState: {},
  files: {},
};
const canonicalizeExcalidrawScene = loadTypeScriptExport(
  "services/erd/excalidraw-scene.ts",
  "canonicalizeExcalidrawScene",
);
const canonicalErdScene = canonicalizeExcalidrawScene(erdScene);
const publicErdSelect = {
  id: true,
  projectId: true,
  createdAt: true,
  updatedAt: true,
  title: true,
  scene: true,
};

const contracts = [
  {
    resource: "db",
    delegate: "dB",
    className: "Db",
    idField: "dbId",
    bodyField: "content",
    bodyValue: "# users\n\n| column | type |",
    storedBodyValue: "# users\n\n| column | type |",
  },
  {
    resource: "erd",
    delegate: "eRD",
    className: "Erd",
    idField: "erdId",
    bodyField: "scene",
    bodyValue: erdScene,
    storedBodyValue: canonicalErdScene,
    publicSelect: publicErdSelect,
  },
];

test("DB와 ERD service는 프로젝트 소유권 경계 안에서 목록·생성·수정을 수행한다", async (t) => {
  for (const contract of contracts) {
    await t.test(contract.resource, async () => {
      const calls = [];
      const rows = [
        {
          id: 31,
          projectId: 17,
          title: `${contract.className} artifact`,
          [contract.bodyField]: contract.storedBodyValue,
        },
      ];
      const created = { ...rows[0], id: 32 };
      const updated = {
        ...rows[0],
        title: `Updated ${contract.className}`,
      };
      let existing = rows[0];
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
          findUnique: async (args) => {
            calls.push(["prisma", contract.delegate, "findUnique", args]);
            return existing;
          },
          update: async (args) => {
            calls.push(["prisma", contract.delegate, "update", args]);
            return updated;
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
        `${contract.className}Service`,
        {
          "../../prisma/prisma.service": {
            PrismaService: class PrismaService {},
          },
          "../projects/projects.service": {
            ProjectsService: class ProjectsService {},
          },
          ...(contract.resource === "erd"
            ? {
                "./excalidraw-scene": {
                  canonicalizeExcalidrawScene,
                },
              }
            : {}),
        },
      );
      const service = new Service(prisma, projectsService);

      assert.deepEqual(await service.list({ projectId: 17 }), rows);
      const listQuery = {
        where: { projectId: 17 },
        orderBy: { updatedAt: "desc" },
        ...(contract.publicSelect ? { select: contract.publicSelect } : {}),
      };
      assert.deepEqual(calls, [
        ["projectsService", "ensureProject", 17],
        ["prisma", contract.delegate, "findMany", listQuery],
      ]);

      calls.length = 0;
      const createInput = {
        projectId: 17,
        title: `${contract.className} artifact`,
        [contract.bodyField]: contract.bodyValue,
      };

      assert.deepEqual(await service.create(createInput), created);
      assert.deepEqual(calls, [
        ["projectsService", "ensureProject", 17],
        [
          "prisma",
          contract.delegate,
          "create",
          {
            data: {
              projectId: createInput.projectId,
              title: createInput.title,
              [contract.bodyField]: contract.storedBodyValue,
            },
            ...(contract.publicSelect ? { select: contract.publicSelect } : {}),
          },
        ],
      ]);

      calls.length = 0;
      const updateInput = {
        projectId: 17,
        [contract.idField]: 31,
        title: `Updated ${contract.className}`,
        [contract.bodyField]: contract.bodyValue,
      };

      assert.deepEqual(await service.update(updateInput), updated);
      assert.deepEqual(calls, [
        ["projectsService", "ensureProject", 17],
        [
          "prisma",
          contract.delegate,
          "findUnique",
          {
            where: { id: 31 },
            ...(contract.publicSelect
              ? { select: { id: true, projectId: true } }
              : {}),
          },
        ],
        [
          "prisma",
          contract.delegate,
          "update",
          {
            where: { id: 31 },
            data: {
              title: updateInput.title,
              [contract.bodyField]: contract.storedBodyValue,
            },
            ...(contract.publicSelect ? { select: contract.publicSelect } : {}),
          },
        ],
      ]);

      calls.length = 0;
      existing = null;
      await assert.rejects(
        service.update(updateInput),
        (error) =>
          error instanceof NotFoundException &&
          error.message === `${contract.className.toUpperCase()} 31 not found`,
      );
      assert.deepEqual(calls, [
        ["projectsService", "ensureProject", 17],
        [
          "prisma",
          contract.delegate,
          "findUnique",
          {
            where: { id: 31 },
            ...(contract.publicSelect
              ? { select: { id: true, projectId: true } }
              : {}),
          },
        ],
      ]);

      calls.length = 0;
      existing = { ...rows[0], projectId: 99 };
      await assert.rejects(
        service.update(updateInput),
        (error) =>
          error instanceof BadRequestException &&
          error.message ===
            `${contract.className.toUpperCase()} 31 does not belong to project 17`,
      );
      assert.deepEqual(calls, [
        ["projectsService", "ensureProject", 17],
        [
          "prisma",
          contract.delegate,
          "findUnique",
          {
            where: { id: 31 },
            ...(contract.publicSelect
              ? { select: { id: true, projectId: true } }
              : {}),
          },
        ],
      ]);
    });
  }
});

test("DB와 ERD REST 목록 API는 숫자 projectId를 service에 전달하고 data envelope를 반환한다", async (t) => {
  for (const contract of contracts) {
    await t.test(contract.resource, async () => {
      const calls = [];
      const rows = [{ id: 31, projectId: 17 }];
      const service = {
        list: async (input) => {
          calls.push(input);
          return rows;
        },
      };
      const Controller = loadTypeScriptExport(
        `services/${contract.resource}/${contract.resource}.controller.ts`,
        `${contract.className}Controller`,
        {
          [`./${contract.resource}.service`]: {
            [`${contract.className}Service`]: class ServiceStub {},
          },
        },
      );
      const controller = new Controller(service);

      assert.deepEqual(await controller.list(17), { data: rows });
      assert.deepEqual(calls, [{ projectId: 17 }]);
    });
  }
});

test("DB·ERD·MCP 구현에는 처리되지 않은 AGENT 작업 메모가 남지 않는다", () => {
  for (const relativePath of [
    "mcp/mcp.service.ts",
    ...contracts.flatMap(({ resource }) => [
      `services/${resource}/${resource}.service.ts`,
      `services/${resource}/${resource}.controller.ts`,
      `services/${resource}/${resource}.module.ts`,
    ]),
  ]) {
    const source = readFileSync(join(serverRoot, "src", relativePath), "utf8");

    assert.doesNotMatch(source, /\bAGENT\b/, `${relativePath} 작업 메모 제거`);
  }
});
