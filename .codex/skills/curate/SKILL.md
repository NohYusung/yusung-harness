---
name: curate
description: mcp에 project를 등록하기 위한 스킬
---

이 스킬은 특정 레포를 yusung-harness-doc mcp 서버에 등록시키기 위한 스킬이다.

## 호출할 에이전트 목록

| 에이전트명  | 하는일                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------- |
| coder       | 코드 베이스 검색, 도메인 분석, 라이프사이클 분석, DB 구조, 기술 스택, api 등등 프로젝트 구조 분석 |
| doc-curator | mcp 서버에 요청보내서 project를 등록한다.                                                         |

## 워크플로우

> - coder는 project 등록 목표로 지정된 레포의 파일을 분석하고, 레포의 구성을 파악한다.
> - doc-curator는 coder로 부터 내용을 받아, yusung-harness-doc mcp에 project 문서를 생성한다.

### 작성 후 doc-curator에게 handoff하여, yusung-harness-doc mcp 에 문서 기록
