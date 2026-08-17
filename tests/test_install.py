from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import install as installer


class FakeRunner:
    def __init__(self, install_returncode: int = 0) -> None:
        self.install_returncode = install_returncode
        self.calls: list[tuple[tuple[str, ...], Path]] = []

    def __call__(
        self,
        command: tuple[str, ...],
        cwd: Path,
    ) -> subprocess.CompletedProcess[str]:
        self.calls.append((command, cwd))

        if command == ("node", "--version"):
            return subprocess.CompletedProcess(command, 0, "v22.23.1\n", "")
        if command == ("pnpm", "--version"):
            return subprocess.CompletedProcess(command, 0, "11.7.0\n", "")
        if command == ("pnpm", "install", "--frozen-lockfile"):
            return subprocess.CompletedProcess(
                command,
                self.install_returncode,
                "",
                "dependency failure" if self.install_returncode else "",
            )

        raise AssertionError(f"unexpected command: {command}")

    @property
    def dependency_calls(self) -> list[tuple[tuple[str, ...], Path]]:
        return [
            call
            for call in self.calls
            if call[0] == ("pnpm", "install", "--frozen-lockfile")
        ]


class InstallerTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.temp_root = Path(self.temp_dir.name)
        self.source = self.temp_root / "source"
        self.target = self.temp_root / "target"
        self._create_source()
        self.source_patch = mock.patch.object(installer, "SOURCE_ROOT", self.source)
        self.source_patch.start()
        self.addCleanup(self.source_patch.stop)

    def _write(self, relative: str, content: str) -> Path:
        path = self.source / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        return path

    def _create_source(self) -> None:
        self._write("AGENTS.md", "# target agent rules\n")
        self._write("docs/guide.md", "# guide\n")
        self._write("docs/obsolete.md", "obsolete\n")
        self._write(".codex/config.toml", "model = \"gpt-5\"\n")
        self._write(
            ".codex/integration.toml",
            "schema_version = 1\n"
            "configured = true\n"
            'branch_prefix = "codex/"\n'
            'management_root = ".yusung-harness"\n'
            'merge_strategy = "no-ff"\n'
            'cleanup = "worktree-and-branch"\n'
            'conflict_policy = "evidence-only"\n',
        )
        self._write(
            ".codex/skills/integration/scripts/worktree.py",
            "print('worktree engine')\n",
        )
        self._write(
            ".codex/skills/integration/scripts/merge.py",
            "print('merge engine')\n",
        )
        self._write(
            ".codex/agents/doc-curator/doc-curator.toml",
            "[mcp_servers.yusung-harness-doc]\n"
            'url = "http://127.0.0.1:4000/mcp"\n',
        )
        self._write("apps/.gitignore", "**/node_modules/\n**/dist/\n")
        self._write(
            "apps/package.json",
            json.dumps(
                {
                    "name": "@yusung-harness-doc/apps",
                    "private": True,
                    "packageManager": "pnpm@11.7.0",
                    "engines": {"node": ">=22"},
                    "scripts": {"dev": "pnpm --recursive run dev"},
                }
            ),
        )
        self._write("apps/pnpm-lock.yaml", "lockfileVersion: '9.0'\n")
        self._write("apps/pnpm-workspace.yaml", "packages:\n  - server\n  - web\n")
        self._write(
            "apps/server/package.json",
            json.dumps(
                {
                    "name": "@yusung-harness-doc/server",
                    "scripts": {"dev": "nest start --watch"},
                }
            ),
        )
        self._write("apps/server/src/main.ts", "export const port = 4000;\n")
        self._write(
            "apps/server/.env.example",
            'DATABASE_URL="file:./harness-board.db"\nPORT=4000\n',
        )
        self._write(
            "apps/web/package.json",
            json.dumps(
                {
                    "name": "@yusung-harness-doc/web",
                    "scripts": {"dev": "next dev"},
                }
            ),
        )
        self._write("apps/web/src/app/page.tsx", "export default function Page() {}\n")
        self._write(
            "apps/web/.env.example",
            'HARNESS_API_URL="http://127.0.0.1:4000"\n'
            'HARNESS_MCP_URL="http://127.0.0.1:4000/mcp"\n',
        )

        self._write("apps/server/.env", "SOURCE_SECRET=do-not-copy\n")
        self._write("apps/web/.env.local", "SOURCE_SECRET=do-not-copy\n")
        self._write("apps/server/prisma/harness-board.db", "database\n")
        self._write("apps/server/node_modules/pkg/index.js", "generated\n")
        self._write("apps/server/dist/main.js", "generated\n")
        self._write("apps/web/.next/server/app.js", "generated\n")
        self._write("apps/web/next-env.d.ts", "generated\n")
        self._write("apps/web/.DS_Store", "noise\n")

    def _options(self, **overrides: object) -> installer.InstallOptions:
        values: dict[str, object] = {
            "target": self.target,
            "profile": "codex",
            "dry_run": False,
            "force": False,
            "backup": False,
            "sync": False,
        }
        values.update(overrides)
        return installer.InstallOptions(**values)

    def test_fresh_install_copies_codex_and_apps_and_prepares_dependencies(self) -> None:
        runner = FakeRunner()

        result = installer.install(self._options(), runner=runner)

        self.assertEqual(result, 0)
        self.assertEqual(
            (self.target / "AGENTS.md").read_text(encoding="utf-8"),
            "# target agent rules\n",
        )
        self.assertTrue(self.target.joinpath("apps/server/src/main.ts").is_file())
        self.assertTrue(self.target.joinpath("apps/web/src/app/page.tsx").is_file())
        self.assertEqual(
            self.target.joinpath("apps/server/.env").read_text(encoding="utf-8"),
            'DATABASE_URL="file:./harness-board.db"\nPORT=4000\n',
        )
        self.assertEqual(
            self.target.joinpath("apps/web/.env.local").read_text(encoding="utf-8"),
            'HARNESS_API_URL="http://127.0.0.1:4000"\n'
            'HARNESS_MCP_URL="http://127.0.0.1:4000/mcp"\n',
        )
        self.assertFalse(self.target.joinpath("apps/server/prisma/harness-board.db").exists())
        self.assertFalse(self.target.joinpath("apps/server/dist").exists())
        self.assertFalse(self.target.joinpath("apps/web/.next").exists())
        self.assertFalse(self.target.joinpath("apps/web/next-env.d.ts").exists())
        self.assertFalse(self.target.joinpath("apps/web/.DS_Store").exists())
        self.assertEqual(
            runner.dependency_calls,
            [(('pnpm', 'install', '--frozen-lockfile'), self.target / "apps")],
        )
        self.assertTrue(
            self.target.joinpath(".yusung-harness/install-manifest.json").is_file()
        )
        self.assertEqual(
            self.target.joinpath(
                ".codex/skills/integration/scripts/worktree.py"
            ).read_text(encoding="utf-8"),
            "print('worktree engine')\n",
        )
        self.assertFalse(
            self.target.joinpath(".codex/skills/code/scripts/worktree.py").exists()
        )
        self.assertEqual(
            self.target.joinpath(
                ".codex/skills/integration/scripts/merge.py"
            ).read_text(encoding="utf-8"),
            "print('merge engine')\n",
        )
        installed_integration_config = self.target.joinpath(
            ".codex/integration.toml"
        ).read_text(encoding="utf-8")
        self.assertIn("schema_version = 1", installed_integration_config)
        self.assertIn("configured = false", installed_integration_config)
        self.assertNotIn("configured = true", installed_integration_config)
        self.assertEqual(
            self.target.joinpath(".yusung-harness/.gitignore").read_text(
                encoding="utf-8"
            ),
            "*\n!.gitignore\n",
        )

    def test_existing_environment_and_runtime_files_are_preserved(self) -> None:
        server_env = self.target / "apps/server/.env"
        web_env = self.target / "apps/web/.env.local"
        database = self.target / "apps/server/prisma/harness-board.db"
        generated = self.target / "apps/server/dist/custom.js"
        for path, content in (
            (server_env, "CUSTOM_SERVER=true\n"),
            (web_env, "CUSTOM_WEB=true\n"),
            (database, "user database\n"),
            (generated, "user build\n"),
        ):
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")

        result = installer.install(
            self._options(force=True, backup=True, sync=True),
            runner=FakeRunner(),
        )

        self.assertEqual(result, 0)
        self.assertEqual(server_env.read_text(encoding="utf-8"), "CUSTOM_SERVER=true\n")
        self.assertEqual(web_env.read_text(encoding="utf-8"), "CUSTOM_WEB=true\n")
        self.assertEqual(database.read_text(encoding="utf-8"), "user database\n")
        self.assertEqual(generated.read_text(encoding="utf-8"), "user build\n")

    def test_git_target_gets_idempotent_managed_info_exclude_guard(self) -> None:
        self.target.mkdir()
        subprocess.run(
            ["git", "init", "--quiet", "--initial-branch=main", str(self.target)],
            check=True,
        )
        exclude = self.target / ".git" / "info" / "exclude"
        exclude.write_text("*.local\n", encoding="utf-8")

        first = installer.install(self._options(), runner=FakeRunner())
        second = installer.install(self._options(), runner=FakeRunner())

        self.assertEqual(first, 0)
        self.assertEqual(second, 0)
        content = exclude.read_text(encoding="utf-8")
        self.assertIn("*.local\n", content)
        self.assertEqual(content.count("# BEGIN yusung-harness managed"), 1)
        self.assertEqual(content.count("/.worktree/"), 1)
        self.assertEqual(content.count("/.yusung-harness/"), 1)
        self.assertEqual(content.count("# END yusung-harness managed"), 1)

    def test_git_target_upgrades_single_entry_managed_exclude_guard(self) -> None:
        self.target.mkdir()
        subprocess.run(
            ["git", "init", "--quiet", "--initial-branch=main", str(self.target)],
            check=True,
        )
        exclude = self.target / ".git" / "info" / "exclude"
        exclude.write_text(
            "*.local\n"
            "# BEGIN yusung-harness managed\n"
            "/.yusung-harness/\n"
            "# END yusung-harness managed\n",
            encoding="utf-8",
        )

        result = installer.install(self._options(), runner=FakeRunner())

        self.assertEqual(result, 0)
        content = exclude.read_text(encoding="utf-8")
        self.assertIn("*.local\n", content)
        self.assertEqual(content.count("# BEGIN yusung-harness managed"), 1)
        self.assertEqual(content.count("/.worktree/"), 1)
        self.assertEqual(content.count("/.yusung-harness/"), 1)
        self.assertEqual(content.count("# END yusung-harness managed"), 1)

    def test_update_preserves_project_config_and_updates_integration_scripts(self) -> None:
        self.target.mkdir()
        subprocess.run(
            ["git", "init", "--quiet", "--initial-branch=main", str(self.target)],
            check=True,
        )
        self.assertEqual(installer.install(self._options(), runner=FakeRunner()), 0)
        target_config = self.target / ".codex" / "integration.toml"
        configured = target_config.read_text(encoding="utf-8").replace(
            "configured = false",
            "configured = true",
        )
        target_config.write_text(configured, encoding="utf-8")
        source_merge = self.source / ".codex/skills/integration/scripts/merge.py"
        source_merge.write_text("print('merge engine v2')\n", encoding="utf-8")

        result = installer.install(
            self._options(force=True, backup=True, sync=True),
            runner=FakeRunner(),
        )

        self.assertEqual(result, 0)
        self.assertIn("configured = true", target_config.read_text(encoding="utf-8"))
        self.assertEqual(
            self.target.joinpath(
                ".codex/skills/integration/scripts/merge.py"
            ).read_text(encoding="utf-8"),
            "print('merge engine v2')\n",
        )
        backups = list(
            self.target.joinpath(".yusung-harness/backups").glob(
                "*/.codex/skills/integration/scripts/merge.py"
            )
        )
        self.assertEqual(len(backups), 1)

    def test_malformed_managed_info_exclude_block_is_a_prewrite_conflict(self) -> None:
        self.target.mkdir()
        subprocess.run(
            ["git", "init", "--quiet", "--initial-branch=main", str(self.target)],
            check=True,
        )
        exclude = self.target / ".git" / "info" / "exclude"
        original = (
            "# BEGIN yusung-harness managed\n"
            "/.worktree/\n"
            "/wrong-management-root/\n"
            "# END yusung-harness managed\n"
        )
        exclude.write_text(original, encoding="utf-8")
        runner = FakeRunner()

        result = installer.install(self._options(), runner=runner)

        self.assertEqual(result, 1)
        self.assertEqual(exclude.read_text(encoding="utf-8"), original)
        self.assertFalse(self.target.joinpath("AGENTS.md").exists())
        self.assertEqual(runner.dependency_calls, [])

    def test_sync_backs_up_and_removes_unchanged_obsolete_integration_script(self) -> None:
        self.assertEqual(installer.install(self._options(), runner=FakeRunner()), 0)
        obsolete_source = self.source / ".codex/skills/integration/scripts/merge.py"
        obsolete_source.unlink()

        result = installer.install(self._options(sync=True), runner=FakeRunner())

        self.assertEqual(result, 0)
        installed = self.target / ".codex/skills/integration/scripts/merge.py"
        self.assertFalse(installed.exists())
        backups = list(
            self.target.joinpath(".yusung-harness/backups").glob(
                "*/.codex/skills/integration/scripts/merge.py"
            )
        )
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].read_text(encoding="utf-8"), "print('merge engine')\n")

    def test_sync_migrates_unchanged_old_code_worktree_engine_to_integration(
        self,
    ) -> None:
        canonical_source = (
            self.source / ".codex/skills/integration/scripts/worktree.py"
        )
        engine_content = canonical_source.read_text(encoding="utf-8")
        canonical_source.unlink()
        old_source = self._write(
            ".codex/skills/code/scripts/worktree.py",
            engine_content,
        )
        self.assertEqual(installer.install(self._options(), runner=FakeRunner()), 0)
        old_target = self.target / ".codex/skills/code/scripts/worktree.py"
        self.assertEqual(old_target.read_text(encoding="utf-8"), engine_content)

        old_source.unlink()
        canonical_source.parent.mkdir(parents=True, exist_ok=True)
        canonical_source.write_text(engine_content, encoding="utf-8")

        result = installer.install(self._options(sync=True), runner=FakeRunner())

        self.assertEqual(result, 0)
        self.assertFalse(old_target.exists())
        self.assertEqual(
            self.target.joinpath(
                ".codex/skills/integration/scripts/worktree.py"
            ).read_text(encoding="utf-8"),
            engine_content,
        )
        backups = list(
            self.target.joinpath(".yusung-harness/backups").glob(
                "*/.codex/skills/code/scripts/worktree.py"
            )
        )
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].read_text(encoding="utf-8"), engine_content)

    def test_sync_preserves_modified_old_code_worktree_engine(self) -> None:
        canonical_source = (
            self.source / ".codex/skills/integration/scripts/worktree.py"
        )
        engine_content = canonical_source.read_text(encoding="utf-8")
        canonical_source.unlink()
        old_source = self._write(
            ".codex/skills/code/scripts/worktree.py",
            engine_content,
        )
        self.assertEqual(installer.install(self._options(), runner=FakeRunner()), 0)
        old_target = self.target / ".codex/skills/code/scripts/worktree.py"
        old_target.write_text("user-modified engine\n", encoding="utf-8")

        old_source.unlink()
        canonical_source.parent.mkdir(parents=True, exist_ok=True)
        canonical_source.write_text(engine_content, encoding="utf-8")

        result = installer.install(
            self._options(sync=True, force=True),
            runner=FakeRunner(),
        )

        self.assertEqual(result, 1)
        self.assertEqual(
            old_target.read_text(encoding="utf-8"),
            "user-modified engine\n",
        )
        self.assertFalse(
            self.target.joinpath(
                ".codex/skills/integration/scripts/worktree.py"
            ).exists()
        )

    def test_conflict_aborts_before_any_other_write_or_dependency_install(self) -> None:
        self.target.mkdir()
        self.target.joinpath("AGENTS.md").write_text("custom\n", encoding="utf-8")
        runner = FakeRunner()

        result = installer.install(self._options(), runner=runner)

        self.assertEqual(result, 1)
        self.assertEqual(
            self.target.joinpath("AGENTS.md").read_text(encoding="utf-8"),
            "custom\n",
        )
        self.assertFalse(self.target.joinpath("docs").exists())
        self.assertFalse(self.target.joinpath("apps").exists())
        self.assertEqual(runner.dependency_calls, [])

    def test_force_with_backup_updates_changed_file(self) -> None:
        self.target.mkdir()
        self.target.joinpath("AGENTS.md").write_text("custom\n", encoding="utf-8")

        result = installer.install(
            self._options(force=True, backup=True),
            runner=FakeRunner(),
        )

        self.assertEqual(result, 0)
        self.assertEqual(
            self.target.joinpath("AGENTS.md").read_text(encoding="utf-8"),
            "# target agent rules\n",
        )
        backups = list(
            self.target.joinpath(".yusung-harness/backups").glob("*/AGENTS.md")
        )
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].read_text(encoding="utf-8"), "custom\n")

    def test_sync_removes_only_unchanged_manifest_owned_stale_file(self) -> None:
        first_runner = FakeRunner()
        self.assertEqual(installer.install(self._options(), runner=first_runner), 0)
        self.source.joinpath("docs/obsolete.md").unlink()

        result = installer.install(self._options(sync=True), runner=FakeRunner())

        self.assertEqual(result, 0)
        self.assertFalse(self.target.joinpath("docs/obsolete.md").exists())
        backups = list(
            self.target.joinpath(".yusung-harness/backups").glob(
                "*/docs/obsolete.md"
            )
        )
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].read_text(encoding="utf-8"), "obsolete\n")

    def test_sync_preserves_modified_manifest_owned_stale_file(self) -> None:
        self.assertEqual(installer.install(self._options(), runner=FakeRunner()), 0)
        self.source.joinpath("docs/obsolete.md").unlink()
        target_file = self.target / "docs/obsolete.md"
        target_file.write_text("user change\n", encoding="utf-8")
        runner = FakeRunner()

        result = installer.install(self._options(sync=True, force=True), runner=runner)

        self.assertEqual(result, 1)
        self.assertEqual(target_file.read_text(encoding="utf-8"), "user change\n")
        self.assertEqual(runner.dependency_calls, [])

    def test_sync_secures_all_backups_before_removing_any_stale_file(self) -> None:
        self._write("docs/obsolete-two.md", "obsolete two\n")
        self.assertEqual(installer.install(self._options(), runner=FakeRunner()), 0)
        self.source.joinpath("docs/obsolete.md").unlink()
        self.source.joinpath("docs/obsolete-two.md").unlink()
        original_backup = installer.backup_file
        backup_calls = 0

        def fail_second_backup(*args: object, **kwargs: object) -> None:
            nonlocal backup_calls
            backup_calls += 1
            if backup_calls == 2:
                raise OSError("simulated backup failure")
            original_backup(*args, **kwargs)

        with mock.patch.object(
            installer,
            "backup_file",
            side_effect=fail_second_backup,
        ):
            result = installer.install(
                self._options(sync=True),
                runner=FakeRunner(),
            )

        self.assertEqual(result, 1)
        self.assertTrue(self.target.joinpath("docs/obsolete.md").is_file())
        self.assertTrue(self.target.joinpath("docs/obsolete-two.md").is_file())

    def test_sync_revalidates_targets_after_all_backups(self) -> None:
        self._write("docs/obsolete-two.md", "obsolete two\n")
        self.assertEqual(installer.install(self._options(), runner=FakeRunner()), 0)
        self.source.joinpath("docs/obsolete.md").unlink()
        self.source.joinpath("docs/obsolete-two.md").unlink()
        original_backup = installer.backup_file
        backup_calls = 0

        def mutate_after_second_backup(*args: object, **kwargs: object) -> None:
            nonlocal backup_calls
            original_backup(*args, **kwargs)
            backup_calls += 1
            if backup_calls == 2:
                self.target.joinpath("docs/obsolete.md").write_text(
                    "concurrent user change\n",
                    encoding="utf-8",
                )

        with mock.patch.object(
            installer,
            "backup_file",
            side_effect=mutate_after_second_backup,
        ):
            result = installer.install(
                self._options(sync=True),
                runner=FakeRunner(),
            )

        self.assertEqual(result, 1)
        self.assertEqual(
            self.target.joinpath("docs/obsolete.md").read_text(encoding="utf-8"),
            "concurrent user change\n",
        )
        self.assertTrue(self.target.joinpath("docs/obsolete-two.md").is_file())

    def test_dry_run_does_not_create_target_or_install_dependencies(self) -> None:
        runner = FakeRunner()

        result = installer.install(self._options(dry_run=True), runner=runner)

        self.assertEqual(result, 0)
        self.assertFalse(self.target.exists())
        self.assertEqual(runner.dependency_calls, [])

    def test_dependency_failure_records_failed_state_and_returns_three(self) -> None:
        result = installer.install(
            self._options(),
            runner=FakeRunner(install_returncode=17),
        )

        self.assertEqual(result, 3)
        manifest = json.loads(
            self.target.joinpath(".yusung-harness/install-manifest.json").read_text(
                encoding="utf-8"
            )
        )
        self.assertEqual(manifest["dependencies"]["status"], "failed")

    def test_workspace_lifecycle_script_is_rejected_before_writes(self) -> None:
        package_path = self.source / "apps/package.json"
        package = json.loads(package_path.read_text(encoding="utf-8"))
        package["scripts"]["prepare"] = "node forbidden.js"
        package_path.write_text(json.dumps(package), encoding="utf-8")
        runner = FakeRunner()

        result = installer.install(self._options(), runner=runner)

        self.assertEqual(result, 3)
        self.assertFalse(self.target.exists())
        self.assertEqual(runner.dependency_calls, [])

    def test_target_inside_source_is_rejected(self) -> None:
        nested_target = self.source / "nested-target"

        result = installer.install(
            self._options(target=nested_target),
            runner=FakeRunner(),
        )

        self.assertEqual(result, 1)
        self.assertFalse(nested_target.exists())

    def test_tracked_inventory_requires_source_to_be_git_root(self) -> None:
        parent_repository = self.temp_root / "parent-repository"
        completed = subprocess.CompletedProcess(
            ("git", "rev-parse", "--show-toplevel"),
            0,
            f"{parent_repository}\n",
            "",
        )

        with mock.patch.object(installer.subprocess, "run", return_value=completed):
            result = installer.git_tracked_app_files()

        self.assertIsNone(result)

    def test_destination_symlink_is_rejected(self) -> None:
        outside = self.temp_root / "outside"
        outside.mkdir()
        self.target.mkdir()
        self.target.joinpath("apps").symlink_to(outside, target_is_directory=True)

        result = installer.install(self._options(force=True), runner=FakeRunner())

        self.assertEqual(result, 1)
        self.assertEqual(list(outside.iterdir()), [])

    def test_parse_args_accepts_only_legacy_codex_profile(self) -> None:
        options = installer.parse_args([str(self.target), "--profile", "codex"])
        self.assertEqual(options.profile, "codex")

        with self.assertRaises(SystemExit) as invalid_profile:
            installer.parse_args([str(self.target), "--profile", "agents"])
        self.assertEqual(invalid_profile.exception.code, 2)

        with self.assertRaises(SystemExit) as invalid_backup:
            installer.parse_args([str(self.target), "--backup"])
        self.assertEqual(invalid_backup.exception.code, 2)


