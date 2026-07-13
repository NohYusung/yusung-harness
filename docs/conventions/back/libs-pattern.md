# vogopang_back libs 모듈 규칙

이 문서는 `src/libs` 폴더의 구조와 컨벤션을 기준으로 추출한 규칙이다.
새 에이전트나 개발자는 아래 규칙을 기본값으로 따르고, 공통 라이브러리를 사용하거나 확장할 때 이 패턴을 유지한다.

## 1. 폴더 구조

```text
src/libs/
  date/
    index.ts                          # 날짜 유틸 (dayjs + Asia/Seoul)
  ddd/
    index.ts                          # barrel export
    ddd-aggregate.ts                  # 도메인 aggregate base 클래스
    ddd-event.ts                      # 도메인 이벤트 엔티티 + DddEventStatus enum
    ddd-repository.ts                 # 도메인 repository base 클래스
    ddd-service.ts                    # 도메인 service base 클래스
  decorators/
    index.ts                          # barrel export
    transactional.decorator.ts        # @Transactional() 트랜잭션 데코레이터
    event-handler.decorator.ts        # @EventHandler() 이벤트-큐 매핑 데코레이터
  filters/
    index.ts                          # barrel export
    exception.filter.ts               # 전역 예외 필터
  interceptors/
    index.ts                          # barrel export
    request-logger.interceptor.ts     # 요청 로깅 인터셉터
    trace-id-subscriber.interceptor.ts # TypeORM 엔티티 감사 추적 subscriber
  logger/
    index.ts                          # Winston 로거 설정 + getLogContext()
  pipes/
    index.ts                          # barrel export
    requester-validator.pipe.ts       # 전역 ValidationPipe (한국어 에러 메시지)
  utils/
    index.ts                          # barrel export
    helper.ts                         # stripUndefined, randomId
    typeorm.ts                        # TypeORM 쿼리 빌더 유틸
```

## 2. import alias 규칙

- `@libs/ddd` → DDD base 클래스들
- `@libs/utils` → helper, typeorm 유틸
- `@libs/logger` → Winston 로거, getLogContext
- `@libs/decorators` → Transactional, EventHandler
- `@libs/filters` → ExceptionFilter
- `@libs/interceptors` → RequestLoggerInterceptor, TraceIdSubscriber
- `@libs/pipes` → requesterValidatorPipe
- `@libs/date` → 날짜 유틸

각 하위 폴더는 `index.ts`에서 barrel export 한다.

## 3. DDD base 클래스 규칙 (`ddd/`)

### DddAggregate — 엔티티 base 클래스

- 모든 도메인 엔티티는 이 abstract 클래스를 상속한다.
- `@Entity()` 데코레이터가 붙어 있다.

```ts
@Entity()
export abstract class DddAggregate {
    private events: DddEvent[] = [];

    @CreateDateColumn() readonly createdAt!: Date;
    @Column({ select: false, nullable: true }) private createdBy?: string;
    @UpdateDateColumn() readonly updatedAt!: Date;
    @Column({ select: false, nullable: true }) private updatedBy?: string;
    @DeleteDateColumn() deletedAt!: Date | null;
}
```

**제공 메서드**:

| 메서드 | 설명 |
|--------|------|
| `publishEvent(event)` | 이벤트를 내부 배열에 추가 |
| `getPublishedEvents()` | 쌓인 이벤트 복사본 반환 |
| `setTraceId(traceId)` | createdBy/updatedBy에 traceId 설정 (신규면 createdBy도) |
| `stripUnchanged(changed)` | 변경된 필드만 추출 (lodash `isEqual`로 비교 후 `stripUndefined`) |
| `toInstance<T>(dto)` | `plainToInstance`로 DTO 변환 |

**규칙**:
- `createdBy`, `updatedBy`는 `select: false`로 일반 조회 시 노출되지 않는다.
- `deletedAt`으로 soft delete를 지원한다.
- 도메인 상태 변경 시 `publishEvent()`로 이벤트를 쌓고, 저장은 repository가 처리한다.

### DddEvent — 이벤트 엔티티

- 테이블명: `ddd_events`
- 인덱스: `['eventStatus', 'createdAt']`

```ts
export enum DddEventStatus {
    PENDING = 'pending',
    PROCESSED = 'processed',
    FAILED = 'failed',
}
```

