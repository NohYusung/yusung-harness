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
  "requests",
  "requests.service.ts",
);

const loadRequestsService = () => {
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
    if (request === "../../prisma/prisma.service") {
      return { PrismaService: class PrismaService {} };
    }
    if (request === "../projects/projects.service") {
      return { ProjectsService: class ProjectsService {} };
    }
    return defaultRequire(request);
  };
  loadedModule._compile(output, servicePath);
  return loadedModule.exports.RequestsService;
};

test("RequestsService.list는 project 검증 후 최근 수정 순으로 조회한다", async () => {
  const calls = [];
  const rows = [{ id: 31, projectId: 17, status: "PENDING" }];
  const prisma = {
    request: {
      findMany: async (args) => {
        calls.push(["request.findMany", args]);
        return rows;
      },
    },
  };
  const projectsService = {
    ensureProject: async (projectId) => {
      calls.push(["projects.ensureProject", projectId]);
    },
  };
  const RequestsService = loadRequestsService();
  const service = new RequestsService(prisma, projectsService);

  assert.deepEqual(await service.list({ projectId: 17 }), rows);
  assert.deepEqual(calls, [
    ["projects.ensureProject", 17],
    [
      "request.findMany",
      { where: { projectId: 17 }, orderBy: { updatedAt: "desc" } },
    ],
  ]);
});

test("RequestsService.create는 project 검증 후 기본 상태 요청을 생성한다", async () => {
  const calls = [];
  const input = {
    projectId: 17,
    title: "Add dashboard filter",
    content: "Filter project artifacts by type.",
  };
  const created = { id: 31, status: "PENDING", ...input };
  const prisma = {
    request: {
      create: async (args) => {
        calls.push(["request.create", args]);
        return created;
      },
    },
  };
  const projectsService = {
    ensureProject: async (projectId) => {
      calls.push(["projects.ensureProject", projectId]);
    },
  };
  const RequestsService = loadRequestsService();
  const service = new RequestsService(prisma, projectsService);

  assert.deepEqual(await service.create(input), created);
  assert.deepEqual(calls, [
    ["projects.ensureProject", 17],
    ["request.create", { data: input }],
  ]);
});

test("RequestsService.userUpdate는 PENDING 요청만 수정한다", async () => {
  const calls = [];
  const input = {
    projectId: 17,
    requestId: 31,
    title: "Updated dashboard filter",
    content: "Filter project artifacts by type and status.",
    status: "IN_PROGRESS",
  };
  const updated = { id: input.requestId, ...input };
  const prisma = {
    request: {
      findUnique: async (args) => {
        calls.push(["request.findUnique", args]);
        return { id: 31, projectId: 17, status: "PENDING" };
      },
      update: async (args) => {
        calls.push(["request.update", args]);
        return updated;
      },
    },
  };
  const projectsService = {
    ensureProject: async (projectId) => {
      calls.push(["projects.ensureProject", projectId]);
    },
  };
  const RequestsService = loadRequestsService();
  const service = new RequestsService(prisma, projectsService);

  assert.deepEqual(await service.userUpdate(input), updated);
  assert.deepEqual(calls, [
    ["projects.ensureProject", 17],
    ["request.findUnique", { where: { id: 31 } }],
    [
      "request.update",
      {
        where: { id: 31 },
        data: {
          title: "Updated dashboard filter",
          content: "Filter project artifacts by type and status.",
          status: "IN_PROGRESS",
        },
      },
    ],
  ]);
});

test("RequestsService.userUpdate는 PENDING이 아닌 요청을 쓰기 없이 거부한다", async () => {
  for (const existingStatus of ["IN_PROGRESS", "COMPLETED"]) {
    const calls = [];
    const prisma = {
      request: {
        findUnique: async (args) => {
          calls.push(["request.findUnique", args]);
          return { id: 31, projectId: 17, status: existingStatus };
        },
        update: async (args) => {
          calls.push(["request.update", args]);
        },
      },
    };
    const projectsService = {
      ensureProject: async (projectId) => {
        calls.push(["projects.ensureProject", projectId]);
      },
    };
    const RequestsService = loadRequestsService();
    const service = new RequestsService(prisma, projectsService);

    await assert.rejects(
      service.userUpdate({
        projectId: 17,
        requestId: 31,
        title: "Blocked dashboard filter",
        content: "This request is no longer editable by a web user.",
        status: "PENDING",
      }),
      (error) =>
        error instanceof BadRequestException &&
        error.message === "Request 31 can only be updated while PENDING",
      existingStatus,
    );
    assert.deepEqual(
      calls,
      [
        ["projects.ensureProject", 17],
        ["request.findUnique", { where: { id: 31 } }],
      ],
      existingStatus,
    );
  }
});

