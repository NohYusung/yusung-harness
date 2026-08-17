---
name: ARCHITECTURE
description: doc-curator가 yusung-harness/apps 서버를 관리 저장하기 위한 도메인 구조
---

doc-curator는 이 아키텍쳐를 기반으로, yusung-harness/apps 서버를 통해 문서를 관리한다.

## Domain Markdown 계층 계약

- `Domain`은 ERD나 DB table snapshot이 아니라 업무 영역의 목적, 역할·책임, 비즈니스 규칙과 코드 근거를 설명하는 Markdown 페이지다.
- 한 프로젝트의 한 업무 Domain은 정확히 한 레코드로 관리하며 `domainId`가 안정적인 identity다.
- nullable `parentId`로 깊이 제한 없는 단일 부모 트리를 구성한다. root는 `null`, child는 같은 프로젝트의 parent Domain ID를 사용한다.
- `parentId`는 구조적 상위·하위 업무 경계이며 서비스 의존성 DAG를 의미하지 않는다.
- `(projectId, title)`은 trim한 대소문자 구분 제목으로 유일하다. parent 존재·프로젝트 소유권·self/descendant cycle은 `DomainsService` transaction에서 검증한다.
- REST는 기존 `GET /domains/:projectId` flat 목록만 제공한다. 쓰기는 MCP `create_domain`과 `update_domain`만 담당한다.
- 대시보드는 flat 목록을 iterative O(n) tree로 조립하여 계층 탐색, breadcrumb, parent/child 정보와 Markdown 상세를 읽기 전용으로 표시한다.
- Domain content에 ERD JSON 또는 `kind: "domain-erd"` payload를 저장하지 않는다. 신규 migration은 정확한 legacy ERD v1 JSON 행만 삭제하고 Markdown과 다른 JSON은 보존한다.

```text
domain skill ── get/create/update_domain
      |
      v
DomainsService
 ├─ 페이지 제목 중복 방지
 ├─ 같은 프로젝트 parent 검증
 └─ self/ancestor cycle 검증
      |
      v
Domain(id, projectId, parentId?, title, Markdown)
      |
      v
GET /domains/:projectId ──> ArtifactWorkbench read-only tree
```

### Domain hierarchy migration 운영 절차

- 적용 직전 SQLite online backup을 만들고 `PRAGMA integrity_check`, 전체 Domain 수, exact legacy ERD 판정식의 삭제 대상 수, `trim(title)` 중복 수를 기록한다.
- migration은 transaction 안에서 보존 대상만 `new_Domain`에 복사한 뒤 unique index를 생성한다. 보존할 Markdown 제목이 중복되면 원본 table을 그대로 두고 실패하므로 데이터를 임의 병합하지 않는다.
- 성공 후 Domain 수·ID·projectId·timestamp·content·trim 제목 보존, 모든 초기 `parentId = null`, `PRAGMA foreign_key_check`, index와 migration checksum을 검증한다.
- 적용 직후 검증 실패 시 애플리케이션 쓰기를 중단하고 migration 직전 snapshot 전체를 복원한 뒤 원인을 수정해 재시도한다.
- migration 이후 새 쓰기가 발생한 DB는 이전 snapshot으로 부분 rollback하지 않는다. 새 쓰기를 보존해야 하면 별도 forward recovery migration을 작성한다.

## 산출물 책임 경계

- `Domain`: 업무 Domain별 계층형 Markdown 페이지
- `Architecture(type=PLAN)`: 구현 전 시스템 구조 계획 Markdown과 HTML 구조도
- `Architecture(type=PRODUCTION)`: 구현 후 현재 배포 구조의 canonical JSON graph
- `Database`: 현행 DB schema Markdown
- `ERD`: Dineug v3 관계 문서
- 폴더, 기술 계층, DB table을 업무 Domain으로 추정하지 않고 각 산출물의 책임을 섞지 않는다.

## Architecture 통합 계약

