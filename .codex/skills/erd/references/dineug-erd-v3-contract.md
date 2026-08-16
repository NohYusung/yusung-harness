# Dineug v3 ERD contract

이 계약은 `ERDInventory/2.0`을 Dineug ERD Editor가 직접 여는 결정론적 `.erd` JSON으로 변환하고 검증하는 기준이다.

## 목차

- [입력 inventory](#입력-inventory)
- [Dineug root와 collections](#dineug-root와-collections)
- [ID와 순서](#id와-순서)
- [table-column-index 매핑](#table-column-index-매핑)
- [FK 매핑](#fk-매핑)
- [memo 계약](#memo-계약)
- [SCC layout](#scc-layout)
- [크기 제한](#크기-제한)
- [검증과 저장](#검증과-저장)

## 입력 inventory

- canonical physical source는 `../../db/references/db-source-discovery.md`의 우선순위를 따른다.
- 입력 root `contract`는 `ERDInventory/2.0`이다.
- `engine`은 Dineug가 지원하는 MariaDB, MSSQL/SQL Server, MySQL, Oracle, PostgreSQL 또는 SQLite여야 한다.
- column ordinal, PK column ordinal, UK column ordinal과 composite FK endpoint ordinal을 보존한다.
- nullable, foreignKey와 autoIncrement는 필수 boolean이며 누락값을 `false`로 보정하지 않는다.
- PK와 UK는 column 플래그가 아니라 제약 단위로 기록한다.
- PK name은 Dineug v3에 보존 위치가 없으므로 inventory에 넣지 않는다. 이름 보존 대상은 named UK와 FK constraint다.

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

- `sourceTable`은 FK를 소유한 table이고 `targetTable`은 참조되는 table이다.
- `foreignKey: true`인 column 집합은 모든 relationship의 `sourceTable/sourceColumns` union과 정확히 같아야 한다.
- 관계 없는 scope는 빈 `relationships`를 허용한다.
- 확인되지 않은 cardinality, PK, UK, FK action을 추측하지 않는다.

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
- `settings.databaseName`에는 inventory `name`을 저장한다. database `scope`는 이 필드로 대체하지 않고 metadata memo에 별도로 보존한다.
- 모든 collection key는 내부 entity `id`와 같아야 한다.
- 모든 entity `meta`는 결정론적인 `{ "updateAt": 0, "createAt": 0 }`이다.
- `doc.*Ids`는 대응 collection을 중복과 orphan 없이 정확히 한 번씩 참조한다.

## ID와 순서

- ID는 `<kind>-<sha256(key)의 앞 20 hex>` 형식이다.
- kind와 key는 다음과 같다.

| entity | kind | key |
| --- | --- | --- |
| table | `table` | `qualifiedName` |
| column | `column` | `qualifiedName.columnName` |
| relationship | `relationship` | `sourceTable|constraint|sourceColumnsCsv|targetTable|targetColumnsCsv` |
| unique index | `index` | `qualifiedName.constraintName` |
| index column | `index-column` | `indexKey|ordinal|columnName` |
| metadata memo | `memo` | `metadata` |
| FK memo | `memo` | relationship key |

- table은 qualified name, UK는 constraint name, FK는 relationship key 순으로 정렬한다. 문자열 정렬은 locale에 의존하지 않는 `a < b ? -1 : a > b ? 1 : 0` 비교만 사용한다.
- column, PK, UK와 FK column 배열은 physical ordinal을 보존한다.
- metadata memo가 `doc.memoIds`의 첫 항목이며 FK memo가 relationship key 순으로 뒤따른다.

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

## memo 계약

- Dineug가 지원하지 않는 provenance와 FK constraint 의미는 보이는 양수 크기의 `memoEntities`로 보존한다.
- memo payload는 prefix 다음에 key-sorted compact JSON을 붙인다.
- metadata memo value:

```text
[yusung-harness:erd-meta/1.0]\n{"engine":...,"inventoryFingerprint":...,"scope":...,"sourceRevision":...}
```

- FK마다 정확히 하나인 memo value:

```text
[yusung-harness:fk/1.0]\n{"constraint":...,"onDelete":...,"onUpdate":...,"sourceCardinality":...,"sourceColumns":...,"sourceTable":...,"targetCardinality":...,"targetColumns":...,"targetTable":...}
```

- metadata key는 정확히 `engine`, `inventoryFingerprint`, `scope`, `sourceRevision`다.
- FK key는 정확히 `constraint`, `onDelete`, `onUpdate`, `sourceCardinality`, `sourceColumns`, `sourceTable`, `targetCardinality`, `targetColumns`, `targetTable`다.
- extra key, pretty JSON, 임의 prefix, timestamp와 절대 경로를 넣지 않는다.

## SCC layout

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
     metadata/FK memo annotation rail
```

- graph edge는 참조 대상에서 FK 소유 table 방향이다.
- Tarjan SCC를 qualified name 순회로 계산하고 condensation DAG를 stable topological order로 계층화한다.
- 같은 SCC의 순환 참조 table은 같은 layer에 qualified name 순으로 배치한다.
- component와 table 간격, z-index, endpoint 좌표와 방향은 builder 상수로만 결정한다.
- metadata memo를 먼저, FK memo를 relationship key 순으로 table 영역 오른쪽 annotation rail에 배치한다.
- `.erd` document를 손으로 후처리하지 않는다. layout 변경은 builder를 수정한 뒤 재생성한다.

## 크기 제한

- compact `JSON.stringify(document)`는 최대 5 MiB, 즉 5,242,880 UTF-8 bytes다.
- 여섯 collection의 entity 개수 합계는 최대 5,000개다.
- `settings.width`와 `settings.height`는 각각 2,000 이상 20,000 이하다.
- memo width와 height는 양수이고 모든 좌표는 finite number다.
- 한도를 넘으면 table, column, UK 또는 FK를 생략하지 않는다. 사용자와 scope를 줄여 별도 ERD로 생성한다.

## 검증과 저장

- build 전에 unique table/column/constraint, PK·UK column, FK endpoint와 cardinality enum을 검사한다.
- build 후 root, settings, doc/collection reference, bit, stable ID, memo payload와 전체 inventory 일치를 검사한다.
- standalone validation도 `settings.databaseName`을 inventory `name`으로, metadata memo를 `scope`, `engine`, `sourceRevision`으로 사용하여 document semantics의 `inventoryFingerprint`를 다시 계산한다.
- 같은 inventory를 두 번 build한 `.erd` 파일은 byte-for-byte 같아야 한다.
- mutation의 `document`에는 검증된 `.erd` 파일을 JSON parse한 구조화 object를 전달한다.
- 조회 record의 `document` canonical JSON 문자열은 다시 parse하고 같은 validator와 inventory로 검증한다.
- 기존 HTML 또는 Excalidraw record는 legacy로 보고하며 자동 변환·삭제·덮어쓰지 않는다.