class RepositoryPolicyInstallTest(unittest.TestCase):
    def test_current_agent_recursion_policy_is_installed_verbatim(self) -> None:
        repository_root = Path(__file__).resolve().parents[1]
        policy_heading = "## 에이전트 호출 경계"
        policy_paths = [Path("AGENTS.md")]
        policy_paths.extend(
            sorted(
                path.relative_to(repository_root)
                for path in repository_root.glob(".codex/agents/*/*.*")
                if path.suffix in {".md", ".toml"}
            )
        )
        policy_paths.extend(
            sorted(
                path.relative_to(repository_root)
                for path in repository_root.glob(".codex/skills/*/SKILL.md")
                if policy_heading in path.read_text(encoding="utf-8")
            )
        )
        self.assertEqual(len(policy_paths), 27)

        with tempfile.TemporaryDirectory() as temp_dir:
            target = Path(temp_dir) / "installed"
            options = installer.InstallOptions(target=target)
            with mock.patch.object(installer, "SOURCE_ROOT", repository_root):
                result = installer.install(options, runner=FakeRunner())

            self.assertEqual(result, 0)
            for relative in policy_paths:
                with self.subTest(relative=str(relative)):
                    source_content = repository_root.joinpath(relative).read_bytes()
                    installed_content = target.joinpath(relative).read_bytes()
                    self.assertEqual(installed_content, source_content)

    def test_current_integration_engine_payload_installs_with_unconfigured_template(self) -> None:
        repository_root = Path(__file__).resolve().parents[1]
        script_paths = (
            Path(".codex/skills/integration/scripts/worktree.py"),
            Path(".codex/skills/integration/scripts/merge.py"),
        )
        for relative in script_paths:
            self.assertTrue(repository_root.joinpath(relative).is_file())
        self.assertFalse(
            repository_root.joinpath(
                ".codex/skills/code/scripts/worktree.py"
            ).exists()
        )
        source_config = repository_root.joinpath(".codex/integration.toml")
        self.assertIn("configured = true", source_config.read_text(encoding="utf-8"))

        with tempfile.TemporaryDirectory() as temp_dir:
            target = Path(temp_dir) / "installed"
            options = installer.InstallOptions(target=target)
            with mock.patch.object(installer, "SOURCE_ROOT", repository_root):
                result = installer.install(options, runner=FakeRunner())

            self.assertEqual(result, 0)
            for relative in script_paths:
                self.assertEqual(
                    target.joinpath(relative).read_bytes(),
                    repository_root.joinpath(relative).read_bytes(),
                )
            self.assertFalse(
                target.joinpath(".codex/skills/code/scripts/worktree.py").exists()
            )
            installed_config = target.joinpath(".codex/integration.toml").read_text(
                encoding="utf-8"
            )
            self.assertIn("configured = false", installed_config)
            self.assertNotIn("configured = true", installed_config)


if __name__ == "__main__":
    unittest.main()
