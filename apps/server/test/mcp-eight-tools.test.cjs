const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { dirname, join } = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { InMemoryTransport } = require("@modelcontextprotocol/sdk/inMemory.js");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { NotFoundException } = require("@nestjs/common");
const ts = require("typescript");
const { z } = require("zod/v4");
const {
  cloneDocument,
  createDineugDocument,
} = require("./helpers/dineug-document.cjs");

const serverRoot = join(__dirname, "..");
const servicePath = join(serverRoot, "src", "mcp", "mcp.service.ts");
const dineugDocumentPath = join(
  serverRoot,
  "src",
  "services",
  "erd",
  "dineug-document.ts",
);
const dineugRuntimeStub = {
  DINEUG_SCHEMA_URL:
    "https://raw.githubusercontent.com/dineug/erd-editor/main/json-schema/schema.json",
  canonicalizeDineugErdDocument: (document) => JSON.stringify(document),
  validateDineugErdDocument: () => undefined,
};

const loadTypeScriptExport = (filename, exportName, moduleStubs = {}) => {
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
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
const dineugErdDocumentSchema = loadTypeScriptExport(
  dineugDocumentPath,
  "dineugErdDocumentSchema",
  { "../../../scripts/lib/dineug-erd-document.mjs": dineugRuntimeStub },
);
const architecturePlanContent = [
  "# 기술 스택",
  "",
  "| 영역 | 선택 |",
  "| --- | --- |",
  "| 배포 | GitHub Pages |",
  "",
  "# 네트워크",
  "",
  "```text",
  "GitHub Actions -> GitHub Pages -> Browser",
  "```",
  "",
  "# 배포 전략",
  "",
  "검증된 정적 산출물만 배포한다.",
].join("\n");
const architecturePlanHtml = [
  "<!doctype html>",
  '<html lang="ko"><head><meta charset="utf-8"><title>배포 인프라 구조도</title></head>',
  '<body><main><h1>배포 인프라 구조도</h1><svg role="img" aria-label="GitHub Pages 리소스 아이콘" viewBox="0 0 24 24"><title>GitHub Pages</title><path d="M4 4h16v16H4z"></path></svg><p>Repository → Actions → Pages</p></main></body></html>',
].join("");
const erdDocument = createDineugDocument();

const expectedToolNames = [
  "get_context",
  "get_project",
  "get_plan",
  "get_asset",
  "get_design",
  "get_architecture",
  "get_architecturePlan",
  "get_request",
  "get_workLog",
  "get_domain",
  "get_task",
  "get_draft",
  "get_wireframe",
  "get_review",
  "get_db",
  "get_erd",
  "get_file",
  "create_project",
  "create_plan",
  "update_plan",
  "create_draft",
  "create_domain",
  "update_domain",
  "create_db",
  "update_db",
  "create_erd",
  "update_erd",
  "create_task",
  "update_task",
  "create_design",
  "update_design",
  "create_wireframe",
  "update_wireframe",
  "create_asset",
  "update_asset",
  "create_file",
  "update_file",
  "delete_file",
  "create_workLog",
  "create_request",
  "create_architecturePlan",
  "update_architecturePlan",
  "update_request",
];

const removedToolNames = [
  "upsert_project",
  "list_projects",
  "get_project_context",
  "wait_for_project_changes",
  "create_plan_version",
  "save_document",
  "save_design",
  "update_task_status",
];

const loadMcpService = () => {
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
    if (request === "@nestjs/common") {
      return {
        ...defaultRequire(request),
        Logger: class Logger {
          error() {}
        },
      };
    }

    if (request === "../services/architectures/deployment-architecture") {
      return {
        deploymentArchitectureSchema: z
          .object({ kind: z.literal("deployment-architecture") })
          .passthrough(),
      };
    }

    if (request === "../services/erd/dineug-document") {
      return { dineugErdDocumentSchema };
    }

    return defaultRequire(request);
  };
  loadedModule._compile(output, servicePath);
  return loadedModule.exports.McpService;
};

const createHarness = () => {
  const calls = [];
  const result = (service, method, input) => ({ service, method, input });
  const project = {
    id: 17,
    title: "Harness",
    repoPaths: [
      { path: "/workspace/harness-backend", repoType: "LOCAL" },
      { path: "https://github.com/yusung/harness-web", repoType: "REMOTE" },
    ],
    description: "Harness project",
    _count: {},
  };
  const domainResults = Object.fromEntries(
    [
      "plans",
      "tasks",
      "drafts",
      "domains",
      "architectures",
      "wireframes",
      "assets",
      "designs",
      "databases",
      "erds",
      "reviews",
      "architecturePlans",
      "requests",
      "worklogs",
      "files",
    ].map((domain) => [domain, [{ domain, projectId: 17 }]]),
  );
  const listService = (service, domain) => async (...args) => {
    calls.push([service, "list", ...args]);
    return domainResults[domain];
  };
  const services = {
    prismaService: {
      $queryRaw: async () => [],
    },
    projectsService: {
      list: async () => {
        calls.push(["projectsService", "list"]);
        return [project];
      },
      create: async (input) => {
        calls.push(["projectsService", "create", input]);
        return result("projectsService", "create", input);
      },
      upsert: async (input) => {
        calls.push(["projectsService", "upsert", input]);
        return result("projectsService", "upsert", input);
      },
    },
    plansService: {
      list: listService("plansService", "plans"),
      create: async (input) => {
        calls.push(["plansService", "create", input]);
        return result("plansService", "create", input);
      },
      update: async (input) => {
        calls.push(["plansService", "update", input]);
        return result("plansService", "update", input);
      },
    },
    draftsService: {
      list: listService("draftsService", "drafts"),
      create: async (input) => {
        calls.push(["draftsService", "create", input]);
        return result("draftsService", "create", input);
      },
    },
    tasksService: {
      list: listService("tasksService", "tasks"),
      create: async (input) => {
        calls.push(["tasksService", "create", input]);
        return result("tasksService", "create", input);
      },
      updateStatus: async (projectId, taskId, status) => {
        calls.push([
          "tasksService",
          "updateStatus",
          projectId,
          taskId,
          status,
        ]);
        return result("tasksService", "updateStatus", {
          projectId,
          taskId,
          status,
        });
      },
    },
    designsService: {
      list: listService("designsService", "designs"),
      create: async (input) => {
        calls.push(["designsService", "create", input]);
        return result("designsService", "create", input);
      },
      update: async (input) => {
        calls.push(["designsService", "update", input]);
        return result("designsService", "update", input);
      },
    },
    dbService: {
      list: listService("dbService", "databases"),
      create: async (input) => {
        calls.push(["dbService", "create", input]);
        return result("dbService", "create", input);
      },
      update: async (input) => {
        calls.push(["dbService", "update", input]);
        return result("dbService", "update", input);
      },
    },
    erdService: {
      list: listService("erdService", "erds"),
      create: async (input) => {
        calls.push(["erdService", "create", input]);
        return result("erdService", "create", input);
      },
      update: async (input) => {
        calls.push(["erdService", "update", input]);
        return result("erdService", "update", input);
      },
    },
    wireframesService: {
      list: listService("wireframesService", "wireframes"),
      create: async (input) => {
        calls.push(["wireframesService", "create", input]);
        return result("wireframesService", "create", input);
      },
      update: async (input) => {
        calls.push(["wireframesService", "update", input]);
        return result("wireframesService", "update", input);
      },
    },
    assetsService: {
      list: listService("assetsService", "assets"),
      create: async (input) => {
        calls.push(["assetsService", "create", input]);
        return result("assetsService", "create", input);
      },
      update: async (input) => {
        calls.push(["assetsService", "update", input]);
        return result("assetsService", "update", input);
      },
    },
    filesService: {
      list: listService("filesService", "files"),
      create: async (input) => {
        calls.push(["filesService", "create", input]);
        return result("filesService", "create", input);
      },
      update: async (input) => {
        calls.push(["filesService", "update", input]);
        return result("filesService", "update", input);
      },
      delete: async (input) => {
        calls.push(["filesService", "delete", input]);
        return result("filesService", "delete", input);
      },
    },
    domainsService: {
      list: listService("domainsService", "domains"),
      create: async (input) => {
        calls.push(["domainsService", "create", input]);
        return result("domainsService", "create", input);
      },
      update: async (input) => {
        calls.push(["domainsService", "update", input]);
        return result("domainsService", "update", input);
      },
    },
    architecturesService: {
      list: listService("architecturesService", "architectures"),
    },
    reviewsService: {
      list: listService("reviewsService", "reviews"),
    },
    worklogsService: {
      list: listService("worklogsService", "worklogs"),
      create: async (input) => {
        calls.push(["worklogsService", "create", input]);
        return result("worklogsService", "create", input);
      },
    },
    requestsService: {
      list: listService("requestsService", "requests"),
      create: async (input) => {
        calls.push(["requestsService", "create", input]);
        return result("requestsService", "create", input);
      },
      update: async (input) => {
        calls.push(["requestsService", "update", input]);
        return result("requestsService", "update", input);
      },
    },
    architecturePlansService: {
      list: listService("architecturePlansService", "architecturePlans"),
      create: async (input) => {
        calls.push(["architecturePlansService", "create", input]);
        return result("architecturePlansService", "create", input);
      },
      update: async (input) => {
        calls.push(["architecturePlansService", "update", input]);
        return result("architecturePlansService", "update", input);
      },
    },
  };
  const McpService = loadMcpService();
  const service = Object.assign(new McpService(), services);
  service.getSchemaContext = async () => {
    calls.push(["mcpService", "getSchemaContext"]);
    return {
      dialect: "sqlite",
      schemaObjects: [
        { type: "table", name: "Project", tableName: "Project", sql: null },
      ],
      tables: [
        { name: "Project", sql: null, columns: [], indexes: [], foreignKeys: [] },
      ],
    };
  };
  const tools = new Map();

  service.registerTools({
    registerTool(name, definition, handler) {
      tools.set(name, { definition, handler });
    },
  });

  const invoke = async (name, input) => {
    const tool = tools.get(name);

    assert.ok(tool, `${name} 도구가 등록되어야 한다`);
    const response = await tool.handler(input, {
      signal: new AbortController().signal,
    });

    assert.equal(response.isError, undefined, response.content?.[0]?.text);
    assert.equal(response.content?.[0]?.type, "text");
    return JSON.parse(response.content[0].text);
  };

  return { calls, domainResults, invoke, project, service, services, tools };
};