**컬럼 구조**:

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | UUID (auto) | PK |
| `traceId` | string | 요청 추적 ID |
| `eventType` | string | `constructor.name` 기반 |
| `payload` | text | JSON 직렬화된 이벤트 데이터 |
| `eventStatus` | enum | PENDING → PROCESSED / FAILED |
| `occurredAt` | Date | 이벤트 발생 시각 |
| `createdAt` | Date | 자동 생성 |
| `updatedAt` | Date | 자동 갱신 |

**규칙**:
- 생성자에서 `eventType = this.constructor.name`, `occurredAt = new Date()`를 자동 설정한다.
- `fromEvent(event)` static 메서드로 이벤트를 저장 가능한 형태로 변환한다 (payload를 JSON.stringify).
- 이벤트 클래스를 만들 때 클래스명이 곧 `eventType`이므로 이름을 안정적으로 유지한다.

### DddRepository — repository base 클래스

- 제네릭: `DddRepository<T extends DddAggregate>`
- abstract property: `entityClass: ObjectType<T>`

```ts
export abstract class DddRepository<T extends DddAggregate> {
    constructor(
        @InjectDataSource() private readonly datasource: DataSource,
        private readonly context: Context
    ) {}
}
```

**핵심 동작**:

| 메서드 | 설명 |
|--------|------|
| `get entityManager()` | 트랜잭션 EM(Context) 또는 기본 EM 반환 |
| `createQueryBuilder(alias)` | entityClass 기반 쿼리 빌더 생성 |
| `save(entities)` | 엔티티 저장 + 이벤트 추출·저장·컨텍스트 누적 |
| `softRemove(entities)` | TypeORM soft delete |

**규칙**:
- `save()` 시 자동으로 aggregate의 이벤트를 꺼내 `DddEvent`로 변환하여 DB에 저장한다.
- 저장된 이벤트는 `ContextKey.DDD_EVENTS`에 누적하여 `@Transactional()` 종료 후 emit한다.
- 엔티티 저장 전 `setTraceId()`로 감사 추적 정보를 설정한다.
- `entityManager` getter는 `@Transactional()` 데코레이터와 연동된다. 트랜잭션 안이면 트랜잭션 EM을, 아니면 기본 EM을 반환한다.

### DddService — service base 클래스

- `@Transactional()` 데코레이터와 함께 쓰기 위한 base 클래스다.
- 프로퍼티 주입 패턴을 사용한다.

```ts
export abstract class DddService {
    @InjectEntityManager()
    private readonly entityManager!: EntityManager;

    @Inject()
    private readonly context!: Context;

    @Inject()
    private readonly eventEmitter!: EventEmitter2;
}
```

**규칙**:
- `entityManager`, `context`, `eventEmitter`는 `private`이지만 `@Transactional()` 데코레이터가 `@ts-expect-error`로 접근한다.
- service에서 이 3개 의존성을 직접 선언하지 말고, `DddService`를 상속하면 된다.

## 4. 데코레이터 규칙 (`decorators/`)

### @Transactional()

- `DddService`를 상속한 service의 메서드에 붙인다.
- 동작 순서:
  1. `entityManager.transaction()` 으로 트랜잭션 시작
  2. 트랜잭션 EM을 `ContextKey.ENTITY_MANAGER`에 설정
  3. 원래 메서드 실행
  4. 트랜잭션 종료 후 EM을 null로 초기화
  5. `ContextKey.DDD_EVENTS`에 쌓인 이벤트를 `eventEmitter.emit('ddd-event.created', dddEvent)` 로 발행
  6. 이벤트 목록 초기화

```ts
@Transactional()
async createSomething(args: any) {
    // 이 안에서 repository.save() 호출 시 트랜잭션 EM 사용
}
```

### @EventHandler(EventClass, QueueName, options?)

- 이벤트 클래스와 큐 이름의 매핑을 등록한다.
- 내부적으로 `CommonDispatcher.pushEventMap()`을 호출한다.
- 메서드 자체 동작은 변경하지 않는다.

```ts
@EventHandler(SomeEvent, QueueName.SOME_QUEUE)
async handleSome(data: any) { ... }
```

## 5. 필터 규칙 (`filters/`)

### ExceptionFilter

- `@Catch()` 전역 예외 필터.
- 의존성: `SlackService`, `Context`, `ConfigsService`

**동작 규칙**:
- 5xx 에러: `logger.error` + Slack 전송 (local 제외)
- 400 에러: `logger.warn` + Slack 전송 (local 제외)
- 그 외 4xx: `logger.warn`만
- 응답 형식: `{ data: { message: string } }`
- 5xx 메시지: `'서버에 예기치 않은 오류가 발생했습니다.'` (고정)
- 4xx 메시지: 실제 예외 메시지 전달
- Slack 메시지에 method, url, traceId, stack, body 포함

