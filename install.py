#!/usr/bin/env python3
"""Install the Codex harness and the yusung-harness-doc workspace."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Protocol, Sequence


SOURCE_ROOT = Path(__file__).resolve().parent

PROFILE = "codex"
PAYLOAD_ROOTS: tuple[Path, ...] = (
    Path("AGENTS.md"),
    Path("docs"),
    Path(".codex"),
    Path("apps"),
)
REQUIRED_APP_FILES: tuple[Path, ...] = (
    Path("apps/.gitignore"),
    Path("apps/package.json"),
    Path("apps/pnpm-lock.yaml"),
    Path("apps/pnpm-workspace.yaml"),
    Path("apps/server/package.json"),
    Path("apps/server/.env.example"),
    Path("apps/web/package.json"),
    Path("apps/web/.env.example"),
)

MANAGEMENT_DIRECTORY = Path(".yusung-harness")
MANIFEST_PATH = MANAGEMENT_DIRECTORY / "install-manifest.json"
LOCK_PATH = MANAGEMENT_DIRECTORY / "install.lock"
BACKUP_DIRECTORY = MANAGEMENT_DIRECTORY / "backups"
MANAGEMENT_GITIGNORE_PATH = MANAGEMENT_DIRECTORY / ".gitignore"
MANAGEMENT_GITIGNORE_CONTENT = "*\n!.gitignore\n"
WORKSPACE_PATH = Path("apps")

SERVER_ENV_PATH = Path("apps/server/.env")
WEB_ENV_PATH = Path("apps/web/.env.local")
GENERATED_ENVIRONMENTS: dict[Path, str] = {
    SERVER_ENV_PATH: 'DATABASE_URL="file:./harness-board.db"\nPORT=4000\n',
    WEB_ENV_PATH: (
        'HARNESS_API_URL="http://127.0.0.1:4000"\n'
        'HARNESS_MCP_URL="http://127.0.0.1:4000/mcp"\n'
    ),
}

MANIFEST_SCHEMA_VERSION = 1
REQUIRED_NODE_MAJOR = 22
REQUIRED_PNPM_VERSION = "11.7.0"
FORBIDDEN_INSTALL_SCRIPTS = frozenset(
    {"preinstall", "install", "postinstall", "prepare"}
)

GENERAL_EXCLUDED_DIRECTORIES = frozenset({"__pycache__"})
APP_EXCLUDED_DIRECTORIES = frozenset(
    {
        ".cache",
        ".next",
        ".pnpm-store",
        ".swc",
        ".turbo",
        ".vercel",
        "coverage",
        "dist",
        "node_modules",
        "out",
    }
)
DATABASE_SUFFIXES = (".db", ".db-journal", ".db-shm", ".db-wal")

# Exact SHA-256 values from the pre-manifest Codex layout at 08c97d9.
# A legacy file is removable only when its bytes still match one of these values.
LEGACY_FINGERPRINTS: dict[str, str] = {
    ".codex/agents/architect.md": "d73fc2bc32249cd0218121d7fcea2aaebddf157da0b498cc41bc9ab8e7e1e45d",
    ".codex/agents/architect.toml": "a3049a6250794773fffba3ddfa27631b53c422767e75e2a59b1af8e0983081d9",
    ".codex/agents/coder.md": "61527118e87b7b6506f13bb22bb64211b44d2cfe1ced2b7767da76e7b1f1b4d7",
    ".codex/agents/coder.toml": "9132e5b03e6a8f7e3e2fb236bbf7f7d33efa02c788caff1e4e9b90dfec62cf24",
    ".codex/agents/designer.md": "66ff5784be265b9b90cd10c182c1447fca9f3db892001ae0b6895fcd49cfa817",
    ".codex/agents/designer.toml": "b71b9c66a6eca9a38d6f16b3dd4268093da211cf30b21a69f19959f37d82792a",
    ".codex/agents/doc-curator.md": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    ".codex/agents/doc-curator.toml": "3cd8b42310e5ebfed52fbe359dcd49f4b721e1cb2c68f06ee47a245faf06e0df",
    ".codex/agents/drafter.md": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    ".codex/agents/drafter.toml": "80124b6d0fcab98e2a1d368631f9ee9b3d5d63f8c94a43a1078a2747287bec49",
    ".codex/agents/planner.md": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    ".codex/agents/planner.toml": "5adb9c1929b5527e5e8a1b2f9f5f96044780379cee705eee13ae9ea72b06b1fd",
    ".codex/agents/reviewer.md": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    ".codex/agents/reviewer.toml": "8b643fcfcee04027e214eb0f3f0b567cfe9d2c04aef1a4c385957b7f4bdd82ac",
    ".codex/agents/tester.md": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    ".codex/agents/tester.toml": "a2160add9936db0774e8ad6dd5bc8a607d89593c8cebb752bc0dd2fec3f0780c",
    ".codex/skills/document/SKILL.md": "a702077ec230146b1d2c7ee0dbc56c0d3387a4fb525b8971da9d89dbfe78c89a",
}
LEGACY_REFERENCE_ROOTS: tuple[Path, ...] = (
    Path("CLAUDE.md"),
    Path(".agents"),
    Path(".claude"),
    Path("docs/.DS_Store"),
    Path("docs/conventions/.DS_Store"),
)


class CommandRunner(Protocol):
    """Run a command without a shell in a specified working directory."""

    def __call__(
        self,
        command: tuple[str, ...],
        cwd: Path,
    ) -> subprocess.CompletedProcess[str]: ...


@dataclass(frozen=True)
class InstallOptions:
    """User-selected installer behavior."""

    target: Path
    profile: str = PROFILE
    dry_run: bool = False
    force: bool = False
    backup: bool = False
    sync: bool = False


@dataclass
class InstallStats:
    """Counters reported at the end of an installer run."""

    copied: int = 0
    updated: int = 0
    skipped: int = 0
    created_dirs: int = 0
    removed: int = 0
    backups: int = 0
    conflicts: int = 0


@dataclass(frozen=True)
class Payload:
    """Deterministic source files, directories, and source digests."""

    files: tuple[tuple[Path, Path], ...]
    directories: tuple[Path, ...]
    digests: dict[str, str]


@dataclass(frozen=True)
class Action:
    """One immutable filesystem action selected during preflight."""

    kind: str
    relative: Path
    source: Path | None = None
    source_digest: str | None = None
    target_digest: str | None = None
    content: str | None = None
    backup: bool = False
    detail: str | None = None


@dataclass(frozen=True)
class InstallPlan:
    """A conflict-free set of changes and the next manifest file map."""

    directories: tuple[Path, ...]
    actions: tuple[Action, ...]
    manifest_files: dict[str, str]


def parse_args(argv: Sequence[str] | None = None) -> InstallOptions:
    """Parse the Codex-only installer CLI."""

    parser = argparse.ArgumentParser(
        description="Install yusung-harness and yusung-harness-doc into a project",
    )
    parser.add_argument("target", help="Target project directory")
    parser.add_argument(
        "--profile",
        choices=(PROFILE,),
        default=PROFILE,
        help="Deprecated compatibility option; only codex is supported",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate and print the plan without changing the target",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite changed installer-managed files",
    )
    parser.add_argument(
        "--backup",
        action="store_true",
        help="Back up managed files before --force overwrites them",
    )
    parser.add_argument(
        "--sync",
        action="store_true",
        help="Safely remove byte-identical obsolete managed files",
    )

    args = parser.parse_args(argv)
    if args.backup and not args.force:
        parser.error("--backup requires --force")

    target = Path(args.target).expanduser()
    if not target.is_absolute():
        target = Path.cwd() / target
    return InstallOptions(
        target=target.absolute(),
        profile=args.profile,
        dry_run=args.dry_run,
        force=args.force,
        backup=args.backup,
        sync=args.sync,
    )


def log(action: str, path: Path | str, detail: str | None = None) -> None:
    """Print one stable installer action line."""

    message = f"{action:10} {path}"
    if detail:
        message += f" ({detail})"
    print(message)


def run_command(
    command: tuple[str, ...],
    cwd: Path,
) -> subprocess.CompletedProcess[str]:
    """Run a dependency command without invoking a shell."""

    return subprocess.run(
        command,
        cwd=cwd,
        capture_output=True,
        check=False,
        text=True,
    )


def file_digest(path: Path) -> str:
    """Return a file's SHA-256 digest."""

    digest = hashlib.sha256()
    with path.open("rb") as source_file:
        for chunk in iter(lambda: source_file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def is_relative_to(path: Path, parent: Path) -> bool:
    """Compatibility helper for Python versions before Path.is_relative_to."""

    try:
        path.relative_to(parent)
    except ValueError:
        return False
    return True


def is_excluded(relative: Path) -> bool:
    """Exclude secrets, runtime data, dependency trees, and generated output."""

    if any(part in GENERAL_EXCLUDED_DIRECTORIES for part in relative.parts):
        return True
    if relative.name == ".DS_Store":
        return True
    if relative.name.endswith((".pyc", ".pyo", ".swp", ".tmp", "~")):
        return True
    if ".bak." in relative.name or relative.name.endswith(".bak"):
        return True

    if not relative.parts or relative.parts[0] != "apps":
        return False
    if any(part in APP_EXCLUDED_DIRECTORIES for part in relative.parts[1:]):
        return True
    if is_relative_to(relative, Path("apps/server/src/generated/prisma")):
        return True

    name = relative.name
    if name.startswith(".env") and not name.endswith(".example"):
        return True
    if name == "next-env.d.ts" or name.endswith((".tsbuildinfo", ".log")):
        return True
    if name.endswith(DATABASE_SUFFIXES):
        return True
    return False


def is_managed_path(relative: Path) -> bool:
    """Return whether a manifest path is inside an installer-owned payload root."""

    if (
        relative.is_absolute()
        or ".." in relative.parts
        or relative == Path(".")
        or any("\x00" in part for part in relative.parts)
    ):
        return False
    if relative in GENERATED_ENVIRONMENTS or is_excluded(relative):
        return False
    if relative in {Path("docs"), Path(".codex"), Path("apps")}:
        return False
    for root in PAYLOAD_ROOTS:
        if root == Path("AGENTS.md"):
            if relative == root:
                return True
            continue
        if relative == root or is_relative_to(relative, root):
            return True
    return False


def record_conflict(
    stats: InstallStats,
    seen: set[tuple[str, str]],
    relative: Path | str,
    detail: str,
) -> None:
    """Record a unique preflight conflict."""

    key = (str(relative), detail)
    if key in seen:
        return
    seen.add(key)
    log("conflict", relative, detail)
    stats.conflicts += 1


def validate_target_scope(options: InstallOptions, stats: InstallStats) -> bool:
    """Reject source/target overlap and invalid target root types."""

    seen: set[tuple[str, str]] = set()
    source = SOURCE_ROOT.resolve()
    target = options.target.resolve(strict=False)
    if target == source or is_relative_to(target, source) or is_relative_to(source, target):
        record_conflict(
            stats,
            seen,
            options.target,
            "target and installer source must not overlap",
        )
    if options.target.is_symlink():
        record_conflict(stats, seen, options.target, "target symlinks are not supported")
    elif options.target.exists() and not options.target.is_dir():
        record_conflict(stats, seen, options.target, "target is not a directory")
    return not seen


def git_tracked_app_files() -> tuple[Path, ...] | None:
    """Return tracked apps files, or None when the source has no Git metadata."""

    try:
        top_level_result = subprocess.run(
            ("git", "rev-parse", "--show-toplevel"),
            cwd=SOURCE_ROOT,
            capture_output=True,
            check=False,
            text=True,
        )
        if top_level_result.returncode != 0:
            return None
        top_level = Path(top_level_result.stdout.strip()).resolve()
        if top_level != SOURCE_ROOT.resolve():
            return None
        result = subprocess.run(
            ("git", "ls-files", "-z", "--", "apps"),
            cwd=SOURCE_ROOT,
            capture_output=True,
            check=False,
            text=False,
        )
    except OSError:
        return None
    if result.returncode != 0:
        return None

    tracked = {
        Path(os.fsdecode(raw_path))
        for raw_path in result.stdout.split(b"\0")
        if raw_path
    }
    tracked.update(REQUIRED_APP_FILES)
    return tuple(sorted(tracked, key=lambda path: path.as_posix()))


def collect_payload(stats: InstallStats) -> Payload:
    """Collect the full distributable Codex and apps payload."""

    seen: set[tuple[str, str]] = set()
    files: dict[str, tuple[Path, Path]] = {}
    directories: set[Path] = set()

    for required in REQUIRED_APP_FILES:
        source = SOURCE_ROOT / required
        if not source.is_file() or source.is_symlink():
            record_conflict(stats, seen, required, "required source file is missing")

    for root in PAYLOAD_ROOTS:
        source_root = SOURCE_ROOT / root
        if not source_root.exists():
            record_conflict(stats, seen, root, "required source path is missing")
            continue
        if source_root.is_symlink():
            record_conflict(stats, seen, root, "source symlinks are not supported")
            continue
        if source_root.is_file():
            files[root.as_posix()] = (source_root, root)
            continue
        if not source_root.is_dir():
            record_conflict(stats, seen, root, "unsupported source path type")
            continue

        directories.add(root)
        if root == Path("apps"):
            tracked_apps = git_tracked_app_files()
            if tracked_apps is not None:
                for relative in tracked_apps:
                    if (
                        not is_relative_to(relative, Path("apps"))
                        or is_excluded(relative)
                    ):
                        continue
                    current = SOURCE_ROOT / relative
                    if current.is_symlink():
                        record_conflict(
                            stats,
                            seen,
                            relative,
                            "source symlinks are not supported",
                        )
                        continue
                    if not current.is_file():
                        record_conflict(
                            stats,
                            seen,
                            relative,
                            "tracked source file is missing",
                        )
                        continue
                    files[relative.as_posix()] = (current, relative)
                    parent = relative.parent
                    while is_relative_to(parent, Path("apps")):
                        directories.add(parent)
                        if parent == Path("apps"):
                            break
                        parent = parent.parent
                continue

        for current_text, directory_names, file_names in os.walk(
            source_root,
            topdown=True,
            followlinks=False,
        ):
            current_directory = Path(current_text)
            retained_directories: list[str] = []
            for directory_name in sorted(directory_names):
                current = current_directory / directory_name
                relative = current.relative_to(SOURCE_ROOT)
                if is_excluded(relative):
                    continue
                if current.is_symlink():
                    record_conflict(
                        stats,
                        seen,
                        relative,
                        "source symlinks are not supported",
                    )
                    continue
                directories.add(relative)
                retained_directories.append(directory_name)
            directory_names[:] = retained_directories

            for file_name in sorted(file_names):
                current = current_directory / file_name
                relative = current.relative_to(SOURCE_ROOT)
                if is_excluded(relative):
                    continue
                if current.is_symlink():
                    record_conflict(
                        stats,
                        seen,
                        relative,
                        "source symlinks are not supported",
                    )
                elif current.is_file():
                    files[relative.as_posix()] = (current, relative)
                else:
                    record_conflict(
                        stats,
                        seen,
                        relative,
                        "unsupported source path type",
                    )

    ordered_files = tuple(files[key] for key in sorted(files))
    ordered_directories = tuple(
        sorted(directories, key=lambda path: (len(path.parts), path.as_posix()))
    )
    digests = {
        relative.as_posix(): file_digest(source)
        for source, relative in ordered_files
    }
    return Payload(ordered_files, ordered_directories, digests)


def load_json_object(path: Path) -> dict[str, object]:
    """Load a JSON object or raise a concise value error."""

    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ValueError(str(error)) from error
    if not isinstance(value, dict):
        raise ValueError("top-level JSON value must be an object")
    return value


def validate_workspace_contract(stats: InstallStats) -> bool:
    """Prevent pnpm install lifecycle scripts from expanding installer scope."""

    package_paths = (
        Path("apps/package.json"),
        Path("apps/server/package.json"),
        Path("apps/web/package.json"),
    )
    valid = True
    for relative in package_paths:
        try:
            package = load_json_object(SOURCE_ROOT / relative)
        except ValueError as error:
            log("runtime", relative, f"invalid package manifest: {error}")
            valid = False
            continue
        scripts = package.get("scripts", {})
        if not isinstance(scripts, dict):
            log("runtime", relative, "scripts must be an object")
            valid = False
            continue
        forbidden = sorted(FORBIDDEN_INSTALL_SCRIPTS.intersection(scripts))
        if forbidden:
            log(
                "runtime",
                relative,
                f"forbidden pnpm install lifecycle scripts: {', '.join(forbidden)}",
            )
            valid = False

    try:
        root_package = load_json_object(SOURCE_ROOT / "apps/package.json")
    except ValueError:
        return False
    if root_package.get("packageManager") != f"pnpm@{REQUIRED_PNPM_VERSION}":
        log(
            "runtime",
            "apps/package.json",
            f"packageManager must be pnpm@{REQUIRED_PNPM_VERSION}",
        )
        valid = False
    return valid


def command_detail(result: subprocess.CompletedProcess[str]) -> str:
    """Return a compact diagnostic for a failed command."""

    output = (result.stderr or result.stdout or "").strip()
    return output.splitlines()[-1] if output else f"exit code {result.returncode}"


def invoke(
    command: tuple[str, ...],
    cwd: Path,
    runner: CommandRunner,
) -> subprocess.CompletedProcess[str] | None:
    """Run a command and report process creation errors without a shell."""

    try:
        return runner(command, cwd)
    except OSError as error:
        log("runtime", command[0], str(error))
        return None


def check_runtime_dependencies(runner: CommandRunner) -> bool:
    """Require Node >=22 and the repository-pinned pnpm version."""

    node_result = invoke(("node", "--version"), SOURCE_ROOT, runner)
    if node_result is None or node_result.returncode != 0:
        if node_result is not None:
            log("runtime", "node --version", command_detail(node_result))
        return False
    node_version = (node_result.stdout or "").strip()
    node_match = re.fullmatch(r"v?(\d+)(?:\.\d+){0,2}", node_version)
    if node_match is None or int(node_match.group(1)) < REQUIRED_NODE_MAJOR:
        log("runtime", "node", f"requires Node >=22; got {node_version!r}")
        return False
    log("check", "node", node_version)

    pnpm_result = invoke(("pnpm", "--version"), SOURCE_ROOT, runner)
    if pnpm_result is None or pnpm_result.returncode != 0:
        if pnpm_result is not None:
            log("runtime", "pnpm --version", command_detail(pnpm_result))
        return False
    pnpm_version = (pnpm_result.stdout or "").strip()
    if pnpm_version != REQUIRED_PNPM_VERSION:
        log(
            "runtime",
            "pnpm",
            f"requires pnpm {REQUIRED_PNPM_VERSION}; got {pnpm_version!r}",
        )
        return False
    log("check", "pnpm", pnpm_version)
    return True


def validate_path_chain(
    target: Path,
    relative: Path,
    leaf_kind: str,
    stats: InstallStats,
    seen: set[tuple[str, str]],
) -> bool:
    """Reject symlinks and file/directory collisions along a target path."""

    if target.is_symlink() or (target.exists() and not target.is_dir()):
        record_conflict(stats, seen, target, "target root is not a real directory")
        return False

    parts = relative.parts
    for index in range(1, len(parts) + 1):
        partial = Path(*parts[:index])
        destination = target / partial
        is_leaf = index == len(parts)
        if destination.is_symlink():
            record_conflict(stats, seen, partial, "target symlinks are not supported")
            return False
        if not destination.exists():
            continue
        expected = leaf_kind if is_leaf else "directory"
        if expected == "directory" and not destination.is_dir():
            record_conflict(stats, seen, partial, "target is not a directory")
            return False
        if expected == "file" and not destination.is_file():
            record_conflict(stats, seen, partial, "target is not a regular file")
            return False
    return True


def validate_management_paths(options: InstallOptions, stats: InstallStats) -> bool:
    """Validate installer metadata paths without creating them."""

    seen: set[tuple[str, str]] = set()
    validate_path_chain(
        options.target,
        MANAGEMENT_DIRECTORY,
        "directory",
        stats,
        seen,
    )
    validate_path_chain(options.target, MANIFEST_PATH, "file", stats, seen)
    validate_path_chain(
        options.target,
        MANAGEMENT_GITIGNORE_PATH,
        "file",
        stats,
        seen,
    )
    validate_path_chain(
        options.target,
        BACKUP_DIRECTORY,
        "directory",
        stats,
        seen,
    )
    lock = options.target / LOCK_PATH
    if lock.exists() or lock.is_symlink():
        record_conflict(stats, seen, LOCK_PATH, "another install is active or left a lock")
    return not seen


def read_manifest(options: InstallOptions, stats: InstallStats) -> dict[str, str]:
    """Read and validate installer ownership from a previous run."""

    manifest_path = options.target / MANIFEST_PATH
    if not manifest_path.exists():
        return {}
    try:
        manifest = load_json_object(manifest_path)
    except ValueError as error:
        log("conflict", MANIFEST_PATH, f"invalid manifest: {error}")
        stats.conflicts += 1
        return {}

    files = manifest.get("files")
    dependencies = manifest.get("dependencies")
    if (
        manifest.get("schemaVersion") != MANIFEST_SCHEMA_VERSION
        or manifest.get("profile") != PROFILE
        or not isinstance(files, dict)
        or not isinstance(dependencies, dict)
        or dependencies.get("manager") != "pnpm"
        or dependencies.get("requiredVersion") != REQUIRED_PNPM_VERSION
        or dependencies.get("status") not in {"prepared", "failed"}
    ):
        log("conflict", MANIFEST_PATH, "unsupported manifest schema")
        stats.conflicts += 1
        return {}

    validated: dict[str, str] = {}
    for relative_text, digest in files.items():
        if not isinstance(relative_text, str) or not isinstance(digest, str):
            log("conflict", MANIFEST_PATH, "manifest file entries must be strings")
            stats.conflicts += 1
            continue
        relative = Path(relative_text)
        if not is_managed_path(relative) or re.fullmatch(r"[0-9a-f]{64}", digest) is None:
            log("conflict", MANIFEST_PATH, f"unsafe file entry: {relative_text}")
            stats.conflicts += 1
            continue
        validated[relative.as_posix()] = digest
    lockfile_digest = validated.get("apps/pnpm-lock.yaml")
    if dependencies.get("lockfileSha256") != lockfile_digest:
        log("conflict", MANIFEST_PATH, "dependency lockfile hash does not match files")
        stats.conflicts += 1
    return validated


def collect_legacy_fingerprints() -> dict[str, str]:
    """Combine pinned legacy hashes with exact reference payload hashes."""

    fingerprints = dict(LEGACY_FINGERPRINTS)
    for root in LEGACY_REFERENCE_ROOTS:
        source_root = SOURCE_ROOT / root
        if source_root.is_file() and not source_root.is_symlink():
            fingerprints[root.as_posix()] = file_digest(source_root)
            continue
        if not source_root.is_dir() or source_root.is_symlink():
            continue
        for current in sorted(source_root.rglob("*")):
            if current.is_file() and not current.is_symlink():
                relative = current.relative_to(SOURCE_ROOT)
                fingerprints[relative.as_posix()] = file_digest(current)
    return fingerprints


def build_plan(
    payload: Payload,
    previous_files: dict[str, str],
    options: InstallOptions,
    stats: InstallStats,
) -> InstallPlan:
    """Compute every filesystem action before the first target write."""

    seen: set[tuple[str, str]] = set()
    actions: list[Action] = []
    missing_directories: list[Path] = []

    for relative in payload.directories:
        if validate_path_chain(options.target, relative, "directory", stats, seen):
            if not (options.target / relative).exists():
                missing_directories.append(relative)

    for source, relative in payload.files:
        if not validate_path_chain(options.target, relative, "file", stats, seen):
            continue
        destination = options.target / relative
        source_hash = payload.digests[relative.as_posix()]
        if not destination.exists():
            actions.append(
                Action("copy", relative, source, source_digest=source_hash)
            )
            continue
        target_hash = file_digest(destination)
        if target_hash == source_hash:
            actions.append(
                Action(
                    "skip",
                    relative,
                    source,
                    source_digest=source_hash,
                    target_digest=target_hash,
                    detail="unchanged",
                )
            )
        elif options.force:
            actions.append(
                Action(
                    "update",
                    relative,
                    source,
                    source_digest=source_hash,
                    target_digest=target_hash,
                    backup=options.backup,
                )
            )
        else:
            record_conflict(
                stats,
                seen,
                relative,
                "changed managed file; use --force to overwrite",
            )

    for relative, content in GENERATED_ENVIRONMENTS.items():
        if not validate_path_chain(options.target, relative, "file", stats, seen):
            continue
        destination = options.target / relative
        if destination.exists():
            actions.append(
                Action(
                    "preserve",
                    relative,
                    detail="preserved runtime config",
                )
            )
        else:
            actions.append(Action("generate", relative, content=content))

    if validate_path_chain(
        options.target,
        MANAGEMENT_GITIGNORE_PATH,
        "file",
        stats,
        seen,
    ):
        management_ignore = options.target / MANAGEMENT_GITIGNORE_PATH
        expected_digest = hashlib.sha256(
            MANAGEMENT_GITIGNORE_CONTENT.encode("utf-8")
        ).hexdigest()
        if not management_ignore.exists():
            actions.append(
                Action(
                    "generate-management",
                    MANAGEMENT_GITIGNORE_PATH,
                    source_digest=expected_digest,
                    content=MANAGEMENT_GITIGNORE_CONTENT,
                    detail="protect installer metadata from target Git",
                )
            )
        else:
            target_hash = file_digest(management_ignore)
            if target_hash != expected_digest:
                record_conflict(
                    stats,
                    seen,
                    MANAGEMENT_GITIGNORE_PATH,
                    "installer metadata ignore file has changed",
                )
            else:
                actions.append(
                    Action(
                        "skip",
                        MANAGEMENT_GITIGNORE_PATH,
                        target_digest=target_hash,
                        detail="installer metadata already protected",
                    )
                )

    manifest_files = dict(payload.digests)
    if not options.sync:
        for relative, digest in previous_files.items():
            manifest_files.setdefault(relative, digest)
    else:
        stale: dict[str, str] = {
            relative: digest
            for relative, digest in previous_files.items()
            if relative not in payload.digests
        }
        for relative, digest in collect_legacy_fingerprints().items():
            if relative not in payload.digests:
                stale.setdefault(relative, digest)

        for relative_text in sorted(stale):
            relative = Path(relative_text)
            if relative in GENERATED_ENVIRONMENTS or is_excluded(relative):
                continue
            if not validate_path_chain(options.target, relative, "file", stats, seen):
                continue
            destination = options.target / relative
            if not destination.exists():
                continue
            target_hash = file_digest(destination)
            if target_hash != stale[relative_text]:
                record_conflict(
                    stats,
                    seen,
                    relative,
                    "modified obsolete file was preserved",
                )
                continue
            actions.append(
                Action(
                    "remove",
                    relative,
                    target_digest=target_hash,
                    backup=True,
                    detail="obsolete managed file",
                )
            )

    return InstallPlan(
        directories=tuple(missing_directories),
        actions=tuple(actions),
        manifest_files=dict(sorted(manifest_files.items())),
    )


def emit_plan(plan: InstallPlan, options: InstallOptions, stats: InstallStats) -> None:
    """Print the selected plan and populate summary counters."""

    for relative in plan.directories:
        log("mkdir", relative)
        stats.created_dirs += 1
    for action in plan.actions:
        if action.kind in {"copy", "generate", "generate-management"}:
            log("create" if action.kind != "copy" else "copy", action.relative, action.detail)
            stats.copied += 1
        elif action.kind == "update":
            if action.backup:
                log("backup", action.relative, "before overwrite")
                stats.backups += 1
            log("update", action.relative)
            stats.updated += 1
        elif action.kind in {"skip", "preserve"}:
            log("skip", action.relative, action.detail)
            stats.skipped += 1
        elif action.kind == "remove":
            log("backup", action.relative, "before safe sync removal")
            log("remove", action.relative, action.detail)
            stats.backups += 1
            stats.removed += 1

    log(
        "run",
        "pnpm install --frozen-lockfile",
        f"cwd={options.target / WORKSPACE_PATH}",
    )


def revalidate_plan(
    plan: InstallPlan,
    payload: Payload,
    options: InstallOptions,
    management_guard_applied: bool = False,
) -> None:
    """Detect source or target changes between preflight and application."""

    for source, relative in payload.files:
        expected = payload.digests[relative.as_posix()]
        if not source.is_file() or source.is_symlink() or file_digest(source) != expected:
            raise RuntimeError(f"source changed during install: {relative}")

    for action in plan.actions:
        destination = options.target / action.relative
        if action.kind == "generate-management" and management_guard_applied:
            if (
                action.source_digest is None
                or not destination.is_file()
                or destination.is_symlink()
                or file_digest(destination) != action.source_digest
            ):
                raise RuntimeError(
                    f"installer metadata guard changed during install: {action.relative}"
                )
        elif action.kind in {"copy", "generate", "generate-management"}:
            if destination.exists() or destination.is_symlink():
                raise RuntimeError(f"target changed during install: {action.relative}")
        elif action.target_digest is not None:
            if (
                not destination.is_file()
                or destination.is_symlink()
                or file_digest(destination) != action.target_digest
            ):
                raise RuntimeError(f"target changed during install: {action.relative}")


def atomic_copy(source: Path, destination: Path) -> None:
    """Copy one file through a same-directory temporary and atomic replace."""

    destination.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{destination.name}.tmp.",
        dir=str(destination.parent),
    )
    os.close(descriptor)
    temporary = Path(temporary_name)
    try:
        shutil.copy2(source, temporary)
        os.replace(temporary, destination)
    finally:
        if temporary.exists():
            temporary.unlink()


