# yusung-harness-doc Architecture 문서 저장 정책

- Architecture는 프로젝트의 설계 계획과 구현 현황을 하나의 모델에서 관리한다.
- `type`은 `PLAN | PRODUCTION`이며 `(projectId, type)`별로 정확히 최신 한 건만 저장한다.
- 조회는 `get_architecture({ projectId })`, 저장은 `upsert_architecture`만 사용한다.
- upsert는 같은 type의 기존 레코드가 있으면 `id`, `type`, `createdAt`을 유지하고 최신 내용으로 교체한다. 별도 history 레코드를 생성하지 않는다.

```text
Architecture
├─ PLAN       ── Markdown content + 완전한 HTML 구조도
└─ PRODUCTION ── 검증된 deployment-architecture diagram
```

## PLAN 저장 계약

- architecturePlan 스킬의 설계 문서는 다음 payload로 저장한다.

```json
{
  "projectId": 1,
  "type": "PLAN",
  "title": "Target Architecture",
  "content": "# Architecture Plan\n...",
  "html": "<!doctype html><html>...</html>"
}
```

- `content`는 비어 있지 않은 Markdown 문서여야 한다.
- `html`은 `<!doctype html>`, `<html>`, `<head>`, `<body>`를 포함한 완전한 단일 HTML 구조도여야 한다.
- 런타임·인프라 구성이 바뀌면 `content`와 `html`을 같은 upsert에서 함께 갱신한다.
- 저장 전 `get_architecture` 결과에서 `type: "PLAN"`을 선택해 기존 레코드와 비교한다.

## PRODUCTION 저장 계약

- 현재 배포 현황은 다음 payload로 저장한다.

```json
{
  "projectId": 1,
  "type": "PRODUCTION",
  "title": "Current Deployment Architecture",
  "diagram": {
    "kind": "deployment-architecture",
    "schemaVersion": 1,
    "name": "Production",
    "environments": [
      { "id": "production", "name": "Production", "kind": "cloud" }
    ],
    "nodes": [
      { "id": "api", "name": "API", "kind": "service", "environmentId": "production" }
    ],
    "connections": []
  }
}
```

- `diagram`은 서버의 `deployment-architecture` schema 검증을 통과해야 한다.
- 검증된 diagram은 canonical JSON으로 `content`에 저장되며 `html`은 빈 문자열로 고정한다.
- 저장 전 `get_architecture` 결과에서 `type: "PRODUCTION"`을 선택해 기존 레코드와 비교한다.

## 저장 검증

1. `upsert_architecture` 결과의 `projectId`, `type`, `title`과 type별 필드를 확인한다.
2. `get_architecture({ projectId })`를 다시 호출한다.
3. 같은 type의 레코드가 한 건인지 확인한다.
4. 갱신이면 기존 `id`와 `createdAt`이 보존되고 내용과 `updatedAt`만 바뀌었는지 확인한다.
5. PLAN은 Markdown·HTML 완전성을, PRODUCTION은 diagram schema와 canonical JSON을 확인한다.
