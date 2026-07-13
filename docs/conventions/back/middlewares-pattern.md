# vogopang_back middlewares 규칙

이 문서는 `src/middlewares` 폴더의 구조와 컨벤션을 기준으로 추출한 규칙이다.
새 에이전트나 개발자는 아래 규칙을 기본값으로 따르고, 미들웨어를 추가하거나 수정할 때 이 패턴을 유지한다.

## 1. 폴더 구조

```text
src/middlewares/
  index.ts                  # barrel export
  context.middleware.ts     # AsyncLocalStorage 컨텍스트 생성
  uuid.middleware.ts        # traceId(요청 추적 ID) 설정
```

- 3개 파일로 구성되며, 하위 폴더는 없다.
- `@middlewares` alias로 import 한다.

## 2. 미들웨어 실행 순서

`app.module.ts`에서 아래 순서로 모든 라우트(`'*'`)에 적용된다.

```ts
export class AppModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
        consumer.apply(ContextMiddleware, UUIDMiddleware).forRoutes('*');
    }
}
```

```text
요청 → ContextMiddleware → UUIDMiddleware → Guard/Interceptor → Controller
```

- `ContextMiddleware`가 먼저 실행되어 store를 생성해야 `UUIDMiddleware`가 `context.set()`을 호출할 수 있다.
- 순서를 바꾸면 `Error('There is no context store.')`가 발생한다.

## 3. ContextMiddleware

- `AsyncLocalStorage`에 새 `Map<string, any>` store를 생성하고, 그 안에서 요청 처리를 실행한다.
- 이후 요청 라이프사이클에서 `Context.get()`/`Context.set()`으로 데이터를 공유할 수 있게 된다.

```ts
@Injectable()
export class ContextMiddleware implements NestMiddleware {
    use(_: Request, __: Response, next: NextFunction) {
        const store = new Map<string, any>();
        asyncLocalStorage.run(store, () => next());
    }
}
```

**규칙**:
- `asyncLocalStorage`를 `@common/context`에서 직접 import 한다 (Context 서비스가 아닌 인스턴스).
- request, response를 사용하지 않으므로 `_`, `__`로 명명한다.

## 4. UUIDMiddleware

- 요청의 `x-request-id` 헤더가 있으면 그 값을, 없으면 UUID v7을 생성하여 traceId로 설정한다.
- `Context` 서비스를 주입받아 `ContextKey.TRACE_ID`에 저장한다.

```ts
@Injectable()
export class UUIDMiddleware implements NestMiddleware {
    constructor(private readonly context: Context) {}

    use(req: Request, _: Response, next: NextFunction) {
        const traceId = req.get('x-request-id') || uuid();
        this.context.set(ContextKey.TRACE_ID, traceId);
        next();
    }
}
```

**규칙**:
- UUID 버전은 `v7`을 사용한다 (시간순 정렬 가능).
- 외부에서 `x-request-id` 헤더로 traceId를 전달할 수 있다 (로드밸런서, API 게이트웨이 등).
- traceId는 이후 로깅, 예외 필터, TypeORM subscriber, 이벤트 등에서 사용된다.

## 5. 새 미들웨어 추가 절차

1. `src/middlewares/<name>.middleware.ts` 파일 생성
2. `@Injectable()` + `NestMiddleware` 구현
3. `index.ts`에 `export *` 추가
4. `app.module.ts`의 `configure()`에서 `consumer.apply(...).forRoutes()`에 등록
5. 실행 순서가 중요하면 `apply()` 인자 순서를 조정

## 6. 코드 스타일 규칙

- 파일명: `<name>.middleware.ts` 패턴
- 클래스명: `PascalCase + Middleware` (예: `ContextMiddleware`, `UUIDMiddleware`)
- `@Injectable()` 데코레이터 필수
- `NestMiddleware` interface 구현 필수
- 사용하지 않는 파라미터는 `_`, `__`로 명명
- Express 타입은 `import type` 으로 가져온다

## 7. 주의사항

- 현재 미들웨어는 2개 모두 `forRoutes('*')`로 전체 라우트에 적용된다.
- `ContextMiddleware`는 `asyncLocalStorage.run()` 안에서 `next()`를 호출하므로, 이후 모든 비동기 호출 체인에서 같은 store를 공유한다.
- 미들웨어에서 비즈니스 로직을 넣지 않는다. 컨텍스트 초기화, 인증 토큰 파싱 등 횡단 관심사만 처리한다.
