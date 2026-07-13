# vogopang_back databases 모듈 규칙

이 문서는 `src/databases` 모듈의 구조와 컨벤션을 기준으로 추출한 규칙이다.
새 에이전트나 개발자는 아래 규칙을 기본값으로 따르고, DB 연결이나 엔티티 등록을 변경할 때 이 패턴을 유지한다.

## 1. 폴더 구조

```text
src/databases/
  index.ts              # barrel export (DatabasesModule만 re-export)
  databases.module.ts   # TypeORM(MySQL) + BullMQ(Redis) 연결 모듈
  entities.ts           # 전체 엔티티 목록 (default export 배열)
```

- 3개 파일로 구성되며, 하위 폴더는 없다.
- `@databases` alias로 프로젝트 전역에서 import 한다.

## 2. databases.module.ts

### 역할

- TypeORM(MySQL)과 BullMQ(Redis) 연결을 초기화하고, 앱 시작 시 연결 상태를 검증하며, 종료 시 정리하는 모듈이다.
- `OnModuleInit`, `OnModuleDestroy` 라이프사이클 훅을 구현한다.

### TypeORM 설정 패턴

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
```

- `ConfigsService`를 inject하여 factory 패턴으로 설정한다.
- `configsService.mysql`을 spread하여 type, host, port, username, password, database를 가져온다.
- `entities`는 `./entities.ts`에서 import한 배열을 그대로 넘긴다.
- `synchronize`: production에서는 반드시 `false`, 그 외 환경에서는 `true`.
- `logging`: 모든 환경에서 `false`.

### BullMQ 설정 패턴

```ts
BullModule.forRootAsync({
    inject: [ConfigsService],
    useFactory: (configsService: ConfigsService) => ({
        connection: {
            host: configsService.redis.host,
            port: configsService.redis.port,
            tls: configsService.isLocal() ? undefined : {},
        },
        prefix: 'vogopang',
    }),
}),
BullModule.registerQueue(...queues),
```

- Redis 연결은 `configsService.redis`에서 host/port를 가져온다.
- TLS: local 환경이면 `undefined`(비활성), 그 외 환경이면 `{}`(활성).
- `prefix: 'vogopang'`으로 다른 애플리케이션과 큐 이름 충돌을 방지한다.
- 큐 등록은 `@common/event-box/queues`에서 가져온 배열을 spread한다.

### 라이프사이클 훅

- `onModuleInit()`: MySQL과 Redis 연결 상태를 검사하여, 실패하면 에러를 throw한다.
- `onModuleDestroy()`: DataSource가 초기화 상태면 `destroy()`로 정리한다.

### 생성자 주입 패턴

```ts
constructor(
    private readonly datasource: DataSource,
    @InjectQueue(QueueName.HEALTH) private readonly healthQueue: Queue
) {}
```

- `DataSource`는 TypeORM이 자동으로 제공한다 (데코레이터 없이 타입 주입).
- 큐는 `@InjectQueue(QueueName.XXX)` 데코레이터로 주입한다.
- 연결 검사용으로 `healthQueue`를 주입받아 Redis 상태를 확인한다.

### 연결 검사 패턴

```ts
// MySQL
private async checkMysqlConnection() {
    if (this.datasource.isInitialized) {
        this.logger.log('Mysql Database is initialized.');
    } else {
        throw new Error('Mysql Database is not initialized.');
    }
}

// Redis
private async checkRedisConnection() {
    const status = (await this.healthQueue.client).status;
    if (status === 'ready') {
        this.logger.log('Redis connection is ready.');
    } else {
        throw new Error('Redis connection is not ready.');
    }
}
```

- 성공 시 `Logger.log()`로 상태를 출력한다.
- 실패 시 `throw new Error()`로 앱 부팅을 중단한다.

## 3. entities.ts — 엔티티 등록 규칙

- 프로젝트의 모든 TypeORM 엔티티를 한 곳에서 관리한다.
- **배열을 default export** 한다.

```ts
import { DddEvent } from '@libs/ddd';
import { Admin } from '@services/admin/domain/admin.entity';

export default [DddEvent, Admin];
```

### 새 엔티티 등록 절차

1. 도메인 폴더에 `<domain>.entity.ts` 작성
2. `entities.ts`에 import 추가
3. default export 배열에 엔티티 추가
4. 끝. `databases.module.ts`는 수정하지 않는다.

### 현재 등록된 엔티티

| 엔티티 | 위치 | 테이블명 |
|--------|------|----------|
| `DddEvent` | `@libs/ddd` | `ddd_events` |
| `Admin` | `@services/admin/domain/admin.entity` | `admins` |

## 4. index.ts

- `DatabasesModule`만 re-export 한다.
- `entities.ts`는 re-export 대상이 아니다 (내부용).

```ts
export * from './databases.module';
```

## 5. 환경별 동작 차이

| 항목 | local | development | production |
|------|-------|-------------|------------|
| synchronize | `true` | `true` | `false` |
| logging | `false` | `false` | `false` |
| Redis TLS | `undefined` (비활성) | `{}` (활성) | `{}` (활성) |
| Redis prefix | `vogopang` | `vogopang` | `vogopang` |

## 6. import 패턴

```ts
import { ConfigsService } from '@configs';
import queues from '@common/event-box/queues';
import { QueueName } from '@common/event-box/queues';
import { DddEvent } from '@libs/ddd';
import { Admin } from '@services/admin/domain/admin.entity';
```

- 설정은 `@configs` alias로 가져온다.
- 큐 목록은 `@common/event-box/queues`에서 default import + named import를 함께 쓴다.
- 엔티티는 각 도메인 폴더에서 직접 import 한다.

## 7. 주의사항

- `entities.ts`에 엔티티를 추가하지 않으면 TypeORM이 해당 테이블을 인식하지 못한다.
- production 환경에서 `synchronize: true`로 바꾸면 스키마가 자동 변경되어 데이터 유실 위험이 있다.
- 새 큐를 추가할 때는 `@common/event-box/queues.ts`의 `QueueName` enum에 추가한다. `databases.module.ts`의 `BullModule.registerQueue(...queues)`가 자동으로 반영한다.
- 연결 검사에 쓰이는 `healthQueue`는 `QueueName.HEALTH` 큐에 의존하므로, 이 큐를 삭제하면 안 된다.
- `DatabasesModule`은 `@Global()` 데코레이터가 없다. `app.module.ts`에서 직접 import하여 루트에 등록한다.
