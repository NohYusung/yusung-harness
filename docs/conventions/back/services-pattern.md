# vogopang_back services 폴더 규칙

이 문서는 `src/services` 폴더의 구조와 실제 코드 패턴을 기준으로 추출한 규칙이다.
모듈 생성 절차와 체크리스트는 `./module-generation.md`를 참고한다. 이 문서는 실제 코드 수준의 컨벤션에 집중한다.

> **참고**: 도메인 설계 시 비즈니스 맥락은 `context/` 폴더를 참조한다.

## 1. 폴더 구조

### 1-1. admin 전용 도메인 (예: `admin/`)

```text
src/services/
  admins.ts                             # 시스템 관리자 모듈 그룹 (default export 배열)
  clients.ts                            # 사서(도서관 관리자) 모듈 그룹 (default export 배열)
  generals.ts                           # 이용자 모듈 그룹 (default export 배열)
  admin/
    admin.module.ts                     # NestJS 모듈
    applications/
      admin.service.ts                  # use case 서비스
    controllers/
      admin.controller.ts              # HTTP 컨트롤러
    domain/
      admin.entity.ts                   # TypeORM 엔티티 (DddAggregate 상속)
    repository/
      admin.repository.ts              # 데이터 접근 (DddRepository 상속)
```

### 1-2. 복수 타입 도메인 (예: `inquiry/` — admin + client + general)

하나의 도메인이 여러 타입에서 사용되면, **모듈·컨트롤러·서비스를 타입별로 분리**하되 **엔티티·리포지토리는 공유**한다.
모든 도메인이 반드시 3개 타입을 가져야 하는 것은 아니다. 필요한 타입만 만든다.

```text
src/services/inquiry/
  admin-inquiry.module.ts               # 시스템 관리자 전용 모듈
  client-inquiry.module.ts              # 사서(도서관 관리자) 전용 모듈
  general-inquiry.module.ts             # 이용자 전용 모듈
  applications/
    admin-inquiry.service.ts            # 시스템 관리자 전용 서비스
    client-inquiry.service.ts           # 사서 전용 서비스
    general-inquiry.service.ts          # 이용자 전용 서비스
    inquiry.service.ts                  # (선택) 공유 로직, 이벤트 핸들러
  controllers/
    admin-inquiry.controller.ts         # @Controller('admins/inquiries')
    client-inquiry.controller.ts        # @Controller('clients/inquiries')
    general-inquiry.controller.ts       # @Controller('inquiries')
    dto/                                # DTO (타입별 또는 공용)
  domain/
    inquiry.entity.ts                   # 공유 엔티티
    validators/                         # 공유 검증 로직
  repository/
    inquiry.repository.ts               # 공유 리포지토리
```

### 1-3. 단일 타입 전용 도메인

특정 타입만 필요한 경우, 해당 타입의 모듈·서비스·컨트롤러만 만든다.
구조는 1-2에서 불필요한 타입의 파일을 생략한 형태와 동일하다.

## 2. 모듈 그룹 파일 규칙

- `src/services` 루트에 `admins.ts`, `clients.ts`, `generals.ts` **그룹 파일**을 둔다.
- 그룹 파일은 모듈 배열을 **default export** 한다.
- `app.module.ts`에서 spread로 등록한다.

```ts
// src/services/admins.ts — 시스템 관리자
import { AdminModule } from './admin/admin.module';
export default [AdminModule];

// src/services/clients.ts — 사서(도서관 관리자)
export default [];

// src/services/generals.ts — 이용자
export default [];

// src/app.module.ts
import adminsModule from './services/admins';
import clientsModule from './services/clients';
import generalsModule from './services/generals';
imports: [...adminsModule, ...clientsModule, ...generalsModule],
```

**규칙**:
- 시스템 관리자 모듈(`Admin*Module`)은 `admins.ts`에 등록한다.
- 사서 모듈(`Client*Module`)은 `clients.ts`에 등록한다.
- 이용자 모듈(`General*Module`)은 `generals.ts`에 등록한다.
- 하나의 도메인이 여러 타입에 필요하면, 각 타입의 모듈을 해당 그룹 파일에 **각각** 등록한다.
- 같은 `*Module`을 여러 그룹 파일에 중복 등록하지 않는다 (NestJS 중복 등록 경고 방지).
- Swagger 문서 생성도 이 그룹 파일 단위로 분리된다.

## 3. 도메인 모듈 내부 구조 규칙

### 3-1. 단일 타입 도메인 (admin 전용 또는 general 전용)

```text
<domain>/
  <domain>.module.ts        # 모듈 정의
  applications/             # use case 서비스
    <domain>.service.ts
  controllers/              # HTTP 컨트롤러
    <domain>.controller.ts
  domain/                   # 엔티티, 도메인 로직
    <domain>.entity.ts
  repository/               # 데이터 접근
    <domain>.repository.ts
```

### 3-2. 복수 타입 도메인 (admin / client / general)

```text
<domain>/
  admin-<domain>.module.ts          # 시스템 관리자 모듈
  client-<domain>.module.ts         # 사서 모듈
  general-<domain>.module.ts        # 이용자 모듈
  applications/
    admin-<domain>.service.ts       # 시스템 관리자 서비스
    client-<domain>.service.ts      # 사서 서비스
    general-<domain>.service.ts     # 이용자 서비스
    <domain>.service.ts             # (선택) 공유 로직, 이벤트 핸들러
  controllers/
    admin-<domain>.controller.ts    # @Controller('admins/<domain>')
    client-<domain>.controller.ts   # @Controller('clients/<domain>')
    general-<domain>.controller.ts  # @Controller('<domain>')
  domain/
    <domain>.entity.ts              # 공유 엔티티
  repository/
    <domain>.repository.ts          # 공유 리포지토리
```

**핵심 규칙**:
- 엔티티와 리포지토리는 **1개만** 만들고 모든 타입의 모듈에서 공유한다.
- 모듈·컨트롤러·서비스는 타입별(admin/client/general)로 **분리**한다.
- 각 모듈은 공유 리포지토리를 providers에 넣고 exports로 내보낸다.
- 모든 도메인이 3개 타입을 가져야 하는 것은 아니다. 필요한 타입만 만든다.

