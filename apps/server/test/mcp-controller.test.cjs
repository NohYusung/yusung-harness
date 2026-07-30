const assert = require("node:assert/strict");
const { EventEmitter, once } = require("node:events");
const { readFileSync } = require("node:fs");
const { createServer } = require("node:http");
const { dirname, join } = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const {
  StreamableHTTPClientTransport,
} = require("@modelcontextprotocol/sdk/client/streamableHttp.js");
const ts = require("typescript");

const serverRoot = join(__dirname, "..");
const controllerPath = join(serverRoot, "src", "mcp", "mcp.controller.ts");
const servicePath = join(serverRoot, "src", "mcp", "mcp.service.ts");
const expectedToolNames = [
  "get_context",
  "get_project",
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
  "create_workLog",
  "create_request",
  "create_architecturePlan",
  "update_architecturePlan",
  "update_request",
];

const loadTypescriptExport = (filePath, exportName, moduleStubs = {}) => {
  const output = ts.transpileModule(readFileSync(filePath, "utf8"), {
    compilerOptions: {
      experimentalDecorators: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filePath,
  }).outputText;
  const loadedModule = new Module(filePath, module);

  loadedModule.filename = filePath;
  loadedModule.paths = Module._nodeModulePaths(dirname(filePath));
  const originalRequire = loadedModule.require.bind(loadedModule);
  loadedModule.require = (specifier) =>
    Object.hasOwn(moduleStubs, specifier)
      ? moduleStubs[specifier]
      : originalRequire(specifier);
  loadedModule._compile(output, filePath);
  return loadedModule.exports[exportName];
};

const loadMcpController = () =>
  loadTypescriptExport(controllerPath, "McpController", {
    "../libs/json-exception.filter": {
      JsonExceptionFilter: class JsonExceptionFilter {},
    },
  });
const loadMcpService = () => loadTypescriptExport(servicePath, "McpService");
const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

const readJsonBody = async (request) => {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
};

const closeHttpServer = (server) => {
  const closed = new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  server.closeAllConnections?.();
  return closed;
};

const withTimeout = (promise, label) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out`)), 5_000).unref();
    }),
  ]);

const waitUntil = (predicate) =>
  new Promise((resolve) => {
    const check = () => {
      if (predicate()) {
        resolve();
        return;
      }
      setTimeout(check, 5);
    };
    check();
  });

test("remote hostname과 origin의 POST 요청도 MCP transport까지 전달한다", async () => {
  const calls = [];
  const server = {
    close: async () => {
      calls.push(["server.close"]);
    },
  };
  const transport = {
    handleRequest: async (request, response, body) => {
      calls.push(["transport.handleRequest", request, response, body]);
    },
  };
  const mcpService = {
    createConnection: async () => {
      calls.push(["mcpService.createConnection"]);
      return { server, transport };
    },
  };
  const request = {
    hostname: "mcp.example.com",
    headers: { origin: "https://dashboard.example.com" },
  };
  const response = Object.assign(new EventEmitter(), {
    headersSent: false,
    json(payload) {
      calls.push(["response.json", payload]);
      return this;
    },
    status(status) {
      calls.push(["response.status", status]);
      return this;
    },
  });
  const body = {
    id: 1,
    jsonrpc: "2.0",
    method: "tools/list",
  };
  const McpController = loadMcpController();
  const controller = new McpController(mcpService);

  await controller.handleRequest(request, response, body);

  assert.deepEqual(calls.slice(0, 2), [
    ["mcpService.createConnection"],
    ["transport.handleRequest", request, response, body],
  ]);
  assert.equal(
    calls.some(([name]) => name === "response.status" || name === "response.json"),
    false,
  );

  response.emit("finish");
  await flushMicrotasks();
  assert.deepEqual(calls.at(-1), ["server.close"]);
});

test("실제 Streamable HTTP client는 GET 405 후 POST로 25개 tool을 조회한다", async () => {
  const McpController = loadMcpController();
  const McpService = loadMcpService();
  const emptyService = {};
  const mcpService = new McpService(
    emptyService,
    emptyService,
    emptyService,
    emptyService,
    emptyService,
    emptyService,
    emptyService,
    emptyService,
    emptyService,
    emptyService,
    emptyService,
    emptyService,
    emptyService,
    emptyService,
    emptyService,
    emptyService,
  );
  const controller = new McpController(mcpService);
  const requests = [];
  const clientRequests = [];
  const httpServer = createServer((request, response) => {
    void (async () => {
      const body = await readJsonBody(request);

      response.status = (status) => {
        response.statusCode = status;
        return response;
      };
      response.json = (payload) => {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify(payload));
        return response;
      };
      response.once("finish", () => {
        requests.push({
          method: request.method,
          rpcMethod: body?.method,
          status: response.statusCode,
        });
      });

      // SDK client compatibility fixture: standalone SSE GET을 지원하지 않는
      // HTTP edge가 반환하는 405를 transport가 정상적인 선택 응답으로 처리한다.
      if (request.method === "GET") {
        response.statusCode = 405;
        response.setHeader("allow", "POST");
        response.end();
        return;
      }

      await controller.handleRequest(request, response, body);
    })().catch((error) => {
      response.statusCode = 500;
      response.end(String(error));
    });
  });

  httpServer.listen(0, "127.0.0.1");
  await once(httpServer, "listening");

  const address = httpServer.address();
  assert.ok(address && typeof address !== "string");
  const endpoint = new URL(`http://127.0.0.1:${address.port}/mcp`);
  const observingFetch = async (input, init) => {
    const response = await fetch(input, init);
    let rpcMethod;

    if (typeof init?.body === "string") {
      rpcMethod = JSON.parse(init.body).method;
    }
    clientRequests.push({
      method: init?.method ?? "GET",
      rpcMethod,
      status: response.status,
    });
    return response;
  };
  const getProbeTransport = new StreamableHTTPClientTransport(endpoint, {
    fetch: observingFetch,
  });
  await getProbeTransport.start();
  try {
    await withTimeout(
      getProbeTransport.resumeStream(""),
      "transport GET 405 probe",
    );
    await withTimeout(
      waitUntil(() => clientRequests.some(({ method }) => method === "GET")),
      "GET 405 request log",
    );
  } finally {
    await getProbeTransport.close();
  }

  assert.deepEqual(clientRequests[0], {
    method: "GET",
    rpcMethod: undefined,
    status: 405,
  });

  const transport = new StreamableHTTPClientTransport(endpoint, {
    fetch: observingFetch,
  });
  const client = new Client({
    name: "mcp-controller-integration-test",
    version: "1.0.0",
  });

  try {
    await withTimeout(client.connect(transport), "client.connect");
    await withTimeout(
      waitUntil(
        () => clientRequests.filter(({ method }) => method === "GET").length >= 2,
      ),
      "client background GET 405",
    );
    const result = await withTimeout(client.listTools(), "client.listTools");

    assert.deepEqual(
      result.tools.map(({ name }) => name),
      expectedToolNames,
    );
    assert.deepEqual(
      clientRequests.filter(
        ({ method, rpcMethod }) =>
          method === "POST" &&
          (rpcMethod === "initialize" || rpcMethod === "tools/list"),
      ),
      [
        { method: "POST", rpcMethod: "initialize", status: 200 },
        { method: "POST", rpcMethod: "tools/list", status: 200 },
      ],
    );
    assert.equal(
      clientRequests.filter(
        ({ method, status }) => method === "GET" && status === 405,
      ).length,
      2,
    );
  } finally {
    await Promise.allSettled([client.close()]);
    await closeHttpServer(httpServer);
  }
});
