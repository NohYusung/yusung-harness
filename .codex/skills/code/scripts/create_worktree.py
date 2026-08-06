#!/usr/bin/env python3
"""Create a named Git worktree under a repository's .worktree directory."""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path
from typing import Callable, Sequence


WORKTREE_NAME_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
CommandRunner = Callable[..., subprocess.CompletedProcess[str]]


class WorktreeCreationError(RuntimeError):
    """Raised when a worktree cannot be validated or created safely."""


def normalize_worktree_name(value: str) -> str:
    """Normalize the `/code --worktree -name` argument to a Git branch name."""
    if value.startswith("-") and not value.startswith("--"):
        value = value[1:]

    if not value or not WORKTREE_NAME_PATTERN.fullmatch(value):
        raise WorktreeCreationError(
            "worktree_name must contain only letters, numbers, '.', '_', or '-' "
            "and must start with a letter or number"
        )

    return value


def _run_command(
    command: list[str],
    runner: CommandRunner,
) -> subprocess.CompletedProcess[str]:
    try:
        return runner(
            command,
            check=True,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError as error:
        raise WorktreeCreationError("git executable was not found") from error
    except subprocess.CalledProcessError as error:
        detail = (error.stderr or error.stdout or str(error)).strip()
        raise WorktreeCreationError(f"git command failed: {detail}") from error


def create_worktree(
    target_repo: str | Path,
    worktree_name: str,
    *,
    runner: CommandRunner | None = None,
) -> Path:
    """Create `<target_repo>/.worktree/<name>` on a same-named branch."""
    normalized_name = normalize_worktree_name(worktree_name)
    repository_root = Path(target_repo).expanduser().resolve()

    if not repository_root.is_dir():
        raise WorktreeCreationError(
            f"target_repo is not a directory: {repository_root}"
        )

    command_runner = runner or subprocess.run
    top_level_result = _run_command(
        [
            "git",
            "-C",
            str(repository_root),
            "rev-parse",
            "--show-toplevel",
        ],
        command_runner,
    )

    top_level_output = top_level_result.stdout.strip()
    if not top_level_output:
        raise WorktreeCreationError("git rev-parse returned an empty repository root")

    actual_root = Path(top_level_output).expanduser().resolve()
    if actual_root != repository_root:
        raise WorktreeCreationError(
            "target_repo must be the repository root: "
            f"expected {actual_root}, got {repository_root}"
        )

    _run_command(
        ["git", "check-ref-format", "--branch", normalized_name],
        command_runner,
    )

    worktree_root = repository_root / ".worktree"
    worktree_path = worktree_root / normalized_name

    if worktree_root.is_symlink() or (
        worktree_root.exists() and not worktree_root.is_dir()
    ):
        raise WorktreeCreationError(
            f"worktree root must be a real directory: {worktree_root}"
        )
    if worktree_path.exists() or worktree_path.is_symlink():
        raise WorktreeCreationError(f"worktree path already exists: {worktree_path}")

    try:
        worktree_root.mkdir(exist_ok=True)
    except OSError as error:
        raise WorktreeCreationError(
            f"failed to create worktree root {worktree_root}: {error}"
        ) from error

    _run_command(
        [
            "git",
            "-C",
            str(repository_root),
            "worktree",
            "add",
            "-b",
            normalized_name,
            str(worktree_path),
        ],
        command_runner,
    )

    return worktree_path


def create_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Create a named Git worktree under <target_repo>/.worktree.",
    )
    parser.add_argument("--target-repo", required=True)
    parser.add_argument("--worktree-name", required=True)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = create_parser().parse_args(argv)

    try:
        worktree_path = create_worktree(
            target_repo=args.target_repo,
            worktree_name=args.worktree_name,
        )
    except WorktreeCreationError as error:
        print(f"Worktree creation failed: {error}", file=sys.stderr)
        return 1

    print(worktree_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
