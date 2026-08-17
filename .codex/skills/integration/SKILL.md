---
name: integration
description: 작성한 코드를 머지하고, 병합하는 스킬
argument-hint: "--commit <branch-name> | --merge --source <feature-branch> --target <target-branch>"
---

## 에이전트 호출 경계

- 새 에이전트를 생성하는 `spawn_agent`는 `root만` 호출한다.
- non-root 에이전트는 `spawn_agent`를 `직접 또는 간접`으로 호출하거나 다른 에이전트에게 생성을 요청하지 않는다.
- non-root 에이전트는 root가 이미 생성한 에이전트와 협력할 때 `send_message`, `followup_task`, `wait_agent`를 사용할 수 있다.
- 추가 역할이나 에이전트가 필요하면 필요한 역할, 작업 범위와 기대 증거를 `root에 handoff`한다.

사용자가 스킬을 호출할 때 옵션 및 브랜치 인자를 파싱해 Git 관련 통합 작업을 수행

# root가 호출할 에이전트 목록

| 에이전트명 | 하는일              |
| ---------- | ------------------- |
| coder      | 코드 검색, 조회     |
| architect  | 커밋,머지 작업 진행 |

# 사용자 입력 값 파싱

$ARGUMENTS

1. **_`--commit` 옵션_**
   - 미커밋 변경사항이 있는 지 확인하고 `git add .` 및 `git commit` 작업 수행.
   - 커밋 메시지는 변경이력 고려해서 요약 정리 후 커밋
   - 커밋 메시지는 ***한국어***로 작성한다.

2. **_`--merge` 옵션_**
   - <source-branch>와 <target-branch>의 미커밋 내역이 있는지 확인한다.
   - 미커밋 내역이 존재할 경우, <HARD-GATE> `${미커밋 브랜치} 에 commit 작업이 필요합니다.` 메시지와 함께, 메인 에이전트 턴을 종료하고 더 작업을 진행하지 않는다. </HARD-GATE>
   - 미커밋 내역이 양 쪽 브랜치 모두 없을 경우, <source-branch>를 <target-branch>에 merge 한다.