필요에 따라 추가 가능한 폴더:
- `controllers/dto/` — 요청/응답 DTO (`./dto-pattern.md` 참고)
- `domain/validators/` — 비즈니스 규칙 검증 (`./validator-pattern.md` 참고)

## 4. 모듈 파일 패턴

### 4-1. 단일 타입 모듈 (`<domain>.module.ts`)

```ts
@Module({
    controllers: [AdminController],
    providers: [AdminRepository, AdminService],
    exports: [AdminRepository, AdminService],
})
export class AdminModule {}
```

### 4-2. 복수 타입 분리 모듈

```ts
// admin-inquiry.module.ts
@Module({
    controllers: [AdminInquiryController],
    providers: [InquiryRepository, AdminInquiryService],
    exports: [InquiryRepository, AdminInquiryService],
})
export class AdminInquiryModule {}

// client-inquiry.module.ts
@Module({
    controllers: [ClientInquiryController],
    providers: [InquiryRepository, ClientInquiryService],
    exports: [InquiryRepository, ClientInquiryService],
})
export class ClientInquiryModule {}

// general-inquiry.module.ts
@Module({
    controllers: [GeneralInquiryController],
    providers: [InquiryRepository, GeneralInquiryService],
    exports: [InquiryRepository, GeneralInquiryService],
})
export class GeneralInquiryModule {}
```

**규칙**:
- `controllers`에 컨트롤러를 등록한다.
- `providers`와 `exports`에 Repository와 Service를 동시에 넣는다.
- `@Global()` 데코레이터를 붙이지 않는다 (비즈니스 모듈은 글로벌이 아님).
- import는 상대 경로로 모듈 내부 파일을 참조한다.
- 타입별 분리 시, **공유 리포지토리는 각 모듈의 providers에 각각 등록**한다.
- 같은 use case를 처리하는 컨트롤러 handler 메서드명과 application service 메서드명은 동일하게 맞춘다.
- 예: controller가 `answer()`를 호출하면 service도 `answer()`를 사용한다.

## 5. 엔티티 패턴 (`domain/<domain>.entity.ts`)

```ts
type Ctor = {
    email: string;
    password: string;
    sub?: string;
};

@Entity('admins')
export class Admin extends DddAggregate {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    email: string;

    @Column()
    password: string;

    @Column({ comment: '네이버웍스 고유 ID', nullable: true })
    sub?: string;

    constructor(args: Ctor) {
        super();
        if (args) {
            this.email = args.email;
            this.password = args.password;
            this.sub = args.sub;
        }
    }
}
```

**규칙**:
- `DddAggregate`를 상속한다 (createdAt, updatedAt, deletedAt, 이벤트 발행 자동 제공).
- `@Entity('<table_name>')` 으로 테이블명을 명시한다.
- 생성자는 `Ctor` 타입 객체를 받아 필드를 채운다.
- `Ctor` 타입은 엔티티 파일 상단에 `type`으로 정의한다 (interface가 아님).
- `constructor`에서 `if (args)` 가드를 넣는다 (TypeORM이 인자 없이 인스턴스를 생성하는 경우 대응).
- `super()`를 반드시 호출한다.
- `@Column()`의 `comment` 옵션으로 컬럼 설명을 한국어로 남긴다.
- 새 엔티티를 만들면 `src/databases/entities.ts` 배열에 등록해야 한다.

## 6. Repository 패턴 (`repository/<domain>.repository.ts`)

```ts
@Injectable()
export class AdminRepository extends DddRepository<Admin> {
    entityClass = Admin;

    async find(
        conditions: { id?: number; email?: string; sub?: string },
        options?: TypeormRelationOptions<Admin>
    ) {
        return this.entityManager.find(this.entityClass, {
            where: stripUndefined({
                id: conditions.id,
                email: conditions.email,
                sub: conditions.sub,
            }),
            ...convertOptions(options),
        });
    }

    async count(conditions: { id?: number; email?: string; sub?: string }) {
        return this.entityManager.count(this.entityClass, {
            where: stripUndefined({ ... }),
        });
    }
}
```

### 6-1. 교차 도메인 조회 규칙

- 다른 도메인의 정보를 참조해야 할 때는 **해당 도메인의 repository를 주입받고 그 repository의 `find(...)`를 사용**한다.
- 예: FAQ 서비스에서 고객사 정보를 확인해야 하면 `ClientRepository.find({ id: clientId })`를 호출한다.
- 다른 도메인 엔티티를 `entityManager`로 직접 조회하지 않는다.
- service 내부 helper로 우회하기보다, **어떤 repository의 `find(...)`를 통해 조회하는지가 코드에 드러나도록 유지**한다.

### 6-2. 기간(범위) 조회 패턴

날짜 범위 조건은 `checkRangeValue()` 유틸을 사용한다.

```ts
import { checkRangeValue } from '@libs/utils';

async find(
    conditions: {
        id?: number;
        search?: string;
        searchKey?: string;
        minCreatedAt?: string;
        maxCreatedAt?: string;
    },
    options?: TypeormRelationOptions<Entity>
) {
    return this.entityManager.find(this.entityClass, {
        where: stripUndefined({
            id: conditions.id,
            createdAt: checkRangeValue(conditions.minCreatedAt, conditions.maxCreatedAt),
            ...checkLikeValue({ searchKey: conditions.searchKey, searchValue: conditions.search }),
        }),
        ...convertOptions(options),
    });
}
```

**`checkRangeValue(minValue, maxValue)` 동작:**

| minValue | maxValue | 결과 |
|----------|----------|------|
| ✅ | ✅ | `And(MoreThanOrEqual(min), LessThan(max))` |
| ✅ | ❌ | `MoreThanOrEqual(min)` |
| ❌ | ✅ | `LessThan(max)` |
| ❌ | ❌ | `undefined` (조건 제외) |

