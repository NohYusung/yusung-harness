# script 기준 위치 잡기 

# 원하는 디렉토리에 .AGENTS.md, .docs/ 폴더 , .codex 스킬을 복사하는 로직

# yusung-harness 변경사항에 맞게 해당 로컬 디렉토리에 하네스 파일들 강제 업데이트 로직 필요 
from __future__ import annotations
import argparse
import filecmp
import shutil
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path


# 어디서 실행하든 yusung-harness를 원본 루트로 인식하게끔
# __file__은 파이썬의 실행기(interpreter)가 자동으로 정의 => 내장변수 
# __file__의 물리적 경로는 .../install.py 이런 뜻 
# python yusung-harness/install.py 이렇게 하면 상대경로로 __file__이 담기기 때문에 이걸 resolve로 절대경로로 풀어준다. 
SOURCE_ROOT = Path(__file__).resolve().parent

# 대괄호 형태는 2개의 사용법이 존재 
# 데이터 값들이 들어갈 때는 배열, 타입 선언할때는 generic 
# dict[k,v] generic
# tuple[str, ...] 은 tuple[str,str,str,str, ....] 등등 몇개가 될지 모를 때 사용. 빈 튜플도 가능 
# tuple과 list의 차이점은 데이터 mutable여부 => yusung_list = [1,2,3] , yusung_list[0] = 99, yusung_list = [99, 2, 3] tuple은 수정불가. 
# {} 는 해당 자료가 항상 dict라는 것
PROFILES : dict[str,tuple[str, ...]] = {
    "codex" : (
        "AGENTS.md",
        "docs",
        ".codex",
    ),
    "agents" : (
        "AGENTS.md",
        "docs",
        ".agents"
    ),
    "claude" : (
        "CLAUDE.md",
        "docs",
        ".claude"
    )
}
# 추가로 []는 indexer 역할도 함. 
# my_dict : dict[str, tuple[str, ...] = {"key1" : ("answer1", "answer2, "answer3", ...)} => my_dict["key1"] => ("answer1", "answer2, "answer3", ...)
PROFILES["all"] = tuple(
    # ()튜플형태로 dict.fromkeys의 결과물을 감싸고있기때문에, tuple("AGENTS.md", "docs", ".codex", ".agents", "CLAUDE.md", .claude )이렇게됨. 
    dict.fromkeys(
        item
        # 파이썬의 2중 for문 
        # profile은 문자열 하나, ex) "codex"
        for profile in ("codex", "agents", "claude")
        # PROFILES["codex"] 는 ("AGENTS.md", "docs", ".codex") 이런 튜플 => 여기서 for문을 돌렸으니, str값이 나옴. ex) item = "AGENTS.md"
        for item in PROFILES[profile]
    )
)

# 파이썬 3.7부터 클래스 정의 생성자를 @dataclass로 묶어서 깔끔하게.
# frozen = True 내부값 변경 불가능 => ReadOnly 객체 
@dataclass(frozen=True)
class InstallOptions:
    target: Path
    profile: str
    dry_run: bool
    force: bool 
    backup: bool

@dataclass
class InstallStats:
    copied: int = 0 
    updated: int = 0 
    skipped: int = 0
    created_dirs: int = 0 
    conflicts: int = 0 

def parse_args() -> InstallOptions:
    parser = argparse.ArgumentParser(
        description = "Install yusung-harness files into a target project"
    )
    # --options 없이 만든 "target"은 위치 인자이기 때문에 순서가 고정되어야함. python install.py [target]
    parser.add_argument("target", help = "Target project directory")
    parser.add_argument(
        "--profile",
        choices=sorted(PROFILES),
        default = "codex",
        help = "Install profile. Default: codex",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print planned changes without writing files.",
    )
    parser.add_argument(
        "--force",
        # 이 옵션이 없으면 python install.py --force True 이런식으로 사용해야함. 
        # 이 옵션덕에 python install.py --force  이렇게 바로 사용가능. 
        action="store_true",
        help="Overwrite changed files in the target project",
    )
    parser.add_argument(
        "--backup",
        action="store_true",
        help="Create timestamped backups before overwriting files"
    )

    args = parser.parse_args()

    return InstallOptions(
        # expandeuser() 옵션은 물결표 제거 => 홈디렉토리 표시할때 ~/Documents/my-project => /Users/nes0903/projcet 
        target=Path(args.target).expanduser().resolve(),
        profile=args.profile,
        dry_run=args.dry_run,
        force=args.force,
        backup=args.backup,
    )

