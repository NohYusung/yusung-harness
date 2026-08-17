#!/usr/bin/env python3
"""Create and attest integration-managed Git worktrees."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Sequence


COMMON_SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(COMMON_SCRIPTS))

from integration_common import (  # noqa: E402
    IntegrationConfig,
    IntegrationError,
    VerificationCommand,
    atomic_write_json,
    git_common_dir,
    git_status_porcelain,
    head_sha,
    load_config_from_revision,
    persistent_lock,
    ref_lock_path,
    require_clean_worktree,
    require_no_in_progress_git_operation,
    resolve_commit,
    resolve_control_repo,
    run_command,
    run_git,
    sha256_text,
    tree_sha,
)


NAME_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
WORKTREE_DIRECTORY = ".worktree"
UNMANAGED_ADOPTION_AGENT = "unmanaged-adoption"
MANIFEST_KEYS = {
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
}


class WorktreeError(IntegrationError):
    """Raised when managed worktree lifecycle validation fails."""


def utc_now() -> str:
    """Return a stable offset-aware timestamp for manifests."""

    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def validate_name(name: str) -> str:
    """Validate a filesystem slug used below the configured branch prefix."""

    if not NAME_PATTERN.fullmatch(name) or name in {".", ".."}:
        raise WorktreeError("name must be a safe worktree slug")
    return name


def _managed_paths(repo: Path, config: IntegrationConfig, name: str) -> tuple[Path, Path]:
    """Return the repository-local worktree and central manifest locations."""

    management_root = repo / config.management_root
    worktree_root = repo / WORKTREE_DIRECTORY
    worktree_path = worktree_root / name
    manifest_path = management_root / "state" / "worktrees" / f"{name}.json"
    for path in (
        management_root,
        worktree_root,
        worktree_path,
        manifest_path.parent,
    ):
        if path.is_symlink():
            raise WorktreeError(f"managed path must not be a symlink: {path}")
    return worktree_path, manifest_path


def _historical_worktree_path(
    repo: Path,
    config: IntegrationConfig,
    name: str,
) -> Path:
    """Return the schema-v1 worktree path used before repository-local roots."""

    worktree_root = repo / config.management_root / "worktrees"
    worktree_path = worktree_root / name
    for path in (worktree_root, worktree_path):
        if path.is_symlink():
            raise WorktreeError(f"historical managed path must not be a symlink: {path}")
    return worktree_path


def _resolve_git_reported_path(repo: Path, value: str) -> Path:
    """Resolve a Git path relative to the primary repository root."""

    path = Path(value)
    if not path.is_absolute():
        path = repo / path
    return path.resolve()


def registered_worktrees(repo: Path) -> List[Dict[str, str]]:
    """Return strict path/HEAD/branch records from Git worktree porcelain output."""

    output = run_git(repo, "worktree", "list", "--porcelain").stdout
    records: List[Dict[str, str]] = []
    current: Dict[str, str] = {}
    for line in [*output.splitlines(), ""]:
        if not line:
            if current:
                if "worktree" not in current or "HEAD" not in current:
                    raise WorktreeError("Git returned an incomplete worktree record")
                records.append(current)
                current = {}
            continue
        key, separator, value = line.partition(" ")
        if key in current:
            raise WorktreeError("Git returned an invalid worktree record")
        current[key] = value if separator else ""
    return records


def _registered_worktree_for_branch(repo: Path, full_ref: str) -> Optional[Path]:
    """Resolve the sole registered worktree that checks out one full branch ref."""

    matches = [record for record in registered_worktrees(repo) if record.get("branch") == full_ref]
    if len(matches) > 1:
        raise WorktreeError(f"branch is registered in multiple worktrees: {full_ref}")
    if not matches:
        return None
    try:
        return Path(matches[0]["worktree"]).resolve(strict=True)
    except OSError as error:
        raise WorktreeError(f"registered worktree path is unavailable: {error}") from error


def validate_create_preflight(repo: Path, base: str) -> None:
    """Require clean operation-free primary and checked-out base worktrees."""

    require_clean_worktree(repo)
    require_no_in_progress_git_operation(repo)
    symbolic = run_git(
        repo,
        "rev-parse",
        "--symbolic-full-name",
        base,
        check=False,
    )
    full_ref = symbolic.stdout.strip()
    if symbolic.returncode != 0 or not full_ref.startswith("refs/heads/"):
        return
    base_worktree = _registered_worktree_for_branch(repo, full_ref)
    if base_worktree is not None and base_worktree != repo:
        require_clean_worktree(base_worktree)
        require_no_in_progress_git_operation(base_worktree)


def ensure_info_exclude_guards(repo: Path, managed_roots: Sequence[str]) -> None:
    """Atomically add every managed repository root to Git info/exclude."""

    reported = run_git(repo, "rev-parse", "--git-path", "info/exclude").stdout.strip()
    exclude_path = _resolve_git_reported_path(repo, reported)
    if exclude_path.is_symlink():
        raise WorktreeError("Git info/exclude must not be a symlink")
    exclude_path.parent.mkdir(parents=True, exist_ok=True)
    current = exclude_path.read_text(encoding="utf-8") if exclude_path.exists() else ""
    guards: List[str] = []
    for managed_root in managed_roots:
        normalized = managed_root.strip("/")
        root_path = Path(normalized)
        if (
            not normalized
            or root_path.is_absolute()
            or any(part == ".." for part in root_path.parts)
        ):
            raise WorktreeError("managed exclude root must remain inside the repository")
        guard = f"/{normalized}/"
        if guard not in guards:
            guards.append(guard)
    current_lines = current.splitlines()
    missing_guards = [guard for guard in guards if guard not in current_lines]
    if not missing_guards:
        return
    updated = current
    if updated and not updated.endswith("\n"):
        updated += "\n"
    updated += "".join(f"{guard}\n" for guard in missing_guards)
    temporary_name: Optional[str] = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=str(exclude_path.parent),
            prefix=f".{exclude_path.name}.",
            suffix=".tmp",
            delete=False,
        ) as temporary:
            temporary_name = temporary.name
            temporary.write(updated)
            temporary.flush()
            os.fsync(temporary.fileno())
        os.replace(temporary_name, exclude_path)
        temporary_name = None
        descriptor = os.open(str(exclude_path.parent), os.O_RDONLY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
    except OSError as error:
        raise WorktreeError(f"failed to update Git info/exclude: {error}") from error
    finally:
        if temporary_name is not None:
            try:
                os.unlink(temporary_name)
            except FileNotFoundError:
                pass


def _parse_targeted_checks(values: Sequence[str]) -> List[Dict[str, Any]]:
    """Parse strict JSON checks without accepting an arbitrary shell command."""

    checks: List[Dict[str, Any]] = []
    for raw_value in values:
        try:
            value = json.loads(raw_value)
        except json.JSONDecodeError as error:
            raise WorktreeError(f"targeted check JSON is invalid: {error.msg}") from error
        candidates = value if isinstance(value, list) else [value]
        for candidate in candidates:
            if not isinstance(candidate, dict) or set(candidate) != {
                "name",
                "cwd",
                "argv",
            }:
                raise WorktreeError("targeted check must contain name, cwd, and argv")
            name = candidate["name"]
            cwd = candidate["cwd"]
            argv = candidate["argv"]
            if (
                not isinstance(name, str)
                or NAME_PATTERN.fullmatch(name) is None
                or not isinstance(cwd, str)
                or not isinstance(argv, list)
                or not argv
                or any(not isinstance(item, str) or not item for item in argv)
            ):
                raise WorktreeError("targeted check fields are invalid")
            cwd_path = Path(cwd)
            if cwd_path.is_absolute() or any(part == ".." for part in cwd_path.parts):
                raise WorktreeError("targeted check cwd must remain inside the worktree")
            checks.append({"name": name, "cwd": cwd, "argv": list(argv)})
    if not checks:
        raise WorktreeError("at least one targeted check is required")
    return checks


def _validate_targeted_checks(
    checks: Sequence[Mapping[str, Any]],
    config: IntegrationConfig,
) -> None:
    """Require each requested check to match configured source cwd and argv."""

    configured = {
        (command.cwd, command.argv) for command in config.source.values()
    }
    for check in checks:
        identity = (check["cwd"], tuple(check["argv"]))
        if identity not in configured:
            raise WorktreeError("targeted check is not configured for source verification")


def _validate_adoption_targeted_subset(
    checks: Sequence[Mapping[str, Any]],
    config: IntegrationConfig,
) -> None:
    """Require an adoption subset to match source profile names and commands."""

    seen_names = set()
    for check in checks:
        name = check["name"]
        if name in seen_names:
            raise WorktreeError(f"duplicate targeted source profile: {name}")
        seen_names.add(name)
        configured = config.source.get(name)
        if configured is None or (
            configured.cwd != check["cwd"]
            or configured.argv != tuple(check["argv"])
        ):
            raise WorktreeError(
                f"targeted check does not exactly match source profile: {name}"
            )


def _manifest_template(
    *,
    repo: Path,
    branch: str,
    path: Path,
    base_branch: str,
    base_sha: str,
    project_id: Optional[int],
    task_id: Optional[int],
    agent: str,
    targeted_checks: Sequence[Mapping[str, Any]],
) -> Dict[str, Any]:
    """Build the exact schema-v1 managed worktree manifest."""

    return {
        "schemaVersion": 1,
        "state": "CREATING",
        "repoRoot": str(repo),
        "branch": branch,
        "path": str(path),
        "baseBranch": base_branch,
        "baseSha": base_sha,
        "headSha": base_sha,
        "createdAt": utc_now(),
        "projectId": project_id,
        "taskId": task_id,
        "agent": agent,
        "targetedChecks": [dict(check) for check in targeted_checks],
        "verification": [],
    }


def _remove_manifest(path: Path) -> None:
    """Remove only an engine-owned manifest and persist the directory update."""

    try:
        path.unlink()
    except FileNotFoundError:
        return
    descriptor = os.open(str(path.parent), os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def create_managed_worktree(
    *,
    repo_value: str,
    name: str,
    base: str,
    expected_base_head: str,
    agent: str,
    targeted_check_json: Sequence[str],
    project_id: Optional[int],
    task_id: Optional[int],
) -> Path:
    """Create ``codex/<name>`` at an explicit base SHA with rollback evidence."""

    repo = resolve_control_repo(repo_value)
    slug = validate_name(name)
    if not agent or agent != agent.strip() or "\x00" in agent:
        raise WorktreeError("agent must be a non-empty exact value")
    for label, value in (("project-id", project_id), ("task-id", task_id)):
        if value is not None and value <= 0:
            raise WorktreeError(f"{label} must be a positive integer")

    base_sha = resolve_commit(repo, base)
    expected_sha = resolve_commit(repo, expected_base_head)
    if base_sha != expected_sha:
        raise WorktreeError(
            f"base moved: expected={expected_sha}, actual={base_sha}"
        )
    config = load_config_from_revision(repo, expected_sha).require_configured()
    checks = _parse_targeted_checks(targeted_check_json)
    _validate_targeted_checks(checks, config)
    branch = f"{config.branch_prefix}{slug}"
    full_ref = f"refs/heads/{branch}"
    run_git(repo, "check-ref-format", "--branch", branch)
    worktree_path, manifest_path = _managed_paths(repo, config, slug)
    common_dir = git_common_dir(repo)

    with persistent_lock(ref_lock_path(common_dir, "repository")):
        ensure_info_exclude_guards(
            repo,
            (config.management_root, WORKTREE_DIRECTORY),
        )
        validate_create_preflight(repo, base)
        if worktree_path.exists() or worktree_path.is_symlink():
            raise WorktreeError(f"managed worktree path already exists: {worktree_path}")
        if manifest_path.exists() or manifest_path.is_symlink():
            raise WorktreeError(f"managed manifest already exists: {manifest_path}")
        existing_ref = run_git(
            repo,
            "show-ref",
            "--verify",
            full_ref,
            check=False,
        )
        if existing_ref.returncode == 0:
            raise WorktreeError(f"managed branch already exists: {branch}")

        manifest = _manifest_template(
            repo=repo,
            branch=branch,
            path=worktree_path,
            base_branch=base,
            base_sha=base_sha,
            project_id=project_id,
            task_id=task_id,
            agent=agent,
            targeted_checks=checks,
        )
        atomic_write_json(manifest_path, manifest)
        try:
            run_git(
                repo,
                "worktree",
                "add",
                "-b",
                branch,
                str(worktree_path),
                base_sha,
            )
            if resolve_commit(repo, branch) != base_sha:
                raise WorktreeError("new worktree branch does not match the base SHA")
            if head_sha(worktree_path) != base_sha:
                raise WorktreeError("new worktree HEAD does not match the base SHA")
            manifest["state"] = "ACTIVE"
            atomic_write_json(manifest_path, manifest)
        except Exception as operation_error:
            rollback_errors: List[str] = []
            if worktree_path.exists():
                removal = run_git(
                    repo,
                    "worktree",
                    "remove",
                    str(worktree_path),
                    check=False,
                )
                if removal.returncode != 0 or worktree_path.exists():
                    rollback_errors.append("worktree path cleanup failed")
            current_ref = run_git(
                repo,
                "rev-parse",
                "--verify",
                full_ref,
                check=False,
            )
            if current_ref.returncode == 0 and current_ref.stdout.strip() == base_sha:
                deletion = run_git(
                    repo,
                    "update-ref",
                    "-d",
                    full_ref,
                    base_sha,
                    check=False,
                )
                if deletion.returncode != 0:
                    rollback_errors.append("managed branch cleanup failed")
            remaining_ref = run_git(
                repo,
                "show-ref",
                "--verify",
                full_ref,
                check=False,
            )
            if remaining_ref.returncode == 0:
                rollback_errors.append("managed branch still exists")
            if rollback_errors:
                raise WorktreeError(
                    "creation failed and rollback is incomplete: "
                    + ", ".join(rollback_errors)
                ) from operation_error
            _remove_manifest(manifest_path)
            raise
    return worktree_path


def _load_manifest(path: Path) -> Dict[str, Any]:
    """Load one exact schema-v1 manifest and reject unknown keys."""

    if path.is_symlink():
        raise WorktreeError("managed manifest must not be a symlink")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise WorktreeError(f"managed manifest cannot be loaded: {error}") from error
    if not isinstance(value, dict) or set(value) != MANIFEST_KEYS:
        raise WorktreeError("managed manifest schema is invalid")
    if value.get("schemaVersion") != 1:
        raise WorktreeError("managed manifest version is unsupported")
    return value


def _primary_branch(repo: Path) -> str:
    """Return the primary control worktree's attached branch name."""

    result = run_git(
        repo,
        "symbolic-ref",
        "--quiet",
        "--short",
        "HEAD",
        check=False,
    )
    branch = result.stdout.strip()
    if result.returncode != 0 or not branch:
        raise WorktreeError("primary control worktree must have an attached branch")
    return branch


