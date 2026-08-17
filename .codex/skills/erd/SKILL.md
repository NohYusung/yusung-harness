---
name: erd
description: 기존 프로젝트 저장소의 migration, DDL, schema snapshot과 ORM schema/entity를 분석하여 특정 source revision의 현행 물리 DB 관계를 Dineug ERD Editor v3 .erd JSON으로 생성하거나 갱신하는 스킬. DB ERD, 테이블 관계도, FK 시각화, Dineug ERD 생성과 기존 ERD 동기화 요청에 사용한다.
---

## 에이전트 호출 경계

- 새 에이전트를 생성하는 `spawn_agent`는 `root만` 호출한다.
- non-root 에이전트는 `spawn_agent`를 `직접 또는 간접`으로 호출하거나 다른 에이전트에게 생성을 요청하지 않는다.
- non-root 에이전트는 root가 이미 생성한 에이전트와 협력할 때 `send_message`, `followup_task`, `wait_agent`를 사용할 수 있다.
- 추가 역할이나 에이전트가 필요하면 필요한 역할, 작업 범위와 기대 증거를 `root에 handoff`한다.

# Dineug v3 물리 DB ERD

- 선택한 source revision과 database scope의 AS-IS table, ordered column, PK, UK와 FK만 시각화한다.
- 목표 schema, 운영 DB drift, application read/write 흐름과 Domain ERD는 포함하지 않는다.
- 산출물은 Dineug ERD Editor v3가 직접 여는 결정론적 `.erd` JSON이다.
- HTML, Mermaid, SVG와 Excalidraw를 신규 ERD 저장 형식으로 만들지 않는다.
- `.erd`에는 테이블과 관계를 설명하는 memo 또는 annotation rail을 만들지 않는다.

## root가 호출할 담당 에이전트

| 에이전트 | 책임 |
| --- | --- |
| `coder` | repository·revision을 고정하고 canonical inventory를 수집하여 `.erd`를 build·validate한다. |
| `doc-curator` | 프로젝트와 기존 ERD를 조회하고 `create_erd` 또는 `update_erd`로 저장한 뒤 재조회한다. |

- root가 에이전트 호출과 범위를 조정한다.
- coder는 MCP 문서를 저장하지 않고 doc-curator는 확인되지 않은 DB 의미를 추론하지 않는다.

## 필수 참조

- 분석 전에 [DB source discovery 규칙](../db/references/db-source-discovery.md)을 읽고 canonical physical source 우선순위를 적용한다.
- inventory와 `.erd` 생성 전에 [Dineug v3 ERD 계약](./references/dineug-erd-v3-contract.md)을 읽는다.
- 입력 예시가 필요할 때만 [ERDInventory/2.0 fixture](./references/erd-inventory-example.json)을 읽는다.

## 안전 경계

<HARD-GATE>

- 저장 작업이면 doc-curator가 먼저 `get_project`로 프로젝트와 `repoPaths`를 확인한다. 등록되지 않은 프로젝트에는 저장하지 않는다.
- repository, source revision 또는 database scope를 식별할 수 없으면 분석과 저장을 중단한다.
- canonical table/PK/UK/FK inventory나 FK endpoint를 확정할 수 없으면 추측한 `.erd`를 만들거나 저장하지 않는다.
- 운영·개발 DB에 연결하거나 metadata와 row를 조회하지 않는다. migration 재생은 외부 연결이 없는 격리 임시 DB에서만 수행한다.
- migration, DDL, seed, code generation과 ORM sync를 대상 repository나 실제 DB에 적용하지 않는다.
- 실제 row, 개인정보, credential, token, connection string과 환경 변수 값을 inventory나 `.erd`에 넣지 않는다.
- 이 스킬이 작성하는 artifact에서는 legacy HTML/Excalidraw ERD를 Dineug 문서로 가장하거나 자동 변환하지 않는다. canonical inventory에서 다시 생성한다.
- build와 validate를 모두 통과하지 않은 document를 MCP에 전달하지 않는다.
- `doc.memoIds` 또는 `collections.memoEntities`가 비어 있지 않은 document를 신규 생성·갱신 입력으로 전달하지 않는다.

</HARD-GATE>

## 작업 흐름

