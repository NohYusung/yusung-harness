# vogopang_back 모듈 생성 규칙

이 문서는 `src/services/admin` 모듈, `src/app.module.ts`, 공통 인프라 모듈을 기준으로 추출한 현재 규칙이다.
새 에이전트나 개발자는 아래 규칙을 기본값으로 따르고, 예외가 필요하면 기존 코드와 맞는지 먼저 확인한다.

> **참고**: 새 도메인 모듈 생성 시 `context/` 폴더에서 비즈니스 맥락을 먼저 확인한다.

## 1. 기본 방향

- NestJS 모듈을 쓰되, 비즈니스 로직은 `DDD 스타일 계층`으로 나눈다.
- 공통 인프라와 비즈니스 모듈을 분리한다.
- 컨트롤러는 얇게 유지하고, 실제 처리 로직은 application service와 repository로 내린다.
- import 경로는 상대경로보다 `tsconfig path alias`를 우선 사용한다.

## 2. 신규 비즈니스 모듈 기본 위치

- 신규 비즈니스 모듈은 `src/services/<domain>` 아래에 만든다.
- 도메인은 **3가지 유형** 중 하나로 만든다.

### 2-1. 단일 타입 도메인 (admin 전용 또는 general 전용)

```text
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
```

### 2-2. admin + general 양쪽 도메인

```text
src/services/<domain>/
  admin-<domain>.module.ts
  general-<domain>.module.ts
  applications/
    admin-<domain>.service.ts
    general-<domain>.service.ts
  controllers/
    admin-<domain>.controller.ts
    general-<domain>.controller.ts
  domain/
    <domain>.entity.ts              # 공유
  repository/
    <domain>.repository.ts          # 공유
```

- **엔티티와 리포지토리는 공유**, 모듈·컨트롤러·서비스는 admin/general로 분리한다.
- admin만 또는 general만 필요한 경우 해당 쪽 파일만 만든다.

## 3. 파일별 역할

- `<domain>.module.ts`
  - controllers, providers, exports를 선언한다.
  - 현재 패턴상 `Repository`, `Service`를 provider와 export에 같이 넣는다.
- `controllers/*.controller.ts`
  - 라우팅, request parsing, service 호출만 담당한다.
  - 복잡한 비즈니스 판단은 두지 않는다.
- `applications/*.service.ts`
  - use case 단위 로직을 담당한다.
  - 현재 패턴상 `DddService`를 상속한다.
- `repository/*.repository.ts`
  - 조회/저장 로직을 담당한다.
  - 현재 패턴상 `DddRepository<Entity>`를 상속하고 `entityClass`를 지정한다.
- `domain/*.entity.ts`
  - TypeORM entity이자 도메인 aggregate 역할을 가진다.
  - 현재 패턴상 `DddAggregate`를 상속한다.

## 4. 신규 모듈 작성 규칙

### 단일 타입 네이밍
- 모듈: `{Domain}Module` / `<domain>.module.ts`
- 서비스: `{Domain}Service` / `<domain>.service.ts`
- 컨트롤러: `{Domain}Controller` / `<domain>.controller.ts`

### admin + general 분리 네이밍
- Admin 모듈: `Admin{Domain}Module` / `admin-<domain>.module.ts`
- General 모듈: `General{Domain}Module` / `general-<domain>.module.ts`
- Admin 서비스: `Admin{Domain}Service` / `admin-<domain>.service.ts`
- General 서비스: `General{Domain}Service` / `general-<domain>.service.ts`
- Admin 컨트롤러: `Admin{Domain}Controller` / `admin-<domain>.controller.ts`
- General 컨트롤러: `General{Domain}Controller` / `general-<domain>.controller.ts`

### 공통
- 리포지토리: `{Domain}Repository` / `<domain>.repository.ts` (항상 공유)
- 엔티티: 도메인명 단수형 `PascalCase` / `<domain>.entity.ts` (항상 공유)
- 생성자 타입: `Ctor` (type alias)

## 5. 모듈 내부 의존 흐름

- 권장 의존 방향은 아래와 같다.

```text
Controller -> Application Service -> Repository -> Entity
```

- controller가 repository를 직접 호출하지 않는다.
- service가 HTTP 객체를 직접 다루지 않는다.
- repository가 request/response 문맥을 직접 다루지 않는다.

## 6. controller 작성 규칙

- `@Controller()` 경로는 리소스 기준으로 잡는다.
  - 현재 예시: `@Controller('admins/members')`
- controller 클래스에는 `@ApiTags(...)`를 반드시 작성한다.
  - 예: `@ApiTags('[관리자] 관리자 API')`
- client controller의 `@ApiTags(...)` prefix는 `[사서]`를 사용한다.
- 기본 데코레이터 순서는 `@ApiTags -> @Controller -> @UseGuards` 를 따른다.
- 각 handler 위에는 해당 API의 역할과 목적을 설명하는 한국어 JSDoc를 반드시 작성한다.
  - 예: `관리자 목록 조회`, `고객사 생성`, `공지사항 오픈 스케쥴러`
- JSDoc는 handler 데코레이터(`@Get`, `@Post`, `@Put`, `@Delete`) 바로 위에 둔다.
- handler는 아래 순서를 기본으로 한다.
  1. `@Body`, `@Param`, `@Query` 등 입력 파싱
  2. 필요시 context 값 조회
  3. service 호출
  4. `{ data }` 또는 프로젝트 응답 규칙에 맞춰 반환
