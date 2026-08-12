# DBTableDoc/1.0 가상 예시

이 문서는 형식 검증을 위한 완전한 가상 PostgreSQL 사례다. 경로, revision, 테이블과 제약조건은 실제 프로젝트나 운영 데이터가 아니다. 실제 row, sample data, 개인정보, credential과 connection string을 포함하지 않는다.

## 목차

- [가상 테이블 문서](#commerceorder_items)
- [컬럼과 제약조건](#3-컬럼)
- [인덱스와 관계](#5-인덱스)
- [스키마 소스와 불일치](#8-스키마-소스-매핑)
- [근거와 검증](#10-근거-목록)

# commerce.order_items

- 문서 계약: `DBTableDoc/1.0`
- 정규 title: `order_items`
- 분석 기준: `example-monorepo@example-revision-7f3c2a1`
- 데이터베이스 엔진: `PostgreSQL 16`
- Database / Schema / Table: `shop` / `commerce` / `order_items`
- 근거 상태: `conflict`

## 1. 역할

- 목적: 주문에 포함된 상품, 선택 옵션, 수량과 주문 당시 단가를 저장한다.
- 소유 도메인: `orders`
- 객체 종류: `physical table`
- 포함 근거: E-001, E-002

## 2. 구조 요약

```text
commerce.orders       1 ---- N commerce.order_items N ---- 1 catalog.products
                                      |
                                      +---- 0..N : 0..1 inventory.warehouses
                                      |
                                      +---- 1 : 0..N fulfillment.shipment_items
```

- `(tenant_id, order_id)`는 주문 삭제 시 함께 삭제되는 required composite FK다.
- `(tenant_id, product_id)`는 상품 삭제를 막는 required composite FK다.
- `warehouse_id`는 창고 삭제 시 `NULL`이 되는 optional FK다.

## 3. 컬럼

| 순서 | 컬럼 | 물리 타입 | Null | Default / Generated | PK | FK 대상 | UNIQUE / CHECK | 설명 | 근거 |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `tenant_id` | `uuid` | NO | - | YES | `복합 FK 2건: 4절 참조` | `uq_order_items_order_product_option` 구성 | tenant 식별자이자 composite PK 첫 번째 컬럼 | E-001 |
| 2 | `id` | `uuid` | NO | `gen_random_uuid()` | YES | - | - | composite PK 두 번째 컬럼인 주문 항목 식별자 | E-001 |
| 3 | `order_id` | `uuid` | NO | - | NO | `commerce.orders.id` | `uq_order_items_order_product_option` 구성 | 소속 주문 | E-001 |
| 4 | `product_id` | `uuid` | NO | - | NO | `catalog.products.id` | `uq_order_items_order_product_option` 구성 | 주문 당시 선택 상품 | E-001 |
| 5 | `warehouse_id` | `uuid` | YES | - | NO | `inventory.warehouses.id` | - | 출고 창고, 삭제 시 미지정 상태 허용 | E-002, E-004 |
| 6 | `option_code` | `varchar(32)` | NO | `''::character varying` | NO | - | `uq_order_items_order_product_option` 구성 | 상품 선택 옵션 코드 | E-001 |
| 7 | `quantity` | `integer` | NO | `1` | NO | - | `quantity > 0` | 주문 수량 | E-001 |
| 8 | `unit_price` | `numeric(12,2)` | NO | - | NO | - | `unit_price >= 0` | 주문 시점 단가 | E-001 |
| 9 | `status` | `text` | NO | `'PENDING'::text` | NO | - | `status IN ('PENDING', 'ALLOCATED', 'SHIPPED', 'CANCELLED')` | 주문 항목 처리 상태 | E-002 |
| 10 | `created_at` | `timestamptz` | NO | `now()` | NO | - | - | 생성 시각 | E-001 |
| 11 | `updated_at` | `timestamptz` | NO | `now()` | NO | - | - | 최초 값만 DB default로 설정되며 자동 갱신 근거는 없음 | E-001, E-002 |
| 12 | `deleted_at` | `timestamptz` | YES | - | NO | - | - | migration 주석으로 확인된 soft-delete 시각 | E-002 |

## 4. 제약조건

| 이름 | 종류 | 컬럼 | 참조 대상 / 식 | ON UPDATE | ON DELETE | 근거 |
| --- | --- | --- | --- | --- | --- | --- |
| `ck_order_items_quantity_positive` | `CHECK` | `quantity` | `quantity > 0` | - | - | E-001 |
| `ck_order_items_status` | `CHECK` | `status` | `status IN ('PENDING', 'ALLOCATED', 'SHIPPED', 'CANCELLED')` | - | - | E-002 |
| `ck_order_items_unit_price_nonnegative` | `CHECK` | `unit_price` | `unit_price >= 0` | - | - | E-001 |
| `fk_order_items_order` | `FK` | `tenant_id, order_id` | `commerce.orders(tenant_id, id)` | `NO ACTION` | `CASCADE` | E-001 |
| `fk_order_items_product` | `FK` | `tenant_id, product_id` | `catalog.products(tenant_id, id)` | `NO ACTION` | `RESTRICT` | E-001 |
| `fk_order_items_warehouse` | `FK` | `warehouse_id` | `inventory.warehouses(id)` | `NO ACTION` | `SET NULL` | E-002 |
| `pk_order_items` | `PK` | `tenant_id, id` | - | - | - | E-001 |
| `uq_order_items_order_product_option` | `UNIQUE` | `tenant_id, order_id, product_id, option_code` | - | - | - | E-001 |

## 5. 인덱스

| 이름 | 방식 | 키 컬럼 / 표현식 | 정렬 | UNIQUE | INCLUDE | Predicate | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `idx_order_items_order_active` | `btree` | `tenant_id, order_id, created_at` | `ASC, ASC, DESC` | NO | `status, quantity` | `deleted_at IS NULL` | E-003 |
| `pk_order_items` | `btree` | `tenant_id, id` | `ASC, ASC` | YES | - | - | E-001 |
| `uq_order_items_order_product_option` | `btree` | `tenant_id, order_id, product_id, option_code` | `ASC, ASC, ASC, ASC` | YES | - | - | E-001 |

- `pk_order_items`와 `uq_order_items_order_product_option`은 각 constraint의 backing index다.
- `idx_order_items_order_active`는 soft-delete되지 않은 주문 항목만 대상으로 하는 partial index다.

## 6. 관계

### Outbound

| 대상 | Cardinality | 로컬 FK | 참조 컬럼 | Constraint | ON UPDATE | ON DELETE | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `commerce.orders` | `N:1` | `tenant_id, order_id` | `tenant_id, id` | `fk_order_items_order` | `NO ACTION` | `CASCADE` | E-001 |
| `catalog.products` | `N:1` | `tenant_id, product_id` | `tenant_id, id` | `fk_order_items_product` | `NO ACTION` | `RESTRICT` | E-001 |
| `inventory.warehouses` | `0..1:1` | `warehouse_id` | `id` | `fk_order_items_warehouse` | `NO ACTION` | `SET NULL` | E-002 |

### Inbound

| 대상 | Cardinality | 상대 FK | 현재 참조 컬럼 | Constraint | ON UPDATE | ON DELETE | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `fulfillment.shipment_items` | `1:0..N` | `tenant_id, order_item_id` | `tenant_id, id` | `fk_shipment_items_order_item` | `NO ACTION` | `RESTRICT` | E-005 |

## 7. 데이터 수명주기

- 생성 시각: `created_at DEFAULT now()`.
- 수정 시각: `updated_at DEFAULT now()`이나 확인한 migration에 trigger/generated 갱신 규칙은 없다.
- Soft delete: migration 주석에서 `deleted_at`이 soft-delete 시각으로 선언된다. active row 판정 규칙은 미확인이다.
- Version / locking: 미확인.
- Partition / retention: migration에서 확인된 규칙 없음.

## 8. 스키마 소스 매핑

| 역할 | 저장소 경로 / Symbol | 확인 내용 | 근거 상태 | 근거 |
| --- | --- | --- | --- | --- |
| migration | `db/migrations/202607101015_create_order_items.sql#create_order_items` | 기본 컬럼, PK, 복합 UNIQUE, 주문·상품 FK와 CHECK를 생성한다. | primary | E-001 |
| migration | `db/migrations/202607121130_add_order_item_allocation.sql#warehouse_and_status` | nullable `warehouse_id`, 상태 CHECK와 partial index를 추가한다. | primary | E-002, E-003 |
| schema snapshot / DDL | `db/structure.sql#commerce.order_items` | migration의 최종 컬럼과 constraint를 동일하게 반영한다. | supporting | E-006 |
| ORM | `apps/api/src/modules/orders/order-item.entity.ts#OrderItemEntity` | `warehouseId`를 required로 선언해 migration과 다르다. | conflict | E-004 |

## 9. 불일치와 미확인 항목

| 대상 | Canonical 물리 근거 | 불일치 근거 | 채택한 물리 값 | 영향 | 근거 |
| --- | --- | --- | --- | --- | --- |
| `warehouse_id` nullability | migration이 `uuid NULL`과 `ON DELETE SET NULL`을 선언한다. | ORM `OrderItemEntity.warehouseId`가 required 속성이다. | nullable `uuid` | ORM 선언과 물리 스키마의 nullability가 다르다. | E-002, E-004 |
| `idx_order_items_status` | migration에 해당 index가 없다. | ORM decorator가 `status` 단일 index를 선언한다. | 물리 index 없음 | ORM 선언과 물리 인덱스가 다르다. | E-001, E-002, E-004 |

- 미확인: retention 기간과 optimistic locking 방식.
- 추론: 없음. 목적과 도메인은 migration 주석으로 확인했다.

## 10. 근거 목록

| ID | 종류 | Source revision | 저장소 상대 경로 / 식별자 | 확인한 사실 |
| --- | --- | --- | --- | --- |
| E-001 | `migration` | `example-revision-7f3c2a1` | `db/migrations/202607101015_create_order_items.sql#create_order_items` | table, ordered composite PK, ordered composite UNIQUE, 주문·상품 composite FK와 기본 CHECK를 생성한다. |
| E-002 | `migration` | `example-revision-7f3c2a1` | `db/migrations/202607121130_add_order_item_allocation.sql#warehouse_and_status` | nullable 창고 FK, status, soft-delete와 status CHECK를 추가한다. |
| E-003 | `migration` | `example-revision-7f3c2a1` | `db/migrations/202607121130_add_order_item_allocation.sql#idx_order_items_order_active` | `deleted_at IS NULL` partial index와 INCLUDE 컬럼을 생성한다. |
| E-004 | `ORM` | `example-revision-7f3c2a1` | `apps/api/src/modules/orders/order-item.entity.ts#OrderItemEntity` | warehouse nullability와 status index 선언이 migration과 다르다. |
| E-005 | `migration` | `example-revision-7f3c2a1` | `db/migrations/202607151000_create_shipment_items.sql#fk_shipment_items_order_item` | shipment item의 `(tenant_id, order_item_id)`에서 order item의 `(tenant_id, id)`로 향하는 ordered composite inbound FK를 생성한다. |
| E-006 | `schema` | `example-revision-7f3c2a1` | `db/structure.sql#commerce.order_items` | migration 최종 상태와 동일한 table 구조를 포함한다. |

## 11. 검증 체크리스트

- [x] source revision과 migration 순서가 기록되어 있다.
- [x] migration 기준 모든 컬럼이 ordinal 순서로 한 번씩 기록되어 있다.
- [x] PK, UNIQUE, FK와 CHECK constraint가 빠짐없이 기록되어 있다.
- [x] 모든 index의 키 순서, 정렬, unique, include와 predicate가 기록되어 있다.
- [x] FK의 outbound/inbound 설명이 같은 constraint와 action을 가리킨다.
- [x] ORM 불일치가 migration 값과 분리되어 있다.
- [x] 실제 row, sample data, 개인정보, credential과 connection string이 없다.
- [x] 확인하지 못한 내용을 추측하지 않고 `미확인`으로 표시했다.