def atomic_write_text(destination: Path, content: str, mode: int | None = None) -> None:
    """Write text through a same-directory temporary and atomic replace."""

    destination.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{destination.name}.tmp.",
        dir=str(destination.parent),
        text=True,
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as temporary_file:
            temporary_file.write(content)
            temporary_file.flush()
            os.fsync(temporary_file.fileno())
        if mode is not None:
            os.chmod(temporary, mode)
        os.replace(temporary, destination)
    finally:
        if temporary.exists():
            temporary.unlink()


def backup_file(
    source: Path,
    relative: Path,
    options: InstallOptions,
    run_id: str,
    expected_digest: str | None = None,
) -> None:
    """Copy a managed target file into this run's central backup tree."""

    backup_root = options.target / BACKUP_DIRECTORY / run_id
    destination = backup_root / relative
    if destination.exists() or destination.is_symlink():
        raise RuntimeError(f"backup destination already exists: {destination}")
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if os.name == "posix":
        current = destination.parent
        management_root = options.target / MANAGEMENT_DIRECTORY
        while current != options.target:
            os.chmod(current, 0o700)
            if current == management_root:
                break
            current = current.parent
    atomic_copy(source, destination)
    if os.name == "posix":
        os.chmod(destination, 0o600)
    if expected_digest is not None and file_digest(destination) != expected_digest:
        raise RuntimeError(f"backup content changed during copy: {relative}")


