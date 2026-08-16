# yusung-harness 설치 가이드

`install.py`는 Codex용 하네스와 Project Workbench 소스를 하나의 대상 프로젝트에 설치하거나 안전하게 동기화합니다. 스크립트를 어느 경로에서 실행해도 `install.py`가 있는 디렉터리를 원본 루트로 사용합니다.

## 요구 사항

- Python 3.10 이상
- Node.js 22 이상
- pnpm 11.7.0
- 설치할 대상 프로젝트 경로

`apps/package.json`의 `packageManager`와 `engines.node`가 위 버전을 정의합니다. 설치기는 파일을 쓰기 전에 Node.js와 pnpm 버전을 검사합니다.

## 설치 결과

```text
SOURCE_ROOT                         TARGET
├── AGENTS.md ────────────────────> ├── AGENTS.md
├── docs/ ────────────────────────> ├── docs/
├── .codex/ ──────────────────────> ├── .codex/
└── apps/ ────────────────────────> ├── apps/
                                      ├── server/.env       # 최초 생성 후 보존
                                      └── web/.env.local    # 최초 생성 후 보존
                                    └── .yusung-harness/
                                        └── install-manifest.json
```

- 현재 설치 대상은 `AGENTS.md`, `docs/`, `.codex/`, `apps/`입니다.
- `.agents/`, `.claude/`, `CLAUDE.md`를 새로 설치하지 않는 Codex 전용 설치기입니다.
- `apps/`에는 server와 web 소스뿐 아니라 workspace 설정, lockfile, Prisma schema와 migration, 스크립트와 테스트가 함께 배포됩니다.
- 원본 저장소에 없는 대상 전용 파일은 설치기 소유로 간주하지 않습니다.

## 기본 사용법

```bash
python3 /path/to/yusung-harness/install.py /path/to/target-project
```

예시:

```bash
python3 /Users/nes0903/Documents/yusung-harness/install.py ~/Documents/my-project
```

성공한 실제 설치는 파일 적용 후 `TARGET/apps`에서 다음 명령만 실행해 lockfile과 일치하는 의존성을 준비합니다.

```bash
pnpm install --frozen-lockfile
```

## CLI 옵션

### `--dry-run`

- 파일, 디렉터리, 환경 파일, backup과 manifest를 생성하거나 수정하지 않습니다.
- pnpm을 실행하지 않고 예정된 frozen install만 출력합니다.
- 실제 실행과 같은 파일 충돌 및 런타임 버전 검사를 수행합니다.

```bash
python3 install.py /path/to/target-project --dry-run
```

### `--force`

- 설치기 payload와 같은 경로에 있는 변경된 기존 파일을 새 원본으로 갱신합니다.
- manifest에 없는 대상 전용 파일을 삭제하는 옵션이 아닙니다.
- 보호 대상 환경 파일, DB와 runtime 산출물은 덮어쓰지 않습니다.

```bash
python3 install.py /path/to/target-project --force
```

### `--backup`

- `--force`로 덮어쓰기 전에 기존 installer-managed 파일을 보관합니다.
- `--force`와 함께만 사용할 수 있습니다.
- backup은 `TARGET/.yusung-harness/backups/<run-id>/` 아래에 원래 상대경로로 저장합니다.
- `--sync`의 안전 삭제는 이 옵션과 관계없이 항상 같은 backup 영역에 먼저 보관합니다.
- 환경 파일, DB와 runtime 산출물은 backup 대상이 아니라 항상 보존 대상입니다.

```bash
python3 install.py /path/to/target-project --force --backup
```

### `--sync`

- 새 payload를 설치하면서 manifest에서 소유권이 확인된 오래된 파일을 정리합니다.
- 현재 hash가 이전 manifest의 hash와 같은 파일만 안전하게 삭제합니다.
- 삭제 대상은 `TARGET/.yusung-harness/backups/<run-id>/`에 먼저 backup합니다.
- 사용자가 수정한 stale 파일은 `--force`와 관계없이 보존하고 충돌로 보고합니다.
- manifest가 없던 구버전 설치 파일은 알려진 경로와 설치기에 내장되거나 배포 reference에서 확인한 SHA-256이 모두 일치할 때만 정리합니다.
- 대상 전용 파일과 보호 경로는 삭제하지 않습니다.

