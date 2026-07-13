---
title: vogopang_back configs 모듈 규칙
tags: [rules, code-conventions, vogopang, vogopang_back, nestjs, config, env]
updated: 2026-05-11
sources:
  - ../../../vogopang_back/vogopang_back_main/src/configs/configuration.ts
  - ../../../vogopang_back/vogopang_back_main/src/configs/configs.service.ts
  - ../../../vogopang_back/vogopang_back_main/src/configs/configs.module.ts
  - ../../../vogopang_back/vogopang_back_main/src/configs/index.ts
  - ../../../vogopang_back/vogopang_back_main/src/app.module.ts
  - ../../../vogopang_back/vogopang_back_main/tsconfig.json
  - ../../../vogopang_back/vogopang_back_main/src/test/setup-env.ts
see_also:
  - ./README.md
  - ../README.md
  - ../../index.md
  - ../../repos/vogopang_back.md
  - ../../services/vogopang/data-sources.md
  - ../../services/vogopang/integrations.md
  - ../../services/vogopang/workflows/backend-runtime-and-jobs.md
---

# vogopang_back configs 모듈 규칙

이 문서는 `src/configs` 모듈을 기준으로 추출한 설정 관리 규칙이다.
새 에이전트나 개발자는 아래 규칙을 기본값으로 따르고, 설정을 추가하거나 변경할 때 이 패턴을 유지한다.

## 0. 폴더 역할

- `src/configs`는 `vogopang_back_main`의 **런타임 환경값을 Nest DI에 올리는 경계 모듈**이다.
- `.env.{NODE_ENV}` 값을 타입이 있는 설정 section으로 매핑하고, 앱 부팅 시 누락값을 검증한 뒤, 전역 `ConfigsService` getter로 MySQL/Redis/Slack/JWT/Dubright/AWS/Naver Works/Email 설정을 제공한다.
- `AppModule`이 `ConfigsModule`을 import하고, `ConfigsModule`이 `@Global()`로 선언되어 있어 비즈니스 모듈은 `@configs` alias의 `ConfigsService`를 주입받아 설정을 읽는다.
- 코드 기반 설정 변경을 할 때 적용한 rules: `../README.md`, `./README.md`, 이 문서.

## 1. 폴더 구조

```text
src/configs/
  index.ts              # barrel export (공개 API)
  configuration.ts      # 설정 정의 함수 + 타입(interface)
  configs.service.ts    # 설정 접근 서비스 (@Injectable)
  configs.module.ts     # NestJS 모듈 등록 + env 검증
```

- 하위 폴더 없이 4개 파일로 구성된다.
- `@configs` alias로 프로젝트 전역에서 import 한다.

## 2. 파일별 역할

### `configuration.ts`

- 환경 변수를 타입이 있는 설정 객체로 매핑하는 **함수를 default export** 한다.
- 설정 section별 interface를 이 파일에서 정의하고, 외부에서 쓸 interface만 `export` 한다.
- 최상위 `AppConfig` interface는 export 하지 않는다. `configuration()` 반환 객체의 내부 shape 용도다.
- 현재 section은 `mysql`, `redis`, `slack`, `jwt`, `dubright`, `aws`, `naverWorks`, `email`이다.
- Email section은 빈 문자열 기본값과 `SMTP_PORT || 587`, `SMTP_SECURE === 'true'` 파싱을 둔다. 따라서 SMTP env가 없어도 config validation에서 바로 실패하지 않고, 실제 발송 시 `EmailService`가 실패한다.