def _adopt_preexisting_manifest(
    *,
    repo: Path,
    branch: str,
    slug: str,
    expected_head: str,
    manifest_path: Path,
    config_revision: str,
    config: IntegrationConfig,
    targeted_checks: Sequence[Mapping[str, Any]],
) -> Dict[str, Any]:
    """Adopt one exact clean unmanaged registration as an ACTIVE manifest."""

    require_clean_worktree(repo)
    require_no_in_progress_git_operation(repo)
    full_ref = f"refs/heads/{branch}"
    registered_path = _registered_worktree_for_branch(repo, full_ref)
    preexisting_root = repo / WORKTREE_DIRECTORY
    preexisting_path = preexisting_root / slug
    if (
        registered_path is None
        or preexisting_root.is_symlink()
        or preexisting_path.is_symlink()
        or registered_path != preexisting_path.resolve()
    ):
        raise WorktreeError("preexisting branch/path registration is not safely adoptable")
    if not preexisting_path.is_dir():
        raise WorktreeError("preexisting worktree path is unavailable")
    if head_sha(preexisting_path) != expected_head:
        raise WorktreeError("preexisting worktree HEAD does not match the branch ref")
    require_clean_worktree(preexisting_path)
    require_no_in_progress_git_operation(preexisting_path)
    checked_out_branch = run_git(
        preexisting_path,
        "symbolic-ref",
        "--quiet",
        "--short",
        "HEAD",
    ).stdout.strip()
    if checked_out_branch != branch:
        raise WorktreeError("preexisting worktree has a different branch checked out")

    base_branch = _primary_branch(repo)
    if branch not in {slug, f"{config.branch_prefix}{slug}"}:
        raise WorktreeError("preexisting branch does not match the configured namespace")
    managed_path, expected_manifest_path = _managed_paths(repo, config, slug)
    if (
        expected_manifest_path != manifest_path
        or managed_path.resolve() != preexisting_path.resolve()
    ):
        raise WorktreeError("preexisting adoption does not match the managed location")
    if not targeted_checks:
        raise WorktreeError("preexisting adoption requires configured source checks")
    manifest = _manifest_template(
        repo=repo,
        branch=branch,
        path=preexisting_path.resolve(),
        base_branch=base_branch,
        base_sha=config_revision,
        project_id=None,
        task_id=None,
        agent=UNMANAGED_ADOPTION_AGENT,
        targeted_checks=targeted_checks,
    )
    manifest["headSha"] = expected_head
    manifest["state"] = "ACTIVE"
    atomic_write_json(manifest_path, manifest)
    return manifest