```bash
python3 install.py /path/to/target-project --sync --dry-run
python3 install.py /path/to/target-project --sync
```

### `--profile codex`

- 기존 자동화와의 호환을 위한 deprecated no-op입니다.
- 생략해도 결과는 동일합니다.
- `agents`, `claude`, `all` 등 다른 값은 지원하지 않습니다.

```bash
python3 install.py /path/to/target-project --profile codex
```

## 안전한 파일 처리

```text
source 파일
├── target에 없음 ───────────────────> copy
├── source와 target이 같음 ──────────> skip
└── source와 target이 다름
    ├── --force 없음 ────────────────> conflict, 원본 보존
    └── --force 있음
        ├── --backup 있음 ──────────> backup
        └── target 갱신 ─────────────> update

manifest의 stale 파일 + --sync
├── 현재 hash = 기록 hash ──────────> 자동 backup → 안전 삭제
└── 현재 hash != 기록 hash ─────────> conflict, 사용자 변경 보존
```

- 설치 대상 경로가 없으면 새로 생성합니다.
- 파일과 디렉터리의 경로 유형이 충돌하거나 경로 구성 요소가 symlink이면 안전을 위해 중단합니다.
- 원본 저장소와 대상 프로젝트가 같거나 서로 부모·자식 관계이면 설치하지 않습니다.
- 결정 가능한 충돌은 쓰기 전에 전체 preflight에서 확인합니다.
- `--sync` 없이 실행하면 stale manifest 항목을 유지해 다음 sync에서 다시 판단할 수 있게 합니다.
- 수정된 stale 파일은 강제 삭제하지 않습니다.

## Apps payload와 보호 경로

Git worktree에서는 추적 중인 `apps/` 파일을 우선 배포합니다. Git 정보가 없는 배포본에서는 같은 제외 규칙을 적용해 배포 가능한 파일을 재귀적으로 찾습니다. 설치기의 필수 workspace 파일은 추적 상태와 관계없이 존재 여부를 검사합니다.

주요 포함 항목:

- `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`
- server와 web 소스 및 설정
- Prisma schema와 migration
- scripts, tests, public assets
- `.env.example`, `.env.*.example`

항상 제외하고 대상에 있으면 보존하는 항목:

- 실제 환경 파일: `.env`, `.env.local`, `.env.*` (`*.example` 제외)
- DB와 journal: `*.db`, `*.db-journal`, `*.db-wal`, `*.db-shm`
- 의존성과 store: `node_modules/`, `.pnpm-store/`
- build와 test 산출물: `dist/`, `.next/`, `out/`, `coverage/`
- cache와 provider 산출물: `.turbo/`, `.vercel/`, `.swc/`
- generated Prisma Client, `next-env.d.ts`, `*.tsbuildinfo`
- log, `.DS_Store`, `__pycache__/`, `*.pyc`, installer backup 파일

제외 경로는 payload inventory와 manifest에 들어가지 않으므로 `--force`, `--backup`, `--sync`로도 덮어쓰거나 삭제하지 않습니다. `node_modules/`는 파일별 manifest 관리 대상이 아니라 pnpm이 lockfile에 맞춰 관리합니다.

## 환경 파일

설치기는 다음 파일이 없을 때만 생성합니다.

`TARGET/apps/server/.env`:

```dotenv
DATABASE_URL="file:./harness-board.db"
PORT=4000
```

`TARGET/apps/web/.env.local`:

```dotenv
HARNESS_API_URL="http://127.0.0.1:4000"
HARNESS_MCP_URL="http://127.0.0.1:4000/mcp"
```

- 생성된 환경 파일은 이후 `--force`, `--backup`, `--sync` 실행에서도 영구 보존합니다.
- 이미 regular file로 존재하면 내용을 읽거나 교체하지 않습니다.
- 해당 경로가 디렉터리 또는 symlink이면 충돌로 처리합니다.
- 새로 생성하는 환경 파일은 POSIX 환경에서 권한 `0600`을 사용합니다.
- DB 파일은 설치기가 복사, 생성, migration 또는 backup하지 않습니다.

