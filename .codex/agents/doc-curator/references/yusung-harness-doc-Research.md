# yusung-harness-doc Research 저장 정책

- Research는 discovery와 외부 evidence를 하나의 고정 Markdown 문서로 관리한다.
- DB에는 `id`, `projectId`, timestamps, `title`, `content`만 저장한다.
- `searched_at`, evidence 유효기간, status, scope와 sources는 별도 컬럼이 아니라 `content`의 정본 metadata와 section에 기록한다.
- 조회는 `get_research`, 신규 저장은 `create_research`, 기존 문서 수정은 `update_research`를 사용한다.

## Project hard gate

- Project가 없는 조사는 대화 결과로 반환할 수 있지만 MCP에 저장하거나 수정하지 않는다.
- 저장 또는 수정 전 다음 순서로 project 소유권을 확인한다.
  1. `get_project({})`로 Project 목록을 조회한다.
  2. 대상 repository가 있으면 `repoPaths[].path`와 exact-match하고 `repoType: LOCAL`인 Project를 선택한다.
  3. `get_project({ projectId })`로 양의 정수 ID와 현재 Project 문맥을 다시 확인한다.
  4. update면 `get_research({ projectId })`에서 `researchId`가 같은 Project에 속하는지 확인한다.
- 연결 실패, Project 없음·중복, 소유권 불일치 또는 응답 검증 실패가 있으면 어떤 Research write도 호출하지 않는다.

## Markdown 고정 계약

- 문서 제목 H1 다음에 아래 H2를 정확한 제목과 순서로 모두 작성한다.

```text
Research Metadata
Problem and Audience
Expected Value and Success Signals
Goals and Non-goals
Verified Findings
Hypotheses and Assumptions
Alternatives and Provisional Preference
Decisions and Open Questions
Sources
Next Step
```

- `Research Metadata`에는 다음 key를 기록한다.
  - `mode: Research`
  - `status: complete | partial | blocked`
  - `searched_at`: offset을 포함한 실제 live 검색 완료 ISO datetime
  - `evidence_valid_until`: `searched_at + 7일` ISO datetime
  - `scope`: 한 줄 minified JSON `{"claims":[],"include":[],"exclude":[],"versions":[],"regions":[]}`. key 순서를 고정하고 각 배열은 trim·중복 제거 후 UTF-8 오름차순으로 정렬
  - `projectId`: 저장 문서에서만 MCP input과 같은 양의 정수
- `Sources`에는 실제로 연 원문의 제목, 발행 주체, 직접 URL, 날짜와 적용 버전을 기록한다.
- 해당 내용이 없는 section도 제거하지 말고 `- 해당 없음: [근거]`를 기록한다.

## Create 계약

- create는 유사하거나 최근인 Research가 있어도 반드시 현재 시각 기준 live 웹 검색을 새로 수행한다.
- 검색과 원문 검증을 완료한 뒤 다음 payload로 저장한다.

```json
{
  "projectId": 1,
  "title": "Research title",
  "content": "# Research title\n\n## Research Metadata\n..."
}
```

- `create_research` 성공 뒤 양의 정수 `id`를 기록하고 `get_research({ projectId })`로 title, content와 Project 소유권을 재검증한다.

## Update와 evidence 재사용 계약

- update 전 기존 문서를 `get_research({ projectId })`에서 읽고 metadata와 고정 section을 파싱한다.
- 다음 조건을 모두 만족할 때만 기존 evidence를 재사용한다.
  - 현재 시각이 `searched_at + 7일`보다 이르다.
  - 기존 `evidence_valid_until`이 `searched_at + 7일`과 일치한다.
  - 기존·신규 canonical `scope` 문자열이 byte-exact로 일치한다.
  - 필수 metadata, `Sources`와 모든 고정 section이 유효하다.
- 재사용 update에서는 `searched_at`, `evidence_valid_until`, verified finding과 source provenance를 그대로 유지한다.
- 7일 경계에 도달했거나, scope·claim·version·region 중 하나라도 달라졌거나, timestamp·metadata·source가 없거나 유효하지 않으면 live 검색과 원문 검증을 다시 수행한다.
- 재검색 update는 `searched_at`을 실제 새 검색 완료 시각으로, `evidence_valid_until`을 그 시각부터 7일 뒤로 갱신한다.
- 저장 payload는 `{ projectId, researchId, title, content }`이며 `update_research` 성공 후 `get_research`로 ID, 소유권과 전체 content를 재검증한다.

## 저장 안전 경계

- persistence layer가 고정 Markdown topology, timestamp 의미와 evidence 품질을 검증한다고 가정하지 않는다. doc-curator가 write 전에 직접 검증한다.
- MCP 성공 응답만으로 완료를 선언하지 않는다.
- partial write나 응답 검증 실패가 발생하면 같은 create/update를 맹목적으로 재호출하지 않고 다음 턴에 재조회한다.
