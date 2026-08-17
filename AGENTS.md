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
│ └── 📂 design/
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
│  └── 📂 design/
│  └── 📂 research/
```

### 매 phase 반복 작업

- 현재 작업을 평가하고, 독립적으로 스킬 명시 내용에 따라 호출해야하는 에이전트가 있으면 spawn_agent tool을 이용해 에이전트를 병렬 호출 한다.
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

- 만약 이미 호출된 에이전트가 있으면 추가로 호출하지 않고, 그 에이전트를 재사용한다.

- subagent들은 서로간 send_message tool과 followup_task tool을 이용해 메시지를 주고 받으며, 겹치는 작업 영역을 조율하거나 협력을 진행한다.

```rs
functions.collaboration.send_message
functions.collaboration.followup_task
functions.collaboration.wait_agent
```

- 이 판단을 매 phase마다 반복한다.

## 에이전트는 직접 이 레포 루트와 그 내부에 재귀적으로 존재하는 md파일들을 유저의 요청없이 직접 수정하지 않는다.

> ex : '.codex/agents/planner.md', 'CLAUDE.md', ...
