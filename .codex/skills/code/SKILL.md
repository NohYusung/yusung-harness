---
name: code
description: 코드베이스를 탐색·수정하고 테스트 가능한 구현을 만들며, integration이 반환한 격리 source worktree에서 기능을 구현하는 스킬.
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

## Integration worktree 소비자 계약

- `--worktree [name]` 요청의 생성·검증 책임과 CLI 실행은 integration 스킬에 있다.
- coder는 integration이 `ACTIVE`로 반환한 다음 handoff를 입력으로 받는다.
  - target repository 절대 경로
  - `<TARGET_REPO_ABSOLUTE_PATH>/.worktree/<WORKTREE_NAME>` 격리 경로
  - `codex/<WORKTREE_NAME>` source branch와 고정된 base full SHA
  - `.yusung-harness/state/worktrees/<WORKTREE_NAME>.json` manifest 경로
  - 선택된 source verification profile, Project ID와 Task ID
- coder는 handoff의 경로·branch·base SHA·manifest 상태가 서로 일치하는지 확인한 뒤 모든 코드 탐색, 수정과 테스트를 격리 worktree에서만 수행한다.
- 구현이 끝나면 integration의 `--commit <SOURCE_BRANCH>` 계약으로 커밋하고, 새 source full HEAD SHA와 테스트 결과를 integration에 반환한다.
- READY 전환과 targeted evidence 기록은 integration이 수행한다. coder는 READY를 직접 만들거나 성공으로 간주하지 않는다.

```text
integration create
  └─ ACTIVE: <repo>/.worktree/<name>
       └─ coder 구현·테스트
            └─ integration commit + ready
                 └─ READY manifest
```

<HARD-GATE>

- integration이 반환한 `ACTIVE` manifest 없이 primary target worktree에서 feature 구현을 시작하지 않는다.
- worktree·branch·state manifest를 raw `git worktree add`, 파일 직접 편집, code 스킬의 별도 스크립트 또는 다른 우회 경로로 생성·갱신하지 않는다.
- dirty worktree, HEAD drift, targeted check 실패 또는 integration의 `ready` 실패를 READY로 보고하지 않는다.

</HARD-GATE>