def _resolve_check_cwd(worktree_path: Path, cwd_value: str) -> Path:
    """Resolve a configured command cwd without escaping the source worktree."""

    try:
        candidate = (worktree_path / cwd_value).resolve(strict=True)
        root = worktree_path.resolve(strict=True)
    except OSError as error:
        raise WorktreeError(f"verification cwd cannot be resolved: {error}") from error
    if candidate != root and root not in candidate.parents:
        raise WorktreeError("verification cwd escapes the source worktree")
    if not candidate.is_dir():
        raise WorktreeError("verification cwd must be a directory")
    return candidate


def _run_verification_command(
    worktree_path: Path,
    command: VerificationCommand,
) -> None:
    """Run one configured preparation command without recording it as evidence."""

    result = run_command(
        command.argv,
        cwd=_resolve_check_cwd(worktree_path, command.cwd),
        check=False,
    )
    if result.returncode != 0:
        raise WorktreeError(
            f"source preparation failed ({result.returncode}): "
            f"{(result.stderr or result.stdout).strip()}"
        )


def mark_managed_worktree_ready(
    *,
    repo_value: str,
    branch: str,
    expected_head: str,
    config_revision: Optional[str],
    targeted_check_json: Sequence[str],
) -> Dict[str, Any]:
    """Run configured source checks and atomically write a clean READY attestation."""

    repo = resolve_control_repo(repo_value)
    expected_sha = resolve_commit(repo, expected_head)
    actual_sha = resolve_commit(repo, branch)
    if actual_sha != expected_sha:
        raise WorktreeError(
            f"source branch moved: expected={expected_sha}, actual={actual_sha}"
        )
    is_managed_branch = branch.startswith("codex/")
    slug = validate_name(branch[len("codex/") :] if is_managed_branch else branch)
    manifest_path = (
        repo
        / ".yusung-harness"
        / "state"
        / "worktrees"
        / f"{slug}.json"
    )
    common_dir = git_common_dir(repo)

    with persistent_lock(ref_lock_path(common_dir, "repository")), persistent_lock(
        ref_lock_path(common_dir, f"refs/heads/{branch}")
    ):
        if manifest_path.exists():
            if config_revision is not None or targeted_check_json:
                raise WorktreeError(
                    "managed ready must use its persisted base config and checks"
                )
            manifest = _load_manifest(manifest_path)
        else:
            if config_revision is None or not targeted_check_json:
                raise WorktreeError(
                    "preexisting ready requires config-revision and targeted checks"
                )
            if re.fullmatch(r"[0-9a-fA-F]{40}|[0-9a-fA-F]{64}", config_revision) is None:
                raise WorktreeError("config-revision must be a full target commit SHA")
            resolved_config_revision = resolve_commit(repo, config_revision)
            if resolved_config_revision != config_revision.lower():
                raise WorktreeError("config-revision must be the exact full target SHA")
            if resolved_config_revision != head_sha(repo):
                raise WorktreeError("config-revision is stale against the target HEAD")
            adoption_config = load_config_from_revision(
                repo,
                resolved_config_revision,
            ).require_configured()
            adoption_checks = _parse_targeted_checks(targeted_check_json)
            _validate_adoption_targeted_subset(adoption_checks, adoption_config)
            ensure_info_exclude_guards(
                repo,
                (adoption_config.management_root, WORKTREE_DIRECTORY),
            )
            manifest = _adopt_preexisting_manifest(
                repo=repo,
                branch=branch,
                slug=slug,
                expected_head=expected_sha,
                manifest_path=manifest_path,
                config_revision=resolved_config_revision,
                config=adoption_config,
                targeted_checks=adoption_checks,
            )
        config = load_config_from_revision(
            repo,
            manifest["baseSha"],
        ).require_configured()
        ensure_info_exclude_guards(
            repo,
            (config.management_root, WORKTREE_DIRECTORY),
        )
        if is_managed_branch:
            if branch != f"{config.branch_prefix}{slug}":
                raise WorktreeError(
                    "source branch does not match the base configuration"
                )
        elif manifest.get("agent") != UNMANAGED_ADOPTION_AGENT or branch != slug:
            raise WorktreeError(
                "non-managed branch is allowed only for an adopted preexisting worktree"
            )
        managed_path, expected_manifest_path = _managed_paths(repo, config, slug)
        if expected_manifest_path != manifest_path:
            raise WorktreeError(
                "managed manifest path does not match the base configuration"
            )
        historical_path = _historical_worktree_path(repo, config, slug)
        declared_path = manifest.get("path")
        if declared_path == str(managed_path):
            worktree_path = managed_path
        elif (
            declared_path == str(historical_path)
            and manifest.get("agent") != UNMANAGED_ADOPTION_AGENT
        ):
            worktree_path = historical_path
        else:
            raise WorktreeError(
                "managed manifest path is neither current nor historical"
            )
        expected_identity = {
            "repoRoot": str(repo),
            "branch": branch,
            "path": str(worktree_path),
        }
        if any(manifest[key] != value for key, value in expected_identity.items()):
            raise WorktreeError("managed manifest identity does not match the request")
        if manifest["state"] != "ACTIVE" or manifest["verification"] not in (None, []):
            raise WorktreeError("managed worktree is not in a fresh ACTIVE state")
        if not worktree_path.is_dir() or worktree_path.is_symlink():
            raise WorktreeError("managed worktree path is unavailable")
        if head_sha(worktree_path) != expected_sha:
            raise WorktreeError("managed worktree HEAD is stale")
        branch_name = run_git(
            worktree_path,
            "symbolic-ref",
            "--quiet",
            "--short",
            "HEAD",
        ).stdout.strip()
        if branch_name != branch:
            raise WorktreeError("managed worktree has the wrong branch checked out")
        require_clean_worktree(worktree_path)
        before_tree = tree_sha(worktree_path)
        before_status = git_status_porcelain(worktree_path)

        _run_verification_command(
            worktree_path,
            config.command("prepare", "source"),
        )
        evidence: List[Dict[str, Any]] = []
        configured_source = {
            (command.cwd, command.argv): command
            for command in config.source.values()
        }
        for check in manifest["targetedChecks"]:
            identity = (check["cwd"], tuple(check["argv"]))
            if identity not in configured_source:
                raise WorktreeError("manifest targeted check is no longer configured")
            check_before_head = head_sha(worktree_path)
            check_before_tree = tree_sha(worktree_path)
            check_before_status = git_status_porcelain(worktree_path)
            if (
                check_before_head != expected_sha
                or check_before_tree != before_tree
                or check_before_status
            ):
                raise WorktreeError("source snapshot changed before targeted verification")
            started_at = utc_now()
            result = run_command(
                check["argv"],
                cwd=_resolve_check_cwd(worktree_path, check["cwd"]),
                check=False,
            )
            completed_at = utc_now()
            if result.returncode != 0:
                raise WorktreeError(
                    f"targeted check failed ({result.returncode}): "
                    f"{(result.stderr or result.stdout).strip()}"
                )
            check_after_head = head_sha(worktree_path)
            check_after_tree = tree_sha(worktree_path)
            check_after_status = git_status_porcelain(worktree_path)
            if (
                check_after_head != check_before_head
                or check_after_tree != check_before_tree
                or check_after_status != check_before_status
            ):
                raise WorktreeError("targeted verification changed the source snapshot")
            evidence.append(
                {
                    "name": check["name"],
                    "cwd": check["cwd"],
                    "argv": list(check["argv"]),
                    "headSha": expected_sha,
                    "treeSha": before_tree,
                    "returncode": result.returncode,
                    "stdout": result.stdout,
                    "stderr": result.stderr,
                    "stdoutSha256": sha256_text(result.stdout),
                    "stderrSha256": sha256_text(result.stderr),
                    "beforeStatusSha256": sha256_text(check_before_status),
                    "afterStatusSha256": sha256_text(check_after_status),
                    "startedAt": started_at,
                    "completedAt": completed_at,
                }
            )

        if head_sha(worktree_path) != expected_sha:
            raise WorktreeError("verification changed the source HEAD")
        if tree_sha(worktree_path) != before_tree:
            raise WorktreeError("verification changed the source tree")
        if git_status_porcelain(worktree_path) != before_status or before_status:
            raise WorktreeError("verification changed or dirtied the source worktree")

        manifest["state"] = "READY"
        manifest["headSha"] = expected_sha
        manifest["verification"] = evidence
        atomic_write_json(manifest_path, manifest)
        return manifest


