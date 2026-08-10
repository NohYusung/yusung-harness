<div align="center">
  <h1>yusung-harness</h1>
  <p><strong>기획부터 구현, 검증, 기록까지<br />에이전트 팀이 하나의 맥락으로 움직이게 만드는 개발 하네스</strong></p>
  <p>
    <img src="https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white" alt="Python 3.10+" />
    <img src="https://img.shields.io/badge/Node.js-22+-339933?logo=nodedotjs&logoColor=white" alt="Node.js 22+" />
    <img src="https://img.shields.io/badge/MCP-Streamable_HTTP-5A67D8" alt="MCP Streamable HTTP" />
    <img src="https://img.shields.io/badge/Codex-Multi--Agent-111111?logo=openai&logoColor=white" alt="Codex Multi-Agent" />
  </p>
</div>

> [!NOTE]
> yusung-harness는 프롬프트 모음이 아닙니다. 역할이 분리된 에이전트, 단계별 스킬, 프로젝트 규칙, 산출물 저장용 MCP 서버와 대시보드를 하나의 개발 워크플로우로 묶습니다.

## 왜 yusung-harness인가

- 긴 작업에서도 기획 의도와 구현 맥락이 사라지지 않습니다.
- 에이전트마다 역할과 책임이 분리되어 계획, 구현, 테스트와 리뷰가 뒤섞이지 않습니다.
- Draft, Plan, Task, Design, Review 같은 산출물이 채팅 안에서 휘발되지 않고 프로젝트 단위로 축적됩니다.
- Codex 전용 설정과 범용 에이전트 설정을 같은 원본에서 관리할 수 있습니다.
- 기존 프로젝트에 안전하게 설치하고, 충돌을 확인하며 업데이트할 수 있습니다.

## 한눈에 보는 구성

| 구성 요소 | 역할 |
| --- | --- |
| Agent Team | Architect, Coder, Designer 등 8개 역할이 작업을 분담합니다. |
| Workflow Skills | 기획, 설계, 구현, 테스트와 통합을 15개 스킬로 표준화합니다. |
| Installer | 대상 에이전트에 맞는 프로필을 프로젝트에 안전하게 배포합니다. |
| Document MCP | 에이전트 산출물을 43개 MCP 도구로 조회·생성·수정합니다. |
| Project Workbench | 프로젝트의 요청, 계획, 태스크, 설계와 작업 기록을 웹에서 탐색합니다. |
| Conventions | NestJS, TypeScript, React와 Next.js 코드 규칙을 저장소 안에서 공유합니다. |

## 워크플로우

```mermaid
flowchart LR
    User["사용자 요청"] --> Lead["메인 에이전트"]
    Lead --> Skill["단계별 Skill"]
    Skill --> Team["전문 Agent Team"]
    Team --> Result["코드 · 테스트 · 디자인"]
    Team --> Curator["Doc Curator"]
    Curator --> MCP["Harness MCP"]
    MCP --> DB[("SQLite")]
    DB --> Board["Project Workbench"]
    Board -. "다음 작업의 맥락" .-> Lead
```

- 메인 에이전트가 요청에 맞는 스킬과 담당 에이전트를 선택합니다.
- 전문 에이전트는 독립적인 작업을 병렬로 수행하고 결과를 조율합니다.
- Doc Curator가 계획과 산출물을 MCP 서버에 기록합니다.
- 다음 작업은 저장된 프로젝트 맥락을 다시 읽고 이어서 진행합니다.

## 실제 사용 예시

`wireframe`, `asset`, `design` 워크플로우에서 만든 산출물은 Project Workbench에서 프로젝트 맥락과 함께 탐색하고 바로 미리 볼 수 있습니다.

### 1. 와이어프레임 검토

![Project Workbench에서 포트폴리오 와이어프레임을 검토하는 화면](./docs/images/readme/portfolio-wireframe.png)

- 화면 구조와 콘텐츠 흐름을 구현 전에 확인합니다.
- 레코드 메타데이터와 HTML 미리보기를 한 화면에서 비교합니다.

### 2. 디자인 에셋 탐색

![Project Workbench에서 포트폴리오 디자인 에셋 팔레트를 탐색하는 화면](./docs/images/readme/portfolio-asset-palette.png)

- 워드마크, 로고, 컬러 팔레트 같은 디자인 자산을 프로젝트별로 축적합니다.
- 산출물의 버전과 연결 관계를 유지한 채 브라우저에서 확인합니다.

### 3. 완성 디자인 검토

![Project Workbench에서 완성된 포트폴리오 디자인을 검토하는 화면](./docs/images/readme/portfolio-design.png)

- 와이어프레임과 에셋을 결합한 최종 디자인을 원본 크기로 미리 봅니다.
- 기획부터 디자인까지 이어지는 작업 결과를 동일한 프로젝트 기록에서 추적합니다.

## Agent Team

