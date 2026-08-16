# yusung-harness-doc Domain 저장 정책

- Domain은 업무 영역의 목적, 역할·책임, 비즈니스 규칙과 코드 근거를 설명하는 Markdown 페이지다.
- 한 프로젝트의 한 업무 Domain은 정확히 한 `Domain` 레코드로 관리한다.
- 페이지 identity는 `domainId`이며 `(projectId, title)`은 trim한 대소문자 구분 제목으로 유일하다.
- nullable `parentId`로 깊이 제한 없는 단일 부모 트리를 구성한다.
  - `null`: root Domain
  - positive integer: 같은 프로젝트의 parent Domain ID
- `parentId`는 업무 경계의 구조적 포함 관계이며 기술 의존성이나 DB 관계를 의미하지 않는다.
- Domain content에 ERD JSON 또는 `kind: "domain-erd"` payload를 저장하지 않는다.

| id | projectId | parentId | title | content |
| --- | --- | --- | --- | --- |
| 1 | 1 | `null` | Commerce | Markdown 업무 규칙 |
| 2 | 1 | 1 | Orders | Markdown 업무 규칙 |

## MCP 계약

- `get_domain`: flat 목록의 각 레코드에서 `parentId`를 함께 반환한다.
- `create_domain.parentId`
  - 생략/`null`: root 생성
  - ID: child 생성
- `update_domain.parentId`
  - 생략: 기존 부모 유지
  - `null`: root 이동
  - ID: subtree reparent
- 저장 전 기존 페이지를 조회하고 부모부터 저장한다. 저장 후 다시 조회하여 페이지 유일성과 전체 parent chain을 검증한다.
- 중복 후보나 불명확한 부모가 있으면 임의로 쓰지 않는다. stale 페이지는 자동 삭제하지 않고 보고한다.