test("RequestsService.update는 기존 상태와 관계없이 에이전트 상태 전이를 수행한다", async () => {
  const calls = [];
  const input = {
    projectId: 17,
    requestId: 31,
    title: "Updated dashboard filter",
    content: "Filter project artifacts by type and status.",
    status: "COMPLETED",
  };
  const updated = { id: input.requestId, ...input };
  const prisma = {
    request: {
      findUnique: async (args) => {
        calls.push(["request.findUnique", args]);
        return { id: 31, projectId: 17, status: "IN_PROGRESS" };
      },
      update: async (args) => {
        calls.push(["request.update", args]);
        return updated;
      },
    },
  };
  const projectsService = {
    ensureProject: async (projectId) => {
      calls.push(["projects.ensureProject", projectId]);
    },
  };
  const RequestsService = loadRequestsService();
  const service = new RequestsService(prisma, projectsService);

  assert.deepEqual(await service.update(input), updated);
  assert.deepEqual(calls, [
    ["projects.ensureProject", 17],
    ["request.findUnique", { where: { id: 31 } }],
    [
      "request.update",
      {
        where: { id: 31 },
        data: {
          title: "Updated dashboard filter",
          content: "Filter project artifacts by type and status.",
          status: "COMPLETED",
        },
      },
    ],
  ]);
});

test("RequestsService.update는 없는 요청을 NotFound로 거부한다", async () => {
  const calls = [];
  const prisma = {
    request: {
      findUnique: async (args) => {
        calls.push(["request.findUnique", args]);
        return null;
      },
      update: async () => {
        calls.push(["request.update"]);
      },
    },
  };
  const projectsService = {
    ensureProject: async (projectId) => {
      calls.push(["projects.ensureProject", projectId]);
    },
  };
  const RequestsService = loadRequestsService();
  const service = new RequestsService(prisma, projectsService);

  await assert.rejects(
    service.update({
      projectId: 17,
      requestId: 404,
      title: "Missing request",
      content: "Missing request content",
      status: "PENDING",
    }),
    (error) =>
      error instanceof NotFoundException &&
      error.message === "Request 404 not found",
  );
  assert.deepEqual(calls, [
    ["projects.ensureProject", 17],
    ["request.findUnique", { where: { id: 404 } }],
  ]);
});

test("RequestsService.update는 다른 프로젝트의 요청을 BadRequest로 거부한다", async () => {
  const calls = [];
  const prisma = {
    request: {
      findUnique: async (args) => {
        calls.push(["request.findUnique", args]);
        return { id: 31, projectId: 18 };
      },
      update: async () => {
        calls.push(["request.update"]);
      },
    },
  };
  const projectsService = {
    ensureProject: async (projectId) => {
      calls.push(["projects.ensureProject", projectId]);
    },
  };
  const RequestsService = loadRequestsService();
  const service = new RequestsService(prisma, projectsService);

  await assert.rejects(
    service.update({
      projectId: 17,
      requestId: 31,
      title: "Cross-project request",
      content: "Cross-project request content",
      status: "COMPLETED",
    }),
    (error) =>
      error instanceof BadRequestException &&
      error.message === "Request 31 does not belong to project 17",
  );
  assert.deepEqual(calls, [
    ["projects.ensureProject", 17],
    ["request.findUnique", { where: { id: 31 } }],
  ]);
});

test("RequestsService source는 AGENT 작업 메모를 남기지 않는다", () => {
  assert.doesNotMatch(readFileSync(servicePath, "utf8"), /\bAGENT\b/);
});
