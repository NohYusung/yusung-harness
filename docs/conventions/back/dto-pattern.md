# vogopang_back DTO 적용 규칙

이 문서는 `vogopang_back` 에서 DTO 구조를 일관되게 적용하기 위한 기준 문서다.

## 1. 기본 원칙

- 새로운 endpoint를 만들면 body/query/param DTO를 먼저 만든다.
- DTO는 입력 형식 검증 전용 계층으로 본다.
- 비즈니스 규칙 검증은 DTO가 아니라 service 또는 `domain/validators`에서 처리한다.

## 2. 위치 규칙

- DTO는 아래 위치를 기본으로 쓴다.

```text
src/services/<domain>/controllers/dto/*.dto.ts
src/services/<domain>/controllers/dto/index.ts   ← barrel export 필수
```

- `index.ts`에서 모든 DTO를 re-export한다.

```typescript
// controllers/dto/index.ts
export * from './notice-create.dto';
export * from './notice-query.dto';
export * from './notice-update.dto';
export * from './notice-response.dto';
```

- 컨트롤러에서는 barrel import를 사용한다.

```typescript
import { AdminNoticeQueryDto, AdminNoticeCreateDto } from './dto';
```

- 파일명은 `<도메인>-<용도>.dto.ts` 형식으로 성격을 드러낸다.

### 파일명 규칙 — 한 파일에 admin/general 클래스를 함께 정의

**핵심 원칙:**
- **DTO 파일은 용도(create/update/query/response)별로 1개만 만든다.**
- **`admin-` 접두어 파일, `general-` 접두어 파일을 만들지 않는다.**
- admin/general 클래스가 다르면 **한 파일 안에 두 클래스를 함께 정의**한다.
- admin만 쓰는 독립 기능(예: 답변)은 별도 파일로 분리한다 (`inquiry-answer.dto.ts`).

| 용도 | 파일명 | 내부 클래스 |
|------|--------|------------|
| 생성 | `inquiry-create.dto.ts` | `InquiryCreateDto` (공유) 또는 `AdminInquiryCreateDto` + `InquiryCreateDto` |
| 수정 | `inquiry-update.dto.ts` | `InquiryUpdateDto` (공유) 또는 `AdminInquiryUpdateDto` + `InquiryUpdateDto` |
| 조회 | `inquiry-query.dto.ts` | `AdminInquiryQueryDto` + `GeneralInquiryQueryDto` |
| 응답 | `inquiry-response.dto.ts` | `InquiryResponseDto` (공유) |
| admin 전용 기능 | `inquiry-answer.dto.ts` | `InquiryAnswerDto` |

### 파일 내부 구조 — admin/general 필드가 다를 때

```typescript
// inquiry-create.dto.ts
import { IsNotEmpty, IsOptional, IsString, IsEnum } from 'class-validator';
import { InquiryStatus } from '../../domain/inquiry.entity';

// general이 사용하는 기본 DTO (접두어 없음)
export class InquiryCreateDto {
    @IsString()
    @IsNotEmpty()
    title!: string;

    @IsString()
    @IsNotEmpty()
    content!: string;
}

// admin이 사용하는 확장 DTO
export class AdminInquiryCreateDto {
    @IsString()
    @IsNotEmpty()
    title!: string;

    @IsString()
    @IsNotEmpty()
    content!: string;

    @IsEnum(InquiryStatus)
    @IsOptional()
    status?: InquiryStatus;

    @IsString()
    @IsOptional()
    answer?: string;
}
```

### 파일 내부 구조 — admin/general 필드가 같을 때

```typescript
// notice-create.dto.ts — 클래스 1개만 (접두어 없음)
export class NoticeCreateDto {
    @IsString()
    @IsNotEmpty()
    title!: string;

    @IsString()
    @IsNotEmpty()
    content!: string;
}
```

### 예시 — 도메인별 DTO 폴더 구성

