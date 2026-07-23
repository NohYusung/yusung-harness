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

const input = {
  projectId: 7,
  wireframeId: 21,
  assetId: 22,
  title: "Design",
  html: "<!doctype html><html><body>Design</body></html>",
};

test("DesignsService.create는 P2002 뒤 최신 version을 다시 계산해 최대 3회 시도한다", async () => {
  let transactionAttempts = 0;
  const created = { id: 31, ...input, version: 3 };
  const prisma = {
    $transaction: async (operation) => {
      transactionAttempts += 1;
      const attempt = transactionAttempts;

      return operation({
        wireframe: {
          findUnique: async () => ({ id: 21, projectId: 7 }),
        },
        asset: {
          findUnique: async () => ({ id: 22, projectId: 7 }),
        },
        design: {
          findFirst: async () => ({ version: attempt - 1 }),
          create: async ({ data }) => {
            if (attempt < 3) {
              throw new PrismaClientKnownRequestError("P2002");
            }

            assert.equal(data.version, 3);
            return created;
          },
        },
      });
    },
  };
  const DesignsService = loadDesignsService();
  const service = new DesignsService(prisma, {
    ensureProject: async () => undefined,
  });

  await assert.doesNotReject(service.create(input));
  assert.equal(transactionAttempts, 3);
});

test("DesignsService.create는 P2002가 아닌 오류를 재시도하지 않는다", async () => {
  let transactionAttempts = 0;
  const failure = new Error("database unavailable");
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

  await assert.rejects(service.create(input), failure);
  assert.equal(transactionAttempts, 1);
});

test("DesignsService.create는 세 번째 P2002를 그대로 전달한다", async () => {
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

  await assert.rejects(service.create(input), failure);
  assert.equal(transactionAttempts, 3);
});
