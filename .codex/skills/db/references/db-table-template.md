# DBTableDoc/1.0 template

이 템플릿은 `create_db`와 `update_db`의 Markdown `content`에 사용하는 고정 계약이다. 섹션 이름과 순서를 유지하고, 확인할 수 없는 값은 빈칸이나 추측 대신 `미확인`으로 기록한다.

## 목차

- [저장 필드 매핑](#저장-필드-매핑)
- [고정 Markdown 템플릿](#고정-markdown-템플릿)
- [작성 규칙](#작성-규칙)
- [상태 판정](#상태-판정)

## 저장 필드 매핑

- `title`: 기본값은 물리 table name이다. 서로 다른 database/schema에 같은 이름이 있으면 `database.schema.table`을 사용한다.
- `content`: 아래 `DBTableDoc/1.0` Markdown 전체다.
- 하나의 content에는 하나의 physical table만 기록한다.

## 고정 Markdown 템플릿

````md
# {{qualifiedTableName}}

- 문서 계약: `DBTableDoc/1.0`
- 정규 title: `{{canonicalTitle}}`
- 분석 기준: `{{repositoryRelativePath}}@{{sourceRevision}}`
- 데이터베이스 엔진: `{{engineAndVersionOrUnknown}}`
- Database / Schema / Table: `{{database}}` / `{{schema}}` / `{{table}}`
- 근거 상태: `{{verified|partial|conflict}}`

## 1. 역할

- 목적: {{verifiedPurposeOrUnknown}}
- 소유 도메인: {{verifiedDomainOrUnknown}}
- 객체 종류: `physical table`
- 포함 근거: {{evidenceIds}}

## 2. 구조 요약

```text
{{parentTable}} 1 ---- N {{qualifiedTableName}} N ---- 1 {{referencedTable}}
                              |
                              +---- 1 : N {{childTable}}
```

- 위 ASCII 구조에는 현재 table과 직접 연결된 관계만 표시한다.
- 관계를 확인할 수 없으면 `직접 확인된 관계 없음`이라고 기록한다.

## 3. 컬럼

| 순서 | 컬럼 | 물리 타입 | Null | Default / Generated | PK | FK 대상 | UNIQUE / CHECK | 설명 | 근거 |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| {{ordinal}} | `{{column}}` | `{{physicalType}}` | {{YES|NO}} | `{{expressionOrNone}}` | {{YES|NO}} | `{{qualifiedTarget.columnOrNone}}` | {{constraintSummaryOrNone}} | {{descriptionOrUnknown}} | {{evidenceIds}} |

## 4. 제약조건

| 이름 | 종류 | 컬럼 | 참조 대상 / 식 | ON UPDATE | ON DELETE | 근거 |
| --- | --- | --- | --- | --- | --- | --- |
| `{{constraintNameOrGeneratedLabel}}` | `{{PK|UNIQUE|FK|CHECK|EXCLUDE}}` | `{{columnsInOrder}}` | `{{targetOrExpression}}` | `{{actionOrDash}}` | `{{actionOrDash}}` | {{evidenceIds}} |

## 5. 인덱스

| 이름 | 방식 | 키 컬럼 / 표현식 | 정렬 | UNIQUE | INCLUDE | Predicate | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `{{indexName}}` | `{{btree|hash|gin|gist|other}}` | `{{keysInOrder}}` | `{{ASC/DESC/none}}` | {{YES|NO}} | `{{includedColumnsOrNone}}` | `{{whereExpressionOrNone}}` | {{evidenceIds}} |

- PK/UNIQUE constraint가 생성한 backing index는 constraint 이름과 연결하여 중복 의미를 만들지 않는다.

## 6. 관계

### Outbound

| 대상 | Cardinality | 로컬 FK | 참조 컬럼 | Constraint | ON UPDATE | ON DELETE | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `{{qualifiedParentTable}}` | `{{N:1|0..1:1}}` | `{{localColumnsInOrder}}` | `{{targetColumnsInOrder}}` | `{{constraintName}}` | `{{action}}` | `{{action}}` | {{evidenceIds}} |

### Inbound

| 대상 | Cardinality | 상대 FK | 현재 참조 컬럼 | Constraint | ON UPDATE | ON DELETE | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `{{qualifiedChildTable}}` | `{{1:N|1:0..N}}` | `{{childColumnsInOrder}}` | `{{currentTableColumnsInOrder}}` | `{{constraintName}}` | `{{action}}` | `{{action}}` | {{evidenceIds}} |

## 7. 데이터 수명주기

- 생성 시각: {{columnAndDefaultOrUnknown}}
- 수정 시각: {{columnAndMechanismOrUnknown}}
- Soft delete: {{columnAndActiveRowRuleOrNone}}
- Version / locking: {{columnOrMechanismOrNone}}
- Partition / retention: {{verifiedRuleOrUnknown}}

## 8. 스키마 소스 매핑

| 역할 | 저장소 경로 / Symbol | 확인 내용 | 근거 상태 | 근거 |
| --- | --- | --- | --- | --- |
| migration | `{{path#identifier}}` | {{fact}} | {{primary|supporting|conflict}} | {{evidenceIds}} |
| schema snapshot / DDL | `{{path#identifier}}` | {{fact}} | {{supporting|conflict|missing}} | {{evidenceIds}} |
| ORM | `{{path#symbol}}` | {{fact}} | {{supporting|conflict|missing}} | {{evidenceIds}} |

## 9. 불일치와 미확인 항목

| 대상 | Canonical 물리 근거 | 불일치 근거 | 채택한 물리 값 | 영향 | 근거 |
| --- | --- | --- | --- | --- | --- |
| {{tableOrField}} | {{canonicalPhysicalFact}} | {{otherFact}} | {{selectedValue}} | {{impact}} | {{evidenceIds}} |

- 미확인: {{missingEvidenceOrNone}}
- 추론: {{inferenceClearlyLabeledOrNone}}

## 10. 근거 목록

| ID | 종류 | Source revision | 저장소 상대 경로 / 식별자 | 확인한 사실 |
| --- | --- | --- | --- | --- |
| E-001 | `migration` | `{{revision}}` | `{{path#migrationId}}` | {{fact}} |
| E-002 | `schema|DDL|ORM|configuration` | `{{revision}}` | `{{path#symbol}}` | {{fact}} |

## 11. 검증 체크리스트

- [ ] source revision과 migration 순서가 기록되어 있다.
- [ ] migration 기준 모든 컬럼이 ordinal 순서로 한 번씩 기록되어 있다.
- [ ] PK, UNIQUE, FK, CHECK, EXCLUDE constraint가 빠짐없이 기록되어 있다.
- [ ] 모든 index의 키 순서, 정렬, unique, include와 predicate가 기록되어 있다.
- [ ] FK의 outbound/inbound 문서가 같은 constraint와 action을 가리킨다.
- [ ] ORM 또는 snapshot 불일치가 migration 값과 분리되어 있다.
- [ ] 실제 row, sample data, 개인정보, credential과 connection string이 없다.
- [ ] 확인하지 못한 내용을 추측하지 않고 `미확인`으로 표시했다.
````

## 작성 규칙

- 컬럼은 physical ordinal 순서로 작성한다.
- composite key, constraint와 index의 컬럼 순서를 보존한다.
- composite FK는 관계 표의 로컬·상대 컬럼과 참조 컬럼을 같은 ordinal 순서로 나란히 기록한다.
- 기본값과 generated expression은 DB dialect 표현을 그대로 보존한다.
- 이름 없는 constraint에는 `unnamed_<type>_<columns>` 형태의 문서용 label을 붙이고 실제 DB 이름인 것처럼 표현하지 않는다.
- nullable FK의 cardinality는 `0..1:1`, required FK는 `N:1`로 구분한다.
- ORM cascade와 DB FK action을 혼동하지 않는다. 관계 표에는 migration의 `ON UPDATE`, `ON DELETE`만 기록한다.
- `updated_at` 컬럼에 default만 있고 trigger 또는 generated rule이 없으면 자동 갱신된다고 쓰지 않는다.
- table 설명과 column 설명이 코드 이름만으로 추론된 경우 `추론`에 넣고 확정 사실과 구분한다.
- 근거가 없는 성능 목적, 개인정보 분류, 보존 기간과 소유 도메인을 만들어내지 않는다.
- API와 application read/write 사용처를 코드 매핑이나 근거 목록에 추가하지 않는다.
- 실행 시각처럼 같은 source revision에서도 달라지는 값을 content에 넣지 않는다. 동일 revision과 근거로 생성한 content는 byte-for-byte 동일해야 한다.

## 상태 판정

- `verified`: migration 순서와 dialect가 확정되고 필수 구조가 직접 근거로 검증됐다.
- `partial`: migration·DDL이 전혀 없지만 runtime schema synchronization과 단일 canonical ORM schema가 모두 확인되어 inventory를 확정할 수 있을 때 ORM을 대체 근거로 사용한 상태다. inventory 또는 필수 구조를 확정할 수 없으면 `partial`이 아니라 blocked 처리한다.
- `conflict`: replay/snapshot/migration·DDL/ORM 근거가 물리 구조에 대해 불일치하며 문서에 충돌이 남아 있다. 물리 값은 `db-source-discovery.md`의 우선순위를 따른다.
