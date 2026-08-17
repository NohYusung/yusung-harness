const assert = require("node:assert/strict");
const { existsSync, readFileSync, readdirSync, statSync } = require("node:fs");
const { join, relative } = require("node:path");
const test = require("node:test");

const repositoryRoot = join(__dirname, "..", "..", "..");
const skillsRoot = join(repositoryRoot, ".codex", "skills");
const removedMetadataPaths = [
  join(skillsRoot, "design", "agents", "openai.yaml"),
  join(skillsRoot, "draft", "agents", "openai.yaml"),
];

const currentSkillNames = () =>
  readdirSync(skillsRoot)
    .filter((name) => {
      const directory = join(skillsRoot, name);
      return (
        statSync(directory).isDirectory() &&
        existsSync(join(directory, "SKILL.md"))
      );
    })
    .sort();

const metadataSkillNames = () =>
  readdirSync(skillsRoot)
    .filter((name) => {
      const directory = join(skillsRoot, name);
      return (
        statSync(directory).isDirectory() &&
        existsSync(join(directory, "agents", "openai.yaml"))
      );
    })
    .sort();

test("existing skill agent metadata disables implicit invocation", () => {
  for (const skillName of metadataSkillNames()) {
    const metadataPath = join(skillsRoot, skillName, "agents", "openai.yaml");
    const content = readFileSync(metadataPath, "utf8");

    assert.match(
      content,
      /^\s*allow_implicit_invocation\s*:\s*false\s*(?:#.*)?$/m,
      `${relative(repositoryRoot, metadataPath)} must disable implicit invocation`,
    );
    assert.doesNotMatch(
      content,
      /^\s*allow_implicit_invocation\s*:\s*(?:true|["']true["'])/m,
    );
  }
});

test("metadata is either absent or complete for every current skill", () => {
  const skills = currentSkillNames();
  const metadataSkills = metadataSkillNames();

  if (metadataSkills.length === 0) {
    assert.deepEqual(metadataSkills, [], "zero metadata is a valid pre-cutover state");
    return;
  }

  assert.deepEqual(
    metadataSkills,
    skills,
    "partial skill agent metadata is forbidden once metadata rollout starts",
  );
});

test("removed design and draft agent metadata stays absent", () => {
  for (const metadataPath of removedMetadataPaths) {
    assert.equal(
      existsSync(metadataPath),
      false,
      `${relative(repositoryRoot, metadataPath)} must not return as an orphan`,
    );
  }
});
