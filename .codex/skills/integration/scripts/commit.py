"""타겟 Git 저장소를 정해진 커밋 메시지 템플릿으로 커밋한다.

AGENT 의도:
- 타겟 저장소에서 이미 staged 된 변경만 커밋한다.
- 커밋 제목과 변경 요약을 고정된 한국어 템플릿으로 구성한다.
- 저장소 상태가 호출자가 기대한 상태와 다르면 커밋하지 않는다.

커밋 메시지 템플릿::

    <type>: <한국어 title>

    변경 요약:
    - <summary>
"""

import argparse
import os
import re
import subprocess
import sys
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Sequence, Tuple


ALLOWED_COMMIT_TYPES = frozenset(
    {
        "build",
        "chore",
        "ci",
        "del",
        "docs",
        "feat",
        "fix",
        "perf",
        "refactor",
        "revert",
        "style",
        "test",
    }
)
HANGUL_PATTERN = re.compile(r"[\u1100-\u11ff\u3130-\u318f\uac00-\ud7a3]")
OBJECT_ID_PATTERN = re.compile(r"[0-9a-fA-F]{7,64}")
IN_PROGRESS_MARKERS = (
    ("MERGE_HEAD", "merge"),
    ("CHERRY_PICK_HEAD", "cherry-pick"),
    ("REVERT_HEAD", "revert"),
    ("BISECT_LOG", "bisect"),
    ("rebase-merge", "rebase"),
    ("rebase-apply", "rebase"),
)


class CommitError(Exception):
    """검증 또는 Git 커밋 실패를 일관된 형식으로 전달한다."""


class CommitArgumentParser(argparse.ArgumentParser):
    """argparse 오류를 프로그램의 공통 오류 처리 흐름으로 변환한다."""

    def error(self, message: str) -> None:
        """CLI 파싱 오류를 ``CommitError``로 변환한다."""

        raise CommitError(f"잘못된 인자: {message}")


@dataclass(frozen=True)
class CommitRequest:
    """검증에 필요한 CLI 입력을 표현한다."""

    repo: str
    expected_branch: str
    expected_head: str
    commit_type: str
    title: str
    summaries: Tuple[str, ...]


def parse_arguments(argv: Optional[Sequence[str]] = None) -> CommitRequest:
    """CLI 인자를 파싱해 커밋 요청으로 변환한다."""

    parser = CommitArgumentParser(
        description="이미 staged 된 변경을 고정된 한국어 템플릿으로 커밋합니다."
    )
    parser.add_argument("--repo", required=True, help="타겟 Git 저장소 루트 경로")
    parser.add_argument(
        "--expected-branch",
        required=True,
        help="커밋 직전 반드시 일치해야 하는 브랜치 이름",
    )
    parser.add_argument(
        "--expected-head",
        required=True,
        help="커밋 직전 반드시 일치해야 하는 HEAD commit SHA",
    )
    parser.add_argument(
        "--type",
        dest="commit_type",
        required=True,
        help="커밋 타입(feat, fix, docs 등)",
    )
    parser.add_argument(
        "--title",
        required=True,
        help="한글을 포함하는 단일 행 커밋 제목",
    )
    parser.add_argument(
        "--summary",
        dest="summaries",
        action="append",
        required=True,
        help="단일 행 변경 요약(여러 번 지정 가능)",
    )
    arguments = parser.parse_args(argv)

    return CommitRequest(
        repo=arguments.repo,
        expected_branch=arguments.expected_branch,
        expected_head=arguments.expected_head,
        commit_type=arguments.commit_type,
        title=arguments.title,
        summaries=tuple(arguments.summaries),
    )


def validate_single_line(value: str, field_name: str) -> str:
    """필수 텍스트가 공백이나 제어 문자를 포함하지 않는 단일 행인지 검증한다."""

    normalized = value.strip()
    if not normalized:
        raise CommitError(f"{field_name}은(는) 비어 있을 수 없습니다.")
    if normalized != value:
        raise CommitError(f"{field_name}의 앞뒤 공백은 허용되지 않습니다.")
    if value.splitlines() != [value]:
        raise CommitError(f"{field_name}에는 줄 구분자를 사용할 수 없습니다.")
    if any(
        unicodedata.category(character) in {"Cc", "Zl", "Zp"}
        for character in value
    ):
        raise CommitError(f"{field_name}에는 줄바꿈이나 제어 문자를 사용할 수 없습니다.")
    return value


