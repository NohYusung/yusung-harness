# ERDExcalidraw/1.0 contract

이 문서는 물리 데이터베이스 inventory를 결정론적인 Excalidraw ERD로 변환하고 검증할 때 사용하는 계약이다. HTML, Mermaid, SVG와 Domain ERD JSON은 이 계약의 산출물이 아니다.

## 목차

- [저장 필드](#저장-필드)
- [입력 inventory](#입력-inventory)
- [Excalidraw scene](#excalidraw-scene)
- [요소 의미](#요소-의미)
- [표기와 배치](#표기와-배치)
- [검증](#검증)
- [예시 실행](#예시-실행)

## 저장 필드

- `title`은 선택한 database scope를 보존한 `{{scope}} ERD` 형식을 사용한다.
- mutation의 `scene`은 완전한 `.excalidraw` 구조화 object다. build output 파일을 JSON parse하여 전달한다.
- 조회 record의 `scene`은 서버가 canonical serialization한 JSON 문자열이다. parse·validate한 뒤 사용한다.
- 하나의 `title`에는 하나의 선택된 database scope만 저장한다.
- 신규·갱신 payload에 `html`을 넣지 않는다.
- 이 스킬이 작성하는 artifact에서는 기존 HTML ERD를 Excalidraw scene으로 가장하거나 자동 변환하지 않는다. canonical inventory로 다시 생성한다. 앱 migration·backfill 정책은 이 계약의 범위 밖이다.

## 입력 inventory

- scene을 직접 손으로 조립하지 말고 먼저 `ERDInventory/1.0` JSON을 작성한다.
- table과 relationship은 `db-source-discovery.md`의 canonical physical source에서만 가져온다.
- table은 qualified physical name 순으로 정렬하고 column은 physical ordinal을 보존한다.
- relationship은 실제 FK constraint만 포함한다.
- 이름 없는 FK에는 DB 문서와 동일한 결정론적 문서용 constraint label을 사용한다.
- 입력 형식은 다음과 같다.

```ts
interface ERDInventoryV1 {
  contract: "ERDInventory/1.0";
  name: string;
  scope: string;
  engine?: string | null;
  sourceRevision: string;
  tables: Array<{
    qualifiedName: string;
    columns: Array<{
      name: string;
      type: string;
      nullable: boolean;
      primaryKey?: boolean;
      foreignKey?: boolean;
      unique?: boolean;
      default?: string | null;
    }>;
  }>;
  relationships: Array<{
    constraint: string;
    sourceTable: string;
    sourceColumns: string[];
    sourceCardinality: "1" | "0..1" | "N" | "1..N" | "0..N";
    targetTable: string;
    targetColumns: string[];
    targetCardinality: "1" | "0..1" | "N" | "1..N" | "0..N";
    onUpdate?: string | null;
    onDelete?: string | null;
  }>;
}
```

- `sourceTable`은 FK를 소유한 table이고 `targetTable`은 참조되는 table이다.
- 모든 column의 `nullable`은 필수 boolean이다. 누락값을 `false`로 보정하지 않으며 누락 또는 비-boolean 입력은 build 전에 거부한다.
- `primaryKey`, `foreignKey`, `unique`만 생략 시 `false`로 정규화한다.
- endpoint cardinality는 확인된 FK nullability와 uniqueness만으로 표현한다. 애플리케이션 사용 패턴으로 cardinality를 추측하지 않는다.
- composite FK는 source와 target column 배열의 길이와 ordinal을 일치시킨다.
- 최소 fixture는 [erd-inventory-example.json](./erd-inventory-example.json)을 참조한다.

## Excalidraw scene

- root는 다음 고정 필드를 포함한다.

```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "yusung-harness:erd",
  "elements": [],
  "appState": {
    "gridSize": null,
    "viewBackgroundColor": "#f8fafc"
  },
  "files": {}
}
```

- `files`는 항상 빈 객체로 둔다.
- `image`, `embeddable`, 외부 link와 data URL을 포함하지 않는다.
- 허용 요소는 `rectangle`, `text`, `arrow`뿐이다. `line`을 포함한 다른 element type은 거부한다.
- `elements`는 최대 5,000개다.
- compact `JSON.stringify(scene)`의 UTF-8 크기는 최대 5 MiB, 즉 5,242,880 bytes다. pretty-printed 임시 파일 크기가 아니라 MCP에 전달할 구조화 object의 compact JSON 크기를 기준으로 한다.
- ID, group ID, index, seed와 version nonce는 입력 의미에서 결정론적으로 생성한다.
- 실행 시각, 임의 UUID, random seed와 로컬 절대 경로를 scene에 기록하지 않는다.

## 요소 의미

### Metadata

- scene에 정확히 하나의 metadata text element를 둔다.
- `customData`에 다음 값을 기록한다.

```json
{
  "contract": "ERDExcalidraw/1.0",
  "kind": "erd-metadata",
  "name": "Commerce database ERD",
  "scope": "shop.public",
  "engine": "PostgreSQL 16",
  "sourceRevision": "example-revision-7f3c2a1",
  "inventoryFingerprint": "sha256..."
}
```

### Table

- physical table마다 `kind: "table"`인 outer rectangle을 정확히 하나 둔다.
- table outer rectangle에 full column semantics를 저장한다.
- header, title과 column text는 표시 전용 요소로 둔다.

```json
{
  "contract": "ERDExcalidraw/1.0",
  "kind": "table",
  "qualifiedName": "public.orders",
  "columns": []
}
```

### Foreign key

- physical FK마다 `kind: "foreign-key"`인 bound arrow를 정확히 하나 둔다.
- arrow는 source table에서 target table 방향으로 연결한다.
- source·target table의 `boundElements`에도 동일 arrow ID를 역참조한다.
- label에는 cardinality, constraint name과 확인된 referential action을 표시한다.
- `customData`는 해당 `ERDInventory/1.0` relationship 객체를 그대로 포함한다.

### Schema scope

- database/schema별 table 그룹을 dashed rectangle으로 둘러싼다.
- scope rectangle에는 `kind: "schema-scope"`, scope name과 포함 table name을 기록한다.
- schema 경계는 의미 검증을 보조하며 FK endpoint를 대신하지 않는다.

## 표기와 배치

```text
┌ public.users ───────────────────────────┐
│ [PK] id       : uuid         · NOT NULL │
│ [UQ] email    : varchar(320) · NOT NULL │
└─────────────────────────────────────────┘
             ▲
             │ 0..N → 1 · fk_orders_user
             │
┌ public.orders ──────────────────────────┐
│ [PK] id       : uuid · NOT NULL          │
│ [FK] user_id  : uuid · NOT NULL          │
└─────────────────────────────────────────┘
```

- column은 ordinal 순서로 표시한다.
- `PK`, `FK`, `UQ`, physical type과 nullability를 표시한다.
- default는 table `customData`에 보존하되 card가 과도하게 넓어지지 않도록 기본 label에서는 생략한다.
- table rectangle, column text, FK label과 arrow가 겹치지 않도록 scope별 grid와 relationship offset을 사용한다.
- self-reference FK는 table 바깥의 loop arrow로 표현한다.
- 같은 table pair의 복수 FK는 서로 다른 offset을 사용한다.
- 큰 scene도 table이나 FK를 생략하지 않는다. 5,000 element 또는 5 MiB 한도를 넘으면 build를 실패시키고, 사용자가 scope를 줄인 경우에만 별도 ERD로 분리한다.

## 검증

- build 전에 inventory contract, unique table/column, FK endpoint와 composite column 수를 검사한다.
- build 후 다음 집합을 inventory와 비교한다.
  - qualified table name과 ordered column semantics
  - FK constraint, endpoint, ordered column, cardinality와 action
  - source revision, scope와 inventory fingerprint
- element ID와 semantic table name은 중복될 수 없다.
- 모든 arrow binding과 `boundElements`는 양방향으로 유효해야 한다.
- compact scene JSON은 5,242,880 UTF-8 bytes 이하여야 하며 element는 5,000개 이하여야 한다.
- invalid scene, legacy HTML, `rectangle|text|arrow` 이외의 element type, embedded file과 외부 link는 저장하지 않는다.
- 같은 inventory를 두 번 build한 결과는 byte-for-byte 동일해야 한다.

## 예시 실행

```bash
node scripts/build-erd-excalidraw.mjs \
  --input references/erd-inventory-example.json \
  --output /tmp/commerce-erd.excalidraw

node scripts/validate-erd-excalidraw.mjs \
  --scene /tmp/commerce-erd.excalidraw \
  --inventory references/erd-inventory-example.json
```

- 실제 작업에서는 전용 임시 경로에 scene을 생성하고 검증을 통과한 파일을 JSON parse한 object만 `create_erd` 또는 `update_erd`의 `scene` 인자로 전달한다.
- 저장 후 `get_erd`의 `record.scene` canonical JSON 문자열을 다시 parse하고 같은 validator와 inventory로 검증한다.