- 별도 계획 모델을 두지 않고 `Architecture.type`으로 PLAN과 PRODUCTION을 구분한다.
- `(projectId, type)`은 유일하며 프로젝트마다 각 type의 최신본을 최대 한 건 유지한다.
- 조회는 `get_architecture({ projectId })`, 저장은 `upsert_architecture`만 사용한다.
- upsert 갱신은 `id`, `type`, `createdAt`을 보존하고 title·content·html·updatedAt을 교체한다.
- REST `GET /architectures/:projectId`와 `get_project`는 type이 포함된 Architecture를 0~2건 반환한다. 별도 계획 route는 제공하지 않는다.
- Project summary의 `_count.architectures`는 물리 row 수가 아니라 Architecture workspace 존재 여부인 `0 | 1`이다.
- 대시보드는 Architecture 아래 `Plan | Current`를 표시하고 Current가 있으면 기본 선택하며, 없으면 Plan으로 fallback한다.

```text
Architecture
├─ PLAN
│  ├─ content: Markdown 설계 문서
│  └─ html: 완전한 단일 HTML 구조도
└─ PRODUCTION
   ├─ content: DeploymentArchitectureV1 canonical JSON
   └─ html: ""
```

### `DeploymentArchitectureV1`

- root는 `kind: "deployment-architecture"`, `schemaVersion: 1`, `name`, `environments`, `nodes`, `connections`만 사용한다.
- environment kind는 `client | local | cloud | edge | external`이다.
- node kind는 `client | gateway | service | worker | database | cache | queue | storage | external`이다.
- node의 `environmentId`는 존재하는 environment를 참조하고 connection의 source·target은 존재하는 서로 다른 node를 참조한다.
- environment와 node의 ID·name, connection ID와 동일 방향 endpoint 쌍은 중복될 수 없다.
- environment 50개, node 100개, connection 1,000개의 상한을 지킨다.
- `generatedAt`을 포함하면 offset이 있는 ISO datetime을, `sourceRevision`을 포함하면 확인된 revision을 사용한다.

### 통합 migration 보존 규칙

- 기존 Architecture row는 ID를 보존한 채 `PRODUCTION`으로 복사한다.
- 기존 계획 row는 `max(old Architecture.id) + old plan id`로 충돌 없는 새 ID를 계산해 `PLAN`으로 복사한다.
- projectId, title, content, html, createdAt과 updatedAt은 원문을 보존한다.
- type 중복, orphan project, ID overflow 또는 유효하지 않은 PRODUCTION JSON이 있으면 migration 전체를 중단한다.
- 과거 migration 파일과 그 당시 계약을 설명하는 fixture는 감사 이력으로 보존한다.

### Architecture consolidation maintenance runbook

#### 자동 실행 순서

- `predev`는 다음 순서를 `&&`로 실행한다.

```text
prisma generate
  → prepare-sqlite.mjs
  → preflight-architecture-consolidation.mjs
  → preflight-research-migration.mjs
  → prisma migrate deploy
  → backfill-erd-documents.mjs
  → nest start --watch
```

- `prestart`는 이미 생성된 Prisma client를 전제로 다음 순서를 `&&`로 실행한다.

```text
prepare-sqlite.mjs
  → preflight-architecture-consolidation.mjs
  → preflight-research-migration.mjs
  → prisma migrate deploy
  → backfill-erd-documents.mjs
  → node dist/main.js
```

- 수동 개발 migration용 `prisma:migrate`도 같은 safety gate를 우회하지 않고 다음 순서를 `&&`로 실행한다.

```text
prepare-sqlite.mjs
  → preflight-architecture-consolidation.mjs
  → preflight-research-migration.mjs
  → prisma migrate dev
  → backfill-erd-documents.mjs
```

- 세 script 모두 preflight 또는 migration이 실패하면 뒤 단계를 실행하지 않는다. `predev`와 `prestart`에서는 새 Nest server도 시작되지 않는다.
- 상위 `apps`의 `pnpm dev`는 workspace를 병렬 실행하므로 web process가 따로 시작됐을 수 있다. cutover 실패 시 해당 web process도 명시적으로 중지한다.
- `preflight-architecture-consolidation.mjs`가 `fresh` 또는 `already-consolidated`를 확인하면 backup 없이 아래 no-op evidence를 출력하고 migration 단계로 진행한다.

```text
Architecture consolidation preflight: {"action":"noop","state":"fresh|already-consolidated"}
```

