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
  "files",
  "files.service.ts",
);

const loadFilesService = () => {
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
  return loadedModule.exports.FilesService;
};

const createInput = {
  projectId: 7,
  title: "한글 설계안.png",
  mimeType: "image/png",
  content: Buffer.from("binary file payload").toString("base64"),
};

test("FilesService.list는 프로젝트 파일을 최근 수정순으로 조회한다", async () => {
  const calls = [];
  const files = [{ id: 31, projectId: 7 }];
  const prisma = {
    file: {
      findMany: async (args) => {
        calls.push(["file.findMany", args]);
        return files;
      },
    },
  };
  const projectsService = {
    ensureProject: async (projectId) => {
      calls.push(["projects.ensureProject", projectId]);
    },
  };
  const FilesService = loadFilesService();
  const service = new FilesService(prisma, projectsService);

  assert.deepEqual(await service.list({ projectId: 7 }), files);
  assert.deepEqual(calls, [
    ["projects.ensureProject", 7],
    [
      "file.findMany",
      { where: { projectId: 7 }, orderBy: { updatedAt: "desc" } },
    ],
  ]);
});

test("FilesService.create는 Base64 파일을 Bytes로 변환하고 size를 계산해 저장한다", async () => {
  const calls = [];
  const expectedContent = Buffer.from(createInput.content, "base64");
  const createdFile = {
    id: 31,
    ...createInput,
    content: expectedContent,
    size: expectedContent.byteLength,
    isUploaded: false,
    uploadUrl: null,
  };
  const prisma = {
    file: {
      create: async (args) => {
        calls.push(["file.create", args]);
        return createdFile;
      },
    },
  };
  const projectsService = {
    ensureProject: async (projectId) => {
      calls.push(["projects.ensureProject", projectId]);
    },
  };
  const FilesService = loadFilesService();
  const service = new FilesService(prisma, projectsService);

  const result = await service.create(createInput);

  assert.deepEqual(result, createdFile);
  assert.deepEqual(calls, [
    ["projects.ensureProject", 7],
    [
      "file.create",
      {
        data: {
          projectId: 7,
          title: createInput.title,
          mimeType: createInput.mimeType,
          size: expectedContent.byteLength,
          content: expectedContent,
          isUploaded: false,
          uploadUrl: null,
        },
      },
    ],
  ]);
});

test("FilesService.create는 존재하지 않는 프로젝트에 파일을 만들지 않는다", async () => {
  let createCalled = false;
  const prisma = {
    file: {
      create: async () => {
        createCalled = true;
      },
    },
  };
  const projectsService = {
    ensureProject: async (projectId) => {
      throw new NotFoundException(`Project ${projectId} not found`);
    },
  };
  const FilesService = loadFilesService();
  const service = new FilesService(prisma, projectsService);

  await assert.rejects(
    service.create({ ...createInput, projectId: 404 }),
    (error) =>
      error instanceof NotFoundException &&
      error.message === "Project 404 not found",
  );
  assert.equal(createCalled, false);
});

test("FilesService.update는 같은 프로젝트 파일을 업로드 완료 상태로 전이한다", async () => {
  const calls = [];
  const existingFile = {
    id: 31,
    projectId: 7,
    content: Buffer.from("temporary"),
    isUploaded: false,
    uploadUrl: null,
  };
  const updatedFile = {
    ...existingFile,
    content: null,
    isUploaded: true,
    uploadUrl: "https://cdn.example.com/files/31.png",
  };
  const prisma = {
    file: {
      findUnique: async (args) => {
        calls.push(["file.findUnique", args]);
        return existingFile;
      },
      update: async (args) => {
        calls.push(["file.update", args]);
        return updatedFile;
      },
    },
  };
  const projectsService = {
    ensureProject: async (projectId) => {
      calls.push(["projects.ensureProject", projectId]);
    },
  };
  const FilesService = loadFilesService();
  const service = new FilesService(prisma, projectsService);
  const input = {
    projectId: 7,
    fileId: 31,
    uploadUrl: updatedFile.uploadUrl,
  };

  const result = await service.update(input);

  assert.deepEqual(result, updatedFile);
  assert.deepEqual(calls, [
    ["projects.ensureProject", 7],
    ["file.findUnique", { where: { id: 31 } }],
    [
      "file.update",
      {
        where: { id: 31 },
        data: {
          content: null,
          isUploaded: true,
          uploadUrl: input.uploadUrl,
        },
      },
    ],
  ]);
});

test("FilesService update와 delete는 미존재 파일을 NotFound로 거부한다", async (t) => {
  for (const method of ["update", "delete"]) {
    await t.test(method, async () => {
      let mutationCalled = false;
      const prisma = {
        file: {
          findUnique: async () => null,
          update: async () => {
            mutationCalled = true;
          },
          delete: async () => {
            mutationCalled = true;
          },
        },
      };
      const FilesService = loadFilesService();
      const service = new FilesService(prisma, {
        ensureProject: async () => {},
      });
      const input = {
        projectId: 7,
        fileId: 404,
        ...(method === "update"
          ? { uploadUrl: "https://cdn.example.com/files/404.png" }
          : {}),
      };

      await assert.rejects(
        service[method](input),
        (error) =>
          error instanceof NotFoundException &&
          error.message === "File 404 not found",
      );
      assert.equal(mutationCalled, false);
    });
  }
});

test("FilesService update와 delete는 다른 프로젝트 소유 파일을 거부한다", async (t) => {
  for (const method of ["update", "delete"]) {
    await t.test(method, async () => {
      let mutationCalled = false;
      const prisma = {
        file: {
          findUnique: async () => ({ id: 31, projectId: 8 }),
          update: async () => {
            mutationCalled = true;
          },
          delete: async () => {
            mutationCalled = true;
          },
        },
      };
      const FilesService = loadFilesService();
      const service = new FilesService(prisma, {
        ensureProject: async () => {},
      });
      const input = {
        projectId: 7,
        fileId: 31,
        ...(method === "update"
          ? { uploadUrl: "https://cdn.example.com/files/31.png" }
          : {}),
      };

      await assert.rejects(
        service[method](input),
        (error) =>
          error instanceof BadRequestException &&
          error.message === "File 31 does not belong to project 7",
      );
      assert.equal(mutationCalled, false);
    });
  }
});

test("FilesService.delete는 소유권 검증 후 파일을 삭제한다", async () => {
  const calls = [];
  const deletedFile = { id: 31, projectId: 7 };
  const prisma = {
    file: {
      findUnique: async (args) => {
        calls.push(["file.findUnique", args]);
        return deletedFile;
      },
      delete: async (args) => {
        calls.push(["file.delete", args]);
        return deletedFile;
      },
    },
  };
  const projectsService = {
    ensureProject: async (projectId) => {
      calls.push(["projects.ensureProject", projectId]);
    },
  };
  const FilesService = loadFilesService();
  const service = new FilesService(prisma, projectsService);

  const result = await service.delete({ projectId: 7, fileId: 31 });

  assert.deepEqual(result, deletedFile);
  assert.deepEqual(calls, [
    ["projects.ensureProject", 7],
    ["file.findUnique", { where: { id: 31 } }],
    ["file.delete", { where: { id: 31 } }],
  ]);
});