```text
# inquiry
inquiry-create.dto.ts   ← InquiryCreateDto + AdminInquiryCreateDto
inquiry-update.dto.ts   ← InquiryUpdateDto + AdminInquiryUpdateDto
inquiry-query.dto.ts    ← GeneralInquiryQueryDto + AdminInquiryQueryDto
inquiry-answer.dto.ts   ← InquiryAnswerDto (admin 전용 독립 기능)
inquiry-response.dto.ts ← InquiryResponseDto (공유)
index.ts

# notice
notice-create.dto.ts    ← NoticeCreateDto (admin-only이면 AdminNoticeCreateDto)
notice-update.dto.ts    ← NoticeUpdateDto (admin-only이면 AdminNoticeUpdateDto)
notice-query.dto.ts     ← AdminNoticeQueryDto + GeneralNoticeQueryDto
notice-response.dto.ts  ← NoticeResponseDto (공유)
index.ts
```

## 3. 클래스명 규칙

- DTO 클래스명은 `<역할><도메인><용도>Dto` 형식으로 짓는다.
- admin/general 분리 시 클래스명에 접두어를 붙인다.
  - `AdminInquiryCreateDto`, `AdminInquiryQueryDto`
  - `GeneralInquiryQueryDto`
- 공유 DTO는 접두어 없이 도메인명만 쓴다.
  - `InquiryCreateDto`, `InquiryUpdateDto`, `NoticeResponseDto`

## 4. validator 사용 규칙

- 각 필드에는 `class-validator` 데코레이터를 붙인다.
- 기본 사용 패턴:
  - 문자열: `@IsString()`
  - 필수값: `@IsNotEmpty()`
  - 숫자: `@IsNumber()`
  - enum: `@IsEnum()`
  - 선택값: `@IsOptional()`
  - 배열: `@IsArray()`
- 데코레이터에 커스텀 message를 넣는 것은 예외로 본다.
  - 기본 메시지로 부족할 때만 사용한다.

## 5. transform 사용 규칙

- query string으로 들어오는 숫자는 `@Type(() => Number)`를 같이 쓴다.
- boolean query는 필요하면 `@Transform()`으로 `'true'/'false'`를 boolean으로 바꾼다.
- nested DTO는 아래 패턴을 따른다.
  - `@ValidateNested({ each: true })`
  - `@Type(() => ChildDto)`

## 6. Query DTO — PaginationDto 상속 패턴 (필수)

- **모든 Query DTO는 `PaginationDto`를 상속**해야 한다.
- `PaginationDto`는 `@common/types`에 정의되어 있다 (`src/common/types.ts`).
- `PaginationDto`가 제공하는 필드: `page?`, `limit?`, `sort?`, `order?`
- 컨트롤러에서 `PaginationOptions` 또는 `PaginationDto`를 직접 `@Query()` 타입으로 쓰지 않는다.
- **반드시 도메인별 Query DTO 클래스를 만들어 상속**한다.

### 기본 패턴

```typescript
// notice-query.dto.ts
import { PaginationDto } from '@common/types';
import { IsOptional, IsString } from 'class-validator';

export class AdminNoticeQueryDto extends PaginationDto {
    @IsString()
    @IsOptional()
    search?: string;
}
```

### admin/general 분리 시

```typescript
// notice-query.dto.ts
import { PaginationDto } from '@common/types';

class BaseNoticeQueryDto extends PaginationDto {}

export class AdminNoticeQueryDto extends BaseNoticeQueryDto {
    @IsString()
    @IsOptional()
    search?: string;
}

export class GeneralNoticeQueryDto extends BaseNoticeQueryDto {
    @IsString()
    @IsOptional()
    search?: string;
}
```

### 컨트롤러 사용 패턴 — destructuring 분리

```typescript
@Get()
async list(@Query() query: AdminNoticeQueryDto) {
    // 도메인 필터와 pagination을 destructuring으로 분리
    const { search, ...options } = query;
    const data = await this.adminNoticeService.list({ search }, options);
    return { data };
}
```

