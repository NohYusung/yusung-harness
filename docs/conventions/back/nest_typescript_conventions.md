---
title: NestJS TypeScript 백엔드 컨벤션
tags: [rules, code-conventions, nestjs, typescript]
updated: 2026-07-22
---

# NestJS TypeScript 백엔드 컨벤션

- 이 문서는 NestJS 기반 백엔드를 수정하기 전에 확인해야 하는 백엔드 코드 규칙을 한곳에 정리한 기준 문서다.
- 설정, 데이터베이스, 공통 인프라, 미들웨어, DDD 기반 도메인 모듈, DTO, validator, 이벤트, Swagger, 작업 계획서 규칙을 함께 다룬다.
- 문서와 현재 코드가 충돌하면 차이를 먼저 사용자에게 알리고, 예외가 필요한지 확인한다.

<a id="reading-order"></a>

## 1. 작업 전 확인 순서

| 작업                                        | 먼저 확인할 섹션                                                                                                             |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 신규 domain module 생성 또는 구조 변경      | [도메인 모듈과 계층](#domain-modules), [신규 모듈 생성 절차](#module-generation)                                             |
| endpoint 추가·수정                          | [Controller](#controllers), [DTO](#dto), [도메인 validator](#domain-validator), [Application Service](#application-services) |
| DB 연결, entity 등록, repository query 변경 | [데이터베이스와 엔티티 등록](#databases), [Repository](#repositories)                                                        |
| 환경 변수 또는 설정 section 변경            | [설정 관리](#configs)                                                                                                        |
| middleware, request context, trace ID 변경  | [요청 컨텍스트와 미들웨어](#request-context)                                                                                 |
| common/lib 기능 추가·변경                   | [공통 모듈](#common), [공용 라이브러리](#libs)                                                                               |
| 비동기 도메인 이벤트 추가                   | [도메인 이벤트와 event-box](#domain-events)                                                                                  |
| Swagger JSON 또는 API 문서 변경             | [Swagger](#swagger)                                                                                                          |

<a id="architecture"></a>

## 2. 전체 구조와 공통 원칙

### 2.1 의존 방향

```text
Controller → Application Service → Repository → Entity
```

- 역방향 의존은 금지한다.
- Controller는 request parsing과 Service 호출만 담당한다.
- Service는 use case orchestration과 여러 Repository 조합을 담당한다.
- Repository는 Entity와 TypeORM 데이터 접근만 담당한다.
- Service는 HTTP `request`/`response` 객체를 직접 다루지 않고, Repository는 요청 문맥을 직접 다루지 않는다.
- 다른 도메인 데이터를 읽을 때는 그 도메인의 Repository를 생성자에 주입하고 `find(...)`를 호출한다. Service가 `entityManager`로 다른 도메인 Entity를 직접 조회하거나 내부 helper로 우회하지 않는다.
- 공통 인프라와 비즈니스 모듈을 분리하고, Controller에서 DB 쿼리·이벤트 발행·Slack 호출 같은 로직을 직접 수행하지 않는다.

### 2.2 루트 모듈과 서비스 그룹

```ts
import adminsModule from "./services/admins";
import clientsModule from "./services/clients";
import generalsModule from "./services/generals";

imports: [
  ConfigsModule,
  DatabasesModule,
  CommonModule,
  EventEmitterModule.forRoot(),
  ...adminsModule,
  ...clientsModule,
  ...generalsModule,
];
```

- `src/services/admins.ts`, `clients.ts`, `generals.ts`는 모듈 배열을 default export한다.
- `Admin*Module`은 `admins.ts`, `Client*Module`은 `clients.ts`, `General*Module`은 `generals.ts`에 등록한다.
- 하나의 도메인이 여러 접근 타입에 필요하면 타입별 모듈을 각 그룹에 등록하되, 같은 모듈 자체를 여러 그룹에 중복 등록하지 않는다.
- Swagger 문서도 서비스 그룹을 기준으로 분리된다.

```ts
// src/services/admins.ts
import { AdminModule } from "./admin/admin.module";
import { AdminNoticeModule } from "./notice/admin-notice.module";
export default [AdminModule, AdminNoticeModule];

// src/services/clients.ts
export default [];

// src/services/generals.ts
import { GeneralNoticeModule } from "./notice/general-notice.module";
export default [GeneralNoticeModule];
```

### 2.3 path alias와 import

- 다음 `tsconfig` alias를 사용한다.
  - `@configs`
  - `@databases`
  - `@common/*`
  - `@middlewares`
  - `@libs/*`
  - `@services/*`
- 한 도메인 모듈 내부 파일은 상대 경로로 참조하고, 공통 코드나 다른 큰 영역은 alias를 사용한다.
- 깊은 상대 경로(`../../../`)는 alias로 바꾼다.
- type-only import는 `import type { ... }` 또는 inline `type` 키워드를 사용한다.

```ts
// 같은 도메인 모듈 내부
import { AdminRepository } from "../repository/admin.repository";

// 공통 코드
import { ConfigsService } from "@configs";
import { ContextKey } from "@common/context";
import { DddAggregate, DddRepository, DddService } from "@libs/ddd";
```

### 2.4 공통 코드 스타일

- 클래스명은 `PascalCase`, 일반/private 필드는 `camelCase`를 사용한다.
- enum 이름은 `PascalCase`, 키는 `SCREAMING_SNAKE_CASE`를 사용한다. 값은 기존 도메인 규칙에 따라 `SCREAMING_SNAKE_CASE` 또는 lowercase를 유지한다.
- 로거는 `private readonly logger = new Logger(ClassName.name)` 패턴을 사용한다.
- DI는 생성자의 `private readonly`를 기본으로 하고, 기반 클래스 연동이 필요한 경우에만 프로퍼티 `@Inject()` + definite assignment(`!`)를 사용한다.
- 유틸은 상태 없는 순수 함수로 만들고 불필요하게 클래스로 감싸지 않는다.
- 주석은 한국어로 쓰며 구현상 주의는 `// NOTE:` 형식을 사용한다.
- abstract 클래스에는 `abstract`를 명시하고, 제네릭 기반 클래스는 `<T extends BaseClass>`처럼 제약한다.
- 데코레이터가 private 필드에 접근해야 하는 경우 `@ts-expect-error`를 사용한다.

<a id="configs"></a>

## 3. 설정 관리 (`src/configs`)

### 3.1 역할과 구조

- `src/configs`는 `.env.{NODE_ENV}` 값을 타입이 있는 설정 section으로 변환하고, 앱 부팅 시 누락값을 검증한 뒤 Nest DI에 올리는 경계 모듈이다.
- `AppModule`이 `ConfigsModule`을 import하고, `ConfigsModule`은 `@Global()`이므로 비즈니스 모듈은 `@configs`의 `ConfigsService`를 바로 주입받는다.

```text
src/configs/
  index.ts              # ConfigsModule, ConfigsService 공개 API
  configuration.ts      # 설정 함수와 section interface
  configs.service.ts    # 타입이 있는 설정 getter
  configs.module.ts     # ConfigModule 등록과 env 검증
```

### 3.2 `configuration.ts`

- 환경 변수를 설정 객체로 매핑하는 함수를 default export한다.
- section별 interface를 정의하고 외부에서 사용할 interface만 export한다. 반환 객체의 내부 shape인 `AppConfig`는 export하지 않는다.
- 현재 section은 `mysql`, `redis`, `slack`, `jwt`, `dubright`, `aws`, `naverWorks`, `email`이다.
- 포트 등 고정 기본값은 여기에서 지정한다. 예: MySQL `3306`, Redis `6379`.
- Email은 빈 문자열 기본값, `Number(SMTP_PORT || 587)`, `SMTP_SECURE === 'true'` 파싱을 사용한다. SMTP env가 빠져도 config validation에서 즉시 실패하지 않을 수 있고, 실제 발송 시 `EmailService`가 실패할 수 있다.

```ts
export interface JwtConfig {
  accessTokenSecret: string;
  refreshTokenSecret: string;
  jobToken: string;
  libraryTokenSecret: string;
}

export interface DubrightConfig {
  dubrightV0Api: string;
  dubrightApi: string;
  accessToken: string;
}

export interface AwsConfig {
  contentsBucketName: string;
  bucketName: string;
  region: string;
  awsUrl: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export default (env: Record<string, any> = process.env): AppConfig => ({
  mysql: {
    type: "mysql",
    port: 3306,
    host: env.MYSQL_HOST,
    username: env.MYSQL_USERNAME,
  },
  redis: { host: env.REDIS_HOST, port: 6379 },
  slack: {
    webhookUrl: env.SLACK_WEBHOOK_URL,
    jobWebhookUrl: env.SLACK_JOB_WEBHOOK_URL,
  },
  jwt: {
    accessTokenSecret: env.JWT_ACCESS_TOKEN_SECRET,
    refreshTokenSecret: env.JWT_REFRESH_TOKEN_SECRET,
    jobToken: env.JOB_TOKEN,
    libraryTokenSecret: env.JWT_LIBRARY_TOKEN_SECRET,
  },
  dubright: {
    dubrightApi: env.DUBRIGHT_API,
    accessToken: env.DUBRIGHT_ACCESS_TOKEN,
  },
  aws: {
    bucketName: env.AWS_BUCKET_NAME,
    contentsBucketName: env.AWS_CONTENTS_BUCKET_NAME,
  },
  email: {
    smtpHost: env.SMTP_HOST || "",
    smtpPort: Number(env.SMTP_PORT || 587),
  },
});
```

### 3.3 `ConfigsService`, 모듈, barrel

- `ConfigsService`는 Nest `ConfigService`를 래핑하는 `@Injectable()` 서비스다.
- 각 section은 getter로 노출하고, 반환 타입은 `configuration.ts` interface 또는 외부 라이브러리 타입을 사용한다.
- 값은 module load 시 검증이 끝났다는 전제에서 non-null assertion(`!`)으로 가져온다.
- `isProduction()`, `isLocal()`, `isDevelopment()`를 일반 메서드로 제공한다.

```ts
get mysql() { return this.configService.get<DataSourceOptions>('mysql')!; }
get redis() { return this.configService.get<RedisOptions>('redis')!; }
get slack() { return this.configService.get<SlackConfig>('slack')!; }
get jwt() { return this.configService.get<JwtConfig>('jwt')!; }
get dubright() { return this.configService.get<DubrightConfig>('dubright')!; }
get aws() { return this.configService.get<AwsConfig>('aws')!; }
get naverWorks() { return this.configService.get<NaverWorksConfig>('naverWorks')!; }
get email() { return this.configService.get<EmailConfig>('email')!; }
```

- `ConfigsModule`은 `@Global()` + `@Module()`로 선언한다.
- `ConfigModule.forRoot()`에 다음을 지정한다.
  - `envFilePath: .env.${NODE_ENV || 'local'}`
  - `load: [configuration]`
  - `validate: validateConfigObject`
- `providers`와 `exports`에 `ConfigsService`를 등록한다.
- `index.ts`는 `ConfigsModule`과 `ConfigsService`만 re-export한다. `configuration.ts`의 type은 필요한 곳에서 직접 import한다.

```ts
export * from "./configs.module";
export * from "./configs.service";
```

### 3.4 설정 section map

| section      | 환경 변수                                                                                                            | 주요 소비처                                       | 역할                                      |
| ------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------- |
| `mysql`      | `MYSQL_HOST`, `MYSQL_USERNAME`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`                                                   | `DatabasesModule`                                 | TypeORM MySQL 연결                        |
| `redis`      | `REDIS_HOST`                                                                                                         | `DatabasesModule`, `ActiveSessionService`         | BullMQ backend, active session store      |
| `slack`      | `SLACK_WEBHOOK_URL`, `SLACK_JOB_WEBHOOK_URL`                                                                         | `SlackService`, exception filter, job interceptor | 장애·queue 실패·scheduler 결과 알림       |
| `jwt`        | `JWT_ACCESS_TOKEN_SECRET`, `JWT_REFRESH_TOKEN_SECRET`, `JWT_LIBRARY_TOKEN_SECRET`, `JOB_TOKEN`                       | `JwtHelperService`, `JobGuard`                    | 관리자·이용자·도서관 JWT와 scheduler auth |
| `dubright`   | `DUBRIGHT_API`, `DUBRIGHT_V0_API`, `DUBRIGHT_ACCESS_TOKEN`                                                           | `DubrightApiService`, Dubright resource download  | 외부 API와 legacy resource base           |
| `aws`        | `AWS_BUCKET_NAME`, `AWS_CONTENTS_BUCKET_NAME`, `AWS_REGION`, `AWS_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | `AwsS3Service`, player helper, Dubright download  | 파일·콘텐츠 S3 upload와 public URL        |
| `naverWorks` | `NAVER_WORKS_CLIENT_ID`, `NAVER_WORKS_CLIENT_SECRET`, `NAVER_WORKS_REDIRECT_URL`                                     | `NaverWorksService`                               | 본사 관리자 Naver Works OAuth             |
| `email`      | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`                                   | `EmailService`                                    | SMTP 발송                                 |
| 시스템       | `NODE_ENV`                                                                                                           | 전역                                              | `local`, `development`, `production` 선택 |

### 3.5 환경 파일과 검증

- 환경 파일은 루트의 `.env.local`, `.env.development`, `.env.production`이다. `NODE_ENV`가 없으면 `local`이다.
- `validateConfigObject`가 `configuration()`의 모든 값을 재귀 순회하고 `undefined` 또는 `NaN`이면 다음 형태로 throw한다.

```text
❌ .env 파일의 "{key}" 설정 값이 누락되었습니다.
```

- 빈 문자열은 누락으로 보지 않는다. 따라서 Email처럼 빈 문자열 기본값을 허용하는 section은 실제 소비처의 validation도 확인한다.
- `SWAGGER_GEN`이 있으면 검증을 건너뛴다. 이 값은 Swagger JSON 생성 전용 escape hatch이며 런타임 설정 완전성 판단에 사용하지 않는다.

```ts
const validateConfigObject = (envConfig: Record<string, any>) => {
  if (envConfig.SWAGGER_GEN) return envConfig;

  const fullConfig = configuration(envConfig);
  const checkNodes = (obj: any, parentKey = "") => {
    Object.entries(obj).forEach(([key, value]) => {
      const currentKey = parentKey ? `${parentKey}.${key}` : key;
      if (value === undefined || Number.isNaN(value)) {
        throw new Error(
          `❌ .env 파일의 "${currentKey}" 설정 값이 누락되었습니다.`,
        );
      }
    });
  };
};
```

### 3.6 사용과 확장 규칙

- 비즈니스 모듈에서 `process.env`를 직접 읽지 않고 `ConfigsService` getter를 사용한다.
- 환경 판별도 `configsService.isProduction()` 등으로 집중한다. 이 서비스 내부의 환경 판별 메서드가 `process.env.NODE_ENV`를 직접 읽는 것은 허용된 예외다.

```ts
// 권장
constructor(private readonly configsService: ConfigsService) {}
this.configsService.mysql;

// 금지
process.env.MYSQL_HOST;
```

- 새 설정 section 추가 순서:
  1. `.env.*`에 환경 변수를 추가한다.
  2. `configuration.ts`에 interface, `AppConfig` property, 반환 객체 mapping을 추가한다.
  3. `configs.service.ts`에 getter를 추가한다.
  4. `src/test/setup-env.ts`에 테스트 기본값을 추가한다.
  5. `ConfigsModule`과 `index.ts`는 수정하지 않는다.
- `ConfigService`는 `NestConfigService`로 alias import한다.
- interface에는 불필요한 JSDoc을 달지 않는다.
- `configuration.ts`의 Redis 타입은 `ioredis`, `configs.service.ts`의 Redis 타입은 `bullmq`에서 오지만 서로 호환되므로 현행을 유지한다.

<a id="databases"></a>

## 4. 데이터베이스와 엔티티 등록 (`src/databases`)

### 4.1 구조와 역할

```text
src/databases/
  index.ts              # DatabasesModule만 re-export
  databases.module.ts   # TypeORM(MySQL) + BullMQ(Redis)
  entities.ts           # 전체 Entity default export 배열
```

- `DatabasesModule`은 MySQL과 Redis를 초기화하고 시작 시 연결을 검증하며 종료 시 정리한다.
- Module class는 `OnModuleInit`, `OnModuleDestroy` lifecycle interface를 구현한다.
- `@Global()`이 아니므로 `AppModule`에서 직접 import한다.
- 프로젝트 전역에서는 `@databases` alias로 import한다.

### 4.2 TypeORM과 BullMQ 설정

```ts
TypeOrmModule.forRootAsync({
    inject: [ConfigsService],
    useFactory: (configsService: ConfigsService) => ({
        ...configsService.mysql,
        entities,
        synchronize: configsService.isProduction() ? false : true,
        logging: false,
    }),
}),

BullModule.forRootAsync({
    inject: [ConfigsService],
    useFactory: (configsService: ConfigsService) => ({
        connection: {
            host: configsService.redis.host,
            port: configsService.redis.port,
            tls: configsService.isLocal() ? undefined : {},
        },
        prefix: 'yusung',
    }),
}),
BullModule.registerQueue(...queues),
```

- `ConfigsService` factory 패턴으로 연결 정보를 만든다.
- TypeORM `entities`에는 `entities.ts` 배열을 그대로 전달한다.
- production의 `synchronize`는 반드시 `false`, local/development는 `true`다. `logging`은 모든 환경에서 `false`다.
- Redis TLS는 local에서 `undefined`, development/production에서 `{}`다.
- Redis prefix는 각 서비스 이름에 맞게 적절히 설정한다.
- queue 배열은 `@common/event-box/queues`의 default export를 spread한다.

| 항목                  | local       | development | production |
| --------------------- | ----------- | ----------- | ---------- |
| TypeORM `synchronize` | `true`      | `true`      | `false`    |
| TypeORM `logging`     | `false`     | `false`     | `false`    |
| Redis TLS             | `undefined` | `{}`        | `{}`       |
| Redis prefix          | `yusung`    | `yusung`    | `yusung`   |

### 4.3 연결 검사와 lifecycle

```ts
constructor(
    private readonly datasource: DataSource,
    @InjectQueue(QueueName.HEALTH) private readonly healthQueue: Queue,
) {}
```

- `DataSource`는 타입으로 주입하고, Queue는 `@InjectQueue(QueueName.XXX)`로 주입한다.
- `onModuleInit()`에서 MySQL과 Redis 상태를 검사하고 실패하면 앱 부팅을 중단한다.
- `onModuleDestroy()`에서 초기화된 DataSource를 `destroy()`한다.

```ts
private async checkMysqlConnection() {
    if (this.datasource.isInitialized) {
        this.logger.log('Mysql Database is initialized.');
    } else {
        throw new Error('Mysql Database is not initialized.');
    }
}

private async checkRedisConnection() {
    const status = (await this.healthQueue.client).status;
    if (status === 'ready') {
        this.logger.log('Redis connection is ready.');
    } else {
        throw new Error('Redis connection is not ready.');
    }
}
```

### 4.4 `entities.ts`

- 모든 TypeORM Entity를 한 배열에서 관리하고 배열을 default export한다.
- 새 Entity 추가 순서:
  1. 도메인의 `domain/<domain>.entity.ts`를 작성한다.
  2. `entities.ts`에서 import한다.
  3. default export 배열에 추가한다.
  4. `databases.module.ts`는 수정하지 않는다.

```ts
import { DddEvent } from "@libs/ddd";
import { Admin } from "@services/admin/domain/admin.entity";

export default [DddEvent, Admin];
```

| 현재 Entity | 위치                                  | table        |
| ----------- | ------------------------------------- | ------------ |
| `DddEvent`  | `@libs/ddd`                           | `ddd_events` |
| `Admin`     | `@services/admin/domain/admin.entity` | `admins`     |

- `index.ts`는 `export * from './databases.module';`만 포함하고 `entities.ts`는 re-export하지 않는다.
- Entity를 배열에서 누락하면 TypeORM이 table을 인식하지 못한다.
- production에서 `synchronize: true`로 바꾸면 schema 자동 변경으로 데이터 유실 위험이 있다.
- 새 Queue는 `QueueName` enum에 추가한다. `registerQueue(...queues)`가 자동 반영한다.
- 연결 검사의 `healthQueue`가 의존하는 `QueueName.HEALTH`는 삭제하지 않는다.

<a id="request-context"></a>

## 5. 요청 컨텍스트와 미들웨어

### 5.1 middleware 구조와 실행 순서

```text
src/middlewares/
  index.ts                  # barrel export
  context.middleware.ts     # AsyncLocalStorage store 생성
  uuid.middleware.ts        # traceId 설정
```

```ts
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ContextMiddleware, UUIDMiddleware).forRoutes("*");
  }
}
```

```text
요청 → ContextMiddleware → UUIDMiddleware → Guard/Interceptor → Controller
```

- 두 middleware 모두 전체 route에 적용한다.
- `ContextMiddleware`가 store를 먼저 생성해야 `UUIDMiddleware`가 `Context.set()`을 호출할 수 있다.
- 순서를 바꾸면 `Error('There is no context store.')`가 발생한다.

### 5.2 `ContextMiddleware`

```ts
@Injectable()
export class ContextMiddleware implements NestMiddleware {
  use(_: Request, __: Response, next: NextFunction) {
    const store = new Map<string, any>();
    asyncLocalStorage.run(store, () => next());
  }
}
```

- `@common/context`에서 `asyncLocalStorage` 인스턴스를 직접 import한다.
- request/response를 사용하지 않으므로 `_`, `__`로 명명한다.
- `run()` 안에서 `next()`를 호출하므로 이후 비동기 호출 체인이 같은 store를 공유한다.

### 5.3 `UUIDMiddleware`

```ts
@Injectable()
export class UUIDMiddleware implements NestMiddleware {
  constructor(private readonly context: Context) {}

  use(req: Request, _: Response, next: NextFunction) {
    const traceId = req.get("x-request-id") || uuid();
    this.context.set(ContextKey.TRACE_ID, traceId);
    next();
  }
}
```

- `x-request-id`가 있으면 그 값을 사용하고, 없으면 시간순 정렬 가능한 UUID v7을 생성한다.
- trace ID는 `ContextKey.TRACE_ID`에 저장하며 로깅, 예외 필터, TypeORM subscriber, 이벤트가 사용한다.
- load balancer나 API gateway가 외부에서 trace ID를 전달할 수 있다.

### 5.4 middleware 추가 규칙

1. `src/middlewares/<name>.middleware.ts`를 생성한다.
2. `@Injectable()`과 `NestMiddleware`를 구현한다.
3. `index.ts`에 `export *`를 추가한다.
4. `AppModule.configure()`의 `consumer.apply(...).forRoutes()`에 등록한다.
5. 의존 순서가 있으면 `apply()` 인자 순서를 조정한다.

- 파일명은 `<name>.middleware.ts`, 클래스명은 `PascalCase + Middleware`다.
- Express type은 type-only import한다.
- middleware에는 context 초기화·인증 token parsing 같은 횡단 관심사만 두고 비즈니스 로직을 넣지 않는다.

<a id="common"></a>

## 6. 공통 모듈 (`src/common`)

### 6.1 구조와 루트 모듈

```text
src/common/
  common.module.ts          # @Global 루트 모듈
  types.ts                  # 공용 enum, DTO, type
  context/
    index.ts
    context.module.ts
    context.service.ts
  event-box/
    index.ts
    event-box.module.ts
    queues.ts
    common-dispatcher.ts
    common-consumer.ts
    event-box-dispatcher.provider.ts
  guards/
    index.ts
    guard.module.ts
    admin.guard.ts
    user.guard.ts
    client.guard.ts
    job.guard.ts
  jwt-helper/
    index.ts
    jwt-helper.module.ts
    jwt-helper.service.ts
  slack/
    index.ts
    slack.module.ts
    slack.service.ts
```

```ts
@Global()
@Module({
  imports: [ContextModule, SlackModule, EventBoxModule],
  exports: [ContextModule, SlackModule, EventBoxModule],
})
export class CommonModule {}
```

- common은 비즈니스 로직을 두지 않는 인프라 계층이다.
- 비즈니스 모듈에서 반복되는 인프라 기능을 common으로 올린다.
- 각 feature는 `index.ts`, `<feature>.module.ts`, service 또는 핵심 파일로 구성한다.
- 간단한 feature module은 같은 Service를 `providers`와 `exports`에 등록한다.
- 새 feature는 service, module, barrel을 만든 뒤 `CommonModule`의 imports/exports 양쪽에 등록한다.

### 6.2 공용 타입 (`types.ts`)

| 이름              | 종류  | 설명                                           |
| ----------------- | ----- | ---------------------------------------------- |
| `OrderType`       | enum  | 정렬 방향 `ASC`, `DESC`                        |
| `PaginationDto`   | class | `page`, `limit`, `sort`, `order`               |
| `CalendarDate`    | type  | `YYYY-MM-DD` 또는 `YYYY-MM-DD HH:mm:ss` 문자열 |
| `AgeLimit`        | enum  | `NONE=0`, `ADULT=19`                           |
| `CastingRoleType` | enum  | `main`, `supporting`                           |
| `ContentType`     | enum  | `voicetoon`                                    |
| `SocialType`      | enum  | `google`, `kakao`, `naver`, `apple`            |

- 전역 공유 타입은 `@common/types`에서 import한다.
- 특정 도메인 전용 타입은 해당 도메인에 둔다.
- 공통 DTO에는 `class-validator`, `class-transformer`, `@nestjs/swagger` decorator를 함께 사용한다.
- query string의 숫자에는 `@Type(() => Number)`를 붙인다.

```ts
export class PaginationDto {
  @ApiProperty({
    description: "페이지 번호",
    example: 1,
    default: 1,
    required: false,
  })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  page?: number;
}
```

### 6.3 `Context`

- Node.js `AsyncLocalStorage`를 래핑하여 요청 단위 EntityManager, trace ID, 인증 정보를 함수 파라미터 없이 공유한다.

| export              | 설명                                                           |
| ------------------- | -------------------------------------------------------------- |
| `Context`           | `get<K>(key)`, `set(key, value)`를 제공하는 injectable service |
| `ContextKey`        | context key enum                                               |
| `asyncLocalStorage` | 인프라 코드가 직접 사용할 storage instance                     |

```ts
export enum ContextKey {
  ENTITY_MANAGER = "entityManager",
  DDD_EVENTS = "dddEvents",
  TRACE_ID = "traceId",
  ADMIN = "admin",
  USER = "user",
}
```

- 비즈니스 코드는 `Context`를 주입하고 `get<Type>(ContextKey.XXX)`로 접근한다.
- `asyncLocalStorage` 직접 접근은 `CommonConsumer`, transactional decorator, middleware 같은 인프라로 제한한다.
- 새 key는 `ContextKey` enum에 추가한다.
- store가 없는 상태에서 `set()`하면 에러가 발생한다.
- client 인증 흐름이 `ContextKey.CLIENT`를 사용하는 코드 패턴과 연결되므로 도입 시 enum과 인증 Guard 저장 로직을 함께 확인한다.

### 6.4 Slack

- `SlackService`는 IncomingWebhook을 사용해 일반 에러/알림과 job 결과를 분리 전송한다.
- 일반 `webhook`은 `send()`, job 전용 `jobWebhook`은 `sendJob()`이 사용한다.
- URL이 없으면 `null`로 두고 호출을 조용히 무시한다.
- 전송 실패가 비즈니스 요청을 실패시키지 않도록 throw하지 않고 `console.error` 등으로 처리한다.
- local에서는 Slack 알림을 보내지 않는 패턴을 유지한다.

```ts
constructor(private readonly configsService: ConfigsService) {
    this.webhook = this.configsService.slack.webhookUrl
        ? new IncomingWebhook(this.configsService.slack.webhookUrl)
        : null;
}
```

- 일반 에러는 `slackService.send(message)`, job은 `slackService.sendJob({ request, response, start })`로 보낸다.

<a id="guards"></a>

### 6.5 인증 Guard

#### 공통 패턴

```ts
@Injectable()
export class XxxGuard implements CanActivate {
  constructor(
    private readonly xxxRepository: XxxRepository,
    private readonly jwtHelper: JwtHelperService,
    private readonly context: Context,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);
    // 1. JWT 검증
    // 2. 사용자/관리자 조회
    // 3. 상태·권한 검증
    // 4. Context 저장
    return true;
  }

  private extractToken(request: Request) {
    const [type, token] = request.get("Authorization")?.split(" ") || [];
    if (type !== "Bearer" || !token) {
      throw new UnauthorizedException("로그인 인증에 실패했습니다.");
    }
    return token;
  }
}
```

| Guard         | 인증                          | Context                                     | 검사                                        |
| ------------- | ----------------------------- | ------------------------------------------- | ------------------------------------------- |
| `AdminGuard`  | Bearer JWT                    | `ContextKey.ADMIN`                          | Admin 존재 + ACTIVE                         |
| `UserGuard`   | Bearer JWT                    | `ContextKey.USER`                           | User 존재 + token 검증                      |
| `ClientGuard` | Bearer JWT                    | `ContextKey.ADMIN` 또는 도입된 `CLIENT` key | Admin 존재 + ACTIVE + PARTNER + Client 관계 |
| `JobGuard`    | Bearer JWT 또는 custom header | 저장 안 함                                  | scheduler/admin 실행 권한                   |

- `@UseGuards()`는 Controller 클래스 level에 적용한다. method level이 필요하면 Controller 분리를 우선한다.
- `admin-*.controller.ts`는 `AdminGuard`, `client-*`는 `ClientGuard`, `general-*`는 `UserGuard`, job Controller는 `JobGuard`를 사용한다.

#### `JobGuard`

```text
Authorization 없음
  → x-yusung-key == configsService.jwt.jobToken 확인

Authorization: Bearer <token> 있음
  → JWT decode → Admin 조회 → admin.jobToken == configsService.jwt.jobToken 확인
```

- 다른 Guard와 달리 token이 없어도 `extractToken()`은 `undefined`를 반환한다.
- Context에 인증 정보를 저장하지 않는다.
- scheduler의 server-to-server 인증을 위해 `x-yusung-key`를 사용한다.
- `configsService.jwt.jobToken`이 config에 있어야 하고, 관리자별 권한을 구분하면 Admin Entity에 `jobToken` column이 필요하다.
- `GuardModule`의 providers/exports와 `index.ts`에 `JobGuard`를 등록한다.

```ts
@Injectable()
export class JobGuard implements CanActivate {
  constructor(
    private readonly configsService: ConfigsService,
    private readonly jwtHelper: JwtHelperService,
    private readonly adminRepository: AdminRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);
    const jobToken = this.configsService.jwt.jobToken;

    if (!token) {
      const jobTokenByHeader = request.headers["x-service-key"];
      if (jobToken !== jobTokenByHeader) {
        throw new UnauthorizedException("Job token이 존재하지 않습니다.");
      }
    } else {
      const { id } = this.jwtHelper.decode<{ id: number }>(token);
      const [admin] = await this.adminRepository.find({ id });
      if (!admin) {
        throw new UnauthorizedException("해당 관리자가 존재하지 않습니다.");
      }
      if (admin.jobToken !== jobToken) {
        throw new UnauthorizedException(
          "해당 관리자가 스케쥴러를 실행할 권한이 존재하지 않습니다.",
        );
      }
    }
    return true;
  }

  private extractToken(request: Request) {
    const [type, token] = request.get("Authorization")?.split(" ") || [];
    return type === "Bearer" && token ? token : undefined;
  }
}
```

#### `GuardModule`

```ts
@Module({
  imports: [JwtHelperModule],
  providers: [
    AdminGuard,
    UserGuard,
    ClientGuard,
    JobGuard,
    AdminRepository,
    UserRepository,
    ClientRepository,
  ],
  exports: [
    AdminGuard,
    UserGuard,
    ClientGuard,
    JobGuard,
    AdminRepository,
    UserRepository,
    ClientRepository,
  ],
})
export class GuardModule {}
```

- Guard가 의존하는 Repository도 providers/exports 양쪽에 등록하고 `JwtHelperModule`을 import한다.

### 6.6 JWT helper

```text
src/common/jwt-helper/
  index.ts
  jwt-helper.module.ts
  jwt-helper.service.ts
```

| 메서드                                           | 용도                        | 만료  |
| ------------------------------------------------ | --------------------------- | ----- |
| `signAdminAccessToken({ id })`                   | 관리자 JWT                  | 1일   |
| `signAccessToken({ id, clientId, domain })`      | 사용자 JWT                  | 4시간 |
| `signLibraryAccessToken({ memberId, clientId })` | 도서관 JWT                  | 1일   |
| `verifyAccessToken(token)`                       | 일반 JWT 검증·decode        | -     |
| `verifyLibraryAccessToken(token)`                | 도서관 JWT 별도 secret 검증 | -     |
| `decode(token)`                                  | 검증 없는 decode            | -     |

- Guard는 검증 없는 `decode()`보다 `verifyAccessToken()`을 기본으로 사용한다. JobGuard의 명시적 흐름은 별도 예외다.
- secret과 expiry는 `ConfigsService`에서 받는다.
- Guard나 비즈니스 Service가 `jsonwebtoken`을 직접 사용하지 않고 JWT 로직을 이 helper에 집중한다.

<a id="libs"></a>

## 7. 공용 라이브러리 (`src/libs`)

### 7.1 구조와 alias

```text
src/libs/
  date/             # dayjs + Asia/Seoul
  ddd/              # DddAggregate, DddEvent, DddRepository, DddService
  decorators/       # Transactional, EventHandler
  filters/          # ExceptionFilter
  interceptors/     # RequestLogger, Job, TraceIdSubscriber
  logger/           # Winston, getLogContext
  pipes/            # requesterValidatorPipe
  utils/            # helper, TypeORM utilities
```

- 각 하위 폴더는 `index.ts`에서 barrel export한다.
- `@libs/ddd`, `@libs/utils`, `@libs/logger`, `@libs/decorators`, `@libs/filters`, `@libs/interceptors`, `@libs/pipes`, `@libs/date`를 사용한다.
- 새 category는 폴더, 구현, barrel을 만들면 되고 `@libs/*`가 이미 cover하므로 `tsconfig`를 고치지 않는다.

### 7.2 DDD 기반 클래스

#### `DddAggregate`

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

| 메서드                    | 역할                                                   |
| ------------------------- | ------------------------------------------------------ |
| `publishEvent(event)`     | 내부 이벤트 배열에 추가                                |
| `getPublishedEvents()`    | 이벤트 배열 복사본 반환                                |
| `setTraceId(traceId)`     | 신규면 `createdBy`, 항상 `updatedBy` 설정              |
| `stripUnchanged(changed)` | lodash `isEqual`과 `stripUndefined`로 변경 필드만 반환 |
| `toInstance<T>(dto)`      | `plainToInstance` 기반 DTO 변환                        |

- 모든 도메인 Entity가 상속한다.
- `createdBy`, `updatedBy`는 `select: false`, `deletedAt`은 soft delete용이다.
- 상태 변경 메서드는 `publishEvent()`로 이벤트를 쌓고 Repository 저장 흐름이 처리한다.

#### `DddEvent`

- table은 `ddd_events`, index는 `['eventStatus', 'createdAt']`이다.

```ts
export enum DddEventStatus {
  PENDING = "pending",
  PROCESSED = "processed",
  FAILED = "failed",
}
```

| column                   | type      | 의미                             |
| ------------------------ | --------- | -------------------------------- |
| `id`                     | UUID auto | PK                               |
| `traceId`                | string    | 요청 추적 ID                     |
| `eventType`              | string    | `constructor.name`               |
| `payload`                | text      | JSON payload                     |
| `eventStatus`            | enum      | `PENDING` → `PROCESSED`/`FAILED` |
| `occurredAt`             | Date      | 이벤트 발생 시각                 |
| `createdAt`, `updatedAt` | Date      | 자동 생성·갱신                   |

- 생성자가 `eventType`과 `occurredAt`을 설정한다.
- `fromEvent(event)`가 payload를 JSON 직렬화해 저장 가능한 Entity를 만든다.
- class name이 event type이므로 안정적으로 유지한다.

#### `DddRepository`

```ts
export abstract class DddRepository<T extends DddAggregate> {
  abstract entityClass: ObjectType<T>;

  constructor(
    @InjectDataSource() private readonly datasource: DataSource,
    private readonly context: Context,
  ) {}
}
```

| API                         | 역할                                                   |
| --------------------------- | ------------------------------------------------------ |
| `entityManager`             | Context transaction manager 또는 기본 manager          |
| `createQueryBuilder(alias)` | `entityClass` 기반 builder                             |
| `save(entities)`            | trace ID 설정, Entity와 event 저장, Context event 누적 |
| `softRemove(entities)`      | TypeORM soft delete                                    |

- `save()`는 Aggregate event를 `DddEvent`로 변환해 DB에 저장하고 `ContextKey.DDD_EVENTS`에 누적한다.
- transaction 안에서는 Context의 EntityManager, 밖에서는 기본 EntityManager를 사용한다.

#### `DddService`

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

- `@Transactional()`과 함께 쓰는 기반 클래스다.
- 세 필드는 decorator가 runtime에 접근하므로 제거하거나 이름을 바꾸지 않는다.
- 하위 Service가 이 의존성을 다시 선언하지 않는다.

### 7.3 기반 decorator

#### `@Transactional()`

1. `entityManager.transaction()`을 시작한다.
2. transaction EntityManager를 `ContextKey.ENTITY_MANAGER`에 둔다.
3. 원래 메서드를 실행한다.
4. transaction 종료 후 EntityManager context를 `null`로 초기화한다.
5. `ContextKey.DDD_EVENTS`의 이벤트마다 `eventEmitter.emit('ddd-event.created', dddEvent)`를 호출한다.
6. 이벤트 목록을 초기화한다.

```ts
@Transactional()
async createSomething(args: any) {
    // repository.save()가 transaction EntityManager를 사용한다.
}
```

#### `@EventHandler(EventClass, QueueName, options?)`

- `CommonDispatcher.pushEventMap()`으로 event class와 Queue를 연결한다.
- 메서드 동작 자체는 바꾸지 않는다.
- 구체적인 handler 규칙은 [도메인 이벤트와 event-box](#domain-events)에 정의한다.

### 7.4 Filter, interceptor, subscriber

#### `ExceptionFilter`

- `@Catch()` 전역 필터이며 `SlackService`, `Context`, `ConfigsService`에 의존한다.
- 5xx는 `logger.error` + local이 아닐 때 Slack, 400은 `logger.warn` + local이 아닐 때 Slack, 나머지 4xx는 `logger.warn`만 수행한다.
- 응답은 `{ data: { message: string } }`이다.
- 5xx message는 `서버에 예기치 않은 오류가 발생했습니다.`로 고정하고, 4xx는 실제 예외 message를 전달한다.
- Slack에는 method, URL, trace ID, stack, body를 포함한다. 현재 `[푸딩]` prefix가 hard-coded되어 있다.

#### `RequestLoggerInterceptor`

- 모든 HTTP 요청의 method, URL, duration, trace ID를 RxJS `tap()`에서 기록한다.
- `/health`, `/metrics`, `/favicon.ico`는 제외한다.

#### `JobInterceptor`

- Job Controller에 `@UseInterceptors(JobInterceptor)`로 적용해 완료 후 Slack 알림을 보낸다.
- 구현 file은 `src/libs/interceptors/job.interceptor.ts`이고 barrel export에 추가한다.
- 시작 시각은 `today('YYYY-MM-DD HH:mm:ss')`로 기록한다.
- local에서는 보내지 않고, 응답은 `{ jobType: string; data: Record<string, any> }` 형식을 기대한다.
- 이 참조 응답 형식은 [Job Controller](#job-controller)의 공통 `{ data }` 래핑 예시와 그대로는 일치하지 않는다. Job endpoint를 구현하거나 interceptor를 수정할 때는 실제 `SlackService.sendJob()` 계약을 먼저 확인하고, Controller 응답과 interceptor 해석 방식을 함께 맞춘다.
- `interceptors/index.ts`에서 export한다.

```ts
@Injectable()
export class JobInterceptor implements NestInterceptor {
  constructor(
    private readonly slackService: SlackService,
    private readonly configsService: ConfigsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<Request>();
    const start = today("YYYY-MM-DD HH:mm:ss");

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

#### `TraceIdSubscriber`

- TypeORM `@EventSubscriber()`로 모든 `DddAggregate`를 감시한다.
- `beforeInsert`는 `createdBy`, `updatedBy`, `beforeUpdate`는 `updatedBy`를 설정한다.
- cascade로 저장되는 하위 Entity에도 감사 trace가 적용된다.
- 생성자에서 `this.dataSource.subscribers.push(this)`로 자신을 등록한다.
- `DddAggregate`를 상속하지 않는 Entity에는 적용되지 않는다.

### 7.5 logger

- Winston과 `nest-winston`을 사용한다.
- service name은 `${현재 서비스명}-${NODE_ENV || 'local'}`이다.
- local은 `debug` level + color + timestamp, development/production은 `info` level + JSON format이다.
- `getLogContext(request)`는 method, URL, body, headers를 추출하고 `authorization`을 제거한다. body가 비었으면 포함하지 않는다.

### 7.6 전역 validation pipe

- `requesterValidatorPipe`는 `main.ts`에 등록하는 `ValidationPipe` instance다.
- 구현과 등록 지점은 `src/libs/pipes/requester-validator.pipe.ts`, `src/main.ts`다.
- `whitelist: true`, `transform: true`를 사용한다. DTO에 선언하지 않은 필드는 제거된다.
- nested DTO 오류는 재귀적으로 첫 오류를 찾는다.

| constraint   | 한국어 message                                |
| ------------ | --------------------------------------------- |
| `isNotEmpty` | `{prop}은(는) 비어있을 수 없습니다.`          |
| `isString`   | `{prop}은(는) 문자열이어야 합니다.`           |
| `isEmail`    | `{prop}은(는) 유효한 이메일 형식이 아닙니다.` |
| `isBoolean`  | `{prop}은(는) boolean 타입이어야 합니다.`     |
| `isNumber`   | `{prop}은(는) 숫자 타입이어야 합니다.`        |
| `isEnum`     | `{prop}은(는) 유효한 타입이 아닙니다.`        |
| `maxLength`  | `{prop}의 길이가 너무 깁니다.`                |

- 공통 message를 늘릴 때 pipe의 `errorMessages` map에 추가한다.
- map에 없는 constraint는 class-validator 기본 message를 쓴다.

### 7.7 utility

| 함수                                      | 동작                                                                       |
| ----------------------------------------- | -------------------------------------------------------------------------- |
| `stripUndefined<T>(obj)`                  | `undefined` property를 제거하고 `FindOptionsWhere<T>` 반환; 빈 객체는 `{}` |
| `randomId()`                              | nanoid 기반 10자리 영숫자 ID                                               |
| `convertOptions<T>(args?)`                | pagination, sort, relation을 TypeORM options로 변환                        |
| `checkRangeValue(min?, max?)`             | `MoreThanOrEqual`, `LessThan`, `And` 범위 조건                             |
| `checkLikeValue({ search, searchValue })` | `ILike('%value%')` 검색                                                    |
| `checkInValue(values?)`                   | 배열을 `In(values)`로 변환                                                 |

- `convertOptions`는 `skip = (page - 1) * limit`, `take = limit`로 계산한다.
- `checkRangeValue`의 max는 `LessThan`(미만)이며 `LessThanOrEqual`이 아니다.
- Repository가 이 함수를 조합하고, Controller/Service는 TypeORM operator를 직접 쓰지 않는다.

### 7.8 날짜 utility

- `dayjs`, `utc`, `timezone` plugin을 사용하고 기본 timezone은 `Asia/Seoul`이다.

| 함수                        | 의미                                |
| --------------------------- | ----------------------------------- |
| `today(format?)`            | 현재 날짜 문자열, 기본 `YYYY-MM-DD` |
| `todayAsDate()`             | 현재 `Date`                         |
| `add(date, days, unit)`     | minute/day 더하기                   |
| `startOfDay(date, format?)` | 날짜 시작                           |
| `endOfDay(date, format?)`   | 날짜 끝                             |
| `isPast(date)`              | 과거 여부                           |
| `getTimestamp()`            | 현재 timestamp(ms)                  |

- timezone 일관성을 위해 임의 `new Date()`보다 이 유틸 사용을 우선한다. 단, DDD event 자체의 현행 `occurredAt` 초기화는 `new Date()` 패턴을 유지한다.

<a id="domain-modules"></a>

## 8. 도메인 모듈과 계층 (`src/services`)

### 8.1 접근 타입과 폴더 구조

- 도메인은 요구사항에 따라 `admin`(시스템 관리자), `client`(사서/도서관 관리자), `general`(이용자) 중 필요한 접근 타입만 만든다.
- 모든 도메인이 세 타입을 전부 가질 필요는 없다.
- 여러 타입이 같은 도메인을 사용하면 Module·Controller·Service는 타입별로 나누고 Entity·Repository는 하나만 공유한다.

| 타입      | 사용자·역할                              | 그룹          | 기본 route         | 인증 Context                          |
| --------- | ---------------------------------------- | ------------- | ------------------ | ------------------------------------- |
| `admin`   | 두비덥 시스템 관리자, 전체 도서관 데이터 | `admins.ts`   | `admins/<domain>`  | `ContextKey.ADMIN`                    |
| `client`  | 사서, 소속 도서관 데이터                 | `clients.ts`  | `clients/<domain>` | `ContextKey.CLIENT` 도입 여부 확인    |
| `general` | 이용자, 자기 데이터                      | `generals.ts` | `<domain>`         | JWT unique key 또는 `ContextKey.USER` |

```text
# 단일 타입 도메인
src/services/<domain>/
  <domain>.module.ts
  applications/
    <domain>.service.ts
  controllers/
    <domain>.controller.ts
  domain/
    <domain>.entity.ts
  repository/
    <domain>.repository.ts

# 복수 타입 도메인
src/services/<domain>/
  admin-<domain>.module.ts
  client-<domain>.module.ts
  general-<domain>.module.ts
  applications/
    admin-<domain>.service.ts
    client-<domain>.service.ts
    general-<domain>.service.ts
    <domain>.service.ts              # 선택: 공유 로직·event handler
    <domain>.consumer.ts             # 선택: event consumer
  controllers/
    admin-<domain>.controller.ts
    client-<domain>.controller.ts
    general-<domain>.controller.ts
    dto/
  domain/
    <domain>.entity.ts               # 공유
    validators/                      # 선택
    events/                          # 선택
  repository/
    <domain>.repository.ts           # 공유
```

### 8.2 naming

| 대상             | 단일 타입                | Admin                          | Client                          | General                          |
| ---------------- | ------------------------ | ------------------------------ | ------------------------------- | -------------------------------- |
| Module class     | `{Domain}Module`         | `Admin{Domain}Module`          | `Client{Domain}Module`          | `General{Domain}Module`          |
| Service class    | `{Domain}Service`        | `Admin{Domain}Service`         | `Client{Domain}Service`         | `General{Domain}Service`         |
| Controller class | `{Domain}Controller`     | `Admin{Domain}Controller`      | `Client{Domain}Controller`      | `General{Domain}Controller`      |
| Module file      | `<domain>.module.ts`     | `admin-<domain>.module.ts`     | `client-<domain>.module.ts`     | `general-<domain>.module.ts`     |
| Service file     | `<domain>.service.ts`    | `admin-<domain>.service.ts`    | `client-<domain>.service.ts`    | `general-<domain>.service.ts`    |
| Controller file  | `<domain>.controller.ts` | `admin-<domain>.controller.ts` | `client-<domain>.controller.ts` | `general-<domain>.controller.ts` |

- 공유 Repository는 `{Domain}Repository` / `<domain>.repository.ts`다.
- 공유 Entity는 단수 `PascalCase`, file은 `<domain>.entity.ts`, table은 복수 lowercase다.
- Entity 생성자 타입은 `interface`가 아닌 `type Ctor = { ... }`를 사용한다.

### 8.3 Module file

```ts
// 단일 타입
@Module({
  controllers: [AdminController],
  providers: [AdminRepository, AdminService],
  exports: [AdminRepository, AdminService],
})
export class AdminModule {}

// 복수 타입 중 admin
@Module({
  controllers: [AdminInquiryController],
  providers: [InquiryRepository, AdminInquiryService],
  exports: [InquiryRepository, AdminInquiryService],
})
export class AdminInquiryModule {}
```

- Controller를 `controllers`에, Repository와 Service를 `providers`와 `exports` 양쪽에 등록한다.
- business module에는 `@Global()`을 붙이지 않는다.
- 복수 타입의 공유 Repository는 각 타입 Module의 providers에 등록한다.
- 같은 use case의 Controller handler와 Service method 이름을 맞춘다. 예: `answer()` → `answer()`.
- Consumer는 providers에만 등록하며 일반적으로 export하지 않는다.

<a id="entities"></a>

### 8.4 Entity

```ts
type Ctor = {
  email: string;
  password: string;
  sub?: string;
};

@Entity("admins")
export class Admin extends DddAggregate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column({ comment: "네이버웍스 고유 ID", nullable: true })
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

- TypeORM decorator를 사용하고 `DddAggregate`를 상속한다.
- `@Entity('<table_name>')`를 명시한다.
- constructor는 `Ctor` object를 받고, TypeORM의 no-arg 생성에 대응해 `if (args)` guard를 둔다.
- `super()`를 반드시 호출한다.
- `@Column()`의 `comment`에 한국어 설명을 남긴다.
- Entity에는 최소 도메인 상태와 상태 변경 규칙을 둔다.
- 새 Entity는 `src/databases/entities.ts`에 등록한다.

<a id="repositories"></a>

### 8.5 Repository

```ts
@Injectable()
export class AdminRepository extends DddRepository<Admin> {
  entityClass = Admin;

  async find(
    conditions: { id?: number; email?: string; sub?: string },
    options?: TypeormRelationOptions<Admin>,
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
      where: stripUndefined({
        id: conditions.id,
        email: conditions.email,
        sub: conditions.sub,
      }),
    });
  }
}
```

- `@Injectable()`과 `DddRepository<Entity>` 상속, `entityClass = Entity`를 필수로 둔다.
- 조건은 plain object로 받고 `stripUndefined()`로 빠진 조건을 제거한다.
- `find()` 두 번째 인자는 `options?: TypeormRelationOptions<Entity>`가 신규 코드의 기본이다.
- pagination만 쓰는 레거시·축약 signature로 `PaginationOptions`가 남을 수 있지만 신규 Repository 기본값으로 삼지 않는다.
- pagination, sort, relation은 `convertOptions()`로 변환한다.
- TypeORM 호출은 `this.entityManager`를 사용한다. Controller/Service가 `DataSource` 또는 `entityManager.find()`를 직접 쓰지 않는다.

#### 교차 도메인 조회

- 다른 도메인의 정보를 확인할 때 해당 Repository를 Service 생성자에 주입하고 `find(...)`한다.
- 예: FAQ Service가 고객사를 확인하면 `ClientRepository.find({ id: clientId })`를 호출한다.
- 어느 Repository를 거치는지가 코드에서 드러나야 한다.

#### 범위 조건

```ts
async find(
    conditions: {
        id?: number;
        search?: string;
        searchKey?: string;
        minCreatedAt?: string;
        maxCreatedAt?: string;
    },
    options?: TypeormRelationOptions<Entity>,
) {
    return this.entityManager.find(this.entityClass, {
        where: stripUndefined({
            id: conditions.id,
            createdAt: checkRangeValue(
                conditions.minCreatedAt,
                conditions.maxCreatedAt,
            ),
            ...checkLikeValue({
                searchKey: conditions.searchKey,
                searchValue: conditions.search,
            }),
        }),
        ...convertOptions(options),
    });
}
```

| min  | max  | 변환                                       |
| ---- | ---- | ------------------------------------------ |
| 있음 | 있음 | `And(MoreThanOrEqual(min), LessThan(max))` |
| 있음 | 없음 | `MoreThanOrEqual(min)`                     |
| 없음 | 있음 | `LessThan(max)`                            |
| 없음 | 없음 | `undefined`                                |

- parameter는 `minCreatedAt`/`maxCreatedAt`, `minStartOn`/`maxStartOn`처럼 `min{Field}`/`max{Field}`로 명명한다.
- 시작·종료 column이 따로 있으면 각 column에 독립적으로 적용한다.
- `Between` 같은 operator를 직접 만들지 않고 `checkRangeValue()`를 사용한다.

```ts
startOn: checkRangeValue(conditions.minStartOn, conditions.maxStartOn),
endOn: checkRangeValue(conditions.minEndOn, conditions.maxEndOn),
```

#### enum/ID array filter

```ts
async find(
    conditions: {
        ids?: number[];
        types?: TagType[];
        statuses?: LicenseStatus[];
        roles?: AdminRoleType[];
    },
    options?: TypeormRelationOptions<Entity>,
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

- Entity column이 단수여도 condition은 `types`, `statuses`, `roles`, `ids`처럼 복수 배열로 받는다.
- 단일 enum filter가 필요한 경우에도 Repository 기본 signature는 배열을 우선한다.
- `In(...)`은 Repository 안에서 `checkInValue()`로 만든다.

<a id="application-services"></a>

### 8.6 Application Service

#### method signature

- 첫 argument는 인라인 destructuring + 인라인 type을 사용한다. `conditions` object를 통째로 받지 않는다.

```ts
// 권장
async list({ search }: { search?: string }, options?: PaginationOptions) {}
async create({ title, content }: { title: string; content: string }) {}
async retrieve({ id, user }: { id: number; user?: User }) {}

// 금지
async list(conditions: { search?: string }, options?: PaginationOptions) {}
```

- 목록의 두 번째 argument는 단순 pagination이면 `PaginationOptions`, Repository options·relation·lock까지 제어하면 `TypeormRelationOptions<Entity>`로 넓힌다.
- method는 `list`, `create`, `update`, `retrieve`, `delete` 같은 use case 단위로 만든다.
- 목록 결과는 `{ items, total }`, 조회와 count는 `Promise.all()`로 병렬 처리한다.
- transaction이 필요한 메서드에 `@Transactional()`을 붙인다.
- 필수 context나 입력이 없으면 `BadRequestException`을 우선한다. 실제 권한·소유권 위반에만 `ForbiddenException`을 사용한다.

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

#### Context value 전달

```ts
async list(
    { user, search }: { user?: User; search?: string },
    options?: PaginationOptions,
) {
    const [items, total] = await Promise.all([
        this.noticeRepository.find({ search, isPublished: true }, options),
        this.noticeRepository.count({ search, isPublished: true }),
    ]);
    return { items, total };
}
```

- Controller가 Context에서 읽은 `user`, `admin`, `client`를 첫 object에 함께 넘긴다.

#### relation 전달

```ts
async list(
    { search }: { search?: string },
    options?: TypeormRelationOptions<Series>,
) {
    const [items, total] = await Promise.all([
        this.seriesRepository.find({ search }, options),
        this.seriesRepository.count({ search }),
    ]);
    return { items, total };
}

async retrieve({ id }: { id: number }) {
    const [series] = await this.seriesRepository.find(
        { ids: [id] },
        { relations: { episodes: { holes: true } } },
    );
    return series;
}
```

- use case에 필요한 relation은 Repository 내부에 hard-code하기보다 Service가 두 번째 argument로 명시한다.

<a id="controllers"></a>

### 8.7 Controller

#### class decorator와 Swagger tag

```ts
@ApiTags("[관리자] 관리자 API")
@Controller("admins/members")
@UseGuards(AdminGuard)
export class AdminController {}
```

- 모든 Controller에 `@ApiTags()`를 붙인다.
- class decorator 순서는 `@ApiTags` → `@Controller` → `@UseGuards`다.
- tag는 접근 주체와 resource가 드러나는 한국어 문자열을 사용한다.
- prefix는 `[관리자]`, `[사서]`, `[이용자]`를 사용한다.
- 예: `[관리자] 관리자 API`, `[사서] FAQ API`, `[이용자] 공지사항 API`.
- route는 resource 기준으로 잡는다.

#### handler JSDoc

- 모든 handler decorator 바로 위에 API 역할과 목적을 나타내는 한국어 multiline JSDoc을 둔다.
- 첫 줄은 `<주체> <도메인> <행위>` 제목형 명사구를 기본으로 한다.
- 예: `관리자 목록 조회`, `관리자 문의 상세 조회`, `관리자 문의 답변 등록`, `고객사 생성`, `사서 문의 생성`, `공지사항 오픈 스케쥴러`.

```ts
/**
 * 관리자 문의 목록 조회
 */
@Get()
async list() {}
```

#### handler 내부 4단계

- 모든 handler에 아래 주석을 전부 남긴다. 할 일이 없는 단계도 빈 상태로 주석을 유지한다.

```ts
// 1. Destructure body, params, query
// 2. Get context
// 3. Get result
// 4. Send response
```

| 단계 | 내용                                                                                    |
| ---- | --------------------------------------------------------------------------------------- |
| 1    | `@Body`, `@Param`, `@Query` destructuring; Query DTO의 domain field와 `...options` 분리 |
| 2    | `Context`에서 Admin/Client/User 조회; 필요 없으면 비워 둠                               |
| 3    | Service 호출; 반환값이 있으면 `const data`, mutation이면 `await`                        |
| 4    | 조회는 `{ data }`, 반환값 없는 생성·수정·삭제는 `{ data: {} }`                          |

- Service 호출은 반드시 `3. Get result` 아래에 둔다.
- Client Controller는 소속 도서관 식별을 위해 Context를 생성자에 주입한다. Admin/General은 필요한 경우에만 주입한다.
- Repository를 직접 주입하지 않고 Service만 호출한다.
- `@Query()` type에 `PaginationOptions`를 직접 쓰지 않고 domain Query DTO를 사용한다.

```ts
@ApiTags("[관리자] 공지사항 API")
@Controller("admins/notices")
export class AdminNoticeController {
  constructor(private readonly adminNoticeService: AdminNoticeService) {}

  /**
   * 관리자 공지사항 목록 조회
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

```ts
@ApiTags("[사서] 문의 API")
@Controller("clients/inquiries")
export class ClientInquiryController {
  constructor(
    private readonly clientInquiryService: ClientInquiryService,
    private readonly context: Context,
  ) {}

  /**
   * 사서 문의 목록 조회
   */
  @Get()
  async list(@Query() query: ClientInquiryQueryDto) {
    // 1. Destructure body, params, query
    const { search, ...options } = query;

    // 2. Get context
    const client = this.context.get<Client>(ContextKey.CLIENT);

    // 3. Get result
    const data = await this.clientInquiryService.list(
      { client, search },
      options,
    );

    // 4. Send response
    return { data };
  }
}
```

```ts
/**
 * 관리자 공지사항 생성
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

<a id="job-controller"></a>

### 8.8 Job Controller

```ts
@ApiTags("[관리자] 스케쥴러 API")
@Controller("admins/jobs")
@UseGuards(JobGuard)
@UseInterceptors(JobInterceptor)
export class JobController {
  constructor(private readonly jobService: JobService) {}

  /**
   * 관리자 에피소드 오픈 스케쥴러 실행
   */
  @Post("episodes/open")
  async openEpisodes(@Body() body: OpenEpisodesDto) {
    // 1. Destructure body, params, query
    const { ...args } = body;

    // 2. Get context

    // 3. Get result
    const data = await this.jobService.openEpisodes(args);

    // 4. Send response
    return { data };
  }
}
```

- Job endpoint는 상태 변경이므로 `admins/jobs` 아래 `@Post()`로 정의한다.
- `JobGuard`와 `JobInterceptor`를 class level에 함께 적용한다.
- Service에 위임하고 응답은 `{ data }`다.

### 8.9 미완성 의존성 처리

- 현재 작업 범위 밖의 아직 없는 Entity, domain, helper, 공통 함수는 임의로 만들지 않고 주석으로 의도를 남긴다.
- 이 규칙은 Entity, Repository, Service, Controller, DTO, Module 모든 계층에 적용한다.
- 미래 최종 구조를 기준으로 관련 계층의 signature와 주석 흐름을 정렬하고, 이미 구현할 수 있는 부분은 그대로 구현한다.
- 없는 import로 build를 깨뜨리지 않는다.

```ts
// Repository
conditions: {
    id?: number;
    // clientId?: number;
    // clientName?: string;
    search?: string;
},
where: stripUndefined({
    id: conditions.id,
    // client: conditions.clientId ? { id: conditions.clientId } : undefined,
}),
relations: {
    admin: true,
    // client: true,
},
```

```ts
// Service
async list({
    search,
    // clientName,
}: {
    search?: string;
    // clientName?: string;
}) {}
```

```ts
// Entity
// @ManyToOne(() => Client)
// client: Client;
```

```ts
// Controller
// const client = this.context.get(ContextKey.CLIENT);
const data = await this.noticeService.list(
  { search, searchKey /* clientId: client.id */ },
  options,
);
```

- 빈 껍데기 Entity나 임의 helper를 만들지 않는다.
- 어느 한 계층만 부분적으로 다른 미래 구조를 바라보지 않게 한다.

<a id="dto"></a>

## 9. DTO와 입력·응답 변환

### 9.1 책임과 위치

- 새 endpoint는 body/query/param DTO를 먼저 만든다.
- DTO는 입력 형식 검증을 담당하고, resource 존재·공개 상태·권한·접근 가능성 같은 비즈니스 조건은 Service 또는 Domain Validator가 담당한다.

```text
src/services/<domain>/controllers/dto/
  <domain>-create.dto.ts
  <domain>-update.dto.ts
  <domain>-query.dto.ts
  <domain>-response.dto.ts
  index.ts
```

- `index.ts`에서 모든 DTO를 export하고 Controller는 `./dto` barrel import를 사용한다.

```ts
export * from "./notice-create.dto";
export * from "./notice-query.dto";
export * from "./notice-update.dto";
export * from "./notice-response.dto";
```

### 9.2 file과 class naming

- DTO file은 create/update/query/response 용도별로 하나만 만든다.
- `admin-`/`general-` prefix가 붙은 DTO file을 별도로 만들지 않는다.
- 역할별 필드가 다르면 한 file에 여러 class를 함께 정의한다.
- Admin 전용 독립 기능(예: 문의 답변)은 `<domain>-answer.dto.ts`처럼 별도 용도로 분리할 수 있다.

| 용도            | file                      | class 예시                                          |
| --------------- | ------------------------- | --------------------------------------------------- |
| 생성            | `inquiry-create.dto.ts`   | `InquiryCreateDto`, 필요 시 `AdminInquiryCreateDto` |
| 수정            | `inquiry-update.dto.ts`   | `InquiryUpdateDto`, 필요 시 `AdminInquiryUpdateDto` |
| 조회            | `inquiry-query.dto.ts`    | `AdminInquiryQueryDto`, `GeneralInquiryQueryDto`    |
| 응답            | `inquiry-response.dto.ts` | `InquiryResponseDto`, 필요 시 역할별 class          |
| Admin 전용 기능 | `inquiry-answer.dto.ts`   | `InquiryAnswerDto`                                  |

- class 이름은 `<Role?><Domain><Purpose>Dto`다.
- 공유 class에는 role prefix를 붙이지 않는다.
- Admin만 사용하는 도메인의 명시성을 위해 `AdminNoticeCreateDto`처럼 role prefix를 쓸 수 있다.

```ts
// inquiry-create.dto.ts
export class InquiryCreateDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  content!: string;
}

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

### 9.3 field validation과 transform

| 값     | 기본 decorator  |
| ------ | --------------- |
| 문자열 | `@IsString()`   |
| 필수   | `@IsNotEmpty()` |
| 숫자   | `@IsNumber()`   |
| enum   | `@IsEnum()`     |
| 선택   | `@IsOptional()` |
| 배열   | `@IsArray()`    |

- 각 field에 class-validator decorator를 붙인다.
- custom `message`는 공통 message로 부족한 예외에만 쓴다.
- query string 숫자는 `@Type(() => Number)`로 변환한다.
- boolean query는 필요할 때 `@Transform()`으로 `'true'`/`'false'`를 boolean으로 바꾼다.
- nested DTO는 `@ValidateNested({ each: true })`와 `@Type(() => ChildDto)`를 함께 사용한다.

### 9.4 Query DTO와 pagination

- 모든 Query DTO는 `@common/types`의 `PaginationDto`를 상속한다.
- Controller에서 `PaginationOptions` 또는 `PaginationDto` 자체를 `@Query()` type으로 사용하지 않는다.
- 도메인별 Query DTO를 반드시 만든다.

```ts
export class AdminNoticeQueryDto extends PaginationDto {
  @IsString()
  @IsOptional()
  search?: string;

  @IsOptional()
  minCreatedAt?: string;

  @IsOptional()
  maxCreatedAt?: string;
}
```

```ts
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

- Controller는 domain filter를 명시적으로 꺼내고 pagination field는 `...options`에 둔다.

```ts
@Get()
async list(@Query() query: AdminNoticeQueryDto) {
    const { search, ...options } = query;
    const data = await this.adminNoticeService.list({ search }, options);
    return { data };
}
```

- array filter는 `types`, `statuses`, `seriesIds`처럼 복수형으로 명명한다.
- query가 단일값 또는 배열로 올 수 있으면 `@IsArray()`와 `@Transform()`으로 항상 배열이 되게 normalize한다.

### 9.5 DTO 유형 요약

| DTO      | 상속                 | 핵심 규칙                             |
| -------- | -------------------- | ------------------------------------- |
| Create   | 없음                 | 필수 field validator                  |
| Query    | `PaginationDto` 필수 | `@IsOptional()` 중심                  |
| Update   | 없음                 | 모든 field `@IsOptional()`            |
| Response | 없음                 | class `@Exclude()`, field `@Expose()` |
| Nested   | 없음                 | `@ValidateNested` + `@Type`           |

### 9.6 Response DTO 적용 기준

- Entity field를 그대로 전부 반환하는 단순 CRUD는 Response DTO 없이 반환할 수 있다.
- 다음 중 하나라도 해당하면 Response DTO를 만든다.
  - 비밀번호·내부 상태 등 민감 field를 제외해야 한다.
  - relation depth가 2 이상이다.
  - Admin/General의 노출 field가 다르다.
  - `isWishlist`, `totalCount` 같은 계산 field가 필요하다.

```ts
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

- class level `@Exclude()`로 기본 비노출하고 반환할 field만 `@Expose()`한다.

#### nested object

```ts
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

#### 역할별 노출 범위

```ts
@Exclude()
export class NoticeResponseDto {
  @Expose()
  id!: number;

  @Expose()
  title!: string;
}

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

#### Service 변환

- root Entity는 `entity.toInstance(ResponseDto)`를 우선한다.
- 목록은 각 Entity를 `toInstance()`로 map한다.
- 계산·집계·동적 field는 Service에서 계산한 뒤 spread로 합친다.
- relation child는 관련 Entity의 `toInstance()` 또는 Service 내부 plain mapper를 사용한다.
- `plainToInstance()`는 Entity 기준 변환으로 표현하기 어려운 예외에만 쓴다.

```ts
async retrieve({ id }: { id: number }) {
    const [notice] = await this.noticeRepository.find({ id });
    if (!notice) {
        throw new NotFoundException('공지사항을 찾을 수 없습니다.');
    }
    return notice.toInstance(NoticeResponseDto);
}

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

```ts
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

### 9.7 DTO checklist

- endpoint 입력이 있으면 DTO부터 만든다.
- `controllers/dto`와 barrel export를 사용한다.
- Query DTO는 `PaginationDto`를 상속한다.
- 숫자 입력의 `@Type(() => Number)`를 확인한다.
- boolean query는 필요하면 `@Transform()`을 사용한다.
- nested payload는 `@ValidateNested` + `@Type`을 사용한다.
- 반복되는 공통 enum·type은 `src/common/types.ts`로 올린다.
- 비즈니스 조건은 Domain Validator 또는 Service로 넘긴다.
- 전역 `requesterValidatorPipe`와 Swagger decorator까지 함께 확인한다.

<a id="domain-validator"></a>

## 10. 도메인 Validator

### 10.1 책임과 구조

- 여기서 validator는 DTO의 입력 형식 검사가 아니라 조회 조건·접근 가능성·비즈니스 제약을 재사용하는 domain validator를 뜻한다.
- 예: parent comment 존재 여부, 대댓글 depth 제한, 공개 상태, 성인 인증, 권한 조건.

```text
src/services/<domain>/domain/validators/
  <abstract-validator>.ts
  <concrete-validator>.ts
```

- 추상 validator 하나와 조건별 구현체 여러 개를 둔다.
- 예: `CommunityCommentValidator`와 `CreatableCommunityCommentValidator`, `SeriesValidator`와 `ViewableSeriesValidator`.

```ts
abstract satisfyElementFrom(repository: SomeRepository): Promise<Entity[]>;
abstract satisfyCountFrom(repository: SomeRepository): Promise<number>;
```

- 구현체는 constructor에서 조건을 받고 Repository를 통해 조회·검증한다.
- 조건을 만족하지 않으면 즉시 예외를 던진다.

### 10.2 예외와 사용 위치

| 상황                          | 예외                      |
| ----------------------------- | ------------------------- |
| 존재하지 않음·잘못된 요청     | `BadRequestException`     |
| 권한 부족·접근 불가           | `ForbiddenException`      |
| 아직 구현하지 않은 count path | `NotImplementedException` |

```text
Controller → Service → Domain Validator → Repository
```

- Controller가 Validator나 Repository를 직접 호출하지 않는다.
- Application Service가 `new ViewableSeriesValidator(...)`처럼 생성하고 Repository의 `satisfyElementFrom`/`satisfyCountFrom` 흐름으로 전달한다.

### 10.3 도입 기준

- 초기 단순 CRUD에는 생략할 수 있다.
- 다음 조건이 반복되면 `domain/validators`를 도입한다.
  - resource 조회 가능 여부를 여러 use case가 공유한다.
  - 존재 검사 로직이 여러 Service method에 반복된다.
  - 공개·비공개, 권한, 상태 검사가 반복된다.
  - 단순 `find`/`count` 조건 조합이 도메인 규칙으로 격상된다.
- 현재 코드에 표본이 거의 없으므로 필요한 도메인부터 점진적으로 도입하고, 실제 코드와 이 규칙이 충돌하면 먼저 알린다.

### 10.4 Validator checklist

- 반복되는 비즈니스 접근 규칙인지 확인한다.
- Service가 Validator를 만들고 Repository에 전달하는지 확인한다.
- Controller가 Repository나 Validator를 직접 호출하지 않는지 확인한다.
- 입력 형식 검사는 [DTO와 입력·응답 변환](#dto)에 남긴다.

<a id="domain-events"></a>

## 11. 도메인 이벤트와 event-box

### 11.1 적용 기준과 전체 흐름

- event-box는 도메인 이벤트를 transaction 안에서 outbox table에 저장하고 commit 뒤 BullMQ Queue로 비동기 전달하는 인프라다.
- 메일, 알림, 외부 API 등 commit 이후 실행되어야 하고 재시도가 필요한 후처리에 사용한다.
- 단순 CRUD, 짧은 동기 처리, Consumer가 없는 경우에는 사용하지 않아도 된다.

```text
Entity domain method
  → publishEvent(new XxxEvent())
Service @Transactional
  → Repository.save(entity)
DddRepository.save()
  → Entity 저장
  → DddEvent.fromEvent() 변환
  → ddd_events에 PENDING 저장
  → Context.DDD_EVENTS 누적
@Transactional 종료
  → eventEmitter.emit('ddd-event.created', dddEvent)
EventBoxDispatcherProvider
  → PENDING 확인
  → event/queue map 조회
  → BullMQ queue.add(job)
  → eventStatus PROCESSED
CommonConsumer.process(job)
  → async context와 trace ID 복원
  → methodHandlerMap의 Service handler 호출
```

```text
publishEvent()
  → memory
  → repository.save()
  → PENDING
  → dispatcher
  → PROCESSED
     ↘ dispatcher/processing 실패 시 FAILED
```

### 11.2 event-box 구성

| file                               | 역할                                        |
| ---------------------------------- | ------------------------------------------- |
| `common/event-box/queues.ts`       | `QueueName` enum과 BullMQ 등록 배열         |
| `common-dispatcher.ts`             | event class와 Queue map을 관리하는 base     |
| `common-consumer.ts`               | `WorkerHost` 기반 abstract Consumer         |
| `event-box-dispatcher.provider.ts` | `ddd-event.created`를 받아 Queue에 Job 추가 |
| `event-box.module.ts`              | `DddEvent` TypeORM + BullMQ Queue 등록      |

#### Queue

```ts
export enum QueueName {
  HEALTH = "health-queue",
}

export default Object.values(QueueName).map((name) => ({ name }));
```

- 새 Queue는 enum에 추가한다. default export가 자동으로 BullMQ registration array를 만든다.
- `DatabasesModule`과 `EventBoxModule`의 `registerQueue(...queues)`에 자동 반영된다.
- Dispatcher가 실제 Queue instance를 반환하도록 `CommonDispatcher` constructor의 `@InjectQueue()` 연결도 함께 추가한다.

#### Dispatcher

- `CommonDispatcher`는 static `_eventMap`을 갖고 `pushEventMap(event, queueName)`으로 mapping한다.
- `EventBoxDispatcherProvider`는 이를 상속하고 `@OnEvent('ddd-event.created')`로 event를 받는다.
- 처리 순서:
  1. DB에서 해당 event가 아직 `PENDING`인지 확인해 중복을 막는다.
  2. map에서 target Queue 목록을 찾는다.
  3. 각 Queue에 Job을 추가한다.
  4. 성공하면 `eventStatus`를 `PROCESSED`로 바꾼다.
- 기본 Job option:
  - `attempts: 3`
  - exponential backoff `1000ms`
  - `removeOnComplete: true`
  - 실패 Job은 7일 보존

#### `CommonConsumer`

- `WorkerHost`를 상속하며 base `process(job)`이 JSON payload parsing과 handler routing을 처리한다.
- 구현체는 `methodHandlerMap`만 구성한다.
- `asyncLocalStorage.run()`으로 Consumer context를 만들고 event trace ID를 복원한다.
- `@OnWorkerEvent('failed')`가 trace ID 포함 error log를 남기고 local이 아니면 Slack에 알린다.

### 11.3 event class

```text
src/services/<publisher-domain>/domain/events/
  <domain>-<action>-event.ts
  index.ts
```

- event는 구독 domain이 아니라 발행 domain에 둔다.
- class는 `{Domain}{Action}Event`, file은 `<domain>-<action>-event.ts`다.
- 예: `PromotionActivatedEvent`/`promotion-activated-event.ts`, `LoanReturnedEvent`/`loan-returned-event.ts`.
- class name이 `eventType`이자 Consumer map key이므로 이름 변경 시 기존 mapping이 깨진다.

```ts
import { DddEvent } from "@libs/ddd";

export class PromotionActivatedEvent extends DddEvent {
  public promotionId!: number;
  public episodeIds!: number[];
  public promotionType!: PromotionType;

  constructor(
    promotionId: number,
    episodeIds: number[],
    promotionType: PromotionType,
  ) {
    super();
    this.promotionId = promotionId;
    this.episodeIds = episodeIds;
    this.promotionType = promotionType;
  }
}
```

- `DddEvent`를 상속하고 `super()`를 호출한다.
- 후속 처리에 필요한 최소 식별자와 직렬화 가능한 plain data만 담는다.
- Entity instance, Repository, Service, request 같은 runtime object를 넣지 않는다.
- `domain/events/index.ts`에서 export한다.

### 11.4 Entity에서 발행

```ts
@Entity("promotions")
export class Promotion extends DddAggregate {
  @Column()
  status: PromotionStatus;

  activate() {
    this.status = PromotionStatus.ACTIVE;
    this.publishEvent(
      new PromotionActivatedEvent(this.id, this.episodeIds, this.promotionType),
    );
  }

  expired() {
    this.status = PromotionStatus.EXPIRED;
    this.publishEvent(
      new PromotionExpiredEvent(this.id, this.episodeIds, this.promotionType),
    );
  }
}
```

- 상태 변경과 `publishEvent()`를 같은 domain method에 묶는다.
- Service가 `publishEvent()`를 직접 호출하지 않는다.
- `publishEvent()`만으로 DB에 저장되지 않으며 `Repository.save()`에서 outbox event와 함께 저장된다.

### 11.5 Consumer

```text
src/services/<subscriber-domain>/applications/
  <domain>.consumer.ts
  <domain>.service.ts
```

- Consumer는 구독 domain에 둔다.
- HTTP 접근 타입과 무관한 event 후처리는 공용 `<domain>.consumer.ts` + `<domain>.service.ts`를 우선한다.
- 필요하면 `general-<domain>.consumer.ts`처럼 타입별로 분리할 수 있다.
- naming은 `{Domain}Consumer` / `<domain>.consumer.ts`이며 `EpisodeConsumer`, `AdminConsumer`, `episode.consumer.ts`가 대표 예다.
- 공용 event handler Service의 예로 `license.service.ts`, `series.service.ts` 같은 배치를 사용한다.

```ts
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

- `@Processor(QueueName.XXX)`로 소비 Queue를 지정한다.
- `super()` 뒤 `methodHandlerMap.set(EventClass.name, handler.bind(service))`로 등록한다.
- `.bind(this.service)`를 반드시 사용한다.
- Consumer에는 비즈니스 로직을 넣지 않고 Service handler에 위임한다.
- event class는 발행 domain에서 import한다.
- Consumer를 구독 domain Module의 providers에 넣고 exports에는 넣지 않는다.

```ts
@Module({
  controllers: [AdminEpisodeController],
  providers: [EpisodeRepository, EpisodeService, EpisodeConsumer],
  exports: [EpisodeRepository],
})
export class AdminEpisodeModule {}
```

### 11.6 Service event handler

- HTTP 권한별 Service가 아니라 공용 `<domain>.service.ts`에 두는 것을 우선한다.
- `@Transactional()`과 `@EventHandler(EventClass, QueueName, options?)`를 함께 사용한다.
- 코드 표기 순서는 `@Transactional()` 위, `@EventHandler()` 아래다.
- `description`에 handler 목적을 한국어로 남긴다.
- parameter type은 event class다.
- handler의 `Repository.save()`가 또 다른 event를 발행하는 chaining도 가능하다.
- method 이름은 `handle{EventName}` 또는 의미가 분명한 이름을 사용한다.

```ts
@Injectable()
export class EpisodeService extends DddService {
  constructor(private readonly episodeRepository: EpisodeRepository) {
    super();
  }

  @Transactional()
  @EventHandler(PromotionActivatedEvent, QueueName.EPISODE, {
    description: "무료 프로모션 활성화 시 에피소드의 isFree를 변경한다.",
  })
  async activatedFreePromotionEvent(event: PromotionActivatedEvent) {
    const { promotionId, episodeIds, promotionType } = event;

    if (promotionType !== PromotionType.FREE) {
      return;
    }

    const episodes = await this.episodeRepository.findByIds({
      ids: episodeIds,
    });
    episodes.forEach((episode) => {
      episode.update({ isFree: true, promotionId });
    });

    await this.episodeRepository.save(episodes);
  }
}
```

### 11.7 event checklist와 금지 사항

1. 발행 domain의 `domain/events`에 event class를 만든다.
2. barrel export를 추가한다.
3. Entity 상태 변경 method에서 `publishEvent()`를 호출한다.
4. 구독 domain Queue가 없으면 `QueueName`에 추가한다.
5. 구독 domain Consumer를 만들거나 map을 추가한다.
6. 공용 Service에 `@Transactional()` + `@EventHandler()` handler를 만든다.
7. Consumer를 Module providers에 등록한다.
8. 새 Queue instance를 `CommonDispatcher`에 주입·반환하도록 연결한다.
9. `Repository.save()`와 transaction을 실제로 거치는지 확인한다.
10. retry와 Slack failure notification을 확인한다.

- Controller가 event를 직접 발행하지 않는다.
- Service가 Aggregate의 `publishEvent()`를 직접 호출하지 않는다.
- Consumer에 비즈니스 로직을 넣지 않는다.
- Consumer에 `@EventHandler()`를 붙이지 않는다.
- 직렬화 불가능한 payload를 넣지 않는다.
- `methodHandlerMap`의 `.bind()`를 빠뜨리지 않는다.

### 11.8 현재 구현 상태 주의

- 현재 `QueueName`은 `HEALTH` 하나뿐이다.
- `CommonConsumer` concrete 구현과 `@EventHandler()` 사용처가 아직 없다.
- `CommonDispatcher.getQueue()`는 빈 object에서 Queue를 꺼내는 형태여서 실제 Queue instance를 반환하지 못한다.
- 새 event를 구현할 때 event class만 만들지 말고 Queue 주입·반환, Consumer, event/Queue mapping까지 함께 완성한다.
- event-box를 바꾸면 `common/event-box`, `libs/ddd`, `libs/decorators`, `databases` 연결을 모두 검토한다.

<a id="swagger"></a>

## 12. Swagger JSON 생성과 API decorator

### 12.1 script 구조와 실행

```text
src/swagger/
  generate-swagger.ts
```

- runtime server가 아닌 build 후 실행하는 독립 script다.

```bash
npm run generate:swagger
```

- 내부적으로 `npm run build && SWAGGER_GEN=true node dist/swagger/generate-swagger.js`를 실행한다.
- `SWAGGER_GEN=true`가 config env validation을 우회한다.

### 12.2 실제 DB 우회

```ts
const memoryDataSource = new DataSource({
  type: "sqlite",
  database: ":memory:",
  entities: [],
  synchronize: true,
  dropSchema: true,
});
```

- `Test.createTestingModule()`로 `AppModule`을 load하되 DataSource는 SQLite in-memory instance로 override한다.
- 실제 MySQL 연결 없이 decorator metadata를 수집한다.

### 12.3 분리 문서

| output               | include                                       | title                         |
| -------------------- | --------------------------------------------- | ----------------------------- |
| `swagger-user.json`  | `generalModules` (`src/services/generals.ts`) | 리뉴얼 푸딩툰 일반 사용자 API |
| `swagger-admin.json` | `adminModules` (`src/services/admins.ts`)     | 리뉴얼 푸딩툰 관리자 API      |

- `include`에 그룹 배열을 전달해 문서를 분리한다.
- `extraModels`에 `PaginationDto`를 등록해 `$ref` schema 누락을 막는다.

```ts
const config = new DocumentBuilder()
  .setTitle("...")
  .setDescription("...")
  .setVersion("1.0")
  .addBearerAuth()
  .build();
```

- version은 `1.0`, JWT scheme은 `addBearerAuth()`다.
- `JSON.stringify()`와 `fs.writeFileSync()`로 project root에 JSON을 쓴다.
- root output file이 `.gitignore`에 포함되는지 확인한다.

### 12.4 새 문서 그룹과 API metadata

- 새 Swagger group 추가 순서:
  1. `src/services/<group>.ts` Module 배열을 확인한다.
  2. generator에서 import한다.
  3. `DocumentBuilder`와 `SwaggerModule.createDocument()` block을 추가한다.
  4. `include`에 group을 전달한다.
  5. 새 JSON output을 저장한다.
- Controller와 DTO에 `@ApiTags`, `@ApiOperation`, `@ApiProperty` 등을 직접 붙인다. generator는 수집만 한다.
- `@ApiTags()`는 `@Controller()` 바로 위에 둔다.
- tag prefix는 `[관리자]`, `[사서]`, `[이용자]`로 통일한다.
- 새 도메인 Module이 해당 service group에 등록되어야 Swagger에 포함된다.
- 공통 DTO를 `$ref`하면 `extraModels` 등록을 확인한다.

<a id="plan-rules"></a>

## 14. 신규 모듈 생성 절차와 종합 checklist

### 14.1 작업 전 판단

- 관련 비즈니스 context를 먼저 확인한다.
- 필요한 접근 타입이 Admin, Client, General 중 무엇인지 정한다.
- 공통 기능은 `@common`, `@libs`에서 재사용 가능한지 확인한다.
- DTO, Domain Validator, event, Consumer가 실제로 필요한지 판단한다.

### 14.2 공통 생성 순서

1. `src/services/<domain>`과 필요한 `applications`, `controllers`, `domain`, `repository` 폴더를 만든다.
2. 공유 Entity를 작성하고 `src/databases/entities.ts`에 등록한다.
3. 공유 Repository를 작성한다.
4. 타입별 Application Service를 작성한다.
5. 입력이 있으면 DTO부터 만들고 Controller를 작성한다.
6. 타입별 Module을 작성한다.
7. Admin은 `admins.ts`, Client는 `clients.ts`, General은 `generals.ts`에 등록한다.
8. Swagger tag와 그룹 포함 여부를 확인한다.
9. 반복되는 비즈니스 검증이 있으면 `domain/validators`를 만든다.
10. 비동기 후처리가 필요하면 event class, Queue, Consumer, handler 전체 연결을 구현한다.

### 14.3 단일 타입 checklist

- [ ] `<domain>.module.ts`
- [ ] `applications/<domain>.service.ts`
- [ ] `controllers/<domain>.controller.ts`
- [ ] `domain/<domain>.entity.ts`
- [ ] `repository/<domain>.repository.ts`
- [ ] 해당 service group 등록

### 14.4 복수 타입 checklist

- [ ] 공유 Entity 한 개
- [ ] 공유 Repository 한 개
- [ ] 필요한 타입별 Service
- [ ] 필요한 타입별 Controller
- [ ] 필요한 타입별 Module
- [ ] 각 Module을 해당 service group에 각각 등록
- [ ] 같은 Module을 여러 group에 중복 등록하지 않음

### 14.5 계층별 완료 확인

- Entity가 `DddAggregate`, `Ctor`, `if (args)`, table name, column comment 규칙을 지켰다.
- Repository가 `DddRepository`, `entityClass`, `stripUndefined`, `convertOptions`, 공용 query utility를 사용한다.
- Service가 `DddService`, `super()`, 인라인 destructuring, use case method, 필요한 transaction 규칙을 지켰다.
- Controller가 `@ApiTags`, class Guard, handler JSDoc, 4단계 주석, `{ data }` 응답 규칙을 지켰다.
- Query DTO가 `PaginationDto`를 상속하고 domain field와 pagination을 분리한다.
- Entity를 databases registry에, Module을 service group에 등록했다.
- 미래 의존성은 build를 깨뜨리는 임의 stub 대신 일관된 주석으로 남겼다.

<a id="reference-state"></a>
