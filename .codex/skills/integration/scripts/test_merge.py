from __future__ import annotations

import fcntl
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any

import merge as merge_engine


SCRIPT_PATH = Path(__file__).with_name("merge.py").resolve()
WORKTREE_SCRIPT = (
    Path(__file__).resolve().parents[2] / "code" / "scripts" / "worktree.py"
)
REQUIRED_CANDIDATE_CHECKS = ("test", "typecheck", "lint", "build")


class MergeScriptTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary_directory.cleanup)
        self.repository = Path(self.temporary_directory.name, "repository").resolve()
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
        config_lines = [
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
            "[verification.source.source-targeted]",
            'cwd = "."',
            f"argv = {json.dumps(self.targeted_check()['argv'])}",
        ]
        for category in REQUIRED_CANDIDATE_CHECKS:
            config_lines.extend(
                [
                    "",
                    f"[verification.candidate.{category}]",
                    'cwd = "."',
                    f"argv = {json.dumps(self.verification_argv(category))}",
                ]
            )
        config.write_text("\n".join(config_lines) + "\n", encoding="utf-8")
        (self.repository / "shared.txt").write_text("base\n", encoding="utf-8")
        self.git("add", ".codex/integration.toml", "shared.txt")
        self.git("commit", "--quiet", "-m", "Initial commit")
        self.initial_head = self.head("main")

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
        cwd: Path | None = None,
    ) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["git", "-C", str(cwd or self.repository), *arguments],
            check=check,
            capture_output=True,
            text=True,
            env=self.clean_environment(),
        )

    def head(self, revision: str = "HEAD") -> str:
        return self.git("rev-parse", revision).stdout.strip()

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

    def targeted_check(self) -> dict[str, Any]:
        return {
            "name": "source-targeted",
            "cwd": ".",
            "argv": [sys.executable, "-c", "print('source targeted')"],
        }

    @staticmethod
    def verification_argv(category: str) -> list[str]:
        return [
            sys.executable,
            "-c",
            f"print('literal {category}: $() ; `not-shell`')",
        ]

    def create_ready_source(
        self,
        *,
        name: str = "feature-test",
        path: str = "feature.txt",
        content: str = "feature\n",
        binary_content: bytes | None = None,
        source_config_override: str | None = None,
    ) -> tuple[str, Path]:
        create = self.run_python(
            WORKTREE_SCRIPT,
            "create",
            "--repo",
            str(self.repository),
            "--name",
            name,
            "--base",
            "main",
            "--expected-base-head",
            self.head("main"),
            "--agent",
            "coder",
            "--targeted-check-json",
            json.dumps(self.targeted_check()),
        )
        self.assertEqual(
            create.returncode,
            0,
            msg=f"stdout={create.stdout!r}\nstderr={create.stderr!r}",
        )
        source_path = (
            self.repository / ".yusung-harness" / "worktrees" / name
        )
        if binary_content is None:
            source_path.joinpath(path).write_text(content, encoding="utf-8")
        else:
            source_path.joinpath(path).write_bytes(binary_content)
        paths_to_add = [path]
        if source_config_override is not None:
            source_path.joinpath(".codex/integration.toml").write_text(
                source_config_override,
                encoding="utf-8",
            )
            paths_to_add.append(".codex/integration.toml")
        self.git("add", *paths_to_add, cwd=source_path)
        self.git("commit", "--quiet", "-m", "Feature", cwd=source_path)
        branch = f"codex/{name}"
        source_head = self.head(branch)
        ready = self.run_python(
            WORKTREE_SCRIPT,
            "ready",
            "--repo",
            str(self.repository),
            "--branch",
            branch,
            "--expected-head",
            source_head,
        )
        self.assertEqual(
            ready.returncode,
            0,
            msg=f"stdout={ready.stdout!r}\nstderr={ready.stderr!r}",
        )
        return branch, source_path

    def run_merge(self, command: str, *arguments: str) -> subprocess.CompletedProcess[str]:
        return self.run_python(
            SCRIPT_PATH,
            command,
            "--repo",
            str(self.repository),
            *arguments,
        )

    def prepare(
        self,
        source: str,
        *,
        expected_source_head: str | None = None,
        expected_target_head: str | None = None,
    ) -> subprocess.CompletedProcess[str]:
        return self.run_merge(
            "prepare",
            "--source",
            source,
            "--target",
            "main",
            "--expected-source-head",
            expected_source_head or self.head(source),
            "--expected-target-head",
            expected_target_head or self.head("main"),
        )

    def integration_runs(self) -> list[Path]:
        root = self.repository / ".yusung-harness" / "integrations"
        return sorted(path for path in root.iterdir() if path.is_dir()) if root.exists() else []

    def single_run(self) -> tuple[str, Path, dict[str, Any]]:
        runs = self.integration_runs()
        self.assertEqual(len(runs), 1)
        run_path = runs[0]
        manifest = json.loads(run_path.joinpath("manifest.json").read_text(encoding="utf-8"))
        return run_path.name, run_path, manifest

    def verify_candidate(self, run_id: str) -> None:
        for category in REQUIRED_CANDIDATE_CHECKS:
            result = self.run_merge(
                "verify",
                "--run-id",
                run_id,
                "--phase",
                "candidate",
                "--check",
                category,
                "--",
                *self.verification_argv(category),
            )
            self.assertEqual(
                result.returncode,
                0,
                msg=f"stdout={result.stdout!r}\nstderr={result.stderr!r}",
            )

    def prepare_conflict(
        self,
        *,
        path: str = "shared.txt",
        source_content: bytes = b"source change\n",
        target_content: bytes = b"target change\n",
    ) -> tuple[str, Path, dict[str, Any], str]:
        source, _ = self.create_ready_source(
            path=path,
            binary_content=source_content,
        )
        self.repository.joinpath(path).parent.mkdir(parents=True, exist_ok=True)
        self.repository.joinpath(path).write_bytes(target_content)
        self.git("add", path)
        self.git("commit", "--quiet", "-m", "Target conflict")
        target_head = self.head("main")
        prepared = self.prepare(source)
        self.assertEqual(prepared.returncode, 0, msg=prepared.stderr)
        run_id, run_path, manifest = self.single_run()
        return run_id, run_path, manifest, target_head

    def resolve_review_verify_conflict(
        self,
        *,
        path: str = "shared.txt",
    ) -> tuple[str, Path, dict[str, Any], str]:
        run_id, run_path, manifest, target_head = self.prepare_conflict(path=path)
        candidate_path = run_path / "worktree"
        candidate_path.joinpath(path).write_text(
            "resolved source and target\n",
            encoding="utf-8",
        )
        self.git("add", path, cwd=candidate_path)
        resolved = self.run_merge(
            "resolve",
            "--run-id",
            run_id,
            "--path",
            path,
            "--classification",
            "semantic",
            "--evidence",
            "user:manual-resolution/1",
        )
        self.assertEqual(resolved.returncode, 0, msg=resolved.stderr)
        finalized = self.run_merge("finalize", "--run-id", run_id)
        self.assertEqual(finalized.returncode, 0, msg=finalized.stderr)
        self.verify_candidate(run_id)
        reviewed = self.run_merge(
            "review",
            "--run-id",
            run_id,
            "--verdict",
            "PASS",
            "--reviewer",
            "reviewer-agent",
            "--evidence",
            "user:review-approval/1",
        )
        self.assertEqual(reviewed.returncode, 0, msg=reviewed.stderr)
        manifest = json.loads(run_path.joinpath("manifest.json").read_text(encoding="utf-8"))
        return run_id, run_path, manifest, target_head

    def test_prepare_builds_isolated_no_ff_candidate_and_imports_ready_evidence(self) -> None:
        source, source_path = self.create_ready_source()
        target_head = self.head("main")
        source_head = self.head(source)

        result = self.prepare(source)

        self.assertEqual(
            result.returncode,
            0,
            msg=f"stdout={result.stdout!r}\nstderr={result.stderr!r}",
        )
        run_id, run_path, manifest = self.single_run()
        self.assertRegex(run_id, r"^[A-Za-z0-9._-]+$")
        self.assertEqual(manifest["state"], "CANDIDATE_COMMITTED")
        self.assertEqual(manifest["source"], source)
        self.assertEqual(manifest["sourceHead"], source_head)
        self.assertEqual(manifest["target"], "main")
        self.assertEqual(manifest["targetHead"], target_head)
        self.assertRegex(manifest["configSha256"], r"^[a-f0-9]{64}$")
        self.assertTrue(manifest["candidateBranch"].startswith("yusung-integration/"))
        candidate_head = manifest["candidateHead"]
        parents = self.git("rev-list", "--parents", "-n", "1", candidate_head).stdout.split()
        self.assertEqual(parents, [candidate_head, target_head, source_head])
        self.assertEqual(self.head("main"), target_head)
        self.assertTrue(run_path.joinpath("worktree").is_dir())
        self.assertTrue(source_path.is_dir())
        source_evidence = manifest["verification"]["source"]["targeted"]
        self.assertEqual(source_evidence[0]["headSha"], source_head)
        self.assertEqual(
            source_evidence[0]["treeSha"],
            self.head(f"{source}^{{tree}}"),
        )
        self.assertRegex(source_evidence[0]["sha256"], r"^[a-f0-9]{64}$")
        status = self.run_merge("status", "--run-id", run_id)
        self.assertEqual(status.returncode, 0, msg=status.stderr)
        self.assertEqual(json.loads(status.stdout)["state"], "CANDIDATE_COMMITTED")

    def test_prepare_rejects_stale_refs_and_non_ready_source_without_target_mutation(self) -> None:
        source, _ = self.create_ready_source()
        target_head = self.head("main")

        for source_sha, target_sha in (
            ("0" * 40, target_head),
            (self.head(source), "0" * 40),
        ):
            with self.subTest(source_sha=source_sha, target_sha=target_sha):
                result = self.prepare(
                    source,
                    expected_source_head=source_sha,
                    expected_target_head=target_sha,
                )
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(self.head("main"), target_head)
                self.assertEqual(self.integration_runs(), [])

        manifest_path = (
            self.repository
            / ".yusung-harness"
            / "state"
            / "worktrees"
            / "feature-test.json"
        )
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["state"] = "ACTIVE"
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        result = self.prepare(source)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.head("main"), target_head)

    def test_prepare_reports_already_merged_without_candidate_or_target_change(self) -> None:
        source, source_path = self.create_ready_source()
        source_manifest = self.repository.joinpath(
            ".yusung-harness/state/worktrees/feature-test.json"
        )
        bare = Path(self.temporary_directory.name, "already-origin.git").resolve()
        subprocess.run(["git", "init", "--quiet", "--bare", str(bare)], check=True)
        self.git("remote", "add", "origin", str(bare))
        self.git("push", "--quiet", "origin", f"{source}:{source}")
        self.git("merge", "--quiet", "--no-ff", "--no-edit", source)
        target_head = self.head("main")
        self.git("switch", "--quiet", "-c", "admin")
        admin_head = self.head("admin")

        result = self.prepare(source)

        self.assertEqual(result.returncode, 0, msg=result.stderr)
        _, run_path, manifest = self.single_run()
        self.assertEqual(manifest["state"], "ALREADY_MERGED")
        self.assertEqual(self.head("main"), target_head)
        self.assertEqual(self.git("branch", "--show-current").stdout.strip(), "admin")
        self.assertEqual(self.head("admin"), admin_head)
        self.assertFalse(run_path.joinpath("worktree").exists())
        self.assertFalse(source_path.exists())
        self.assertFalse(source_manifest.exists())
        self.assertNotEqual(
            self.git("show-ref", "--verify", f"refs/heads/{source}", check=False).returncode,
            0,
        )
        self.assertIn(
            f"refs/heads/{source}",
            self.git("ls-remote", "--heads", "origin", f"refs/heads/{source}").stdout,
        )

    def test_prepare_runs_configured_dependency_checks_and_fails_closed(self) -> None:
        source, _ = self.create_ready_source()
        config_path = self.repository / ".codex/integration.toml"
        config = config_path.read_text(encoding="utf-8").replace(
            json.dumps([sys.executable, "-c", "print('prepare candidate')"]),
            json.dumps(["definitely-missing-yusung-executable"]),
        )
        config_path.write_text(config, encoding="utf-8")
        self.git("add", ".codex/integration.toml")
        self.git("commit", "--quiet", "-m", "Break prepare dependency")
        target_head = self.head("main")

        result = self.prepare(source)

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.head("main"), target_head)
        if self.integration_runs():
            _, _, manifest = self.single_run()
            self.assertEqual(manifest["state"], "FAILED")

    def test_linked_repo_argument_is_rejected_without_primary_or_ref_mutation(self) -> None:
        source, source_path = self.create_ready_source()
        source_head = self.head(source)
        target_head = self.head("main")
        manifest_path = (
            self.repository
            / ".yusung-harness/state/worktrees/feature-test.json"
        )
        manifest_before = manifest_path.read_bytes()
        result = self.run_python(
            SCRIPT_PATH,
            "prepare",
            "--repo",
            str(source_path),
            "--source",
            source,
            "--target",
            "main",
            "--expected-source-head",
            source_head,
            "--expected-target-head",
            target_head,
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.head(source), source_head)
        self.assertEqual(self.head("main"), target_head)
        self.assertEqual(manifest_path.read_bytes(), manifest_before)
        self.assertEqual(self.integration_runs(), [])

    def test_target_head_config_is_authoritative_over_source_candidate_changes(self) -> None:
        target_config = self.git("show", "main:.codex/integration.toml").stdout
        malicious_config = target_config.replace(
            self.verification_argv("test")[2],
            "print('bypass')",
        )
        source, _ = self.create_ready_source(
            source_config_override=malicious_config,
        )
        target_head = self.head("main")

        prepare = self.prepare(source)

        self.assertEqual(prepare.returncode, 0, msg=prepare.stderr)
        run_id, _, manifest = self.single_run()
        self.assertEqual(
            manifest["configSha256"],
            hashlib.sha256(target_config.encode("utf-8")).hexdigest(),
        )
        rejected = self.run_merge(
            "verify",
            "--run-id",
            run_id,
            "--phase",
            "candidate",
            "--check",
            "test",
            "--",
            sys.executable,
            "-c",
            "print('bypass')",
        )
        self.assertNotEqual(rejected.returncode, 0)
        accepted = self.run_merge(
            "verify",
            "--run-id",
            run_id,
            "--phase",
            "candidate",
            "--check",
            "test",
            "--",
            *self.verification_argv("test"),
        )
        self.assertEqual(accepted.returncode, 0, msg=accepted.stderr)
        self.assertEqual(self.head("main"), target_head)

    def test_candidate_requires_all_four_gates_and_rejects_snapshot_invalidation(self) -> None:
        source, _ = self.create_ready_source()
        target_head = self.head("main")
        prepare = self.prepare(source)
        self.assertEqual(prepare.returncode, 0, msg=prepare.stderr)
        run_id, _, manifest = self.single_run()

        for category in REQUIRED_CANDIDATE_CHECKS[:-1]:
            result = self.run_merge(
                "verify",
                "--run-id",
                run_id,
                "--phase",
                "candidate",
                "--check",
                category,
                "--",
                *self.verification_argv(category),
            )
            self.assertEqual(result.returncode, 0, msg=result.stderr)
        promote = self.run_merge("promote", "--run-id", run_id)
        self.assertNotEqual(promote.returncode, 0)
        self.assertEqual(self.head("main"), target_head)

        final_gate = self.run_merge(
            "verify",
            "--run-id",
            run_id,
            "--phase",
            "candidate",
            "--check",
            "build",
            "--",
            *self.verification_argv("build"),
        )
        self.assertEqual(final_gate.returncode, 0, msg=final_gate.stderr)
        (self.repository / "target-change.txt").write_text("advance\n", encoding="utf-8")
        self.git("add", "target-change.txt")
        self.git("commit", "--quiet", "-m", "Advance target")
        advanced_target = self.head("main")

        promote = self.run_merge("promote", "--run-id", run_id)

        self.assertNotEqual(promote.returncode, 0)
        self.assertEqual(self.head("main"), advanced_target)
        self.assertNotEqual(self.head("main"), manifest["candidateHead"])

    def test_verify_rejects_arbitrary_argv_not_exactly_configured(self) -> None:
        source, _ = self.create_ready_source()
        prepare = self.prepare(source)
        self.assertEqual(prepare.returncode, 0, msg=prepare.stderr)
        run_id, _, _ = self.single_run()

        result = self.run_merge(
            "verify",
            "--run-id",
            run_id,
            "--phase",
            "candidate",
            "--check",
            "test",
            "--",
            "true",
        )

        self.assertNotEqual(result.returncode, 0)

    def test_verify_rejects_persisted_config_tamper_even_when_argv_matches_tamper(self) -> None:
        source, _ = self.create_ready_source()
        target_head = self.head("main")
        prepare = self.prepare(source)
        self.assertEqual(prepare.returncode, 0, msg=prepare.stderr)
        run_id, run_path, manifest = self.single_run()
        manifest["config"]["verification"]["candidate"]["test"]["argv"] = ["true"]
        run_path.joinpath("manifest.json").write_text(
            json.dumps(manifest),
            encoding="utf-8",
        )

        result = self.run_merge(
            "verify",
            "--run-id",
            run_id,
            "--phase",
            "candidate",
            "--check",
            "test",
            "--",
            "true",
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.head("main"), target_head)

    def test_promote_rejects_persisted_config_sha_tamper(self) -> None:
        source, _ = self.create_ready_source()
        target_head = self.head("main")
        prepare = self.prepare(source)
        self.assertEqual(prepare.returncode, 0, msg=prepare.stderr)
        run_id, run_path, manifest = self.single_run()
        self.verify_candidate(run_id)
        manifest = json.loads(run_path.joinpath("manifest.json").read_text(encoding="utf-8"))
        manifest["configSha256"] = "0" * 64
        run_path.joinpath("manifest.json").write_text(
            json.dumps(manifest),
            encoding="utf-8",
        )

        result = self.run_merge("promote", "--run-id", run_id)

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.head("main"), target_head)

    def test_promote_rejects_candidate_verification_sha_tamper(self) -> None:
        source, _ = self.create_ready_source()
        target_head = self.head("main")
        prepare = self.prepare(source)
        self.assertEqual(prepare.returncode, 0, msg=prepare.stderr)
        run_id, run_path, _ = self.single_run()
        self.verify_candidate(run_id)
        manifest = json.loads(run_path.joinpath("manifest.json").read_text(encoding="utf-8"))
        manifest["verification"]["candidate"]["test"]["sha256"] = "0" * 64
        run_path.joinpath("manifest.json").write_text(
            json.dumps(manifest),
            encoding="utf-8",
        )

        result = self.run_merge("promote", "--run-id", run_id)

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.head("main"), target_head)

    def test_checked_target_promotes_ff_only_and_cleans_local_source_without_remote_delete(self) -> None:
        source, source_path = self.create_ready_source()
        bare = Path(self.temporary_directory.name, "origin.git").resolve()
        subprocess.run(["git", "init", "--quiet", "--bare", str(bare)], check=True)
        self.git("remote", "add", "origin", str(bare))
        self.git("push", "--quiet", "origin", f"{source}:{source}")
        prepare = self.prepare(source)
        self.assertEqual(prepare.returncode, 0, msg=prepare.stderr)
        run_id, run_path, manifest = self.single_run()
        candidate_head = manifest["candidateHead"]
        self.verify_candidate(run_id)

        promote = self.run_merge("promote", "--run-id", run_id)

        self.assertEqual(
            promote.returncode,
            0,
            msg=f"stdout={promote.stdout!r}\nstderr={promote.stderr!r}",
        )
        self.assertEqual(self.head("main"), candidate_head)
        self.assertEqual(self.git("status", "--short").stdout, "")
        self.assertFalse(run_path.joinpath("worktree").exists())
        self.assertFalse(source_path.exists())
        self.assertFalse(
            self.repository.joinpath(
                ".yusung-harness/state/worktrees/feature-test.json"
            ).exists()
        )
        self.assertNotEqual(
            self.git("show-ref", "--verify", f"refs/heads/{source}", check=False).returncode,
            0,
        )
        self.assertIn(
            f"refs/heads/{source}",
            self.git("ls-remote", "--heads", "origin", f"refs/heads/{source}").stdout,
        )
        promoted_manifest = json.loads(run_path.joinpath("manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(promoted_manifest["state"], "CLEANED")

    def test_source_manifest_tamper_blocks_cas_cleanup_after_promotion(self) -> None:
        source, source_path = self.create_ready_source()
        source_manifest = self.repository.joinpath(
            ".yusung-harness/state/worktrees/feature-test.json"
        )
        prepare = self.prepare(source)
        self.assertEqual(prepare.returncode, 0, msg=prepare.stderr)
        run_id, run_path, manifest = self.single_run()
        self.verify_candidate(run_id)
        source_state = json.loads(source_manifest.read_text(encoding="utf-8"))
        source_state["agent"] = "tampered-agent"
        source_manifest.write_text(json.dumps(source_state), encoding="utf-8")

        result = self.run_merge("promote", "--run-id", run_id)

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.head("main"), manifest["candidateHead"])
        self.assertTrue(source_manifest.exists())
        self.assertTrue(source_path.exists())
        self.assertEqual(self.head(source), manifest["sourceHead"])
        run_state = json.loads(run_path.joinpath("manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(run_state["state"], "CLEANUP_PARTIAL")

    def test_unchecked_target_uses_compare_and_swap_without_checkout(self) -> None:
        source, _ = self.create_ready_source()
        self.git("switch", "--quiet", "-c", "admin")
        admin_head = self.head("admin")
        prepare = self.prepare(source)
        self.assertEqual(prepare.returncode, 0, msg=prepare.stderr)
        run_id, _, manifest = self.single_run()
        self.verify_candidate(run_id)

        promote = self.run_merge("promote", "--run-id", run_id)

        self.assertEqual(promote.returncode, 0, msg=promote.stderr)
        self.assertEqual(self.head("main"), manifest["candidateHead"])
        self.assertEqual(self.git("branch", "--show-current").stdout.strip(), "admin")
        self.assertEqual(self.head("admin"), admin_head)

    def test_promote_recovers_when_target_already_equals_candidate(self) -> None:
        source, _ = self.create_ready_source()
        self.git("switch", "--quiet", "-c", "admin")
        target_head = self.head("main")
        prepare = self.prepare(source)
        self.assertEqual(prepare.returncode, 0, msg=prepare.stderr)
        run_id, run_path, manifest = self.single_run()
        candidate_head = manifest["candidateHead"]
        self.verify_candidate(run_id)
        self.git(
            "update-ref",
            "refs/heads/main",
            candidate_head,
            target_head,
        )

        promoted = self.run_merge("promote", "--run-id", run_id)

        self.assertEqual(promoted.returncode, 0, msg=promoted.stderr)
        self.assertEqual(self.head("main"), candidate_head)
        manifest = json.loads(run_path.joinpath("manifest.json").read_text(encoding="utf-8"))
        self.assertIn(manifest["state"], ("PROMOTED", "CLEANED"))

    def test_promote_recovers_persisted_promoting_state(self) -> None:
        source, _ = self.create_ready_source()
        prepare = self.prepare(source)
        self.assertEqual(prepare.returncode, 0, msg=prepare.stderr)
        run_id, run_path, _ = self.single_run()
        self.verify_candidate(run_id)
        manifest = json.loads(run_path.joinpath("manifest.json").read_text(encoding="utf-8"))
        manifest["state"] = "PROMOTING"
        run_path.joinpath("manifest.json").write_text(
            json.dumps(manifest),
            encoding="utf-8",
        )

        promoted = self.run_merge("promote", "--run-id", run_id)

        self.assertEqual(promoted.returncode, 0, msg=promoted.stderr)
        self.assertEqual(self.head("main"), manifest["candidateHead"])

    def _assert_promote_recovers_post_ref_state(self, state: str) -> None:
        source, _ = self.create_ready_source()
        self.git("switch", "--quiet", "-c", "admin")
        target_head = self.head("main")
        prepare = self.prepare(source)
        self.assertEqual(prepare.returncode, 0, msg=prepare.stderr)
        run_id, run_path, _ = self.single_run()
        self.verify_candidate(run_id)
        manifest = json.loads(run_path.joinpath("manifest.json").read_text(encoding="utf-8"))
        self.git(
            "update-ref",
            "refs/heads/main",
            manifest["candidateHead"],
            target_head,
        )
        manifest["state"] = state
        manifest["promotion"] = {
            "mode": "update-ref-cas",
            "expectedTarget": target_head,
            "candidateHead": manifest["candidateHead"],
            "completedAt": "2026-08-17T00:00:00+00:00",
        }
        run_path.joinpath("manifest.json").write_text(
            json.dumps(manifest),
            encoding="utf-8",
        )

        result = self.run_merge("promote", "--run-id", run_id)

        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertEqual(self.head("main"), manifest["candidateHead"])
        recovered = json.loads(run_path.joinpath("manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(recovered["state"], "CLEANED")

    def test_promote_recovers_persisted_promoted_state(self) -> None:
        self._assert_promote_recovers_post_ref_state("PROMOTED")

    def test_promote_recovers_persisted_cleanup_partial_state(self) -> None:
        self._assert_promote_recovers_post_ref_state("CLEANUP_PARTIAL")

    def test_target_lock_is_nonblocking_and_preserves_target(self) -> None:
        source, _ = self.create_ready_source()
        target_head = self.head("main")
        common_dir_text = self.git("rev-parse", "--git-common-dir").stdout.strip()
        common_dir = Path(common_dir_text)
        if not common_dir.is_absolute():
            common_dir = (self.repository / common_dir).resolve()
        digest = hashlib.sha256(b"refs/heads/main").hexdigest()
        lock_path = common_dir / "yusung-harness-locks" / f"{digest}.lock"
        lock_path.parent.mkdir(parents=True, exist_ok=True)

        with lock_path.open("a+", encoding="utf-8") as lock_file:
            lock_path.chmod(0o600)
            inode = lock_path.stat().st_ino
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            result = self.prepare(source)

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.head("main"), target_head)
        self.assertEqual(self.integration_runs(), [])
        self.assertTrue(lock_path.exists())
        self.assertEqual(lock_path.stat().st_ino, inode)
        self.assertEqual(lock_path.stat().st_mode & 0o777, 0o600)

    def test_conflict_keeps_target_unchanged_and_requires_resolution_evidence_and_review(self) -> None:
        source, _ = self.create_ready_source(
            path="shared.txt",
            content="source change\n",
        )
        (self.repository / "shared.txt").write_text("target change\n", encoding="utf-8")
        self.git("add", "shared.txt")
        self.git("commit", "--quiet", "-m", "Target conflict")
        target_head = self.head("main")

        prepare = self.prepare(source)

        self.assertEqual(prepare.returncode, 0, msg=prepare.stderr)
        run_id, run_path, manifest = self.single_run()
        self.assertEqual(manifest["state"], "DECISION_REQUIRED")
        self.assertEqual(self.head("main"), target_head)
        conflicts = json.loads(run_path.joinpath("conflicts.json").read_text(encoding="utf-8"))
        self.assertEqual([item["path"] for item in conflicts], ["shared.txt"])
        bundles = list(run_path.glob("*.bundle"))
        self.assertEqual(len(bundles), 1)
        self.assertEqual(
            subprocess.run(
                ["git", "bundle", "verify", str(bundles[0])],
                cwd=self.repository,
                check=False,
                capture_output=True,
                text=True,
            ).returncode,
            0,
        )

        candidate_path = run_path / "worktree"
        candidate_path.joinpath("shared.txt").write_text(
            "resolved source and target\n", encoding="utf-8"
        )
        self.git("add", "shared.txt", cwd=candidate_path)
        resolved = self.run_merge(
            "resolve",
            "--run-id",
            run_id,
            "--path",
            "shared.txt",
            "--classification",
            "semantic",
            "--evidence",
            "user:manual-resolution/1",
        )
        self.assertEqual(resolved.returncode, 0, msg=resolved.stderr)
        resolutions = json.loads(run_path.joinpath("resolutions.json").read_text(encoding="utf-8"))
        self.assertEqual(resolutions[0]["path"], "shared.txt")
        self.assertEqual(resolutions[0]["classification"], "semantic")
        self.assertEqual(resolutions[0]["evidence"], "user:manual-resolution/1")
        manifest = json.loads(run_path.joinpath("manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["state"], "RESOLVED")
        self.assertEqual(
            self.git("rev-parse", "-q", "--verify", "MERGE_HEAD", check=False, cwd=candidate_path).returncode,
            0,
        )
        finalized = self.run_merge("finalize", "--run-id", run_id)
        self.assertEqual(finalized.returncode, 0, msg=finalized.stderr)
        manifest = json.loads(run_path.joinpath("manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["state"], "CANDIDATE_COMMITTED")
        self.verify_candidate(run_id)

        without_review = self.run_merge("promote", "--run-id", run_id)
        self.assertNotEqual(without_review.returncode, 0)
        self.assertEqual(self.head("main"), target_head)
        review = self.run_merge(
            "review",
            "--run-id",
            run_id,
            "--verdict",
            "PASS",
            "--reviewer",
            "reviewer-agent",
            "--evidence",
            "user:review-approval/1",
        )
        self.assertEqual(review.returncode, 0, msg=review.stderr)
        promoted = self.run_merge("promote", "--run-id", run_id)
        self.assertEqual(promoted.returncode, 0, msg=promoted.stderr)

    def test_public_contract_conflict_requires_decision_and_rejects_mechanical_bypass(self) -> None:
        run_id, run_path, manifest, target_head = self.prepare_conflict(
            path="public-api.ts",
        )
        self.assertEqual(manifest["state"], "DECISION_REQUIRED")
        candidate_path = run_path / "worktree"
        candidate_path.joinpath("public-api.ts").write_text(
            "export const resolved = true;\n",
            encoding="utf-8",
        )
        self.git("add", "public-api.ts", cwd=candidate_path)

        result = self.run_merge(
            "resolve",
            "--run-id",
            run_id,
            "--path",
            "public-api.ts",
            "--classification",
            "mechanical",
            "--evidence",
            "code:automatic-choice/1",
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.head("main"), target_head)
        state = json.loads(run_path.joinpath("manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(state["state"], "DECISION_REQUIRED")

    def test_binary_conflict_requires_explicit_decision(self) -> None:
        run_id, run_path, manifest, target_head = self.prepare_conflict(
            path="public-image.bin",
            source_content=b"\x00source\xff",
            target_content=b"\x00target\xfe",
        )

        self.assertEqual(manifest["state"], "DECISION_REQUIRED")
        self.assertEqual(self.head("main"), target_head)
        conflicts = json.loads(run_path.joinpath("conflicts.json").read_text(encoding="utf-8"))
        conflict = conflicts[0]
        candidate_path = run_path / "worktree"
        self.git("checkout", "--theirs", "--", "public-image.bin", cwd=candidate_path)
        self.git("add", "public-image.bin", cwd=candidate_path)

        for classification, evidence in (
            ("mechanical", "code:binary-choice/1"),
            ("semantic", "plan:binary-choice/1"),
        ):
            with self.subTest(classification=classification, evidence=evidence):
                rejected = self.run_merge(
                    "resolve",
                    "--run-id",
                    run_id,
                    "--path",
                    "public-image.bin",
                    "--classification",
                    classification,
                    "--evidence",
                    evidence,
                )
                self.assertNotEqual(rejected.returncode, 0)
                state = json.loads(run_path.joinpath("manifest.json").read_text(encoding="utf-8"))
                self.assertEqual(state["state"], "DECISION_REQUIRED")

        approved = self.run_merge(
            "resolve",
            "--run-id",
            run_id,
            "--path",
            "public-image.bin",
            "--classification",
            "semantic",
            "--evidence",
            "user:binary-choice/1",
        )
        self.assertEqual(approved.returncode, 0, msg=approved.stderr)
        resolutions = json.loads(run_path.joinpath("resolutions.json").read_text(encoding="utf-8"))
        self.assertEqual(resolutions[0]["selectedSide"], "theirs")
        self.assertEqual(resolutions[0]["oid"], conflict["stages"]["3"]["oid"])
        self.assertEqual(resolutions[0]["classification"], "semantic")
        self.assertEqual(resolutions[0]["evidence"], "user:binary-choice/1")
        state = json.loads(run_path.joinpath("manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(state["state"], "RESOLVED")
        finalized = self.run_merge("finalize", "--run-id", run_id)
        self.assertEqual(finalized.returncode, 0, msg=finalized.stderr)

    def _assert_conflict_artifact_mutation_blocks_promotion(
        self,
        artifact: str,
        *,
        delete: bool = False,
    ) -> None:
        run_id, run_path, manifest, target_head = self.resolve_review_verify_conflict()
        path = run_path / artifact
        if delete:
            path.unlink()
        elif path.suffix == ".json":
            value = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(value, list):
                value.append({"tampered": True})
            else:
                value["tampered"] = True
            path.write_text(json.dumps(value), encoding="utf-8")
        else:
            path.write_bytes(path.read_bytes() + b"tampered")

        result = self.run_merge("promote", "--run-id", run_id)

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.head("main"), target_head)
        self.assertNotEqual(self.head("main"), manifest["candidateHead"])

    def test_promote_rejects_conflict_bundle_tamper(self) -> None:
        self._assert_conflict_artifact_mutation_blocks_promotion(
            "conflict-evidence.bundle"
        )

    def test_promote_rejects_conflicts_json_tamper(self) -> None:
        self._assert_conflict_artifact_mutation_blocks_promotion("conflicts.json")

    def test_promote_rejects_resolutions_json_tamper(self) -> None:
        self._assert_conflict_artifact_mutation_blocks_promotion("resolutions.json")

    def test_promote_rejects_deleted_review_json(self) -> None:
        self._assert_conflict_artifact_mutation_blocks_promotion(
            "review.json",
            delete=True,
        )

    def test_commit_message_hook_mutation_blocks_candidate_creation(self) -> None:
        source, _ = self.create_ready_source()
        hook = self.hooks / "commit-msg"
        hook.write_text(
            "#!/bin/sh\nprintf '\\nhook-mutated-message\\n' >> \"$1\"\n",
            encoding="utf-8",
        )
        hook.chmod(0o755)
        target_head = self.head("main")

        result = self.prepare(source)

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.head("main"), target_head)

    def test_post_commit_tree_mutation_blocks_candidate_creation(self) -> None:
        source, _ = self.create_ready_source()
        hook = self.hooks / "post-commit"
        hook.write_text(
            "#!/bin/sh\nprintf 'hook dirty\\n' > hook-dirty.txt\n",
            encoding="utf-8",
        )
        hook.chmod(0o755)
        target_head = self.head("main")

        result = self.prepare(source)

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.head("main"), target_head)

    def test_abort_removes_only_candidate_resources_and_preserves_source_and_target(self) -> None:
        source, source_path = self.create_ready_source()
        source_head = self.head(source)
        target_head = self.head("main")
        prepare = self.prepare(source)
        self.assertEqual(prepare.returncode, 0, msg=prepare.stderr)
        run_id, run_path, manifest = self.single_run()
        candidate_branch = manifest["candidateBranch"]
        self.assertTrue(candidate_branch.startswith("yusung-integration/"))

        abort = self.run_merge("abort", "--run-id", run_id)

        self.assertEqual(abort.returncode, 0, msg=abort.stderr)
        self.assertEqual(self.head("main"), target_head)
        self.assertEqual(self.head(source), source_head)
        self.assertTrue(source_path.is_dir())
        self.assertFalse(run_path.joinpath("worktree").exists())
        self.assertNotEqual(
            self.git("show-ref", "--verify", f"refs/heads/{candidate_branch}", check=False).returncode,
            0,
        )
        manifest = json.loads(run_path.joinpath("manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["state"], "ABORTED")

    def _create_stale_worktree_registration(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self.git("worktree", "add", "--detach", str(path), "HEAD")
        shutil.rmtree(path)

    def _prune_preview(self) -> str:
        result = self.git(
            "worktree",
            "prune",
            "--dry-run",
            "--verbose",
        )
        return "\n".join(
            part.strip()
            for part in (result.stdout, result.stderr)
            if part.strip()
        )

    def test_selective_prune_rejects_unrelated_prefix_without_pruning_anything(self) -> None:
        owned = self.repository / ".yusung-harness/integrations/run-owned/worktree"
        unrelated_prefix = self.repository / ".yusung-harness/integrations/run-owned/worktree-extra"
        self._create_stale_worktree_registration(owned)
        self._create_stale_worktree_registration(unrelated_prefix)
        before = self._prune_preview()
        self.assertGreaterEqual(len(before.splitlines()), 2)

        with self.assertRaises(merge_engine.common.IntegrationError):
            merge_engine.selective_worktree_prune(self.repository, (owned,))

        after = self._prune_preview()
        self.assertEqual(after, before)

    def test_selective_prune_accepts_exact_engine_owned_registration(self) -> None:
        owned = self.repository / ".yusung-harness/integrations/run-owned/worktree"
        self._create_stale_worktree_registration(owned)

        merge_engine.selective_worktree_prune(self.repository, (owned,))

        self.assertEqual(self._prune_preview(), "")


if __name__ == "__main__":
    unittest.main()
