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
│ ├── 📄 planner.md
│ ├── 📄 planner.toml
│ ├── 📄 reviewer.md
│ ├── 📄 reviewer.toml
│ ├── 📄 tester.md
│ ├── 📄 tester.toml
├── 📄 config.toml
└── 📂 skills/
│ └── 📂 design/
│ └── 📂 research/
│ ├── 📄 SKILL.md
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

- 현재 작업을 평가하고, 독립적으로 병렬 처리 가능한 조사/검증/코딩/문서/리뷰 항목등이 있으면 spawn_agent tool을 병렬 호출 한다.

```rs
functions.collaboration.spawn_agent
```

- subagent들은 서로간 send_message tool과 followup_task tool을 이용해 메시지를 주고 받으며, 겹치는 작업 영역을 조율한다.

```rs
functions.collaboration.send_message
functions.collaboration.followup_task
functions.collaboration.wait_agent
```

- 이 판단을 매 phase마다 반복한다.