**필드명 규칙:**
- 범위 조건의 파라미터명은 `min{필드명}`, `max{필드명}` 으로 짓는다.
- 예: `minCreatedAt` / `maxCreatedAt`, `minStartOn` / `maxStartOn`
- 엔티티 필드 하나에 시작/종료가 분리된 경우 각각 적용한다.
  ```ts
  startOn: checkRangeValue(conditions.minStartOn, conditions.maxStartOn),
  endOn: checkRangeValue(conditions.minEndOn, conditions.maxEndOn),
  ```

**DTO에서의 기간 필드:**
```ts
// Query DTO
export class AdminInquiryQueryDto extends PaginationDto {
    @IsOptional()
    minCreatedAt?: string;

    @IsOptional()
    maxCreatedAt?: string;

    @IsOptional()
    search?: string;

    @IsOptional()
    searchKey?: string;
}
```

**규칙**:
- `DddRepository<Entity>`를 상속한다.
- `entityClass = EntityClass`를 반드시 명시한다.
- `@Injectable()` 데코레이터를 붙인다.
- 조회 조건은 **plain object** (`{ id?, email?, ... }`)로 받는다.
- `find()`의 두 번째 파라미터 기본 패턴은 **`options?: TypeormRelationOptions<Entity>`** 이다.
- pagination만 필요해도 `TypeormRelationOptions<Entity>` 안의 `options` 필드로 전달하는 방식을 기본으로 본다.
- `options?: PaginationOptions`는 레거시/축약 패턴으로 남아 있을 수 있지만, 새 repository 기본값으로 삼지 않는다.
- 조건에서 undefined 값 제거는 `stripUndefined()`를 사용한다.
- 페이지네이션/정렬/relations 변환은 `convertOptions()`를 사용한다.
- `this.entityManager`를 통해 TypeORM을 호출한다 (직접 DataSource를 쓰지 않음).
- service나 controller에서 `entityManager.find()`를 직접 호출하지 않는다.
- 날짜 범위 조회는 `checkRangeValue()`를 사용한다 — 직접 `Between`, `MoreThanOrEqual` 등을 쓰지 않는다.

### 6-3. enum 필터 배열 패턴

enum 값을 조회 조건으로 받을 때는 **단일값보다 배열 파라미터를 기본 패턴으로 사용**한다.
repository 내부에서는 엔티티 필드에 `checkInValue()`를 적용한다.

```ts
async find(
    conditions: {
        ids?: number[];
        types?: TagType[];
        statuses?: LicenseStatus[];
        roles?: AdminRoleType[];
    },
    options?: TypeormRelationOptions<Entity>
) {
    return this.entityManager.find(this.entityClass, {
        where: stripUndefined({
            id: checkInValue(conditions.ids),
            type: checkInValue(conditions.types),
            status: checkInValue(conditions.statuses),
            role: checkInValue(conditions.roles),
        }),
        ...convertOptions(options),
    });
}
```

**규칙**:
- enum 필터 조건은 가능하면 복수형 배열 이름을 사용한다.
  - 예: `types?: TagType[]`, `statuses?: LicenseStatus[]`, `roles?: AdminRoleType[]`
- 엔티티 컬럼명이 단수여도 조건 파라미터는 복수형 배열로 받는다.
  - 예: `type: checkInValue(conditions.types)`, `status: checkInValue(conditions.statuses)`
- 단일 enum 필터가 필요해도 repository 기본 시그니처는 배열 패턴을 우선한다.
- service나 controller에서 enum 배열을 직접 `In(...)`으로 만들지 않고 repository에서 `checkInValue()`로 변환한다.

## 7. Service 패턴 (`applications/<domain>.service.ts`)

### 메서드 시그니처 — 인라인 destructuring 패턴 (필수)

서비스 메서드의 첫 번째 파라미터는 **인라인 destructuring + 인라인 타입 정의** 형태를 쓴다.
`conditions` 같은 변수명으로 객체를 통째로 받지 않는다.

```ts
// ✅ 올바른 패턴 — 인라인 destructuring
async list({ search }: { search?: string }, options?: PaginationOptions) { ... }
async create({ title, content }: { title: string; content: string }) { ... }
async retrieve({ id, user }: { id: number; user?: User }) { ... }

// ❌ 잘못된 패턴 — conditions 변수로 받기
async list(conditions: { search?: string }, options?: PaginationOptions) { ... }
```

### 대표 예시

```ts
@Injectable()
export class AdminNoticeService extends DddService {
    constructor(private readonly noticeRepository: NoticeRepository) {
        super();
    }

    async list({ search }: { search?: string }, options?: PaginationOptions) {
        const [items, total] = await Promise.all([
            this.noticeRepository.find({ search }, options),
            this.noticeRepository.count({ search }),
        ]);
        return { items, total };
    }

    async create({ title, content }: { title: string; content: string }) {
        const notice = new Notice({ title, content });
        await this.noticeRepository.save(notice);
    }

    async retrieve({ id }: { id: number }) {
        return this.noticeRepository.findOneOrFail({ id });
    }
}
```

### General 서비스 — Context 값을 파라미터로 받는 패턴

```ts
async list({ user, search }: { user?: User; search?: string }, options?: PaginationOptions) {
    const [items, total] = await Promise.all([
        this.noticeRepository.find({ search, isPublished: true }, options),
        this.noticeRepository.count({ search, isPublished: true }),
    ]);
    return { items, total };
}
```

- 컨트롤러에서 Context로 꺼낸 `user`, `admin` 등을 서비스 메서드의 첫 번째 객체에 함께 넘긴다.

### relation 전달 패턴

repository가 `TypeormRelationOptions<Entity>`를 기본으로 받는 경우, service는 아래 둘 중 하나를 사용한다.

```ts
// 1) service가 repository 옵션을 그대로 받는 경우
async list(
    { search }: { search?: string },
    options?: TypeormRelationOptions<Series>
) {
    const [items, total] = await Promise.all([
        this.seriesRepository.find({ search }, options),
        this.seriesRepository.count({ search }),
    ]);
    return { items, total };
}

// 2) service가 use case에 필요한 relation을 직접 지정하는 경우
async retrieve({ id }: { id: number }) {
    const [series] = await this.seriesRepository.find(
        { ids: [id] },
        { relations: { episodes: { holes: true } } }
    );
    return series;
}
```

