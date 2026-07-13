# yusung-harness

yusung-harness는 기획/개발/리뷰/배포 전반의 워크플로우를 담당하는 하네스이다.

## 구조(codex전용)

```markdown
. 📂 .codex
└── 📂 agents/
│ ├── 📄 architect.md
│ ├── 📄 architect.toml
│ ├── 📄 coder.md
│ ├── 📄 coder.toml
│ ├── 📄 designer.md
│ ├── 📄 designer.toml
│ ├── 📄 doc-curator.md
│ ├── 📄 doc-curator.toml
│ ├── 📄 drafter.md
│ ├── 📄 drafter.toml
│ ├── 📄 planner.md
│ ├── 📄 planner.toml
│ ├── 📄 reviewer.md
│ ├── 📄 reviewer.toml
│ ├── 📄 tester.md
│ ├── 📄 tester.toml
├── 📄 config.toml
└── 📂 hooks/
└── 📂 rules/
└── 📂 skills/
│ └── 📂 code/
│ ├── 📄 SKILL.md
│ └── 📂 assets/
│ └── 📂 references/
│ └── 📂 scripts/
│ └── 📂 design/
│ ├── 📄 SKILL.md
│ └── 📂 assets/
│ └── 📂 references/
│ └── 📂 scripts/
│ └── 📂 document/
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
│  └── 📂 design/
│  └── 📂 research/
```

### 매 phase 반복 작업

- 현재 작업을 평가하고, 독립적으로 병렬 처리 가능한 조사/검증/코딩/문서/리뷰 항목등이 있으면 spawn_agent tool을 이용해 에이전트를 병렬 호출 한다.
  - 호출할 에이전트는 다음과 같다.
    > | 에이전트명  | 하는일                                |
    > | ----------- | ------------------------------------- |
    > | architect   | 시스템 아키텍쳐 설계                  |
    > | coder       | 코드 검색, 코드 작성, 코드 수정       |
    > | designer    | 디자인 생성, 디자인 수정, 디자인 검증 |
    > | doc-curator | 문서 작성, 문서 수정, 문서 보관       |
    > | planner     | 계획 수립, 계획 수정, 계획 검증       |
    > | reviewer    | 코드 검토, 코드 수정, 코드 검증       |
    > | tester      | 테스트 작성, 테스트 수정, 테스트 검증 |

```rs
functions.collaboration.spawn_agent
```

- 만약 이미 호출된 에이전트가 있으면 추가로 호출하지 않고, 그 에이전트를 재사용한다.

- subagent들은 서로간 send_message tool과 followup_task tool을 이용해 메시지를 주고 받으며, 겹치는 작업 영역을 조율한다.

```rs
functions.collaboration.send_message
functions.collaboration.followup_task
functions.collaboration.wait_agent
```

- 이 판단을 매 phase마다 반복한다.