def apply_plan(
    plan: InstallPlan,
    payload: Payload,
    options: InstallOptions,
    run_id: str,
) -> None:
    """Apply a previously validated plan."""

    for relative in plan.directories:
        (options.target / relative).mkdir(parents=True, exist_ok=True)

    # Protect installer metadata before a backup can be created. This internal
    # guard may remain after a later failure and is safe to reuse on rerun.
    for action in plan.actions:
        if action.kind == "generate-management":
            if action.content is None:
                raise RuntimeError(f"missing generated content for {action.relative}")
            atomic_write_text(
                options.target / action.relative,
                action.content,
                0o600,
            )

    # Secure every backup before mutating any managed target file. A backup
    # failure therefore cannot leave a partially pruned sync.
    for action in plan.actions:
        if action.backup:
            backup_file(
                options.target / action.relative,
                action.relative,
                options,
                run_id,
                action.target_digest,
            )

    # Close the race between backup and mutation. If any source or target was
    # edited while backups were being secured, preserve every target file.
    revalidate_plan(
        plan,
        payload,
        options,
        management_guard_applied=True,
    )

    for action in plan.actions:
        destination = options.target / action.relative
        if action.kind in {"skip", "preserve", "generate-management"}:
            continue
        if action.kind in {"copy", "update"}:
            if action.source is None:
                raise RuntimeError(f"missing source for {action.relative}")
            atomic_copy(action.source, destination)
        elif action.kind == "generate":
            if action.content is None:
                raise RuntimeError(f"missing generated content for {action.relative}")
            atomic_write_text(destination, action.content, 0o600)
        elif action.kind == "remove":
            destination.unlink()
        else:
            raise RuntimeError(f"unsupported action: {action.kind}")


