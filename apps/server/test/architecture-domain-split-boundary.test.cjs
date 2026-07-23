const assert = require("node:assert/strict");
const { existsSync, readFileSync, readdirSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const serverRoot = join(__dirname, "..");
const source = (relativePath) => {
  const path = join(serverRoot, "src", relativePath);

  assert.equal(existsSync(path), true, `${relativePath}가 존재해야 한다`);
  return readFileSync(path, "utf8");
};

test("Domain 조회·raw 문서 저장과 Architecture diagram 저장은 서로 다른 책임을 소유한다", () => {
  const deploymentSchema = source("services/architectures/deployment-architecture.ts");
  const domainService = source("services/domains/domains.service.ts");
  const architectureService = source("services/architectures/architectures.service.ts");

  assert.equal(
    existsSync(join(serverRoot, "src", "services", "domains", "domain-erd.ts")),
    false,
  );
  assert.match(deploymentSchema, /kind:\s*z\.literal\s*\(\s*["']deployment-architecture["']/);
  assert.doesNotMatch(
    domainService,
    /domainErdSchema|parseDomainErd|diagram:\s*unknown|async\s+save\s*\(/,
  );
  assert.match(domainService, /this\.prisma\.domain\.findMany\s*\(/);
  assert.match(domainService, /async\s+create\s*\(/);
  assert.match(domainService, /async\s+update\s*\(/);
  assert.match(domainService, /this\.prisma\.domain\.findUnique\s*\(/);
  assert.match(domainService, /this\.prisma\.domain\.create\s*\(/);
  assert.match(domainService, /this\.prisma\.domain\.update\s*\(/);
  assert.doesNotMatch(domainService, /deploymentArchitectureSchema|this\.prisma\.architecture\b/);
  assert.match(architectureService, /deploymentArchitectureSchema/);
  assert.match(architectureService, /this\.prisma\.architecture\b/);
  assert.match(architectureService, /async\s+create\s*\(/);
  assert.doesNotMatch(architectureService, /async\s+save\s*\(/);
  assert.doesNotMatch(architectureService, /this\.prisma\.architecture\.update\s*\(/);
  assert.doesNotMatch(architectureService, /domainErdSchema|this\.prisma\.domain\b/);
  for (const resource of ["domains", "architectures"]) {
    assert.equal(
      existsSync(
        join(serverRoot, "src", "services", resource, `${resource}.controller.ts`),
      ),
      true,
      `${resource} list controller가 존재해야 한다`,
    );
  }
});

test("deployment architecture schema는 배포 graph shape·상한·교차 참조 검증을 정의한다", () => {
  const schema = source("services/architectures/deployment-architecture.ts");

  assert.match(schema, /export\s+const\s+deploymentArchitectureSchema\b/);
  assert.match(schema, /schemaVersion:\s*z\.literal\s*\(\s*1\s*\)/);
  assert.match(schema, /generatedAt:\s*z\.iso\.datetime\(\{\s*offset:\s*true\s*\}\)/);
  assert.match(schema, /environments:\s*z\s*\.array\s*\(/);
  assert.match(schema, /nodes:\s*z\.array\s*\(/);
  assert.match(schema, /connections:\s*z\s*\.array\s*\(/);
  assert.match(schema, /MAX_DEPLOYMENT_ENVIRONMENTS\s*=\s*50\b/);
  assert.match(schema, /MAX_DEPLOYMENT_NODES\s*=\s*100\b/);
  assert.match(schema, /MAX_DEPLOYMENT_CONNECTIONS\s*=\s*1_000\b/);
  assert.match(schema, /\.min\(1\)\.max\(MAX_DEPLOYMENT_NODES\)/);

  for (const kind of ["client", "local", "cloud", "edge", "external"]) {
    assert.match(schema, new RegExp(`["']${kind}["']`));
  }
  for (const kind of ["gateway", "service", "worker", "database", "cache", "queue", "storage"]) {
    assert.match(schema, new RegExp(`["']${kind}["']`));
  }
  for (const field of [
    "environmentId",
    "runtime",
    "provider",
    "region",
    "description",
    "sourceNodeId",
    "targetNodeId",
    "label",
    "protocol",
  ]) {
    assert.match(schema, new RegExp(`\\b${field}\\b`));
  }

  assert.match(schema, /superRefine\s*\(/);
  assert.match(schema, /duplicate|unique|중복/i);
  assert.match(schema, /environment/i);
  assert.match(schema, /sourceNodeId|targetNodeId/);
  assert.match(schema, /self|itself|자기|자신/i);
});

test("MCP는 Domain 저장 도구를 노출하되 Architecture 저장 도구는 노출하지 않는다", () => {
  const service = source("mcp/mcp.service.ts");
  const moduleSource = source("mcp/mcp.module.ts");

  assert.match(moduleSource, /DomainsModule/);
  assert.match(moduleSource, /ArchitecturesModule/);
  assert.match(service, /private readonly domainsService:\s*DomainsService/);
  assert.match(service, /private readonly architecturesService:\s*ArchitecturesService/);
  assert.match(service, /this\.domainsService\.list\s*\(/);
  assert.match(service, /this\.architecturesService\.list\s*\(/);
  assert.match(service, /registerTool\(\s*["']create_domain["']/);
  assert.match(service, /registerTool\(\s*["']update_domain["']/);
  assert.match(service, /this\.domainsService\.create\s*\(/);
  assert.match(service, /this\.domainsService\.update\s*\(/);
  assert.doesNotMatch(service, /registerTool\(\s*["']create_architecture["']/);
});

test("Prisma Project는 Domain과 Architecture를 별도 relation으로 제공한다", () => {
  const schema = readFileSync(join(serverRoot, "prisma", "schema.prisma"), "utf8");
  const projects = source("services/projects/projects.service.ts");

  assert.match(schema, /model\s+Project\s*\{[\s\S]*?domains\s+Domain\[\]/);
  assert.match(schema, /model\s+Project\s*\{[\s\S]*?architectures\s+Architecture\[\]/);
  assert.match(schema, /model\s+Domain\s*\{[\s\S]*?projectId\s+Int[\s\S]*?content\s+String/);
  assert.match(projects, /_count:[\s\S]*?domains:\s*true/);
  assert.doesNotMatch(projects, /\bgetContext\s*\(|include:[\s\S]*?domains:\s*\{\s*orderBy:/);
});

test("migration은 valid domain-erd만 ID·timestamp를 보존해 Domain으로 이동하고 legacy Architecture를 남긴다", () => {
  const migrationsRoot = join(serverRoot, "prisma", "migrations");
  const migration = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(migrationsRoot, entry.name, "migration.sql"))
    .filter((path) => existsSync(path))
    .map((path) => readFileSync(path, "utf8"))
    .find((sql) => /CREATE TABLE\s+["']Domain["']/.test(sql));

  assert.ok(migration, "Domain table을 추가하는 migration이 필요하다");
  assert.match(migration, /INSERT\s+INTO\s+["']Domain["'][\s\S]*?SELECT[\s\S]*?\bid\b[\s\S]*?projectId[\s\S]*?createdAt[\s\S]*?updatedAt[\s\S]*?title[\s\S]*?content/i);
  assert.match(migration, /json_valid\s*\(\s*content\s*\)/i);
  assert.match(migration, /json_extract\s*\(\s*content\s*,\s*["']\$\.kind["']\s*\)\s*=\s*["']domain-erd["']/i);
  assert.match(migration, /json_extract\s*\(\s*content\s*,\s*["']\$\.schemaVersion["']\s*\)\s*=\s*1/i);
  assert.match(migration, /json_type\s*\(\s*content\s*,\s*["']\$\.entities["']\s*\)\s*=\s*["']array["']/i);
  assert.match(migration, /json_type\s*\(\s*content\s*,\s*["']\$\.relationships["']\s*\)\s*=\s*["']array["']/i);
  assert.match(migration, /DELETE\s+FROM\s+["']Architecture["'][\s\S]*?domain-erd/i);
});