| Agent | 책임 |
| --- | --- |
| `architect` | 시스템 구조, 기술 스택, 인프라와 배포 전략을 설계합니다. |
| `coder` | 코드베이스를 탐색하고 기능을 구현하거나 수정합니다. |
| `designer` | UX/UI, 디자인 에셋과 실제 화면 디자인을 담당합니다. |
| `doc-curator` | 다른 에이전트의 산출물을 MCP 문서 저장소에 보관하고 관리합니다. |
| `planner` | 요구사항을 분석하고 Plan과 Task로 실행 범위를 나눕니다. |
| `researcher` | 공식 자료와 최신 웹 정보를 중심으로 근거를 조사합니다. |
| `reviewer` | 구현 결과를 프로젝트 전체 관점에서 비판적으로 검토합니다. |
| `tester` | 테스트 작성, 실행, 회귀 검증과 배포 전 확인을 담당합니다. |

## Workflow Skills

| 단계 | Skill | 결과 |
| --- | --- | --- |
| 발견 | `curate`, `research`, `draft` | 프로젝트 등록, 근거 조사, 초기 제안 |
| 설계 | `plan`, `architecturePlan`, `domain`, `db`, `erd` | 실행 계획, 아키텍처, 도메인과 데이터 구조 |
| 제작 | `asset`, `wireframe`, `design`, `code` | 디자인 자산, 인터랙션, UI와 실제 코드 |
| 검증·관리 | `test`, `document`, `integration` | 테스트, 문서 갱신, 커밋과 병합 |

## 빠른 설치

### 요구 사항

- Python 3.10 이상
- 설치할 대상 프로젝트
- 역할 기반 병렬 작업을 사용할 수 있는 에이전트 런타임

Codex 프로필은 저장소의 `.codex/config.toml`에 멀티 에이전트 설정을 포함합니다.

```toml
[features.multi_agent_v2]
enabled = true
max_concurrent_threads_per_session = 10
```

### 1. 변경 범위 미리 확인

```bash
python3 install.py /path/to/target-project \
  --profile codex \
  --dry-run
```

### 2. 대상 프로젝트에 설치

```bash
python3 install.py /path/to/target-project --profile codex
```

> [!TIP]
> 처음에는 항상 `--dry-run`으로 생성·충돌 범위를 확인하는 것을 권장합니다. 기본 설치는 대상 프로젝트에서 이미 수정된 파일을 덮어쓰지 않습니다.

## 설치 프로필

| 프로필 | 설치 내용 | 권장 환경 |
| --- | --- | --- |
| `codex` | `AGENTS.md`, `docs/`, `.codex/` | OpenAI Codex |
| `agents` | `AGENTS.md`, `docs/`, `.agents/` | Hermes, OpenClaw 등 범용 에이전트 |
| `claude` | `CLAUDE.md`, `docs/`, `.claude/` | Claude Code |
| `all` | 위 프로필의 모든 항목 | 여러 런타임을 함께 사용하는 프로젝트 |

### 기존 설치 업데이트

```bash
python3 install.py /path/to/target-project \
  --profile all \
  --force \
  --backup
```

| 옵션 | 동작 |
| --- | --- |
| `--profile` | `codex`, `agents`, `claude`, `all` 중 설치 대상을 선택합니다. |
| `--dry-run` | 파일을 변경하지 않고 예상 작업과 요약만 출력합니다. |
| `--force` | 내용이 다른 기존 하네스 파일을 새 버전으로 갱신합니다. |
| `--backup` | 덮어쓰기 전에 타임스탬프가 붙은 백업 파일을 만듭니다. |

- 원본에 없는 대상 프로젝트 파일은 삭제하지 않습니다.
- 동일한 파일은 `skip`, 변경된 파일은 기본적으로 `conflict` 처리합니다.
- 하나 이상의 충돌이나 누락이 있으면 종료 코드 `1`을 반환합니다.
- 자세한 설치 정책은 [`install.md`](./install.md)에서 확인할 수 있습니다.

## Project Workbench 실행

`apps/`에는 에이전트 산출물을 저장하는 NestJS MCP 서버와 이를 탐색하는 Next.js 대시보드가 들어 있습니다.

### 요구 사항

- Node.js 22 이상
- pnpm 11.7.0

### 1. 의존성 설치

```bash
cd apps
pnpm install
```

### 2. 환경 변수 준비

`apps/server/.env`:

```dotenv
DATABASE_URL="file:./harness-board.db"
PORT=4000
```

`apps/web/.env.local`:

```dotenv
HARNESS_API_URL="http://127.0.0.1:4000"
HARNESS_MCP_URL="http://127.0.0.1:4000/mcp"
```

### 3. 서버와 웹 앱 실행

```bash
pnpm dev
```

- 서버의 `predev` 단계가 Prisma Client 생성, SQLite 파일 준비와 migration 적용을 자동으로 수행합니다.
- 웹 대시보드는 저장된 첫 번째 프로젝트로 자동 진입합니다.

| 주소 | 용도 |
| --- | --- |
| `http://127.0.0.1:3000` | Project Workbench |
| `http://127.0.0.1:4000/mcp` | MCP Streamable HTTP endpoint |
| `http://127.0.0.1:4000/projects` | 프로젝트 REST API |

## MCP 연결

Codex의 `doc-curator` 프로필에는 로컬 문서 서버 연결이 미리 정의되어 있습니다.

