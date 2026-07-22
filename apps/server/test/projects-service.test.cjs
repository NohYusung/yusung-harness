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
  "projects",
  "projects.service.ts",
);

const loadProjectsService = () => {
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
    if (request === "../../generated/prisma/enums") {
      return { RepoType: { LOCAL: "LOCAL", REMOTE: "REMOTE" } };
    }
    if (request === "../../prisma/prisma.service") {
      return { PrismaService: class PrismaService {} };
    }

    return defaultRequire(request);
  };
  loadedModule._compile(output, servicePath);
  return loadedModule.exports.ProjectsService;
};

test("ProjectsService.create는 prisma.project.create({ data })만 호출한다", async () => {
  const calls = [];
  const input = {
    title: "Harness",
    repoPath: "/workspace/harness",
    repoType: "LOCAL",
    description: "Harness project",
  };
  const createdProject = { id: 1, ...input };
  const prisma = {
    project: {
      create: async (args) => {
        calls.push(["create", args]);
        return createdProject;
      },
      upsert: async (args) => {
        calls.push(["upsert", args]);
        throw new Error("upsert must not be called");
      },
      update: async (args) => {
        calls.push(["update", args]);
        throw new Error("update must not be called");
      },
    },
  };
  const ProjectsService = loadProjectsService();
  const service = new ProjectsService(prisma);

  const result = await service.create(input);

  assert.deepEqual(result, createdProject);
  assert.deepEqual(calls, [["create", { data: input }]]);
  assert.equal(calls.some(([method]) => method === "upsert"), false);
  assert.equal(calls.some(([method]) => method === "update"), false);
});