def create_parser() -> argparse.ArgumentParser:
    """Build the explicit create/ready CLI contract."""

    parser = argparse.ArgumentParser(description="Managed Git worktree engine")
    subparsers = parser.add_subparsers(dest="command", required=True)

    create = subparsers.add_parser("create")
    create.add_argument("--repo", required=True)
    create.add_argument("--name", required=True)
    create.add_argument("--base", required=True)
    create.add_argument("--expected-base-head", required=True)
    create.add_argument("--agent", required=True)
    create.add_argument("--project-id", type=int)
    create.add_argument("--task-id", type=int)
    create.add_argument("--targeted-check-json", action="append", required=True)

    ready = subparsers.add_parser("ready")
    ready.add_argument("--repo", required=True)
    ready.add_argument("--branch", required=True)
    ready.add_argument("--expected-head", required=True)
    ready.add_argument("--config-revision")
    ready.add_argument("--targeted-check-json", action="append", default=[])
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    """Execute one fail-closed worktree lifecycle operation."""

    arguments = create_parser().parse_args(argv)
    try:
        if arguments.command == "create":
            result = create_managed_worktree(
                repo_value=arguments.repo,
                name=arguments.name,
                base=arguments.base,
                expected_base_head=arguments.expected_base_head,
                agent=arguments.agent,
                targeted_check_json=arguments.targeted_check_json,
                project_id=arguments.project_id,
                task_id=arguments.task_id,
            )
            print(result)
        else:
            manifest = mark_managed_worktree_ready(
                repo_value=arguments.repo,
                branch=arguments.branch,
                expected_head=arguments.expected_head,
                config_revision=arguments.config_revision,
                targeted_check_json=arguments.targeted_check_json,
            )
            print(json.dumps(manifest, ensure_ascii=False, sort_keys=True))
    except IntegrationError as error:
        print(f"Worktree operation failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