def write_manifest(
    files: dict[str, str],
    dependency_status: str,
    options: InstallOptions,
) -> None:
    """Atomically persist file ownership and dependency preparation state."""

    lock_digest = files.get("apps/pnpm-lock.yaml")
    manifest = {
        "schemaVersion": MANIFEST_SCHEMA_VERSION,
        "profile": PROFILE,
        "files": dict(sorted(files.items())),
        "dependencies": {
            "manager": "pnpm",
            "requiredVersion": REQUIRED_PNPM_VERSION,
            "lockfileSha256": lock_digest,
            "status": dependency_status,
        },
    }
    atomic_write_text(
        options.target / MANIFEST_PATH,
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
    )


def install_dependencies(options: InstallOptions, runner: CommandRunner) -> bool:
    """Run only the frozen dependency installation stage."""

    command = ("pnpm", "install", "--frozen-lockfile")
    result = invoke(command, options.target / WORKSPACE_PATH, runner)
    if result is None:
        return False
    if result.returncode != 0:
        log("runtime", " ".join(command), command_detail(result))
        output = (result.stderr or result.stdout or "").strip()
        if output:
            print("pnpm output (last 80 lines):")
            for line in output.splitlines()[-80:]:
                print(f"  {line}")
        return False
    return True


class InstallLock:
    """Fail fast when another installer owns the same target lock path."""

    def __init__(self, target: Path) -> None:
        self.path = target / LOCK_PATH
        self.acquired = False

    def __enter__(self) -> "InstallLock":
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        if os.name == "posix":
            os.chmod(self.path.parent, 0o700)
        try:
            descriptor = os.open(
                self.path,
                os.O_CREAT | os.O_EXCL | os.O_WRONLY,
                0o600,
            )
        except FileExistsError as error:
            raise RuntimeError(f"installer lock already exists: {self.path}") from error
        with os.fdopen(descriptor, "w", encoding="utf-8") as lock_file:
            lock_file.write(f"pid={os.getpid()}\n")
        self.acquired = True
        return self

    def __exit__(self, exc_type: object, exc_value: object, traceback: object) -> None:
        if self.acquired:
            try:
                self.path.unlink()
            except FileNotFoundError:
                pass