근거 코드 — `../../../vogopang_back/vogopang_back_main/src/configs/configuration.ts`

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
```

근거 코드 — `../../../vogopang_back/vogopang_back_main/src/configs/configuration.ts`

```ts
export default (env: Record<string, any> = process.env): AppConfig => ({
    mysql: { type: 'mysql', port: 3306, host: env.MYSQL_HOST, username: env.MYSQL_USERNAME },
    redis: { host: env.REDIS_HOST, port: 6379 },
    slack: { webhookUrl: env.SLACK_WEBHOOK_URL, jobWebhookUrl: env.SLACK_JOB_WEBHOOK_URL },
    jwt: {
        accessTokenSecret: env.JWT_ACCESS_TOKEN_SECRET,
        refreshTokenSecret: env.JWT_REFRESH_TOKEN_SECRET,
        jobToken: env.JOB_TOKEN,
        libraryTokenSecret: env.JWT_LIBRARY_TOKEN_SECRET,
    },
    dubright: { dubrightApi: env.DUBRIGHT_API, accessToken: env.DUBRIGHT_ACCESS_TOKEN },
    aws: { bucketName: env.AWS_BUCKET_NAME, contentsBucketName: env.AWS_CONTENTS_BUCKET_NAME },
    email: { smtpHost: env.SMTP_HOST || '', smtpPort: Number(env.SMTP_PORT || 587) },
});
```

### `configs.service.ts`

- `@Injectable()` 서비스로, NestJS `ConfigService`를 래핑한다.
- 각 설정 section은 **getter**로 노출한다 (`get mysql()`, `get redis()` 등).
- getter 반환 타입은 `configuration.ts`의 interface 또는 외부 라이브러리 타입을 쓴다.
- 값은 non-null assertion(`!`)으로 가져온다. 모듈 로딩 시 검증이 끝났다는 전제다.
- 환경 판별 메서드(`isProduction`, `isLocal`, `isDevelopment`)를 일반 메서드로 제공한다.

근거 코드 — `../../../vogopang_back/vogopang_back_main/src/configs/configs.service.ts`

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

### `configs.module.ts`

- `@Global()` + `@Module()`로 선언하여 프로젝트 전역에서 `ConfigsService`를 주입할 수 있게 한다.
- `ConfigModule.forRoot()`를 import하며 아래 3가지를 설정한다.
  - `envFilePath`: `.env.${NODE_ENV || 'local'}` 패턴
  - `load`: `configuration` 함수
  - `validate`: `validateConfigObject` 함수
- `providers`와 `exports`에 `ConfigsService`를 등록한다.

### `index.ts`

- barrel export 파일이다.
- `ConfigsModule`과 `ConfigsService`만 re-export 한다.
- `configuration.ts`의 타입은 필요한 곳에서 직접 import 한다.

```ts
export * from './configs.module';
export * from './configs.service';
```

## 2.A 현재 설정 section map

| section | env key | 주요 소비처 | 역할 |
|---------|---------|-------------|------|
| `mysql` | `MYSQL_HOST`, `MYSQL_USERNAME`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` | `DatabasesModule` | TypeORM MySQL 연결 |
| `redis` | `REDIS_HOST` | `DatabasesModule`, `ActiveSessionService` | BullMQ queue backend, active session store |
| `slack` | `SLACK_WEBHOOK_URL`, `SLACK_JOB_WEBHOOK_URL` | `SlackService`, exception filter, job interceptor | 장애/queue 실패와 scheduler 결과 알림 |
| `jwt` | `JWT_ACCESS_TOKEN_SECRET`, `JWT_REFRESH_TOKEN_SECRET`, `JWT_LIBRARY_TOKEN_SECRET`, `JOB_TOKEN` | `JwtHelperService`, `JobGuard` | 관리자/이용자/도서관 JWT와 scheduler auth |
| `dubright` | `DUBRIGHT_API`, `DUBRIGHT_V0_API`, `DUBRIGHT_ACCESS_TOKEN` | `DubrightApiService`, Dubright resource download | Dubright external API와 legacy resource base |
| `aws` | `AWS_BUCKET_NAME`, `AWS_CONTENTS_BUCKET_NAME`, `AWS_REGION`, `AWS_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | `AwsS3Service`, player helper, Dubright download | 일반 파일/컨텐츠 S3 upload와 public URL 생성 |
| `naverWorks` | `NAVER_WORKS_CLIENT_ID`, `NAVER_WORKS_CLIENT_SECRET`, `NAVER_WORKS_REDIRECT_URL` | `NaverWorksService` | 본사 관리자 Naver Works OAuth |
| `email` | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | `EmailService` | backend SMTP 발송 |

## 3. 환경 변수 검증 규칙

- `configs.module.ts` 내부의 `validateConfigObject` 함수가 앱 부팅 시 검증을 담당한다.
- `configuration()` 함수를 실행한 뒤 모든 설정값을 재귀적으로 순회한다.
- `undefined` 또는 `NaN`인 값이 있으면 에러를 throw 한다.
- 에러 메시지는 한국어로 출력한다: `❌ .env 파일의 "{key}" 설정 값이 누락되었습니다.`
- `SWAGGER_GEN` 환경 변수가 설정되어 있으면 검증을 건너뛴다.
- 빈 문자열은 누락으로 보지 않는다. `email`처럼 기본값을 빈 문자열로 둔 section은 부팅 검증보다 실제 사용처 검증을 함께 확인해야 한다.

근거 코드 — `../../../vogopang_back/vogopang_back_main/src/configs/configs.module.ts`

```ts
const validateConfigObject = (envConfig: Record<string, any>) => {
    if (envConfig.SWAGGER_GEN) return envConfig;

    const fullConfig = configuration(envConfig);

    const checkNodes = (obj: any, parentKey = '') => {
        Object.entries(obj).forEach(([key, value]) => {
            const currentKey = parentKey ? `${parentKey}.${key}` : key;

            if (value === undefined || Number.isNaN(value)) {
                throw new Error(`❌ .env 파일의 "${currentKey}" 설정 값이 누락되었습니다.`);
            }
        });
    };
};
```

## 4. 환경 파일 규칙

- 환경 파일은 프로젝트 루트에 `.env.{NODE_ENV}` 형식으로 둔다.
- `NODE_ENV` 값에 따라 로딩할 파일이 결정된다.
  - `local` → `.env.local`
  - `development` → `.env.development`
  - `production` → `.env.production`
- `NODE_ENV`가 없으면 기본값은 `local`이다.

## 5. 새 설정 섹션 추가 절차

새로운 외부 연동이나 설정 그룹을 추가할 때 아래 순서를 따른다.

1. `.env.*` 파일에 환경 변수 추가
2. `configuration.ts`에서:
   - 필요하면 interface를 정의하고 export
   - `AppConfig`에 새 섹션 프로퍼티 추가
   - default export 함수의 반환 객체에 매핑 추가
3. `configs.service.ts`에서:
   - 새 섹션에 대한 getter 추가
4. `src/test/setup-env.ts`에 테스트용 기본값 추가
5. 끝. 모듈/index 파일은 수정하지 않는다.

## 6. 설정값 사용 규칙

- 비즈니스 모듈에서 `process.env`를 직접 참조하지 않는다.
- 반드시 `ConfigsService`를 주입받아 getter로 접근한다.
- `ConfigsService`는 `@Global()` 모듈이므로 별도 import 없이 주입 가능하다.

```ts
// ✅ 올바른 사용
constructor(private readonly configsService: ConfigsService) {}
this.configsService.mysql;