```text
get_project + repoPaths
          │
          ▼
repository·revision·DB scope 고정
          │
          ▼
migration·DDL·ORM source 분석
          │
          ▼
ERDInventory/2.0 작성
          │
          ▼
build → memo-free .erd → direct semantic validate
          │
          ▼
get_erd → exact canonical document 비교
          │
          ├─ 없음 ────────────────> create
          ├─ 동일 ────────────────> unchanged
          └─ 다름 + valid 1건 ───> update
                              │
                              ▼
                 get_erd 재조회 → exact verify
```

1. `get_project`의 repository와 사용자 범위를 대조한다.
2. source revision을 commit hash로 기록한다. working tree를 포함하면 `HEAD+dirty`와 관련 경로를 기록한다.
3. `db-source-discovery.md`에 따라 migration, DDL, schema snapshot과 ORM source를 탐색한다.
4. 동일 revision·scope의 검증된 DB 문서는 inventory 교차 검증에만 재사용한다.
5. qualified table, ordered column, table 단위 PK·UK와 실제 FK endpoint를 `ERDInventory/2.0`으로 정규화한다.
6. builder로 memo-free `.erd`를 만들고 validator로 공식 collection, table·column·index·relationship reference, bit, cardinality와 canonical order를 직접 검사한다.
7. 같은 persisted projection의 반복 build가 byte-for-byte 동일한지 확인한다.
8. stable title의 기존 record를 조회하여 create/update/unchanged/blocked를 판정한다.
9. 저장 후 `record.document`를 parse·validate하고 검증된 canonical document와 정확히 대조한다.

## Inventory 규칙

- root `contract`는 `ERDInventory/2.0`이다.
- `name`, `scope`, `engine`, `sourceRevision`, 하나 이상의 `tables`와 `relationships` 배열을 포함한다.
- `scope`와 `sourceRevision`은 source 추적과 record title 선택에만 사용하는 비저장 context다.
- relationship의 `constraint`, `onDelete`, `onUpdate`도 source 검증·보고용 비저장 context다.
- 비저장 context는 `.erd` 출력, entity ID, collection 정렬, document fingerprint와 문서 동등성에 영향을 주지 않는다.
- table은 qualified name, UK는 constraint name, FK는 core relationship key 순으로 정렬한다.
- core relationship key는 `sourceTable|sourceColumnsCsv|targetTable|targetColumnsCsv`다.
- 동일 core key와 동일 cardinality의 FK는 하나로 정규화한다. 동일 core key의 source 또는 target cardinality가 충돌하면 build를 거부한다.
- column, PK·UK column과 composite FK endpoint의 physical ordinal을 보존한다.
- 모든 column `nullable`, `foreignKey`와 `autoIncrement`는 canonical source에서 확인한 필수 boolean이다.
- `foreignKey: true` column 집합은 정규화된 relationship의 모든 source endpoint union과 정확히 같아야 한다.
- PK는 `primaryKey: { columns } | null`, UK는 `uniqueConstraints[{ name, columns }]`로 기록한다. Dineug v3에 저장 위치가 없는 PK name은 inventory에도 넣지 않는다.
- FK 소유 table을 `sourceTable`, 참조 table을 `targetTable`로 기록한다.
- source cardinality는 `0..1|0..N|1|1..N`, target cardinality는 `0..1|1`만 허용한다.
- 확인되지 않은 table, column, constraint, cardinality와 referential action을 추가하지 않는다.

## Build와 validate

- `<ERD_SKILL_DIR>`은 이 `SKILL.md`가 있는 디렉터리다.
- output은 기본적으로 덮어쓰지 않는다. 교체할 전용 임시 파일에만 `--force`를 사용한다.

```bash
node <ERD_SKILL_DIR>/scripts/build-dineug-erd.mjs \
  --input <inventory.json> \
  --output <document.erd>

node <ERD_SKILL_DIR>/scripts/validate-dineug-erd.mjs \
  --document <document.erd> \
  --inventory <inventory.json>
```