- service에서 relation이 필요하면 repository 내부에 relation을 하드코딩하기보다, **service에서 두 번째 파라미터로 `relations`를 명시**하는 방식을 우선한다.
- controller에서 단순 pagination만 넘기는 list 메서드는 `options?: PaginationOptions`를 유지할 수 있다.
- 다만 service가 relation/lock/options 전체를 제어해야 하면 **service 두 번째 파라미터도 `TypeormRelationOptions<Entity>`** 로 받는 패턴을 사용한다.

**규칙**:
- `DddService`를 상속한다 (entityManager, context, eventEmitter 자동 주입).
- `@Injectable()` 데코레이터를 붙인다.
- 생성자에서 `super()`를 호출하고, repository를 주입받는다.
- 다른 도메인 데이터를 참조할 때는 그 도메인의 repository를 생성자에 명시적으로 주입하고 `find(...)`를 호출한다.
- **첫 번째 파라미터: `{ 필드들 }: { 타입들 }` 인라인 destructuring** — `conditions` 같은 래핑 변수를 쓰지 않는다.
- **두 번째 파라미터: `options?: PaginationOptions`** — 목록 조회 시 pagination.
- repository 옵션을 그대로 전달하거나 relation/lock을 제어해야 하는 service는 **두 번째 파라미터를 `TypeormRelationOptions<Entity>`로 넓혀도 된다.**
- 메서드는 **use case 단위**로 작성한다 (예: `list`, `create`, `update`, `retrieve`, `delete`).
- 목록 조회는 `{ items, total }` 형태로 반환한다.
- items와 total을 `Promise.all()`로 병렬 호출하는 패턴을 따른다.
- 트랜잭션이 필요한 메서드에는 `@Transactional()`을 붙인다.
- 필수 context나 필수 입력값이 비어 있는 경우에는 `BadRequestException`을 우선 사용한다.
- 실제 권한 부족이나 소유권 위반처럼 접근 자체가 금지된 경우에만 `ForbiddenException`을 사용한다.
- HTTP 관련 객체(req, res)를 직접 다루지 않는다.

## 8. Controller 패턴 (`controllers/<domain>.controller.ts`)

### 클래스 레벨 Swagger 태그 규칙 (필수)

**모든 controller 클래스에는 `@ApiTags(...)`를 반드시 붙인다.**
`@ApiTags`가 없는 controller 클래스는 규칙 위반이다.

```ts
@ApiTags('[관리자] 관리자 API')
@Controller('admins/members')
@UseGuards(AdminGuard)
export class AdminController {}
```

**규칙**:
- `@ApiTags(...)`는 controller 클래스 선언 위에 둔다.
- 기본 데코레이터 순서는 `@ApiTags -> @Controller -> @UseGuards` 를 따른다.
- 태그명은 접근 주체와 리소스 성격이 드러나는 한국어 문자열을 사용한다.
- client controller의 Swagger 태그 prefix는 `[사서]`로 통일한다.
- handler별 JSDoc 규칙과 별개로, controller 클래스 레벨 Swagger 태그도 필수다.

### 핸들러 상단 JSDoc 규칙 (필수)

**모든 컨트롤러 핸들러 위에는 API의 역할과 목적을 설명하는 한국어 JSDoc를 반드시 넣는다.**
JSDoc가 없는 핸들러는 규칙 위반이다.

```ts
/**
 * 관리자 목록 조회
 */
@Get()
async list(...) {}
```

**규칙**:
- JSDoc는 handler 데코레이터(`@Get`, `@Post`, `@Put`, `@Delete` 등) 바로 위에 둔다.
- 내용은 해당 API가 무엇을 하는지 한 줄로 명확히 드러나야 한다.
- 기본 형식은 `목록 조회`, `상세 조회`, `생성`, `수정`, `삭제`, `스케쥴러 실행`처럼 역할과 목적이 드러나는 한국어 문장으로 작성한다.
- 단순히 메서드명을 반복하는 축약형 주석은 지양한다.
- 아래의 4단계 내부 주석 규칙과 별개로, **JSDoc와 4단계 주석을 둘 다** 유지해야 한다.

### 4단계 주석 규칙 (필수)

**모든 컨트롤러 핸들러에 아래 4단계 주석을 반드시 넣는다.** 주석이 없는 핸들러는 규칙 위반이다.
각 단계의 코드는 해당 주석 아래에 위치해야 한다. 해당 단계에서 할 일이 없어도 **주석은 반드시 남긴다** (빈 줄로 둔다).

```
// 1. Destructure body, params, query   → 입력 파싱·destructuring
// 2. Get context                       → Context에서 인증 정보 조회 (admin, user 등)
// 3. Get result                        → service 호출 (비즈니스 로직)
// 4. Send response                     → { data } 반환
```

### 8-1. Admin 컨트롤러 예시 (목록 조회)

```ts
@ApiTags('[관리자] 공지사항 API')
@Controller('admins/notices')
export class AdminNoticeController {
    constructor(private readonly adminNoticeService: AdminNoticeService) {}

    /**
     * 공지사항 목록 조회
     */
    @Get()
    async list(@Query() query: AdminNoticeQueryDto) {
        // 1. Destructure body, params, query
        const { search, ...options } = query;

        // 2. Get context

        // 3. Get result
        const data = await this.adminNoticeService.list({ search }, options);

        // 4. Send response
        return { data };
    }
}
```

### 8-2. Client 컨트롤러 예시 (사서 — Context 사용)

