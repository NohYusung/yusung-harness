from __future__ import annotations

import json
import os
import ast
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any


SCRIPT_PATH = Path(__file__).with_name("worktree.py").resolve()
MERGE_SCRIPT_PATH = (
    Path(__file__).resolve().parents[2] / "integration" / "scripts" / "merge.py"
)


class WorktreeScriptTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary_directory.cleanup)
        self.repository = (
            Path(self.temporary_directory.name) / "repository"
        ).resolve()
        self.repository.mkdir()
        self.hooks = Path(self.temporary_directory.name, "empty-hooks").resolve()
        self.hooks.mkdir()

        self.git("init", "--quiet", "--initial-branch=main")
        self.git("config", "user.name", "Codex Test")
        self.git("config", "user.email", "codex@example.invalid")
        self.git("config", "commit.gpgsign", "false")
        self.git("config", "core.hooksPath", str(self.hooks))
        config = self.repository / ".codex" / "integration.toml"
        config.parent.mkdir(parents=True)
        prepare_source_argv = json.dumps(
            [sys.executable, "-c", "print('prepare source')"]
        )
        prepare_candidate_argv = json.dumps(
            [sys.executable, "-c", "print('prepare candidate')"]
        )
        targeted_argv = json.dumps(self.targeted_check()["argv"])
        test_argv = json.dumps([sys.executable, "-c", "print('test')"])
        typecheck_argv = json.dumps(
            [sys.executable, "-c", "print('typecheck')"]
        )
        lint_argv = json.dumps([sys.executable, "-c", "print('lint')"])
        build_argv = json.dumps([sys.executable, "-c", "print('build')"])
        config.write_text(
            "schema_version = 1\n"
            "configured = true\n"
            'branch_prefix = "codex/"\n'
            'management_root = ".yusung-harness"\n'
            'merge_strategy = "no-ff"\n'
            'cleanup = "worktree-and-branch"\n'
            'conflict_policy = "evidence-only"\n'
            'required_verification_categories = ["test", "typecheck", "lint", "build"]\n'
            "\n[verification.prepare.source]\n"
            'cwd = "."\n'
            f"argv = {prepare_source_argv}\n"
            "\n[verification.prepare.candidate]\n"
            'cwd = "."\n'
            f"argv = {prepare_candidate_argv}\n"
            "\n[verification.source.source-targeted]\n"
            'cwd = "."\n'
            f"argv = {targeted_argv}\n"
            "\n[verification.candidate.test]\n"
            'cwd = "."\n'
            f"argv = {test_argv}\n"
            "\n[verification.candidate.typecheck]\n"
            'cwd = "."\n'
            f"argv = {typecheck_argv}\n"
            "\n[verification.candidate.lint]\n"
            'cwd = "."\n'
            f"argv = {lint_argv}\n"
            "\n[verification.candidate.build]\n"
            'cwd = "."\n'
            f"argv = {build_argv}\n",
            encoding="utf-8",
        )
        (self.repository / "tracked.txt").write_text("base\n", encoding="utf-8")
        self.git("add", ".codex/integration.toml", "tracked.txt")
        self.git("commit", "--quiet", "-m", "Initial commit")

    @staticmethod
    def clean_environment() -> dict[str, str]:
        environment = os.environ.copy()
        for variable in (
            "GIT_DIR",
            "GIT_WORK_TREE",
            "GIT_INDEX_FILE",
            "GIT_OBJECT_DIRECTORY",
            "GIT_ALTERNATE_OBJECT_DIRECTORIES",
        ):
            environment.pop(variable, None)
        return environment

    def git(
        self,
        *arguments: str,
        check: bool = True,
    ) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["git", "-C", str(self.repository), *arguments],
            check=check,
            capture_output=True,
            text=True,
            env=self.clean_environment(),
        )

    def head(self, revision: str = "HEAD") -> str:
        return self.git("rev-parse", revision).stdout.strip()

    def targeted_check(self) -> dict[str, Any]:
        return {
            "name": "targeted-unit",
            "cwd": ".",
            "argv": [
                sys.executable,
                "-c",
                (
                    "import sys; from pathlib import Path; "
                    "print('literal:$() ; `not-shell`'); "
                    "raise SystemExit(9 if Path('fail-targeted').exists() else 0)"
                ),
            ],
        }

    def run_script(
        self,
        *arguments: str,
    ) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(SCRIPT_PATH), *arguments],
            check=False,
            capture_output=True,
            text=True,
            env=self.clean_environment(),
        )

    def run_python(
        self,
        script: Path,
        *arguments: str,
    ) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(script), *arguments],
            check=False,
            capture_output=True,
            text=True,
            env=self.clean_environment(),
        )

    def run_create(
        self,
        *,
        name: str = "feature-test",
        base: str = "main",
        expected_base_head: str | None = None,
        check: dict[str, Any] | None = None,
        project_id: int | None = 7,
        task_id: int | None = 11,
    ) -> subprocess.CompletedProcess[str]:
        command = [
            "create",
            "--repo",
            str(self.repository),
            "--name",
            name,
            "--base",
            base,
            "--expected-base-head",
            expected_base_head or self.head(base),
            "--agent",
            "coder",
            "--targeted-check-json",
            json.dumps(check or self.targeted_check()),
        ]
        if project_id is not None:
            command.extend(["--project-id", str(project_id)])
        if task_id is not None:
            command.extend(["--task-id", str(task_id)])
        return self.run_script(*command)

    def manifest_path(self, name: str = "feature-test") -> Path:
        return (
            self.repository
            / ".yusung-harness"
            / "state"
            / "worktrees"
            / f"{name}.json"
        )

    def worktree_path(self, name: str = "feature-test") -> Path:
        return self.repository / ".yusung-harness" / "worktrees" / name

    def load_manifest(self, name: str = "feature-test") -> dict[str, Any]:
        return json.loads(self.manifest_path(name).read_text(encoding="utf-8"))

    def legacy_source_check(self, name: str = "web-dashboard") -> dict[str, Any]:
        if name == "web-dashboard":
            script = "print('web-dashboard literal:$() ; `not-shell`')"
        elif name == "harness-policy":
            script = "print('harness-policy must not run'); raise SystemExit(19)"
        else:
            raise AssertionError(f"unknown legacy source profile: {name}")
        return {
            "name": name,
            "cwd": ".",
            "argv": [sys.executable, "-c", script],
        }

    def legacy_target_config(self) -> str:
        prepare_source_argv = json.dumps(
            [sys.executable, "-c", "print('prepare legacy source')"]
        )
        prepare_candidate_argv = json.dumps(
            [sys.executable, "-c", "print('prepare legacy candidate')"]
        )
        web_dashboard_argv = json.dumps(
            self.legacy_source_check("web-dashboard")["argv"]
        )
        harness_policy_argv = json.dumps(
            self.legacy_source_check("harness-policy")["argv"]
        )
        candidate_sections = []
        for category in ("test", "typecheck", "lint", "build"):
            argv = json.dumps(
                [sys.executable, "-c", f"print({category!r})"]
            )
            candidate_sections.extend(
                [
                    f"[verification.candidate.{category}]",
                    'cwd = "."',
                    f"argv = {argv}",
                    "",
                ]
            )
        return "\n".join(
            [
                "schema_version = 1",
                "configured = true",
                'branch_prefix = "codex/"',
                'management_root = ".yusung-harness"',
                'merge_strategy = "no-ff"',
                'cleanup = "worktree-and-branch"',
                'conflict_policy = "evidence-only"',
                'required_verification_categories = ["test", "typecheck", "lint", "build"]',
                "",
                "[verification.prepare.source]",
                'cwd = "."',
                f"argv = {prepare_source_argv}",
                "",
                "[verification.prepare.candidate]",
                'cwd = "."',
                f"argv = {prepare_candidate_argv}",
                "",
                "[verification.source.web-dashboard]",
                'cwd = "."',
                f"argv = {web_dashboard_argv}",
                "",
                "[verification.source.harness-policy]",
                'cwd = "."',
                f"argv = {harness_policy_argv}",
                "",
                *candidate_sections,
            ]
        )

    def prepare_legacy_source_without_engine_contract(
        self,
        branch: str = "legacy-feature",
    ) -> dict[str, Any]:
        config_path = self.repository / ".codex" / "integration.toml"
        self.git("rm", ".codex/integration.toml")
        self.git("commit", "--quiet", "-m", "Legacy base without integration engine")
        legacy_base = self.head("main")
        legacy_root = self.repository / ".worktree"
        legacy_path = legacy_root / branch
        exclude_value = self.git(
            "rev-parse", "--git-path", "info/exclude"
        ).stdout.strip()
        exclude = Path(exclude_value)
        if not exclude.is_absolute():
            exclude = (self.repository / exclude).resolve()
        with exclude.open("a", encoding="utf-8") as handle:
            handle.write("/.worktree/\n")
        self.git("worktree", "add", "-b", branch, str(legacy_path), legacy_base)
        legacy_path.joinpath("legacy.txt").write_text(
            "legacy feature\n",
            encoding="utf-8",
        )
        subprocess.run(
            ["git", "-C", str(legacy_path), "add", "legacy.txt"],
            check=True,
            env=self.clean_environment(),
        )
        subprocess.run(
            [
                "git",
                "-C",
                str(legacy_path),
                "commit",
                "--quiet",
                "-m",
                "Legacy feature",
            ],
            check=True,
            env=self.clean_environment(),
        )
        source_head = self.head(branch)
        for source_path in (
            ".codex/integration.toml",
            ".codex/skills/code/scripts/test_worktree.py",
            ".codex/skills/integration/scripts/test_merge.py",
        ):
            self.assertNotEqual(
                self.git(
                    "cat-file",
                    "-e",
                    f"{source_head}:{source_path}",
                    check=False,
                ).returncode,
                0,
                msg=f"legacy source unexpectedly contains {source_path}",
            )
        config_path.parent.mkdir(parents=True, exist_ok=True)
        config_path.write_text(self.legacy_target_config(), encoding="utf-8")
        self.git("add", ".codex/integration.toml")
        self.git("commit", "--quiet", "-m", "Add target integration contract")
        target_head = self.head("main")
        self.assertEqual(
            self.git(
                "cat-file",
                "-e",
                f"{target_head}:.codex/integration.toml",
                check=False,
            ).returncode,
            0,
        )
        return {
            "branch": branch,
            "path": legacy_path,
            "sourceHead": source_head,
            "sourceTree": self.head(f"{branch}^{{tree}}"),
            "targetHead": target_head,
            "exclude": exclude,
        }

    def legacy_snapshot(self, fixture: dict[str, Any]) -> dict[str, Any]:
        legacy_path = fixture["path"]
        return {
            "sourceHead": self.head(fixture["branch"]),
            "targetHead": self.head("main"),
            "sourceStatus": subprocess.run(
                ["git", "-C", str(legacy_path), "status", "--porcelain=v1"],
                check=True,
                capture_output=True,
                text=True,
                env=self.clean_environment(),
            ).stdout,
            "targetStatus": self.git("status", "--porcelain=v1").stdout,
            "worktrees": self.git("worktree", "list", "--porcelain").stdout,
            "exclude": fixture["exclude"].read_text(encoding="utf-8"),
            "manifestExists": self.manifest_path(fixture["branch"]).exists(),
        }

    def run_legacy_ready(
        self,
        fixture: dict[str, Any],
        *,
        config_revision: str | None = None,
        checks: list[dict[str, Any]] | None = None,
        include_config_revision: bool = True,
        include_checks: bool = True,
    ) -> subprocess.CompletedProcess[str]:
        command = [
            "ready",
            "--repo",
            str(self.repository),
            "--branch",
            fixture["branch"],
            "--expected-head",
            fixture["sourceHead"],
        ]
        if include_config_revision:
            command.extend(
                ["--config-revision", config_revision or fixture["targetHead"]]
            )
        if include_checks:
            for check in checks or [self.legacy_source_check("web-dashboard")]:
                command.extend(["--targeted-check-json", json.dumps(check)])
        return self.run_script(*command)

    def test_create_uses_explicit_base_sha_and_writes_active_manifest(self) -> None:
        base_head = self.head("main")

        result = self.run_create(expected_base_head=base_head)

        self.assertEqual(
            result.returncode,
            0,
            msg=f"stdout={result.stdout!r}\nstderr={result.stderr!r}",
        )
        path = self.worktree_path()
        self.assertTrue(path.is_dir())
        self.assertEqual(
            self.git("rev-parse", "codex/feature-test").stdout.strip(),
            base_head,
        )
        manifest = self.load_manifest()
        self.assertEqual(
            set(manifest),
            {
                "schemaVersion",
                "state",
                "repoRoot",
                "branch",
                "path",
                "baseBranch",
                "baseSha",
                "headSha",
                "createdAt",
                "projectId",
                "taskId",
                "agent",
                "targetedChecks",
                "verification",
            },
        )
        self.assertEqual(manifest["schemaVersion"], 1)
        self.assertEqual(manifest["state"], "ACTIVE")
        self.assertEqual(manifest["repoRoot"], str(self.repository))
        self.assertEqual(manifest["branch"], "codex/feature-test")
        self.assertEqual(manifest["path"], str(path))
        self.assertEqual(manifest["baseBranch"], "main")
        self.assertEqual(manifest["baseSha"], base_head)
        self.assertEqual(manifest["headSha"], base_head)
        self.assertEqual(manifest["projectId"], 7)
        self.assertEqual(manifest["taskId"], 11)
        self.assertEqual(manifest["agent"], "coder")
        self.assertEqual(manifest["targetedChecks"], [self.targeted_check()])
        self.assertIn(manifest["verification"], (None, []))
        self.assertEqual(
            subprocess.run(
                ["git", "-C", str(path), "branch", "--show-current"],
                check=True,
                capture_output=True,
                text=True,
                env=self.clean_environment(),
            ).stdout.strip(),
            "codex/feature-test",
        )
        common_exclude = self.git("rev-parse", "--git-path", "info/exclude").stdout.strip()
        exclude_path = Path(common_exclude)
        if not exclude_path.is_absolute():
            exclude_path = (self.repository / exclude_path).resolve()
        self.assertIn("/.yusung-harness/", exclude_path.read_text(encoding="utf-8").splitlines())

    def test_create_rejects_stale_base_without_branch_path_or_manifest(self) -> None:
        stale_head = self.head("main")
        (self.repository / "tracked.txt").write_text("new base\n", encoding="utf-8")
        self.git("add", "tracked.txt")
        self.git("commit", "--quiet", "-m", "Advance main")
        current_head = self.head("main")

        result = self.run_create(expected_base_head=stale_head)

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.head("main"), current_head)
        self.assertNotEqual(
            self.git("show-ref", "--verify", "refs/heads/codex/feature-test", check=False).returncode,
            0,
        )
        self.assertFalse(self.worktree_path().exists())
        self.assertFalse(self.manifest_path().exists())

    def test_create_rejects_dirty_primary_without_managed_mutation(self) -> None:
        original_head = self.head("main")
        (self.repository / "untracked-primary.txt").write_text(
            "dirty\n",
            encoding="utf-8",
        )

        result = self.run_create()

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.head("main"), original_head)
        self.assertNotEqual(
            self.git(
                "show-ref",
                "--verify",
                "refs/heads/codex/feature-test",
                check=False,
            ).returncode,
            0,
        )
        self.assertFalse(self.worktree_path().exists())
        self.assertFalse(self.manifest_path().exists())

    def test_create_rejects_each_in_progress_git_operation_without_managed_mutation(self) -> None:
        common_dir_value = self.git("rev-parse", "--git-common-dir").stdout.strip()
        common_dir = Path(common_dir_value)
        if not common_dir.is_absolute():
            common_dir = (self.repository / common_dir).resolve()
        markers = (
            ("MERGE_HEAD", False),
            ("CHERRY_PICK_HEAD", False),
            ("REVERT_HEAD", False),
            ("BISECT_LOG", False),
            ("rebase-merge", True),
            ("rebase-apply", True),
        )

        for index, (marker, is_directory) in enumerate(markers, start=1):
            with self.subTest(marker=marker):
                marker_path = common_dir / marker
                if is_directory:
                    marker_path.mkdir()
                else:
                    marker_path.write_text(f"{self.head()}\n", encoding="utf-8")
                name = f"operation-{index}"
                try:
                    result = self.run_create(name=name)
                    self.assertNotEqual(result.returncode, 0)
                    self.assertFalse(self.worktree_path(name).exists())
                    self.assertFalse(self.manifest_path(name).exists())
                    self.assertNotEqual(
                        self.git(
                            "show-ref",
                            "--verify",
                            f"refs/heads/codex/{name}",
                            check=False,
                        ).returncode,
                        0,
                    )
                finally:
                    if is_directory:
                        marker_path.rmdir()
                    else:
                        marker_path.unlink()

    def test_create_rejects_unconfigured_targeted_command_without_mutation(self) -> None:
        arbitrary = {
            "name": "source-targeted",
            "cwd": ".",
            "argv": ["true"],
        }
        original_head = self.head("main")

        result = self.run_create(check=arbitrary)

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.head("main"), original_head)
        self.assertFalse(self.worktree_path().exists())
        self.assertFalse(self.manifest_path().exists())

    def test_strict_python310_config_parser_rejects_unknown_duplicate_and_unconfigured(self) -> None:
        config_path = self.repository / ".codex" / "integration.toml"
        valid_config = config_path.read_text(encoding="utf-8")
        invalid_configs = (
            valid_config + "unknown_key = true\n",
            valid_config.replace("schema_version = 1", "schema_version = 1\nschema_version = 1"),
            valid_config + "\n[verification.unknown]\ncwd = \".\"\nargv = [\"true\"]\n",
            valid_config.replace("configured = true", "configured = false"),
        )

        for index, invalid_config in enumerate(invalid_configs, start=1):
            with self.subTest(index=index):
                config_path.write_text(invalid_config, encoding="utf-8")
                self.git("add", ".codex/integration.toml")
                self.git("commit", "--quiet", "-m", f"Invalid config {index}")
                name = f"invalid-config-{index}"
                result = self.run_create(name=name)
                self.assertNotEqual(result.returncode, 0)
                self.assertNotEqual(
                    self.git(
                        "show-ref",
                        "--verify",
                        f"refs/heads/codex/{name}",
                        check=False,
                    ).returncode,
                    0,
                )
                self.assertFalse(self.worktree_path(name).exists())
                self.assertFalse(self.manifest_path(name).exists())

        config_path.write_text(valid_config, encoding="utf-8")

    def test_integration_python_sources_parse_as_python310_without_tomllib(self) -> None:
        integration_scripts = (
            Path(__file__).resolve().parents[2] / "integration" / "scripts"
        )
        sources = [Path(__file__).with_name("worktree.py")]
        sources.extend(
            path
            for path in integration_scripts.glob("*.py")
            if not path.name.startswith("test_")
        )

        self.assertTrue(sources)
        for path in sources:
            with self.subTest(path=str(path)):
                source = path.read_text(encoding="utf-8")
                self.assertNotRegex(source, r"\bimport\s+tomllib\b|\bfrom\s+tomllib\b")
                ast.parse(source, filename=str(path), feature_version=(3, 10))

    def test_create_failure_rolls_back_managed_branch_path_and_manifest(self) -> None:
        self.git("branch", "codex/feature-test")
        original_head = self.head("main")

        result = self.run_create(expected_base_head=original_head)

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.head("main"), original_head)
        self.assertEqual(self.head("codex/feature-test"), original_head)
        self.assertFalse(self.worktree_path().exists())
        self.assertFalse(self.manifest_path().exists())

    def test_ready_runs_targeted_argv_without_shell_and_records_head_tree_evidence(self) -> None:
        create = self.run_create()
        self.assertEqual(create.returncode, 0, msg=create.stderr)
        path = self.worktree_path()
        (path / "tracked.txt").write_text("feature\n", encoding="utf-8")
        subprocess.run(
            ["git", "-C", str(path), "add", "tracked.txt"],
            check=True,
            env=self.clean_environment(),
        )
        subprocess.run(
            ["git", "-C", str(path), "commit", "--quiet", "-m", "Feature"],
            check=True,
            env=self.clean_environment(),
        )
        feature_head = self.head("codex/feature-test")
        feature_tree = self.head("codex/feature-test^{tree}")

        result = self.run_script(
            "ready",
            "--repo",
            str(self.repository),
            "--branch",
            "codex/feature-test",
            "--expected-head",
            feature_head,
        )

        self.assertEqual(
            result.returncode,
            0,
            msg=f"stdout={result.stdout!r}\nstderr={result.stderr!r}",
        )
        manifest = self.load_manifest()
        self.assertEqual(manifest["state"], "READY")
        self.assertEqual(manifest["headSha"], feature_head)
        self.assertEqual(len(manifest["verification"]), 1)
        evidence = manifest["verification"][0]
        self.assertEqual(evidence["name"], "targeted-unit")
        self.assertEqual(evidence["headSha"], feature_head)
        self.assertEqual(evidence["treeSha"], feature_tree)
        self.assertEqual(evidence["argv"], self.targeted_check()["argv"])
        self.assertEqual(evidence["returncode"], 0)
        self.assertIn("literal:$() ; `not-shell`", evidence["stdout"])

    def test_ready_adopts_legacy_source_using_target_configured_subset(self) -> None:
        fixture = self.prepare_legacy_source_without_engine_contract()

        ready = self.run_legacy_ready(fixture)

        self.assertEqual(ready.returncode, 0, msg=ready.stderr)
        manifest = self.load_manifest("legacy-feature")
        self.assertEqual(manifest["state"], "READY")
        self.assertEqual(manifest["branch"], "legacy-feature")
        self.assertEqual(manifest["path"], str(fixture["path"]))
        self.assertEqual(manifest["baseSha"], fixture["targetHead"])
        self.assertEqual(manifest["headSha"], fixture["sourceHead"])
        self.assertEqual(
            manifest["targetedChecks"],
            [self.legacy_source_check("web-dashboard")],
        )
        self.assertEqual(len(manifest["verification"]), 1)
        evidence = manifest["verification"][0]
        self.assertEqual(evidence["name"], "web-dashboard")
        self.assertEqual(evidence["headSha"], fixture["sourceHead"])
        self.assertEqual(evidence["treeSha"], fixture["sourceTree"])
        self.assertEqual(
            evidence["argv"],
            self.legacy_source_check("web-dashboard")["argv"],
        )
        self.assertIn("literal:$() ; `not-shell`", evidence["stdout"])
        self.assertNotIn("harness-policy must not run", evidence["stdout"])
        merge = self.run_python(
            MERGE_SCRIPT_PATH,
            "prepare",
            "--repo",
            str(self.repository),
            "--source",
            "legacy-feature",
            "--target",
            "main",
            "--expected-source-head",
            fixture["sourceHead"],
            "--expected-target-head",
            fixture["targetHead"],
        )
        self.assertEqual(merge.returncode, 0, msg=merge.stderr)

    def test_legacy_ready_requires_config_revision_and_configured_subset_without_mutation(
        self,
    ) -> None:
        cases = (
            {
                "name": "missing-config-revision",
                "kwargs": {"include_config_revision": False},
            },
            {
                "name": "missing-targeted-check",
                "kwargs": {"include_checks": False},
            },
            {
                "name": "source-revision-without-config",
                "kwargs": {"config_revision": "SOURCE_HEAD"},
            },
            {
                "name": "unconfigured-command",
                "kwargs": {
                    "checks": [
                        {
                            "name": "web-dashboard",
                            "cwd": ".",
                            "argv": [sys.executable, "-c", "print('arbitrary')"],
                        }
                    ]
                },
            },
            {
                "name": "spoofed-profile-name",
                "kwargs": {
                    "checks": [
                        {
                            **self.legacy_source_check("web-dashboard"),
                            "name": "not-configured",
                        }
                    ]
                },
            },
        )

        for case in cases:
            with self.subTest(case=case["name"]):
                fixture = self.prepare_legacy_source_without_engine_contract(
                    branch=f"legacy-{case['name']}"
                )
                kwargs = dict(case["kwargs"])
                if kwargs.get("config_revision") == "SOURCE_HEAD":
                    kwargs["config_revision"] = fixture["sourceHead"]
                before = self.legacy_snapshot(fixture)

                result = self.run_legacy_ready(fixture, **kwargs)

                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(self.legacy_snapshot(fixture), before)

    def test_legacy_ready_rejects_stale_target_config_revision_without_mutation(
        self,
    ) -> None:
        fixture = self.prepare_legacy_source_without_engine_contract()
        stale_config_revision = fixture["targetHead"]
        self.repository.joinpath("tracked.txt").write_text(
            "target advanced\n",
            encoding="utf-8",
        )
        self.git("add", "tracked.txt")
        self.git("commit", "--quiet", "-m", "Advance target after config pin")
        before = self.legacy_snapshot(fixture)

        result = self.run_legacy_ready(
            fixture,
            config_revision=stale_config_revision,
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.legacy_snapshot(fixture), before)

    def test_ready_rejects_failed_check_dirty_tree_and_stale_head_without_ready_state(self) -> None:
        for scenario in ("failed-check", "dirty", "stale-head"):
            with self.subTest(scenario=scenario):
                name = f"feature-{scenario}"
                create = self.run_create(
                    name=name,
                    check=self.targeted_check(),
                )
                self.assertEqual(create.returncode, 0, msg=create.stderr)
                branch = f"codex/{name}"
                expected_head = self.head(branch)
                if scenario == "failed-check":
                    path = self.worktree_path(name)
                    path.joinpath("fail-targeted").write_text("fail\n", encoding="utf-8")
                    subprocess.run(
                        ["git", "-C", str(path), "add", "fail-targeted"],
                        check=True,
                        env=self.clean_environment(),
                    )
                    subprocess.run(
                        ["git", "-C", str(path), "commit", "--quiet", "-m", "Fail check"],
                        check=True,
                        env=self.clean_environment(),
                    )
                    expected_head = self.head(branch)
                if scenario == "dirty":
                    (self.worktree_path(name) / "dirty.txt").write_text(
                        "dirty\n", encoding="utf-8"
                    )
                if scenario == "stale-head":
                    expected_head = "0" * 40

                result = self.run_script(
                    "ready",
                    "--repo",
                    str(self.repository),
                    "--branch",
                    branch,
                    "--expected-head",
                    expected_head,
                )

                self.assertNotEqual(result.returncode, 0)
                manifest = self.load_manifest(name)
                self.assertEqual(manifest["state"], "ACTIVE")
                self.assertEqual(manifest["verification"], [])


if __name__ == "__main__":
    unittest.main()