const createSdkHarness = async () => {
  const harness = createHarness();
  const server = new McpServer({ name: "mcp-eight-tools-test", version: "1.0.0" });
  const client = new Client({ name: "mcp-eight-tools-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  harness.service.registerTools(server);
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  return {
    ...harness,
    client,
    async close() {
      await Promise.allSettled([client.close(), server.close()]);
    },
  };
};

const parseSdkToolResult = (result) => {
  assert.equal(result.isError, undefined, result.content?.[0]?.text);
  assert.equal(result.content?.[0]?.type, "text");
  return JSON.parse(result.content[0].text);
};

test("MCP source와 runtime 등록 목록은 공개 계약의 43개 도구와 정확히 일치한다", () => {
  const source = readFileSync(servicePath, "utf8");
  const { tools } = createHarness();
  const registeredNames = [...source.matchAll(/server\.registerTool\(\s*["']([^"']+)["']/g)]
    .map((match) => match[1]);

  assert.deepEqual(registeredNames, expectedToolNames);
  assert.deepEqual([...tools.keys()], expectedToolNames);
  assert.equal(tools.size, 43);

  for (const name of removedToolNames) {
    assert.equal(tools.has(name), false, `${name} 도구는 제거해야 한다`);
  }
});

test("산출물 조회 도구는 읽기 전용 schema를 지키고 domain service list에 위임한다", async (t) => {
  const harness = createHarness();
  const contracts = [
    ["get_plan", "plansService", "plans"],
    ["get_asset", "assetsService", "assets"],
    ["get_design", "designsService", "designs"],
    ["get_architecture", "architecturesService", "architectures"],
    ["get_architecturePlan", "architecturePlansService", "architecturePlans"],
    ["get_request", "requestsService", "requests"],
    ["get_workLog", "worklogsService", "worklogs"],
    ["get_domain", "domainsService", "domains"],
    ["get_draft", "draftsService", "drafts"],
    ["get_wireframe", "wireframesService", "wireframes"],
    ["get_review", "reviewsService", "reviews"],
    ["get_db", "dbService", "databases"],
    ["get_erd", "erdService", "erds"],
    ["get_file", "filesService", "files"],
  ];

  for (const [toolName, serviceName, domain] of contracts) {
    await t.test(toolName, async () => {
      const tool = harness.tools.get(toolName);

      assert.deepEqual(Object.keys(tool.definition.inputSchema.shape), [
        "projectId",
      ]);
      assert.deepEqual(tool.definition.annotations, {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
      assert.deepEqual(await harness.invoke(toolName, { projectId: 17 }), [
        { domain, projectId: 17 },
      ]);
      assert.deepEqual(harness.calls.at(-1), [
        serviceName,
        "list",
        { projectId: 17 },
      ]);
    });
  }
});

test("get_task는 선택한 plan으로 작업 목록을 필터링해 TasksService.list에 위임한다", async () => {
  const harness = createHarness();
  const tool = harness.tools.get("get_task");

  assert.deepEqual(Object.keys(tool.definition.inputSchema.shape), [
    "projectId",
    "planId",
  ]);
  assert.equal(tool.definition.inputSchema.shape.planId.isOptional(), true);
  assert.deepEqual(tool.definition.annotations, {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  });
  assert.deepEqual(await harness.invoke("get_task", {
    projectId: 17,
    planId: 3,
  }), harness.domainResults.tasks);
  assert.deepEqual(harness.calls.at(-1), [
    "tasksService",
    "list",
    { projectId: 17, planId: 3 },
  ]);
});

const createFileInput = {
  projectId: 17,
  title: "architecture.png",
  mimeType: "image/png",
  content: Buffer.from("file payload").toString("base64"),
};
const updateFileInput = {
  projectId: 17,
  fileId: 31,
  uploadUrl: "https://cdn.example.com/files/architecture.png",
};
const deleteFileInput = { projectId: 17, fileId: 31 };

test("파일 도구는 schema와 annotations를 지키고 FilesService에 위임한다", async () => {
  const harness = createHarness();
  const createTool = harness.tools.get("create_file");
  const updateTool = harness.tools.get("update_file");
  const deleteTool = harness.tools.get("delete_file");

  assert.deepEqual(Object.keys(createTool.definition.inputSchema.shape), [
    "projectId",
    "title",
    "mimeType",
    "content",
  ]);
  assert.deepEqual(Object.keys(updateTool.definition.inputSchema.shape), [
    "projectId",
    "fileId",
    "uploadUrl",
  ]);
  assert.deepEqual(Object.keys(deleteTool.definition.inputSchema.shape), [
    "projectId",
    "fileId",
  ]);
  assert.deepEqual(createTool.definition.annotations, {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  });
  assert.deepEqual(updateTool.definition.annotations, {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  });
  assert.deepEqual(deleteTool.definition.annotations, {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  });

  const created = await harness.invoke("create_file", createFileInput);
  const updated = await harness.invoke("update_file", updateFileInput);
  const deleted = await harness.invoke("delete_file", deleteFileInput);

  assert.deepEqual(harness.calls, [
    ["filesService", "create", createFileInput],
    ["filesService", "update", updateFileInput],
    ["filesService", "delete", deleteFileInput],
  ]);
  assert.deepEqual(created, {
    service: "filesService",
    method: "create",
    input: createFileInput,
  });
  assert.deepEqual(updated, {
    service: "filesService",
    method: "update",
    input: updateFileInput,
  });
  assert.deepEqual(deleted, {
    service: "filesService",
    method: "delete",
    input: deleteFileInput,
  });
});

test("파일 도구 schema는 ID, Base64, URL과 비어 있지 않은 metadata를 검증한다", () => {
  const { tools } = createHarness();
  const createSchema = tools.get("create_file").definition.inputSchema;
  const updateSchema = tools.get("update_file").definition.inputSchema;
  const deleteSchema = tools.get("delete_file").definition.inputSchema;

  assert.equal(createSchema.safeParse(createFileInput).success, true);
  assert.equal(updateSchema.safeParse(updateFileInput).success, true);
  assert.equal(deleteSchema.safeParse(deleteFileInput).success, true);

  for (const invalidId of [0, -1, 1.5, "17"]) {
    assert.equal(
      createSchema.safeParse({ ...createFileInput, projectId: invalidId })
        .success,
      false,
    );
    assert.equal(
      updateSchema.safeParse({ ...updateFileInput, fileId: invalidId }).success,
      false,
    );
    assert.equal(
      deleteSchema.safeParse({ ...deleteFileInput, fileId: invalidId }).success,
      false,
    );
  }

  assert.equal(
    createSchema.safeParse({ ...createFileInput, title: "   " }).success,
    false,
  );
  assert.equal(
    createSchema.safeParse({ ...createFileInput, mimeType: "   " }).success,
    false,
  );
  assert.equal(
    createSchema.safeParse({ ...createFileInput, content: "not/base64***" })
      .success,
    false,
  );
  assert.equal(
    updateSchema.safeParse({ ...updateFileInput, uploadUrl: "not-a-url" })
      .success,
    false,
  );
});

test("실제 MCP 파일 도구는 service에 위임하고 잘못된 입력을 차단한다", async (t) => {
  const harness = await createSdkHarness();
  t.after(() => harness.close());

  parseSdkToolResult(
    await harness.client.callTool({
      name: "create_file",
      arguments: createFileInput,
    }),
  );
  parseSdkToolResult(
    await harness.client.callTool({
      name: "update_file",
      arguments: updateFileInput,
    }),
  );
  parseSdkToolResult(
    await harness.client.callTool({
      name: "delete_file",
      arguments: deleteFileInput,
    }),
  );
  const invalidBase64 = await harness.client.callTool({
    name: "create_file",
    arguments: { ...createFileInput, content: "not/base64***" },
  });
  const invalidUrl = await harness.client.callTool({
    name: "update_file",
    arguments: { ...updateFileInput, uploadUrl: "not-a-url" },
  });

  assert.deepEqual(harness.calls, [
    ["filesService", "create", createFileInput],
    ["filesService", "update", updateFileInput],
    ["filesService", "delete", deleteFileInput],
  ]);
  assert.equal(invalidBase64.isError, true);
  assert.match(invalidBase64.content[0].text, /invalid/i);
  assert.equal(invalidUrl.isError, true);
  assert.match(invalidUrl.content[0].text, /invalid/i);
});

const planUpdateInput = {
  projectId: 17,
  planId: 23,
  title: "Updated delivery plan",
  content: "Implement and verify the requested MCP tools.",
};

const taskUpdateInput = {
  projectId: 17,
  taskId: 29,
  status: "COMPLETED",
};

test("update_plan은 schema와 annotations를 지키고 PlansService.update에 위임한다", async () => {
  const harness = createHarness();
  const response = await harness.invoke("update_plan", planUpdateInput);
  const tool = harness.tools.get("update_plan");

  assert.deepEqual(harness.calls, [
    ["plansService", "update", planUpdateInput],
  ]);
  assert.deepEqual(response, {
    service: "plansService",
    method: "update",
    input: planUpdateInput,
  });
  assert.deepEqual(Object.keys(tool.definition.inputSchema.shape), [
    "projectId",
    "planId",
    "title",
    "content",
  ]);
  assert.deepEqual(tool.definition.annotations, {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  });

  for (const idField of ["projectId", "planId"]) {
    for (const invalidId of [0, -1, 1.5, "17"]) {
      assert.equal(
        tool.definition.inputSchema.safeParse({
          ...planUpdateInput,
          [idField]: invalidId,
        }).success,
        false,
      );
    }
  }
  assert.equal(
    tool.definition.inputSchema.safeParse({
      ...planUpdateInput,
      title: "   ",
    }).success,
    false,
  );
  assert.equal(
    tool.definition.inputSchema.safeParse({
      ...planUpdateInput,
      content: "",
    }).success,
    false,
  );
  assert.equal(
    tool.definition.inputSchema.parse({
      ...planUpdateInput,
      title: "  Updated delivery plan  ",
    }).title,
    "Updated delivery plan",
  );
});

test("update_task는 상태 schema와 멱등 annotations를 지키고 TasksService.updateStatus에 위임한다", async () => {
  const harness = createHarness();
  const response = await harness.invoke("update_task", taskUpdateInput);
  const tool = harness.tools.get("update_task");

  assert.deepEqual(harness.calls, [
    ["tasksService", "updateStatus", 17, 29, "COMPLETED"],
  ]);
  assert.deepEqual(response, {
    service: "tasksService",
    method: "updateStatus",
    input: taskUpdateInput,
  });
  assert.deepEqual(Object.keys(tool.definition.inputSchema.shape), [
    "projectId",
    "taskId",
    "status",
  ]);
  assert.deepEqual(tool.definition.annotations, {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  });

  for (const idField of ["projectId", "taskId"]) {
    for (const invalidId of [0, -1, 1.5, "17"]) {
      assert.equal(
        tool.definition.inputSchema.safeParse({
          ...taskUpdateInput,
          [idField]: invalidId,
        }).success,
        false,
      );
    }
  }
  for (const status of ["PENDING", "COMPLETED"]) {
    assert.equal(
      tool.definition.inputSchema.safeParse({
        ...taskUpdateInput,
        status,
      }).success,
      true,
    );
  }
  for (const status of ["IN_PROGRESS", "CANCELLED", 1]) {
    assert.equal(
      tool.definition.inputSchema.safeParse({
        ...taskUpdateInput,
        status,
      }).success,
      false,
    );
  }
});

const workflowUpdateToolCases = [
  {
    name: "update_architecturePlan",
    service: "architecturePlansService",
    idField: "architecturePlanId",
    input: {
      projectId: 17,
      architecturePlanId: 31,
      title: "Updated MCP architecture plan",
      content: architecturePlanContent,
      html: architecturePlanHtml,
    },
  },
  {
    name: "update_request",
    service: "requestsService",
    idField: "requestId",
    input: {
      projectId: 17,
      requestId: 41,
      title: "Updated dashboard request",
      content: "Filter project artifacts by type and status.",
      status: "IN_PROGRESS",
    },
  },
];

test("workflow 수정 도구는 schema와 annotations를 지키고 domain service 결과를 직렬화한다", async (t) => {
  for (const toolCase of workflowUpdateToolCases) {
    await t.test(toolCase.name, async () => {
      const harness = createHarness();
      const response = await harness.invoke(toolCase.name, toolCase.input);
      const tool = harness.tools.get(toolCase.name);
      const expectedFields =
        toolCase.name === "update_request"
          ? ["projectId", "requestId", "title", "content", "status"]
          : ["projectId", "architecturePlanId", "title", "content", "html"];

      assert.deepEqual(harness.calls, [
        [toolCase.service, "update", toolCase.input],
      ]);
      assert.deepEqual(response, {
        service: toolCase.service,
        method: "update",
        input: toolCase.input,
      });
      assert.deepEqual(Object.keys(tool.definition.inputSchema.shape), expectedFields);
      assert.deepEqual(tool.definition.annotations, {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      });

      for (const invalidId of [0, -1, 1.5, "17"]) {
        assert.equal(
          tool.definition.inputSchema.safeParse({
            ...toolCase.input,
            projectId: invalidId,
          }).success,
          false,
        );
        assert.equal(
          tool.definition.inputSchema.safeParse({
            ...toolCase.input,
            [toolCase.idField]: invalidId,
          }).success,
          false,
        );
      }
      const { [toolCase.idField]: _id, ...missingIdInput } = toolCase.input;
      assert.equal(tool.definition.inputSchema.safeParse(missingIdInput).success, false);
      assert.equal(
        tool.definition.inputSchema.safeParse({
          ...toolCase.input,
          title: "   ",
        }).success,
        false,
      );
      assert.equal(
        tool.definition.inputSchema.safeParse({
          ...toolCase.input,
          content: "",
        }).success,
        false,
      );
      assert.equal(
        tool.definition.inputSchema.parse({
          ...toolCase.input,
          title: "  Updated workflow artifact  ",
        }).title,
        "Updated workflow artifact",
      );

      if (toolCase.name === "update_request") {
        for (const status of ["PENDING", "IN_PROGRESS", "COMPLETED"]) {
          assert.equal(
            tool.definition.inputSchema.safeParse({
              ...toolCase.input,
              status,
            }).success,
            true,
          );
        }
        assert.equal(
          tool.definition.inputSchema.safeParse({
            ...toolCase.input,
            status: "CANCELLED",
          }).success,
          false,
        );
      } else {
        const { content: _content, ...missingContentInput } = toolCase.input;
        const { html: _html, ...missingHtmlInput } = toolCase.input;

        assert.equal(
          tool.definition.inputSchema.safeParse(missingContentInput).success,
          false,
        );
        assert.equal(
          tool.definition.inputSchema.safeParse(missingHtmlInput).success,
          false,
        );
        assert.equal(
          tool.definition.inputSchema.safeParse({
            ...toolCase.input,
            html: "",
          }).success,
          false,
        );
        assert.doesNotMatch(
          tool.definition.inputSchema.shape.content.description ?? "",
          /Complete HTML document/,
        );
        assert.match(
          tool.definition.inputSchema.shape.html.description,
          /Complete HTML document/,
        );
      }
    });
  }
});

const workflowCreateToolCases = [
  {
    name: "create_workLog",
    service: "worklogsService",
    input: {
      projectId: 17,
      title: "Implementation completed",
      content: "Added the requested MCP tools.",
    },
  },
  {
    name: "create_request",
    service: "requestsService",
    input: {
      projectId: 17,
      title: "Add dashboard filter",
      content: "Filter project artifacts by type.",
    },
  },
  {
    name: "create_architecturePlan",
    service: "architecturePlansService",
    input: {
      projectId: 17,
      title: "MCP architecture plan",
      content: architecturePlanContent,
      html: architecturePlanHtml,
    },
  },
];

test("workflow 생성 도구는 domain service create 결과를 직렬화한다", async (t) => {
  for (const toolCase of workflowCreateToolCases) {
    await t.test(toolCase.name, async () => {
      const harness = createHarness();
      const response = await harness.invoke(toolCase.name, toolCase.input);
      const tool = harness.tools.get(toolCase.name);
      assert.deepEqual(harness.calls, [
        [toolCase.service, "create", toolCase.input],
      ]);
      assert.deepEqual(response, {
        service: toolCase.service,
        method: "create",
        input: toolCase.input,
      });
      assert.deepEqual(
        Object.keys(tool.definition.inputSchema.shape),
        toolCase.name === "create_architecturePlan"
          ? ["projectId", "title", "content", "html"]
          : ["projectId", "title", "content"],
      );
      assert.deepEqual(tool.definition.annotations, {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      });
      assert.equal(
        Object.hasOwn(tool.definition.inputSchema.shape, "status"),
        false,
        "Request status는 DB의 PENDING 기본값을 사용해야 한다",
      );
    });
  }
});

test("workflow 생성 도구의 입력 schema는 ID와 비어 있지 않은 문자열을 검증한다", () => {
  const { tools } = createHarness();

  for (const toolCase of workflowCreateToolCases) {
    const schema = tools.get(toolCase.name).definition.inputSchema;

    for (const invalidProjectId of [0, -1, 1.5, "17"]) {
      assert.equal(
        schema.safeParse({
          ...toolCase.input,
          projectId: invalidProjectId,
        }).success,
        false,
      );
    }
    assert.equal(
      schema.safeParse({ ...toolCase.input, title: "   " }).success,
      false,
    );
    assert.equal(
      schema.safeParse({ ...toolCase.input, content: "" }).success,
      false,
    );
    assert.equal(
      schema.parse({ ...toolCase.input, title: "  Trimmed title  " }).title,
      "Trimmed title",
    );

    if (toolCase.name === "create_architecturePlan") {
      const { content: _content, ...missingContentInput } = toolCase.input;
      const { html: _html, ...missingHtmlInput } = toolCase.input;

      assert.equal(schema.safeParse(missingContentInput).success, false);
      assert.equal(schema.safeParse(missingHtmlInput).success, false);
      assert.equal(
        schema.safeParse({ ...toolCase.input, html: "" }).success,
        false,
      );
      assert.equal(
        schema.safeParse({
          ...toolCase.input,
          content: architecturePlanContent,
          html: architecturePlanHtml,
        }).success,
        true,
      );
      assert.doesNotMatch(
        schema.shape.content.description ?? "",
        /Complete HTML document/,
      );
      assert.match(schema.shape.html.description, /Complete HTML document/);
    }
  }
});

test("get_context는 전체 SQLite schema context를 읽기 전용으로 반환한다", async () => {
  const harness = createHarness();
  const response = await harness.invoke("get_context", {});
  const tool = harness.tools.get("get_context");

  assert.deepEqual(harness.calls, [["mcpService", "getSchemaContext"]]);
  assert.deepEqual(response, {
    dialect: "sqlite",
    schemaObjects: [
      { type: "table", name: "Project", tableName: "Project", sql: null },
    ],
    tables: [
      { name: "Project", sql: null, columns: [], indexes: [], foreignKeys: [] },
    ],
  });
  assert.equal(tool.definition.annotations.readOnlyHint, true);
  assert.equal(tool.definition.annotations.destructiveHint, false);
  assert.equal(tool.definition.annotations.idempotentHint, true);
  assert.equal(tool.definition.annotations.openWorldHint, false);
  assert.deepEqual(Object.keys(tool.definition.inputSchema.shape), []);
  assert.equal(
    tool.definition.inputSchema.safeParse({ tableName: "Project" }).success,
    false,
  );
});

test("get_project는 projectId가 있으면 11종 domain list를 병렬 조립한다", async () => {
  const harness = createHarness();
  const listResponse = await harness.invoke("get_project", {});
  const contextResponse = await harness.invoke("get_project", {
    projectId: 17,
  });

  assert.deepEqual(harness.calls, [
    ["projectsService", "list"],
    ["projectsService", "list"],
    ["plansService", "list", { projectId: 17 }],
    ["tasksService", "list", { projectId: 17 }],
    ["draftsService", "list", { projectId: 17 }],
    ["domainsService", "list", { projectId: 17 }],
    ["architecturesService", "list", { projectId: 17 }],
    ["wireframesService", "list", { projectId: 17 }],
    ["assetsService", "list", { projectId: 17 }],
    ["designsService", "list", { projectId: 17 }],
    ["dbService", "list", { projectId: 17 }],
    ["erdService", "list", { projectId: 17 }],
    ["reviewsService", "list", { projectId: 17 }],
  ]);
  assert.deepEqual(listResponse, [harness.project]);
  assert.deepEqual(contextResponse, {
    id: harness.project.id,
    title: harness.project.title,
    repoPaths: harness.project.repoPaths,
    description: harness.project.description,
    plans: harness.domainResults.plans,
    tasks: harness.domainResults.tasks,
    drafts: harness.domainResults.drafts,
    domains: harness.domainResults.domains,
    architectures: harness.domainResults.architectures,
    wireframes: harness.domainResults.wireframes,
    assets: harness.domainResults.assets,
    designs: harness.domainResults.designs,
    databases: harness.domainResults.databases,
    erds: harness.domainResults.erds,
    reviews: harness.domainResults.reviews,
  });
  assert.equal("_count" in contextResponse, false);
  const tool = harness.tools.get("get_project");

  assert.equal(tool.definition.annotations.readOnlyHint, true);
  assert.equal(tool.definition.inputSchema.shape.projectId.isOptional(), true);
});

const createProjectInput = {
  title: "Harness",
  repoPaths: [
    { path: "/workspace/harness-backend", repoType: "LOCAL" },
    { path: "https://github.com/yusung/harness-web", repoType: "REMOTE" },
  ],
  description: "Harness project",
};

test("create_project는 projectsService.create에만 위임한다", async () => {
  const harness = createHarness();
  const response = await harness.invoke("create_project", createProjectInput);

  assert.deepEqual(harness.calls, [
    ["projectsService", "create", createProjectInput],
  ]);
  assert.deepEqual(response, {
    service: "projectsService",
    method: "create",
    input: createProjectInput,
  });
});

test("create_project 공개 계약에는 upsert와 update 의미가 없다", () => {
  const tool = createHarness().tools.get("create_project");

  assert.doesNotMatch(tool.definition.description, /\b(?:upsert|updates?)\b/i);
  assert.equal(tool.definition.annotations.idempotentHint, false);
  assert.equal(Object.hasOwn(tool.definition.inputSchema.shape, "id"), false);
  assert.equal(
    Object.hasOwn(tool.definition.inputSchema.shape, "repoPath"),
    false,
  );
  assert.equal(
    Object.hasOwn(tool.definition.inputSchema.shape, "repoPaths"),
    true,
  );
  assert.equal(
    tool.definition.inputSchema.shape.repoPaths.safeParse([]).success,
    false,
  );
});

const createToolCases = [
  {
    name: "create_project",
    service: "projectsService",
    method: "create",
    input: createProjectInput,
  },
  {
    name: "create_plan",
    service: "plansService",
    method: "create",
    input: {
      projectId: 1,
      title: "Plan",
      content: "Plan content",
    },
  },
  {
    name: "create_draft",
    service: "draftsService",
    method: "create",
    input: {
      projectId: 1,
      title: "Draft",
      content: "Draft content",
    },
  },
  {
    name: "create_domain",
    service: "domainsService",
    method: "create",
    input: {
      projectId: 1,
      title: "Domain analysis",
      content: "Domain analysis content",
    },
  },
  {
    name: "create_task",
    service: "tasksService",
    method: "create",
    input: {
      projectId: 1,
      planId: 2,
      title: "Task",
      content: "Task content",
    },
  },
  {
    name: "create_db",
    service: "dbService",
    method: "create",
    input: {
      projectId: 1,
      title: "DB schema",
      content: "# users\n\n| column | type |",
    },
  },
  {
    name: "create_erd",
    service: "erdService",
    method: "create",
    input: {
      projectId: 1,
      title: "ERD",
      document: erdDocument,
    },
  },
  {
    name: "create_design",
    service: "designsService",
    method: "create",
    input: {
      projectId: 1,
      wireframeId: 4,
      assetId: 5,
      title: "Design",
      html: "<!doctype html><html><head></head><body>Design</body></html>",
      version: 1,
    },
  },
  {
    name: "create_wireframe",
    service: "wireframesService",
    method: "create",
    input: {
      projectId: 1,
      parentId: null,
      index: "2",
      title: "Wireframe",
      html: "<!doctype html><html><head></head><body>Wireframe</body></html>",
      version: 1,
    },
  },
  {
    name: "create_asset",
    service: "assetsService",
    method: "create",
    input: {
      projectId: 1,
      title: "Asset",
      html: "<!doctype html><html><head></head><body>Asset</body></html>",
    },
  },
];

test("create_* 도구는 입력을 해당 도메인 service에 그대로 위임한다", async (t) => {
  for (const toolCase of createToolCases) {
    await t.test(toolCase.name, async () => {
      const harness = createHarness();
      const response = await harness.invoke(toolCase.name, toolCase.input);

      assert.deepEqual(harness.calls, [
        [toolCase.service, toolCase.method, toolCase.input],
      ]);
      assert.deepEqual(response, {
        service: toolCase.service,
        method: toolCase.method,
        input: toolCase.input,
      });
      assert.equal(
        harness.tools.get(toolCase.name).definition.annotations.readOnlyHint,
        false,
      );
      assert.equal(
        Object.hasOwn(harness.tools.get(toolCase.name).definition.inputSchema.shape, "id"),
        false,
        `${toolCase.name}은 update용 id를 받으면 안 된다`,
      );
    });
  }
});

test("project 산출물 MCP 입력 schema는 제거된 taskId와 planId를 노출하지 않는다", () => {
  const { tools } = createHarness();
  const expectedFields = {
    create_asset: ["projectId", "title", "html"],
    create_wireframe: [
      "projectId",
      "parentId",
      "index",
      "title",
      "html",
      "version",
    ],
    create_design: [
      "projectId",
      "wireframeId",
      "assetId",
      "title",
      "html",
      "version",
    ],
  };

  for (const [toolName, fields] of Object.entries(expectedFields)) {
    const shape = tools.get(toolName).definition.inputSchema.shape;

    assert.deepEqual(Object.keys(shape), fields);
    assert.equal(Object.hasOwn(shape, "taskId"), false);
    assert.equal(Object.hasOwn(shape, "planId"), false);
  }
});

test("Wireframe 생성 도구는 nullable parentId, 계층 index, 필수 version만 위임한다", async () => {
  const harness = createHarness();
  const createInput = createToolCases.find(
    ({ name }) => name === "create_wireframe",
  ).input;
  const createTool = harness.tools.get("create_wireframe");

  for (const invalidIndex of [
    1,
    0,
    "",
    "0",
    "01",
    "1.0",
    "1.01",
    ".1",
    "1.",
    "1..1",
    "1.-1",
    "a",
    "1".repeat(256),
  ]) {
    assert.equal(
      createTool.definition.inputSchema.safeParse({
        ...createInput,
        index: invalidIndex,
      }).success,
      false,
    );
  }

  const { index: _index, ...missingIndexInput } = createInput;
  assert.equal(
    createTool.definition.inputSchema.safeParse(missingIndexInput).success,
    false,
  );
  const { parentId: _parentId, ...missingParentInput } = createInput;
  assert.equal(
    createTool.definition.inputSchema.safeParse(missingParentInput).success,
    false,
  );
  for (const invalidParentId of [0, -1, 1.5, "1"]) {
    assert.equal(
      createTool.definition.inputSchema.safeParse({
        ...createInput,
        parentId: invalidParentId,
      }).success,
      false,
    );
  }
  for (const invalidVersion of [0, -1, 1.5, "2"]) {
    assert.equal(
      createTool.definition.inputSchema.safeParse({
        ...createInput,
        version: invalidVersion,
      }).success,
      false,
    );
  }
  const { version: _version, ...missingVersionInput } = createInput;
  assert.equal(
    createTool.definition.inputSchema.safeParse(missingVersionInput).success,
    false,
  );
  assert.equal(
    createTool.definition.inputSchema.parse(createInput).version,
    1,
  );
  assert.equal(
    createTool.definition.inputSchema.parse({
      ...createInput,
      version: 2,
    }).version,
    2,
  );
  assert.equal(
    createTool.definition.inputSchema.parse({
      ...createInput,
      index: "  1.10  ",
    }).index,
    "1.10",
  );

  const created = await harness.invoke("create_wireframe", createInput);
  assert.deepEqual(harness.calls, [
    ["wireframesService", "create", createInput],
  ]);
  assert.deepEqual(created.input, createInput);
});

test("실제 MCP create_wireframe은 필수 version 1과 2만 service에 전달한다", async (t) => {
  const harness = await createSdkHarness();
  t.after(() => harness.close());
  const baseInput = {
    projectId: 17,
    parentId: null,
    title: "Portfolio wireframe",
    html: "<!doctype html><html><head></head><body>Portfolio</body></html>",
  };
  const versionTwoInput = {
    ...baseInput,
    index: "1",
    version: 2,
  };
  const versionOneInput = {
    ...baseInput,
    index: "2",
    version: 1,
  };
  const missingVersionInput = {
    ...baseInput,
    index: "3",
  };

  parseSdkToolResult(
    await harness.client.callTool({
      name: "create_wireframe",
      arguments: versionTwoInput,
    }),
  );
  parseSdkToolResult(
    await harness.client.callTool({
      name: "create_wireframe",
      arguments: versionOneInput,
    }),
  );
  const missingVersionResult = await harness.client.callTool({
    name: "create_wireframe",
    arguments: missingVersionInput,
  });

  assert.deepEqual(harness.calls, [
    ["wireframesService", "create", versionTwoInput],
    ["wireframesService", "create", versionOneInput],
  ]);
  assert.equal(missingVersionResult.isError, true);
  assert.match(missingVersionResult.content[0].text, /invalid/i);
});

test("Design 생성 도구는 필수 positive integer version만 그대로 위임한다", async () => {
  const harness = createHarness();
  const createInput = createToolCases.find(
    ({ name }) => name === "create_design",
  ).input;
  const createTool = harness.tools.get("create_design");

  for (const invalidVersion of [0, -1, 1.5, "2"]) {
    assert.equal(
      createTool.definition.inputSchema.safeParse({
        ...createInput,
        version: invalidVersion,
      }).success,
      false,
    );
  }

  const { version: _version, ...missingVersionInput } = createInput;
  assert.equal(
    createTool.definition.inputSchema.safeParse(missingVersionInput).success,
    false,
  );
  assert.equal(createTool.definition.inputSchema.parse(createInput).version, 1);
  assert.equal(
    createTool.definition.inputSchema.parse({ ...createInput, version: 2 })
      .version,
    2,
  );

  const versionTwoInput = { ...createInput, version: 2 };
  const created = await harness.invoke("create_design", versionTwoInput);

  assert.deepEqual(harness.calls, [
    ["designsService", "create", versionTwoInput],
  ]);
  assert.deepEqual(created.input, versionTwoInput);
});

test("실제 MCP create_design은 explicit version만 service에 전달한다", async (t) => {
  const harness = await createSdkHarness();
  t.after(() => harness.close());
  const baseInput = {
    projectId: 17,
    wireframeId: 41,
    assetId: 42,
    title: "Portfolio design",
    html: "<!doctype html><html><head></head><body>Portfolio</body></html>",
  };
  const versionOneInput = { ...baseInput, version: 1 };
  const versionTwoInput = { ...baseInput, version: 2 };

  parseSdkToolResult(
    await harness.client.callTool({
      name: "create_design",
      arguments: versionOneInput,
    }),
  );
  parseSdkToolResult(
    await harness.client.callTool({
      name: "create_design",
      arguments: versionTwoInput,
    }),
  );
  const missingVersionResult = await harness.client.callTool({
    name: "create_design",
    arguments: baseInput,
  });

  assert.deepEqual(harness.calls, [
    ["designsService", "create", versionOneInput],
    ["designsService", "create", versionTwoInput],
  ]);
  assert.equal(missingVersionResult.isError, true);
  assert.match(missingVersionResult.content[0].text, /invalid/i);
});

test("Domain 생성·수정 도구는 입력, annotations, service 위임 계약을 지킨다", async () => {
  const harness = createHarness();
  const createInput = {
    projectId: 17,
    title: "Domain analysis",
    content: "Domain analysis content",
  };
  const updateInput = {
    projectId: 17,
    domainId: 23,
    title: "Updated domain analysis",
    content: "Updated domain analysis content",
  };

  const created = await harness.invoke("create_domain", createInput);
  const updated = await harness.invoke("update_domain", updateInput);

  assert.deepEqual(harness.calls, [
    ["domainsService", "create", createInput],
    ["domainsService", "update", updateInput],
  ]);
  assert.deepEqual(created, {
    service: "domainsService",
    method: "create",
    input: createInput,
  });
  assert.deepEqual(updated, {
    service: "domainsService",
    method: "update",
    input: updateInput,
  });

  const createTool = harness.tools.get("create_domain");
  const updateTool = harness.tools.get("update_domain");

  assert.deepEqual(Object.keys(createTool.definition.inputSchema.shape), [
    "projectId",
    "parentId",
    "title",
    "content",
  ]);
  assert.deepEqual(Object.keys(updateTool.definition.inputSchema.shape), [
    "projectId",
    "domainId",
    "parentId",
    "title",
    "content",
  ]);
  for (const invalidId of [0, -1, 1.5]) {
    assert.equal(
      createTool.definition.inputSchema.safeParse({
        ...createInput,
        projectId: invalidId,
      }).success,
      false,
    );
    assert.equal(
      updateTool.definition.inputSchema.safeParse({
        ...updateInput,
        projectId: invalidId,
      }).success,
      false,
    );
    assert.equal(
      updateTool.definition.inputSchema.safeParse({
        ...updateInput,
        domainId: invalidId,
      }).success,
      false,
    );
    assert.equal(
      createTool.definition.inputSchema.safeParse({
        ...createInput,
        parentId: invalidId,
      }).success,
      false,
    );
    assert.equal(
      updateTool.definition.inputSchema.safeParse({
        ...updateInput,
        parentId: invalidId,
      }).success,
      false,
    );
  }
  assert.equal(
    updateTool.definition.inputSchema.safeParse({
      projectId: 17,
      title: "Missing domain id",
      content: "content",
    }).success,
    false,
  );
  for (const tool of [createTool, updateTool]) {
    const baseInput = tool === createTool ? createInput : updateInput;

    assert.equal(tool.definition.inputSchema.safeParse(baseInput).success, true);
    assert.equal(
      tool.definition.inputSchema.safeParse({ ...baseInput, parentId: null })
        .success,
      true,
    );
    assert.equal(
      tool.definition.inputSchema.safeParse({ ...baseInput, parentId: 11 })
        .success,
      true,
    );
    assert.equal(
      tool.definition.inputSchema.safeParse({ ...baseInput, parentId: "11" })
        .success,
      false,
    );
    assert.equal(
      tool.definition.inputSchema.safeParse({ ...baseInput, title: "   " })
        .success,
      false,
    );
    assert.equal(
      tool.definition.inputSchema.safeParse({ ...baseInput, content: "" })
        .success,
      false,
    );
    assert.equal(
      tool.definition.inputSchema.parse({ ...baseInput, title: "  Domain  " })
        .title,
      "Domain",
    );
  }
  assert.deepEqual(createTool.definition.annotations, {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  });
  assert.deepEqual(updateTool.definition.annotations, {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  });
});

const databaseArtifactToolCases = [
  {
    label: "DB",
    service: "dbService",
    createName: "create_db",
    updateName: "update_db",
    idField: "dbId",
    bodyField: "content",
    bodyValue: "# users\n\n| column | type |",
  },
  {
    label: "ERD",
    service: "erdService",
    createName: "create_erd",
    updateName: "update_erd",
    idField: "erdId",
    bodyField: "document",
    bodyValue: erdDocument,
  },
];

test("DB와 ERD 생성·수정 도구는 입력 schema, annotations, service 위임 계약을 지킨다", async (t) => {
  for (const toolCase of databaseArtifactToolCases) {
    await t.test(toolCase.label, async () => {
      const harness = createHarness();
      const createInput = {
        projectId: 17,
        title: `${toolCase.label} artifact`,
        [toolCase.bodyField]: toolCase.bodyValue,
      };
      const updateInput = {
        projectId: 17,
        [toolCase.idField]: 31,
        title: `Updated ${toolCase.label} artifact`,
        [toolCase.bodyField]: toolCase.bodyValue,
      };
      const created = await harness.invoke(toolCase.createName, createInput);
      const updated = await harness.invoke(toolCase.updateName, updateInput);
      const createTool = harness.tools.get(toolCase.createName);
      const updateTool = harness.tools.get(toolCase.updateName);

      assert.deepEqual(harness.calls, [
        [toolCase.service, "create", createInput],
        [toolCase.service, "update", updateInput],
      ]);
      assert.deepEqual(created, {
        service: toolCase.service,
        method: "create",
        input: createInput,
      });
      assert.deepEqual(updated, {
        service: toolCase.service,
        method: "update",
        input: updateInput,
      });
      assert.deepEqual(Object.keys(createTool.definition.inputSchema.shape), [
        "projectId",
        "title",
        toolCase.bodyField,
      ]);
      assert.deepEqual(Object.keys(updateTool.definition.inputSchema.shape), [
        "projectId",
        toolCase.idField,
        "title",
        toolCase.bodyField,
      ]);

      for (const invalidId of [0, -1, 1.5, "17"]) {
        assert.equal(
          createTool.definition.inputSchema.safeParse({
            ...createInput,
            projectId: invalidId,
          }).success,
          false,
        );
        assert.equal(
          updateTool.definition.inputSchema.safeParse({
            ...updateInput,
            [toolCase.idField]: invalidId,
          }).success,
          false,
        );
      }
      const { [toolCase.idField]: _id, ...missingIdInput } = updateInput;
      assert.equal(
        updateTool.definition.inputSchema.safeParse(missingIdInput).success,
        false,
      );
      for (const tool of [createTool, updateTool]) {
        const input = tool === createTool ? createInput : updateInput;

        assert.equal(
          tool.definition.inputSchema.safeParse({ ...input, title: "   " })
            .success,
          false,
        );
        assert.equal(
          tool.definition.inputSchema.safeParse({
            ...input,
            [toolCase.bodyField]: "",
          }).success,
          false,
        );
        assert.equal(
          tool.definition.inputSchema.parse({
            ...input,
            title: "  Trimmed artifact  ",
          }).title,
          "Trimmed artifact",
        );
      }
      assert.deepEqual(createTool.definition.annotations, {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      });
      assert.deepEqual(updateTool.definition.annotations, {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      });
    });
  }
});

test("ERD mutation 도구는 structured Dineug v3 document만 service에 전달한다", () => {
  const harness = createHarness();
  const createTool = harness.tools.get("create_erd");
  const baseInput = {
    projectId: 17,
    title: "Project ERD",
    document: erdDocument,
  };

  assert.equal(createTool.definition.inputSchema.safeParse(baseInput).success, true);
  const missingCollection = cloneDocument(erdDocument);
  delete missingCollection.collections.memoEntities;
  for (const invalidDocument of [
    "<!doctype html><html><body>Legacy ERD</body></html>",
    { ...erdDocument, version: "2.0.0" },
    missingCollection,
  ]) {
    assert.equal(
      createTool.definition.inputSchema.safeParse({
        ...baseInput,
        document: invalidDocument,
      }).success,
      false,
    );
  }
});

test("Wireframe 수정 도구는 입력, annotations, service 위임 계약을 지킨다", async () => {
  const harness = createHarness();
  const updateInput = {
    projectId: 17,
    wireframeId: 31,
    parentId: 21,
    index: "1.1",
    title: "Updated portfolio wireframe",
    html: "<!doctype html><html><head></head><body>Updated</body></html>",
  };

  const updated = await harness.invoke("update_wireframe", updateInput);

  assert.deepEqual(harness.calls, [
    ["wireframesService", "update", updateInput],
  ]);
  assert.deepEqual(updated, {
    service: "wireframesService",
    method: "update",
    input: updateInput,
  });

  const updateTool = harness.tools.get("update_wireframe");

  assert.deepEqual(Object.keys(updateTool.definition.inputSchema.shape), [
    "projectId",
    "wireframeId",
    "parentId",
    "index",
    "title",
    "html",
  ]);
  for (const invalidId of [0, -1, 1.5]) {
    assert.equal(
      updateTool.definition.inputSchema.safeParse({
        ...updateInput,
        projectId: invalidId,
      }).success,
      false,
    );
    assert.equal(
      updateTool.definition.inputSchema.safeParse({
        ...updateInput,
        wireframeId: invalidId,
      }).success,
      false,
    );
  }
  for (const invalidIndex of [
    1,
    0,
    "",
    "0",
    "01",
    "1.0",
    "1.01",
    ".1",
    "1.",
    "1..1",
    "1.-1",
    "a",
    "1".repeat(256),
  ]) {
    assert.equal(
      updateTool.definition.inputSchema.safeParse({
        ...updateInput,
        index: invalidIndex,
      }).success,
      false,
    );
  }
  const { index: _index, ...missingIndexInput } = updateInput;
  assert.equal(
    updateTool.definition.inputSchema.safeParse(missingIndexInput).success,
    false,
  );
  const { parentId: _parentId, ...missingParentInput } = updateInput;
  assert.equal(
    updateTool.definition.inputSchema.safeParse(missingParentInput).success,
    false,
  );
  for (const invalidParentId of [0, -1, 1.5, "1"]) {
    assert.equal(
      updateTool.definition.inputSchema.safeParse({
        ...updateInput,
        parentId: invalidParentId,
      }).success,
      false,
    );
  }
  assert.equal(
    updateTool.definition.inputSchema.safeParse({
      projectId: 17,
      parentId: updateInput.parentId,
      index: updateInput.index,
      title: "Missing wireframe id",
      html: updateInput.html,
    }).success,
    false,
  );
  assert.equal(
    updateTool.definition.inputSchema.safeParse({
      ...updateInput,
      title: "   ",
    }).success,
    false,
  );
  assert.equal(
    updateTool.definition.inputSchema.safeParse({
      ...updateInput,
      html: "",
    }).success,
    false,
  );
  assert.equal(
    updateTool.definition.inputSchema.parse({
      ...updateInput,
      index: "  1.10  ",
    }).index,
    "1.10",
  );
  assert.equal(
    updateTool.definition.inputSchema.parse({
      ...updateInput,
      title: "  Updated wireframe  ",
    }).title,
    "Updated wireframe",
  );
  assert.deepEqual(updateTool.definition.annotations, {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  });
});

const htmlUpdateToolCases = [
  {
    name: "update_asset",
    service: "assetsService",
    idField: "assetId",
    input: {
      projectId: 17,
      assetId: 41,
      title: "Updated portfolio asset",
      html: "<!doctype html><html><head></head><body>Updated asset</body></html>",
    },
  },
  {
    name: "update_design",
    service: "designsService",
    idField: "designId",
    input: {
      projectId: 17,
      designId: 51,
      title: "Updated portfolio design",
      html: "<!doctype html><html><head></head><body>Updated design</body></html>",
    },
  },
];

test("Asset과 Design 수정 도구는 입력, annotations, service 위임 계약을 지킨다", async (t) => {
  for (const toolCase of htmlUpdateToolCases) {
    await t.test(toolCase.name, async () => {
      const harness = createHarness();
      const updated = await harness.invoke(toolCase.name, toolCase.input);
      const updateTool = harness.tools.get(toolCase.name);

      assert.deepEqual(harness.calls, [
        [toolCase.service, "update", toolCase.input],
      ]);
      assert.deepEqual(updated, {
        service: toolCase.service,
        method: "update",
        input: toolCase.input,
      });
      assert.deepEqual(Object.keys(updateTool.definition.inputSchema.shape), [
        "projectId",
        toolCase.idField,
        "title",
        "html",
      ]);

      for (const invalidId of [0, -1, 1.5]) {
        assert.equal(
          updateTool.definition.inputSchema.safeParse({
            ...toolCase.input,
            projectId: invalidId,
          }).success,
          false,
        );
        assert.equal(
          updateTool.definition.inputSchema.safeParse({
            ...toolCase.input,
            [toolCase.idField]: invalidId,
          }).success,
          false,
        );
      }

      const { [toolCase.idField]: _id, ...missingIdInput } = toolCase.input;
      assert.equal(
        updateTool.definition.inputSchema.safeParse(missingIdInput).success,
        false,
      );
      assert.equal(
        updateTool.definition.inputSchema.safeParse({
          ...toolCase.input,
          title: "   ",
        }).success,
        false,
      );
      assert.equal(
        updateTool.definition.inputSchema.safeParse({
          ...toolCase.input,
          html: "",
        }).success,
        false,
      );
      assert.equal(
        updateTool.definition.inputSchema.parse({
          ...toolCase.input,
          title: "  Updated artifact  ",
        }).title,
        "Updated artifact",
      );
      assert.deepEqual(updateTool.definition.annotations, {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      });
    });
  }
});

test("실제 MCP update_wireframe은 성공과 service 오류 응답을 직렬화한다", async (t) => {
  const harness = await createSdkHarness();
  t.after(() => harness.close());
  const updateInput = {
    projectId: 17,
    wireframeId: 31,
    parentId: 21,
    index: "1.1",
    title: "Updated portfolio wireframe",
    html: "<!doctype html><html><head></head><body>Updated</body></html>",
  };

  const updated = parseSdkToolResult(
    await harness.client.callTool({
      name: "update_wireframe",
      arguments: updateInput,
    }),
  );

  assert.deepEqual(updated, {
    service: "wireframesService",
    method: "update",
    input: updateInput,
  });
  assert.deepEqual(harness.calls, [
    ["wireframesService", "update", updateInput],
  ]);

  harness.services.wireframesService.update = async () => {
    throw new NotFoundException("Wireframe 404 not found");
  };
  const failure = await harness.client.callTool({
    name: "update_wireframe",
    arguments: { ...updateInput, wireframeId: 404 },
  });

  assert.equal(failure.isError, true);
  assert.deepEqual(JSON.parse(failure.content[0].text), {
    error: {
      code: "NotFoundException",
      status: 404,
      message: "Wireframe 404 not found",
    },
  });
});

test("실제 MCP update_asset과 update_design은 성공과 service 오류 응답을 직렬화한다", async (t) => {
  for (const toolCase of htmlUpdateToolCases) {
    await t.test(toolCase.name, async (subtest) => {
      const harness = await createSdkHarness();
      subtest.after(() => harness.close());

      const updated = parseSdkToolResult(
        await harness.client.callTool({
          name: toolCase.name,
          arguments: toolCase.input,
        }),
      );

      assert.deepEqual(updated, {
        service: toolCase.service,
        method: "update",
        input: toolCase.input,
      });
      assert.deepEqual(harness.calls, [
        [toolCase.service, "update", toolCase.input],
      ]);

      harness.services[toolCase.service].update = async () => {
        throw new NotFoundException(`${toolCase.idField} 404 not found`);
      };
      const failure = await harness.client.callTool({
        name: toolCase.name,
        arguments: { ...toolCase.input, [toolCase.idField]: 404 },
      });

      assert.equal(failure.isError, true);
      assert.deepEqual(JSON.parse(failure.content[0].text), {
        error: {
          code: "NotFoundException",
          status: 404,
          message: `${toolCase.idField} 404 not found`,
        },
      });
    });
  }
});

test("실제 MCP workflow update는 성공과 service 오류 응답을 직렬화한다", async (t) => {
  for (const toolCase of workflowUpdateToolCases) {
    await t.test(toolCase.name, async (subtest) => {
      const harness = await createSdkHarness();
      subtest.after(() => harness.close());

      const updated = parseSdkToolResult(
        await harness.client.callTool({
          name: toolCase.name,
          arguments: toolCase.input,
        }),
      );

      assert.deepEqual(updated, {
        service: toolCase.service,
        method: "update",
        input: toolCase.input,
      });
      assert.deepEqual(harness.calls, [
        [toolCase.service, "update", toolCase.input],
      ]);

      harness.services[toolCase.service].update = async () => {
        throw new NotFoundException(`${toolCase.idField} 404 not found`);
      };
      const failure = await harness.client.callTool({
        name: toolCase.name,
        arguments: { ...toolCase.input, [toolCase.idField]: 404 },
      });

      assert.equal(failure.isError, true);
      assert.deepEqual(JSON.parse(failure.content[0].text), {
        error: {
          code: "NotFoundException",
          status: 404,
          message: `${toolCase.idField} 404 not found`,
        },
      });
    });
  }
});

test("실제 MCP tools/list와 제거된 도구 호출도 43개 공개 계약을 따른다", async (t) => {
  const harness = await createSdkHarness();
  t.after(() => harness.close());

  const listed = await harness.client.listTools();

  assert.deepEqual(
    listed.tools.map(({ name }) => name),
    expectedToolNames,
  );
  for (const name of removedToolNames) {
    const result = await harness.client.callTool({ name, arguments: {} });

    assert.equal(result.isError, true, `${name} 호출은 실패해야 한다`);
    assert.match(result.content[0].text, /not found|unknown tool/i);
  }
});

test("실제 MCP get_project는 optional projectId를 검증하고 service 오류를 보존한다", async (t) => {
  const harness = await createSdkHarness();
  t.after(() => harness.close());

  parseSdkToolResult(
    await harness.client.callTool({ name: "get_project", arguments: {} }),
  );
  parseSdkToolResult(
    await harness.client.callTool({
      name: "get_project",
      arguments: { projectId: 17 },
    }),
  );
  for (const projectId of [0, 1.5]) {
    const invalid = await harness.client.callTool({
      name: "get_project",
      arguments: { projectId },
    });

    assert.equal(invalid.isError, true);
    assert.match(invalid.content[0].text, /invalid/i);
  }

  harness.services.domainsService.list = async () => {
    throw new NotFoundException("Project 404 not found");
  };
  const failure = await harness.client.callTool({
    name: "get_project",
    arguments: { projectId: 404 },
  });

  assert.equal(failure.isError, true);
  assert.deepEqual(JSON.parse(failure.content[0].text), {
    error: {
      code: "NotFoundException",
      status: 404,
      message: "Project 404 not found",
    },
  });
});

test("실제 MCP create_plan은 tasks 입력 없이 plansService.create에 위임한다", async (t) => {
  const harness = await createSdkHarness();
  t.after(() => harness.close());

  parseSdkToolResult(
    await harness.client.callTool({
      name: "create_plan",
      arguments: {
        projectId: 1,
        title: "Plan without initial tasks",
        content: "Plan content",
      },
    }),
  );

  assert.deepEqual(harness.calls, [
    [
      "plansService",
      "create",
      {
        projectId: 1,
        title: "Plan without initial tasks",
        content: "Plan content",
      },
    ],
  ]);
  const tool = harness.tools.get("create_plan");

  assert.equal(Object.hasOwn(tool.definition.inputSchema.shape, "tasks"), false);
  assert.doesNotMatch(tool.definition.description, /tasks?/i);
});

test("create-only 산출물 도구는 id를 update 입력으로 전달하지 않는다", async (t) => {
  const harness = await createSdkHarness();
  t.after(() => harness.close());

  for (const toolCase of createToolCases.filter(({ name }) =>
    ["create_draft", "create_design", "create_wireframe", "create_asset"].includes(name),
  )) {
    try {
      await harness.client.callTool({
        name: toolCase.name,
        arguments: { ...toolCase.input, id: 999 },
      });
    } catch (error) {
      assert.match(String(error), /invalid/i);
    }
  }

  for (const [, , input] of harness.calls) {
    assert.equal(Object.hasOwn(input, "id"), false);
  }
});
