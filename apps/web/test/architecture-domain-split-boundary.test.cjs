const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const webRoot = join(__dirname, "..");
const source = (relativePath) => {
  const path = join(webRoot, "src", relativePath);

  assert.equal(existsSync(path), true, `${relativePath}가 존재해야 한다`);
  return readFileSync(path, "utf8");
};

test("web DTO·Zod는 Domain과 Architecture relation을 분리한다", () => {
  const types = source("types/dashboard.ts");
  const validation = source("lib/validations/dashboard.ts");

  assert.match(types, /interface\s+ArtifactCounts\b[\s\S]*?domains:\s*number/);
  assert.match(types, /export\s+type\s+Domain\s*=\s*ArtifactDocument/);
  assert.match(types, /export\s+type\s+Architecture\s*=\s*ArtifactDocument/);
  assert.match(types, /interface\s+ProjectContext\b[\s\S]*?domains:\s*Domain\[\]/);
  assert.match(types, /interface\s+ProjectContext\b[\s\S]*?architectures:\s*Architecture\[\]/);
  assert.match(validation, /domains:\s*z\.array\s*\(\s*artifactDocumentSchema\s*\)/);
  assert.match(validation, /architectures:\s*z\.array\s*\(\s*artifactDocumentSchema\s*\)/);
});

test("Domain parser와 deployment Architecture parser는 별도 graph 계약을 가진다", () => {
  const domain = source("lib/domain-erd.ts");
  const architecture = source("lib/deployment-architecture.ts");

  assert.match(domain, /export\s+const\s+domainErdSchema\b/);
  assert.match(domain, /kind:\s*z\.literal\s*\(\s*["']domain-erd["']/);
  assert.match(domain, /export\s+function\s+parseDomainErd\b/);
  assert.match(domain, /export\s+function\s+getLatestDomainErd\b/);
  assert.match(architecture, /export\s+const\s+deploymentArchitectureSchema\b/);
  assert.match(architecture, /kind:\s*z\.literal\s*\(\s*["']deployment-architecture["']/);
  assert.match(architecture, /environments:\s*z\s*\.array\s*\(/);
  assert.match(architecture, /nodes:\s*z\s*\.array\s*\(/);
  assert.match(architecture, /connections:\s*z\s*\.array\s*\(/);
  assert.match(architecture, /export\s+function\s+parseDeploymentArchitecture\b/);
  assert.match(architecture, /export\s+function\s+getLatestDeploymentArchitecture\b/);
});

test("DomainWorkspace는 ERD를, ArchitectureWorkspace는 배포 graph와 legacy fallback을 렌더한다", () => {
  const domainWorkspace = source("components/features/dashboard/DomainWorkspace.tsx");
  const architectureWorkspace = source(
    "components/features/dashboard/ArchitectureWorkspace.tsx",
  );

  assert.match(domainWorkspace, /getLatestDomainErd/);
  assert.match(domainWorkspace, /domains:\s*Domain\[\]/);
  assert.doesNotMatch(domainWorkspace, /getLatestDeploymentArchitecture/);
  assert.match(architectureWorkspace, /getLatestDeploymentArchitecture/);
  assert.match(architectureWorkspace, /architectures:\s*Architecture\[\]/);
  assert.match(architectureWorkspace, /Legacy|legacy/);
  assert.doesNotMatch(architectureWorkspace, /getLatestDomainErd|parseDomainErd/);
});

test("통합 Workbench는 Domain과 Architecture record type을 독립적으로 조립한다", () => {
  const workbench = source(
    "components/features/dashboard/ArtifactWorkbench.tsx",
  );
  const dashboard = source("components/features/dashboard/Dashboard.tsx");
  const page = source("app/projects/[projectId]/page.tsx");

  assert.match(
    workbench,
    /relationOrder\s*:[^=]*=\s*\[[^\]]*["']domains["'][^\]]*["']architectures["']/s,
  );
  assert.match(workbench, /domains:\s*context\.domains/);
  assert.match(workbench, /architectures:\s*context\.architectures/);
  assert.match(workbench, /domains:\s*\{[\s\S]*?label:\s*["']Domain["']/);
  assert.match(
    workbench,
    /architectures:\s*\{[\s\S]*?label:\s*["']Architecture["']/,
  );
  assert.match(dashboard, /<ArtifactWorkbench\b/);
  assert.match(page, /workspaceRelations\s*=\s*\[[^\]]*["']domains["'][^\]]*["']architectures["']/s);
});