- root는 Dineug schema URL, `version: "3.0.0"`, `settings`, `doc`와 공식 여섯 collection만 포함한다.
- `settings.databaseName`에는 inventory `name`, `settings.database`에는 `engine`의 Dineug code를 저장한다.
- `doc.memoIds`는 정확히 `[]`, `collections.memoEntities`는 정확히 `{}`여야 하며 validator는 non-empty memo 입력을 거부한다.
- stable ID는 `<kind>-<sha256(key) 앞 20 hex>`를 사용한다.
- relationship ID와 정렬에는 core relationship key만 사용한다.
- FK graph를 Tarjan SCC로 축약하고 stable topological layer에 테이블만 배치한다.
- canvas는 annotation rail 없이 table bounds만 사용한다. width는 `max(2000, rightmostTable + 100)`, height는 `max(2000, bottommostTable + 100)`이며 각 상한은 20,000이다.
- compact JSON은 최대 5 MiB, collection entity 합은 최대 5,000이다.
- 한도를 넘으면 entity를 생략하지 말고 사용자와 scope를 줄여 별도 ERD로 생성한다.
- document를 손으로 후처리하지 않는다. 표기·layout 변경은 builder와 계약을 수정한 뒤 재생성한다.

## 저장 계약

- `title`은 `<scope> ERD` 형식의 stable title을 사용한다. `scope`는 record 식별에만 쓰고 document에는 저장하지 않는다.
- mutation의 `document`는 validate를 통과한 `.erd` 파일을 JSON parse한 구조화 object다. JSON 문자열을 인자로 전달하지 않는다.
- 조회 record의 `document`는 서버가 canonical serialization한 JSON 문자열이다. 비교 전에 JSON parse와 validation을 다시 수행한다.
- `documentFingerprint`는 compact canonical document bytes의 SHA-256이며 document 안에 필드나 memo로 저장하지 않는다.
- unchanged 판정은 fingerprint만 믿지 않고 기존 document와 새 build의 canonical bytes가 정확히 같은지 확인한다.
- 같은 title은 같은 database scope를 의미한다.
- 기존 memo-bearing Dineug 문서는 신규 계약에서 invalid이며 startup migration이 정리할 대상이다. 스킬이 임의로 memo를 숨기거나 제거하여 저장하지 않는다.
- 기존 HTML/Excalidraw record는 legacy로 보고하고 사용자 승인 없이 삭제·덮어쓰기·변환하지 않는다.

## 동기화 알고리즘

```text
검증된 ERDInventory/2.0
            │
            ▼
memo-free canonical document build + validate
            │
            ▼
stable title로 get_erd
            │
            ├─ 0건 ─────────────────────────> create_erd
            │
            ├─ 1건 + valid + exact bytes 동일 ─> unchanged
            │
            ├─ 1건 + valid + exact bytes 다름 ─> update_erd
            │
            └─ 2건 이상 또는 invalid/legacy ──> blocked
                                                   │
create/update/unchanged ───────────────────────────┘
            │
            ▼
get_erd 재조회 → parse + validate + exact bytes 검증
```

- 동일 title이 없으면 `create_erd(projectId, title, document)`를 한 번 호출한다.
- valid Dineug record 한 건의 canonical bytes가 새 build와 같으면 mutation을 생략한다.
- canonical bytes가 다르면 `update_erd(projectId, erdId, title, document)`를 호출한다.
- document fingerprint는 비교·보고를 돕지만 exact canonical document 비교를 대체하지 않는다.
- 동일 title이 둘 이상이거나 `record.document`가 legacy/invalid이면 임의 선택이나 덮어쓰기를 하지 않는다.
- 요청 scope 밖의 title은 stale 후보로만 보고하고 자동 삭제하지 않는다.

## 결과와 완료 조건

- repository, revision, scope, table·column·PK·UK·정규화된 FK 수를 보고한다.
- document fingerprint, byte·entity·canvas budget과 validation 결과를 보고한다.
- created, updated, unchanged, blocked, stale title과 저장 후 ERD ID를 보고한다.
- 모든 physical table·column·PK·UK와 정규화된 core relationship이 공식 collection에 정확히 한 번 존재해야 한다.
- `doc.memoIds: []`와 `collections.memoEntities: {}`가 정확히 유지되어야 한다.
- doc ID, collection key, endpoint, option bit, composite ordinal, cardinality, stable ID와 canonical order가 모두 유효해야 한다.
- 관계 ID는 core relationship key만 반영하고 비저장 context만 다른 inventory는 byte-identical `.erd`를 생성해야 한다.
- SCC layout과 canvas bounds는 테이블만으로 계산되어야 한다.
- 반복 build가 동일하고 저장 후 parse·validate한 `record.document`가 검증된 canonical document와 정확히 일치해야 한다.
- blocked 또는 저장 실패가 있으면 전체 작업을 완전한 성공으로 보고하지 않는다.