## 6. 인터셉터 규칙 (`interceptors/`)

### RequestLoggerInterceptor

- 모든 HTTP 요청의 method, url, 소요시간, traceId를 로깅한다.
- 무시 경로: `/health`, `/metrics`, `/favicon.ico`
- RxJS `tap()` 연산자로 응답 완료 시점에 로그를 남긴다.

### JobInterceptor

- Job(스케쥴러) 실행 결과를 Slack으로 알림하는 인터셉터다.
- `JobGuard`와 함께 컨트롤러 클래스 레벨에 `@UseInterceptors(JobInterceptor)`로 적용한다.
- 요청 시작 시각을 기록하고, 응답 완료 후 `slackService.sendJob()`으로 전송한다.
- local 환경에서는 Slack 알림을 보내지 않는다 (`configsService.isLocal()` 체크).
- 응답 형식: `{ jobType: string; data: Record<string, any> }`

```ts
@Injectable()
export class JobInterceptor implements NestInterceptor {
    constructor(
        private readonly slackService: SlackService,
        private readonly configsService: ConfigsService,
    ) {}

    intercept(context: ExecutionContext, next: CallHandler) {
        const request = context.switchToHttp().getRequest<Request>();
        const start = today('YYYY-MM-DD HH:mm:ss');

        return next.handle().pipe(
            tap((response) => {
                if (!this.configsService.isLocal()) {
                    this.slackService.sendJob({ request, response, start });
                }
            }),
        );
    }
}
```

- barrel export(`interceptors/index.ts`)에 `JobInterceptor`를 추가한다.
- 상세 규칙은 `./common-pattern.md`의 guards 섹션을 참조한다.

### TraceIdSubscriber

- TypeORM `@EventSubscriber()`로 `DddAggregate`를 감시한다.
- `beforeInsert`: `createdBy`, `updatedBy`에 traceId 설정
- `beforeUpdate`: `updatedBy`에 traceId 설정
- cascade로 저장되는 하위 엔티티도 자동으로 감사 추적된다.
- 생성자에서 `this.dataSource.subscribers.push(this)`로 자기 자신을 등록한다.

## 7. 로거 규칙 (`logger/`)

- Winston 기반. `nest-winston` 모듈 사용.
- 서비스명: `vogopang-${NODE_ENV || 'local'}`
- local: `debug` 레벨, 컬러 + 타임스탬프 포맷
- production/development: `info` 레벨, JSON 포맷

```ts
export const logger = WinstonModule.createLogger({ ... });
```

### getLogContext(request)

- 요청에서 method, url, body, headers를 추출한다.
- `authorization` 헤더는 제거한다.
- body가 비어있으면 포함하지 않는다.

## 8. 파이프 규칙 (`pipes/`)

### requesterValidatorPipe

- `ValidationPipe` 인스턴스. `main.ts`에서 전역으로 등록한다.
- 설정: `whitelist: true`, `transform: true`
- 에러 메시지를 한국어로 변환한다.

**등록된 한국어 메시지**:

| constraint | 메시지 패턴 |
|------------|------------|
| isNotEmpty | `{prop}은(는) 비어있을 수 없습니다.` |
| isString | `{prop}은(는) 문자열이어야 합니다.` |
| isEmail | `{prop}은(는) 유효한 이메일 형식이 아닙니다.` |
| isBoolean | `{prop}은(는) boolean 타입이어야 합니다.` |
| isNumber | `{prop}은(는) 숫자 타입이어야 합니다.` |
| isEnum | `{prop}은(는) 유효한 타입이 아닙니다.` |
| maxLength | `{prop}의 길이가 너무 깁니다.` |

- 새 constraint 메시지는 `errorMessages` 객체에 추가하면 앱 전체에 적용된다.
- nested DTO는 재귀적으로 첫 번째 에러를 찾는다.
- 매핑에 없는 constraint는 class-validator 기본 메시지를 그대로 사용한다.

## 9. 유틸 규칙 (`utils/`)

### helper.ts

**`stripUndefined<T>(obj)`**
- 객체에서 `undefined` 값을 가진 속성을 제거한다.
- TypeORM `FindOptionsWhere<T>` 타입으로 반환한다.
- 빈 객체가 되면 `{}`를 반환한다 (spread 안전성).
- repository의 조회 조건 조합에 사용한다.

**`randomId()`**
- nanoid 기반 10자리 영숫자 ID 생성.
- 엔티티 ID를 미리 생성해야 할 때 사용한다.

### typeorm.ts

