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

test("ProjectWorkspaceNav server wrapper는 context를 primitive nav items로 축소한다", () => {
  const wrapper = source(
    "components/features/dashboard/ProjectWorkspaceNav.tsx",
  );

  assert.doesNotMatch(wrapper, /^[\s\S]*?["']use client["']/);
  assert.doesNotMatch(wrapper, /\buseEffect\b|\buseRef\b|scrollIntoView/);
  assert.match(wrapper, /import\s+type\s*\{\s*ProjectContext\s*\}/);
  assert.doesNotMatch(wrapper, /getLatestDomainErd|domain-erd/);
  assert.match(wrapper, /getLatestDeploymentArchitecture/);
  assert.match(
    wrapper,
    /label:\s*["']Plan["'][\s\S]*?label:\s*["']Draft["'][\s\S]*?label:\s*["']Domain["'][\s\S]*?label:\s*["']Architecture["'][\s\S]*?label:\s*["']Wireframe["'][\s\S]*?label:\s*["']Asset["'][\s\S]*?label:\s*["']Design["']/,
  );
  assert.match(wrapper, /context\.wireframes\.length/);
  assert.match(wrapper, /context\.domains\.length/);
  assert.match(wrapper, /context\.assets\.length/);
  assert.match(wrapper, /context\.designs\.length/);
  assert.match(wrapper, /<ProjectWorkspaceNavScroller\b/);
  assert.match(wrapper, /activeRelation=\{activeRelation\}/);
  assert.match(wrapper, /items=\{items\}/);
  assert.match(wrapper, /projectId=\{context\.id\}/);
});

test("ProjectWorkspaceNavScroller client leaf는 primitive props와 active reveal만 소유한다", () => {
  const scroller = source(
    "components/features/dashboard/ProjectWorkspaceNavScroller.tsx",
  );

  assert.match(scroller, /^\s*["']use client["']/);
  assert.match(scroller, /\buseEffect\b/);
  assert.match(scroller, /\buseRef\b/);
  assert.match(scroller, /scrollIntoView\s*\(/);
  assert.match(scroller, /block:\s*["']nearest["']/);
  assert.match(scroller, /inline:\s*["']nearest["']/);
  assert.match(scroller, /\bprojectId:\s*number/);
  assert.match(scroller, /\bactiveRelation:\s*WorkspaceRelation/);
  assert.match(
    scroller,
    /\bitems:\s*(?:readonly\s+ProjectWorkspaceNavItem\[\]|ReadonlyArray<ProjectWorkspaceNavItem>)/,
  );
  assert.match(scroller, /\bcount:\s*number/);
  assert.match(scroller, /\blabel:\s*string/);
  assert.match(scroller, /\brelation:\s*WorkspaceRelation/);
  assert.doesNotMatch(
    scroller,
    /ProjectContext|@\/types\/dashboard|domain-erd|deployment-architecture|\bfrom\s+["']zod["']/,
  );
});
