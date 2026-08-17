---
name: curate
description: mcp에 project를 등록하기 위한 스킬
---

## 에이전트 호출 경계

- 새 에이전트를 생성하는 `spawn_agent`는 `root만` 호출한다.
- non-root 에이전트는 `spawn_agent`를 `직접 또는 간접`으로 호출하거나 다른 에이전트에게 생성을 요청하지 않는다.
- non-root 에이전트는 root가 이미 생성한 에이전트와 협력할 때 `send_message`, `followup_task`, `wait_agent`를 사용할 수 있다.
- 추가 역할이나 에이전트가 필요하면 필요한 역할, 작업 범위와 기대 증거를 `root에 handoff`한다.

이 스킬은 특정 레포를 yusung-harness-doc mcp 서버에 등록시키기 위한 스킬이다.

## root가 호출할 에이전트 목록

| 에이전트명  | 하는일                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------- |
| coder       | 코드 베이스 검색, 도메인 분석, 라이프사이클 분석, DB 구조, 기술 스택, api 등등 프로젝트 구조 분석 |
| doc-curator | mcp 서버에 요청보내서 project를 등록한다.                                                         |

## 워크플로우

> - coder는 project 등록 목표로 지정된 레포의 파일을 분석하고, 레포의 구성을 파악한다.
> - doc-curator는 coder로 부터 내용을 받아, yusung-harness-doc mcp에 project 문서를 생성한다.

### 작성 후 doc-curator에게 handoff하여, yusung-harness-doc mcp 에 문서 기록