```toml
[mcp_servers.yusung-harness-doc]
url = "http://127.0.0.1:4000/mcp"
```

MCP 서버는 프로젝트와 산출물을 다루는 43개 도구를 제공합니다.

| 분류 | 대표 도구 | 용도 |
| --- | --- | --- |
| Context | `get_context`, `get_project` | DB 구조와 프로젝트 전체 맥락을 조회합니다. |
| Planning | `create_draft`, `create_plan`, `update_plan`, `create_task`, `update_task` | 제안과 실행 계획을 저장하고 진행 상태를 갱신합니다. |
| Architecture | `create_architecturePlan`, `create_domain`, `create_db`, `create_erd` | 아키텍처 계획, 도메인과 데이터 구조를 기록합니다. |
| Design | `create_asset`, `create_wireframe`, `create_design` | HTML 기반 시각 산출물과 버전을 저장합니다. |
| Execution | `create_request`, `update_request`, `create_workLog`, `get_review` | 요청 수명주기와 작업 기록, 리뷰를 관리합니다. |
| Files | `create_file`, `get_file`, `update_file`, `delete_file` | 프로젝트에 연결된 임시 파일과 업로드 상태를 관리합니다. |

## 대시보드에서 관리하는 산출물

- `Request` → `Plan` → `Task`로 이어지는 실행 흐름
- 초기 아이디어와 제안을 담는 `Draft`
- 구현 전 `Architecture Plan`과 구현 후 `Architecture`
- 프로젝트의 `Domain`, DB 문서와 ERD
- 버전과 계층 구조를 가진 `Wireframe`
- `Asset`과 Wireframe을 결합한 `Design`
- 작업 과정의 `WorkLog`와 결과를 평가하는 `Review`
- Markdown 문서와 sandbox iframe으로 미리 보는 HTML 아티팩트

## 개발 명령어

다음 명령어는 `apps/` 디렉터리에서 실행합니다.

| 명령어 | 설명 |
| --- | --- |
| `pnpm dev` | MCP 서버와 웹 대시보드를 병렬로 실행합니다. |
| `pnpm dev:server` | NestJS 서버만 watch 모드로 실행합니다. |
| `pnpm dev:web` | Next.js 웹 앱만 실행합니다. |
| `pnpm build` | 모든 workspace package를 빌드합니다. |
| `pnpm typecheck` | 전체 TypeScript 타입을 검사합니다. |
| `pnpm lint` | lint script가 있는 workspace를 검사합니다. |
| `pnpm test` | 서버와 웹 앱의 단위·경계 테스트를 실행합니다. |

## 저장소 구조

```text
yusung-harness/
├── .codex/
│   ├── agents/              # Codex 전용 역할과 실행 설정
│   ├── skills/              # 단계별 워크플로우 스킬
│   └── config.toml          # 모델, 권한과 멀티 에이전트 설정
├── .agents/                 # 범용 에이전트용 역할과 스킬
├── .claude/                 # Claude Code용 에이전트 정의
├── apps/
│   ├── server/              # NestJS + MCP + Prisma + SQLite
│   └── web/                 # Next.js Project Workbench
├── docs/
│   ├── architecture/        # 하네스 문서 도메인 구조
│   └── conventions/         # Backend / Frontend 코드 규칙
├── AGENTS.md                # 에이전트 공통 운영 규칙
├── CLAUDE.md                # Claude Code 진입 규칙
├── install.py               # 프로필 기반 설치·업데이트 도구
└── install.md               # 설치기의 상세 동작 문서
```

## 기술 스택

| 영역 | 기술 |
| --- | --- |
| Agent Runtime | Codex multi-agent, repo-local agents & skills |
| MCP Server | NestJS 11, MCP TypeScript SDK, Zod 4 |
| Database | Prisma 7, SQLite, better-sqlite3 adapter |
| Dashboard | Next.js 16, React 19, Tailwind CSS 4, Geist |
| Test | Node.js Test Runner, Vitest, Testing Library |
| Installer | Python 3.10+, `pathlib`, `shutil`, `filecmp` |

## 선택 연동

- `asset`, `wireframe`, `design` 워크플로우는 Open Design MCP를 활용할 수 있습니다.
- Open Design을 사용할 수 없는 환경에서는 해당 에이전트 규칙에 따라 설치 여부나 대체 진행 방식을 먼저 확인합니다.
- 일반적인 기획, 코딩, 테스트와 문서 관리에는 Open Design이 필요하지 않습니다.

## 운영 원칙

- 매 단계에서 현재 작업을 평가하고 필요한 전문 에이전트만 호출합니다.
- 이미 실행 중인 에이전트가 있으면 새로 만들지 않고 기존 에이전트를 재사용합니다.
- 구현은 저장소의 conventions와 테스트 우선 원칙을 따릅니다.
- 에이전트가 만든 계획과 산출물은 Doc Curator를 통해 프로젝트 문맥에 연결합니다.
- 하네스 자체의 Markdown 정책 파일은 사용자의 명시적인 요청 없이 수정하지 않습니다.
- 설치와 업데이트는 삭제보다 보존을 우선하며, 충돌을 숨기지 않고 보고합니다.
