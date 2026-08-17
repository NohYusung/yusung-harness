#!/usr/bin/env python3
"""Shared fail-closed primitives for worktree and integration engines."""

from __future__ import annotations

import fcntl
import hashlib
import json
import os
import re
import stat
import subprocess
import tempfile
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterator, List, Mapping, Optional, Sequence, Tuple


CONFIG_PATH = ".codex/integration.toml"
LOCK_DIRECTORY_NAME = "yusung-harness-locks"
SAFE_SECTION_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
FULL_OBJECT_ID = re.compile(r"^[0-9a-f]{40}(?:[0-9a-f]{24})?$")
ROOT_CONFIG_KEYS = {
    "schema_version",
    "configured",
    "branch_prefix",
    "management_root",
    "merge_strategy",
    "cleanup",
    "conflict_policy",
    "required_verification_categories",
}
REQUIRED_CANDIDATE_CATEGORIES = ("test", "typecheck", "lint", "build")
IN_PROGRESS_GIT_MARKERS = (
    "MERGE_HEAD",
    "CHERRY_PICK_HEAD",
    "REVERT_HEAD",
    "BISECT_LOG",
    "BISECT_START",
    "rebase-merge",
    "rebase-apply",
    "sequencer",
)


class IntegrationError(RuntimeError):
    """Raised when an integration safety invariant cannot be proven."""


@dataclass(frozen=True)
class VerificationCommand:
    """One configured command that must run without a shell."""

    name: str
    cwd: str
    argv: Tuple[str, ...]

    def as_dict(self) -> Dict[str, Any]:
        """Return the stable public JSON shape used by manifests."""

        return {"name": self.name, "cwd": self.cwd, "argv": list(self.argv)}


@dataclass(frozen=True)
class IntegrationConfig:
    """Validated fixed-profile integration configuration from a Git revision."""

    schema_version: int
    configured: bool
    branch_prefix: str
    management_root: str
    merge_strategy: str
    cleanup: str
    conflict_policy: str
    required_verification_categories: Tuple[str, ...]
    prepare: Mapping[str, VerificationCommand]
    source: Mapping[str, VerificationCommand]
    candidate: Mapping[str, VerificationCommand]
    raw_text: str
    sha256: str

    def require_configured(self) -> "IntegrationConfig":
        """Fail closed when a lifecycle command sees the disabled template."""

        if not self.configured:
            raise IntegrationError("integration engine is not configured")
        return self

    def command(self, phase: str, name: str) -> VerificationCommand:
        """Return one exact configured command or fail closed."""

        groups = {
            "prepare": self.prepare,
            "source": self.source,
            "candidate": self.candidate,
        }
        group = groups.get(phase)
        if group is None or name not in group:
            raise IntegrationError(
                "verification command is not configured: "
                f"phase={phase}, name={name}"
            )
        return group[name]


def sanitized_environment(
    source: Optional[Mapping[str, str]] = None,
) -> Dict[str, str]:
    """Copy an environment while removing every Git control variable."""

    environment = dict(os.environ if source is None else source)
    for key in tuple(environment):
        if key.upper().startswith("GIT_"):
            environment.pop(key, None)
    return environment


def run_command(
    argv: Sequence[str],
    *,
    cwd: Path,
    check: bool = True,
    input_text: Optional[str] = None,
    environment: Optional[Mapping[str, str]] = None,
) -> subprocess.CompletedProcess[str]:
    """Run an argv vector without a shell under a sanitized Git environment."""

    if not argv or any(not isinstance(value, str) or "\x00" in value for value in argv):
        raise IntegrationError("command argv must contain safe strings")
    try:
        result = subprocess.run(
            list(argv),
            cwd=str(cwd),
            check=False,
            capture_output=True,
            text=True,
            input=input_text,
            env=sanitized_environment(environment),
            shell=False,
        )
    except (FileNotFoundError, OSError) as error:
        raise IntegrationError(f"command could not be executed: {error}") from error
    if check and result.returncode != 0:
        detail = (result.stderr or result.stdout or "no command output").strip()
        raise IntegrationError(
            f"command failed ({result.returncode}): {detail}"
        )
    return result


def run_git(
    repo: Path,
    *arguments: Any,
    check: bool = True,
    input_text: Optional[str] = None,
) -> subprocess.CompletedProcess[str]:
    """Run Git with either varargs or one argv sequence and sanitized state."""

    if len(arguments) == 1 and isinstance(arguments[0], (list, tuple)):
        normalized_arguments = list(arguments[0])
    elif all(isinstance(argument, str) for argument in arguments):
        normalized_arguments = list(arguments)
    else:
        raise IntegrationError("git arguments must be strings")

    return run_command(
        ["git", "-C", str(repo), *normalized_arguments],
        cwd=repo,
        check=check,
        input_text=input_text,
    )