#### legacy cutover preflight evidence

- legacy `Architecture`와 계획 table이 함께 존재할 때 preflight는 다음 작업을 순서대로 완료해야 한다.
  1. 원본 DB의 `PRAGMA integrity_check = ok`와 `PRAGMA foreign_key_check` 0건을 확인한다.
  2. 기존 Architecture 전체를 runtime과 동일한 `DeploymentArchitectureV1` schema로 검증한다.
  3. legacy Architecture와 계획 row count를 기록한다.
  4. SQLite online backup을 `/private/tmp/<database>-architecture-consolidation-<timestamp>-<uuid>.db`에 생성하고 SHA-256을 계산한다.
  5. backup을 별도 임시 DB로 복사해 전체 복원 rehearsal을 수행하고 integrity, FK와 row count가 원본과 일치하는지 확인한다.
  6. rehearsal 임시 DB만 제거하고 실제 backup은 보존한다.
- migration을 허용하려면 `Architecture consolidation preflight: ` prefix 뒤 JSON이 `action: "ready"`이고 다음 evidence를 모두 포함해야 한다.

```json
{
  "action": "ready",
  "databasePath": "/absolute/path/to/harness-board.db",
  "backupPath": "/private/tmp/harness-board-architecture-consolidation-<timestamp>-<uuid>.db",
  "sha256": "<64 lowercase hex>",
  "counts": {
    "architectures": 1,
    "architecturePlans": 4
  },
  "integrityCheck": "ok",
  "foreignKeyViolationCount": 0,
  "restoreRehearsal": {
    "ok": true,
    "integrityCheck": "ok",
    "foreignKeyViolationCount": 0,
    "counts": {
      "architectures": 1,
      "architecturePlans": 4
    }
  }
}
```

- `databasePath`, `backupPath`, `sha256`와 실제 count 값은 실행 출력 그대로 cutover evidence에 보관한다. 예시의 `1`과 `4`를 다른 DB에 하드코딩하지 않는다.
- 원본과 rehearsal의 count가 다르거나 health·deployment schema 검증이 실패하면 backup이 있더라도 migration을 실행하지 않는다.

#### migration 실패 복원

1. 실패한 새 server와 web을 즉시 중지하고 모든 writer를 닫는다.
2. preflight 출력의 `backupPath` 파일이 존재하고 현재 SHA-256이 기록된 `sha256`과 exact-match하는지 확인한다.
3. partial migration DB를 row 단위로 고치지 말고, 출력된 backup 파일로 `databasePath` 전체를 복원한다.
4. 복원 DB에서 integrity `ok`, FK 위반 0건과 preflight의 `counts`가 다시 일치하는지 확인한다.
5. 애플리케이션 코드를 Architecture 통합 기준 revision `e1f3b43c23f75db0c9067606ff6a485dedd507ca`로 되돌려 server와 web을 재기동한다.
6. 이전 revision의 프로젝트 조회와 Architecture·계획 조회가 정상일 때만 writer를 다시 연다.

#### rollback 금지 경계

- migration 이후 새 `upsert_architecture`가 한 번이라도 성공하면 preflight backup에는 새 PLAN·PRODUCTION 쓰기가 없으므로 전체 backup rollback을 수행하지 않는다.
- 이 경계 이후 결함은 새 쓰기를 보존하는 forward-fix migration 또는 검증된 type별 데이터 보정으로 해결한다.
- post-upsert 문제를 이유로 이전 revision만 재기동하거나 preflight backup으로 DB를 덮어쓰지 않는다.

## Research 단일 산출물 계약

- 제품 Discovery와 live 외부 근거 검증은 `Research` 하나에서 관리한다.
- 여러 Research row를 허용하며 조회는 `updatedAt DESC`다.
- REST는 `GET /research/:projectId`, MCP는 `get_research`, `create_research`, `update_research`를 제공한다.
- 일반 조사는 Project 없이 반환할 수 있지만 저장·수정은 등록된 Project와 같은 `projectId`에서만 허용한다.
- 신규 Research는 항상 live 검색과 실제 원문 확인을 거친다.
- evidence는 `searched_at`부터 7일 동안만 유효하다. scope는 claims/include/exclude/versions/regions 고정 key와 정렬된 배열의 canonical minified JSON이며, 기존·신규 문자열이 byte-exact로 다르면 만료 전에도 다시 검색한다.
- 검색 상태, 시각, 유효기간, scope와 source URL은 별도 column이 아니라 고정 Research Markdown에 기록한다.
- Research는 잠정 제품 방향이며 사용자 명령 없이 Plan으로 자동 전환하지 않는다.

