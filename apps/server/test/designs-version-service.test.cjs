const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { dirname, join } = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const ts = require("typescript");

const serverRoot = join(__dirname, "..");
const servicePath = join(
  serverRoot,
  "src",
  "services",
  "designs",
  "designs.service.ts",
);

class PrismaClientKnownRequestError extends Error {
  constructor(code) {
    super(`Prisma error ${code}`);
    this.code = code;
  }
}

/** TypeScript service를 현재 Node test process에서 실행 가능한 모듈로 적재한다. */
function loadDesignsService() {
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
    if (request === "@prisma/client") {
      return { Prisma: { PrismaClientKnownRequestError } };
    }
    if (request === "../../prisma/prisma.service") {
      return { PrismaService: class PrismaService {} };
    }
    if (request === "../projects/projects.service") {
      return { ProjectsService: class ProjectsService {} };
    }

    return defaultRequire(request);
  };
  loadedModule._compile(output, servicePath);
  return loadedModule.exports.DesignsService;
}

const baseInput = {
  projectId: 7,
  wireframeId: 21,
  assetId: 22,
  title: "Design",
  html: "<!doctype html><html><body>Design</body></html>",
};

test("DesignsService.create는 explicit version 1과 2를 그대로 저장한다", async (t) => {
  for (const version of [1, 2]) {
    await t.test(`version ${version}`, async () => {
      const createCalls = [];
      const input = { ...baseInput, version };
      const created = { id: 31, ...input };
      const prisma = {
        $transaction: async (operation) =>
          operation({
            wireframe: {
              findUnique: async () => ({ id: 21, projectId: 7 }),
            },
            asset: {
              findUnique: async () => ({ id: 22, projectId: 7 }),
            },
            design: {
              create: async ({ data }) => {
                createCalls.push(data);
                return created;
              },
            },
          }),
      };
      const DesignsService = loadDesignsService();
      const service = new DesignsService(prisma, {
        ensureProject: async () => undefined,
      });

      assert.deepEqual(await service.create(input), created);
      assert.deepEqual(createCalls, [input]);
    });
  }
});

test("DesignsService.create는 누락되거나 양의 정수가 아닌 version을 거부한다", async (t) => {
  for (const invalidVersion of [undefined, 0, -1, 1.5]) {
    await t.test(`version ${String(invalidVersion)}`, async () => {
      let transactionCalled = false;
      const prisma = {
        $transaction: async () => {
          transactionCalled = true;
          throw new Error("transaction must not start");
        },
      };
      const DesignsService = loadDesignsService();
      const service = new DesignsService(prisma, {
        ensureProject: async () => undefined,
      });

      await assert.rejects(
        service.create({ ...baseInput, version: invalidVersion }),
        /positive integer/,
      );
      assert.equal(transactionCalled, false);
    });
  }
});

test("DesignsService.create는 version 충돌을 자동 재시도하지 않는다", async () => {
  let transactionAttempts = 0;
  const failure = new PrismaClientKnownRequestError("P2002");
  const prisma = {
    $transaction: async () => {
      transactionAttempts += 1;
      throw failure;
    },
  };
  const DesignsService = loadDesignsService();
  const service = new DesignsService(prisma, {
    ensureProject: async () => undefined,
  });

  await assert.rejects(service.create({ ...baseInput, version: 2 }), failure);
  assert.equal(transactionAttempts, 1);
});