```ts
@ApiTags('[사서] 문의 API')
@Controller('clients/inquiries')
export class ClientInquiryController {
    constructor(
        private readonly clientInquiryService: ClientInquiryService,
        private readonly context: Context,
    ) {}

    /**
     * 문의 목록 조회
     */
    @Get()
    async list(@Query() query: ClientInquiryQueryDto) {
        // 1. Destructure body, params, query
        const { search, ...options } = query;

        // 2. Get context
        const client = this.context.get<Client>(ContextKey.CLIENT);

        // 3. Get result
        const data = await this.clientInquiryService.list({ client, search }, options);

        // 4. Send response
        return { data };
    }
}
```

### 8-3. General 컨트롤러 예시 (이용자)

```ts
@ApiTags('[이용자] 공지사항 API')
@Controller('notices')
export class GeneralNoticeController {
    constructor(
        private readonly generalNoticeService: GeneralNoticeService,
    ) {}

    /**
     * 공지사항 목록 조회
     */
    @Get()
    async list(@Query() query: GeneralNoticeQueryDto) {
        // 1. Destructure body, params, query
        const { search, ...options } = query;

        // 2. Get context

        // 3. Get result
        const data = await this.generalNoticeService.list({ search }, options);

        // 4. Send response
        return { data };
    }
}
```

### 8-4. 생성(Create) 예시

```ts
/**
 * 공지사항 생성
 */
@Post()
async create(@Body() body: AdminNoticeCreateDto) {
    // 1. Destructure body, params, query
    const { title, content, isPublished } = body;

    // 2. Get context

    // 3. Get result
    await this.adminNoticeService.create({ title, content, isPublished });

    // 4. Send response
    return { data: {} };
}
```

### 각 단계 상세 설명

| 단계 | 목적 | 내용 |
|------|------|------|
| **1. Destructure** | 입력 분리 | `@Query`, `@Body`, `@Param`에서 받은 값을 destructuring. Query DTO는 `const { 도메인필드, ...options } = query` 패턴으로 pagination 분리 |
| **2. Get context** | 인증 정보 조회 | `this.context.get<Admin>(ContextKey.ADMIN)` 또는 `this.context.get<Client>(ContextKey.CLIENT)`. 불필요하면 주석만 남기고 비워둔다 |
| **3. Get result** | 서비스 호출 | `await this.service.method(...)` — 비즈니스 로직은 여기서만 실행. `const data = ...` 또는 `await ...` (반환값 없는 mutation) |
| **4. Send response** | 응답 반환 | 조회: `return { data }`, 생성/수정/삭제: `return { data: {} }` |

**규칙**:
- `@Controller('<resource-path>')` 경로는 리소스 기준으로 잡는다.
- controller 클래스에는 `@ApiTags(...)`를 반드시 붙인다.
- handler마다 API 역할/목적을 설명하는 JSDoc를 반드시 작성한다.
- handler JSDoc 첫 줄은 문장형보다 제목형 명사구를 기본값으로 사용한다.
  - 형식: `"<주체> <도메인> <행위>"`
  - 예: `관리자 문의 목록 조회`, `관리자 문의 상세 조회`, `관리자 문의 답변 등록`, `사서 문의 생성`
- handler JSDoc은 한 줄 요약보다 멀티라인 블록 형식을 기본값으로 사용한다.
  ```ts
  /**
   * 관리자 문의 목록 조회
   */
  ```
- **service 호출 코드는 반드시 "3. Get result" 주석 아래에 위치**한다. "2. Get context" 아래에 넣지 않는다.
- Context가 필요 없는 핸들러(주로 admin)도 "2. Get context" 주석은 남겨둔다 (일관성).
- Client 컨트롤러는 `Context`를 생성자에 주입받는다 (소속 도서관 식별 필요). Admin, General 컨트롤러는 필요할 때만 주입한다.
- 응답은 `{ data: ... }` 래핑 패턴을 따른다.
- controller에서 DB 쿼리, 이벤트 발행, 비즈니스 판단을 직접 하지 않는다.
- service만 주입받고, repository를 직접 주입하지 않는다.
- `@Query()` 타입에 `PaginationOptions`를 직접 쓰지 않는다 → 도메인별 Query DTO를 만든다 (`./dto-pattern.md` §6 참고).

## 9. 의존 흐름

```text
Controller → Service → Repository → Entity
```

- 역방향 의존 금지.
- Controller는 Service만 호출한다.
- Service는 Repository를 조합할 수 있다.
- Repository는 Entity와 TypeORM만 다룬다.

## 10. 네이밍 규칙

### 10-1. 단일 타입 도메인

| 대상 | 패턴 | 예시 |
|------|------|------|
| 모듈 클래스 | `PascalCase + Module` | `AdminModule` |
| 서비스 클래스 | `PascalCase + Service` | `AdminService` |
| 리포지토리 클래스 | `PascalCase + Repository` | `AdminRepository` |
| 엔티티 클래스 | 도메인명 단수형 `PascalCase` | `Admin` |
| 컨트롤러 클래스 | `PascalCase + Controller` | `AdminController` |
| 파일명 | `<domain>.<role>.ts` (dot suffix) | `admin.service.ts` |
| 생성자 타입 | `Ctor` (type alias) | `type Ctor = { ... }` |
| 테이블명 | 복수형 lowercase | `admins` |

### 10-2. 복수 타입 분리 도메인 (admin / client / general)

| 대상 | Admin (시스템 관리자) | Client (사서) | General (이용자) |
|------|---------------------|--------------|-----------------|
| 모듈 클래스 | `Admin{Domain}Module` | `Client{Domain}Module` | `General{Domain}Module` |
| 서비스 클래스 | `Admin{Domain}Service` | `Client{Domain}Service` | `General{Domain}Service` |
| 컨트롤러 클래스 | `Admin{Domain}Controller` | `Client{Domain}Controller` | `General{Domain}Controller` |
| 모듈 파일 | `admin-<domain>.module.ts` | `client-<domain>.module.ts` | `general-<domain>.module.ts` |
| 서비스 파일 | `admin-<domain>.service.ts` | `client-<domain>.service.ts` | `general-<domain>.service.ts` |
| 컨트롤러 파일 | `admin-<domain>.controller.ts` | `client-<domain>.controller.ts` | `general-<domain>.controller.ts` |
| 라우트 경로 | `admins/<domain>` | `clients/<domain>` | `<domain>` |

