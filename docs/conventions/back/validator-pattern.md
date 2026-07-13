# vogopang_back validator 적용 규칙

이 문서는 `vogopang_back` 에서 validator 구조를 일관되게 적용하기 위한 기준 문서다.

## 1. 핵심 결론

- validator는 `도메인/조회 조건 validator`를 뜻한다.
- 입력 형식 검증과 DTO 규칙은 `./dto-pattern.md`에서 별도로 관리한다.
- 이 문서는 `domain/validators` 계층만 다룬다.

## 2. 도메인 validator 구조

- 위치:
  - `src/services/<domain>/domain/validators/*.ts`
- 기본 형태:
  - 추상 validator 클래스 1개
  - 구체 validator 구현체 여러 개
- 예:
  - `CommunityCommentValidator`
  - `CreatableCommunityCommentValidator`
  - `SeriesValidator`
  - `ViewableSeriesValidator`

## 3. 도메인 validator 역할

- 도메인 validator는 `비즈니스 조건`을 검증한다.
- 예:
  - parent comment가 실제로 존재하는가
  - 대댓글의 대댓글이 허용되는가
- 공개 상태인지
- 성인 인증/권한 조건을 만족하는가
- 즉 도메인 validator는 `형식 검증`이 아니라 `조회 조건 + 접근 가능성 + 비즈니스 제약`을 담당한다.

## 4. 도메인 validator 기본 인터페이스 패턴

- 추상 validator는 대체로 아래 두 메서드를 가진다.

```ts
abstract satisfyElementFrom(repository: SomeRepository): Promise<Entity[]>;
abstract satisfyCountFrom(repository: SomeRepository): Promise<number>;
```

- 구현체는 생성자에서 조건값을 받고, repository를 통해 실제 데이터를 조회/검증한다.
- 조건을 만족하지 않으면 즉시 예외를 던진다.

## 5. 도메인 validator 예외 처리 규칙

- 존재하지 않음, 잘못된 요청:
  - `BadRequestException`
- 권한 부족, 접근 불가:
  - `ForbiddenException`
- 아직 구현하지 않은 count path:
  - `NotImplementedException`
- vogopang_back 에도 같은 스타일을 유지하는 편이 일관성이 높다.

## 6. 도메인 validator 사용 위치

- 사용 위치는 controller가 아니라 `application service`다.
- 예:
  - service가 repository 호출 전에 `new ViewableSeriesValidator(...)`
  - repository에 `satisfyElementFrom`, `satisfyCountFrom` 로 넘긴다
- 즉 흐름은 아래와 같다.

```text
Controller -> Service -> Domain Validator -> Repository
```

## 7. vogopang_back 에 적용할 도메인 validator 규칙

- `admin`처럼 단순 CRUD만 있는 초기 단계에서는 `domain/validators` 계층이 꼭 필요하지 않을 수 있다.
- 하지만 아래 조건이 생기면 `domain/validators` 계층을 만든다.
  - 특정 리소스의 조회 가능 여부를 공통으로 재사용해야 할 때
  - 존재 여부 검증이 여러 서비스 메서드에 반복될 때
  - 공개/비공개, 권한, 상태값 검증이 반복될 때
  - 단순 find/count 조건 조합이 도메인 규칙으로 격상될 때
- 폴더 위치는 아래와 같이 둔다.

```text
src/services/<domain>/domain/validators/
```

## 8. 신규 validator 적용 체크리스트

- 비즈니스 접근 규칙이 반복되면 `domain/validators`를 만든다.
- service가 validator를 생성해서 repository에 전달하는지 확인한다.
- controller가 repository나 domain validator를 직접 호출하지 않게 유지한다.
- 입력 형식 검증 규칙은 `./dto-pattern.md`를 따른다.

## 9. vogopang_back 적용 우선순위

- 1순위:
  - `domain/validators` 계층 도입
- 점진적으로 필요한 도메인부터 넣는다.

## 10. 주의사항

- 이 문서는 `vogopang_back` 내부 규칙 문서다.
- 현재 vogopang_back 에는 `domain/validators` 표본이 거의 없으므로, 새 작업 시 이 문서를 기본 가이드로 삼고 실제 코드와 충돌하면 그 차이를 먼저 사용자에게 알린다.