def _resolve_git_path(repo: Path, value: str) -> Path:
    """Resolve a path reported by Git relative to the repository root."""

    path = Path(value)
    if not path.is_absolute():
        path = repo / path
    return path.resolve()


def resolve_control_repo(repo_value: str) -> Path:
    """Validate and return the primary control worktree of a Git repository."""

    if not repo_value or repo_value != repo_value.strip():
        raise IntegrationError("repo must be an exact absolute path")
    supplied = Path(repo_value).expanduser()
    if not supplied.is_absolute():
        raise IntegrationError("repo must be an absolute path")
    try:
        repo = supplied.resolve(strict=True)
    except OSError as error:
        raise IntegrationError(f"repo path cannot be resolved: {error}") from error
    if not repo.is_dir():
        raise IntegrationError("repo must be a directory")

    inside = run_git(repo, ["rev-parse", "--is-inside-work-tree"])
    if inside.stdout.strip() != "true":
        raise IntegrationError("repo is not a Git worktree")
    top_level = _resolve_git_path(
        repo,
        run_git(repo, ["rev-parse", "--show-toplevel"]).stdout.strip(),
    )
    if top_level != repo:
        raise IntegrationError(f"repo must be its worktree root: {top_level}")

    listing = run_git(repo, ["worktree", "list", "--porcelain"]).stdout
    first_line = next(
        (line for line in listing.splitlines() if line.startswith("worktree ")),
        None,
    )
    if first_line is None:
        raise IntegrationError("Git did not report a primary worktree")
    primary_root = Path(first_line.removeprefix("worktree ")).resolve()
    if primary_root != repo:
        raise IntegrationError(
            "repo must be the primary control worktree: "
            f"expected={primary_root}, actual={repo}"
        )
    return repo


def git_common_dir(repo: Path) -> Path:
    """Return the shared Git common directory for the control repository."""

    value = run_git(repo, ["rev-parse", "--git-common-dir"]).stdout.strip()
    if not value:
        raise IntegrationError("Git returned an empty common directory")
    return _resolve_git_path(repo, value)


def git_object_format(repo: Path) -> str:
    """Return and validate the repository object format."""

    result = run_git(repo, ["rev-parse", "--show-object-format"])
    object_format = result.stdout.strip()
    if object_format not in {"sha1", "sha256"}:
        raise IntegrationError(f"unsupported Git object format: {object_format}")
    return object_format


def resolve_commit(repo: Path, revision: str) -> str:
    """Resolve a revision to one full commit object ID."""

    if not revision or revision != revision.strip() or "\x00" in revision:
        raise IntegrationError("revision must be a non-empty exact value")
    result = run_git(
        repo,
        ["rev-parse", "--verify", f"{revision}^{{commit}}"],
        check=False,
    )
    object_id = result.stdout.strip().lower()
    if result.returncode != 0 or not FULL_OBJECT_ID.fullmatch(object_id):
        raise IntegrationError(f"revision is not one unambiguous commit: {revision}")
    return object_id


def head_sha(repo: Path) -> str:
    """Return the checked-out full HEAD commit ID."""

    return resolve_commit(repo, "HEAD")


def tree_sha(repo: Path, revision: str = "HEAD") -> str:
    """Return the full tree object ID for a revision."""

    result = run_git(
        repo,
        ["rev-parse", "--verify", f"{revision}^{{tree}}"],
        check=False,
    )
    object_id = result.stdout.strip().lower()
    if result.returncode != 0 or not FULL_OBJECT_ID.fullmatch(object_id):
        raise IntegrationError(f"revision has no valid tree: {revision}")
    return object_id


def git_status_porcelain(repo: Path) -> str:
    """Return stable status including non-ignored untracked files."""

    return run_git(
        repo,
        ["status", "--porcelain=v1", "--untracked-files=all"],
    ).stdout


def git_status_clean(repo: Path) -> bool:
    """Return whether tracked and non-ignored untracked state is clean."""

    return git_status_porcelain(repo) == ""


def require_clean_worktree(repo: Path) -> None:
    """Fail unless the worktree has no tracked or non-ignored changes."""

    status_text = git_status_porcelain(repo)
    if status_text:
        raise IntegrationError("worktree must be clean")


def require_no_in_progress_git_operation(repo: Path) -> None:
    """Fail when Git reports merge, sequencer, rebase, revert, or bisect state."""

    for marker in IN_PROGRESS_GIT_MARKERS:
        result = run_git(repo, "rev-parse", "--git-path", marker)
        marker_path = _resolve_git_path(repo, result.stdout.strip())
        if marker_path.exists():
            raise IntegrationError(f"Git operation is in progress: {marker}")