- `...options`에 `page`, `limit`, `sort`, `order`가 담긴다.
- 도메인 고유 필드만 명시적으로 꺼낸다.
- 배열 기반 enum/ID 필터는 복수형 이름을 사용한다.
  - 예: `types?: InquiryType[]`, `statuses?: InquiryStatus[]`, `seriesIds?: number[]`
- 배열 query는 `@IsArray()`와 `@Transform()`으로 단건/복수 입력을 모두 배열로 정규화한다.

## 7. 대표 패턴 요약

| DTO 종류 | 상속 | 핵심 데코레이터 |
|----------|------|----------------|
| Create DTO | 없음 | `@IsNotEmpty()`, `@IsString()` 등 |
| Query DTO | **`PaginationDto` 필수 상속** | `@IsOptional()` 위주 |
| Update DTO | 없음 | 모든 필드 `@IsOptional()` |
| Response DTO | 없음 | `@Exclude()` 클래스 + `@Expose()` 필드 |
| Nested DTO | 없음 | `@ValidateNested` + `@Type` |

## 8. Response DTO 패턴

응답이 단순하면(엔티티 필드를 그대로 반환) Response DTO 없이 반환해도 된다.
**아래 조건 중 하나라도 해당하면 Response DTO를 작성**한다.

- 엔티티 필드 중 일부만 노출해야 할 때 (비밀번호, 내부 상태값 제외 등)
- 관계(relation)가 깊어서 응답 depth가 2단계 이상일 때
- admin/general에 따라 노출 필드가 다를 때
- 엔티티에 없는 계산 필드(예: `isWishlist`, `totalCount`)를 추가해야 할 때

### 8-1. 파일 위치 및 명명

```text
src/services/<domain>/controllers/dto/<domain>-response.dto.ts
```

- 하나의 파일에 해당 도메인의 여러 Response DTO를 함께 정의할 수 있다.
- `index.ts`에서 barrel export한다.

### 8-2. 기본 구조 — `@Exclude()` / `@Expose()` 패턴

```typescript
// notice-response.dto.ts
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class NoticeResponseDto {
    @Expose()
    id!: number;

    @Expose()
    title!: string;

    @Expose()
    type!: NoticeType;

    @Expose()
    createdAt!: Date;
}
```

- 클래스에 `@Exclude()`를 붙여서 모든 필드를 기본 비노출.
- 응답에 포함할 필드만 `@Expose()`를 붙인다.

### 8-3. 중첩 객체 — `@Type()` 사용

관계 엔티티가 포함된 응답은 중첩 DTO를 만들고 `@Type()`으로 변환을 지정한다.

```typescript
import { Exclude, Expose, Type } from 'class-transformer';

@Exclude()
class AdminSummaryDto {
    @Expose()
    id!: number;

    @Expose()
    name!: string;
}

@Exclude()
export class NoticeDetailResponseDto {
    @Expose()
    id!: number;

    @Expose()
    title!: string;

    @Expose()
    content!: string;

    @Expose()
    @Type(() => AdminSummaryDto)
    admin!: AdminSummaryDto;
}
```

### 8-4. admin/general 응답 분리

같은 엔티티라도 역할에 따라 노출 범위가 다르면 DTO를 나눈다.

```typescript
@Exclude()
export class NoticeResponseDto {
    @Expose()
    id!: number;

    @Expose()
    title!: string;
}

// 관리자용 — 더 많은 필드 노출
@Exclude()
export class AdminNoticeResponseDto extends NoticeResponseDto {
    @Expose()
    type!: NoticeType;

    @Expose()
    createdAt!: Date;

    @Expose()
    updatedAt!: Date;
}
```

### 8-5. 서비스에서 사용 — `toInstance()` 패턴

엔티티(DddAggregate)의 `toInstance()` 메서드를 사용하여 변환한다.