## Manifest와 안전한 sync

Manifest는 다음 위치에 저장됩니다.

```text
TARGET/.yusung-harness/install-manifest.json
```

- `.yusung-harness/.gitignore`는 `*\n!.gitignore\n` 내용으로 최초 생성해 manifest, lock과 backup이 대상 Git에 노출되지 않게 합니다. 기존 파일 내용이 다르면 덮어쓰지 않고 충돌로 종료합니다.
- 동시 설치를 막는 lock은 `TARGET/.yusung-harness/install.lock`입니다. 기존 lock이 있으면 stale 여부를 추정하지 않고 충돌로 종료합니다.
- POSIX 환경에서 관리·backup 디렉터리는 `0700`, 관리 `.gitignore`, lock, manifest와 backup 파일은 `0600`으로 제한합니다.
- schema version과 설치기가 관리하는 상대 경로별 SHA-256을 기록합니다.
- 절대경로, `..`, 대상 밖 경로 또는 지원하지 않는 schema version이 있으면 거부합니다.
- target-only 파일과 보호 파일은 기록하지 않습니다.
- manifest 파일 자체는 원자적으로 교체하며, 적용된 파일 상태와 dependency 준비 결과를 함께 기록합니다.
- frozen install이 실패하면 파일 상태는 유지하고 `dependencies.status`를 `failed`로 기록해 다음 실행에서 재시도할 수 있게 합니다.
- `--sync`는 이 manifest를 근거로 installer-owned stale 파일만 정리합니다.

## 설치기가 실행하지 않는 작업

설치기는 source와 의존성만 준비하며 다음 작업은 자동 실행하지 않습니다.

- `pnpm build` 또는 기타 build
- Prisma Client generate
- Prisma migration
- DB 생성·변경·rollback
- `pnpm dev`, `pnpm start` 또는 server process 실행
- background process, service 등록, 포트 확인, MCP health check

`pnpm install --frozen-lockfile` 중 의존성 자체의 install script가 실행될 수 있지만, workspace의 `predev`, `prebuild`, `prestart`는 호출하지 않습니다. 설치 성공은 MCP 서버나 대시보드가 실행 중이라는 뜻이 아닙니다.

의존성 준비를 통해 workspace lifecycle을 우회하지 못하도록 root, server, web `package.json`에 `preinstall`, `install`, `postinstall`, `prepare` script가 선언되어 있으면 쓰기 전에 오류로 거부합니다.

## 설치 후 실행

환경 값을 검토한 뒤 사용자가 직접 실행 단계를 선택합니다.

개발 모드:

```bash
cd /path/to/target-project/apps
pnpm dev
```

현재 server의 `predev`는 Prisma Client 생성, SQLite 준비와 migration 적용을 수행합니다. 이는 사용자가 `pnpm dev`를 실행했을 때 시작되는 workspace lifecycle이며 installer 동작이 아닙니다.

## 권장 업데이트 순서

```bash
# 1. 예정 변경과 안전 삭제 확인
python3 install.py /path/to/target-project --sync --dry-run

# 2. managed 파일을 backup하며 갱신·정리
python3 install.py /path/to/target-project --sync --force --backup
```

- dry-run의 `conflict`와 `preserve` 항목을 먼저 검토합니다.
- 중요한 사용자 변경은 대상 저장소의 별도 버전 관리나 backup으로 보관합니다.
- 완료 후 환경 파일을 확인하고 build, migration과 start는 운영 방식에 맞춰 직접 수행합니다.

## 종료 코드

- `0`: 설치, sync, manifest 기록과 frozen dependency 준비 성공
- `1`: 파일·경로·manifest 충돌 또는 filesystem 처리 실패
- `2`: CLI 사용 오류
- `3`: Node/pnpm 전제조건 불일치 또는 pnpm 설치 실패
- `130`: 사용자 인터럽트

pnpm 실패 시 원인 확인을 위해 오류 요약과 pnpm stdout 또는 stderr의 마지막 80줄을 출력합니다.