// ❌ 금지
process.env.MYSQL_HOST;
```

- 환경 판별이 필요하면 `configsService.isProduction()` 등의 메서드를 사용한다.

근거 코드 — `../../../vogopang_back/vogopang_back_main/src/app.module.ts`

```ts
imports: [
    ConfigsModule,
    DatabasesModule,
    CommonModule,
    EventEmitterModule.forRoot(),
    ...adminsModule,
    ...generalsModule,
    ...clientsModule,
]
```

근거 코드 — `../../../vogopang_back/vogopang_back_main/tsconfig.json`

```json
"baseUrl": "src",
"paths": {
  "@configs": ["configs"]
}
```

## 7. 필수 환경 변수 목록

현재 `configuration.ts`와 `src/test/setup-env.ts` 기준 환경 변수:

| 섹션 | 환경 변수 |
|------|----------|
| mysql | `MYSQL_HOST`, `MYSQL_USERNAME`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` |
| redis | `REDIS_HOST` |
| slack | `SLACK_WEBHOOK_URL`, `SLACK_JOB_WEBHOOK_URL` |
| jwt | `JWT_ACCESS_TOKEN_SECRET`, `JWT_REFRESH_TOKEN_SECRET`, `JWT_LIBRARY_TOKEN_SECRET`, `JOB_TOKEN` |
| dubright | `DUBRIGHT_API`, `DUBRIGHT_V0_API`, `DUBRIGHT_ACCESS_TOKEN` |
| aws | `AWS_BUCKET_NAME`, `AWS_CONTENTS_BUCKET_NAME`, `AWS_REGION`, `AWS_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` |
| naverWorks | `NAVER_WORKS_CLIENT_ID`, `NAVER_WORKS_CLIENT_SECRET`, `NAVER_WORKS_REDIRECT_URL` |
| email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` |
| 시스템 | `NODE_ENV` (local / development / production) |

- `configuration.ts`에서 기본값을 둔 `SMTP_*` 계열은 현재 validator 기준 "필수 env"라기보다 "section key는 항상 존재하지만 빈 문자열일 수 있는 값"이다.
- `src/test/setup-env.ts`는 Jest setup에서 모든 section의 테스트 기본값을 채운다.

## 8. 코드 스타일 규칙

- type-only import는 `import type { ... }` 문법을 쓴다.
- interface 정의에는 JSDoc이나 주석을 달지 않는다.
- NestJS `ConfigService`는 `NestConfigService`로 alias하여 import 한다.
- 포트 등 기본값이 있는 설정은 `configuration.ts`에서 하드코딩한다 (예: `port: 3306`, `port: 6379`).

## 9. 주의사항

- `ConfigsModule`은 `@Global()`이므로 다른 모듈에서 imports에 넣지 않아도 된다.
- `configuration.ts`의 default export 함수는 `env` 파라미터를 받되 기본값을 `process.env`로 둔다. 이는 검증 함수에서 파싱된 env 객체를 넘기기 위한 구조다.
- redis 타입은 `configuration.ts`에서 `ioredis`의 `RedisOptions`를, `configs.service.ts`에서 `bullmq`의 `RedisOptions`를 쓴다. 둘 다 호환되므로 현행 그대로 유지한다.
- `configs.service.ts`의 `isProduction()`/`isLocal()`/`isDevelopment()`는 `process.env.NODE_ENV`를 직접 본다. 비즈니스 모듈에서 임의로 `process.env`를 새로 참조하지 않는다는 규칙과 별개로, 환경 판별은 이 service 메서드에 집중되어 있다.
- `SWAGGER_GEN=true`는 swagger JSON 생성용 escape hatch다. 검증을 우회하므로 런타임 설정 완전성 판단에 쓰면 안 된다.
