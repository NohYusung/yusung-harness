# vogopang_back swagger 규칙

이 문서는 `src/swagger` 폴더의 구조와 컨벤션을 기준으로 추출한 규칙이다.
새 에이전트나 개발자는 아래 규칙을 기본값으로 따르고, Swagger 문서 생성을 수정할 때 이 패턴을 유지한다.

## 1. 폴더 구조

```text
src/swagger/
  generate-swagger.ts    # Swagger JSON 생성 스크립트
```

- 파일 1개로 구성된다.
- 런타임 서버가 아닌, 빌드 후 실행하는 **독립 스크립트**다.

## 2. 실행 방법

```bash
npm run generate:swagger
```

- 내부 동작: `npm run build && SWAGGER_GEN=true node dist/swagger/generate-swagger.js`
- 빌드 후 컴파일된 JS를 실행한다.
- `SWAGGER_GEN=true` 환경 변수를 설정하여 `ConfigsModule`의 env 검증을 건너뛴다.

## 3. 동작 방식

### DB 의존성 우회

```ts
const memoryDataSource = new DataSource({
    type: 'sqlite',
    database: ':memory:',
    entities: [],
    synchronize: true,
    dropSchema: true,
});
```

- SQLite in-memory DB로 `DataSource`를 override하여 실제 MySQL 연결 없이 실행한다.
- `Test.createTestingModule()`로 `AppModule`을 로드하고 `DataSource`만 교체한다.

### 문서 분리 생성

2개의 Swagger JSON을 각각 생성한다.

| 파일 | 대상 모듈 | 제목 |
|------|----------|------|
| `swagger-user.json` | `generalModules` (`src/services/generals.ts`) | 리뉴얼 푸딩툰 일반 사용자 API |
| `swagger-admin.json` | `adminModules` (`src/services/admins.ts`) | 리뉴얼 푸딩툰 관리자 API |

- `include` 옵션으로 모듈 그룹별 문서를 분리한다.
- `extraModels`에 `PaginationDto`를 등록하여 공통 DTO가 문서에 포함되게 한다.

### DocumentBuilder 설정 패턴

```ts
const config = new DocumentBuilder()
    .setTitle('...')
    .setDescription('...')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
```

- `addBearerAuth()`로 JWT 인증 스키마를 추가한다.
- 버전은 `'1.0'`으로 고정한다.

### 출력

- 프로젝트 루트에 `swagger-user.json`, `swagger-admin.json` 파일을 생성한다.
- `JSON.stringify()`로 직렬화하여 `fs.writeFileSync()`로 저장한다.

## 4. 새 모듈 그룹의 Swagger 추가 절차

1. `src/services/<group>.ts` 모듈 그룹 파일이 있는지 확인
2. `generate-swagger.ts`에 해당 그룹을 import
3. 새 `DocumentBuilder` + `SwaggerModule.createDocument()` 블록 추가
4. `include`에 해당 모듈 배열 전달
5. `fs.writeFileSync()`로 새 JSON 파일 출력

## 5. SWAGGER_GEN 환경 변수

- `ConfigsModule`의 `validateConfigObject`는 `SWAGGER_GEN`이 설정되어 있으면 env 검증을 건너뛴다.
- Swagger 생성 시 `.env` 파일의 실제 DB/Redis 설정이 없어도 에러가 발생하지 않는다.

## 6. 주의사항

- Swagger 데코레이터(`@ApiProperty`, `@ApiOperation` 등)는 controller와 DTO에 직접 붙인다. 이 스크립트는 수집만 한다.
- controller 클래스에는 `@ApiTags(...)`를 반드시 붙인다.
- `@ApiTags(...)`는 `@Controller(...)` 바로 위에 두는 것을 기본 패턴으로 본다.
- 태그명은 접근 주체와 리소스 성격이 드러나는 한국어 문자열을 사용한다.
- client controller의 Swagger 태그 prefix는 `[사서]`로 통일한다.
  - 예: `[관리자] 관리자 API`, `[사서] FAQ API`, `[이용자] 공지사항 API`
- 새 도메인 모듈을 추가했으면, 해당 모듈이 `admins.ts` 또는 `generals.ts` 그룹에 등록되어야 Swagger 문서에 포함된다.
- `extraModels`에 공통 DTO를 추가하지 않으면 `$ref`로 참조되는 스키마가 누락될 수 있다.
- 출력 파일은 프로젝트 루트(`./`)에 생성되므로 `.gitignore`에 포함 여부를 확인한다.