공유 항목 (타입에 무관):

| 대상 | 패턴 | 예시 |
|------|------|------|
| 공유 리포지토리 | `{Domain}Repository` | `InquiryRepository` |
| 공유 엔티티 | 도메인명 단수형 | `Inquiry` |

## 11. import 패턴

```ts
// 모듈 내부: 상대 경로
import { AdminRepository } from '../repository/admin.repository';

// 공통 라이브러리: alias
import { DddService } from '@libs/ddd';
import { DddAggregate } from '@libs/ddd';
import { DddRepository } from '@libs/ddd';
import { convertOptions, stripUndefined, TypeormRelationOptions } from '@libs/utils';
import { PaginationOptions } from '@libs/utils';
```

- 모듈 내부 참조는 상대 경로를 사용한다.
- 공통 코드는 `@libs/*`, `@common/*`, `@configs` alias를 사용한다.

## 12. 도메인 타입 판단 기준

- 도메인에 어떤 타입(admin/client/general)이 필요한지는 **요구사항에 따라 결정**한다.
- 반드시 3개 타입 모두 있어야 하는 것은 아니다. 필요한 타입만 만든다.
- admin만 필요하면 `admin-<domain>.module.ts` 하나만 만들고 `admins.ts`에만 등록한다.
- client만 필요하면 `client-<domain>.module.ts` 하나만 만들고 `clients.ts`에만 등록한다.
- general만 필요하면 `general-<domain>.module.ts` 하나만 만들고 `generals.ts`에만 등록한다.
- 여러 타입이 필요하면 각각 만들고 해당 그룹 파일에 각각 등록한다.

### 타입별 역할 요약

| 타입 | 사용자 | 역할 | ContextKey |
|------|--------|------|------------|
| `admin` | 두비덥 시스템 관리자 | 전체 도서관 데이터 관리 | `ContextKey.ADMIN` |
| `client` | 사서 (도서관 관리자) | 소속 도서관 데이터 관리 | `ContextKey.CLIENT` |
| `general` | 이용자 (도서관 이용자) | 자신의 데이터만 접근 | — (JWT 유니크 키) |

## 13. 도메인 이벤트 발행·처리 규칙

이 섹션은 서비스 모듈 안에서 이벤트를 발행하고 처리하는 구체적인 패턴을 다룬다.
이벤트 인프라(event-box, BullMQ, dispatcher)의 동작 원리는 `./common-pattern.md` §7을,
DDD base 클래스와 데코레이터 규칙은 `./libs-pattern.md` §3~4를 참조한다.

### 13-1. 이벤트 클래스 작성 규칙

#### 파일 위치

```text
src/services/<domain>/domain/events/
  <event-name>.event.ts     # 이벤트 클래스
  index.ts                  # barrel export
```

- 이벤트 클래스는 해당 이벤트를 **발행하는 도메인**의 `domain/events/` 폴더에 둔다.
- 이벤트를 **구독하는 쪽**이 아니라 **발행하는 쪽**에 위치한다.

#### 네이밍 규칙

| 대상 | 패턴 | 예시 |
|------|------|------|
| 클래스명 | `{Domain}{Action}Event` (PascalCase) | `PromotionActivatedEvent`, `LoanReturnedEvent` |
| 파일명 | `<domain>-<action>-event.ts` (kebab-case) | `promotion-activated-event.ts`, `loan-returned-event.ts` |

- 클래스명이 곧 `eventType`으로 사용되므로 (`constructor.name` 기반) **이름을 변경하면 기존 매핑이 깨진다**.

#### 구현 패턴

```ts
import { DddEvent } from '@libs/ddd';

export class PromotionActivatedEvent extends DddEvent {
    public promotionId!: number;
    public episodeIds!: number[];
    public promotionType!: PromotionType;

    constructor(promotionId: number, episodeIds: number[], promotionType: PromotionType) {
        super();
        this.promotionId = promotionId;
        this.episodeIds = episodeIds;
        this.promotionType = promotionType;
    }
}
```

**규칙**:
- `DddEvent`를 상속한다.
- 생성자에서 `super()`를 반드시 호출한다.
- payload에 담을 데이터만 생성자 파라미터로 받는다.
- 직렬화 가능한 **plain data만** 넣는다 (엔티티 인스턴스, repository, request 객체 금지).
- `domain/events/index.ts`에서 barrel export 한다.

```ts
// domain/events/index.ts
export * from './promotion-activated-event';
export * from './promotion-expired-event';
```

### 13-2. Entity에서의 이벤트 발행 패턴

이벤트는 Entity의 **도메인 메서드** 안에서 상태 변경과 함께 발행한다.

```ts
@Entity('promotions')
export class Promotion extends DddAggregate {
    @Column()
    status: PromotionStatus;

    activate() {
        this.status = PromotionStatus.ACTIVE;
        this.publishEvent(new PromotionActivatedEvent(this.id, this.episodeIds, this.promotionType));
    }

    expired() {
        this.status = PromotionStatus.EXPIRED;
        this.publishEvent(new PromotionExpiredEvent(this.id, this.episodeIds, this.promotionType));
    }
}
```

**규칙**:
- `publishEvent()`는 Entity의 **상태를 변경하는 도메인 메서드** 안에서 호출한다.
- 상태 변경 로직과 이벤트 발행을 **같은 메서드**에 묶는다 (분리하지 않는다).
- 이벤트 생성자에는 **후속 처리에 필요한 최소한의 식별자·데이터**만 전달한다.
- `publishEvent()` 호출 시점에는 DB에 저장되지 않는다. **`repository.save()` 호출 시점**에 이벤트가 DB에 함께 저장된다.
- Service에서 직접 `publishEvent()`를 호출하지 않는다. Entity 도메인 메서드를 통해서만 발행한다.

### 13-3. Consumer 작성 규칙

Consumer는 BullMQ 큐에서 job을 꺼내 실제 핸들러로 라우팅하는 역할이다.

#### 파일 위치

