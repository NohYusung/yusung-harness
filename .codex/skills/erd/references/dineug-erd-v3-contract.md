# Dineug v3 ERD contract

이 계약은 `ERDInventory/2.0`을 Dineug ERD Editor가 직접 여는 결정론적이고 memo-free인 `.erd` JSON으로 변환하고 검증하는 기준이다.

## 목차

- [입력 inventory](#입력-inventory)
- [Dineug root와 collections](#dineug-root와-collections)
- [ID와 순서](#id와-순서)
- [table-column-index 매핑](#table-column-index-매핑)
- [FK 매핑](#fk-매핑)
- [memo-free 계약](#memo-free-계약)
- [table-only SCC layout](#table-only-scc-layout)
- [크기 제한](#크기-제한)
- [검증과 저장](#검증과-저장)

## 입력 inventory

- canonical physical source는 `../../db/references/db-source-discovery.md`의 우선순위를 따른다.
- 입력 root `contract`는 `ERDInventory/2.0`이다.
- `engine`은 Dineug가 지원하는 MariaDB, MSSQL/SQL Server, MySQL, Oracle, PostgreSQL 또는 SQLite여야 한다.
- column ordinal, PK column ordinal, UK column ordinal과 composite FK endpoint ordinal을 보존한다.
- nullable, foreignKey와 autoIncrement는 필수 boolean이며 누락값을 `false`로 보정하지 않는다.
- PK와 UK는 column 플래그가 아니라 제약 단위로 기록한다.
- PK name은 Dineug v3에 보존 위치가 없으므로 inventory에 넣지 않는다. named UK는 index name으로 보존한다.

```ts
interface ERDInventoryV2 {
  contract: "ERDInventory/2.0";
  name: string;
  scope: string;
  engine: string;
  sourceRevision: string;
  tables: Array<{
    qualifiedName: string;
    comment?: string;
    columns: Array<{
      name: string;
      type: string;
      nullable: boolean;
      foreignKey: boolean;
      autoIncrement: boolean;
      default?: string | null;
      comment?: string;
    }>;
    primaryKey: {
      columns: string[];
    } | null;
    uniqueConstraints: Array<{
      name: string;
      columns: string[];
    }>;
  }>;
  relationships: Array<{
    constraint: string;
    sourceTable: string;
    sourceColumns: string[];
    sourceCardinality: "0..1" | "0..N" | "1" | "1..N";
    targetTable: string;
    targetColumns: string[];
    targetCardinality: "0..1" | "1";
    onUpdate?: string | null;
    onDelete?: string | null;
  }>;
}
```

- `ERDInventory/2.0` shape는 호환성을 위해 그대로 유지한다.
- root `scope`, `sourceRevision`과 relationship `constraint`, `onDelete`, `onUpdate`는 source 추적·검증·보고용 비저장 context다.
- 비저장 context는 `.erd` payload, entity ID, collection 순서, document fingerprint와 문서 동등성에 영향을 주지 않는다.
- `sourceTable`은 FK를 소유한 table이고 `targetTable`은 참조되는 table이다.
- core relationship key는 `sourceTable|sourceColumnsCsv|targetTable|targetColumnsCsv`다. column CSV는 입력의 physical ordinal을 보존한다.
- 같은 core key와 같은 source/target cardinality를 가진 relationship은 하나로 정규화한다.
- 같은 core key에서 source 또는 target cardinality가 하나라도 다르면 모순된 입력으로 거부한다.
- `foreignKey: true`인 column 집합은 정규화된 relationship의 `sourceTable/sourceColumns` union과 정확히 같아야 한다.
- 관계 없는 scope는 빈 `relationships`를 허용한다.
- 확인되지 않은 cardinality, PK, UK와 FK action을 추측하지 않는다.

## Dineug root와 collections

- `.erd` 파일은 다음 공식 Dineug ERD Editor v3 root를 사용한다.

```json
{
  "$schema": "https://raw.githubusercontent.com/dineug/erd-editor/main/json-schema/schema.json",
  "version": "3.0.0",
  "settings": {},
  "doc": {
    "tableIds": [],
    "relationshipIds": [],
    "indexIds": [],
    "memoIds": []
  },
  "collections": {
    "tableEntities": {},
    "tableColumnEntities": {},
    "relationshipEntities": {},
    "indexEntities": {},
    "indexColumnEntities": {},
    "memoEntities": {}
  }
}
```

- 여섯 collection을 모두 포함한다. 별도 custom root, `lww`, HTML, Excalidraw element와 embedded file을 추가하지 않는다.
- `settings.databaseName`에는 inventory `name`, `settings.database`에는 inventory `engine`의 Dineug code를 저장한다.
- 모든 collection key는 내부 entity `id`와 같아야 한다.
- 모든 entity `meta`는 결정론적인 `{ "updateAt": 0, "createAt": 0 }`이다.
- `doc.*Ids`는 대응 collection을 중복과 orphan 없이 정확히 한 번씩 참조한다.
- `doc.memoIds`는 정확히 `[]`, `collections.memoEntities`는 정확히 `{}`다.

## ID와 순서

- ID는 `<kind>-<sha256(key)의 앞 20 hex>` 형식이다.
- kind와 key는 다음과 같다.

| entity | kind | key |
| --- | --- | --- |
| table | `table` | `qualifiedName` |
| column | `column` | `qualifiedName.columnName` |
| relationship | `relationship` | `sourceTable|sourceColumnsCsv|targetTable|targetColumnsCsv` |
| unique index | `index` | `qualifiedName.constraintName` |
| index column | `index-column` | `indexKey|ordinal|columnName` |

- table은 qualified name, UK는 constraint name, relationship은 core relationship key 순으로 정렬한다.
- 문자열 정렬은 locale에 의존하지 않는 `a < b ? -1 : a > b ? 1 : 0` 비교만 사용한다.
- column, PK, UK와 FK column 배열은 physical ordinal을 보존한다.
- relationship의 constraint 이름과 referential action은 ID 또는 정렬 key에 포함하지 않는다.

## table-column-index 매핑

- physical table 하나를 `tableEntities` 하나로 만든다.
- physical column 하나를 `tableColumnEntities` 하나로 만들고 table의 `columnIds`와 `seqColumnIds`에 같은 ordinal로 둔다.
- Dineug column `options` bit는 다음과 같다.
  - auto increment: `1`
  - table `primaryKey.columns`에 포함: `2`
  - 단일-column UK: `4`
  - `nullable: false`: `8`
- column `ui.keys`는 PK `1`, FK `2` bit를 합성한다.
- 모든 named `uniqueConstraints`는 `unique: true`인 `indexEntities`로 만든다.
- UK column ordinal마다 `orderType: 1`인 `indexColumnEntities`를 만들고 index의 두 ID 배열에 같은 순서로 둔다.
- composite UK는 index collection에만 보존하며 각 column의 단일 unique option bit는 설정하지 않는다.
- PK는 column option으로 표현하며 별도 Dineug index를 합성하지 않는다.

## FK 매핑

- Dineug `relationship.start`는 참조 대상 `targetTable/targetColumns`다.
- Dineug `relationship.end`는 FK 소유 `sourceTable/sourceColumns`다.
- source cardinality는 다음 `relationshipType` bit로 매핑한다.

| source cardinality | bit |
| --- | ---: |
| `0..1` | `2` |
| `0..N` | `4` |
| `1` | `8` |
| `1..N` | `16` |

- target cardinality `0..1`은 `startRelationshipType: 1`, `1`은 `2`다.
- source FK column이 모두 table PK에 포함되면 `identification: true`, 아니면 `false`다.
- source/target column 수, ordinal, table 소유와 양방향 reference가 일치해야 한다.
- core relationship key가 같은 FK는 cardinality가 같을 때 하나의 `relationshipEntities` entity로 표현한다.

## memo-free 계약

```text
ERDInventory/2.0
├─ persisted: name, engine, tables, columns, PK, UK, relationship endpoints/cardinality
└─ context only: scope, sourceRevision, relationship.constraint/onDelete/onUpdate
                          │
                          ▼
Dineug v3 document
├─ table/column/index/relationship collections
├─ doc.memoIds: []
└─ collections.memoEntities: {}
```

- provenance, source revision, scope, inventory fingerprint, FK constraint 이름과 `ON DELETE`/`ON UPDATE`를 memo나 custom field로 저장하지 않는다.
- metadata memo, FK memo, memo prefix와 오른쪽 annotation rail은 생성하지 않는다.
- validator는 `doc.memoIds` 또는 `collections.memoEntities`가 비어 있지 않으면 즉시 거부한다.
- 기존 memo-bearing Dineug v3 문서는 startup migration 입력일 수 있지만 신규 memo-free validator의 valid document는 아니다.
- legacy 변환기는 memo를 제거하고 관계를 core key로 다시 키잉한 canonical document를 만들어야 한다. 렌더 단계의 필터나 CSS로 memo를 숨기지 않는다.

## table-only SCC layout

```text
target table ──FK graph edge──> source table
                    │
                    ▼
          Tarjan SCC condensation
                    │
                    ▼
        stable topological layer order
                    │
                    ▼
 same SCC=same layer, members=name order
                    │
                    ▼
       table bounds only canvas sizing
```

- graph edge는 참조 대상에서 FK 소유 table 방향이다.
- Tarjan SCC를 qualified name 순회로 계산하고 condensation DAG를 stable topological order로 계층화한다.
- 같은 SCC의 순환 참조 table은 같은 layer에 qualified name 순으로 배치한다.
- component와 table 간격, z-index, endpoint 좌표와 방향은 builder 상수로만 결정한다.
- memo 또는 annotation rail의 좌표·크기는 layout과 canvas 계산에 포함하지 않는다.
- `rightmostTable`은 모든 table의 `x + width` 최댓값, `bottommostTable`은 `y + height` 최댓값이다.
- `settings.width`는 `max(2000, rightmostTable + 100)`, `settings.height`는 `max(2000, bottommostTable + 100)`이다.
- `.erd` document를 손으로 후처리하지 않는다. layout 변경은 builder를 수정한 뒤 재생성한다.

## 크기 제한

- compact `JSON.stringify(document)`는 최대 5 MiB, 즉 5,242,880 UTF-8 bytes다.
- 여섯 collection의 entity 개수 합계는 최대 5,000개다. memo collection은 항상 0개다.
- `settings.width`와 `settings.height`는 각각 2,000 이상 20,000 이하다.
- table과 relationship endpoint를 포함한 모든 좌표는 finite number다.
- 한도를 넘으면 table, column, UK 또는 FK를 생략하지 않는다. 사용자와 scope를 줄여 별도 ERD로 생성한다.

## 검증과 저장

- build 전에 unique table/column/UK constraint, PK·UK column, FK endpoint와 cardinality enum을 검사한다.
- relationship은 core key로 정규화하고 같은 endpoint의 cardinality 충돌을 검사한다.
- build 후 root, settings, doc/collection reference, stable ID, canonical order, PK·UK·FK bit, endpoint와 cardinality를 inventory의 persisted projection에 직접 대조한다.
- document에서 inventory를 재구성할 때 memo를 사용하지 않는다. scope, sourceRevision, FK constraint 이름과 referential action은 대조 대상이 아니다.
- 비저장 context만 다른 두 inventory는 byte-for-byte 같은 `.erd`를 만들어야 한다.
- `documentFingerprint`는 compact canonical document bytes의 SHA-256으로 계산하며 document 자체에는 저장하지 않는다.
- mutation의 `document`에는 검증된 `.erd` 파일을 JSON parse한 구조화 object를 전달한다.
- 조회 record의 `document` canonical JSON 문자열은 다시 parse하고 같은 validator와 persisted projection으로 검증한다.
- unchanged는 document fingerprint만으로 결정하지 않는다. 기존 record와 새 build의 canonical bytes가 정확히 같아야 한다.
- 기존 HTML 또는 Excalidraw record는 legacy로 보고하며 자동 변환·삭제·덮어쓰지 않는다.

## 완료 조건

- `doc.memoIds: []`와 `collections.memoEntities: {}`가 정확히 유지된다.
- table·column·PK·UK와 정규화된 core relationship이 누락·중복 없이 공식 collection에 존재한다.
- stable ID, collection key, canonical order, option/key bit, composite ordinal, FK endpoint와 cardinality가 모두 유효하다.
- relationship 수가 늘어도 annotation rail 때문에 canvas width 또는 height가 증가하지 않는다.
- 비저장 context 변경은 document bytes와 document fingerprint를 바꾸지 않고 endpoint 또는 cardinality 변경은 둘 다 바꾼다.
- 같은 persisted projection의 반복 build는 byte-identical하고 저장 후 재조회 document도 검증된 build와 정확히 같다.
