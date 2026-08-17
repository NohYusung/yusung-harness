const assert = require("node:assert/strict");
const { existsSync, readFileSync, readdirSync } = require("node:fs");
const { join, relative } = require("node:path");
const test = require("node:test");

const repositoryRoot = join(__dirname, "..", "..", "..");
const absolute = (path) => join(repositoryRoot, path);
const read = (path) => readFileSync(absolute(path), "utf8");
const canonicalSections = [
  "Research Metadata",
  "Problem and Audience",
  "Expected Value and Success Signals",
  "Goals and Non-goals",
  "Verified Findings",
  "Hypotheses and Assumptions",
  "Alternatives and Provisional Preference",
  "Decisions and Open Questions",
  "Sources",
  "Next Step",
];
const canonicalSectionBlock = canonicalSections.join("\n");

const collectFiles = (directory) => {
  const files = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) files.push(...collectFiles(path));
    else files.push(path);
  }

  return files;
};

test("legacy Draft skill·agent·policy와 runtime domain은 제거된다", () => {
  for (const path of [
    ".codex/skills/draft/SKILL.md",
    ".agents/agents/drafter.md",
    ".codex/agents/doc-curator/references/yusung-harness-doc-Draft.md",
    "apps/server/src/services/drafts",
  ]) {
    assert.equal(existsSync(absolute(path)), false, `${path}는 제거되어야 한다`);
  }
});

test("Research 정본과 저장 정책은 exact 10개 H2 section을 같은 순서로 고정한다", () => {
  for (const path of [
    ".codex/skills/research/SKILL.md",
    ".codex/agents/doc-curator/references/yusung-harness-doc-Research.md",
  ]) {
    assert.match(read(path), new RegExp(canonicalSectionBlock.replaceAll(" ", "\\s+")));
  }

  for (const path of [
    ".agents/skills/research/SKILL.md",
    ".codex/agents/researcher/researcher.md",
    ".agents/agents/researcher.md",
    ".codex/skills/plan/SKILL.md",
  ]) {
    const source = read(path);

    assert.match(
      source,
      /고정 H2|Research Metadata[\s\S]*Next Step/,
      `${path}는 Research의 fixed 10 H2 section 계약을 명시해야 한다`,
    );
  }
});

test("Research create·update·Project 저장 안전 계약은 skill·agent·doc-curator에서 일치한다", () => {
  const contractSources = [
    ".codex/skills/research/SKILL.md",
    ".agents/skills/research/SKILL.md",
    ".codex/agents/researcher/researcher.md",
    ".agents/agents/researcher.md",
    ".codex/agents/doc-curator/references/yusung-harness-doc-Research.md",
  ];

  for (const path of contractSources) {
    const source = read(path);

    assert.match(
      source,
      /(?:신규|새로운|create)[\s\S]{0,240}live/i,
      `${path}: create는 항상 live 검색해야 한다`,
    );
    assert.match(source, /7일/, `${path}: update evidence TTL은 7일이어야 한다`);
    for (const invalidationKey of ["scope", "claims?", "versions?", "regions?"]) {
      assert.match(
        source,
        new RegExp(`\\b${invalidationKey}\\b`, "i"),
        `${path}: ${invalidationKey} 변경은 evidence를 무효화해야 한다`,
      );
    }
    assert.match(
      source,
      /Project[\s\S]{0,240}(?:저장하지|write.*(?:호출|요청)하지)|저장·수정[\s\S]{0,120}등록된 Project/i,
      `${path}: Project가 없으면 결과를 저장하지 않아야 한다`,
    );
  }
});

test("Research scope는 ordered minified JSON으로 canonicalize하고 byte-exact일 때만 재사용한다", () => {
  const semanticContractSources = [
    ".codex/skills/research/SKILL.md",
    ".agents/skills/research/SKILL.md",
    ".codex/agents/researcher/researcher.md",
    ".agents/agents/researcher.md",
    ".codex/agents/doc-curator/references/yusung-harness-doc-Research.md",
  ];
  const orderedEmptyScope =
    '{"claims":[],"include":[],"exclude":[],"versions":[],"regions":[]}';

  for (const path of semanticContractSources) {
    const source = read(path);

    assert.match(
      source,
      new RegExp(orderedEmptyScope.replace(/[{}[\]]/g, "\\$&")),
      `${path}: scope key는 claims/include/exclude/versions/regions 순서여야 한다`,
    );
    assert.match(source, /한 줄|one[- ]line/i, `${path}: scope는 한 줄이어야 한다`);
    assert.match(source, /minified/i, `${path}: scope는 minified JSON이어야 한다`);
    assert.match(source, /trim/i, `${path}: scope 배열 원소를 trim해야 한다`);
    assert.match(source, /dedupe|중복 제거/i, `${path}: scope 배열 원소를 dedupe해야 한다`);
    assert.match(source, /UTF-8/i, `${path}: scope 배열은 UTF-8 순서로 정렬해야 한다`);
    assert.match(
      source,
      /byte-exact/i,
      `${path}: 기존·신규 canonical scope가 byte-exact일 때만 evidence를 재사용해야 한다`,
    );
  }
});

