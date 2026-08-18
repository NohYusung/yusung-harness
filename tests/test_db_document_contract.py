from __future__ import annotations

import re
import unittest
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
DB_SKILL_ROOT = REPOSITORY_ROOT / ".codex" / "skills" / "db"
SKILL_PATH = DB_SKILL_ROOT / "SKILL.md"
DISCOVERY_PATH = DB_SKILL_ROOT / "references" / "db-source-discovery.md"
TEMPLATE_PATH = DB_SKILL_ROOT / "references" / "db-table-template.md"
EXAMPLE_PATH = DB_SKILL_ROOT / "references" / "db-table-example.md"

EXPECTED_SECTIONS = [
    "역할",
    "구조 요약",
    "컬럼",
    "제약조건",
    "인덱스",
    "관계",
    "데이터 수명주기",
    "불일치와 미확인 항목",
]
LIFECYCLE_KEYWORDS = [
    "[CREATE]",
    "[ACTIVE]",
    "UPDATE",
    "LOCK",
    "DELETE",
    "[RETENTION / PARTITION]",
]
CORE_LIFECYCLE_PATTERN = re.compile(
    r"\[CREATE\]\n"
    r" {2}timestamp/default: .+\n"
    r" {3}\|\n"
    r" {3}v\n"
    r"\[ACTIVE\]\n"
    r" {2}row rule: .+\n"
    r" {3}\|\n"
    r" {3}\+--> UPDATE\n"
    r" {3}\| {6}timestamp/mechanism: .+\n"
    r" {3}\|\n"
    r" {3}\+--> LOCK\n"
    r" {3}\| {6}column/mechanism: .+\n"
    r" {3}\|\n"
    r" {3}`--> DELETE\n",
)
SOFT_DELETE_PRESENT_BRANCH = "\n".join(
    [
        "          |",
        "          +--> soft delete column: deleted_at",
        "          |       |",
        "          |       `--> [SOFT DELETED]",
        "          |              column/rule: deleted_at; active rule 미확인",
        "          |",
    ]
)
SOFT_DELETE_ABSENT_BRANCH = "\n".join(
    [
        "          |",
        "          +--> soft delete column: 없음",
        "          |",
    ]
)
FORBIDDEN_OUTPUT_PATTERNS = {
    "evidence id": r"E-\d{3}",
    "evidence placeholder": r"evidenceIds",
    "included evidence": r"포함 근거",
    "source mapping section": r"스키마 소스 매핑",
    "evidence list section": r"근거 목록",
    "verification checklist section": r"검증 체크리스트",
    "repository path": r"저장소 경로|repositoryRelativePath",
    "source filename": r"파일명",
    "source line": r"line number",
    "source symbol": r"code symbol|저장소 경로 / Symbol",
}
SOURCE_PATH_SYMBOL_PATTERN = re.compile(
    r"(?<![A-Za-z0-9_.-])"
    r"(?P<source_path>"
    r"(?:[A-Za-z]:[\\/]|/)?"
    r"(?:[A-Za-z0-9_.@~ -]+[\\/])+"
    r"[A-Za-z0-9_.@~ -]+\."
    r"(?:ts|tsx|js|jsx|mjs|cjs|sql|prisma|py|rb|java|kt|kts|go|cs|php|"
    r"scala|rs|swift|ex|exs|erl|hrl|fs|fsx|vb|groovy|dart|lua|sh|bash|"
    r"zsh|graphql|gql|proto|hcl|tf|yml|yaml|json|xml)"
    r"(?:#[A-Za-z_$][A-Za-z0-9_$.:<>-]*)?"
    r")",
    re.IGNORECASE,
)


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def extract_template_payload(content: str) -> str:
    marker = "````md\n"
    start = content.index(marker) + len(marker)
    end = content.index("\n````", start)
    return content[start:end]


def extract_example_payload(content: str) -> str:
    marker = "# commerce.order_items\n"
    start = content.index(marker)
    return content[start:]


def find_output_source_locations(payload: str) -> list[str]:
    return [
        match.group("source_path").strip()
        for match in SOURCE_PATH_SYMBOL_PATTERN.finditer(payload)
    ]


def split_markdown_row(row: str) -> list[str]:
    body = row.strip()
    if not body.startswith("|") or not body.endswith("|"):
        raise AssertionError(f"not a Markdown table row: {row}")

    body = body[1:-1]
    cells: list[str] = []
    current: list[str] = []
    in_code = False
    brace_depth = 0
    index = 0

    while index < len(body):
        pair = body[index : index + 2]
        if pair == "{{" and not in_code:
            brace_depth += 1
            current.append(pair)
            index += 2
            continue
        if pair == "}}" and not in_code and brace_depth > 0:
            brace_depth -= 1
            current.append(pair)
            index += 2
            continue

        char = body[index]
        if char == "`":
            in_code = not in_code
            current.append(char)
        elif char == "|" and not in_code and brace_depth == 0:
            cells.append("".join(current).strip())
            current = []
        else:
            current.append(char)
        index += 1

    cells.append("".join(current).strip())
    return cells