```text
Project
└─ Research[]
   ├─ Discovery: 문제·사용자·가치·가설·대안
   └─ Evidence: verified findings·상충·sources·7일 유효기간
```

### Draft 제거 migration과 preflight

- migration은 빈 `Research` table과 `Research_projectId_idx`를 만든 뒤 기존 Draft table과 2개 row를 복사 없이 삭제한다.
- `preflight-research-migration.mjs`는 Draft 있음·Research 없음 상태에서만 ready를 반환한다.
- ready 전 `BEGIN IMMEDIATE`에서 Draft full-row snapshot, count·fingerprint metadata와 5분 write-block lease trigger를 원자적으로 설치한다.
- active lease 동안 Draft INSERT·UPDATE·DELETE는 차단되고, source DB integrity·FK 확인 뒤 `/private/tmp` full backup, SHA-256과 restore rehearsal을 완료한다.
- migration은 lease가 유효한 동안 current Draft count와 양방향 full-row EXCEPT가 snapshot과 exact-match할 때만 DROP을 수행한다. 불일치나 lease 만료는 DROP 전 전체 transaction을 중단한다.
- 5분 안에 migration을 시작하지 못하면 preflight를 다시 실행해 새 snapshot·backup·lease evidence를 발급한다.
- fresh DB 또는 Research-only DB는 no-op이며 두 table이 함께 있거나 지원하지 않는 partial schema는 migration을 차단한다.
- migration 실패 또는 첫 Research write 전 smoke 실패는 전체 DB backup과 Architecture 기준 revision을 함께 복원한다.
- preflight 또는 backup 실패는 현재 실행이 소유한 guard를 즉시 해제한다. backup 복원 직후 guard가 남아 있으면 writer를 닫은 채 lease 만료를 확인한 후 이전 app을 연다.
- 첫 `create_research` 또는 `update_research` 성공 뒤에는 backup rollback을 금지하고 forward-fix한다.

## HTML 산출물 계약

- `Asset`, `Wireframe`, `Design`은 일반 텍스트가 아니라 완전한 HTML 문서를 `html` 필드에 저장한다.
- 세 산출물은 `Project`, `Plan`, `Task`에 모두 연결되며 `planId`는 연결된 `Task.planId`로 보장한다.
- `Asset`은 로고, 색상 조합, 타이포그래피, 디자인 토큰 등 시각 자원을 정의한 HTML이다.
- `Wireframe`은 유저 여정과 화면 전환을 확인할 수 있는 클릭 가능한 디자인 전 단계 HTML이다.
- `Design`은 동일한 `Task`의 `Wireframe`과 `Asset`을 결합한 실제 적용 가능한 수준의 HTML이다.
- HTML은 `doctype`, `html`, `head`, `body`를 포함한 독립 문서여야 한다. 대시보드는 호스트 DOM에 직접 삽입하지 않고 sandbox iframe으로 미리보기한다.

# 데이터 모델(Prisma / SQLite)