def validate_request(request: CommitRequest) -> CommitRequest:
    """커밋 메시지와 상태 가드에 사용할 사용자 입력을 검증한다."""

    repo = validate_single_line(request.repo, "repo")
    if not Path(repo).is_absolute():
        raise CommitError("repo는 절대 경로여야 합니다.")

    expected_branch = validate_single_line(
        request.expected_branch,
        "expected-branch",
    )
    expected_head = validate_single_line(request.expected_head, "expected-head")
    if OBJECT_ID_PATTERN.fullmatch(expected_head) is None:
        raise CommitError("expected-head는 7~64자의 16진수 commit SHA여야 합니다.")

    commit_type = validate_single_line(request.commit_type, "type")
    if commit_type not in ALLOWED_COMMIT_TYPES:
        allowed_types = ", ".join(sorted(ALLOWED_COMMIT_TYPES))
        raise CommitError(f"지원하지 않는 type입니다. 허용값: {allowed_types}")

    title = validate_single_line(request.title, "title")
    if HANGUL_PATTERN.search(title) is None:
        raise CommitError("title에는 한글이 한 글자 이상 포함되어야 합니다.")

    if not request.summaries:
        raise CommitError("summary를 한 개 이상 입력해야 합니다.")
    validated_summaries = []
    for index, summary in enumerate(request.summaries, start=1):
        validated_summary = validate_single_line(summary, f"summary[{index}]")
        if HANGUL_PATTERN.search(validated_summary) is None:
            raise CommitError(
                f"summary[{index}]에는 한글이 한 글자 이상 포함되어야 합니다."
            )
        validated_summaries.append(validated_summary)
    summaries = tuple(validated_summaries)

    return CommitRequest(
        repo=repo,
        expected_branch=expected_branch,
        expected_head=expected_head.lower(),
        commit_type=commit_type,
        title=title,
        summaries=summaries,
    )


def format_process_failure(result: subprocess.CompletedProcess) -> str:
    """Git의 stderr 또는 stdout을 한 줄짜리 오류 상세로 정리한다."""

    output = result.stderr.strip() or result.stdout.strip()
    if not output:
        return f"종료 코드 {result.returncode}"
    return " | ".join(line.strip() for line in output.splitlines() if line.strip())


def sanitized_git_environment() -> dict:
    """타겟 저장소를 우회할 수 있는 Git 환경변수를 제거한다."""

    environment = os.environ.copy()
    for variable in tuple(environment):
        if variable.startswith("GIT_"):
            environment.pop(variable, None)
    return environment