def sha256_bytes(value: bytes) -> str:
    """Return a lower-case SHA-256 digest for bytes."""

    return hashlib.sha256(value).hexdigest()


def sha256_text(value: str) -> str:
    """Return a lower-case SHA-256 digest for UTF-8 text."""

    return sha256_bytes(value.encode("utf-8"))


def sha256_file(path: Path) -> str:
    """Return a streaming SHA-256 digest for a regular file."""

    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def canonical_json_bytes(value: Any) -> bytes:
    """Serialize JSON deterministically for hashing and atomic persistence."""

    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def sha256_canonical_json(value: Any) -> str:
    """Return SHA-256 for deterministic JSON serialization."""

    return sha256_bytes(canonical_json_bytes(value))


def _fsync_directory(directory: Path) -> None:
    """Persist directory metadata after an atomic rename."""

    descriptor = os.open(str(directory), os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def atomic_write_json(path: Path, value: Any, *, mode: int = 0o600) -> None:
    """Atomically replace JSON using file fsync, os.replace, and directory fsync."""

    parent = path.parent
    parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if parent.is_symlink() or (path.exists() and path.is_symlink()):
        raise IntegrationError("atomic JSON paths must not be symlinks")
    os.chmod(parent, 0o700)
    payload = canonical_json_bytes(value) + b"\n"
    temporary_name: Optional[str] = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb",
            dir=str(parent),
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        ) as temporary:
            temporary_name = temporary.name
            os.fchmod(temporary.fileno(), mode)
            temporary.write(payload)
            temporary.flush()
            os.fsync(temporary.fileno())
        os.replace(temporary_name, path)
        temporary_name = None
        os.chmod(path, mode)
        _fsync_directory(parent)
    except OSError as error:
        raise IntegrationError(f"atomic JSON write failed: {error}") from error
    finally:
        if temporary_name is not None:
            try:
                os.unlink(temporary_name)
            except FileNotFoundError:
                pass


def ref_lock_path(common_dir: Path, full_ref: str) -> Path:
    """Return the persistent lock path for a full Git ref."""

    digest = sha256_text(full_ref)
    return common_dir / LOCK_DIRECTORY_NAME / f"{digest}.lock"


@contextmanager
def persistent_lock(path: Path) -> Iterator[None]:
    """Acquire a nonblocking 0600 flock and preserve its inode on release."""

    parent = path.parent
    parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(parent, 0o700)
    flags = os.O_RDWR | os.O_CREAT
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        descriptor = os.open(str(path), flags, 0o600)
    except OSError as error:
        raise IntegrationError(f"lock file cannot be opened: {error}") from error
    try:
        file_stat = os.fstat(descriptor)
        if not stat.S_ISREG(file_stat.st_mode):
            raise IntegrationError("lock path must be a regular file")
        os.fchmod(descriptor, 0o600)
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise IntegrationError(f"lock is already held: {path}") from error
        yield
    finally:
        try:
            fcntl.flock(descriptor, fcntl.LOCK_UN)
        finally:
            os.close(descriptor)


def _parse_toml_value(raw_value: str, line_number: int) -> Any:
    """Parse the intentionally small TOML value subset used by integration.toml."""

    value = raw_value.strip()
    if value == "true":
        return True
    if value == "false":
        return False
    if re.fullmatch(r"0|[1-9][0-9]*", value):
        return int(value)
    if value.startswith('"') or value.startswith("["):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError as error:
            raise IntegrationError(
                f"invalid TOML value on line {line_number}: {error.msg}"
            ) from error
        if isinstance(parsed, (str, list)):
            return parsed
    raise IntegrationError(f"unsupported TOML value on line {line_number}")


