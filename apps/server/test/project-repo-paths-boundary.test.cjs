const assert = require("node:assert/strict");
const {
  mkdtempSync,
  readFileSync,
  rmSync,
} = require("node:fs");
const { execFileSync } = require("node:child_process");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const test = require("node:test");

const serverRoot = join(__dirname, "..");
const schemaPath = join(serverRoot, "prisma", "schema.prisma");
const migrationPath = join(
  serverRoot,
  "prisma",
  "migrations",
  "20260723000000_project_repo_paths",
  "migration.sql",
);

test("Project는 여러 repository 경로를 정규화된 relation으로 소유한다", () => {
  const schema = readFileSync(schemaPath, "utf8");
  const projectModel = schema.match(/model Project \{[\s\S]*?\n\}/)?.[0];
  const repositoryModel = schema.match(
    /model ProjectRepository \{[\s\S]*?\n\}/,
  )?.[0];

  assert.ok(projectModel, "Project model이 존재해야 한다");
  assert.ok(repositoryModel, "ProjectRepository model이 존재해야 한다");
  assert.doesNotMatch(projectModel, /\bAGENT\b/);
  assert.match(projectModel, /\brepoPaths\s+ProjectRepository\[\]/);
  assert.doesNotMatch(projectModel, /\brepoPath\s+String\b/);
  assert.doesNotMatch(projectModel, /\brepoType\s+RepoType\b/);
  assert.match(repositoryModel, /\bprojectId\s+Int\b/);
  assert.match(repositoryModel, /\bpath\s+String\b/);
  assert.match(repositoryModel, /\brepoType\s+RepoType\b/);
  assert.match(
    repositoryModel,
    /@relation\(fields:\s*\[projectId\],\s*references:\s*\[id\],\s*onDelete:\s*Cascade\)/,
  );
  assert.match(repositoryModel, /@@unique\(\[path, repoType\]\)/);
  assert.match(repositoryModel, /@@index\(\[projectId\]\)/);
});

test("repoPaths migration은 기존 단일 경로를 손실 없이 relation으로 변환한다", () => {
  const migration = readFileSync(migrationPath, "utf8");
  const directory = mkdtempSync(join(tmpdir(), "project-repo-paths-"));
  const databasePath = join(directory, "migration.db");

  try {
    execFileSync("/usr/bin/sqlite3", [databasePath], {
      input: `
        PRAGMA foreign_keys=ON;
        CREATE TABLE "Project" (
          "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          "title" TEXT NOT NULL,
          "repoPath" TEXT NOT NULL,
          "repoType" TEXT NOT NULL,
          "description" TEXT NOT NULL
        );
        CREATE UNIQUE INDEX "Project_repoPath_repoType_key"
          ON "Project"("repoPath", "repoType");
        CREATE TABLE "Plan" (
          "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          "projectId" INTEGER NOT NULL,
          CONSTRAINT "Plan_projectId_fkey"
            FOREIGN KEY ("projectId") REFERENCES "Project" ("id")
            ON DELETE RESTRICT ON UPDATE CASCADE
        );
        INSERT INTO "Project" ("id", "title", "repoPath", "repoType", "description")
        VALUES (1, 'Harness', '/workspace/harness-backend', 'LOCAL', 'Harness project');
        INSERT INTO "Plan" ("id", "projectId") VALUES (1, 1);
      `,
    });
    execFileSync("/usr/bin/sqlite3", [databasePath], { input: migration });

    const repository = execFileSync(
      "/usr/bin/sqlite3",
      [
        "-separator",
        "|",
        databasePath,
        `SELECT "projectId", "path", "repoType" FROM "ProjectRepository";`,
      ],
      { encoding: "utf8" },
    ).trim();
    const removedProjectColumns = execFileSync(
      "/usr/bin/sqlite3",
      [
        databasePath,
        `SELECT name FROM pragma_table_info('Project') WHERE name IN ('repoPath', 'repoType');`,
      ],
      { encoding: "utf8" },
    ).trim();
    const foreignKeyViolations = execFileSync(
      "/usr/bin/sqlite3",
      [databasePath, "PRAGMA foreign_key_check;"],
      { encoding: "utf8" },
    ).trim();
    const uniqueIndex = execFileSync(
      "/usr/bin/sqlite3",
      [
        databasePath,
        `SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'ProjectRepository_path_repoType_key';`,
      ],
      { encoding: "utf8" },
    ).trim();

    assert.equal(repository, "1|/workspace/harness-backend|LOCAL");
    assert.equal(removedProjectColumns, "");
    assert.equal(foreignKeyViolations, "");
    assert.equal(uniqueIndex, "ProjectRepository_path_repoType_key");

    assert.throws(() =>
      execFileSync(
        "/usr/bin/sqlite3",
        [
          databasePath,
          `
          INSERT INTO "Project" ("id", "title", "description")
          VALUES (2, 'Duplicate repo', 'Duplicate repo project');
          INSERT INTO "ProjectRepository" ("projectId", "path", "repoType")
          VALUES (2, '/workspace/harness-backend', 'LOCAL');
        `,
        ],
        { stdio: "ignore" },
      ),
    );

    execFileSync("/usr/bin/sqlite3", [databasePath], {
      input: `
        PRAGMA foreign_keys=ON;
        DELETE FROM "Plan" WHERE "projectId" = 1;
        DELETE FROM "Project" WHERE "id" = 1;
      `,
    });
    const repositoryCount = execFileSync(
      "/usr/bin/sqlite3",
      [databasePath, `SELECT COUNT(*) FROM "ProjectRepository" WHERE "projectId" = 1;`],
      { encoding: "utf8" },
    ).trim();

    assert.equal(repositoryCount, "0");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
