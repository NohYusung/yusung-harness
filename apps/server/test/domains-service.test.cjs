const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { dirname, join } = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const {
  BadRequestException,
  ConflictException,
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

/** TypeScript service를 실제 Nest exception과 함께 CommonJS로 로드한다. */
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

/** Domain validation과 write가 같은 transaction을 사용하는지 기록하는 harness. */
function createTransactionalHarness({ records = [], writeError = null } = {}) {
  const calls = [];
  const writes = [];
  const normalizedRecords = records.map((record) => ({
    parentId: null,
    content: "# Domain",
    title: `Domain ${record.id}`,
    ...record,
  }));
  const recordsById = new Map(
    normalizedRecords.map((record) => [record.id, record]),
  );
  const matchesWhere = (record, where = {}) => {
    const idMatches =
      !Object.hasOwn(where, "id") ||
      (typeof where.id === "object"
        ? record.id !== where.id.not
        : record.id === where.id);

    return (
      idMatches &&
      (!Object.hasOwn(where, "projectId") ||
        record.projectId === where.projectId) &&
      (!Object.hasOwn(where, "title") || record.title === where.title)
    );
  };
  const transactionDomain = {
    findUnique: async (args) => {
      calls.push(["transaction.domain.findUnique", args]);
      return recordsById.get(args.where.id) ?? null;
    },
    findFirst: async (args) => {
      calls.push(["transaction.domain.findFirst", args]);
      return normalizedRecords.find((record) => matchesWhere(record, args.where)) ?? null;
    },
    create: async (args) => {
      calls.push(["transaction.domain.create", args]);
      if (writeError) throw writeError;
      writes.push(["create", args]);
      return { id: 99, ...args.data };
    },
    update: async (args) => {
      calls.push(["transaction.domain.update", args]);
      if (writeError) throw writeError;
      writes.push(["update", args]);
      return { ...recordsById.get(args.where.id), ...args.data };
    },
  };
  const outsideTransaction = async () => {
    calls.push(["outside-transaction.domain"]);
    throw new Error("Domain validation and writes must use a transaction");
  };
  const prisma = {
    domain: {
      findUnique: outsideTransaction,
      findFirst: outsideTransaction,
      create: outsideTransaction,
      update: outsideTransaction,
    },
    $transaction: async (operation) => {
      calls.push(["transaction.begin"]);
      try {
        const result = await operation({ domain: transactionDomain });
        calls.push(["transaction.commit"]);
        return result;
      } catch (error) {
        calls.push(["transaction.rollback"]);
        throw error;
      }
    },
  };
  const projectsService = {
    ensureProject: async (projectId) => {
      calls.push(["projects.ensureProject", projectId]);
    },
  };

  return { calls, prisma, projectsService, writes };
}

const legacyDomainErd = JSON.stringify({
  kind: "domain-erd",
  schemaVersion: 1,
  entities: [],
  relationships: [],
});

test("DomainsService.list는 프로젝트의 Markdown Domain 페이지를 최근 수정순으로 조회한다", async () => {
  const calls = [];
  const domains = [{ id: 1, projectId: 7, parentId: null }];
  const prisma = {
    domain: {
      findMany: async (args) => {
        calls.push(["domain.findMany", args]);
        return domains;
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

  await assert.doesNotReject(async () => {
    assert.deepEqual(await service.list({ projectId: 7 }), domains);
  });
  assert.deepEqual(calls, [
    ["projects.ensureProject", 7],
    [
      "domain.findMany",
      { where: { projectId: 7 }, orderBy: { updatedAt: "desc" } },
    ],
  ]);
});

test("DomainsService.create는 생략한 parentId를 root로 저장하고 제목을 trim한다", async () => {
  const harness = createTransactionalHarness();
  const DomainsService = loadDomainsService();
  const service = new DomainsService(harness.prisma, harness.projectsService);

  const created = await service.create({
    projectId: 7,
    title: "  Orders  ",
    content: "# Orders\n\nOrder lifecycle.",
  });

  assert.deepEqual(created, {
    id: 99,
    projectId: 7,
    parentId: null,
    title: "Orders",
    content: "# Orders\n\nOrder lifecycle.",
  });
  assert.deepEqual(harness.writes, [
    [
      "create",
      {
        data: {
          projectId: 7,
          parentId: null,
          title: "Orders",
          content: "# Orders\n\nOrder lifecycle.",
        },
      },
    ],
  ]);
  assert.equal(harness.calls.at(-1)[0], "transaction.commit");
});

test("DomainsService.create는 같은 project의 valid parent에 child를 연결한다", async () => {
  const harness = createTransactionalHarness({
    records: [{ id: 21, projectId: 7, title: "Commerce" }],
  });
  const DomainsService = loadDomainsService();
  const service = new DomainsService(harness.prisma, harness.projectsService);

  const child = await service.create({
    projectId: 7,
    parentId: 21,
    title: "Payment",
    content: "# Payment",
  });

  assert.equal(child.parentId, 21);
  assert.equal(harness.calls.at(-1)[0], "transaction.commit");
});

test("DomainsService.create는 duplicate title을 409로 거부한다", async () => {
  const harness = createTransactionalHarness({
    records: [{ id: 21, projectId: 7, title: "Orders" }],
  });
  const DomainsService = loadDomainsService();
  const service = new DomainsService(harness.prisma, harness.projectsService);

  await assert.rejects(
    service.create({
      projectId: 7,
      title: " Orders ",
      content: "# Duplicate",
    }),
    (error) => error instanceof ConflictException && error.getStatus() === 409,
  );
  assert.deepEqual(harness.writes, []);
  assert.equal(harness.calls.at(-1)[0], "transaction.rollback");
});

test("DomainsService.create는 missing/cross-project/cyclic parent를 구분해 거부한다", async (t) => {
  const cases = [
    {
      name: "missing parent",
      records: [],
      parentId: 404,
      errorType: NotFoundException,
      status: 404,
    },
    {
      name: "cross-project parent",
      records: [{ id: 21, projectId: 8 }],
      parentId: 21,
      errorType: BadRequestException,
      status: 400,
    },
    {
      name: "existing cyclic parent chain",
      records: [
        { id: 21, projectId: 7, parentId: 22 },
        { id: 22, projectId: 7, parentId: 21 },
      ],
      parentId: 21,
      errorType: BadRequestException,
      status: 400,
    },
  ];

  for (const serviceCase of cases) {
    await t.test(serviceCase.name, async () => {
      const harness = createTransactionalHarness({ records: serviceCase.records });
      const DomainsService = loadDomainsService();
      const service = new DomainsService(
        harness.prisma,
        harness.projectsService,
      );

      await assert.rejects(
        service.create({
          projectId: 7,
          parentId: serviceCase.parentId,
          title: "Invalid child",
          content: "# Invalid",
        }),
        (error) =>
          error instanceof serviceCase.errorType &&
          error.getStatus() === serviceCase.status,
      );
      assert.deepEqual(harness.writes, []);
      assert.equal(harness.calls.at(-1)[0], "transaction.rollback");
    });
  }
});

test("DomainsService.update는 parentId omitted/null/id를 preserve/root/reparent로 해석한다", async (t) => {
  const cases = [
    { name: "preserve", parentId: undefined, expectedParentId: 21 },
    { name: "root", parentId: null, expectedParentId: null },
    { name: "reparent", parentId: 41, expectedParentId: 41 },
  ];

  for (const serviceCase of cases) {
    await t.test(serviceCase.name, async () => {
      const harness = createTransactionalHarness({
        records: [
          { id: 21, projectId: 7, title: "Commerce" },
          { id: 31, projectId: 7, parentId: 21, title: "Orders" },
          { id: 41, projectId: 7, title: "Operations" },
        ],
      });
      const DomainsService = loadDomainsService();
      const service = new DomainsService(
        harness.prisma,
        harness.projectsService,
      );
      const input = {
        projectId: 7,
        domainId: 31,
        title: " Updated Orders ",
        content: "# Updated Orders",
        ...(serviceCase.parentId === undefined
          ? {}
          : { parentId: serviceCase.parentId }),
      };

      const updated = await service.update(input);

      assert.equal(updated.parentId, serviceCase.expectedParentId);
      assert.equal(updated.title, "Updated Orders");
      assert.equal(harness.writes[0][1].data.parentId, serviceCase.expectedParentId);
      assert.equal(harness.calls.at(-1)[0], "transaction.commit");
    });
  }
});

test("DomainsService.update는 missing target와 cross-project target을 거부한다", async (t) => {
  const cases = [
    { name: "missing", records: [], errorType: NotFoundException, status: 404 },
    {
      name: "cross-project",
      records: [{ id: 31, projectId: 8 }],
      errorType: BadRequestException,
      status: 400,
    },
  ];

  for (const serviceCase of cases) {
    await t.test(serviceCase.name, async () => {
      const harness = createTransactionalHarness({ records: serviceCase.records });
      const DomainsService = loadDomainsService();
      const service = new DomainsService(
        harness.prisma,
        harness.projectsService,
      );

      await assert.rejects(
        service.update({
          projectId: 7,
          domainId: 31,
          title: "Updated",
          content: "# Updated",
        }),
        (error) =>
          error instanceof serviceCase.errorType &&
          error.getStatus() === serviceCase.status,
      );
      assert.deepEqual(harness.writes, []);
    });
  }
});

test("DomainsService.update는 self/descendant/existing-cycle reparent를 400으로 거부한다", async (t) => {
  const cases = [
    {
      name: "self parent",
      records: [{ id: 31, projectId: 7 }],
      parentId: 31,
    },
    {
      name: "descendant parent",
      records: [
        { id: 31, projectId: 7 },
        { id: 32, projectId: 7, parentId: 31 },
        { id: 33, projectId: 7, parentId: 32 },
      ],
      parentId: 33,
    },
    {
      name: "existing cyclic parent chain",
      records: [
        { id: 31, projectId: 7 },
        { id: 41, projectId: 7, parentId: 42 },
        { id: 42, projectId: 7, parentId: 41 },
      ],
      parentId: 41,
    },
  ];

  for (const serviceCase of cases) {
    await t.test(serviceCase.name, async () => {
      const harness = createTransactionalHarness({ records: serviceCase.records });
      const DomainsService = loadDomainsService();
      const service = new DomainsService(
        harness.prisma,
        harness.projectsService,
      );

      await assert.rejects(
        service.update({
          projectId: 7,
          domainId: 31,
          parentId: serviceCase.parentId,
          title: "Updated",
          content: "# Updated",
        }),
        (error) =>
          error instanceof BadRequestException && error.getStatus() === 400,
      );
      assert.deepEqual(harness.writes, []);
      assert.equal(harness.calls.at(-1)[0], "transaction.rollback");
    });
  }
});

test("DomainsService는 exact Domain ERD payload를 create/update에서 400으로 거부한다", async (t) => {
  await t.test("create", async () => {
    const harness = createTransactionalHarness();
    const DomainsService = loadDomainsService();
    const service = new DomainsService(harness.prisma, harness.projectsService);

    await assert.rejects(
      service.create({ projectId: 7, title: "ERD", content: legacyDomainErd }),
      (error) => error instanceof BadRequestException && error.getStatus() === 400,
    );
    assert.deepEqual(harness.writes, []);
    assert.equal(harness.calls.at(-1)[0], "transaction.rollback");
  });

  await t.test("update", async () => {
    const harness = createTransactionalHarness({
      records: [{ id: 31, projectId: 7, title: "Orders" }],
    });
    const DomainsService = loadDomainsService();
    const service = new DomainsService(harness.prisma, harness.projectsService);

    await assert.rejects(
      service.update({
        projectId: 7,
        domainId: 31,
        title: "Orders",
        content: legacyDomainErd,
      }),
      (error) => error instanceof BadRequestException && error.getStatus() === 400,
    );
    assert.deepEqual(harness.writes, []);
    assert.equal(harness.calls.at(-1)[0], "transaction.rollback");
  });
});

test("DomainsService는 DB unique race의 P2002를 409로 변환한다", async () => {
  const harness = createTransactionalHarness({ writeError: { code: "P2002" } });
  const DomainsService = loadDomainsService();
  const service = new DomainsService(harness.prisma, harness.projectsService);

  await assert.rejects(
    service.create({ projectId: 7, title: "Orders", content: "# Orders" }),
    (error) => error instanceof ConflictException && error.getStatus() === 409,
  );
});

test("DomainsService는 존재하지 않는 project에서 transaction을 시작하지 않는다", async () => {
  const harness = createTransactionalHarness();
  harness.projectsService.ensureProject = async () => {
    throw new NotFoundException("Project 404 not found");
  };
  const DomainsService = loadDomainsService();
  const service = new DomainsService(harness.prisma, harness.projectsService);

  await assert.rejects(
    service.create({ projectId: 404, title: "Missing", content: "# Missing" }),
    (error) => error instanceof NotFoundException && error.getStatus() === 404,
  );
  assert.equal(
    harness.calls.some(([name]) => name === "transaction.begin"),
    false,
  );
});
