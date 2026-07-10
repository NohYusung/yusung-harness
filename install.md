# yusung-harness 설치 가이드

`install.py`는 yusung-harness의 에이전트 설정, 스킬, 문서를 다른 프로젝트에 설치하거나 최신 상태로 업데이트하는 스크립트입니다.

스크립트를 어느 경로에서 실행하더라도 `install.py`가 있는 디렉터리를 원본 루트로 사용합니다.

## 요구 사항

- Python 3.10 이상
- 설치할 대상 프로젝트 경로

## 기본 사용법

```bash
python /path/to/yusung-harness/install.py <대상 프로젝트 경로>
```

예시:

```bash
python /Users/nes0903/Documents/yusung-harness/install.py ~/Documents/my-project
```

프로필을 지정하지 않으면 `codex` 프로필이 사용됩니다.

## 설치 프로필

| 프로필 | 설치 대상 |
| --- | --- |
| `codex` | `AGENTS.md`, `docs/`, `.codex/` |
| `agents` | `AGENTS.md`, `docs/`, `.agents/` |
| `claude` | `CLAUDE.md`, `docs/`, `.claude/` |
| `all` | 위 세 프로필의 모든 항목을 중복 없이 설치 |

프로필 지정 예시:

```bash
python /Users/nes0903/Documents/yusung-harness/install.py ~/Documents/my-project --profile agents
```

모든 하네스 파일 설치 예시:

```bash
python /Users/nes0903/Documents/yusung-harness/install.py ~/Documents/my-project --profile all
```

## 옵션

### `--profile`

- 설치할 프로필을 선택합니다.
- 선택값: `codex`, `agents`, `claude`, `all`
- 기본값: `codex`

```bash
python /Users/nes0903/Documents/yusung-harness/install.py ~/Documents/my-project --profile claude
```

### `--dry-run`

- 실제 파일을 만들거나 수정하지 않습니다.
- 실행할 작업과 예상 요약만 출력합니다.
- 처음 설치하거나 강제 업데이트하기 전에 변경 범위를 확인할 때 사용합니다.

```bash
python /Users/nes0903/Documents/yusung-harness/install.py ~/Documents/my-project --profile all --dry-run
```

### `--force`

- 원본과 내용이 다른 대상 파일을 덮어씁니다.
- 이 옵션이 없으면 변경된 기존 파일은 충돌로 처리하며 보존합니다.
- 원본과 동일한 파일은 옵션과 관계없이 건너뜁니다.

```bash
python /Users/nes0903/Documents/yusung-harness/install.py ~/Documents/my-project --force
```

### `--backup`

- 덮어쓰기 전에 기존 파일의 백업본을 생성합니다.
- 변경된 기존 파일이 `--force`로 업데이트될 때만 동작합니다.
- 백업 파일명 형식은 `<파일명>.bak.YYYYMMDDHHMMSS`입니다.

```bash
python /Users/nes0903/Documents/yusung-harness/install.py ~/Documents/my-project --force --backup
```

안전하게 전체 프로필을 업데이트하려면 다음 조합을 사용할 수 있습니다.

```bash
python /Users/nes0903/Documents/yusung-harness/install.py ~/Documents/my-project \
  --profile all \
  --force \
  --backup
```

## 파일 처리 규칙

- 대상 프로젝트가 없으면 필요한 상위 디렉터리와 함께 새로 생성합니다.
- 원본 디렉터리는 하위 파일과 디렉터리를 재귀적으로 복사합니다.
- 대상에 없는 파일은 새로 복사합니다.
- 원본과 대상의 파일 내용이 같으면 `skip` 처리합니다.
- 내용이 다른 기존 파일은 `--force`가 없으면 `conflict` 처리합니다.
- `--force`가 있으면 내용이 다른 기존 파일을 업데이트합니다.
- `--force --backup`을 함께 사용하면 업데이트 전에 기존 파일을 백업합니다.
- 파일이 있어야 할 위치에 디렉터리가 있거나, 디렉터리가 있어야 할 위치에 파일이 있으면 `conflict` 처리합니다.
- 원본에 없는 대상 프로젝트의 추가 파일은 삭제하지 않습니다.
- 프로필에 정의된 원본 항목이 없으면 `missing`으로 출력하고 충돌 수에 포함합니다.

## 출력 항목

실행 중에는 각 경로의 처리 결과가 다음 작업명과 함께 출력됩니다.

| 작업명 | 의미 |
| --- | --- |
| `mkdir` | 대상 디렉터리 생성 |
| `copy` | 새 파일 복사 |
| `update` | 기존 파일 덮어쓰기 |
| `backup` | 기존 파일 백업 |
| `skip` | 동일한 파일 건너뛰기 |
| `conflict` | 덮어쓸 수 없는 변경 또는 경로 유형 충돌 |
| `missing` | 원본 항목 없음 |

실행이 끝나면 다음 통계가 출력됩니다.

```text
summary
  copied      : 0
  updated     : 0
  skipped     : 0
  created dirs: 0
  conflicts   : 0
```

## 종료 코드

- `0`: 충돌 없이 설치 또는 업데이트 완료
- `1`: 하나 이상의 충돌 또는 누락된 원본 항목 발생

자동화나 CI에서는 종료 코드를 사용해 설치 성공 여부를 판단할 수 있습니다.

## 권장 업데이트 순서

1. `--dry-run`으로 변경 범위를 확인합니다.
2. 대상 프로젝트에서 보존해야 할 변경 파일이 있는지 검토합니다.
3. 필요한 경우 `--force --backup`으로 기존 파일을 백업하며 업데이트합니다.
4. 실행 결과의 `conflicts`가 `0`인지 확인합니다.

```bash
python /Users/nes0903/Documents/yusung-harness/install.py ~/Documents/my-project \
  --profile codex \
  --dry-run

python /Users/nes0903/Documents/yusung-harness/install.py ~/Documents/my-project \
  --profile codex \
  --force \
  --backup
```
