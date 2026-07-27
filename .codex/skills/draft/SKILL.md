---
name: draft
description: plan 단계에 진입하기 전에 러프한 기획(프로젝트 제안)을 잡는 단계, 최대한 발산적 사고로 가능성을 모색하고, 다양한 아이디어를 수집하는데 집중
---

다양한 가능성을 염두에 두며, 프로젝트 제안을 하는 스킬

## 호출할 에이전트 목록

| 에이전트명  | 하는일                                                             |
| ----------- | ------------------------------------------------------------------ |
| planner     | draft 문서 작성                                                    |
| researcher  | 발산적 사고로 검색, 비슷한 컨셉의 레퍼런스 체크                    |
| doc-curator | planner에게 전달받은 draft 내용 yusung-harness-doc mcp로 문서 생성 |

## 워크플로우

> - drafter는 먼저 'get_project'를 통해 작업 지시가 내려진 레포가 project로 등록이 되어있는지 확인한다.
> - 만약 project로 등록이 되어있지 않으면, 'project로 등록되지 않았습니다. 먼저 레포를 project로 등록하세요' 라고 반환한 후 대화를 종료한다.

### 설계 방향성 추론

- 설계 방향성을 지속적으로 유저와 대화하며 잡아나간다.
- 메인 에이전트 스레드에서 request_user_input tool을 호출해서 4개정도의 질문을 던지고 선택하는 식으로 작업을 이어나가도록 한다.

```rs
session
    .request_user_input(...)
    .await
```

- fuction call 예시

```json
{
  "name": "request_user_input",
  "arguments": {
    "questions": [
      {
        "id": "brand_identity",
        "header": "Brand",
        "question": "브랜드 아이덴티티 방향을 선택해 주세요.",
        "options": [
          {
            "label": "유저 친화적인 B2C 앱 (Recommended)",
            "description": "빠른 피드백과, 유저 CS가 중요한 앱 방향성입니다."
          },
          {
            "label": "기업 친화적인 B2B 앱",
            "description": "기업에 서비스할 SaaS기반 앱 방향성입니다."
          },
          {
            "label": "정부 서비스 목적의 B2G 앱",
            "description": "여러 공공기관과 협업 목적의 앱 방향성입니다."
          }
        ]
      }
    ]
  }
}
```