```prisma
datasource db {
    provider = "sqlite"
}

enum RepoType {
    LOCAL
    REMOTE
}

enum TaskStatus {
    PENDING //작업 전
    COMPLETED //작업 완료
}

enum ArchitectureType {
    PLAN
    PRODUCTION
}

model Project {
    id Int @id @default(autoincrement())
    title String
    repoPath String
    repoType RepoType
    @@unique([repoPath, repoType])
    description String // 이 프로젝트에 대한 간략한 설명
    plans Plan[]
    tasks Task[]
    wireframes Wireframe[]
    architectures Architecture[]
    research Research[]
    assets Asset[]
    designs Design[]
    reviews Review[]
}

model Plan {
    id Int @id @default(autoincrement())
    projectId Int
    project Project @relation(fields: [projectId], references: [id])
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    version Int @default(1)
    @@unique([projectId, version])
    //SQLite는 String 타입을 TEXT 타입으로 자동 매핑
    content String
    title String
    tasks Task[]
    assets Asset[]
    wireframes Wireframe[]
    designs Design[]
    reviews Review[]
    @@index([projectId])
}

model Asset {
    id Int @id @default(autoincrement())
    projectId Int
    project Project @relation(fields: [projectId], references: [id])
    planId Int
    plan Plan @relation(fields: [planId], references: [id])
    taskId Int
    task Task @relation(fields: [taskId], references: [id])
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    designs Design[]
    html String // 로고, 색상, 타이포그래피, 디자인 토큰을 정의한 완전한 HTML
    title String
    @@index([projectId])
    @@index([planId])
    @@index([taskId])
}

model Design {
    id Int @id @default(autoincrement())
    projectId Int
    project Project @relation(fields: [projectId], references: [id])
    planId Int
    plan Plan @relation(fields: [planId], references: [id])
    taskId Int
    task Task @relation(fields: [taskId], references: [id])
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    wireframeId Int
    wireframe Wireframe @relation(fields: [wireframeId], references: [id])
    assetId Int
    asset Asset @relation(fields: [assetId], references: [id])
    html String // 연결된 Wireframe과 Asset을 결합한 실제 적용 수준의 완전한 HTML
    title String
    @@index([projectId])
    @@index([planId])
    @@index([taskId])
    @@index([assetId])
    @@index([wireframeId])
}

model Architecture {
    id Int @id @default(autoincrement())
    projectId Int
    project Project @relation(fields: [projectId], references: [id])
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    title String
    type ArchitectureType
    content String // PLAN Markdown 또는 PRODUCTION canonical JSON
    html String // PLAN 완전한 HTML; PRODUCTION은 빈 문자열
    @@unique([projectId, type])
    @@index([projectId])
}

// task는 plan을 단위별로 분류한 작업 단위
model Task {
    id Int @id @default(autoincrement())
    projectId Int
    project Project @relation(fields: [projectId], references: [id])
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    planId Int
    plan Plan @relation(fields: [planId], references: [id])
    status TaskStatus @default(PENDING)
    title String
    content String?
    assets Asset[]
    wireframes Wireframe[]
    designs Design[]
    @@index([projectId])
    @@index([planId])
}

model Research {
    id Int @id @default(autoincrement())
    projectId Int
    project Project @relation(fields: [projectId], references: [id])
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    title String
    content String
    @@index([projectId])
}

model Wireframe {
    id Int @id @default(autoincrement())
    projectId Int
    project Project @relation(fields: [projectId], references: [id])
    planId Int
    plan Plan @relation(fields: [planId], references: [id])
    taskId Int
    task Task @relation(fields: [taskId], references: [id])
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    designs Design[]
    title String
    html String // 유저 여정 기반의 클릭 가능한 완전한 HTML
    @@index([projectId])
    @@index([planId])
    @@index([taskId])
}

model Review {
    id Int @id @default(autoincrement())
    projectId Int
    project Project @relation(fields: [projectId], references: [id])
    planId Int
    plan Plan @relation(fields: [planId], references: [id])
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    title String
    content String
    @@index([projectId])
    @@index([planId])
}

//해당 프로젝트의 도메인별 문서
model Domain {
    id Int @id @default(autoincrement())
    projectId Int
    project Project @relation(fields: [projectId], references: [id])
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    title String
    content String // 업무 규칙과 코드 근거를 설명하는 Markdown
    parentId Int?
    parent Domain? @relation("DomainHierarchy", fields: [parentId], references: [id], onDelete: Restrict, onUpdate: Cascade)
    children Domain[] @relation("DomainHierarchy")
    @@unique([projectId, title])
    @@index([projectId])
    @@index([parentId])
}

model Issue {}
```

## yusung-harness-doc 서버 구조

- 에이전트와의 소통은 yusung-harness/apps/server/src/mcp 만 담당.
- web과 server 의 소통은 src 디렉토리의 나머지 도메인들이 담당.
