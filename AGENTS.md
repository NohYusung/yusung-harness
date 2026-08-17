# yusung-harness

yusung-harness는 기획/개발/리뷰/배포 전반의 워크플로우를 담당하는 하네스이다.

## 구조(codex전용)

```markdown
. 📂 .codex
└── 📂 agents/
│ └── 📂 architect/
│ ├── 📄 architect.md
│ ├── 📄 architect.toml
│ └── 📂 coder/
│ ├── 📄 coder.md
│ ├── 📄 coder.toml
│ └── 📂 designer/
│ ├── 📄 designer.md
│ ├── 📄 designer.toml
│ └── 📂 doc-curator/
│ ├── 📄 doc-curator.md
│ ├── 📄 doc-curator.toml
│ └── 📂 planner/
│ ├── 📄 planner.md
│ ├── 📄 planner.toml
│ └── 📂 researcher/
│ ├── 📄 researcher.md
│ ├── 📄 researcher.toml
│ └── 📂 reviewer/
│ ├── 📄 reviewer.md
│ ├── 📄 reviewer.toml
│ └── 📂 tester/
│ ├── 📄 tester.md
│ ├── 📄 tester.toml
├── 📄 config.toml
└── 📂 hooks/
└── 📂 rules/
└── 📂 skills/
│ └── 📂 asset/
│ ├── 📄 SKILL.md
│ └── 📂 assets/
│ └── 📂 references/
│ ├── 📄 asset-example1.html
│ ├── 📄 asset-example2.html
│ ├── 📄 asset-example3.html
│ └── 📂 scripts/
│ └── 📂 code/
│ ├── 📄 SKILL.md
│ └── 📂 assets/
│ └── 📂 references/
│ └── 📂 scripts/
│ └── 📂 curate/
│ ├── 📄 SKILL.md
│ └── 📂 assets/
│ └── 📂 references/
│ └── 📂 scripts/
│ └── 📂 integration/
│ ├── 📄 SKILL.md
│ └── 📂 assets/
│ └── 📂 references/
│ └── 📂 scripts/
│ └── 📂 plan/
│ ├── 📄 SKILL.md
│ └── 📂 assets/
│ └── 📂 references/
│ └── 📂 scripts/
│ └── 📂 research/
│ ├── 📄 SKILL.md
│ └── 📂 assets/
│ └── 📂 references/
│ └── 📂 scripts/
│ └── 📂 test/
│ ├── 📄 SKILL.md
│ └── 📂 assets/
│ └── 📂 references/
│ └── 📂 scripts/
│ └── 📂 wireframe/
│ ├── 📄 SKILL.md
│ └── 📂 assets/
│ └── 📂 references/
│ └── 📂 scripts/
```

## 구조(범용 에이전트 전용 ex.hermes, openclaw)

```
. 📂 .agents
└── 📂 agents/
│  ├── 📄 architect.md
│  ├── 📄 coder.md
│  ├── 📄 designer.md
│  ├── 📄 doc-curator.md
│  ├── 📄 planner.md
│  ├── 📄 reviewer.md
│  ├── 📄 tester.md
└── 📂 skills/
│  └── 📂 research/
```

### 매 phase 반복 작업

- root는 현재 작업을 평가하고, 독립적으로 스킬 명시 내용에 따라 호출해야 하는 에이전트가 있으면 `spawn_agent` tool을 이용해 에이전트를 병렬 호출한다.
  - 호출할 에이전트는 다음과 같다.
    > | 에이전트명  | 하는일                                |
    > | ----------- | ------------------------------------- |
    > | architect   | 시스템 아키텍쳐 설계                  |
    > | coder       | 코드 검색, 코드 작성, 코드 수정       |
    > | designer    | 디자인 생성, 디자인 수정, 디자인 검증 |
    > | doc-curator | 문서 작성, 문서 수정, 문서 보관       |
    > | planner     | 계획 및 기획 수립, 수정, 검증         |
    > | researcher  | 웹 검색, 레퍼런스 체크 등             |
    > | reviewer    | 프로젝트 전체에 대한 통합적인 평가    |
    > | tester      | 테스트 작성, 테스트 수정, 테스트 검증 |

```rs
functions.collaboration.spawn_agent
```

#### 역할별 singleton lifecycle

- 하나의 root task 안에서는 역할별로 하나의 에이전트만 유지한다.
- root는 매 작업 배정 전에 `list_agents`로 현재 agent tree를 확인한다.
- 동일 역할의 에이전트가 `completed`, `idle`, `running` 중 어느 상태로든 존재하면 `followup_task`로 재사용한다.
- `send_message`는 보조 정보 전달에만 사용하고, 기존 에이전트에 새 작업을 배정할 때는 `followup_task`를 사용한다.
- 동일 역할의 중복 `spawn_agent` 호출은 금지한다.
- 역할명에 suffix나 작업 설명을 붙인 `task_name`은 사용하지 않는다.
- 재사용에 실패해도 중복 에이전트를 생성하지 않고 실패 원인을 보고한다.
- root는 동일 역할의 에이전트가 없을 때만 `spawn_agent`를 호출하며 아래 canonical mapping을 사용한다.

| `agent_type` / 역할명 | `task_name` |
| --------------------- | ----------- |
| `architect` | `architect` |
| `coder` | `coder` |
| `designer` | `designer` |
| `doc-curator` | `doc_curator` |
| `planner` | `planner` |
| `researcher` | `researcher` |
| `reviewer` | `reviewer` |
| `tester` | `tester` |

- `doc-curator`만 `task_name`의 허용 문자 규칙 때문에 `doc_curator`를 사용한다.

```text
역할 작업 배정
      │
      ▼
 list_agents
      │
      ├─ 동일 역할 있음 (completed / idle / running)
      │        └─ followup_task
      │                 └─ 실패 시 보고하고 중단
      │
      └─ 동일 역할 없음
               └─ spawn_agent(agent_type=역할명, task_name=canonical 값)
```

## 에이전트 호출 경계

- 새 에이전트를 생성하는 `spawn_agent`는 `root만` 호출한다.
- non-root 에이전트는 `spawn_agent`를 `직접 또는 간접`으로 호출하거나 다른 에이전트에게 생성을 요청하지 않는다.
- non-root 에이전트는 root가 이미 생성한 에이전트와 협력할 때 `send_message`, `followup_task`, `wait_agent`를 사용할 수 있다.
- 추가 역할이나 에이전트가 필요하면 필요한 역할, 작업 범위와 기대 증거를 `root에 handoff`한다.

```rs
functions.collaboration.send_message
functions.collaboration.followup_task
functions.collaboration.wait_agent
```

- root는 이 판단을 매 phase마다 반복한다.

## 에이전트는 직접 이 레포 루트와 그 내부에 재귀적으로 존재하는 md파일들을 유저의 요청없이 직접 수정하지 않는다.

> ex : '.codex/agents/planner.md', 'CLAUDE.md', ...
