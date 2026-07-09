### 주의 사항

- 이 프로젝트는 에이전트 팀을 염두에 두고 작성된 프로젝트입니다. 따라서 사용하는 에이전트의 설정에서 관련 기능을 켜줘야 합니다.

- **_codex_**

```toml
[features.multi_agent_v2]
enabled = true
max_concurrent_threads_per_session = 7
```

- 현재 노출된 codex의 agent tool들 목록은 다음과 같습니다.
  ```rs
  functions.collaboration.spawn_agent
  functions.collaboration.send_message
  functions.collaboration.followup_task
  functions.collaboration.wait_agent
  functions.collaboration.interrupt_agent
  functions.collaboration.list_agents
  ```

### 필수 프로그램

```
- open-design app 및 mcp 설치
```