- 즉, controller 기본 형태는 `@ApiTags -> @Controller -> @UseGuards -> class` 이고, handler는 `JSDoc -> decorator -> method -> 4단계 내부 주석` 순서를 기본 형태로 삼는다.
- controller에서 DB 쿼리나 이벤트 발행 로직을 직접 넣지 않는다.

## 7. service 작성 규칙

- application service는 use case 중심 메서드를 가진다.
  - 예: `list`
- service는 repository 여러 개를 조합할 수 있지만, 현재 패턴상 생성자 주입으로 받는다.
- 다른 도메인의 정보를 참조해야 하면 그 도메인의 repository를 생성자 주입으로 받고, 해당 repository의 `find(...)`를 사용한다.
- service는 가능한 한 request transport 세부사항을 몰라야 한다.
- service는 pagination, transaction, event dispatch 등 비즈니스 orchestration을 담당한다.
- 다른 도메인 엔티티를 `entityManager`로 직접 조회하거나 service 내부 우회 helper로 감추지 않는다.

## 8. repository 작성 규칙

- repository는 `DddRepository<Entity>`를 상속한다.
- `entityClass = EntityClass`를 명시한다.
- 조회 조건은 plain object로 받고, 내부에서 `stripUndefined`, `convertOptions` 같은 공통 util을 사용한다.
- TypeORM 직접 호출은 repository 안으로 숨긴다.
- service나 controller에서 `entityManager.find(...)`를 직접 쓰지 않는다.

## 9. entity 작성 규칙

- entity는 TypeORM decorator를 사용한다.
- 현재 패턴상 aggregate root는 `DddAggregate`를 상속한다.
- `@Entity('<table_name>')`를 명시한다.
- 생성자는 선택값이 아니라 `args` 기반으로 필드를 채우는 형태를 유지한다.
- entity 내부에는 최소한의 도메인 상태와 규칙만 둔다.

## 10. AppModule 연결 규칙

- 루트 등록은 `src/app.module.ts`에서 한다.
- 개별 모듈을 바로 나열하지 않고, 서비스 그룹 배열을 import해서 spread 한다.

```ts
import adminsModule from './services/admins';
import generalsModule from './services/generals';

imports: [
  ConfigsModule,
  DatabasesModule,
  CommonModule,
  EventEmitterModule.forRoot(),
  ...adminsModule,
  ...generalsModule,
]
```

- 따라서 새 모듈을 추가하면:
  - admin 모듈 → `admins.ts`에 등록
  - general 모듈 → `generals.ts`에 등록
  - 양쪽 모두 → 각각의 그룹 파일에 등록

## 11. 서비스 그룹 파일 규칙

- `src/services/admins.ts`, `src/services/generals.ts`는 모듈 배열을 `default export` 한다.

```ts
// src/services/admins.ts
import { AdminModule } from './admin/admin.module';
import { AdminNoticeModule } from './notice/admin-notice.module';

export default [AdminModule, AdminNoticeModule];

// src/services/generals.ts
import { GeneralNoticeModule } from './notice/general-notice.module';

export default [GeneralNoticeModule];
```

- **같은 모듈을 양쪽 그룹 파일에 중복 등록하지 않는다** — admin/general 모듈을 분리해서 각각 등록한다.

## 12. 공통 모듈 사용 규칙

- 아래는 비즈니스 모듈이 직접 중복 구현하지 말고 가져다 써야 하는 공통 인프라다.
  - `ConfigsModule`
  - `DatabasesModule`
  - `CommonModule`
  - `EventEmitterModule`
- `CommonModule`은 현재 `@Global()` 이므로 context, slack, event-box 성격의 공통 기능은 우선 여기에 둔다.
- DB 연결, Redis/BullMQ 연결은 `DatabasesModule`에서 관리한다.

## 13. alias 사용 규칙

- `tsconfig.json` 기준 alias는 아래를 사용한다.
  - `@configs`
  - `@databases`
  - `@common/*`
  - `@middlewares`
  - `@libs/*`
  - `@services/*`
- 깊은 상대경로(`../../../`)가 길어지면 alias로 바꾼다.

## 14. 신규 모듈 생성 체크리스트

### 공통 단계
- `src/services/<domain>` 폴더 생성
- `applications`, `controllers`, `domain`, `repository` 하위 폴더 생성
- entity 작성 → `src/databases/entities.ts` 배열에 등록
- repository 작성

### 단일 타입 도메인
- service 작성
- controller 작성
- `<domain>.module.ts` 작성
- 해당 그룹 파일(`admins.ts` 또는 `generals.ts`)에 등록

### admin + general 양쪽 도메인
- admin service 작성
- general service 작성
- admin controller 작성
- general controller 작성
- `admin-<domain>.module.ts` 작성 → `admins.ts`에 등록
- `general-<domain>.module.ts` 작성 → `generals.ts`에 등록

### 마무리
- 공통 기능이 필요한 경우 `@common`, `@libs`에서 먼저 재사용 가능한지 확인

## 15. 주의사항

- 새 도메인에서 예외가 필요하면 기존 코드와 충돌하지 않는지 먼저 검토해야 한다.
- DTO, validator, guard, facade 계층은 `./dto-pattern.md`, `./validator-pattern.md`를 참고하여 필요 시 추가한다.
- 도메인이 admin만, general만, 또는 양쪽 모두 필요한지는 요구사항에 따라 결정한다 — 반드시 양쪽 모두 있어야 하는 것은 아니다.
