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
  "wireframes",
  "wireframes.service.ts",
);

const loadWireframesService = () => {
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
  return loadedModule.exports.WireframesService;
};

const html = "<!doctype html><html><head></head><body>Wireframe</body></html>";
const generatedPageCuid = "cmnewwireframepage000000000001";

function createTransactionalHarness({ records = [] } = {}) {
  const calls = [];
  const writes = [];
  const recordsById = new Map(records.map((record) => [record.id, record]));
  const matchesWhere = (record, where = {}) =>
    (!Object.hasOwn(where, "id") || record.id === where.id) &&
    (!Object.hasOwn(where, "projectId") ||
      record.projectId === where.projectId) &&
    (!Object.hasOwn(where, "parentId") || record.parentId === where.parentId);
  const queryRecords = (args = {}) =>
    records.filter((record) => matchesWhere(record, args.where));
  const transactionWireframe = {
    findUnique: async (args) => {
      calls.push(["transaction.wireframe.findUnique", args]);
      const record = recordsById.get(args.where.id) ?? null;
      return record && matchesWhere(record, args.where) ? record : null;
    },
    findFirst: async (args) => {
      calls.push(["transaction.wireframe.findFirst", args]);
      return queryRecords(args)[0] ?? null;
    },
    findMany: async (args) => {
      calls.push(["transaction.wireframe.findMany", args]);
      return queryRecords(args);
    },
    count: async (args) => {
      calls.push(["transaction.wireframe.count", args]);
      return queryRecords(args).length;
    },
    create: async (args) => {
      calls.push(["transaction.wireframe.create", args]);
      writes.push(["create", args]);
      return { id: 99, page: generatedPageCuid, ...args.data };
    },
    update: async (args) => {
      calls.push(["transaction.wireframe.update", args]);
      writes.push(["update", args]);
      const existing = recordsById.get(args.where.id) ?? {};
      return { ...existing, ...args.data };
    },
  };
  const outsideTransaction = async (args) => {
    calls.push(["outside-transaction.wireframe", args]);
    throw new Error("wireframe validation and writes must use a transaction");
  };
  const prisma = {
    wireframe: {
      findUnique: outsideTransaction,
      findFirst: outsideTransaction,
      findMany: outsideTransaction,
      count: outsideTransaction,
      create: outsideTransaction,
      update: outsideTransaction,
    },
    $transaction: async (operation) => {
      calls.push(["transaction.begin"]);
      try {
        const result = await operation({ wireframe: transactionWireframe });
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

test("WireframesService.list는 계층 index segment를 자연수로 정렬하고 id로 tie-break한다", async () => {
  const calls = [];
  const wireframes = [
    { id: 80, projectId: 7, index: "1.10" },
    { id: 70, projectId: 7, index: "1.2.1" },
    { id: 60, projectId: 7, index: "1" },
    { id: 50, projectId: 7, index: "10" },
    { id: 40, projectId: 7, index: "2" },
    { id: 30, projectId: 7, index: "1.1.1" },
    { id: 20, projectId: 7, index: "1.1" },
    { id: 19, projectId: 7, index: "1.2" },
    { id: 18, projectId: 7, index: "1.2" },
  ];
  const prisma = {
    wireframe: {
      findMany: async (args) => {
        calls.push(["wireframe.findMany", args]);
        return wireframes;
      },
    },
  };
  const projectsService = {
    ensureProject: async (projectId) => {
      calls.push(["projects.ensureProject", projectId]);
    },
  };
  const WireframesService = loadWireframesService();
  const service = new WireframesService(prisma, projectsService);

  const result = await service.list({ projectId: 7 });

  assert.deepEqual(
    result.map(({ id, index }) => ({ id, index })),
    [
      { id: 60, index: "1" },
      { id: 20, index: "1.1" },
      { id: 30, index: "1.1.1" },
      { id: 18, index: "1.2" },
      { id: 19, index: "1.2" },
      { id: 70, index: "1.2.1" },
      { id: 80, index: "1.10" },
      { id: 40, index: "2" },
      { id: 50, index: "10" },
    ],
  );
  assert.equal(calls[0][0], "projects.ensureProject");
  assert.deepEqual(calls[1][1].where, { projectId: 7 });
});

test("WireframesService.create는 transaction에서 valid root와 direct child를 생성한다", async (t) => {
  await t.test("root", async () => {
    const harness = createTransactionalHarness();
    const WireframesService = loadWireframesService();
    const service = new WireframesService(
      harness.prisma,
      harness.projectsService,
    );
    const input = {
      projectId: 7,
      parentId: null,
      index: "1",
      title: "Home",
      html,
      version: 1,
    };

    const created = await service.create(input);

    assert.equal(created.index, "1");
    assert.deepEqual(harness.writes, [
      ["create", { data: input }],
    ]);
    assert.equal(Object.hasOwn(harness.writes[0][1].data, "page"), false);
    assert.equal(
      harness.calls.some(([name]) => name === "outside-transaction.wireframe"),
      false,
    );
    assert.equal(harness.calls.at(-1)[0], "transaction.commit");
  });

  await t.test("direct child", async () => {
    const harness = createTransactionalHarness({
      records: [
        { id: 21, projectId: 7, parentId: null, index: "1", version: 1 },
      ],
    });
    const WireframesService = loadWireframesService();
    const service = new WireframesService(
      harness.prisma,
      harness.projectsService,
    );
    const input = {
      projectId: 7,
      parentId: 21,
      index: "1.1",
      title: "Login error modal",
      html,
      version: 1,
    };

    await service.create(input);

    assert.deepEqual(harness.writes, [
      ["create", { data: input }],
    ]);
    assert.equal(harness.calls.at(-1)[0], "transaction.commit");
  });
});

test("WireframesService.create는 version별 독립 set과 새 page CUID를 생성한다", async (t) => {
  await t.test("version 2 root는 기존 version 1을 수정하지 않는다", async () => {
    const legacyWireframe = {
      id: 21,
      projectId: 7,
      parentId: null,
      index: "1",
      page: "cmlegacywireframepage00000001",
      title: "Legacy home",
      version: 1,
    };
    const legacySnapshot = { ...legacyWireframe };
    const harness = createTransactionalHarness({
      records: [legacyWireframe],
    });
    const WireframesService = loadWireframesService();
    const service = new WireframesService(
      harness.prisma,
      harness.projectsService,
    );
    const input = {
      projectId: 7,
      parentId: null,
      index: "1",
      title: "Version 2 home",
      html,
      version: 2,
    };

    const created = await service.create(input);

    assert.equal(created.page, generatedPageCuid);
    assert.equal(created.version, 2);
    assert.deepEqual(harness.writes, [["create", { data: input }]]);
    assert.equal(Object.hasOwn(harness.writes[0][1].data, "page"), false);
    assert.equal(
      harness.writes.some(([operation]) => operation === "update"),
      false,
    );
    assert.deepEqual(legacyWireframe, legacySnapshot);
    assert.equal(harness.calls.at(-1)[0], "transaction.commit");
  });

  await t.test("version 2 child는 같은 version 2 parent에 연결된다", async () => {
    const input = {
      projectId: 7,
      parentId: 22,
      index: "1.1",
      title: "Version 2 child",
      html,
      version: 2,
    };
    const sameVersionHarness = createTransactionalHarness({
      records: [
        { id: 22, projectId: 7, parentId: null, index: "1", version: 2 },
      ],
    });
    const WireframesService = loadWireframesService();
    const sameVersionService = new WireframesService(
      sameVersionHarness.prisma,
      sameVersionHarness.projectsService,
    );

    await sameVersionService.create(input);

    assert.deepEqual(sameVersionHarness.writes, [
      ["create", { data: input }],
    ]);
    assert.equal(sameVersionHarness.calls.at(-1)[0], "transaction.commit");
  });

  await t.test("version 2 child는 version 1 parent 연결을 거부한다", async () => {
    const input = {
      projectId: 7,
      parentId: 22,
      index: "1.1",
      title: "Cross-version child",
      html,
      version: 2,
    };
    const WireframesService = loadWireframesService();

    const crossVersionHarness = createTransactionalHarness({
      records: [
        { id: 22, projectId: 7, parentId: null, index: "1", version: 1 },
      ],
    });
    const crossVersionService = new WireframesService(
      crossVersionHarness.prisma,
      crossVersionHarness.projectsService,
    );

    await assert.rejects(
      crossVersionService.create(input),
      (error) => error instanceof BadRequestException,
    );
    assert.deepEqual(crossVersionHarness.writes, []);
    assert.equal(crossVersionHarness.calls.at(-1)[0], "transaction.rollback");
  });

  await t.test("version 누락은 runtime BadRequest로 거부한다", async () => {
    const harness = createTransactionalHarness();
    const WireframesService = loadWireframesService();
    const service = new WireframesService(
      harness.prisma,
      harness.projectsService,
    );

    await assert.rejects(
      service.create({
        projectId: 7,
        parentId: null,
        index: "1",
        title: "Missing version",
        html,
      }),
      (error) => error instanceof BadRequestException,
    );
    assert.deepEqual(harness.writes, []);
    assert.equal(harness.calls.at(-1)[0], "transaction.rollback");
  });

  await t.test("version은 양의 정수여야 한다", async () => {
    for (const invalidVersion of [0, -1, 1.5, "2"]) {
      const harness = createTransactionalHarness();
      const WireframesService = loadWireframesService();
      const service = new WireframesService(
        harness.prisma,
        harness.projectsService,
      );

      await assert.rejects(
        service.create({
          projectId: 7,
          parentId: null,
          index: "1",
          title: "Invalid version",
          html,
          version: invalidVersion,
        }),
        (error) => error instanceof BadRequestException,
      );
      assert.deepEqual(harness.writes, []);
      assert.equal(harness.calls.at(-1)[0], "transaction.rollback");
    }
  });
});

test("WireframesService.create는 invalid root, parent, path를 transaction에서 거부한다", async (t) => {
  const cases = [
    {
      name: "leading-zero root path",
      records: [],
      parentId: null,
      index: "01",
      errorType: BadRequestException,
    },
    {
      name: "multi-segment root path",
      records: [],
      parentId: null,
      index: "1.1",
      errorType: BadRequestException,
    },
    {
      name: "missing parent",
      records: [],
      parentId: 404,
      index: "1.1",
      errorType: NotFoundException,
    },
    {
      name: "cross-project parent",
      records: [{ id: 21, projectId: 8, parentId: null, index: "1" }],
      parentId: 21,
      index: "1.1",
      errorType: BadRequestException,
    },
    {
      name: "mismatched direct-child path",
      records: [{ id: 21, projectId: 7, parentId: null, index: "1" }],
      parentId: 21,
      index: "2.1",
      errorType: BadRequestException,
    },
  ];

  for (const serviceCase of cases) {
    await t.test(serviceCase.name, async () => {
      const harness = createTransactionalHarness({
        records: serviceCase.records,
      });
      const WireframesService = loadWireframesService();
      const service = new WireframesService(
        harness.prisma,
        harness.projectsService,
      );

      await assert.rejects(
        service.create({
          projectId: 7,
          parentId: serviceCase.parentId,
          index: serviceCase.index,
          title: "Invalid",
          html,
          version: 1,
        }),
        (error) => error instanceof serviceCase.errorType,
      );
      assert.deepEqual(harness.writes, []);
      assert.equal(harness.calls.at(-1)[0], "transaction.rollback");
    });
  }
});

test("WireframesService.update는 transaction에서 leaf를 이동하고 page를 보존한다", async () => {
  const harness = createTransactionalHarness({
    records: [
      { id: 21, projectId: 7, parentId: null, index: "1" },
      { id: 31, projectId: 7, parentId: 21, index: "1.1", page: "login" },
      { id: 41, projectId: 7, parentId: null, index: "2" },
    ],
  });
  const WireframesService = loadWireframesService();
  const service = new WireframesService(harness.prisma, harness.projectsService);
  const input = {
    projectId: 7,
    wireframeId: 31,
    parentId: 41,
    index: "2.1",
    title: "Moved login",
    html,
  };

  const updated = await service.update(input);

  assert.equal(updated.page, "login");
  assert.deepEqual(harness.writes, [
    [
      "update",
      {
        where: { id: 31 },
        data: {
          parentId: 41,
          index: "2.1",
          title: "Moved login",
          html,
        },
      },
    ],
  ]);
  assert.equal(
    Object.hasOwn(harness.writes[0][1].data, "page"),
    false,
  );
  assert.equal(harness.calls.at(-1)[0], "transaction.commit");
});

test("WireframesService.update는 children이 있어도 구조가 같으면 title/html을 수정한다", async () => {
  const harness = createTransactionalHarness({
    records: [
      { id: 21, projectId: 7, parentId: null, index: "1" },
      { id: 31, projectId: 7, parentId: 21, index: "1.1", page: "login" },
      { id: 32, projectId: 7, parentId: 31, index: "1.1.1" },
    ],
  });
  const WireframesService = loadWireframesService();
  const service = new WireframesService(harness.prisma, harness.projectsService);

  await service.update({
    projectId: 7,
    wireframeId: 31,
    parentId: 21,
    index: "1.1",
    title: "Renamed login",
    html,
  });

  assert.equal(harness.writes.length, 1);
  assert.equal(harness.writes[0][0], "update");
  assert.equal(harness.calls.at(-1)[0], "transaction.commit");
});

test("WireframesService.update는 invalid parent, cycle, branch 이동을 거부한다", async (t) => {
  const cases = [
    {
      name: "self parent",
      records: [{ id: 31, projectId: 7, parentId: null, index: "1" }],
      parentId: 31,
      index: "1.1",
      errorType: BadRequestException,
    },
    {
      name: "descendant cycle",
      records: [
        { id: 31, projectId: 7, parentId: null, index: "1" },
        { id: 32, projectId: 7, parentId: 31, index: "1.1" },
        { id: 33, projectId: 7, parentId: 32, index: "1.1.1" },
      ],
      parentId: 33,
      index: "1.1.1.1",
      errorType: BadRequestException,
    },
    {
      name: "cross-project parent",
      records: [
        { id: 31, projectId: 7, parentId: null, index: "1" },
        { id: 41, projectId: 8, parentId: null, index: "2" },
      ],
      parentId: 41,
      index: "2.1",
      errorType: BadRequestException,
    },
    {
      name: "branch structural change",
      records: [
        { id: 31, projectId: 7, parentId: null, index: "1" },
        { id: 32, projectId: 7, parentId: 31, index: "1.1" },
      ],
      parentId: null,
      index: "2",
      errorType: BadRequestException,
    },
    {
      name: "missing target",
      records: [],
      wireframeId: 404,
      parentId: null,
      index: "1",
      errorType: NotFoundException,
    },
    {
      name: "cross-project target",
      records: [{ id: 31, projectId: 8, parentId: null, index: "1" }],
      parentId: null,
      index: "1",
      errorType: BadRequestException,
    },
  ];

  for (const serviceCase of cases) {
    await t.test(serviceCase.name, async () => {
      const harness = createTransactionalHarness({
        records: serviceCase.records,
      });
      const WireframesService = loadWireframesService();
      const service = new WireframesService(
        harness.prisma,
        harness.projectsService,
      );

      await assert.rejects(
        service.update({
          projectId: 7,
          wireframeId: serviceCase.wireframeId ?? 31,
          parentId: serviceCase.parentId,
          index: serviceCase.index,
          title: "Invalid update",
          html,
        }),
        (error) => error instanceof serviceCase.errorType,
      );
      assert.deepEqual(harness.writes, []);
      assert.equal(harness.calls.at(-1)[0], "transaction.rollback");
    });
  }
});

test("WireframesService는 존재하지 않는 project에서 transaction을 시작하지 않는다", async () => {
  const harness = createTransactionalHarness();
  harness.projectsService.ensureProject = async () => {
    throw new NotFoundException("Project 404 not found");
  };
  const WireframesService = loadWireframesService();
  const service = new WireframesService(harness.prisma, harness.projectsService);

  await assert.rejects(
    service.create({
      projectId: 404,
      parentId: null,
      index: "1",
      title: "Missing project",
      html,
      version: 1,
    }),
    (error) => error instanceof NotFoundException,
  );
  assert.equal(
    harness.calls.some(([name]) => name === "transaction.begin"),
    false,
  );
});
