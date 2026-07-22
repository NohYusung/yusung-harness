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

const serverRoot = join(__dirname, "..");
const servicePath = join(serverRoot, "src", "mcp", "mcp.service.ts");

const expectedToolNames = [
  "get_project",
  "create_project",
  "create_plan",
  "create_draft",
  "create_task",
  "create_design",
  "create_wireframe",
  "create_asset",
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
    repoPath: "/workspace/harness",
    repoType: "LOCAL",
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
      "reviews",
    ].map((domain) => [domain, [{ domain, projectId: 17 }]]),
  );
  const listService = (service, domain) => async (...args) => {
    calls.push([service, "list", ...args]);
    return domainResults[domain];
  };
  const services = {
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
      createVersion: async (input) => {
        calls.push(["plansService", "createVersion", input]);
        return result("plansService", "createVersion", input);
      },
    },
    draftsService: {
      list: listService("draftsService", "drafts"),
      save: async (input) => {
        calls.push(["draftsService", "save", input]);
        return result("draftsService", "save", input);
      },
    },
    tasksService: {
      list: listService("tasksService", "tasks"),
      create: async (input) => {
        calls.push(["tasksService", "create", input]);
        return result("tasksService", "create", input);
      },
    },
    designsService: {
      list: listService("designsService", "designs"),
      save: async (input) => {
        calls.push(["designsService", "save", input]);
        return result("designsService", "save", input);
      },
    },
    wireframesService: {
      list: listService("wireframesService", "wireframes"),
      save: async (input) => {
        calls.push(["wireframesService", "save", input]);
        return result("wireframesService", "save", input);
      },
    },
    assetsService: {
      list: listService("assetsService", "assets"),
      save: async (input) => {
        calls.push(["assetsService", "save", input]);
        return result("assetsService", "save", input);
      },
    },
    domainsService: {
      list: listService("domainsService", "domains"),
    },
    architecturesService: {
      list: listService("architecturesService", "architectures"),
    },
    reviewsService: {
      list: listService("reviewsService", "reviews"),
    },
  };
  const McpService = loadMcpService();
  const service = Object.assign(new McpService(), services);
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

test("MCP source와 runtime 등록 목록은 공개 계약의 8개 도구와 정확히 일치한다", () => {
  const source = readFileSync(servicePath, "utf8");
  const { tools } = createHarness();
  const registeredNames = [...source.matchAll(/server\.registerTool\(\s*["']([^"']+)["']/g)]
    .map((match) => match[1]);

  assert.deepEqual(registeredNames, expectedToolNames);
  assert.deepEqual([...tools.keys()], expectedToolNames);
  assert.equal(tools.size, 8);

  for (const name of removedToolNames) {
    assert.equal(tools.has(name), false, `${name} 도구는 제거해야 한다`);
  }
});

test("get_project는 projectId가 있으면 9종 domain list를 병렬 조립한다", async () => {
  const harness = createHarness();
  const listResponse = await harness.invoke("get_project", {});
  const contextResponse = await harness.invoke("get_project", {
    projectId: 17,
  });

  assert.deepEqual(harness.calls, [
    ["projectsService", "list"],
    ["projectsService", "list"],
    [
      "plansService",
      "list",
      { projectId: 17 },
      { orderBy: { version: "desc" } },
    ],
    ["tasksService", "list", { projectId: 17 }],
    ["draftsService", "list", { projectId: 17 }],
    ["domainsService", "list", { projectId: 17 }],
    ["architecturesService", "list", { projectId: 17 }],
    ["wireframesService", "list", { projectId: 17 }],
    ["assetsService", "list", { projectId: 17 }],
    ["designsService", "list", { projectId: 17 }],
    ["reviewsService", "list", { projectId: 17 }],
  ]);
  assert.deepEqual(listResponse, [harness.project]);
  assert.deepEqual(contextResponse, {
    id: harness.project.id,
    title: harness.project.title,
    repoPath: harness.project.repoPath,
    repoType: harness.project.repoType,
    description: harness.project.description,
    ...harness.domainResults,
  });
  assert.equal("_count" in contextResponse, false);
  const tool = harness.tools.get("get_project");

  assert.equal(tool.definition.annotations.readOnlyHint, true);
  assert.equal(tool.definition.inputSchema.shape.projectId.isOptional(), true);
});

const createProjectInput = {
  title: "Harness",
  repoPath: "/workspace/harness",
  repoType: "LOCAL",
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
    method: "createVersion",
    input: {
      projectId: 1,
      title: "Plan",
      content: "Plan content",
      tasks: [{ title: "Task", content: "Task content" }],
    },
  },
  {
    name: "create_draft",
    service: "draftsService",
    method: "save",
    input: {
      projectId: 1,
      title: "Draft",
      content: "Draft content",
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
    name: "create_design",
    service: "designsService",
    method: "save",
    input: {
      projectId: 1,
      taskId: 3,
      wireframeId: 4,
      assetId: 5,
      title: "Design",
      html: "<!doctype html><html><head></head><body>Design</body></html>",
    },
  },
  {
    name: "create_wireframe",
    service: "wireframesService",
    method: "save",
    input: {
      projectId: 1,
      taskId: 3,
      title: "Wireframe",
      html: "<!doctype html><html><head></head><body>Wireframe</body></html>",
    },
  },
  {
    name: "create_asset",
    service: "assetsService",
    method: "save",
    input: {
      projectId: 1,
      taskId: 3,
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

test("실제 MCP tools/list와 제거된 도구 호출도 8개 공개 계약을 따른다", async (t) => {
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

test("실제 MCP create_plan은 tasks 기본값을 적용한다", async (t) => {
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
      "createVersion",
      {
        projectId: 1,
        title: "Plan without initial tasks",
        content: "Plan content",
        tasks: [],
      },
    ],
  ]);
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
