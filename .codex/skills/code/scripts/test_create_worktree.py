import subprocess
import tempfile
import unittest
from pathlib import Path

import create_worktree


class FakeGitRunner:
    def __init__(self, repository_root: Path) -> None:
        self.repository_root = repository_root
        self.commands: list[list[str]] = []
        self.keyword_arguments: list[dict] = []

    def __call__(self, command, **kwargs):
        self.commands.append(command)
        self.keyword_arguments.append(kwargs)
        if command[-2:] == ["rev-parse", "--show-toplevel"]:
            stdout = f"{self.repository_root}\n"
        else:
            stdout = ""

        return subprocess.CompletedProcess(command, 0, stdout=stdout, stderr="")


class CreateWorktreeTests(unittest.TestCase):
    def test_creates_named_worktree_from_repository_root(self) -> None:
        with tempfile.TemporaryDirectory() as temp_directory:
            repository_root = Path(temp_directory).resolve()
            runner = FakeGitRunner(repository_root)

            result = create_worktree.create_worktree(
                repository_root,
                "feature-test",
                runner=runner,
            )

            expected_path = repository_root / ".worktree" / "feature-test"
            self.assertEqual(result, expected_path)
            self.assertTrue(expected_path.parent.is_dir())
            self.assertEqual(
                runner.commands,
                [
                    [
                        "git",
                        "-C",
                        str(repository_root),
                        "rev-parse",
                        "--show-toplevel",
                    ],
                    [
                        "git",
                        "check-ref-format",
                        "--branch",
                        "feature-test",
                    ],
                    [
                        "git",
                        "-C",
                        str(repository_root),
                        "worktree",
                        "add",
                        "-b",
                        "feature-test",
                        str(expected_path),
                    ],
                ],
            )
            self.assertTrue(
                all(
                    keyword_arguments
                    == {
                        "check": True,
                        "capture_output": True,
                        "text": True,
                    }
                    for keyword_arguments in runner.keyword_arguments
                )
            )

    def test_strips_command_argument_prefix_from_worktree_name(self) -> None:
        with tempfile.TemporaryDirectory() as temp_directory:
            repository_root = Path(temp_directory).resolve()
            runner = FakeGitRunner(repository_root)

            result = create_worktree.create_worktree(
                repository_root,
                "-feature-test",
                runner=runner,
            )

            self.assertEqual(
                result,
                repository_root / ".worktree" / "feature-test",
            )
            self.assertIn(
                ["git", "check-ref-format", "--branch", "feature-test"],
                runner.commands,
            )

    def test_rejects_target_that_is_not_repository_root(self) -> None:
        with tempfile.TemporaryDirectory() as temp_directory:
            repository_root = Path(temp_directory).resolve()
            target_directory = repository_root / "packages" / "api"
            target_directory.mkdir(parents=True)
            runner = FakeGitRunner(repository_root)

            with self.assertRaisesRegex(
                create_worktree.WorktreeCreationError,
                "must be the repository root",
            ):
                create_worktree.create_worktree(
                    target_directory,
                    "feature-test",
                    runner=runner,
                )

            self.assertEqual(len(runner.commands), 1)

    def test_rejects_invalid_worktree_names_without_running_git(self) -> None:
        invalid_names = (
            "",
            "-",
            "--feature-test",
            ".",
            "..",
            "feature/test",
            "feature test",
        )

        with tempfile.TemporaryDirectory() as temp_directory:
            repository_root = Path(temp_directory).resolve()

            for worktree_name in invalid_names:
                with self.subTest(worktree_name=worktree_name):
                    runner = FakeGitRunner(repository_root)
                    with self.assertRaises(create_worktree.WorktreeCreationError):
                        create_worktree.create_worktree(
                            repository_root,
                            worktree_name,
                            runner=runner,
                        )
                    self.assertEqual(runner.commands, [])

    def test_rejects_existing_worktree_path(self) -> None:
        with tempfile.TemporaryDirectory() as temp_directory:
            repository_root = Path(temp_directory).resolve()
            existing_path = repository_root / ".worktree" / "feature-test"
            existing_path.mkdir(parents=True)
            runner = FakeGitRunner(repository_root)

            with self.assertRaisesRegex(
                create_worktree.WorktreeCreationError,
                "already exists",
            ):
                create_worktree.create_worktree(
                    repository_root,
                    "feature-test",
                    runner=runner,
                )

            self.assertEqual(len(runner.commands), 2)

    def test_wraps_git_failures(self) -> None:
        with tempfile.TemporaryDirectory() as temp_directory:
            repository_root = Path(temp_directory).resolve()

            def failing_runner(command, **kwargs):
                del kwargs
                raise subprocess.CalledProcessError(
                    returncode=128,
                    cmd=command,
                    stderr="fatal: not a git repository",
                )

            with self.assertRaisesRegex(
                create_worktree.WorktreeCreationError,
                "not a git repository",
            ):
                create_worktree.create_worktree(
                    repository_root,
                    "feature-test",
                    runner=failing_runner,
                )

    def test_creates_a_real_git_worktree(self) -> None:
        with tempfile.TemporaryDirectory() as temp_directory:
            repository_root = Path(temp_directory, "repository").resolve()
            repository_root.mkdir()
            subprocess.run(
                ["git", "init", "--quiet", str(repository_root)],
                check=True,
            )
            subprocess.run(
                [
                    "git",
                    "-C",
                    str(repository_root),
                    "-c",
                    "user.name=Codex Test",
                    "-c",
                    "user.email=codex@example.invalid",
                    "commit",
                    "--quiet",
                    "--allow-empty",
                    "-m",
                    "Initial commit",
                ],
                check=True,
            )

            worktree_path = create_worktree.create_worktree(
                repository_root,
                "-feature-test",
            )

            branch = subprocess.run(
                ["git", "-C", str(worktree_path), "branch", "--show-current"],
                check=True,
                capture_output=True,
                text=True,
            ).stdout.strip()
            actual_root = subprocess.run(
                ["git", "-C", str(worktree_path), "rev-parse", "--show-toplevel"],
                check=True,
                capture_output=True,
                text=True,
            ).stdout.strip()

            self.assertEqual(branch, "feature-test")
            self.assertEqual(Path(actual_root).resolve(), worktree_path)


if __name__ == "__main__":
    unittest.main()
