from __future__ import annotations

import argparse
import json
import os
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional, Sequence

import integration_common as common


RUN_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]+$")
EVIDENCE_PATTERN = re.compile(r"^(code|test|plan|user):[^\s].*$")
REQUIRED_CANDIDATE_CHECKS = ("test", "typecheck", "lint", "build")
SCHEMA_VERSION = 1
WORKTREE_MANIFEST_KEYS = {
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
RUN_MANIFEST_REQUIRED_KEYS = {
    "schemaVersion",
    "generation",
    "state",
    "repoRoot",
    "runId",
    "source",
    "sourceRef",
    "sourceHead",
    "sourceTree",
    "sourcePath",
    "sourceAgent",
    "sourceManifestPath",
    "sourceManifestSha256",
    "target",
    "targetRef",
    "targetHead",
    "targetTree",
    "mergeBase",
    "config",
    "configSha256",
    "candidateBranch",
    "candidateRef",
    "candidatePath",
    "candidateHead",
    "candidateTree",
    "hadConflicts",
    "conflictSha256",
    "resolutionsSha256",
    "review",
    "verification",
    "promotion",
    "createdAt",
    "updatedAt",
}
RUN_MANIFEST_OPTIONAL_KEYS = {
    "conflictBundle",
    "conflictBundleSha256",
    "cleanup",
    "abortedAt",
    "sourceManifestArchive",
}


class MergeArgumentParser(argparse.ArgumentParser):
    """argparse 오류를 프로세스 종료 대신 통합 도메인 오류로 변환한다."""

    def error(self, message: str) -> None:
        raise common.IntegrationError(message)


def utc_now() -> str:
    """증거 문서에 기록할 UTC offset datetime을 반환한다."""

    return datetime.now(timezone.utc).isoformat()


def validate_name(value: str, field_name: str) -> str:
    """Git short branch와 run ID에 제어 문자나 ref 탈출 문법이 없음을 확인한다."""

    if not value or value.strip() != value or any(character.isspace() for character in value):
        raise common.IntegrationError(f"{field_name} must be a non-empty token")
    if value.startswith("-") or value.startswith("/") or value.endswith("/"):
        raise common.IntegrationError(f"invalid {field_name}: {value}")
    if ".." in value or "@{" in value or "\\" in value:
        raise common.IntegrationError(f"invalid {field_name}: {value}")
    return value


def validate_oid(value: str, field_name: str) -> str:
    """caller가 제공한 expected Git object ID를 full hexadecimal OID로 제한한다."""

    if not re.fullmatch(r"[0-9a-fA-F]{40}|[0-9a-fA-F]{64}", value):
        raise common.IntegrationError(f"{field_name} must be a full Git object ID")
    return value.lower()


def branch_ref(branch: str) -> str:
    """검증된 short branch를 local heads ref로 변환한다."""

    return f"refs/heads/{validate_name(branch, 'branch')}"


def git(
    repo: Path,
    *arguments: str,
    check: bool = True,
) -> Any:
    """공유 subprocess 경계를 통해 shell 없이 Git을 실행한다."""

    return common.run_git(repo, *arguments, check=check)


def git_text(repo: Path, *arguments: str) -> str:
    """성공한 Git 명령의 stdout을 문자열로 반환한다."""

    return git(repo, *arguments).stdout.strip()


def rev_parse(repo: Path, revision: str) -> str:
    """revision을 full object ID로 해석하고 존재하지 않으면 fail-closed한다."""

    return git_text(repo, "rev-parse", "--verify", revision)


def tree_oid(repo: Path, revision: str = "HEAD") -> str:
    """commit 또는 worktree HEAD의 tree object ID를 반환한다."""

    return rev_parse(repo, f"{revision}^{{tree}}")


def sha256_text(value: str) -> str:
    """원문 byte 계약을 고정하는 SHA-256을 계산한다."""

    return common.sha256_text(value)


def safe_run_id(value: str) -> str:
    """run state 경로에 사용할 ID가 단일 안전 path segment인지 검증한다."""

    if not RUN_ID_PATTERN.fullmatch(value) or value in {".", ".."}:
        raise common.IntegrationError(f"invalid run ID: {value}")
    return value


def common_directory(repo: Path) -> Path:
    """linked worktree 전체가 공유하는 Git common directory를 절대 경로로 해석한다."""

    return common.git_common_dir(repo)


def resolve_repository(repo_value: str) -> Path:
    """관리 state가 분산되지 않도록 primary control root 입력만 허용한다."""

    return common.resolve_control_repo(repo_value)


def locks_directory(repo: Path) -> Path:
    """삭제하지 않는 persistent lock file의 공통 디렉터리를 반환한다."""

    path = common_directory(repo) / "yusung-harness-locks"
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    path.chmod(0o700)
    return path


def target_lock_path(repo: Path, target_ref: str) -> Path:
    """full target ref에 안정적으로 대응하는 lock inode 경로를 계산한다."""

    return common.ref_lock_path(common_directory(repo), target_ref)


def run_lock_path(repo: Path, run_id: str) -> Path:
    """단일 integration run의 상태 전이를 직렬화하는 lock 경로를 계산한다."""

    digest = common.sha256_text(safe_run_id(run_id))
    return locks_directory(repo) / f"run-{digest}.lock"


def repository_lock_path(repo: Path) -> Path:
    """worktree 등록과 정리를 직렬화하는 repository lock 경로를 반환한다."""

    return common.ref_lock_path(common_directory(repo), "repository")


def management_root(repo: Path, config: dict[str, Any]) -> Path:
    """target config가 지정한 관리 경로를 repository 내부로 제한한다."""

    value = config.get("management_root", ".yusung-harness")
    if not isinstance(value, str) or not value or Path(value).is_absolute():
        raise common.IntegrationError("invalid management_root")
    root = (repo / value).resolve()
    try:
        root.relative_to(repo)
    except ValueError as error:
        raise common.IntegrationError("management_root escapes repository") from error
    return root


def load_json(path: Path) -> Any:
    """손상되거나 JSON이 아닌 persisted state를 fail-closed로 읽는다."""

    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise common.IntegrationError(f"cannot read state: {path}") from error


def write_json(path: Path, payload: Any) -> None:
    """공유 atomic writer를 사용해 state JSON을 권한 제한 파일로 교체한다."""

    common.atomic_write_json(path, payload)
    path.chmod(0o600)


def manifest_path(run_path: Path) -> Path:
    """integration run의 authoritative manifest 경로를 반환한다."""

    return run_path / "manifest.json"


def load_manifest(repo: Path, run_id: str) -> tuple[Path, dict[str, Any]]:
    """run manifest의 schema와 repository binding을 검증해 반환한다."""

    candidate_paths = list(
        (repo / ".yusung-harness" / "integrations").glob(
            f"{safe_run_id(run_id)}/manifest.json"
        )
    )
    if len(candidate_paths) != 1:
        raise common.IntegrationError(f"integration run not found: {run_id}")
    path = candidate_paths[0]
    payload = load_json(path)
    if not isinstance(payload, dict) or payload.get("schemaVersion") != SCHEMA_VERSION:
        raise common.IntegrationError("unsupported integration manifest")
    payload_keys = set(payload)
    if not RUN_MANIFEST_REQUIRED_KEYS.issubset(payload_keys) or not payload_keys.issubset(
        RUN_MANIFEST_REQUIRED_KEYS | RUN_MANIFEST_OPTIONAL_KEYS
    ):
        raise common.IntegrationError("integration manifest schema is invalid")
    if payload.get("repoRoot") != str(repo):
        raise common.IntegrationError("integration manifest repository mismatch")
    return path.parent, payload


def save_manifest(run_path: Path, manifest: dict[str, Any]) -> None:
    """generation을 증가시키고 manifest를 원자적으로 영속화한다."""

    manifest["generation"] = int(manifest.get("generation", 0)) + 1
    manifest["updatedAt"] = utc_now()
    write_json(manifest_path(run_path), manifest)


def load_target_config(repo: Path, target_head: str) -> tuple[dict[str, Any], str]:
    """expected target commit의 config만 읽어 현재 run의 검증 authority로 사용한다."""

    profile = common.load_config_from_revision(repo, target_head).require_configured()
    config = {
        "schema_version": profile.schema_version,
        "configured": profile.configured,
        "branch_prefix": profile.branch_prefix,
        "management_root": profile.management_root,
        "merge_strategy": profile.merge_strategy,
        "cleanup": profile.cleanup,
        "conflict_policy": profile.conflict_policy,
        "required_verification_categories": list(
            profile.required_verification_categories
        ),
        "verification": {
            "prepare": {
                name: command.as_dict() for name, command in profile.prepare.items()
            },
            "source": {
                name: command.as_dict() for name, command in profile.source.items()
            },
            "candidate": {
                name: command.as_dict() for name, command in profile.candidate.items()
            },
        },
    }
    return config, profile.raw_text


def validate_authoritative_config(
    repo: Path,
    manifest: dict[str, Any],
) -> dict[str, Any]:
    """target snapshot config를 다시 읽어 raw hash와 normalized shape를 모두 검증한다."""

    config, raw = load_target_config(repo, manifest["targetHead"])
    if sha256_text(raw) != manifest.get("configSha256"):
        raise common.IntegrationError("target config digest does not match run manifest")
    if config != manifest.get("config"):
        raise common.IntegrationError("normalized target config does not match run manifest")
    return config


def config_command(
    config: dict[str, Any],
    phase: str,
    check: str,
) -> dict[str, Any]:
    """정규화된 config에서 exact argv/cwd command를 선택한다."""

    verification = config.get("verification")
    if not isinstance(verification, dict):
        raise common.IntegrationError("integration config has no verification map")
    phase_config = verification.get(phase)
    if not isinstance(phase_config, dict):
        raise common.IntegrationError(f"verification phase not configured: {phase}")
    command = phase_config.get(check)
    if not isinstance(command, dict):
        raise common.IntegrationError(f"verification check not configured: {phase}/{check}")
    argv = command.get("argv")
    cwd = command.get("cwd")
    if (
        not isinstance(argv, list)
        or not argv
        or not all(isinstance(item, str) and item for item in argv)
        or not isinstance(cwd, str)
    ):
        raise common.IntegrationError(f"invalid verification command: {phase}/{check}")
    return {"argv": argv, "cwd": cwd}


def command_directory(worktree: Path, relative: str) -> Path:
    """verification cwd를 대상 worktree 내부의 실제 디렉터리로 제한한다."""

    if Path(relative).is_absolute():
        raise common.IntegrationError("verification cwd must be relative")
    path = (worktree / relative).resolve()
    try:
        path.relative_to(worktree.resolve())
    except ValueError as error:
        raise common.IntegrationError("verification cwd escapes worktree") from error
    if not path.is_dir():
        raise common.IntegrationError(f"verification cwd does not exist: {relative}")
    return path


def clean_status_hash(worktree: Path) -> str:
    """tracked와 non-ignored untracked 상태가 clean인지 확인하고 상태 hash를 반환한다."""

    status = git(worktree, "status", "--porcelain=v1", "--untracked-files=all").stdout
    if status:
        raise common.IntegrationError(f"worktree is not clean: {worktree}")
    return sha256_text(status)


def run_configured_command(
    worktree: Path,
    command: dict[str, Any],
    phase: str,
    category: str,
    expected_head: str,
    expected_tree: str,
) -> dict[str, Any]:
    """config exact argv를 shell 없이 실행하고 immutable snapshot evidence를 생성한다."""

    argv = list(command["argv"])
    cwd = command_directory(worktree, command["cwd"])
    before_head = rev_parse(worktree, "HEAD")
    before_tree = tree_oid(worktree)
    if before_head != expected_head or before_tree != expected_tree:
        raise common.IntegrationError("verification snapshot changed before command")
    before_status = clean_status_hash(worktree)
    started_at = utc_now()
    result = common.run_command(argv, cwd=cwd, check=False)
    completed_at = utc_now()
    after_head = rev_parse(worktree, "HEAD")
    after_tree = tree_oid(worktree)
    after_status = clean_status_hash(worktree)
    if after_head != expected_head or after_tree != expected_tree:
        raise common.IntegrationError("verification command changed HEAD or tree")
    if result.returncode != 0:
        raise common.IntegrationError(
            f"verification failed ({phase}/{category}): {result.returncode}"
        )
    evidence = {
        "phase": phase,
        "category": category,
        "headSha": expected_head,
        "treeSha": expected_tree,
        "argv": argv,
        "cwd": command["cwd"],
        "startedAt": started_at,
        "completedAt": completed_at,
        "returncode": result.returncode,
        "beforeStatusSha256": before_status,
        "afterStatusSha256": after_status,
        "stdoutSha256": sha256_text(result.stdout),
        "stderrSha256": sha256_text(result.stderr),
    }
    evidence["sha256"] = common.sha256_canonical_json(evidence)
    return evidence


def source_manifest(repo: Path, source: str) -> tuple[Path, dict[str, Any]]:
    """source branch를 소유하는 단일 managed worktree manifest를 찾는다."""

    root = repo / ".yusung-harness" / "state" / "worktrees"
    matches: list[tuple[Path, dict[str, Any]]] = []
    if root.is_dir():
        for path in sorted(root.glob("*.json")):
            payload = load_json(path)
            if (
                isinstance(payload, dict)
                and set(payload) == WORKTREE_MANIFEST_KEYS
                and payload.get("branch") == source
            ):
                matches.append((path, payload))
    if len(matches) != 1:
        raise common.IntegrationError("source managed worktree manifest not found")
    return matches[0]


def validate_ready_source(
    repo: Path,
    source: str,
    expected_head: str,
    config: dict[str, Any],
) -> tuple[Path, Path, dict[str, Any], list[dict[str, Any]]]:
    """READY 문자열뿐 아니라 source ref, worktree, tree와 targeted evidence를 재검증한다."""

    manifest_path, manifest = source_manifest(repo, source)
    if manifest.get("schemaVersion") != SCHEMA_VERSION or manifest.get("state") != "READY":
        raise common.IntegrationError("source worktree is not READY")
    if manifest.get("repoRoot") != str(repo) or manifest.get("headSha") != expected_head:
        raise common.IntegrationError("source READY snapshot does not match request")
    path_value = manifest.get("path")
    if not isinstance(path_value, str):
        raise common.IntegrationError("source manifest path is invalid")
    source_path = Path(path_value).resolve()
    if not source_path.is_dir() or rev_parse(source_path, "HEAD") != expected_head:
        raise common.IntegrationError("source worktree HEAD does not match READY evidence")
    if git_text(source_path, "branch", "--show-current") != source:
        raise common.IntegrationError("source worktree branch mismatch")
    clean_status_hash(source_path)
    expected_tree = tree_oid(source_path)
    verification = manifest.get("verification")
    if not isinstance(verification, list) or not verification:
        raise common.IntegrationError("source READY evidence is missing")
    targeted_checks = manifest.get("targetedChecks")
    if not isinstance(targeted_checks, list) or not targeted_checks:
        raise common.IntegrationError("source targeted check contract is missing")
    configured_source = config.get("verification", {}).get("source", {})
    if not isinstance(configured_source, dict):
        raise common.IntegrationError("target config source verification is invalid")
    configured_identities = {
        (command.get("cwd"), tuple(command.get("argv", [])))
        for command in configured_source.values()
        if isinstance(command, dict)
    }
    targeted_identities: set[tuple[Any, tuple[Any, ...]]] = set()
    for check in targeted_checks:
        if not isinstance(check, dict) or set(check) != {"name", "cwd", "argv"}:
            raise common.IntegrationError("source targeted check contract is invalid")
        identity = (check.get("cwd"), tuple(check.get("argv", [])))
        if identity not in configured_identities:
            raise common.IntegrationError(
                "source targeted check does not match target config"
            )
        targeted_identities.add(identity)
    normalized: list[dict[str, Any]] = []
    for item in verification:
        if not isinstance(item, dict):
            raise common.IntegrationError("source READY evidence is invalid")
        if item.get("headSha") != expected_head or item.get("treeSha") != expected_tree:
            raise common.IntegrationError("source READY evidence is stale")
        if item.get("returncode") != 0:
            raise common.IntegrationError("source READY verification failed")
        if (item.get("cwd"), tuple(item.get("argv", []))) not in targeted_identities:
            raise common.IntegrationError("source READY evidence command is not approved")
        evidence = dict(item)
        evidence.setdefault("sha256", common.sha256_canonical_json(evidence))
        normalized.append(evidence)
    return source_path, manifest_path, manifest, normalized


def create_run_directory(repo: Path, config: dict[str, Any]) -> tuple[str, Path]:
    """충돌하지 않는 integration run directory를 권한 0700으로 생성한다."""

    root = management_root(repo, config) / "integrations"
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    root.chmod(0o700)
    for _ in range(8):
        run_id = f"run-{uuid.uuid4().hex}"
        path = root / run_id
        try:
            path.mkdir(mode=0o700)
            return run_id, path
        except FileExistsError:
            continue
    raise common.IntegrationError("cannot allocate integration run ID")


def parse_worktrees(repo: Path) -> list[dict[str, str]]:
    """porcelain worktree 등록을 path/head/branch record로 파싱한다."""

    output = git(repo, "worktree", "list", "--porcelain").stdout
    records: list[dict[str, str]] = []
    current: dict[str, str] = {}
    for line in output.splitlines() + [""]:
        if not line:
            if current:
                records.append(current)
                current = {}
            continue
        key, _, value = line.partition(" ")
        current[key] = value
    return records


def assert_related_history(repo: Path, source_head: str, target_head: str) -> str:
    """source와 target의 공통 조상을 계산하고 unrelated history를 거부한다."""

    result = git(repo, "merge-base", source_head, target_head, check=False)
    if result.returncode != 0 or not result.stdout.strip():
        raise common.IntegrationError("source and target histories are unrelated")
    return result.stdout.strip()


def assert_candidate_parents(
    repo: Path,
    candidate_head: str,
    target_head: str,
    source_head: str,
) -> None:
    """candidate merge commit의 정확한 두 parent 순서를 검증한다."""

    values = git_text(repo, "rev-list", "--parents", "-n", "1", candidate_head).split()
    if values != [candidate_head, target_head, source_head]:
        raise common.IntegrationError("candidate is not the approved no-ff merge commit")


def write_merge_message(run_path: Path, source: str, target: str) -> Path:
    """shell interpolation 없이 Git commit에 전달할 고정 merge message를 작성한다."""

    path = run_path / "merge-message.txt"
    path.write_text(f"Merge {source} into {target}\n", encoding="utf-8")
    path.chmod(0o600)
    return path


def commit_candidate(
    candidate_path: Path,
    message_path: Path,
    target_head: str,
    source_head: str,
) -> tuple[str, str]:
    """hook 전후 message/tree/parents/clean 상태가 고정된 merge commit만 승인한다."""

    expected_message = message_path.read_text(encoding="utf-8").rstrip("\n")
    expected_tree = git_text(candidate_path, "write-tree")
    git(candidate_path, "commit", "-F", str(message_path))
    candidate_head = rev_parse(candidate_path, "HEAD")
    assert_candidate_parents(
        candidate_path,
        candidate_head,
        target_head,
        source_head,
    )
    actual_message = git(
        candidate_path,
        "show",
        "-s",
        "--format=%B",
        candidate_head,
    ).stdout.rstrip("\n")
    actual_tree = tree_oid(candidate_path)
    if actual_message != expected_message:
        raise common.IntegrationError("commit hook changed the approved merge message")
    if actual_tree != expected_tree:
        raise common.IntegrationError("commit hook changed the approved merge tree")
    clean_status_hash(candidate_path)
    return candidate_head, actual_tree


def conflict_is_binary(
    candidate_path: Path,
    stages: dict[str, dict[str, str]],
) -> bool:
    """stage-2/3 blob numstat으로 binary conflict를 결정론적으로 판별한다."""

    ours = stages.get("2", {}).get("oid")
    theirs = stages.get("3", {}).get("oid")
    if not ours or not theirs:
        return False
    result = git(candidate_path, "diff", "--numstat", ours, theirs, check=False)
    if result.returncode != 0:
        raise common.IntegrationError("cannot classify conflict blob content")
    fields = result.stdout.split()
    return len(fields) >= 2 and fields[0] == "-" and fields[1] == "-"


def classify_conflicts(candidate_path: Path) -> list[dict[str, Any]]:
    """unmerged index stage와 경로 기반 risk를 결정론적으로 분류한다."""

    paths = sorted(
        line
        for line in git(candidate_path, "diff", "--name-only", "--diff-filter=U").stdout.splitlines()
        if line
    )
    stage_lines = git(candidate_path, "ls-files", "-u").stdout.splitlines()
    stages_by_path: dict[str, dict[str, dict[str, str]]] = {}
    for line in stage_lines:
        metadata, separator, path = line.partition("\t")
        if not separator:
            continue
        mode, oid, stage = metadata.split()
        stages_by_path.setdefault(path, {})[stage] = {"mode": mode, "oid": oid}
    conflicts: list[dict[str, Any]] = []
    for path in paths:
        stages = stages_by_path.get(path, {})
        modes = {item["mode"] for item in stages.values()}
        lower = path.lower()
        is_schema = "schema" in lower or lower.endswith((".sql", ".prisma"))
        is_migration = "migration" in lower or "/migrations/" in lower
        is_secret = any(token in lower for token in ("secret", "credential", ".env"))
        is_contract = any(
            token in lower for token in ("api", "contract", "public", "types", "schema")
        )
        conflict_kind = "content"
        if "2" not in stages or "3" not in stages:
            conflict_kind = "add-delete"
        if "160000" in modes:
            conflict_kind = "submodule"
        elif "120000" in modes:
            conflict_kind = "symlink"
        elif conflict_is_binary(candidate_path, stages):
            conflict_kind = "binary"
        requires_user = conflict_kind in {"add-delete", "submodule", "symlink"} or any(
            (is_schema, is_migration, is_secret)
        )
        if conflict_kind == "binary":
            requires_user = True
        conflicts.append(
            {
                "path": path,
                "kind": conflict_kind,
                "stages": stages,
                "risk": {
                    "schema": is_schema,
                    "migration": is_migration,
                    "secret": is_secret,
                    "publicContract": is_contract,
                },
                "requiredEvidence": "user" if requires_user else "semantic",
            }
        )
    return conflicts


def create_conflict_bundle(
    repo: Path,
    run_path: Path,
    source: str,
    target: str,
) -> tuple[Path, str]:
    """충돌 재현에 필요한 source와 target refs를 portable Git bundle로 보존한다."""

    path = run_path / "conflict-evidence.bundle"
    git(repo, "bundle", "create", str(path), branch_ref(source), branch_ref(target))
    path.chmod(0o600)
    return path, common.sha256_file(path)


def prepare(args: argparse.Namespace) -> dict[str, Any]:
    """READY source를 target 불변의 isolated no-ff candidate로 준비한다."""

    repo = resolve_repository(args.repo)
    source = validate_name(args.source, "source")
    target = validate_name(args.target, "target")
    source_ref = branch_ref(source)
    target_ref = branch_ref(target)
    expected_source = validate_oid(args.expected_source_head, "expected source head")
    expected_target = validate_oid(args.expected_target_head, "expected target head")
    with common.persistent_lock(repository_lock_path(repo)), common.persistent_lock(
        target_lock_path(repo, target_ref)
    ):
        git(repo, "check-ref-format", "--branch", source)
        git(repo, "check-ref-format", "--branch", target)
        if rev_parse(repo, source_ref) != expected_source:
            raise common.IntegrationError("source ref is stale")
        if rev_parse(repo, target_ref) != expected_target:
            raise common.IntegrationError("target ref is stale")
        config, config_raw = load_target_config(repo, expected_target)
        if config.get("merge_strategy") != "no-ff":
            raise common.IntegrationError("integration config must require no-ff")
        source_path, source_manifest_path, source_state, source_evidence = validate_ready_source(
            repo, source, expected_source, config
        )
        target_worktrees = [
            item for item in parse_worktrees(repo) if item.get("branch") == target_ref
        ]
        if len(target_worktrees) > 1:
            raise common.IntegrationError("target branch is checked out more than once")
        if target_worktrees:
            clean_status_hash(Path(target_worktrees[0]["worktree"]))
        merge_base = assert_related_history(repo, expected_source, expected_target)
        run_id, run_path = create_run_directory(repo, config)
        candidate_branch = f"yusung-integration/{run_id}"
        candidate_ref = branch_ref(candidate_branch)
        candidate_path = run_path / "worktree"
        manifest: dict[str, Any] = {
            "schemaVersion": SCHEMA_VERSION,
            "generation": 0,
            "state": "INITIALIZING",
            "repoRoot": str(repo),
            "runId": run_id,
            "source": source,
            "sourceRef": source_ref,
            "sourceHead": expected_source,
            "sourceTree": tree_oid(repo, expected_source),
            "sourcePath": str(source_path),
            "sourceAgent": source_state.get("agent"),
            "sourceManifestPath": str(source_manifest_path),
            "sourceManifestSha256": common.sha256_file(source_manifest_path),
            "target": target,
            "targetRef": target_ref,
            "targetHead": expected_target,
            "targetTree": tree_oid(repo, expected_target),
            "mergeBase": merge_base,
            "config": config,
            "configSha256": sha256_text(config_raw),
            "candidateBranch": candidate_branch,
            "candidateRef": candidate_ref,
            "candidatePath": str(candidate_path),
            "candidateHead": None,
            "candidateTree": None,
            "hadConflicts": False,
            "conflictSha256": None,
            "resolutionsSha256": None,
            "review": None,
            "verification": {
                "prepare": {},
                "source": {"targeted": source_evidence},
                "candidate": {},
            },
            "promotion": None,
            "createdAt": utc_now(),
        }
        already_merged = git(
            repo,
            "merge-base",
            "--is-ancestor",
            expected_source,
            expected_target,
            check=False,
        )
        if already_merged.returncode == 0:
            manifest["state"] = "ALREADY_MERGED"
            manifest["candidateBranch"] = None
            manifest["candidateRef"] = None
            manifest["candidatePath"] = None
            save_manifest(run_path, manifest)
            cleanup_already_merged(
                repo,
                run_path,
                manifest,
                target_worktrees,
            )
            return manifest
        save_manifest(run_path, manifest)
        try:
            source_prepare_command = config_command(config, "prepare", "source")
            source_prepare_evidence = run_configured_command(
                source_path,
                source_prepare_command,
                "prepare",
                "source",
                expected_source,
                tree_oid(repo, expected_source),
            )
            manifest["verification"]["prepare"]["source"] = source_prepare_evidence
            save_manifest(run_path, manifest)
            git(
                repo,
                "worktree",
                "add",
                "-b",
                candidate_branch,
                str(candidate_path),
                expected_target,
            )
            prepare_command = config_command(config, "prepare", "candidate")
            prepare_evidence = run_configured_command(
                candidate_path,
                prepare_command,
                "prepare",
                "candidate",
                expected_target,
                tree_oid(repo, expected_target),
            )
            manifest["verification"]["prepare"]["candidate"] = prepare_evidence
            save_manifest(run_path, manifest)
            merge_result = git(
                candidate_path,
                "merge",
                "--no-ff",
                "--no-commit",
                expected_source,
                check=False,
            )
            if merge_result.returncode == 0:
                message_path = write_merge_message(run_path, source, target)
                candidate_head, candidate_tree = commit_candidate(
                    candidate_path,
                    message_path,
                    expected_target,
                    expected_source,
                )
                manifest["candidateHead"] = candidate_head
                manifest["candidateTree"] = candidate_tree
                manifest["state"] = "CANDIDATE_COMMITTED"
            else:
                conflicts = classify_conflicts(candidate_path)
                if not conflicts:
                    raise common.IntegrationError(
                        f"merge failed without conflicts: {merge_result.stderr.strip()}"
                    )
                bundle_path, bundle_hash = create_conflict_bundle(
                    repo, run_path, source, target
                )
                write_json(run_path / "conflicts.json", conflicts)
                write_json(run_path / "resolutions.json", [])
                manifest["state"] = "DECISION_REQUIRED"
                manifest["hadConflicts"] = True
                manifest["conflictSha256"] = common.sha256_canonical_json(conflicts)
                manifest["conflictBundle"] = bundle_path.name
                manifest["conflictBundleSha256"] = bundle_hash
            save_manifest(run_path, manifest)
            return manifest
        except Exception:
            if manifest.get("state") == "INITIALIZING":
                manifest["state"] = "FAILED"
                save_manifest(run_path, manifest)
            raise


def status(args: argparse.Namespace) -> dict[str, Any]:
    """현재 persisted run manifest를 mutation 없이 반환한다."""

    repo = resolve_repository(args.repo)
    with common.persistent_lock(run_lock_path(repo, args.run_id)):
        _, manifest = load_manifest(repo, args.run_id)
        return manifest


def current_index_entry(candidate_path: Path, path: str) -> tuple[str, str]:
    """resolved path의 stage-0 index mode와 blob OID를 반환한다."""

    lines = git(candidate_path, "ls-files", "-s", "--", path).stdout.splitlines()
    stage_zero = []
    for line in lines:
        metadata, separator, listed_path = line.partition("\t")
        if separator and listed_path == path:
            mode, oid, stage = metadata.split()
            if stage == "0":
                stage_zero.append((mode, oid))
    if len(stage_zero) != 1:
        raise common.IntegrationError("resolved path is not staged exactly once")
    return stage_zero[0]


def validate_resolution_evidence(
    conflict: dict[str, Any],
    classification: str,
    evidence: str,
) -> None:
    """classification과 risk에 필요한 명시적 evidence prefix를 검증한다."""

    if not EVIDENCE_PATTERN.fullmatch(evidence):
        raise common.IntegrationError(
            "evidence must use code|test|plan|user:<reference>"
        )
    prefix = evidence.partition(":")[0]
    if classification == "mechanical" and prefix not in {"code", "test"}:
        raise common.IntegrationError("mechanical resolution requires code/test evidence")
    if classification == "semantic" and prefix not in {"plan", "user"}:
        raise common.IntegrationError("semantic resolution requires plan/user evidence")
    if conflict.get("requiredEvidence") == "semantic" and classification != "semantic":
        raise common.IntegrationError("this conflict requires semantic resolution evidence")
    if conflict.get("requiredEvidence") == "user" and prefix != "user":
        raise common.IntegrationError("this conflict requires explicit user evidence")


def resolve(args: argparse.Namespace) -> dict[str, Any]:
    """staged conflict resolution을 blob-bound evidence로 승인한다."""

    repo = resolve_repository(args.repo)
    with common.persistent_lock(run_lock_path(repo, args.run_id)):
        run_path, manifest = load_manifest(repo, args.run_id)
        if manifest.get("state") not in {"CONFLICTED", "DECISION_REQUIRED"}:
            raise common.IntegrationError("run is not waiting for conflict resolution")
        conflicts = load_json(run_path / "conflicts.json")
        if not isinstance(conflicts, list):
            raise common.IntegrationError("conflict evidence is invalid")
        matching = [item for item in conflicts if item.get("path") == args.path]
        if len(matching) != 1:
            raise common.IntegrationError("path is not an approved conflict")
        conflict = matching[0]
        validate_resolution_evidence(conflict, args.classification, args.evidence)
        candidate_path = Path(manifest["candidatePath"])
        if git(candidate_path, "ls-files", "-u", "--", args.path).stdout:
            raise common.IntegrationError("path still has unmerged index entries")
        unstaged = git(candidate_path, "diff", "--quiet", "--", args.path, check=False)
        if unstaged.returncode != 0:
            raise common.IntegrationError("path has unstaged resolution changes")
        mode, oid = current_index_entry(candidate_path, args.path)
        stages = conflict.get("stages", {})
        selected_side: Optional[str] = None
        if isinstance(stages, dict):
            ours_oid = stages.get("2", {}).get("oid")
            theirs_oid = stages.get("3", {}).get("oid")
            if oid == ours_oid:
                selected_side = "ours"
            elif oid == theirs_oid:
                selected_side = "theirs"
        if selected_side is not None and not (
            conflict.get("kind") == "binary"
            and args.classification == "semantic"
            and args.evidence.startswith("user:")
        ):
            raise common.IntegrationError("whole-side conflict selection is not accepted")
        resolved_path = candidate_path / args.path
        if resolved_path.is_file() and mode != "160000":
            content = resolved_path.read_bytes()
            if any(marker in content for marker in (b"<<<<<<<", b"=======", b">>>>>>>")):
                raise common.IntegrationError("conflict marker remains in resolved content")
        resolutions_path = run_path / "resolutions.json"
        resolutions = load_json(resolutions_path)
        if not isinstance(resolutions, list):
            raise common.IntegrationError("resolution evidence is invalid")
        resolutions = [item for item in resolutions if item.get("path") != args.path]
        resolution = {
            "path": args.path,
            "classification": args.classification,
            "evidence": args.evidence,
            "mode": mode,
            "oid": oid,
            "recordedAt": utc_now(),
        }
        if selected_side is not None:
            resolution["selectedSide"] = selected_side
        resolutions.append(resolution)
        resolutions.sort(key=lambda item: item["path"])
        write_json(resolutions_path, resolutions)
        if len(resolutions) == len(conflicts) and not git(
            candidate_path, "ls-files", "-u"
        ).stdout:
            manifest["state"] = "RESOLVED"
        else:
            manifest["state"] = "CONFLICTED"
        manifest["resolutionsSha256"] = common.sha256_canonical_json(resolutions)
        manifest["review"] = None
        save_manifest(run_path, manifest)
        return manifest


def assert_resolution_snapshot(run_path: Path, manifest: dict[str, Any]) -> None:
    """finalize 전에 모든 recorded index blob과 resolution hash가 그대로인지 확인한다."""

    conflicts = load_json(run_path / "conflicts.json")
    resolutions = load_json(run_path / "resolutions.json")
    if not isinstance(conflicts, list) or not isinstance(resolutions, list):
        raise common.IntegrationError("conflict state is invalid")
    if common.sha256_canonical_json(conflicts) != manifest.get("conflictSha256"):
        raise common.IntegrationError("conflict evidence changed")
    if common.sha256_canonical_json(resolutions) != manifest.get("resolutionsSha256"):
        raise common.IntegrationError("resolution evidence changed")
    if {item.get("path") for item in conflicts} != {
        item.get("path") for item in resolutions
    }:
        raise common.IntegrationError("not every conflict has resolution evidence")
    candidate_path = Path(manifest["candidatePath"])
    if git(candidate_path, "ls-files", "-u").stdout:
        raise common.IntegrationError("candidate still has unmerged entries")
    for resolution in resolutions:
        mode, oid = current_index_entry(candidate_path, resolution["path"])
        if mode != resolution.get("mode") or oid != resolution.get("oid"):
            raise common.IntegrationError("recorded resolution blob changed")


def finalize(args: argparse.Namespace) -> dict[str, Any]:
    """모든 conflict evidence가 고정된 candidate에 no-ff merge commit을 생성한다."""

    repo = resolve_repository(args.repo)
    with common.persistent_lock(run_lock_path(repo, args.run_id)):
        run_path, manifest = load_manifest(repo, args.run_id)
        if manifest.get("state") != "RESOLVED":
            raise common.IntegrationError("run is not ready to finalize")
        assert_resolution_snapshot(run_path, manifest)
        candidate_path = Path(manifest["candidatePath"])
        message_path = write_merge_message(
            run_path, manifest["source"], manifest["target"]
        )
        candidate_head, candidate_tree = commit_candidate(
            candidate_path,
            message_path,
            manifest["targetHead"],
            manifest["sourceHead"],
        )
        manifest["candidateHead"] = candidate_head
        manifest["candidateTree"] = candidate_tree
        manifest["verification"]["candidate"] = {}
        manifest["review"] = None
        manifest["state"] = "CANDIDATE_COMMITTED"
        save_manifest(run_path, manifest)
        return manifest


def verification_worktree(
    repo: Path, manifest: dict[str, Any], phase: str
) -> tuple[Path, str, str]:
    """source/candidate phase에 바인딩된 worktree, head, tree snapshot을 반환한다."""

    if phase == "candidate":
        head = manifest.get("candidateHead")
        tree = manifest.get("candidateTree")
        path = Path(manifest["candidatePath"])
    elif phase == "source":
        head = manifest.get("sourceHead")
        tree = manifest.get("sourceTree")
        path = Path(manifest["sourcePath"])
    else:
        raise common.IntegrationError(f"unsupported verification phase: {phase}")
    if not isinstance(head, str) or not isinstance(tree, str) or not path.is_dir():
        raise common.IntegrationError("verification snapshot is unavailable")
    if rev_parse(repo, manifest[f"{phase}Ref"] if phase == "source" else manifest["candidateRef"]) != head:
        raise common.IntegrationError("verification ref is stale")
    return path, head, tree


def verify(args: argparse.Namespace) -> dict[str, Any]:
    """target config의 exact command만 실행해 source/candidate evidence를 기록한다."""

    repo = resolve_repository(args.repo)
    with common.persistent_lock(run_lock_path(repo, args.run_id)):
        run_path, manifest = load_manifest(repo, args.run_id)
        if manifest.get("state") not in {
            "CANDIDATE_COMMITTED",
            "VERIFYING",
            "VERIFIED",
        }:
            raise common.IntegrationError("run cannot be verified in its current state")
        requested_argv = list(args.command)
        if requested_argv and requested_argv[0] == "--":
            requested_argv = requested_argv[1:]
        config = validate_authoritative_config(repo, manifest)
        command = config_command(config, args.phase, args.check)
        if requested_argv != command["argv"]:
            raise common.IntegrationError("verification argv does not exactly match target config")
        path, head, tree = verification_worktree(repo, manifest, args.phase)
        evidence = run_configured_command(
            path, command, args.phase, args.check, head, tree
        )
        phase_evidence = manifest["verification"].setdefault(args.phase, {})
        phase_evidence[args.check] = evidence
        if args.phase == "candidate":
            required = manifest["config"].get(
                "required_verification_categories", list(REQUIRED_CANDIDATE_CHECKS)
            )
            if not isinstance(required, list) or set(required) != set(
                REQUIRED_CANDIDATE_CHECKS
            ):
                raise common.IntegrationError("candidate verification categories are invalid")
            manifest["state"] = (
                "VERIFIED"
                if all(category in phase_evidence for category in required)
                else "VERIFYING"
            )
        save_manifest(run_path, manifest)
        return manifest


def review(args: argparse.Namespace) -> dict[str, Any]:
    """conflict candidate에 독립 reviewer의 candidate-bound verdict를 기록한다."""

    repo = resolve_repository(args.repo)
    with common.persistent_lock(run_lock_path(repo, args.run_id)):
        run_path, manifest = load_manifest(repo, args.run_id)
        if not manifest.get("hadConflicts") or manifest.get("state") not in {
            "CANDIDATE_COMMITTED",
            "VERIFYING",
            "VERIFIED",
        }:
            raise common.IntegrationError("run does not accept conflict review")
        validate_authoritative_config(repo, manifest)
        if not args.reviewer.strip() or args.reviewer == manifest.get("sourceAgent"):
            raise common.IntegrationError("reviewer must be an independent identity")
        if not EVIDENCE_PATTERN.fullmatch(args.evidence):
            raise common.IntegrationError("review evidence is invalid")
        payload = {
            "verdict": args.verdict,
            "reviewer": args.reviewer,
            "evidence": args.evidence,
            "candidateHead": manifest.get("candidateHead"),
            "candidateTree": manifest.get("candidateTree"),
            "conflictSha256": manifest.get("conflictSha256"),
            "resolutionsSha256": manifest.get("resolutionsSha256"),
            "reviewedAt": utc_now(),
        }
        payload["sha256"] = common.sha256_canonical_json(payload)
        write_json(run_path / "review.json", payload)
        manifest["review"] = payload
        save_manifest(run_path, manifest)
        return manifest


def validate_embedded_sha256(payload: dict[str, Any], label: str) -> None:
    """payload의 sha256을 제외한 canonical JSON digest를 재계산해 변조를 차단한다."""

    expected = payload.get("sha256")
    content = dict(payload)
    content.pop("sha256", None)
    if expected != common.sha256_canonical_json(content):
        raise common.IntegrationError(f"{label} digest is invalid")


def validate_conflict_artifacts(
    run_path: Path,
    manifest: dict[str, Any],
) -> None:
    """bundle, conflict, resolution과 reviewer 파일을 persisted digest에 재결합한다."""

    conflicts_path = run_path / "conflicts.json"
    resolutions_path = run_path / "resolutions.json"
    bundle_name = manifest.get("conflictBundle")
    if not isinstance(bundle_name, str):
        raise common.IntegrationError("conflict bundle metadata is missing")
    bundle_path = run_path / bundle_name
    if (
        not conflicts_path.is_file()
        or not resolutions_path.is_file()
        or not bundle_path.is_file()
    ):
        raise common.IntegrationError("conflict evidence artifact is missing")
    conflicts = load_json(conflicts_path)
    resolutions = load_json(resolutions_path)
    if common.sha256_canonical_json(conflicts) != manifest.get("conflictSha256"):
        raise common.IntegrationError("conflicts.json digest changed")
    if common.sha256_canonical_json(resolutions) != manifest.get(
        "resolutionsSha256"
    ):
        raise common.IntegrationError("resolutions.json digest changed")
    if common.sha256_file(bundle_path) != manifest.get("conflictBundleSha256"):
        raise common.IntegrationError("conflict bundle digest changed")
    review_path = run_path / "review.json"
    if not review_path.is_file():
        raise common.IntegrationError("review evidence artifact is missing")
    review_payload = load_json(review_path)
    if not isinstance(review_payload, dict) or review_payload != manifest.get("review"):
        raise common.IntegrationError("review evidence does not match manifest")
    validate_embedded_sha256(review_payload, "review evidence")


def validate_candidate_gate(
    repo: Path,
    manifest: dict[str, Any],
    *,
    allow_promoted_target: bool = False,
    cleanup_only: bool = False,
) -> None:
    """promotion 직전에 refs, parents, exact evidence와 conflict review를 모두 재검증한다."""

    allowed_states = {"VERIFIED", "PROMOTING"}
    if cleanup_only:
        allowed_states.update({"PROMOTED", "CLEANUP_PARTIAL"})
    if manifest.get("state") not in allowed_states:
        raise common.IntegrationError("candidate has not passed every verification gate")
    config = validate_authoritative_config(repo, manifest)
    for ref_key, head_key in (
        ("sourceRef", "sourceHead"),
        ("candidateRef", "candidateHead"),
    ):
        result = git(
            repo,
            "rev-parse",
            "-q",
            "--verify",
            manifest[ref_key],
            check=False,
        )
        if cleanup_only and result.returncode != 0:
            continue
        if result.returncode != 0 or result.stdout.strip() != manifest[head_key]:
            raise common.IntegrationError(f"{ref_key} is stale")
    target_head = rev_parse(repo, manifest["targetRef"])
    allowed_target_heads = {manifest["targetHead"]}
    if allow_promoted_target:
        allowed_target_heads.add(manifest["candidateHead"])
    if target_head not in allowed_target_heads:
        raise common.IntegrationError("targetRef is stale")
    assert_candidate_parents(
        repo,
        manifest["candidateHead"],
        manifest["targetHead"],
        manifest["sourceHead"],
    )
    if tree_oid(repo, manifest["candidateHead"]) != manifest.get("candidateTree"):
        raise common.IntegrationError("candidate tree changed")
    evidence = manifest.get("verification", {}).get("candidate", {})
    for category in REQUIRED_CANDIDATE_CHECKS:
        item = evidence.get(category)
        command = config_command(config, "candidate", category)
        if (
            not isinstance(item, dict)
            or item.get("headSha") != manifest["candidateHead"]
            or item.get("treeSha") != manifest["candidateTree"]
            or item.get("argv") != command["argv"]
            or item.get("cwd") != command["cwd"]
            or item.get("returncode") != 0
        ):
            raise common.IntegrationError(f"candidate evidence is stale: {category}")
        validate_embedded_sha256(item, f"candidate evidence {category}")
    if manifest.get("hadConflicts"):
        run_path = Path(manifest["candidatePath"]).parent
        validate_conflict_artifacts(run_path, manifest)
        review_payload = manifest.get("review")
        if (
            not isinstance(review_payload, dict)
            or review_payload.get("verdict") != "PASS"
            or review_payload.get("candidateHead") != manifest["candidateHead"]
            or review_payload.get("candidateTree") != manifest["candidateTree"]
            or review_payload.get("conflictSha256") != manifest["conflictSha256"]
            or review_payload.get("resolutionsSha256")
            != manifest["resolutionsSha256"]
        ):
            raise common.IntegrationError("conflict candidate needs bound reviewer PASS")


def remove_worktree(repo: Path, path: Path) -> None:
    """engine-owned clean worktree를 force 없이 제거한다."""

    if path.exists():
        clean_status_hash(path)
        git(repo, "worktree", "remove", str(path))


def optional_ref_oid(repo: Path, full_ref: str) -> Optional[str]:
    """ref가 존재하면 full OID를, 이미 정리됐으면 None을 반환한다."""

    result = git(repo, "rev-parse", "-q", "--verify", full_ref, check=False)
    return result.stdout.strip() if result.returncode == 0 else None


def source_manifest_cleanup_evidence(
    repo: Path,
    run_path: Path,
    manifest: dict[str, Any],
) -> tuple[Optional[Path], dict[str, Any]]:
    """managed source manifest identity/head를 CAS 검증하고 archive evidence를 고정한다."""

    existing_archive = manifest.get("sourceManifestArchive")
    path = Path(manifest["sourceManifestPath"])
    if not path.exists():
        if isinstance(existing_archive, dict):
            return None, existing_archive
        raise common.IntegrationError("source managed manifest disappeared before cleanup")
    source_state = load_json(path)
    if not isinstance(source_state, dict) or set(source_state) != WORKTREE_MANIFEST_KEYS:
        raise common.IntegrationError("source managed manifest schema changed")
    current_sha256 = common.sha256_file(path)
    if current_sha256 != manifest.get("sourceManifestSha256"):
        raise common.IntegrationError("source managed manifest changed before cleanup")
    expected_identity = {
        "repoRoot": str(repo),
        "branch": manifest["source"],
        "path": manifest["sourcePath"],
        "headSha": manifest["sourceHead"],
        "state": "READY",
    }
    if any(source_state.get(key) != value for key, value in expected_identity.items()):
        raise common.IntegrationError("source managed manifest changed before cleanup")
    archive = {
        "path": str(path),
        "sha256": current_sha256,
        "identity": expected_identity,
        "archivedAt": utc_now(),
    }
    if isinstance(existing_archive, dict) and existing_archive != archive:
        stable_existing = dict(existing_archive)
        stable_archive = dict(archive)
        stable_existing.pop("archivedAt", None)
        stable_archive.pop("archivedAt", None)
        if stable_existing != stable_archive:
            raise common.IntegrationError("source manifest archive evidence changed")
        archive = existing_archive
    else:
        manifest["sourceManifestArchive"] = archive
        save_manifest(run_path, manifest)
    return path, archive


def delete_source_manifest(path: Optional[Path], archive: dict[str, Any]) -> None:
    """archive hash와 일치하는 managed source manifest만 삭제하고 directory를 fsync한다."""

    if path is None:
        return
    if common.sha256_file(path) != archive.get("sha256"):
        raise common.IntegrationError("source manifest changed during cleanup")
    path.unlink()
    descriptor = os.open(str(path.parent), os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def selective_worktree_prune(
    repo: Path,
    engine_owned_paths: Sequence[Path],
) -> None:
    """dry-run 결과가 engine-owned path만 가리킬 때만 stale 등록을 prune한다."""

    preview = git(
        repo,
        "worktree",
        "prune",
        "--dry-run",
        "--verbose",
        check=False,
    )
    if preview.returncode != 0:
        raise common.IntegrationError("worktree prune dry-run failed")
    report = "\n".join(
        part.strip()
        for part in (preview.stdout, preview.stderr)
        if part.strip()
    )
    if not report:
        return
    approved = {path.resolve() for path in engine_owned_paths}
    reported_paths: set[Path] = set()
    for line in report.splitlines():
        match = re.fullmatch(r"Removing ([^:]+): .+", line)
        if match is None:
            raise common.IntegrationError(
                f"worktree prune returned an unknown report line: {line}"
            )
        administration_path = (common_directory(repo) / match.group(1)).resolve()
        worktrees_root = (common_directory(repo) / "worktrees").resolve()
        try:
            administration_path.relative_to(worktrees_root)
        except ValueError as error:
            raise common.IntegrationError(
                "worktree prune report escaped the worktree administration root"
            ) from error
        gitdir_path = administration_path / "gitdir"
        if not gitdir_path.is_file():
            raise common.IntegrationError(
                "worktree prune report has no verifiable gitdir metadata"
            )
        registered_gitdir = Path(gitdir_path.read_text(encoding="utf-8").strip())
        registered_path = (
            registered_gitdir.parent
            if registered_gitdir.name == ".git"
            else registered_gitdir
        ).resolve()
        reported_paths.add(registered_path)
    if not reported_paths.issubset(approved):
        unrelated = sorted(str(path) for path in reported_paths - approved)
        raise common.IntegrationError(
            f"worktree prune found unrelated stale registrations: {unrelated}"
        )
    pruned = git(repo, "worktree", "prune", "--verbose", check=False)
    if pruned.returncode != 0:
        raise common.IntegrationError("selective worktree prune failed")


def cleanup_already_merged(
    repo: Path,
    run_path: Path,
    manifest: dict[str, Any],
    target_worktrees: Sequence[dict[str, str]],
) -> None:
    """이미 target에 포함된 managed source의 local resource만 안전하게 정리한다."""

    source_path = Path(manifest["sourcePath"])
    cleanup_path: Optional[Path] = None
    if len(target_worktrees) == 1:
        target_path = Path(target_worktrees[0]["worktree"])
    elif not target_worktrees:
        cleanup_path = run_path / "cleanup-worktree"
        git(
            repo,
            "worktree",
            "add",
            "--detach",
            str(cleanup_path),
            manifest["targetHead"],
        )
        target_path = cleanup_path
    else:
        raise common.IntegrationError("target branch is checked out more than once")
    source_manifest_path, source_archive = source_manifest_cleanup_evidence(
        repo, run_path, manifest
    )
    if rev_parse(repo, manifest["targetRef"]) != manifest["targetHead"]:
        raise common.IntegrationError("target ref moved before already-merged cleanup")
    if rev_parse(repo, manifest["sourceRef"]) != manifest["sourceHead"]:
        raise common.IntegrationError("source ref moved before already-merged cleanup")
    contained = git(
        repo,
        "merge-base",
        "--is-ancestor",
        manifest["sourceHead"],
        manifest["targetHead"],
        check=False,
    )
    if contained.returncode != 0:
        raise common.IntegrationError("source is no longer contained by target")
    if rev_parse(target_path, "HEAD") != manifest["targetHead"]:
        raise common.IntegrationError("checked target moved before already-merged cleanup")
    clean_status_hash(target_path)
    if source_path.exists():
        if rev_parse(source_path, "HEAD") != manifest["sourceHead"]:
            raise common.IntegrationError("source moved before already-merged cleanup")
        remove_worktree(repo, source_path)
    current_source = optional_ref_oid(repo, manifest["sourceRef"])
    if current_source is not None and current_source != manifest["sourceHead"]:
        raise common.IntegrationError("source ref moved before already-merged cleanup")
    if current_source is not None:
        git(target_path, "branch", "-d", manifest["source"])
    if cleanup_path is not None:
        remove_worktree(repo, cleanup_path)
    selective_worktree_prune(
        repo,
        tuple(
            path
            for path in (source_path, cleanup_path)
            if path is not None
        ),
    )
    delete_source_manifest(source_manifest_path, source_archive)
    manifest["cleanup"] = {
        "sourceWorktree": "removed",
        "sourceBranch": "removed-local-only",
        "remoteBranches": "unchanged",
        "completedAt": utc_now(),
    }
    save_manifest(run_path, manifest)


def cleanup_after_promotion(
    repo: Path, run_path: Path, manifest: dict[str, Any]
) -> None:
    """source/candidate local resources만 선택적으로 정리하고 remote refs는 보존한다."""

    source_path = Path(manifest["sourcePath"])
    candidate_path = Path(manifest["candidatePath"])
    source_ref = manifest["sourceRef"]
    candidate_ref = manifest["candidateRef"]
    target_ref = manifest["targetRef"]
    if rev_parse(repo, target_ref) != manifest["candidateHead"]:
        raise common.IntegrationError("cleanup target is not the promoted candidate")
    contained = git(
        repo,
        "merge-base",
        "--is-ancestor",
        manifest["sourceHead"],
        manifest["candidateHead"],
        check=False,
    )
    if contained.returncode != 0:
        raise common.IntegrationError("source is not contained in promoted candidate")
    source_manifest_path, source_archive = source_manifest_cleanup_evidence(
        repo, run_path, manifest
    )
    current_source = optional_ref_oid(repo, source_ref)
    if current_source is not None and current_source != manifest["sourceHead"]:
        raise common.IntegrationError("source ref moved before cleanup")
    if source_path.exists():
        if rev_parse(source_path, "HEAD") != manifest["sourceHead"]:
            raise common.IntegrationError("source worktree HEAD moved before cleanup")
        remove_worktree(repo, source_path)
    if current_source is not None:
        if not candidate_path.is_dir():
            raise common.IntegrationError("candidate worktree is required for safe branch delete")
        git(candidate_path, "branch", "-d", manifest["source"])
    current_candidate = optional_ref_oid(repo, candidate_ref)
    if current_candidate is not None and current_candidate != manifest["candidateHead"]:
        raise common.IntegrationError("candidate ref moved before cleanup")
    if candidate_path.exists():
        if rev_parse(candidate_path, "HEAD") != manifest["candidateHead"]:
            raise common.IntegrationError("candidate worktree HEAD moved before cleanup")
        remove_worktree(repo, candidate_path)
    if current_candidate is not None:
        git(
            repo,
            "update-ref",
            "-d",
            candidate_ref,
            manifest["candidateHead"],
        )
    selective_worktree_prune(repo, (source_path, candidate_path))
    delete_source_manifest(source_manifest_path, source_archive)
    manifest["state"] = "CLEANED"
    manifest["cleanup"] = {
        "sourceWorktree": "removed",
        "sourceBranch": "removed-local-only",
        "candidateWorktree": "removed",
        "candidateBranch": "removed-cas",
        "remoteBranches": "unchanged",
        "completedAt": utc_now(),
    }
    save_manifest(run_path, manifest)


def promote(args: argparse.Namespace) -> dict[str, Any]:
    """검증된 candidate만 checked target ff-only 또는 unchecked update-ref CAS로 승격한다."""

    repo = resolve_repository(args.repo)
    with common.persistent_lock(run_lock_path(repo, args.run_id)):
        run_path, manifest = load_manifest(repo, args.run_id)
        target_ref = manifest["targetRef"]
        cleanup_only = manifest.get("state") in {"PROMOTED", "CLEANUP_PARTIAL"}
        with common.persistent_lock(target_lock_path(repo, target_ref)):
            current_target = rev_parse(repo, target_ref)
            if current_target not in {
                manifest.get("targetHead"),
                manifest.get("candidateHead"),
            }:
                manifest["state"] = "STALE"
                save_manifest(run_path, manifest)
                raise common.IntegrationError("targetRef is stale")
            recovered_promotion = current_target == manifest.get("candidateHead")
            if cleanup_only and not recovered_promotion:
                raise common.IntegrationError(
                    "cleanup-only recovery requires target at candidate"
                )
            validate_candidate_gate(
                repo,
                manifest,
                allow_promoted_target=recovered_promotion,
                cleanup_only=cleanup_only,
            )
            target_worktrees = [
                item for item in parse_worktrees(repo) if item.get("branch") == target_ref
            ]
            if len(target_worktrees) > 1:
                raise common.IntegrationError("target branch is checked out more than once")
            if cleanup_only:
                promotion_mode = (
                    manifest.get("promotion", {}).get("mode")
                    or "recovered-cleanup-only"
                )
            elif recovered_promotion:
                if target_worktrees:
                    target_path = Path(target_worktrees[0]["worktree"])
                    clean_status_hash(target_path)
                    if rev_parse(target_path, "HEAD") != manifest["candidateHead"]:
                        raise common.IntegrationError(
                            "checked target recovery requires matching worktree HEAD"
                        )
                promotion_mode = "recovered-existing-candidate"
            elif target_worktrees:
                manifest["state"] = "PROMOTING"
                save_manifest(run_path, manifest)
                target_path = Path(target_worktrees[0]["worktree"])
                clean_status_hash(target_path)
                git(target_path, "merge", "--ff-only", manifest["candidateHead"])
                promotion_mode = "checked-out-ff-only"
            else:
                manifest["state"] = "PROMOTING"
                save_manifest(run_path, manifest)
                git(
                    repo,
                    "update-ref",
                    target_ref,
                    manifest["candidateHead"],
                    manifest["targetHead"],
                )
                promotion_mode = "update-ref-cas"
            if rev_parse(repo, target_ref) != manifest["candidateHead"]:
                raise common.IntegrationError("target promotion did not reach candidate")
            if not cleanup_only:
                manifest["state"] = "PROMOTED"
                manifest["promotion"] = {
                    "mode": promotion_mode,
                    "expectedTarget": manifest["targetHead"],
                    "candidateHead": manifest["candidateHead"],
                    "completedAt": utc_now(),
                }
                save_manifest(run_path, manifest)
        with common.persistent_lock(repository_lock_path(repo)):
            try:
                cleanup_after_promotion(repo, run_path, manifest)
            except common.IntegrationError:
                manifest["state"] = "CLEANUP_PARTIAL"
                save_manifest(run_path, manifest)
                raise
        return manifest


def abort(args: argparse.Namespace) -> dict[str, Any]:
    """target/source를 보존하면서 engine-owned candidate resources만 제거한다."""

    repo = resolve_repository(args.repo)
    with common.persistent_lock(run_lock_path(repo, args.run_id)), common.persistent_lock(
        repository_lock_path(repo)
    ):
        run_path, manifest = load_manifest(repo, args.run_id)
        if manifest.get("state") in {"PROMOTED", "CLEANED", "CLEANUP_PARTIAL"}:
            raise common.IntegrationError("promoted integration cannot be aborted")
        if rev_parse(repo, manifest["targetRef"]) != manifest["targetHead"]:
            raise common.IntegrationError("target changed; abort refuses mutation")
        if rev_parse(repo, manifest["sourceRef"]) != manifest["sourceHead"]:
            raise common.IntegrationError("source changed; abort refuses mutation")
        candidate_path = Path(manifest["candidatePath"])
        if candidate_path.exists():
            merge_head = git(
                candidate_path,
                "rev-parse",
                "-q",
                "--verify",
                "MERGE_HEAD",
                check=False,
            )
            if merge_head.returncode == 0:
                git(candidate_path, "merge", "--abort")
            remove_worktree(repo, candidate_path)
        candidate_ref = manifest["candidateRef"]
        current_candidate = git(
            repo, "rev-parse", "-q", "--verify", candidate_ref, check=False
        )
        if current_candidate.returncode == 0:
            expected = current_candidate.stdout.strip()
            approved = manifest.get("candidateHead") or manifest["targetHead"]
            if expected != approved:
                raise common.IntegrationError("candidate ref moved; abort refuses deletion")
            git(repo, "update-ref", "-d", candidate_ref, approved)
        selective_worktree_prune(repo, (candidate_path,))
        manifest["state"] = "ABORTED"
        manifest["abortedAt"] = utc_now()
        save_manifest(run_path, manifest)
        return manifest


def build_parser() -> MergeArgumentParser:
    """승인된 integration state-machine CLI만 노출하는 parser를 구성한다."""

    parser = MergeArgumentParser(description="Evidence-gated integration engine")
    commands = parser.add_subparsers(dest="command", required=True)

    prepare_parser = commands.add_parser("prepare")
    prepare_parser.add_argument("--repo", required=True)
    prepare_parser.add_argument("--source", required=True)
    prepare_parser.add_argument("--target", required=True)
    prepare_parser.add_argument("--expected-source-head", required=True)
    prepare_parser.add_argument("--expected-target-head", required=True)
    prepare_parser.set_defaults(handler=prepare)

    for command_name, handler in (("status", status), ("finalize", finalize), ("promote", promote), ("abort", abort)):
        command_parser = commands.add_parser(command_name)
        command_parser.add_argument("--repo", required=True)
        command_parser.add_argument("--run-id", required=True)
        command_parser.set_defaults(handler=handler)

    resolve_parser = commands.add_parser("resolve")
    resolve_parser.add_argument("--repo", required=True)
    resolve_parser.add_argument("--run-id", required=True)
    resolve_parser.add_argument("--path", required=True)
    resolve_parser.add_argument(
        "--classification", choices=("mechanical", "semantic"), required=True
    )
    resolve_parser.add_argument("--evidence", required=True)
    resolve_parser.set_defaults(handler=resolve)

    review_parser = commands.add_parser("review")
    review_parser.add_argument("--repo", required=True)
    review_parser.add_argument("--run-id", required=True)
    review_parser.add_argument("--verdict", choices=("PASS", "FAIL"), required=True)
    review_parser.add_argument("--reviewer", required=True)
    review_parser.add_argument("--evidence", required=True)
    review_parser.set_defaults(handler=review)

    verify_parser = commands.add_parser("verify")
    verify_parser.add_argument("--repo", required=True)
    verify_parser.add_argument("--run-id", required=True)
    verify_parser.add_argument("--phase", choices=("source", "candidate"), required=True)
    verify_parser.add_argument("--check", required=True)
    verify_parser.add_argument("command", nargs=argparse.REMAINDER)
    verify_parser.set_defaults(handler=verify)
    return parser


def execute(argv: Optional[Sequence[str]] = None) -> dict[str, Any]:
    """CLI arguments를 파싱해 승인된 단일 state transition을 실행한다."""

    args = build_parser().parse_args(argv)
    return args.handler(args)


def main(argv: Optional[Sequence[str]] = None) -> int:
    """성공 결과는 JSON stdout, 거부 사유는 stderr와 nonzero로 반환한다."""

    try:
        payload = execute(argv)
        print(json.dumps(payload, ensure_ascii=False, sort_keys=True))
        return 0
    except (common.IntegrationError, OSError, ValueError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
