---
title: vogopang_back 코드 컨벤션
tags: [rules, code-conventions, vogopang, vogopang_back, nestjs]
updated: 2026-05-07
sources:
  - ./common-pattern.md
  - ./configs-pattern.md
  - ./databases-pattern.md
  - ./dto-pattern.md
  - ./libs-pattern.md
  - ./middlewares-pattern.md
  - ./module-generation.md
  - ./plan-rules.md
  - ./services-pattern.md
  - ./swagger-pattern.md
  - ./validator-pattern.md
see_also:
  - ../README.md
  - ../../index.md
  - ../../repos/vogopang_back.md
  - ../../services/vogopang/overview.md
---

# vogopang_back 코드 컨벤션

`vogopang_back` 코드 작업 전 읽어야 하는 규칙 묶음이다.

## 작업 전 확인 순서

- 신규 domain module을 만들거나 구조를 바꾸면 [module-generation.md](./module-generation.md)와 [services-pattern.md](./services-pattern.md)를 먼저 읽는다.
- endpoint를 추가·수정하면 [dto-pattern.md](./dto-pattern.md), [validator-pattern.md](./validator-pattern.md), [services-pattern.md](./services-pattern.md)를 함께 확인한다.
- DB 연결, entity 등록, repository query에 닿으면 [databases-pattern.md](./databases-pattern.md)를 확인한다.
- 설정, middleware, common/lib, swagger 작업은 해당 pattern 문서를 먼저 확인한다.
- 작업 계획서를 `plan/`에 쓰는 흐름이면 [plan-rules.md](./plan-rules.md)를 따른다.

## 문서 목록

| 문서 | 범위 |
|------|------|
| [common-pattern.md](./common-pattern.md) | `src/common` 전역 모듈, context, event-box, slack |
| [configs-pattern.md](./configs-pattern.md) | `src/configs` 설정 객체, env 검증, ConfigsService |
| [databases-pattern.md](./databases-pattern.md) | TypeORM, BullMQ, entities 등록, DB 연결 모듈 |
| [dto-pattern.md](./dto-pattern.md) | controller DTO 위치, 파일명, barrel export, 검증 책임 |
| [libs-pattern.md](./libs-pattern.md) | `src/libs` 유틸, DDD base, decorator, filter, interceptor, logger |
| [middlewares-pattern.md](./middlewares-pattern.md) | request context, trace id middleware 순서와 역할 |
| [module-generation.md](./module-generation.md) | 신규 NestJS domain module 생성 구조 |
| [plan-rules.md](./plan-rules.md) | `plan/` 폴더 작업 계획서 작성·승인 규칙 |
| [services-pattern.md](./services-pattern.md) | `src/services` domain/application/controller/repository 구조 |
| [swagger-pattern.md](./swagger-pattern.md) | Swagger JSON 생성 스크립트와 DB 의존성 우회 |
| [validator-pattern.md](./validator-pattern.md) | domain validator 계층과 비즈니스 조건 검증 |