def print_summary(stats: InstallStats) -> None:
    """Print installer result counters."""

    print()
    print("summary")
    print(f"  copied      : {stats.copied}")
    print(f"  updated     : {stats.updated}")
    print(f"  skipped     : {stats.skipped}")
    print(f"  created dirs: {stats.created_dirs}")
    print(f"  removed     : {stats.removed}")
    print(f"  backups     : {stats.backups}")
    print(f"  conflicts   : {stats.conflicts}")


def install(options: InstallOptions, runner: CommandRunner = run_command) -> int:
    """Install files, preserve runtime state, then prepare frozen dependencies."""

    stats = InstallStats()
    run_id = datetime.now().strftime("%Y%m%d%H%M%S%f")

    print(f"source : {SOURCE_ROOT}")
    print(f"target : {options.target}")
    print(f"profile: {options.profile}")
    print(f"mode   : {'dry-run' if options.dry_run else 'write'}")
    print(f"sync   : {'yes' if options.sync else 'no'}")
    print()

    if options.profile != PROFILE:
        log("conflict", options.profile, "only the codex profile is supported")
        stats.conflicts += 1
        print_summary(stats)
        return 1
    if options.backup and not options.force:
        log("conflict", "--backup", "requires --force")
        stats.conflicts += 1
        print_summary(stats)
        return 1
    if not validate_target_scope(options, stats):
        print_summary(stats)
        return 1

    payload = collect_payload(stats)
    if stats.conflicts:
        print_summary(stats)
        return 1
    if not validate_workspace_contract(stats):
        print_summary(stats)
        return 3
    if not check_runtime_dependencies(runner):
        print_summary(stats)
        return 3
    if not validate_management_paths(options, stats):
        print_summary(stats)
        return 1

    previous_files = read_manifest(options, stats)
    if stats.conflicts:
        print_summary(stats)
        return 1
    plan = build_plan(payload, previous_files, options, stats)
    if stats.conflicts:
        print_summary(stats)
        return 1

    emit_plan(plan, options, stats)
    if options.dry_run:
        print_summary(stats)
        return 0

    try:
        options.target.mkdir(parents=True, exist_ok=True)
        with InstallLock(options.target):
            revalidate_plan(plan, payload, options)
            apply_plan(plan, payload, options, run_id)
            write_manifest(plan.manifest_files, "failed", options)
            if not install_dependencies(options, runner):
                print_summary(stats)
                return 3
            write_manifest(plan.manifest_files, "prepared", options)
    except (OSError, RuntimeError) as error:
        log("conflict", options.target, str(error))
        stats.conflicts += 1
        print_summary(stats)
        return 1

    print_summary(stats)
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    """Run the command-line installer."""

    try:
        return install(parse_args(argv))
    except KeyboardInterrupt:
        print("\ninterrupted")
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
