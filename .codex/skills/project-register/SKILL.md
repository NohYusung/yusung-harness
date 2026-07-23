---
name: project-register
description: mcp에 project를 등록하기 위한 스킬
---

이 스킬은 특정 레포를 yusung-harness-doc mcp 서버에 등록시키기 위한 스킬이다.

## 호출할 에이전트 목록

| 에이전트명  | 하는일                                    |
| ----------- | ----------------------------------------- |
| coder       | 코드 베이스 검색, 코드 작성, 코드 수정    |
| doc-curator | mcp 서버에 요청보내서 project를 등록한다. |

## 워크플로우

> - coder는 project 등록 목표로 지정된 레포의 파일을 분석한다.
> - 분석 시에 매우 상세하게 도메인별로 기능, 워크플로우, 제약사항, 라이프사이클, 운영정책 등등을 내용을 정리해서, doc-curator 에게 전달한다.
> - doc-curator는 coder로 부터 내용을 받아, yusung-harness-doc mcp에 문서를 생성한다.
>   - project를 등록하고, 도메인 별로 문서 생성
>   - 도메인이 존재하지않으면, 억지로 경계를 나누어 도메인 문서를 별도 작성하지 않아도 괜찮다.
>     - 예시:
>
>     ```markdown
>     . 📂 portfolio
>     └── 📂 back/
>     └── 📂 front/
>     ```
>
>     - 이렇게 비어있는 폴더의 경우 back과 front를 domain 문서로 등록하는건 잘못된 것

### 도메인이란?

- DDD의 창시자 에릭 에반스에 따르면 도메인이란
  > - "A sphere of knowledge, influence, or activity."
  > - "사용자가 해결하려는 현실 세계의 문제와 그 문제를 해결하기 위한 규칙, 개념, 행위를 포함하는 지식의 영역이다."