def log(action: str, path: Path, detail: str | None = None):
    # f-string/Formatted String Literal 문법 / 타임스크립트에서 `${}` const name = "유성", const message = `안녕하세요 만나서 반갑습니다. ${name}님`
    message = f"{action:10} {path}"
    if detail:
        message += f" ({detail})"
    print(message)

# typescript에서 void 함수개념
def ensure_target(options: InstallOptions) -> None:
    if options.target.exists() and not options.target.is_dir():
        # raise는 강제 에러리턴 => throw new Error("에러!")
        raise SystemExit(f"Target is not a directory: {options.target}")

    if options.dry_run:
        if not options.target.exists():
            log("mkdir", options.target)
        return

    options.target.mkdir(parents=True, exist_ok=True)

def backup_file(path: Path, dry_run: bool) -> None:
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    backup_path = path.with_name(f"{path.name}.bak.{timestamp}")

    log("backup", backup_path, f"from {path.name}")

    if not dry_run:
        shutil.copy2(path, backup_path)

# src: source / des: destination
def copy_file(src: Path, dest: Path, options: InstallOptions, stats: InstallStats) -> None:
    # 상대경로 변환 
    rel_dest = dest.relative_to(options.target)

    if dest.exists() and dest.is_dir():
        log("conflict", rel_dest, "target is a directory")
        stats.conflicts += 1
        return

    if not dest.exists():
        log("copy", rel_dest)
        stats.copied += 1

        if not options.dry_run:
            # parents=True => parents폴더 경로까지 같이 만듬. 
            # exist_ok=True => 이미 있어도 오류를 반환하지않음. 
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src,dest)

        return
    # filecmp.cmp 파일 내용이 완전히 동일한지 비교 
    # shallow=False => 두 파일의 본문 내용을 처음부터 끝까지 바이트 단위로 읽어서 정밀 비교 
    if filecmp.cmp(src, dest, shallow=False):
        log("skip", rel_dest, "unchanged")
        stats.skipped += 1
        return

    if not options.force:
        log("conflict", rel_dest, "changed; use --force to overwrite")
        stats.conflicts += 1
        return

    if options.backup:
        backup_file(dest, options.dry_run)

    log("update", rel_dest)
    stats.updated += 1

    if not options.dry_run:
        shutil.copy2(src, dest)

def copy_dir(src: Path, dest: Path, options: InstallOptions, stats: InstallStats) -> None:
    if dest.exists() and not dest.is_dir():
        rel_dest = dest.relative_to(options.target)
        log("conflict", rel_dest, "target is a file")
        stats.conflicts += 1
        return

    for current in sorted(src.rglob("*")):
        relative = current.relative_to(src)
        target = dest / relative

        if current.is_dir():
            if not target.exists():
                rel_target = target.relative_to(options.target)
                log("mkdir", rel_target)
                stats.created_dirs += 1

                if not options.dry_run:
                    target.mkdir(parents=True, exist_ok=True)

            continue

        copy_file(current, target, options, stats)


def install_item(item: str, options: InstallOptions, stats: InstallStats) -> None:
    src = SOURCE_ROOT / item
    dest = options.target / item

    if not src.exists():
        log("missing", src)
        stats.conflicts += 1
        return

    if src.is_dir():
        copy_dir(src, dest, options, stats)
        return

    copy_file(src, dest, options, stats)


def install(options: InstallOptions) -> int:
    ensure_target(options)

    stats = InstallStats()
    items = PROFILES[options.profile]

    print(f"source : {SOURCE_ROOT}")
    print(f"target : {options.target}")
    print(f"profile: {options.profile}")
    print(f"mode   : {'dry-run' if options.dry_run else 'write'}")
    print()

    for item in items:
        install_item(item, options, stats)

    print()
    print("summary")
    print(f"  copied      : {stats.copied}")
    print(f"  updated     : {stats.updated}")
    print(f"  skipped     : {stats.skipped}")
    print(f"  created dirs: {stats.created_dirs}")
    print(f"  conflicts   : {stats.conflicts}")

    return 1 if stats.conflicts else 0


def main() -> int:
    options = parse_args()
    return install(options)


if __name__ == "__main__":
    raise SystemExit(main())
