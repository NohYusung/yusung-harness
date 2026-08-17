# ArchitecturePlan - Pickme Platform v1

> 이 문서는 `create_architecturePlan`의 `content` 필드에 저장되는 고정 형식 예시다.
> 모든 ArchitecturePlan은 아래 0~15번 섹션을 같은 순서로 작성하며, 해당 사항이 없으면 `해당 없음`과 근거를 남긴다.

## 목차

- [0. 문서 메타데이터](#0-문서-메타데이터)
- [1. 목표와 KPI](#1-목표와-kpi)
  - [1.1 목표](#11-목표)
  - [1.2 KPI](#12-kpi)
- [2. 범위와 비범위](#2-범위와-비범위)
  - [2.1 포함 범위](#21-포함-범위)
  - [2.2 제외 범위](#22-제외-범위)
- [3. 전제와 제약](#3-전제와-제약)
- [4. 품질 속성 우선순위](#4-품질-속성-우선순위)
- [5. 아키텍처 결정 요약](#5-아키텍처-결정-요약)
- [6. 시스템 컨텍스트](#6-시스템-컨텍스트)
- [7. 런타임·인프라 구성](#7-런타임인프라-구성)
  - [7.1 런타임·인프라 배치 구조도](#71-런타임인프라-배치-구조도)
  - [7.2 컴포넌트 배치 표](#72-컴포넌트-배치-표)
  - [7.3 서비스 배치 규칙](#73-서비스-배치-규칙)
  - [7.4 코드·런타임 매핑](#74-코드런타임-매핑)
- [8. 기술 스택](#8-기술-스택)
- [9. 데이터·보안 설계](#9-데이터보안-설계)
  - [9.1 데이터 수명주기](#91-데이터-수명주기)
  - [9.2 보안 통제](#92-보안-통제)
- [10. 배포·롤백 전략](#10-배포롤백-전략)
- [11. 관측성·로그 관리](#11-관측성로그-관리)
  - [11.1 로그 계약](#111-로그-계약)
  - [11.2 대시보드·알림](#112-대시보드알림)
- [12. 장애·복구 전략](#12-장애복구-전략)
- [13. 리스크와 완화책](#13-리스크와-완화책)
- [14. 구현 단계](#14-구현-단계)
- [15. 승인 기준과 변경 이력](#15-승인-기준과-변경-이력)
  - [15.1 승인 체크리스트](#151-승인-체크리스트)
  - [15.2 미결정 사항](#152-미결정-사항)
  - [15.3 변경 이력](#153-변경-이력)

## 0. 문서 메타데이터

| 항목 | 값 |
| --- | --- |
| documentType | `ArchitecturePlan` |
| schemaVersion | `2.0.0` |
| projectId | `101` |
| projectName | `pickme-platform` |
| status | `PROPOSED` |
| owner | `Platform Team` |
| targetRelease | `2026-Q4` |
| lastReviewedAt | `2026-08-12` |

## 1. 목표와 KPI

### 1.1 목표

**안정적인 요청 처리**

- 계획된 운영 시간 동안 사용자의 요청이 안정적으로 처리되는 상태

**장애 영향 제한**

- 단일 장애가 전체 사용자 서비스 중단으로 확산되지 않는 상태

**정상 상태 복구**

- 장애 또는 변경 실패의 사용자 영향이 제한되고 이전 정상 상태로 복구 가능한 상태

**장애 인지와 요청 추적**

- 운영자가 심각 장애를 인지하고 개별 요청의 처리 경로와 실패 원인을 추적할 수 있는 상태

**환경 격리**

- 개발 환경의 변경·데이터·권한이 운영 서비스와 운영 데이터에 영향을 주지 않는 상태

### 1.2 KPI

아래 KPI는 각 목표의 달성 여부를 계량한다.

| KPI 제목 | 연결 목표 | 측정 구간 | 목표값 | 검증 절차 | 증적 |
| --- | --- | --- | --- | --- | --- |
| 사용자 대상 서비스 가용성 | 장애 영향 제한 | 월간 | 99.9% 이상 | 서비스 가용성 지표를 월간 집계한다. | 월간 SLO 보고서 |
| 사용자 요청 응답시간 p95 | 안정적인 요청 처리 | 월간 운영 트래픽 | 500ms 이하 | 요청 응답시간의 월간 p95를 집계한다. | 성능 대시보드 Snapshot |
| 운영 변경 구간 서버 오류 응답 비율 | 정상 상태 복구 | 운영 변경 진행 구간 | 1% 미만 | 운영 변경 전후 15분의 서버 오류 응답을 비교한다. | 변경별 오류율 보고서 |
| 심각 장애 최초 알림 지연 | 장애 인지와 요청 추적 | 장애 건별 | 5분 이내 | 장애 주입 또는 실제 장애 발생 시각과 최초 Critical 알림 수신 시각을 비교한다. | 장애·인시던트 타임라인 |
| 서비스 복구 시간 | 정상 상태 복구 | 분기별 복구 훈련 | RTO 30분 이내 | 격리 환경에서 서비스 복구 훈련을 수행한다. | 분기별 복구 훈련 기록 |
| 복구 데이터 손실 구간 | 정상 상태 복구 | 분기별 복구 훈련 | RPO 5분 이내 | 복원 데이터의 마지막 정상 시점을 확인한다. | 분기별 복구 훈련 기록 |
| 표본 요청 처리 경로 재구성 성공률 | 장애 인지와 요청 추적 | 릴리스별 20건 | 100% | 표본 요청 20건의 처리 경로를 로그에서 재구성한다. | 릴리스 검증 기록 |
| 환경 격리 정책 위반 경로 수 | 환경 격리 | 릴리스별 구성 검사 | 0개 | 환경 간 네트워크·권한 구성을 정책 검사한다. | 릴리스별 구성 검사 결과 |

## 2. 범위와 비범위

### 2.1 포함 범위

| 설계 대상 | 포함 관점 |
| --- | --- |
| 외부 사용자 채널부터 내부 서비스 경계까지 | 요청 수신·전달과 신뢰 경계 |
| 운영·개발 실행 환경 | 배치, 확장과 장애 격리 |
| 영속·캐시·객체 데이터 계층 | 저장 책임, 연결과 보호 정책 |
| 서비스·데이터·운영 계층 간 인터페이스 | 데이터 흐름과 접근 경계 |
| 빌드 산출물의 전달 경로 | 환경별 배포, 승격과 롤백 |
| 운영 지원 체계 | 백업, 복구, 로그, 메트릭, 경보와 운영자 접근 통제의 아키텍처 정책 |
| 단일 리전 배포 영역 | 가용성과 장애 대응 구조 |

### 2.2 제외 범위

| 제외 대상 | 제외 관점 | 제외 이유 | 관리 문서·재검토 조건 |
| --- | --- | --- | --- |
| 개별 서비스 | 업무 요구사항, 도메인 규칙과 기능 우선순위 | 레포 수준 인프라 계획의 책임이 아님 | Plan·Domain 문서 |
| API | 엔드포인트, 요청·응답 형식과 오류 코드 | 서비스 인터페이스 상세 설계에 해당 | API 명세 |
| 데이터베이스 내부 | 테이블, 인덱스, 쿼리와 데이터 마이그레이션 | 데이터 구조 상세 설계에 해당 | DB·ERD 문서 |
| 사용자 화면 | 사용자 흐름, UI와 디자인 시스템 | 제품 경험 설계에 해당 | Asset·Wireframe 문서 |
| 애플리케이션 코드 | 구현 방법과 테스트 케이스 | 구현·검증 단계의 책임 | Code·Test 산출물 |
| 운영 Runbook | 단계별 명령어와 담당자 연락망 | 실행 절차 상세에 해당 | 운영 Runbook |
| 멀티 리전 | 트래픽 분산, 데이터 복제와 Active-Active | 현재 단일 리전 제약을 벗어남 | 리전 확장 결정 시 ArchitecturePlan 재검토 |

- 포함 범위는 이번 문서에서 **설계할 대상과 경계**만 정의한다.
- 목표와 KPI는 포함 범위에 반복하지 않고 1절의 성공·측정 기준으로만 관리한다.

## 3. 전제와 제약

| 제목 | 구분 | 내용 | 영향 |
| --- | --- | --- | --- |
| 서울 리전을 주 리전으로 사용 | 전제 | 주 리전은 `ap-northeast-2`다. | 모든 운영 리소스를 서울 리전에 배치한다. |
| 불변 컨테이너 이미지 사용 | 전제 | 컨테이너 이미지는 불변 태그로 배포한다. | 커밋 SHA 단위 롤백이 가능하다. |
| 운영 데이터 계층의 비공개 접근 | 제약 | 운영 DB는 퍼블릭 인터넷에 노출하지 않는다. | Private Subnet과 제한된 Security Group이 필요하다. |
| 환경별 자격 증명 분리 | 제약 | 운영과 개발은 자격 증명을 공유하지 않는다. | IAM Role과 Secret 경로를 환경별로 분리한다. |
| 초기 단일 리전 운영 | 제약 | 초기 운영은 단일 리전이다. | 리전 장애는 백업 복구 절차로 대응한다. |

## 4. 품질 속성 우선순위

| 우선순위 | 품질 속성 | 설계 응답 | 검증 기준 |
| --- | --- | --- | --- |
| P0 | 가용성 | 운영 Task를 2개 AZ에 균등 배치 | AZ 1개 차단 후 정상 응답 |
| P0 | 보안 | Private Subnet, 최소 권한 IAM, TLS 적용 | 외부에서 DB·Redis 직접 접속 불가 |
| P1 | 관측성 | 구조화 로그, 메트릭, 알림을 통합 | `request_id`로 요청 경로 재구성 |
| P1 | 배포 안전성 | Rolling 배포와 자동 롤백 | 비정상 Target 발생 시 이전 버전 복귀 |
| P2 | 비용 효율 | 개발 환경 축소, 로그 보존 차등화 | 월 예산 임계치 초과 전 알림 |

## 5. 아키텍처 결정 요약

| 결정 제목 | 선택 이유 | 대안과 기각 사유 |
| --- | --- | --- |
| 컴퓨팅 플랫폼으로 ECS on EC2 사용 | 현재 Promtail sidecar와 EC2 운영 경험을 재사용한다. | Fargate는 노드 관리가 없지만 현행 로그 수집 방식 변경 비용이 크다. |
| 외부 진입점을 ALB로 통합 | Host·Path 기반 라우팅과 Target Health Check가 필요하다. | 서비스별 ALB는 격리는 좋지만 초기 비용과 운영점이 증가한다. |
| 운영 데이터베이스에 Multi-AZ RDS 사용 | 자동 장애 조치와 관리형 백업이 필요하다. | EC2 자체 운영 DB는 복구·패치 부담이 크다. |
| 로그를 Promtail → Loki → Grafana로 통합 | 현행 구조를 유지하면서 중앙 검색과 대시보드를 제공한다. | CloudWatch Logs 단일화는 마이그레이션 비용을 별도 검토해야 한다. |

## 6. 시스템 컨텍스트

```text
[Web / Mobile User]
         |
         | HTTPS
         v
[Amplify Web Apps] ---> [ALB]
                            |
              +-------------+-------------+
              |                           |
              v                           v
      [prod ECS Cluster]          [dev ECS Cluster]
              |                           |
       +------+------+             +------+------+
       |      |      |             |      |      |
       v      v      v             v      v      v
     [RDS] [Redis]  [S3]         [RDS] [Redis]  [S3]
       ^      ^                      ^      ^
       +------+---------- services --+------+
              |
              | structured logs
              v
         [Promtail] ---> [Loki] <--- [Grafana]
```

- 신뢰 경계는 `Public`, `prod`, `dev`, `ops` 네 영역으로 구분한다.
- 운영 서비스는 개발 데이터 저장소에 접근할 수 없고, 개발 서비스도 운영 저장소에 접근할 수 없다.

## 7. 런타임·인프라 구성

### 7.1 런타임·인프라 배치 구조도

- 아래 ASCII 구조도는 전체 배치와 주요 흐름을 빠르게 파악하기 위한 요약이다.
- 대괄호 안에는 코드형 ID가 아니라 사람이 읽는 컴포넌트 제목을 표시한다.
- 같은 제목의 컴포넌트를 구분할 때는 환경부터 현재 노드까지의 제목을 ` > `로 결합한 제목 경로를 사용한다.

```text
[공통]
  [Web/Mobile 사용자]
          |
          | 정적 콘텐츠 요청
          v
  [Amplify Web Apps]
          |
          | API 요청
          v
  [Application Load Balancer]
          |
          +-- 운영 서비스 요청 전달 --------> [운영 환경의 서비스 Task 4개]
          `-- 제한된 개발 서비스 요청 전달 --> [개발 환경의 서비스 Task 2개]

[운영]
  [ECS Cluster]
    +-- [AZ A EC2]
    |     +-- [pickme Task]
    |     |     `-- [Promtail sidecar]
    |     `-- [pudding Task]
    |           `-- [Promtail sidecar]
    +-- [AZ C EC2]
    |     +-- [pickme Task]
    |     |     `-- [Promtail sidecar]
    |     `-- [pudding Task]
    |           `-- [Promtail sidecar]
    +-- 관계형 데이터 접근 ------> [RDS]
    +-- 캐시 접근 ---------------> [Redis]
    `-- 애플리케이션 객체 접근 --> [S3 객체 저장소]

[개발]
  [ECS Cluster]
    +-- [AZ A EC2]
    |     +-- [pickme Task]
    |     |     `-- [Promtail sidecar]
    |     `-- [pudding Task]
    |           `-- [Promtail sidecar]
    +-- 관계형 데이터 접근 ------> [RDS]
    +-- 캐시 접근 ---------------> [Redis]
    `-- 애플리케이션 객체 접근 --> [S3 객체 저장소]

[운영·개발 Task의 Promtail sidecar 6개]
          |
          | 구조화 로그 전송
          v
[관측성]
  [ECS Cluster]
    `-- [EC2]
          +-- [Loki Container]
          `-- [Grafana Container] -- 로그 조회 --> [Loki Container]
```

- 운영과 개발 데이터 저장소 사이에는 연결선이 없다.
- Promtail은 EC2 공용 agent가 아니라 각 서비스 Task의 sidecar다.
- Loki 장기 보관 S3는 아직 결정되지 않았으므로 구조도에 포함하지 않는다.

### 7.2 컴포넌트 배치 표

| 컴포넌트 제목 | 환경 | 계층 | 부모 제목 | 확장·가용성 |
| --- | --- | --- | --- | --- |
| Web/Mobile 사용자 | 공통 | External | 공통 | 해당 없음 |
| Amplify Web Apps | 공통 | Edge | 공통 | 정적 자산 CDN 배포 |
| Application Load Balancer | 공통 | Ingress | 공통 | Public Subnet 2 AZ, Cross-zone Load Balancing |
| ECS Cluster | 운영 | Compute | 운영 | Private Subnet 2 AZ, 서비스별 Task 2개 |
| AZ A EC2 | 운영 | Compute | `운영 > ECS Cluster` | Task 균등 분배 |
| AZ C EC2 | 운영 | Compute | `운영 > ECS Cluster` | Task 균등 분배 |
| pickme Task | 운영 | Task | `운영 > ECS Cluster > AZ A EC2` | 서비스 replica 1/2 |
| pudding Task | 운영 | Task | `운영 > ECS Cluster > AZ A EC2` | 서비스 replica 1/2 |
| pickme Task | 운영 | Task | `운영 > ECS Cluster > AZ C EC2` | 서비스 replica 2/2 |
| pudding Task | 운영 | Task | `운영 > ECS Cluster > AZ C EC2` | 서비스 replica 2/2 |
| Promtail sidecar | 운영 | Sidecar | `운영 > ECS Cluster > AZ A EC2 > pickme Task` | Task와 동일 lifecycle |
| Promtail sidecar | 운영 | Sidecar | `운영 > ECS Cluster > AZ A EC2 > pudding Task` | Task와 동일 lifecycle |
| Promtail sidecar | 운영 | Sidecar | `운영 > ECS Cluster > AZ C EC2 > pickme Task` | Task와 동일 lifecycle |
| Promtail sidecar | 운영 | Sidecar | `운영 > ECS Cluster > AZ C EC2 > pudding Task` | Task와 동일 lifecycle |
| RDS | 운영 | Data | `운영 > ECS Cluster` | Multi-AZ, 자동 백업 |
| Redis | 운영 | Cache | `운영 > ECS Cluster` | Replica와 자동 장애 조치 |
| S3 객체 저장소 | 운영 | Object | `운영 > ECS Cluster` | Versioning, SSE-KMS |
| ECS Cluster | 개발 | Compute | 개발 | Private Subnet 1 AZ, 서비스별 Task 1개 |
| AZ A EC2 | 개발 | Compute | `개발 > ECS Cluster` | 개발 전용 단일 Capacity |
| pickme Task | 개발 | Task | `개발 > ECS Cluster > AZ A EC2` | desired count 1 |
| pudding Task | 개발 | Task | `개발 > ECS Cluster > AZ A EC2` | desired count 1 |
| Promtail sidecar | 개발 | Sidecar | `개발 > ECS Cluster > AZ A EC2 > pickme Task` | Task와 동일 lifecycle |
| Promtail sidecar | 개발 | Sidecar | `개발 > ECS Cluster > AZ A EC2 > pudding Task` | Task와 동일 lifecycle |
| RDS | 개발 | Data | `개발 > ECS Cluster` | 운영 자격 증명과 분리 |
| Redis | 개발 | Cache | `개발 > ECS Cluster` | 운영 자격 증명과 분리 |
| S3 객체 저장소 | 개발 | Object | `개발 > ECS Cluster` | 운영 Bucket과 분리 |
| ECS Cluster | 관측성 | Observability | 관측성 | 애플리케이션 환경과 분리 |
| EC2 | 관측성 | Observability | `관측성 > ECS Cluster` | Loki·Grafana 전용 |
| Loki Container | 관측성 | Log Store | `관측성 > ECS Cluster > EC2` | 운영 30일, 개발 7일 |
| Grafana Container | 관측성 | Query | `관측성 > ECS Cluster > EC2` | 사내 접근만 허용 |

### 7.3 서비스 배치 규칙

```yaml
ecs_service_defaults:
  prod:
    desired_count: 2
    placement: spread-across-availability-zones
    deployment:
      minimum_healthy_percent: 100
      maximum_percent: 200
  dev:
    desired_count: 1
    deployment:
      minimum_healthy_percent: 0
      maximum_percent: 100
```

### 7.4 코드·런타임 매핑

| 레포 경로 | 책임 | 런타임 | 연결 컴포넌트 제목 경로 |
| --- | --- | --- | --- |
| `apps/web/*` | 사용자·관리자 웹 UI | Amplify Web Apps | `공통 > Amplify Web Apps`, `공통 > Application Load Balancer` |
| `services/pickme` | Pickme API와 업무 규칙 | 운영·개발 ECS Task | `운영 > ECS Cluster > AZ A EC2 > pickme Task`, `운영 > ECS Cluster > AZ C EC2 > pickme Task`, `개발 > ECS Cluster > AZ A EC2 > pickme Task` |
| `services/pudding` | Pudding API와 업무 규칙 | 운영·개발 ECS Task | `운영 > ECS Cluster > AZ A EC2 > pudding Task`, `운영 > ECS Cluster > AZ C EC2 > pudding Task`, `개발 > ECS Cluster > AZ A EC2 > pudding Task` |
| `deploy/ecs` | Task Definition과 서비스 배치 규칙 | ECS Control Plane | `운영 > ECS Cluster`, `개발 > ECS Cluster`, `관측성 > ECS Cluster` |
| `infra/terraform` | VPC, ALB, ECS, RDS, Redis, S3, IAM | Terraform Runner | 7.2의 컴포넌트 제목과 부모 제목을 결합한 모든 AWS 컴포넌트 제목 경로 |
| `ops/promtail` | 컨테이너 로그 수집 설정 | 서비스별 sidecar | `운영 > ECS Cluster > AZ A EC2 > pickme Task > Promtail sidecar`, `운영 > ECS Cluster > AZ A EC2 > pudding Task > Promtail sidecar`, `운영 > ECS Cluster > AZ C EC2 > pickme Task > Promtail sidecar`, `운영 > ECS Cluster > AZ C EC2 > pudding Task > Promtail sidecar`, `개발 > ECS Cluster > AZ A EC2 > pickme Task > Promtail sidecar`, `개발 > ECS Cluster > AZ A EC2 > pudding Task > Promtail sidecar`, `관측성 > ECS Cluster > EC2 > Loki Container` |
| `ops/grafana` | 대시보드와 알림 정의 | 관측성 ECS | `관측성 > ECS Cluster > EC2 > Grafana Container`, `관측성 > ECS Cluster > EC2 > Loki Container` |

- 실제 프로젝트에서 경로가 다르면 위 표를 먼저 갱신하고, 존재하지 않는 경로를 승인 상태로 남기지 않는다.
- 컴포넌트명은 레포 경로, ECS Service, 구조도, 로그의 `service` 필드에서 동일하게 사용한다.

## 8. 기술 스택

| 영역 | 기술 | 책임 | 버전 정책 |
| --- | --- | --- | --- |
| Frontend | AWS Amplify Hosting | 웹 빌드·배포·호스팅 | 프로젝트 lockfile 기준 |
| Ingress | Application Load Balancer | TLS 종료, 라우팅, Health Check | AWS Managed |
| Compute | Amazon ECS on EC2 | 서비스 컨테이너 오케스트레이션 | ECS Optimized AMI 분기 갱신 |
| Database | Amazon RDS | 영속 관계형 데이터 | 엔진 Major 고정, Minor 자동 패치 |
| Cache | ElastiCache for Redis | 세션·캐시 | 호환 Major 고정 |
| Object | Amazon S3 | 파일·백업·로그 객체 | Versioning 활성화 |
| Logs | Promtail, Loki, Grafana | 수집·저장·검색·시각화 | 호환 버전 조합 고정 |
| IaC | Terraform | 인프라 선언·변경 이력 | 최소 버전과 provider lock 고정 |

## 9. 데이터·보안 설계

### 9.1 데이터 수명주기

| 저장소 | 데이터 | 암호화 | 백업·보존 | 접근 주체 |
| --- | --- | --- | --- | --- |
| RDS | 업무 트랜잭션 | KMS at rest, TLS in transit | 자동 백업 14일, 스냅샷 월 1회 | 서비스 Task Role, DBA Break-glass |
| Redis | 세션·캐시 | KMS at rest, TLS in transit | 캐시 재생성 원칙 | 서비스 Task Role |
| S3 | 업로드·정적 파일 | SSE-KMS | Versioning, 수명주기 정책 | 서비스 Task Role, 배포 Role |
| Loki | 애플리케이션 로그 | 저장소 암호화, TLS | prod 30일, dev 7일 | 운영·개발 조회 Role 분리 |

### 9.2 보안 통제

- 외부 통신은 TLS 1.2 이상을 사용한다.
- ALB만 서비스 Target Port에 접근할 수 있다.
- ECS Task만 RDS·Redis Security Group에 접근할 수 있다.
- 비밀값은 이미지·환경 파일에 포함하지 않고 Secrets Manager에서 주입한다.
- 운영 변경 Role에는 MFA와 승인 이력을 요구한다.
- 로그의 개인정보 필드는 수집 전에 마스킹한다.

## 10. 배포·롤백 전략

```text
[main merge]
     |
     v
[test + image build]
     |
     v
[ECR push: git-sha]
     |
     v
[dev deploy] -- smoke test 실패 --> [stop]
     |
     v
[prod approval]
     |
     v
[ECS rolling deploy] -- alarm 발생 --> [previous task definition]
     |
     v
[15분 관찰] --> [release complete]
```

| 단계 | 진입 조건 | 성공 조건 | 실패 시 조치 |
| --- | --- | --- | --- |
| Build | `main` merge | 테스트 통과, 이미지·SBOM 생성 | 배포 중단 |
| Dev | 이미지 생성 완료 | Smoke Test 100% 통과 | Task Definition 되돌림 |
| Prod | 승인 완료 | Target 정상, 5xx·latency 정상 | 이전 Task Definition 자동 복귀 |
| Observe | 운영 배포 완료 | 15분간 경보 없음 | 수동 롤백 및 인시던트 생성 |

## 11. 관측성·로그 관리

### 11.1 로그 계약

```json
{
  "timestamp": "2026-08-12T10:00:00.000Z",
  "level": "INFO",
  "service": "pickme-api",
  "environment": "prod",
  "request_id": "req_01J...",
  "trace_id": "tr_01J...",
  "event": "application.submitted",
  "duration_ms": 142
}
```

### 11.2 대시보드·알림

| 신호 | 지표 | Warning | Critical | 대응 |
| --- | --- | --- | --- | --- |
| Availability | ALB healthy target | 1개 감소 | 정상 Target 0개 | 배포 중지·온콜 호출 |
| Errors | HTTP 5xx 비율 | 2%/5분 | 5%/5분 | 최근 배포 확인·롤백 |
| Latency | p95 응답시간 | 500ms/10분 | 1s/5분 | 병목 서비스·DB 확인 |
| Saturation | ECS CPU·Memory | 70%/15분 | 85%/5분 | Scale-out·누수 점검 |
| Database | RDS connections | 70% | 85% | 풀 크기·장기 쿼리 점검 |
| Logs | Promtail 전송 실패 | 1%/5분 | 5%/5분 | 버퍼·Loki 상태 점검 |

## 12. 장애·복구 전략

| 장애 시나리오 | 탐지 | 자동 대응 | 수동 대응 | 복구 목표 |
| --- | --- | --- | --- | --- |
| ECS Task 장애 | Target Health Check | Task 재기동 | 최근 로그·배포 확인 | 5분 이내 |
| 단일 AZ 장애 | Target·Task 감소 | 다른 AZ로 Task 배치 | 용량 증설 | 15분 이내 |
| RDS Primary 장애 | RDS Event | Multi-AZ Failover | 연결 상태 검증 | RTO 10분 |
| 잘못된 배포 | 5xx·latency 경보 | 이전 Task Definition 배포 | 원인 분석·재배포 | RTO 15분 |
| 리전 장애 | 합성 모니터 실패 | 해당 없음 | 백업으로 대체 리전 복구 | RTO 4시간, RPO 5분 |

## 13. 리스크와 완화책

| 리스크 | 가능성 | 영향 | 완화책 | 담당 |
| --- | --- | --- | --- | --- |
| EC2 Capacity 부족으로 Task 배치 실패 | 중 | 상 | Capacity Reservation 또는 ASG 여유 30% 유지 | Platform |
| Promtail·Loki 병목으로 로그 유실 | 중 | 중 | 디스크 버퍼, 전송 실패 경보, 부하 시험 | SRE |
| 환경 간 IAM 권한 혼선 | 중 | 상 | 계정·Role·Secret 경로 분리 및 정책 테스트 | Security |
| 단일 리전 장애 | 저 | 상 | 자동 백업, 복구 Runbook, 분기별 훈련 | Platform |

## 14. 구현 단계

| Phase | 산출물 | 완료 조건 |
| --- | --- | --- |
| 1. Foundation | VPC, Subnet, IAM, KMS, Terraform State | 개발·운영 경계 테스트 통과 |
| 2. Data | RDS, Redis, S3, Secret | 암호화·백업·접근 통제 검증 |
| 3. Compute | ALB, ECS Cluster, 서비스·Task Definition | Health Check와 AZ 분산 검증 |
| 4. Delivery | Build·Deploy·Rollback Pipeline | Dev→Prod 승격·롤백 시연 |
| 5. Observability | Promtail, Loki, Grafana, Alerts | `심각 장애 최초 알림 지연`·`표본 요청 처리 경로 재구성 성공률` 검증 통과 |
| 6. Readiness | 부하·장애·복구 시험, Runbook | 15번 승인 기준 전체 통과 |

## 15. 승인 기준과 변경 이력

### 15.1 승인 체크리스트

- [ ] 1.2의 모든 KPI에 목표값, 검증 절차, 증적이 빠짐없이 연결되어 있다.
- [ ] 운영·개발·관측성 경계와 접근 규칙이 구현 가능한 수준으로 명시되어 있다.
- [ ] 배포 실패와 데이터 장애에 대한 롤백·복구 절차가 있다.
- [ ] 기술 스택, 데이터 보존, 로그 필드에 미결정 placeholder가 없다.
- [ ] 책임자가 모든 P0 품질 속성과 고위험 항목을 승인했다.

### 15.2 미결정 사항

***리전 재해 복구를 Warm Standby로 상향할 것인가?***

- 비용: 보조 리전에 상시 리소스와 데이터 복제를 유지하므로 인프라 비용이 증가한다.
- 가용성: 주 리전 장애 시 보조 리전으로 전환하여 서비스 복구 시간을 단축한다.
- 운영: 리전 전환 절차, 복제 지연과 오류 감시, 정기 복구 훈련이 추가된다.

***로그 저장소를 S3 장기 보관과 연계할 것인가?***

- 비용: 장기 로그의 객체 저장과 요청 비용이 발생하며 수명주기 정책으로 보관 비용을 조정할 수 있다.
- 성능: 장기 로그 조회 경로에 객체 저장소 접근이 추가되어 조회 응답시간이 늘어날 수 있다.
- 보안: 로그 객체의 암호화, 접근 권한, 보존 기간 통제가 추가된다.
- 운영: 로그 수명주기, 복원, 장기 로그 조회 절차를 관리해야 한다.

### 15.3 변경 이력

| 버전 | 일자 | 변경 내용 | 작성자 |
| --- | --- | --- | --- |
| 2.0.3 | 2026-08-12 | KPI 정의와 검증 정보를 1.2의 단일 표로 통합 | Architecture Team |
| 2.0.2 | 2026-08-12 | 미결정 사항을 질문과 예상 이펙트 형식으로 변경 | Architecture Team |
| 2.0.1 | 2026-08-12 | Markdown·HTML 일치 규칙과 연결 튜플 정본 제거 | Architecture Team |
| 2.0.0 | 2026-08-12 | 사용자 표시를 제목 중심으로 전환하고 컴포넌트 제목 경로와 연결 튜플 계약 적용 | Architecture Team |
| 1.2.0 | 2026-08-12 | 7번 런타임·인프라 ASCII 구조도와 Markdown·HTML 정합성 계약 추가 | Architecture Team |
| 1.1.0 | 2026-08-12 | 목표 제목을 굵게 표시하고 측정 기준을 KPI로 전환 | Architecture Team |
| 1.0.2 | 2026-08-12 | 목표를 제목·내용 형식으로 변경하고 목표 ID 제거 | Architecture Team |
| 1.0.1 | 2026-08-12 | 목표·측정 기준·범위의 역할 분리 및 검증 절차 이동 | Architecture Team |
| 1.0.0 | 2026-08-12 | 최초 제안 작성 | Architecture Team |
