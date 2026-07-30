---
name: architecturePlan
description: 아키텍쳐 plan 문서를 작성하는 스킬
---

아키텍쳐 plan 문서를 작성하는 스킬이다.

## 기본 호출할 에이전트 목록

| 에이전트명  | 하는일                                                                                    |
| ----------- | ----------------------------------------------------------------------------------------- |
| doc-curator | yusung-harness-doc mcp 와 연결해서 문서 조회, 생성, 업데이트                              |
| planner     | architecturePlan 문서 작성                                                                |
| researcher  | architecturePlan 문서 작성 시에 공식 아이콘,에셋 등 svg 리소스가 필요하다면 다운로드 역할 |

## ArchitecturePlan 생성 및 수정 규칙

- ArchitecturePlan은 인프라, 아키텍쳐, 기술스택, 배포전략, 로그관리 등등에 대한 레포 scope의 계획 문서이다.
- projectId당 하나의 ArchitecturePlan만 존재한다.
- 매 plan 생성시마다, 해당 plan 예상 결과를 포함한 architecturePlan의 내용이 맞는지를 확인하고, 어긋난 부분이 있을 경우 업데이트한다.

### 구조도 예시

- [인프라 구조도 예시](./references/인프라.pdf)