def run_git(
    repo: Path,
    arguments: Sequence[str],
    *,
    input_text: Optional[str] = None,
    check: bool = True,
) -> subprocess.CompletedProcess:
    """검증된 저장소를 작업 디렉터리로 사용해 Git을 shell 없이 실행한다."""

    command = ["git", *arguments]
    try:
        result = subprocess.run(
            command,
            cwd=repo,
            env=sanitized_git_environment(),
            input=input_text,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
    except FileNotFoundError as error:
        raise CommitError("git 실행 파일을 찾을 수 없습니다.") from error
    except OSError as error:
        raise CommitError(f"git 실행에 실패했습니다: {error}") from error

    if check and result.returncode != 0:
        detail = format_process_failure(result)
        raise CommitError(f"git 명령이 실패했습니다: {detail}")
    return result


def resolve_repository(repo_value: str) -> Path:
    """입력 경로가 일반 Git worktree의 루트인지 검증하고 절대 경로로 반환한다."""

    try:
        repo = Path(repo_value).expanduser().resolve(strict=True)
    except OSError as error:
        raise CommitError(f"repo 경로를 확인할 수 없습니다: {error}") from error
    if not repo.is_dir():
        raise CommitError("repo는 디렉터리여야 합니다.")

    inside_result = run_git(repo, ["rev-parse", "--is-inside-work-tree"])
    if inside_result.stdout.strip() != "true":
        raise CommitError("repo는 Git worktree가 아닙니다.")

    root_result = run_git(repo, ["rev-parse", "--show-toplevel"])
    try:
        actual_root = Path(root_result.stdout.strip()).resolve(strict=True)
    except OSError as error:
        raise CommitError(f"Git 저장소 루트를 확인할 수 없습니다: {error}") from error
    if actual_root != repo:
        raise CommitError(
            f"repo는 저장소 루트여야 합니다. 실제 루트: {actual_root}"
        )
    return repo


def validate_no_in_progress_operation(repo: Path) -> None:
    """일반 커밋과 섞이면 안 되는 진행 중 Git 작업을 거부한다."""

    for marker, operation in IN_PROGRESS_MARKERS:
        path_result = run_git(repo, ["rev-parse", "--git-path", marker])
        marker_path = Path(path_result.stdout.strip())
        if not marker_path.is_absolute():
            marker_path = repo / marker_path
        if marker_path.exists():
            raise CommitError(
                f"진행 중인 {operation} 작업이 있어 일반 커밋을 수행할 수 없습니다."
            )


def validate_repository_state(repo: Path, request: CommitRequest) -> str:
    """브랜치, HEAD, staged 변경이 호출자의 기대와 일치하는지 검증한다."""

    branch_result = run_git(
        repo,
        ["symbolic-ref", "--quiet", "--short", "HEAD"],
        check=False,
    )
    if branch_result.returncode != 0:
        detail = format_process_failure(branch_result)
        raise CommitError(f"현재 브랜치를 확인할 수 없습니다: {detail}")
    current_branch = branch_result.stdout.strip()
    if current_branch != request.expected_branch:
        raise CommitError(
            "브랜치가 변경되었습니다: "
            f"expected={request.expected_branch}, actual={current_branch}"
        )

    expected_result = run_git(
        repo,
        ["rev-parse", "--verify", f"{request.expected_head}^{{commit}}"],
        check=False,
    )
    if expected_result.returncode != 0:
        raise CommitError(
            "expected-head가 저장소의 유효하고 명확한 commit SHA가 아닙니다."
        )
    resolved_expected_head = expected_result.stdout.strip().lower()

    head_result = run_git(repo, ["rev-parse", "--verify", "HEAD^{commit}"])
    current_head = head_result.stdout.strip().lower()
    if current_head != resolved_expected_head:
        raise CommitError(
            "HEAD가 변경되었습니다: "
            f"expected={resolved_expected_head}, actual={current_head}"
        )

    validate_no_in_progress_operation(repo)

    staged_result = run_git(
        repo,
        ["diff", "--cached", "--quiet", "--exit-code", "--"],
        check=False,
    )
    if staged_result.returncode == 0:
        raise CommitError("커밋할 staged 변경이 없습니다.")
    if staged_result.returncode != 1:
        detail = format_process_failure(staged_result)
        raise CommitError(f"staged 변경을 확인할 수 없습니다: {detail}")
    return current_head


def build_commit_message(request: CommitRequest) -> str:
    """검증된 입력을 고정된 커밋 메시지 템플릿으로 구성한다."""

    summary_lines = "\n".join(f"- {summary}" for summary in request.summaries)
    return (
        f"{request.commit_type}: {request.title}\n\n"
        f"변경 요약:\n{summary_lines}\n"
    )


def commit_staged_changes(repo: Path, message: str, previous_head: str) -> str:
    """staged 변경을 커밋하고 최종 메시지까지 검증해 새 SHA를 반환한다."""

    commit_result = run_git(
        repo,
        ["commit", "-F", "-"],
        input_text=message,
        check=False,
    )
    if commit_result.returncode != 0:
        detail = format_process_failure(commit_result)
        raise CommitError(f"커밋에 실패했습니다: {detail}")

    head_result = run_git(repo, ["rev-parse", "--verify", "HEAD^{commit}"])
    commit_sha = head_result.stdout.strip().lower()
    if commit_sha == previous_head:
        raise CommitError("git commit은 성공했지만 HEAD가 변경되지 않았습니다.")

    message_result = run_git(repo, ["show", "-s", "--format=%B", commit_sha])
    actual_message = message_result.stdout.rstrip("\n")
    expected_message = message.rstrip("\n")
    if actual_message != expected_message:
        raise CommitError(
            f"commit {commit_sha}은 생성됐지만 메시지가 예상 형식과 다릅니다."
        )
    return commit_sha


def execute(request: CommitRequest) -> str:
    """요청과 저장소 상태를 검증한 뒤 staged 변경을 커밋한다."""

    validated_request = validate_request(request)
    repo = resolve_repository(validated_request.repo)
    previous_head = validate_repository_state(repo, validated_request)
    message = build_commit_message(validated_request)
    return commit_staged_changes(repo, message, previous_head)


def main(argv: Optional[Sequence[str]] = None) -> int:
    """CLI를 실행하고 성공 시 commit SHA, 실패 시 일관된 오류를 출력한다."""

    try:
        commit_sha = execute(parse_arguments(argv))
    except CommitError as error:
        print(f"오류: {error}", file=sys.stderr)
        return 1

    print(commit_sha)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
