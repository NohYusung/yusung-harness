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
- `Architecture Plan`: 구현 전 시스템 구조 계획과 HTML 구조도
- `Architecture`: 구현 후 배포 구조 snapshot 또는 legacy text
- `Database`: 현행 DB schema Markdown
- `ERD`: Dineug v3 관계 문서
- 폴더, 기술 계층, DB table을 업무 Domain으로 추정하지 않고 각 산출물의 책임을 섞지 않는다.

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
    drafts Draft[]
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
    content String // 구현 후 배포 구조 snapshot 또는 legacy text
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

model Draft {
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
