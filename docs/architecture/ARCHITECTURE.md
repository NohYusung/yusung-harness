---
name: ARCHITECTURE
description: doc-curator가 yusung-harness/apps 서버를 관리 저장하기 위한 도메인 구조
---

doc-curator는 이 아키텍쳐를 기반으로, yusung-harness/apps 서버를 통해 문서를 관리한다.

## Architecture ERD 계약

- `Architecture`는 일반 설계 메모가 아니라 **완성된 프로젝트에서 실제 구현된 도메인 구조**의 ERD 스냅샷이다.
- architect 에이전트는 추측한 계획이 아니라 구현된 schema, entity, model, migration을 확인한 뒤 MCP `save_document`의 `diagram` 필드로 저장한다.
- MCP에서 `kind: "ARCHITECTURE"`는 구조화된 `diagram` 객체만 허용하며 `content`, `html`, `taskId`, `planId`를 받지 않는다.
- DB 호환성을 위해 Prisma의 `Architecture.content String` 컬럼은 유지한다. 서버는 `diagram`을 Zod로 검증한 뒤 `JSON.stringify(parsedDiagram)`으로 정규화해 `content`에 저장한다.
- 대시보드는 `content`를 아래 v1 계약으로 파싱해 ERD를 그린다. 기존 평문 레코드는 가짜 엔티티로 변환하지 않고 legacy 안내와 원문 fallback으로 표시한다.

```ts
interface ArchitectureErdV1 {
  kind: "domain-erd";
  schemaVersion: 1;
  name: string;
  generatedAt?: string; // ISO datetime
  sourceRevision?: string;
  entities: Array<{
    id: string;
    name: string;
    domain?: string;
    description?: string;
    fields: Array<{
      name: string;
      type: string;
      nullable: boolean;
      primaryKey?: boolean;
      foreignKey?: boolean;
      unique?: boolean;
      default?: string;
    }>;
  }>;
  relationships: Array<{
    id: string;
    label?: string;
    source: {
      entityId: string;
      field?: string;
      cardinality: "1" | "0..1" | "N" | "1..N" | "0..N";
    };
    target: {
      entityId: string;
      field?: string;
      cardinality: "1" | "0..1" | "N" | "1..N" | "0..N";
    };
  }>;
}
```

- root/entity/field/relationship/endpoint 객체는 정의되지 않은 키를 거부한다.
- entity `id`와 `name`, entity 내부 field `name`, relationship `id`, 동일 endpoint 쌍은 중복될 수 없다.
- relationship의 `entityId`는 존재하는 entity를, `field`가 있으면 해당 entity의 실제 field를 참조해야 한다.
- entity는 최소 1개와 각 entity의 field 최소 1개가 필요하다. 관계가 없는 단일 entity 프로젝트를 위해 `relationships`는 빈 배열을 허용한다.
- 문자열 외에 entity 100개, entity별 field 100개, 전체 field 2,000개, relationship 1,000개의 상한을 두어 잘못된 대형 payload가 DB와 대시보드를 압박하지 않게 한다.
- `20260720110000_structure_architecture_erd` migration은 알려진 로컬 dashboard demo 행만 v1 JSON으로 갱신한다. 사용자 생성 legacy 행은 수정하거나 삭제하지 않는다.

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
    content String // 검증된 ArchitectureErdV1 객체를 canonical JSON으로 직렬화한 값
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
}

model Issue {}
```

## yusung-harness-doc 서버 구조

- 에이전트와의 소통은 yusung-harness/apps/server/src/mcp 만 담당.
- web과 server 의 소통은 src 디렉토리의 나머지 도메인들이 담당.