```text
src/services/<domain>/applications/
  <domain>.consumer.ts          # 공용 이벤트 consumer (권장)
  general-<domain>.consumer.ts  # 복수 타입 도메인 (타입별로 분리 가능)
```

- Consumer는 이벤트를 **구독하는 도메인**의 `applications/` 폴더에 둔다.
- 이벤트를 발행하는 도메인이 아니라, **이벤트를 받아서 처리하는 도메인** 쪽이다.
- `pudding-back` 스타일을 따를 때는 HTTP 타입(`admin/client/general`)과 무관한 이벤트 후처리는
  **공용 `<domain>.consumer.ts` + 공용 `<domain>.service.ts`** 조합을 우선한다.
- 즉 `admin-<domain>.service.ts`에 이벤트 핸들러를 넣기보다, 이벤트 전용 공용 service를 별도로 두는 방식을 선호한다.

#### 네이밍 규칙

| 대상 | 패턴 | 예시 |
|------|------|------|
| 클래스명 | `{Domain}Consumer` | `EpisodeConsumer`, `AdminConsumer` |
| 파일명 | `<domain>.consumer.ts` | `episode.consumer.ts` |

#### 구현 패턴

```ts
import { Processor } from '@nestjs/bullmq';
import { QueueName } from '@common/event-box/queues';
import { CommonConsumer } from '@common/event-box';
import { EpisodeService } from './episode.service';
import { PromotionActivatedEvent, PromotionExpiredEvent } from '@services/promotion/domain/events';

@Processor(QueueName.EPISODE)
export class EpisodeConsumer extends CommonConsumer {
    constructor(private readonly episodeService: EpisodeService) {
        super();

        this.methodHandlerMap.set(
            PromotionActivatedEvent.name,
            this.episodeService.activatedFreePromotionEvent.bind(this.episodeService),
        );

        this.methodHandlerMap.set(
            PromotionExpiredEvent.name,
            this.episodeService.expiredFreePromotionEvent.bind(this.episodeService),
        );
    }
}
```

**규칙**:
- `CommonConsumer`를 상속한다 (`WorkerHost` 기반, `process()` 메서드는 base class가 처리).
- `@Processor(QueueName.XXX)` 데코레이터로 어떤 큐를 소비하는지 지정한다.
- 생성자에서 `super()`를 호출한 뒤, `this.methodHandlerMap.set()`으로 핸들러를 등록한다.
- key: `EventClass.name` (이벤트 클래스의 이름 문자열)
- value: `this.service.handlerMethod.bind(this.service)` (**반드시 `.bind()`로 this 바인딩**)
- Consumer 자체에 비즈니스 로직을 넣지 않는다. Service의 핸들러 메서드로 위임한다.
- 이벤트 클래스는 **발행 도메인**에서 import 한다 (`@services/<발행도메인>/domain/events`).

#### 모듈 등록

Consumer는 해당 도메인 모듈의 `providers`에 등록한다.

```ts
@Module({
    controllers: [AdminEpisodeController],
    providers: [
        EpisodeRepository,
        EpisodeService,
        EpisodeConsumer,    // Consumer를 providers에 등록
    ],
    exports: [EpisodeRepository],
})
export class AdminEpisodeModule {}
```

- `providers` 배열에 추가하면 NestJS/BullMQ가 `@Processor` 데코레이터를 감지하여 자동으로 워커로 등록한다.
- `exports`에는 넣지 않는다 (Consumer는 외부 모듈에서 참조하지 않음).

### 13-4. Service 이벤트 핸들러 메서드 규칙

이벤트를 받아 실제 비즈니스 로직을 수행하는 메서드다.

#### 배치 선호 규칙

- 이벤트 핸들러는 가능하면 **공용 `<domain>.service.ts`** 에 둔다.
- `admin-<domain>.service.ts`, `client-<domain>.service.ts`, `general-<domain>.service.ts`는 HTTP/권한별 use case를 우선 담당한다.
- 이벤트 후처리가 HTTP 타입과 무관하면, `pudding-back` 스타일처럼 별도 공용 service로 분리한다.
- 예:
  - `license.service.ts` — 이벤트 기반 license 후처리
  - `series.service.ts` — episode/artist 이벤트 후처리

#### 구현 패턴

```ts
@Injectable()
export class EpisodeService extends DddService {
    constructor(private readonly episodeRepository: EpisodeRepository) {
        super();
    }

    @Transactional()
    @EventHandler(PromotionActivatedEvent, QueueName.EPISODE, {
        description: '무료 프로모션이 활성화되면 해당 에피소드의 isFree를 변경한다.',
    })
    async activatedFreePromotionEvent(event: PromotionActivatedEvent) {
        const { promotionId, episodeIds, promotionType } = event;

        if (promotionType !== PromotionType.FREE) {
            return;
        }

        const episodes = await this.episodeRepository.findByIds({ ids: episodeIds });
        episodes.forEach((episode) => {
            episode.update({ isFree: true, promotionId });
        });

        await this.episodeRepository.save(episodes);
    }
}
```

**규칙**:
- `@EventHandler(EventClass, QueueName, options?)` 데코레이터를 붙인다.
  - 이 데코레이터가 내부적으로 `CommonDispatcher.pushEventMap()`을 호출하여 이벤트-큐 매핑을 등록한다.
  - `description` 옵션으로 핸들러의 목적을 한국어로 남긴다.
- `@Transactional()` 데코레이터를 함께 붙인다 (핸들러 내에서도 트랜잭션이 필요하므로).
  - 데코레이터 순서: `@Transactional()` → `@EventHandler()` (위에서 아래로).
- 핸들러 메서드의 파라미터 타입은 이벤트 클래스다 (`event: PromotionActivatedEvent`).
- 핸들러 안에서 `repository.save()`를 호출하면 **새로운 이벤트가 발행될 수 있다** (이벤트 체이닝).
- 핸들러 메서드명은 `handle{EventName}` 또는 이벤트의 의미를 드러내는 이름으로 짓는다.

### 13-5. 이벤트 전체 흐름 요약