def markdown_table_groups(payload: str) -> list[list[str]]:
    groups: list[list[str]] = []
    current: list[str] = []
    in_fence = False

    for line in payload.splitlines():
        if line.startswith("```"):
            in_fence = not in_fence
            if current:
                groups.append(current)
                current = []
            continue
        if not in_fence and line.startswith("|"):
            current.append(line)
            continue
        if current:
            groups.append(current)
            current = []

    if current:
        groups.append(current)
    return groups


class DbDocumentContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.skill = read(SKILL_PATH)
        cls.discovery = read(DISCOVERY_PATH)
        cls.template_file = read(TEMPLATE_PATH)
        cls.example_file = read(EXAMPLE_PATH)
        cls.payloads = {
            "template": extract_template_payload(cls.template_file),
            "example": extract_example_payload(cls.example_file),
        }

    def assert_core_lifecycle_hierarchy(self, diagram: str) -> None:
        self.assertRegex(diagram, CORE_LIFECYCLE_PATTERN)

    def test_contract_version_is_2_0_everywhere(self) -> None:
        for path, content in {
            SKILL_PATH: self.skill,
            DISCOVERY_PATH: self.discovery,
            TEMPLATE_PATH: self.template_file,
            EXAMPLE_PATH: self.example_file,
        }.items():
            with self.subTest(path=path):
                self.assertIn("DBTableDoc/2.0", content)
                self.assertNotIn("DBTableDoc/1.0", content)

    def test_payloads_have_exactly_eight_numbered_sections(self) -> None:
        for name, payload in self.payloads.items():
            with self.subTest(payload=name):
                sections = re.findall(r"^## (\d+)\. (.+)$", payload, re.MULTILINE)
                self.assertEqual(
                    sections,
                    [(str(index), title) for index, title in enumerate(EXPECTED_SECTIONS, 1)],
                )

    def test_top_metadata_and_role_fields_are_preserved(self) -> None:
        metadata_labels = [
            "문서 계약:",
            "정규 title:",
            "분석 기준:",
            "데이터베이스 엔진:",
            "Database / Schema / Table:",
            "근거 상태:",
        ]
        role_labels = ["목적:", "소유 도메인:", "객체 종류:"]

        for name, payload in self.payloads.items():
            with self.subTest(payload=name):
                for label in [*metadata_labels, *role_labels]:
                    self.assertIn(label, payload)
                self.assertNotIn("미확인 (코드 경로", payload)

    def test_output_omits_provenance_sections_ids_and_locations(self) -> None:
        for name, payload in self.payloads.items():
            for label, pattern in FORBIDDEN_OUTPUT_PATTERNS.items():
                with self.subTest(payload=name, forbidden=label):
                    self.assertNotRegex(payload, pattern)
            with self.subTest(payload=name, forbidden="source path and optional symbol"):
                self.assertEqual(find_output_source_locations(payload), [])

        for path in DB_SKILL_ROOT.rglob("*"):
            if path.is_file():
                content = read(path)
                with self.subTest(path=path, forbidden="evidence id system"):
                    self.assertNotRegex(content, r"E-\d{3}|evidenceIds")

    def test_source_path_detector_catches_mutations_without_db_false_positives(self) -> None:
        representative_mutation = (
            self.payloads["example"]
            + "\n- source: src/services/users/user.entity.ts#User\n"
        )
        self.assertIn(
            "src/services/users/user.entity.ts#User",
            find_output_source_locations(representative_mutation),
        )

        path_variants = [
            "/workspace/apps/api/schema.prisma#User",
            r"C:\workspace\apps\api\src\user.entity.ts#User",
            r"services\users\user.repository.cs#UserRepository",
        ]
        for path_variant in path_variants:
            with self.subTest(path=path_variant):
                self.assertEqual(find_output_source_locations(path_variant), [path_variant])

        non_source_database_tokens = " ".join(
            [
                "commerce.order_items",
                "public.users.id",
                "varchar(255)",
                "numeric(12,2)",
                "timestamp without time zone",
            ]
        )
        self.assertEqual(find_output_source_locations(non_source_database_tokens), [])

    def test_tables_have_no_trailing_evidence_column_and_consistent_arity(self) -> None:
        for name, payload in self.payloads.items():
            groups = markdown_table_groups(payload)
            self.assertGreater(len(groups), 0, name)

            for table_index, rows in enumerate(groups, 1):
                with self.subTest(payload=name, table=table_index):
                    expected_arity = len(split_markdown_row(rows[0]))
                    self.assertGreater(expected_arity, 1)
                    self.assertNotEqual(split_markdown_row(rows[0])[-1], "근거")
                    for row in rows[1:]:
                        self.assertEqual(len(split_markdown_row(row)), expected_arity, row)

    def test_lifecycle_is_one_ascii_diagram_with_required_states(self) -> None:
        diagrams_by_name: dict[str, str] = {}
        for name, payload in self.payloads.items():
            lifecycle = payload.split("## 7. 데이터 수명주기\n", 1)[1].split(
                "## 8. 불일치와 미확인 항목", 1
            )[0]
            diagrams = re.findall(r"```text\n(.*?)\n```", lifecycle, re.DOTALL)

            with self.subTest(payload=name):
                self.assertEqual(len(diagrams), 1)
                self.assertEqual(re.sub(r"```text\n.*?\n```", "", lifecycle, flags=re.DOTALL).strip(), "")
                for keyword in LIFECYCLE_KEYWORDS:
                    self.assertIn(keyword, diagrams[0])
                self.assert_core_lifecycle_hierarchy(diagrams[0])
                diagrams_by_name[name] = diagrams[0]

        self.assertIn("{{softDeleteBranchOrNone}}", diagrams_by_name["template"])
        self.assertNotIn("[SOFT DELETED]", diagrams_by_name["template"])
        self.assertIn("[SOFT DELETED]", diagrams_by_name["example"])

        soft_present_pattern = re.compile(
            r"`--> DELETE\n"
            r"\s+\|\n"
            r"\s+\+--> soft delete column: .+\n"
            r"\s+\|\s+\|\n"
            r"\s+\|\s+`--> \[SOFT DELETED\]\n"
            r"\s+\|\s+column/rule: .+\n"
            r"\s+\|\n"
            r"\s+`--> hard delete rule: .+",
        )
        soft_absent_pattern = re.compile(
            r"`--> DELETE\n"
            r"\s+\|\n"
            r"\s+\+--> soft delete column: 없음\n"
            r"\s+\|\n"
            r"\s+`--> hard delete rule: .+",
        )
        rendered_variants = {
            "template-soft-present": diagrams_by_name["template"].replace(
                "{{softDeleteBranchOrNone}}", SOFT_DELETE_PRESENT_BRANCH
            ),
            "template-no-soft": diagrams_by_name["template"].replace(
                "{{softDeleteBranchOrNone}}", SOFT_DELETE_ABSENT_BRANCH
            ),
            "example-soft-present": diagrams_by_name["example"],
        }

        for name, diagram_text in rendered_variants.items():
            with self.subTest(payload=name, structure="lifecycle hierarchy"):
                self.assertLess(
                    diagram_text.index("[CREATE]"),
                    diagram_text.index("[ACTIVE]"),
                )
                self.assertLess(diagram_text.index("[ACTIVE]"), diagram_text.index("UPDATE"))
                self.assertLess(diagram_text.index("UPDATE"), diagram_text.index("LOCK"))
                self.assertLess(diagram_text.index("LOCK"), diagram_text.index("DELETE"))
                self.assertIn("\n\n[RETENTION / PARTITION]\n", diagram_text)

        self.assertRegex(rendered_variants["template-soft-present"], soft_present_pattern)
        self.assertIn("[SOFT DELETED]", rendered_variants["template-soft-present"])
        self.assertRegex(rendered_variants["example-soft-present"], soft_present_pattern)
        self.assertRegex(rendered_variants["template-no-soft"], soft_absent_pattern)
        self.assertNotIn("[SOFT DELETED]", rendered_variants["template-no-soft"])

        self.assertIn(
            "hard delete rule: {{verifiedHardDeleteRuleOrUnknown}}",
            self.payloads["template"],
        )
        self.assertIn("soft delete column: deleted_at", self.payloads["example"])
        self.assertIn("hard delete rule: 미확인", self.payloads["example"])

    def test_internal_source_priority_and_verification_remain(self) -> None:
        self.assertIn("## 근거 우선순위", self.discovery)
        self.assertIn("## 내부 근거 검증 계약", self.discovery)
        self.assertIn("저장 content 밖의 내부 분석 기록", self.discovery)
        self.assertIn("내부 직접 근거로 재현", self.skill)
        self.assertIn("고정 8개 섹션", self.skill)


if __name__ == "__main__":
    unittest.main()
