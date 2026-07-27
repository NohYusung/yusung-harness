---
name: plan
description: 작업 계획을 세우는 스킬
---

요구사항을 기반으로 구현 계획을 세우는 스킬이다.

# 작업 에이전트 목록

| 에이전트명  | 역할                                                                 |
| ----------- | -------------------------------------------------------------------- |
| planner     | 구현 기획 플랜 작성, 태스크 분리, 태스크별 플랜 작성                 |
| coder       | 기존 코드 베이스 탐색 작업을 통해 맥락 주입                          |
| architect   | 인프라, 아키텍쳐, 기술스택, 배포전략, 로그관리 등등에 대한 계획 정리 |
| doc-curator | yusung-harness-doc mcp 통해 문서관리                                 |

<RULE>

## 워크 플로우

> - doc-curator는 먼저 yusung-harness-doc mcp 서버의 'get_project'를 통해 작업 지시가 내려진 레포가 project로 등록이 되어있는지 확인한다.
> - 만약 project로 등록이 되어있지 않으면, 'project로 등록되지 않았습니다. 먼저 레포를 project로 등록하세요' 라고 반환한 후 메인 에이전트의 대화를 종료한다.
> - planner는 plan과 task 별로 작성된 계획을 doc-curator에게 전달하여 yusung-harness-doc mcp서버에 문서를 저장한다.

## Plan 생성 규칙

- 먼저 모든 작업 단위를 포함한 Plan을 작성한다.
- plan은 단계별로 task별로 scope를 나눠서 별도 task별 기획 문서를 작성한다.
  - 태스크별 기획은 반드시 **\*체크리스트**형식의 작업 절차별 진행도가 포함되어야 한다.
    > **예시)**
    >
    > - [x] NestJs 모듈 등록
    > - [x] 공지사항 list 매서드 작업
    > - [ ] 공지사항 create 매서드 비관적 lock 작업
  - task를 나누는 기준은 **_기능_** 단위 여야 한다.
    > **예시)**
    >
    > - Plan-1: GA4 API를 활용한 웹 통계 대시보드 작성(title)
    > - Task-1: GA4 API 서비스 레이어 작성(title)
    > - Task-2: 통계 도메인 GA4 전용 API 추가(title)
    > - Task-3: 구글 클라우드 서비스 계정 등록(title)
    > - ...
- Plan 문서 작성 시 architecturePlanId를 참조하여야 한다.
  - 예시) Plan 테이블
    |id|projectId|title|architecturePlanId|...|
    |---|---|---|---|---|
    |1|1|GA4 API를 활용한 웹 통계 대시보드 작성|1|...|
    |2|1|공지사항 기능 구현|1|...|
    |3|1|관리자 대시보드 기능 구현|2|...|

## ArchitecturePlan 생성 규칙

- ArchitecturePlan은 인프라, 아키텍쳐, 기술스택, 배포전략, 로그관리 등등에 대한 레포 scope의 문서이다.
- projectId당 하나의 ArchitecturePlan만 존재한다.
- 매 plan 생성시마다, 해당 plan 예상 결과를 포함한 architecturePlan의 내용이 맞는지를 확인하고, 어긋난 부분이 있을 경우 업데이트한다.

</RULE>

## 계획이 마무리 된 후에는 Doc-curator에게 문서를 hand-off 한다.
