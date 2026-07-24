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
  "get_context",
  "get_project",
  "create_project",
  "create_plan",
  "create_draft",
  "create_domain",
  "update_domain",
  "create_task",
  "create_design",
  "update_design",
  "create_wireframe",
  "update_wireframe",
  "create_asset",
  "update_asset",
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
      "reviews",
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

test("MCP source와 runtime 등록 목록은 공개 계약의 14개 도구와 정확히 일치한다", () => {
  const source = readFileSync(servicePath, "utf8");
  const { tools } = createHarness();
  const registeredNames = [...source.matchAll(/server\.registerTool\(\s*["']([^"']+)["']/g)]
    .map((match) => match[1]);

  assert.deepEqual(registeredNames, expectedToolNames);
  assert.deepEqual([...tools.keys()], expectedToolNames);
  assert.equal(tools.size, 14);

  for (const name of removedToolNames) {
    assert.equal(tools.has(name), false, `${name} 도구는 제거해야 한다`);
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
    repoPaths: harness.project.repoPaths,
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
    name: "create_design",
    service: "designsService",
    method: "create",
    input: {
      projectId: 1,
      wireframeId: 4,
      assetId: 5,
      title: "Design",
      html: "<!doctype html><html><head></head><body>Design</body></html>",
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
    create_wireframe: ["projectId", "parentId", "index", "title", "html"],
    create_design: [
      "projectId",
      "wireframeId",
      "assetId",
      "title",
      "html",
    ],
  };

  for (const [toolName, fields] of Object.entries(expectedFields)) {
    const shape = tools.get(toolName).definition.inputSchema.shape;

    assert.deepEqual(Object.keys(shape), fields);
    assert.equal(Object.hasOwn(shape, "taskId"), false);
    assert.equal(Object.hasOwn(shape, "planId"), false);
  }
});

test("Wireframe 생성 도구는 nullable parentId와 계층 index path만 위임한다", async () => {
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
    "title",
    "content",
  ]);
  assert.deepEqual(Object.keys(updateTool.definition.inputSchema.shape), [
    "projectId",
    "domainId",
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

test("실제 MCP tools/list와 제거된 도구 호출도 14개 공개 계약을 따른다", async (t) => {
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
