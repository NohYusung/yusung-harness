---
name: code
description: 코드베이스를 탐색·수정하고 테스트 가능한 구현을 만들며, --worktree 요청에서는 configured integration profile로 격리 source worktree를 생성·검증하는 스킬.
---

## 에이전트 호출 경계

- 새 에이전트를 생성하는 `spawn_agent`는 `root만` 호출한다.
- non-root 에이전트는 `spawn_agent`를 `직접 또는 간접`으로 호출하거나 다른 에이전트에게 생성을 요청하지 않는다.
- non-root 에이전트는 root가 이미 생성한 에이전트와 협력할 때 `send_message`, `followup_task`, `wait_agent`를 사용할 수 있다.
- 추가 역할이나 에이전트가 필요하면 필요한 역할, 작업 범위와 기대 증거를 `root에 handoff`한다.

# 매 코딩을 진행학기 전에 Conventions 문서를 참조

<HARD-GATE>
사전 정의된 yusung-harness/docs/conventions 컨벤션 문서를 참조해서 항상 일정한 코드베이스 스타일을 유지한다.
</HARD-GATE>

## root가 호출할 기본 에이전트 목록

| 에이전트명 | 하는일                             |
| ---------- | ---------------------------------- |
| coder      | 코드 검색, 코드 작성, 코드 수정    |
| tester     | 단위별 코드 컴파일, 디버깅, 테스트 |

## Test Driven Development

> tester 에이전트가 테스트를 진행할 수 있게, 테스트 코드를 반드시 작성한다.

## plan 혹은 task와 연계된 코딩 작업의 경우

- 만약 유저가 미리 정리된 plan이나 task에 정의된 작업을 시킬 경우, root가 추가로 doc-curator를 호출하여 yusung-harness-doc mcp에 저장된 문서를 조회하고 해당 plan과 task의 요구사항대로 코딩 작업을 진행하게 한다.

- plan과 task 내부에 체크리스트가 있을 경우, 작업을 진행한 후 체크리스트에 체크를 하여, 진행도를 알게한다.
  - scope는 코딩작업에만 국한된다.
  - 코딩작업 scope를 넘어가는 인프라단 배포, 웹 콘솔 조작 등의 역할은 code 스킬 단계에서 진행하지 않는다.

- task마다 하나씩 작업을 진행하고, 진행 완료시 task의 status를 completed로 수정한다.
  - plan을 통째로 작업하는 경우에는 task1이 completed 된 후에 다음 작업으로 넘어간다.

### Task 완료 처리

<HARD-GATE>

- task별 작업을 완료할 때마다 다음 스크립트를 반드시 실행한다.

```bash
python3 <CODE_SKILL_DIR>/scripts/complete_task.py \
  --project-id <PROJECT_ID> \
  --task-id <TASK_ID>
```

- 스크립트 실패 시 이유를 파악해서 유저에게 질문을 던지고, 어떻게 해야할지 보고를 받는다.

</HARD-GATE>

### root가 추가로 호출 가능한 에이전트

| 에이전트명  | 하는일                                     |
| ----------- | ------------------------------------------ |
| doc-curator | yusung-harness-doc을 통한 문서 조회와 수정 |

# 사용자 argument 입력값 파싱

$ARGUMENTS

## 격리 Worktree workflow (`--worktree [name]`)

- 사용자가 이름을 지정하면 그대로 사용한다.
- `--worktree`만 지정하면 Task 제목과 기능 결과를 기준으로 소문자 영문 kebab-case 이름을 만든다.
- target repository의 `.codex/integration.toml`이 존재하고 `configured = true`인지 먼저 확인한다. false이거나 profile이 빠졌으면 fail-closed하고 project별 verification 설정을 요청한다.
- branch와 worktree path를 직접 만들지 않고 `scripts/worktree.py`만 사용한다.

### 1. 기준 ref와 targeted profile 고정

1. target repository 절대 경로와 base branch를 확인한다.
2. `git -C <TARGET_REPO_ABSOLUTE_PATH> rev-parse <BASE_BRANCH>`로 full SHA를 구해 `expected-base-head`로 고정한다.
3. `.codex/integration.toml`의 `verification.source.*`를 읽고 각 profile을 하나의 `--targeted-check-json`으로 전달한다.
4. Plan/Task 작업이면 Project ID와 Task ID를 전달한다. 일반 코드 작업이면 두 ID를 생략한다.

```bash
python3 <CODE_SKILL_DIR>/scripts/worktree.py create \
  --repo <TARGET_REPO_ABSOLUTE_PATH> \
  --name <WORKTREE_NAME> \
  --base <BASE_BRANCH> \
  --expected-base-head <FULL_BASE_SHA> \
  --agent coder \
  --project-id <PROJECT_ID> \
  --task-id <TASK_ID> \
  --targeted-check-json '{"name":"worktree-engine","cwd":".","argv":["python3",".codex/skills/code/scripts/test_worktree.py"]}' \
  --targeted-check-json '{"name":"integration-engine","cwd":".","argv":["python3",".codex/skills/integration/scripts/test_merge.py"]}'
```

- 성공 결과의 worktree path, `codex/<WORKTREE_NAME>` branch와 manifest의 `baseSha`를 기록한다.
- 모든 코드 탐색·수정·테스트·commit은 반환된 격리 worktree에서 수행한다. primary target worktree를 feature 구현에 사용하지 않는다.

### 2. commit과 ready 전환

1. 격리 worktree에서 구현과 targeted test를 완료한다.
2. `integration --commit <SOURCE_BRANCH>`의 staged-only `commit.py` workflow로 commit한다.
3. commit 이후 source branch의 full HEAD SHA를 고정한다.
4. 다음 명령으로 configured source targeted profile을 argv 그대로 실행하고 evidence를 manifest에 연결한다.

```bash
python3 <CODE_SKILL_DIR>/scripts/worktree.py ready \
  --repo <TARGET_REPO_ABSOLUTE_PATH> \
  --branch <SOURCE_BRANCH> \
  --expected-head <FULL_SOURCE_HEAD_SHA>
```

- `ready` 성공과 `READY` manifest를 확인한 뒤에만 root에게 `integration --merge` handoff를 보낸다.
- handoff에는 repository, source/target branch, source/target full SHA, worktree manifest path, Project/Task ID와 targeted evidence ID를 포함한다.

<HARD-GATE>

- `worktree.py create` 전에 base SHA와 `configured = true`를 확인한다.
- source profile을 임의 명령으로 바꾸거나 `--targeted-check-json`을 누락하지 않는다.
- `worktree.py ready` 실패, dirty worktree, HEAD drift 또는 targeted check 실패를 READY로 보고하지 않는다.
- worktree·branch·state manifest를 raw `git worktree add`, 파일 직접 편집 또는 별도 스크립트로 우회 생성·갱신하지 않는다.

</HARD-GATE>