def parse_integration_config(text: str) -> IntegrationConfig:
    """Parse and validate the exact Python-3.10-compatible integration profile."""

    root: Dict[str, Any] = {}
    sections: Dict[Tuple[str, ...], Dict[str, Any]] = {}
    current: Tuple[str, ...] = ()
    for line_number, original_line in enumerate(text.splitlines(), start=1):
        stripped = original_line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if "#" in stripped:
            raise IntegrationError(
                f"inline TOML comments are not supported on line {line_number}"
            )
        if stripped.startswith("["):
            if not stripped.endswith("]") or stripped.count("[") != 1:
                raise IntegrationError(f"invalid TOML table on line {line_number}")
            parts = tuple(stripped[1:-1].split("."))
            allowed = (
                len(parts) == 3
                and parts[0] == "verification"
                and parts[1] in {"prepare", "source", "candidate"}
                and SAFE_SECTION_NAME.fullmatch(parts[2]) is not None
            )
            if not allowed:
                raise IntegrationError(f"unknown TOML table on line {line_number}")
            if parts in sections:
                raise IntegrationError(f"duplicate TOML table on line {line_number}")
            sections[parts] = {}
            current = parts
            continue
        if "=" not in stripped:
            raise IntegrationError(f"invalid TOML assignment on line {line_number}")
        key, raw_value = (part.strip() for part in stripped.split("=", 1))
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key):
            raise IntegrationError(f"invalid TOML key on line {line_number}")
        target = root if not current else sections[current]
        allowed_keys = ROOT_CONFIG_KEYS if not current else {"cwd", "argv"}
        if key not in allowed_keys:
            raise IntegrationError(f"unknown TOML key on line {line_number}: {key}")
        if key in target:
            raise IntegrationError(f"duplicate TOML key on line {line_number}: {key}")
        target[key] = _parse_toml_value(raw_value, line_number)

    if set(root) != ROOT_CONFIG_KEYS:
        missing = sorted(ROOT_CONFIG_KEYS - set(root))
        extra = sorted(set(root) - ROOT_CONFIG_KEYS)
        raise IntegrationError(
            f"root integration profile mismatch: missing={missing}, extra={extra}"
        )
    expected_policy = {
        "schema_version": 1,
        "branch_prefix": "codex/",
        "management_root": ".yusung-harness",
        "merge_strategy": "no-ff",
        "cleanup": "worktree-and-branch",
        "conflict_policy": "evidence-only",
        "required_verification_categories": list(
            REQUIRED_CANDIDATE_CATEGORIES
        ),
    }
    if not isinstance(root["configured"], bool) or {
        key: value for key, value in root.items() if key != "configured"
    } != expected_policy:
        raise IntegrationError("integration profile does not match the required policy")

    commands: Dict[str, Dict[str, VerificationCommand]] = {
        "prepare": {},
        "source": {},
        "candidate": {},
    }
    for parts, values in sections.items():
        _, phase, name = parts
        if set(values) != {"cwd", "argv"}:
            raise IntegrationError(f"verification table is incomplete: {'.'.join(parts)}")
        cwd = values["cwd"]
        argv = values["argv"]
        if not isinstance(cwd, str) or not isinstance(argv, list):
            raise IntegrationError(f"verification table has wrong types: {'.'.join(parts)}")
        cwd_path = Path(cwd)
        if (
            not cwd
            or cwd_path.is_absolute()
            or any(part == ".." for part in cwd_path.parts)
        ):
            raise IntegrationError(f"verification cwd escapes the worktree: {cwd}")
        if not argv or any(
            not isinstance(value, str) or not value or "\x00" in value
            for value in argv
        ):
            raise IntegrationError(f"verification argv is invalid: {'.'.join(parts)}")
        commands[phase][name] = VerificationCommand(name, cwd, tuple(argv))

    if not root["configured"]:
        if sections:
            raise IntegrationError(
                "disabled integration template must not define verification commands"
            )
    elif set(commands["prepare"]) != {"source", "candidate"}:
        raise IntegrationError("prepare commands must contain source and candidate")
    if root["configured"] and not commands["source"]:
        raise IntegrationError("at least one source verification command is required")
    if root["configured"] and set(commands["candidate"]) != set(
        REQUIRED_CANDIDATE_CATEGORIES
    ):
        raise IntegrationError(
            "candidate verification commands must exactly match required categories"
        )

    return IntegrationConfig(
        schema_version=root["schema_version"],
        configured=root["configured"],
        branch_prefix=root["branch_prefix"],
        management_root=root["management_root"],
        merge_strategy=root["merge_strategy"],
        cleanup=root["cleanup"],
        conflict_policy=root["conflict_policy"],
        required_verification_categories=tuple(
            root["required_verification_categories"]
        ),
        prepare=dict(commands["prepare"]),
        source=dict(commands["source"]),
        candidate=dict(commands["candidate"]),
        raw_text=text,
        sha256=sha256_text(text),
    )


def load_config_from_revision(
    repo: Path,
    revision: str,
    *,
    config_path: str = CONFIG_PATH,
) -> IntegrationConfig:
    """Load the authoritative strict integration profile using ``git show``."""

    commit_sha = resolve_commit(repo, revision)
    result = run_git(
        repo,
        ["show", f"{commit_sha}:{config_path}"],
        check=False,
    )
    if result.returncode != 0:
        raise IntegrationError(
            f"integration config is unavailable at {commit_sha}:{config_path}"
        )
    return parse_integration_config(result.stdout)
