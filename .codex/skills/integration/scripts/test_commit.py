import os
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Dict, Optional, Tuple


SCRIPT_PATH = Path(__file__).with_name("commit.py").resolve()
DEFAULT_TITLE = "커밋 스크립트 추가"
DEFAULT_SUMMARIES = ("검증 로직 추가", "스테이징 변경만 커밋")


class CommitScriptTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary_directory.cleanup)
        self.repository = (
            Path(self.temporary_directory.name) / "repository"
        ).resolve()
        self.repository.mkdir()
        self.hooks_directory = (
            Path(self.temporary_directory.name) / "empty-hooks"
        ).resolve()
        self.hooks_directory.mkdir()

        self.git("init", "--quiet", "--initial-branch=main")
        self.git("config", "user.name", "Codex Test")
        self.git("config", "user.email", "codex@example.invalid")
        self.git("config", "commit.gpgsign", "false")
        self.git("config", "core.hooksPath", str(self.hooks_directory))

        (self.repository / "staged.txt").write_text(
            "original staged content\n",
            encoding="utf-8",
        )
        (self.repository / "unstaged.txt").write_text(
            "original unstaged content\n",
            encoding="utf-8",
        )
        self.git("add", "staged.txt", "unstaged.txt")
        self.git("commit", "--quiet", "-m", "Initial commit")

    def clean_environment(self) -> dict[str, str]:
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

    def head(self) -> str:
        return self.git("rev-parse", "HEAD").stdout.strip()

    def stage_change(self) -> None:
        (self.repository / "staged.txt").write_text(
            "committed staged content\n",
            encoding="utf-8",
        )
        self.git("add", "staged.txt")

    def run_script(
        self,
        *,
        repository: Optional[Path] = None,
        expected_branch: str = "main",
        expected_head: Optional[str] = None,
        commit_type: str = "feat",
        title: str = DEFAULT_TITLE,
        summaries: Tuple[str, ...] = DEFAULT_SUMMARIES,
        environment_overrides: Optional[Dict[str, str]] = None,
    ) -> subprocess.CompletedProcess[str]:
        command = [
            sys.executable,
            str(SCRIPT_PATH),
            "--repo",
            str(repository or self.repository),
            "--expected-branch",
            expected_branch,
            "--expected-head",
            expected_head or self.head(),
            "--type",
            commit_type,
            "--title",
            title,
        ]
        for summary in summaries:
            command.extend(["--summary", summary])

        environment = self.clean_environment()
        environment.update(environment_overrides or {})
        return subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            env=environment,
        )

    def assert_rejected_without_mutation(
        self,
        result: subprocess.CompletedProcess[str],
        original_head: str,
        *,
        staged_path: Optional[str] = "staged.txt",
    ) -> None:
        self.assertNotEqual(
            result.returncode,
            0,
            msg=f"stdout={result.stdout!r}\nstderr={result.stderr!r}",
        )
        self.assertEqual(self.head(), original_head)
        staged_paths = self.git(
            "diff",
            "--cached",
            "--name-only",
        ).stdout.splitlines()
        expected_paths = [] if staged_path is None else [staged_path]
        self.assertEqual(staged_paths, expected_paths)

    def test_commits_with_required_message_and_prints_new_sha(self) -> None:
        self.stage_change()
        original_head = self.head()

        result = self.run_script(expected_head=original_head)

        self.assertEqual(
            result.returncode,
            0,
            msg=f"stdout={result.stdout!r}\nstderr={result.stderr!r}",
        )
        new_head = self.head()
        self.assertNotEqual(new_head, original_head)
        self.assertRegex(result.stdout, rf"(?m)^{re.escape(new_head)}$")
        self.assertEqual(
            self.git("log", "-1", "--format=%B").stdout.strip(),
            "feat: 커밋 스크립트 추가\n\n"
            "변경 요약:\n"
            "- 검증 로직 추가\n"
            "- 스테이징 변경만 커밋",
        )

    def test_commits_only_staged_changes_without_adding_or_resetting(self) -> None:
        self.stage_change()
        (self.repository / "unstaged.txt").write_text(
            "working tree change that must remain\n",
            encoding="utf-8",
        )
        (self.repository / "untracked.txt").write_text(
            "must remain untracked\n",
            encoding="utf-8",
        )

        result = self.run_script()

        self.assertEqual(
            result.returncode,
            0,
            msg=f"stdout={result.stdout!r}\nstderr={result.stderr!r}",
        )
        self.assertEqual(
            self.git("show", "HEAD:staged.txt").stdout,
            "committed staged content\n",
        )
        self.assertEqual(
            self.git("show", "HEAD:unstaged.txt").stdout,
            "original unstaged content\n",
        )
        status = self.git("status", "--short").stdout.splitlines()
        self.assertIn(" M unstaged.txt", status)
        self.assertIn("?? untracked.txt", status)
        tree_paths = self.git(
            "ls-tree",
            "-r",
            "--name-only",
            "HEAD",
        ).stdout.splitlines()
        self.assertNotIn("untracked.txt", tree_paths)

    def test_rejects_directory_that_is_not_a_git_repository(self) -> None:
        self.stage_change()
        original_head = self.head()
        non_repository = Path(self.temporary_directory.name) / "not-a-repository"
        non_repository.mkdir()

        result = self.run_script(repository=non_repository)

        self.assert_rejected_without_mutation(result, original_head)

    def test_rejects_repository_subdirectory_instead_of_root(self) -> None:
        self.stage_change()
        original_head = self.head()
        nested_directory = self.repository / "nested"
        nested_directory.mkdir()

        result = self.run_script(repository=nested_directory)

        self.assert_rejected_without_mutation(result, original_head)

    def test_rejects_repository_path_with_surrounding_whitespace(self) -> None:
        self.stage_change()
        original_head = self.head()
        misleading_repository = Path(f"{self.repository} ")

        result = self.run_script(repository=misleading_repository)

        self.assert_rejected_without_mutation(result, original_head)

    def test_rejects_relative_repository_path(self) -> None:
        self.stage_change()
        original_head = self.head()

        result = self.run_script(repository=Path("repository"))

        self.assert_rejected_without_mutation(result, original_head)

    def test_rejects_wrong_expected_branch(self) -> None:
        self.stage_change()
        original_head = self.head()

        result = self.run_script(expected_branch="feature/wrong-branch")

        self.assert_rejected_without_mutation(result, original_head)

    def test_rejects_wrong_expected_head(self) -> None:
        self.stage_change()
        original_head = self.head()

        result = self.run_script(expected_head="0" * 40)

        self.assert_rejected_without_mutation(result, original_head)

    def test_rejects_invalid_commit_type(self) -> None:
        self.stage_change()
        original_head = self.head()

        result = self.run_script(commit_type="feature")

        self.assert_rejected_without_mutation(result, original_head)

    def test_rejects_empty_staged_changes(self) -> None:
        original_head = self.head()

        result = self.run_script(expected_head=original_head)

        self.assert_rejected_without_mutation(
            result,
            original_head,
            staged_path=None,
        )

    def test_rejects_title_with_newline(self) -> None:
        self.stage_change()
        original_head = self.head()

        result = self.run_script(title="첫 줄\n둘째 줄")

        self.assert_rejected_without_mutation(result, original_head)

    def test_rejects_title_with_unicode_line_separator(self) -> None:
        self.stage_change()
        original_head = self.head()

        result = self.run_script(title="첫 줄\u2028둘째 줄")

        self.assert_rejected_without_mutation(result, original_head)

    def test_rejects_title_without_korean_text(self) -> None:
        self.stage_change()
        original_head = self.head()

        result = self.run_script(title="add commit script")

        self.assert_rejected_without_mutation(result, original_head)

    def test_requires_at_least_one_summary(self) -> None:
        self.stage_change()
        original_head = self.head()

        result = self.run_script(summaries=())

        self.assert_rejected_without_mutation(result, original_head)

    def test_rejects_blank_summary(self) -> None:
        self.stage_change()
        original_head = self.head()

        result = self.run_script(summaries=("   ",))

        self.assert_rejected_without_mutation(result, original_head)

    def test_rejects_summary_with_newline(self) -> None:
        self.stage_change()
        original_head = self.head()

        result = self.run_script(summaries=("첫 줄\n둘째 줄",))

        self.assert_rejected_without_mutation(result, original_head)

    def test_rejects_summary_without_korean_text(self) -> None:
        self.stage_change()
        original_head = self.head()

        result = self.run_script(summaries=("add validation",))

        self.assert_rejected_without_mutation(result, original_head)

    def test_ignores_git_index_environment_override(self) -> None:
        self.stage_change()
        rogue_index = Path(self.temporary_directory.name) / "rogue-index"

        result = self.run_script(
            environment_overrides={"GIT_INDEX_FILE": str(rogue_index)},
        )

        self.assertEqual(
            result.returncode,
            0,
            msg=f"stdout={result.stdout!r}\nstderr={result.stderr!r}",
        )
        self.assertFalse(rogue_index.exists())
        self.assertEqual(
            self.git("log", "-1", "--format=%s").stdout.strip(),
            "feat: 커밋 스크립트 추가",
        )

    def test_respects_existing_commit_message_hook(self) -> None:
        self.stage_change()
        original_head = self.head()
        hook_path = self.hooks_directory / "commit-msg"
        hook_path.write_text(
            "#!/bin/sh\necho 'hook rejected commit' >&2\nexit 1\n",
            encoding="utf-8",
        )
        hook_path.chmod(0o755)

        result = self.run_script(expected_head=original_head)

        self.assertIn("hook rejected commit", result.stderr)
        self.assert_rejected_without_mutation(result, original_head)

    def test_rejects_git_config_environment_hook_override(self) -> None:
        self.stage_change()
        original_head = self.head()
        hook_path = self.hooks_directory / "commit-msg"
        hook_path.write_text(
            "#!/bin/sh\necho 'protected hook executed' >&2\nexit 1\n",
            encoding="utf-8",
        )
        hook_path.chmod(0o755)
        bypass_hooks = Path(self.temporary_directory.name) / "bypass-hooks"
        bypass_hooks.mkdir()

        result = self.run_script(
            expected_head=original_head,
            environment_overrides={
                "GIT_CONFIG_COUNT": "1",
                "GIT_CONFIG_KEY_0": "core.hooksPath",
                "GIT_CONFIG_VALUE_0": str(bypass_hooks),
            },
        )

        self.assertIn("protected hook executed", result.stderr)
        self.assert_rejected_without_mutation(result, original_head)

    def test_rejects_each_in_progress_git_operation(self) -> None:
        self.stage_change()
        original_head = self.head()
        markers = (
            ("MERGE_HEAD", False),
            ("CHERRY_PICK_HEAD", False),
            ("REVERT_HEAD", False),
            ("BISECT_LOG", False),
            ("rebase-merge", True),
            ("rebase-apply", True),
        )

        for marker, is_directory in markers:
            with self.subTest(marker=marker):
                marker_path = Path(
                    self.git("rev-parse", "--git-path", marker).stdout.strip()
                )
                if not marker_path.is_absolute():
                    marker_path = self.repository / marker_path
                if is_directory:
                    marker_path.mkdir()
                else:
                    marker_path.write_text(
                        f"{original_head}\n",
                        encoding="utf-8",
                    )

                result = self.run_script(expected_head=original_head)

                self.assert_rejected_without_mutation(result, original_head)
                if is_directory:
                    marker_path.rmdir()
                else:
                    marker_path.unlink()

    def test_preserves_shell_metacharacters_as_literal_message_text(self) -> None:
        self.stage_change()
        sentinel = Path(self.temporary_directory.name) / "must-not-exist"
        title = f"안전성 $(touch {sentinel})"

        result = self.run_script(
            title=title,
            summaries=("메타문자 `whoami`; 그대로 유지",),
        )

        self.assertEqual(
            result.returncode,
            0,
            msg=f"stdout={result.stdout!r}\nstderr={result.stderr!r}",
        )
        self.assertFalse(sentinel.exists())
        self.assertEqual(
            self.git("log", "-1", "--format=%s").stdout.strip(),
            f"feat: {title}",
        )


if __name__ == "__main__":
    unittest.main()