```typescript
// 단건 반환
async retrieve({ id }: { id: number }) {
    const [notice] = await this.noticeRepository.find({ id });
    if (!notice) {
        throw new NotFoundException('공지사항을 찾을 수 없습니다.');
    }
    return notice.toInstance(NoticeResponseDto);
}

// 목록 반환
async list({ search }: { search?: string }, options?: PaginationOptions) {
    const [notices, total] = await Promise.all([
        this.noticeRepository.find({ search }, options),
        this.noticeRepository.count({ search }),
    ]);
    return {
        items: notices.map((notice) => notice.toInstance(NoticeResponseDto)),
        total,
    };
}
```

### 8-6. 추가 필드 병합

엔티티에 없는 동적 값을 함께 반환할 때는 spread로 합친다.

```typescript
return {
    ...series.toInstance(GeneralSeriesResponseDto),
    isWishlist,
};
```

### 8-6-1. Response DTO 처리 선호 패턴

- **가능하면 root 엔티티 응답은 `entity.toInstance(ResponseDto)`를 우선 사용한다.**
- 계산 필드, 집계 필드, 동적 필드는 **service 레이어에서 계산한 뒤 spread로 병합**한다.
- 관계 하위 항목은 아래 둘 중 하나를 사용한다.
  - 관련 엔티티의 `toInstance(ResponseDto)`
  - service 내부 plain mapper 함수
- `plainToInstance()`는 **엔티티 기준 변환으로 표현하기 어려운 예외적 경우에만** 사용한다.

```typescript
const items = notice.comments.map((comment) => ({
    ...comment.toInstance(CommentResponseDto),
    isMine: comment.userId === user?.id,
}));

return {
    ...notice.toInstance(NoticeResponseDto),
    commentCount: items.length,
    items,
};
```

### 8-7. Response DTO 적용 판단 기준

| 상황 | Response DTO |
|------|-------------|
| 엔티티 필드 전부 반환 (단순 CRUD) | 불필요 — 엔티티 그대로 반환 |
| 민감 필드 제외 필요 | **필요** |
| relation depth ≥ 2 | **필요** (`@Type()` 사용) |
| admin/general 노출 필드 차이 | **필요** (DTO 분리) |
| 계산 필드 추가 | **필요** (spread 병합) |

## 9. 공통 DTO 규칙

- `PaginationDto`, `OrderType` 등 공통 타입은 `src/common/types.ts`에 정의되어 있다.
- 도메인마다 pagination 필드를 중복 선언하지 않는다 → `PaginationDto`를 상속한다.
- 공통 enum이 반복되면 `src/common/types.ts`로 올린다.

## 10. 전역 파이프 연동 규칙

- DTO는 전역 `requesterValidatorPipe`와 함께 동작한다.
- 관련 파일:
  - `src/libs/pipes/requester-validator.pipe.ts`
  - `src/main.ts`
- 공통 validation message를 늘려야 하면 가능하면 pipe의 `errorMessages` 맵에 추가한다.

## 11. 적용 체크리스트

- endpoint 입력이 있으면 DTO부터 만든다.
- DTO는 `controllers/dto`에 둔다.
- 숫자 query/body는 `@Type(() => Number)`를 검토한다.
- boolean query는 필요 시 `@Transform()`을 쓴다.
- nested payload면 `@ValidateNested` + `@Type`을 쓴다.
- 공통 타입이 반복되면 `레포에서 선택한 공통 타입 파일`로 올린다.
- controller는 DTO를 받고, 비즈니스 규칙 검증은 service 또는 domain validator로 넘긴다.

## 12. 주의사항

- DTO는 입력 형식을 검증하는 계층이다.
- 리소스 존재 여부, 공개 상태, 권한, 접근 가능성 같은 조건은 DTO에 넣지 않는다.
- 그런 규칙이 반복되면 `./validator-pattern.md`에 따라 `domain/validators` 계층으로 분리한다.
