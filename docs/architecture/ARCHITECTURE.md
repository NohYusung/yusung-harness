---
name: ARCHITECTURE
description: doc-curator가 yusung-harness/apps 서버를 관리 저장하기 위한 도메인 구조
---

# 데이터 모델(Prisma / SQLite)

```prisma
datasource db {
    provider = "SQLite"
}
model Project {
    id Int @id @default(autoincrement())
}

model Plan {
    id Int @id @default(autoincrement())

}

model Design {
    id Int @id @default(autoincrement())
}

model Architecture {
    id Int @id @default(autoincrement())
}

// task는 plan을 단위별로 분류한 작업 단위
model Task {
    id Int @id @default(autoincrement())
    plan
}

model draft {
    id Int @id @default(autoincrement())
}

model Wireframe {
    id Int @id @default(autoincrement())
}
```