```text
[발행 도메인]                        [구독 도메인]

Entity                              Service
  │ domain method 호출                │ @EventHandler + @Transactional
  │ this.publishEvent(new XxxEvent)   │ async handleXxxEvent(event)
  ▼                                   ▲
Service (@Transactional)              │
  │ repository.save(entity)           │ ⑥ handler 실행
  ▼                                   │
DddRepository.save()                CommonConsumer.process(job)
  │ ① entity 저장                     ▲
  │ ② DddEvent.fromEvent() 변환       │ ⑤ methodHandlerMap에서 핸들러 조회
  │ ③ ddd_events 테이블 저장 (PENDING)  │    + asyncLocalStorage.run()
  │ ④ Context.DDD_EVENTS에 누적        │
  ▼                                   │
@Transactional 종료                  BullMQ Worker
  │ eventEmitter.emit(                 ▲
  │   'ddd-event.created', dddEvent)   │ ⑤ 큐에서 job 꺼냄
  ▼                                   │
EventBoxDispatcherProvider            │
  │ @OnEvent('ddd-event.created')     │
  │ PENDING 상태 확인                  │
  │ eventMap에서 대상 큐 조회           │
  │ queue.add(job)  ──────────────────┘
  │ eventStatus → PROCESSED
  ▼
```

#### 이벤트 상태 생명주기

```text
publishEvent() → [메모리] → repository.save() → PENDING → dispatcher → PROCESSED
                                                                    ↘ (실패 시) FAILED
```

### 13-6. 새 이벤트 추가 체크리스트

1. **이벤트 클래스** — `src/services/<발행도메인>/domain/events/<name>.event.ts` 생성
2. **barrel export** — `domain/events/index.ts`에 export 추가
3. **Entity 도메인 메서드** — 상태 변경 메서드 안에서 `publishEvent()` 호출
4. **QueueName** — 구독 도메인의 큐가 없으면 `common/event-box/queues.ts`에 추가
5. **Consumer** — `src/services/<구독도메인>/applications/<domain>.consumer.ts` 생성 또는 기존 consumer에 `methodHandlerMap.set()` 추가
6. **Service 핸들러** — `@EventHandler()` + `@Transactional()` 데코레이터가 붙은 핸들러 메서드 작성
7. **모듈 등록** — Consumer를 도메인 모듈의 `providers`에 등록
8. **CommonDispatcher 큐 주입** — 새 큐를 추가했다면 `common-dispatcher.ts`의 생성자에 `@InjectQueue()` 추가

### 13-7. 금지 사항

- ❌ Controller에서 직접 이벤트를 발행하지 않는다.
- ❌ Service에서 `publishEvent()`를 직접 호출하지 않는다 (Entity 도메인 메서드를 통해서만).
- ❌ Consumer에 비즈니스 로직을 넣지 않는다 (Service 핸들러로 위임).
- ❌ 이벤트 payload에 직렬화 불가능한 객체(엔티티 인스턴스, repository 등)를 넣지 않는다.
- ❌ `@EventHandler()`를 Consumer에 붙이지 않는다 (Service 메서드에만 붙인다).
- ❌ `methodHandlerMap.set()`에서 `.bind(this.service)`를 빠뜨리지 않는다.

## 14. 미완성 의존성 처리 — 주석 처리 규칙 (필수)

아직 존재하지 않는 도메인, 엔티티, 헬퍼, 공통 함수 등을 참조해야 할 경우, **직접 생성하지 않고 주석 처리**한다.

### 원칙
- 현재 작업 범위에 포함되지 않는 의존성은 **가정하고 주석으로 남긴다**.
- 주석에는 어떤 도메인/함수가 필요한지 알 수 있도록 의도를 명시한다.
- 해당 의존성이 완성되면 주석을 해제하여 활성화한다.
- 이 규칙은 특정 계층에만 적용되는 것이 아니라, **레포 어디서든 미래 작업 예정 의존성이 필요한 모든 계층**(`entity`, `repository`, `service`, `controller`, `dto`, `module`)에 동일하게 적용한다.
- 미래 의존성 흐름은 **최종 목표 구조를 기준으로 각 계층이 같은 방향을 바라보도록** 맞춘다.
- 아직 연결되지 않은 부분만 주석 처리하고, 이미 구현 가능한 부분은 같은 미래 흐름을 기준으로 유지한다.
- 즉, 어느 한 계층만 부분적으로 주석 처리하지 말고, 관련 계층들이 서로 맞물리는 형태로 주석과 구현을 정렬한다.

### 예시

```ts
// repository — 아직 Client 도메인이 없으므로 future filter를 주석 처리
conditions: {
    id?: number;
    // clientId?: number;
    // clientName?: string;
    search?: string;
},

where: stripUndefined({
    id: conditions.id,
    // client: conditions.clientId ? { id: conditions.clientId } : undefined,
    ...checkLikeValue({ ... }),
}),
relations: {
    admin: true,
    // client: true,
},
```

```ts
// service — 미래 Client 흐름을 기준으로 시그니처를 정렬
async list({
    search,
    // clientName,
}: {
    search?: string;
    // clientName?: string;
}) { ... }
```

```ts
// entity — 아직 Client 엔티티가 없으므로 relation 주석 처리
// @ManyToOne(() => Client)
// client: Client;
```

```ts
// controller — context 부분만 미완성이면 그 줄만 주석 처리
// const client = this.context.get(ContextKey.CLIENT);
const data = await this.noticeService.list({ search, searchKey /* clientId: client.id */ }, options);
```

### 금지 사항
- ❌ 아직 없는 엔티티 파일을 직접 생성하여 빈 껍데기로 만들지 않는다.
- ❌ 아직 없는 유틸/헬퍼 함수를 임의로 만들지 않는다.
- ❌ 존재하지 않는 모듈을 import하여 빌드 에러를 유발하지 않는다.

## 15. 주의사항

- DTO, validator, guard, facade 계층은 필요 시 `./dto-pattern.md`, `./validator-pattern.md`를 참고하여 추가한다.