**`convertOptions<T>(args?)`**
- pagination(page, limit), 정렬(sort, order), relations를 TypeORM 옵션으로 변환한다.
- `skip = (page - 1) * limit`, `take = limit`

**`checkRangeValue(minValue?, maxValue?)`**
- 범위 조건을 TypeORM 연산자로 변환한다.
- min만: `MoreThanOrEqual`, max만: `LessThan`, 둘 다: `And(...)`

**`checkLikeValue({ search, searchValue })`**
- 문자열 검색을 `ILike('%value%')` 조건으로 변환한다.

**`checkInValue(values?)`**
- 배열을 `In(values)` 조건으로 변환한다.
- repository에서 enum 필터 배열(`types`, `statuses`, `roles` 등)을 처리할 때 기본적으로 사용한다.

**규칙**:
- repository에서 조회 조건을 만들 때 이 유틸들을 조합한다.
- enum 값을 필터로 받을 때도 단일값보다 배열 패턴을 우선하고, repository 내부에서 `checkInValue()`를 적용한다.
- service나 controller에서 TypeORM 연산자를 직접 쓰지 않는다.

## 10. 날짜 유틸 규칙 (`date/`)

- `dayjs` + `utc` + `timezone` 플러그인 사용.
- 기본 타임존: `Asia/Seoul`

| 함수 | 설명 |
|------|------|
| `today(format?)` | 현재 날짜 문자열 (기본 `YYYY-MM-DD`) |
| `todayAsDate()` | 현재 Date 객체 |
| `add(date, days, unit)` | 날짜 더하기 (minute / day) |
| `startOfDay(date, format?)` | 해당 날짜 시작 |
| `endOfDay(date, format?)` | 해당 날짜 끝 |
| `isPast(date)` | 과거 날짜 여부 |
| `getTimestamp()` | 현재 타임스탬프 (ms) |

**규칙**:
- 날짜 처리는 `new Date()` 대신 이 유틸을 사용한다.
- 타임존 이슈를 방지하기 위해 모든 함수가 `.tz()`를 거친다.

## 11. 새 lib 추가 규칙

1. `src/libs/<category>` 폴더 생성
2. 구현 파일 작성
3. `index.ts` barrel export 작성
4. `tsconfig.json`에 `@libs/<category>` alias가 이미 `@libs/*`로 커버되므로 추가 설정 불필요

## 12. 코드 스타일 규칙

- abstract 클래스에는 `abstract` 키워드를 명시한다.
- 제네릭 클래스는 `<T extends BaseClass>` 패턴으로 제약한다.
- private 필드 접근이 필요한 데코레이터에서는 `@ts-expect-error` 주석을 사용한다.
- 로거: `private readonly logger = new Logger(ClassName.name)` 패턴.
- 유틸 함수는 순수 함수로 작성하고, 클래스로 감싸지 않는다.
- 주석은 한국어로, `// NOTE:` 접두어를 사용한다.
- type-only import는 `import type { ... }` 또는 `type` 키워드를 사용한다.

## 13. DDD 계층 간 의존 흐름 요약

```text
Controller
  ↓ (DTO 전달)
DddService (@Transactional)
  ↓ (비즈니스 로직)
DddRepository (save/softRemove)
  ↓ (엔티티 + 이벤트 저장)
DddAggregate (publishEvent)
  ↓ (트랜잭션 종료 후)
EventEmitter → EventBoxDispatcher → BullMQ Queue → CommonConsumer
```

- Controller → Service → Repository → Entity 방향으로만 의존한다.
- 역방향 의존은 금지한다.
- 이벤트 발행은 `@Transactional()` 종료 후 자동으로 이루어진다.

## 14. 주의사항

- `DddService`의 `entityManager`, `context`, `eventEmitter`는 `private`이지만 `@Transactional()` 데코레이터가 런타임에 접근한다. 이 필드를 제거하거나 이름을 바꾸면 데코레이터가 깨진다.
- `TraceIdSubscriber`는 `DddAggregate`의 모든 하위 클래스를 감시한다. `DddAggregate`를 상속하지 않는 엔티티에는 감사 추적이 적용되지 않는다.
- `requesterValidatorPipe`의 `whitelist: true` 때문에 DTO에 선언하지 않은 필드는 자동으로 제거된다.
- `ExceptionFilter`의 Slack 메시지에 `[푸딩]` 접두어가 하드코딩되어 있다.
- `checkRangeValue`에서 `maxValue`는 `LessThan` (미만)이지 `LessThanOrEqual` (이하)이 아니다.