test("Research 저장과 Plan 전환은 세 MCP 도구와 명시적 사용자 명령만 사용한다", () => {
  for (const path of [
    ".codex/skills/research/SKILL.md",
    ".agents/skills/research/SKILL.md",
    ".codex/agents/doc-curator/doc-curator.md",
    ".agents/agents/doc-curator.md",
    ".codex/agents/doc-curator/references/yusung-harness-doc-Research.md",
  ]) {
    const source = read(path);

    for (const tool of ["get_research", "create_research", "update_research"]) {
      assert.match(source, new RegExp(`\\b${tool}\\b`), `${path}: ${tool} 계약 누락`);
    }
  }

  for (const path of [
    ".codex/skills/research/SKILL.md",
    ".agents/skills/research/SKILL.md",
    ".codex/agents/planner/planner.md",
    ".agents/agents/planner.md",
  ]) {
    assert.match(
      read(path),
      /사용자[\s\S]{0,100}(?:명령|직접)[\s\S]{0,100}(?:Plan|전환)|(?:Plan|전환)[\s\S]{0,100}사용자[\s\S]{0,100}(?:명령|직접)/,
      `${path}: Plan 전환은 사용자 명령이 있어야 한다`,
    );
  }

  for (const path of [
    ".codex/agents/planner/planner.md",
    ".agents/agents/planner.md",
  ]) {
    const source = read(path);

    assert.doesNotMatch(source, /\bDraft\b|DraftMode|mode:\s*Draft/);
    assert.doesNotMatch(source, /^##\s+Draft\s*$/m);
  }
});

test("portable planner는 안정된 직접 요구사항이면 Research 문서 없이 Plan을 허용한다", () => {
  const planner = read(".agents/agents/planner.md");

  assert.match(
    planner,
    /사용자[\s\S]{0,100}안정된 구현 요구[\s\S]{0,100}범위[\s\S]{0,180}Research 문서가 없어도[\s\S]{0,100}Plan/,
  );
  assert.match(
    planner,
    /(?:문제|가치|핵심 범위)[\s\S]{0,100}불안정[\s\S]{0,100}Research[\s\S]{0,100}blocker/,
  );
});

test("README와 MCP runtime은 39-tool Research 계약만 노출한다", () => {
  const readme = read("README.md");
  const mcpService = read("apps/server/src/mcp/mcp.service.ts");
  const registeredTools = [
    ...mcpService.matchAll(/server\.registerTool\(\s*["']([^"']+)["']/g),
  ].map((match) => match[1]);

  assert.match(readme, /39개 MCP 도구/);
  for (const tool of ["get_research", "create_research", "update_research"]) {
    assert.match(readme, new RegExp(`\\b${tool}\\b`));
    assert.equal(registeredTools.includes(tool), true);
  }
  assert.equal(registeredTools.length, 39);
  assert.equal(registeredTools.includes("get_draft"), false);
  assert.equal(registeredTools.includes("create_draft"), false);
});

test("current runtime의 Draft 참조는 없고 historical migration·test 참조만 allowlist한다", () => {
  const runtimeRoots = [
    "apps/server/src",
    "apps/web/src",
    ".codex/agents",
    ".codex/skills",
    ".agents/agents",
    ".agents/skills",
  ];
  const violations = [];

  for (const root of runtimeRoots) {
    for (const file of collectFiles(absolute(root))) {
      const repositoryPath = relative(repositoryRoot, file);

      if (/\.test\.[cm]?[jt]sx?$/.test(file)) continue;
      if (/\b(?:Drafts?|drafter)\b/i.test(readFileSync(file, "utf8"))) {
        violations.push(repositoryPath);
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    "Draft는 historical migration 또는 test에서만 언급할 수 있다",
  );
});
