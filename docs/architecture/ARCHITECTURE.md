---
name: ARCHITECTURE
description: doc-curator가 yusung-harness/apps 서버를 관리 저장하기 위한 도메인 구조
---

doc-curator는 이 아키텍쳐를 기반으로, yusung-harness/apps 서버를 통해 문서를 관리한다.

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
    @@index([projectId])
}

model Asset {
    id Int @id @default(autoincrement())
    projectId Int
    project Project @relation(fields: [projectId], references: [id])
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    designs Design[]
    content String
    title String
    @@index([projectId])
}

model Design {
    id Int @id @default(autoincrement())
    projectId Int
    project Project @relation(fields: [projectId], references: [id])
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    wireframeId Int
    wireframe Wireframe @relation(fields: [wireframeId], references: [id])
    assetId Int
    asset Asset @relation(fields: [assetId], references: [id])
    content String
    title String
    @@index([projectId])
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
    content String
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
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    designs Design[]
    title String
    content String
    @@index([projectId])
}

model Review {
    id Int @id @default(autoincrement())
    projectId Int
    project Project @relation(fields: [projectId], references: [id])
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    title String
    content String
    @@index([projectId])
}
```
