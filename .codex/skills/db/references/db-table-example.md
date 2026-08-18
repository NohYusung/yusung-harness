# DBTableDoc/2.0 가상 예시

이 문서는 형식 검증을 위한 완전한 가상 PostgreSQL 사례다. revision, 테이블과 제약조건은 실제 프로젝트나 운영 데이터가 아니다. 실제 row, sample data, 개인정보, credential과 connection string을 포함하지 않는다.

## 목차

- [가상 테이블 문서](#commerceorder_items)
- [컬럼과 제약조건](#3-컬럼)
- [인덱스와 관계](#5-인덱스)
- [데이터 수명주기](#7-데이터-수명주기)
- [불일치와 미확인](#8-불일치와-미확인-항목)

# commerce.order_items

- 문서 계약: `DBTableDoc/2.0`
- 정규 title: `order_items`
- 분석 기준: `example-monorepo@example-revision-7f3c2a1`
- 데이터베이스 엔진: `PostgreSQL 16`
- Database / Schema / Table: `shop` / `commerce` / `order_items`
- 근거 상태: `conflict`

## 1. 역할

- 목적: 주문에 포함된 상품, 선택 옵션, 수량과 주문 당시 단가를 저장한다.
- 소유 도메인: `orders`
- 객체 종류: `physical table`

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

| 순서 | 컬럼 | 물리 타입 | Null | Default / Generated | PK | FK 대상 | UNIQUE / CHECK | 설명 |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `tenant_id` | `uuid` | NO | - | YES | `복합 FK 2건: 4절 참조` | `uq_order_items_order_product_option` 구성 | tenant 식별자이자 composite PK 첫 번째 컬럼 |
| 2 | `id` | `uuid` | NO | `gen_random_uuid()` | YES | - | - | composite PK 두 번째 컬럼인 주문 항목 식별자 |
| 3 | `order_id` | `uuid` | NO | - | NO | `commerce.orders.id` | `uq_order_items_order_product_option` 구성 | 소속 주문 |
| 4 | `product_id` | `uuid` | NO | - | NO | `catalog.products.id` | `uq_order_items_order_product_option` 구성 | 주문 당시 선택 상품 |
| 5 | `warehouse_id` | `uuid` | YES | - | NO | `inventory.warehouses.id` | - | 출고 창고, 삭제 시 미지정 상태 허용 |
| 6 | `option_code` | `varchar(32)` | NO | `''::character varying` | NO | - | `uq_order_items_order_product_option` 구성 | 상품 선택 옵션 코드 |
| 7 | `quantity` | `integer` | NO | `1` | NO | - | `quantity > 0` | 주문 수량 |
| 8 | `unit_price` | `numeric(12,2)` | NO | - | NO | - | `unit_price >= 0` | 주문 시점 단가 |
| 9 | `status` | `text` | NO | `'PENDING'::text` | NO | - | `status IN ('PENDING', 'ALLOCATED', 'SHIPPED', 'CANCELLED')` | 주문 항목 처리 상태 |
| 10 | `created_at` | `timestamptz` | NO | `now()` | NO | - | - | 생성 시각 |
| 11 | `updated_at` | `timestamptz` | NO | `now()` | NO | - | - | 최초 값만 DB default로 설정되며 자동 갱신 규칙은 확인되지 않음 |
| 12 | `deleted_at` | `timestamptz` | YES | - | NO | - | - | migration 주석으로 확인된 soft-delete 시각 |

## 4. 제약조건

| 이름 | 종류 | 컬럼 | 참조 대상 / 식 | ON UPDATE | ON DELETE |
| --- | --- | --- | --- | --- | --- |
| `ck_order_items_quantity_positive` | `CHECK` | `quantity` | `quantity > 0` | - | - |
| `ck_order_items_status` | `CHECK` | `status` | `status IN ('PENDING', 'ALLOCATED', 'SHIPPED', 'CANCELLED')` | - | - |
| `ck_order_items_unit_price_nonnegative` | `CHECK` | `unit_price` | `unit_price >= 0` | - | - |
| `fk_order_items_order` | `FK` | `tenant_id, order_id` | `commerce.orders(tenant_id, id)` | `NO ACTION` | `CASCADE` |
| `fk_order_items_product` | `FK` | `tenant_id, product_id` | `catalog.products(tenant_id, id)` | `NO ACTION` | `RESTRICT` |
| `fk_order_items_warehouse` | `FK` | `warehouse_id` | `inventory.warehouses(id)` | `NO ACTION` | `SET NULL` |
| `pk_order_items` | `PK` | `tenant_id, id` | - | - | - |
| `uq_order_items_order_product_option` | `UNIQUE` | `tenant_id, order_id, product_id, option_code` | - | - | - |

## 5. 인덱스

| 이름 | 방식 | 키 컬럼 / 표현식 | 정렬 | UNIQUE | INCLUDE | Predicate |
| --- | --- | --- | --- | --- | --- | --- |
| `idx_order_items_order_active` | `btree` | `tenant_id, order_id, created_at` | `ASC, ASC, DESC` | NO | `status, quantity` | `deleted_at IS NULL` |
| `pk_order_items` | `btree` | `tenant_id, id` | `ASC, ASC` | YES | - | - |
| `uq_order_items_order_product_option` | `btree` | `tenant_id, order_id, product_id, option_code` | `ASC, ASC, ASC, ASC` | YES | - | - |

- `pk_order_items`와 `uq_order_items_order_product_option`은 각 constraint의 backing index다.
- `idx_order_items_order_active`는 soft-delete되지 않은 주문 항목만 대상으로 하는 partial index다.

## 6. 관계

### Outbound

| 대상 | Cardinality | 로컬 FK | 참조 컬럼 | Constraint | ON UPDATE | ON DELETE |
| --- | --- | --- | --- | --- | --- | --- |
| `commerce.orders` | `N:1` | `tenant_id, order_id` | `tenant_id, id` | `fk_order_items_order` | `NO ACTION` | `CASCADE` |
| `catalog.products` | `N:1` | `tenant_id, product_id` | `tenant_id, id` | `fk_order_items_product` | `NO ACTION` | `RESTRICT` |
| `inventory.warehouses` | `0..1:1` | `warehouse_id` | `id` | `fk_order_items_warehouse` | `NO ACTION` | `SET NULL` |

### Inbound

| 대상 | Cardinality | 상대 FK | 현재 참조 컬럼 | Constraint | ON UPDATE | ON DELETE |
| --- | --- | --- | --- | --- | --- | --- |
| `fulfillment.shipment_items` | `1:0..N` | `tenant_id, order_item_id` | `tenant_id, id` | `fk_shipment_items_order_item` | `NO ACTION` | `RESTRICT` |

## 7. 데이터 수명주기

```text
[CREATE]
  timestamp/default: created_at DEFAULT now()
   |
   v
[ACTIVE]
  row rule: 미확인
   |
   +--> UPDATE
   |      timestamp/mechanism: updated_at DEFAULT now(); 자동 갱신 규칙 미확인
   |
   +--> LOCK
   |      column/mechanism: 미확인
   |
   `--> DELETE
          |
          +--> soft delete column: deleted_at
          |       |
          |       `--> [SOFT DELETED]
          |              column/rule: deleted_at; active row 판정 규칙 미확인
          |
          `--> hard delete rule: 미확인

[RETENTION / PARTITION]
  rule: 미확인
```

## 8. 불일치와 미확인 항목

| 대상 | Canonical 물리 근거 | 불일치 근거 | 채택한 물리 값 | 영향 |
| --- | --- | --- | --- | --- |
| `warehouse_id` nullability | migration이 `uuid NULL`과 `ON DELETE SET NULL`을 선언한다. | ORM이 동일 필드를 required로 선언한다. | nullable `uuid` | ORM 선언과 물리 스키마의 nullability가 다르다. |
| `idx_order_items_status` | migration에 해당 index가 없다. | ORM decorator가 `status` 단일 index를 선언한다. | 물리 index 없음 | ORM 선언과 물리 인덱스가 다르다. |

- 미확인: retention 기간과 optimistic locking 방식.
- 추론: 없음. 목적과 도메인은 migration 주석으로 확인했다.
