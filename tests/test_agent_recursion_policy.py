from __future__ import annotations

import re
import unittest
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
CODEX_AGENT_ROOT = REPOSITORY_ROOT / ".codex" / "agents"
CODEX_SKILL_ROOT = REPOSITORY_ROOT / ".codex" / "skills"

EXPECTED_AGENT_ROLES = frozenset(
    {
        "architect",
        "coder",
        "designer",
        "doc-curator",
        "planner",
        "researcher",
        "reviewer",
        "tester",
    }
)
AGENT_CALLING_SKILLS = frozenset(
    {
        "architecturePlan",
        "asset",
        "code",
        "curate",
        "db",
        "design",
        "draft",
        "erd",
        "integration",
        "plan",
        "research",
        "wireframe",
    }
)
POLICY_HEADING = "## 에이전트 호출 경계"
ROOT_SPAWN_ALLOWANCE = (
    "- 새 에이전트를 생성하는 `spawn_agent`는 `root만` 호출한다."
)
CANONICAL_POLICY = """## 에이전트 호출 경계

{root_spawn_allowance}
- non-root 에이전트는 `spawn_agent`를 `직접 또는 간접`으로 호출하거나 다른 에이전트에게 생성을 요청하지 않는다.
- non-root 에이전트는 root가 이미 생성한 에이전트와 협력할 때 `send_message`, `followup_task`, `wait_agent`를 사용할 수 있다.
- 추가 역할이나 에이전트가 필요하면 필요한 역할, 작업 범위와 기대 증거를 `root에 handoff`한다.
""".format(root_spawn_allowance=ROOT_SPAWN_ALLOWANCE)
ROLE_POLICY_TOKENS = (
    "spawn_agent",
    "root만",
    "직접 또는 간접",
    "send_message",
    "followup_task",
    "wait_agent",
    "root에 handoff",
)
TOML_POLICY_TOKENS = (
    "spawn_agent를 호출하지 않는다",
    "root에 handoff",
)
SKILL_POLICY_TOKENS = (
    "spawn_agent",
    "root만",
    "직접 또는 간접",
    "root에 handoff",
)
SPAWN_ALLOWANCE_PHRASES = (
    "호출할 수 있다",
    "호출한다",
    "사용할 수 있다",
    "사용한다",
    "may call",
    "can call",
    "may use",
    "can use",
)
PROHIBITED_SPAWN_SUBJECTS = (
    *EXPECTED_AGENT_ROLES,
    "non-root",
    "subagent",
    "sub-agent",
    "서브 에이전트",
    "이 역할",
    "모든 에이전트",
)


class AgentRecursionPolicyTest(unittest.TestCase):
    def assert_contains_policy(
        self,
        content: str,
        required_tokens: tuple[str, ...],
        *,
        source: Path,
    ) -> None:
        """정책 문서에 재귀 호출 금지 계약의 필수 토큰이 있는지 검사한다."""

        for token in required_tokens:
            with self.subTest(source=str(source), token=token):
                self.assertIn(token, content)

    def assert_has_no_unapproved_spawn_allowance(
        self,
        content: str,
        *,
        source: Path | str,
    ) -> None:
        """canonical root 문장 외의 spawn 호출 허용 문장을 거부한다."""

        for line_number, line in enumerate(content.splitlines(), start=1):
            normalized = line.casefold()
            has_allowance = any(
                phrase in normalized for phrase in SPAWN_ALLOWANCE_PHRASES
            )
            if "spawn_agent" not in normalized or not has_allowance:
                continue
            self.assertFalse(
                any(subject in normalized for subject in PROHIBITED_SPAWN_SUBJECTS),
                f"non-root spawn allowance at {source}:{line_number}: {line}",
            )
            stripped = line.strip()
            is_root_owned = (
                "root만" in normalized
                or stripped.startswith("- root는 ")
                or stripped.startswith("- root가 ")
            )
            self.assertTrue(
                is_root_owned,
                f"unowned spawn allowance at {source}:{line_number}: {line}",
            )

    def test_root_agents_policy_reserves_spawn_for_root(self) -> None:
        """루트 지침이 spawn 소유권과 sub-agent handoff 경계를 선언한다."""

        agents_path = REPOSITORY_ROOT / "AGENTS.md"
        content = agents_path.read_text(encoding="utf-8")

        self.assertIn(CANONICAL_POLICY, content)
        self.assert_contains_policy(content, ROLE_POLICY_TOKENS, source=agents_path)
        self.assert_has_no_unapproved_spawn_allowance(content, source=agents_path)

    def test_all_codex_agent_roles_share_the_same_boundary(self) -> None:
        """모든 Codex 역할의 Markdown과 TOML이 동일한 금지 정책을 상속한다."""

        role_directories = {
            path.parent.name
            for path in CODEX_AGENT_ROOT.glob("*/*.toml")
        }
        self.assertEqual(role_directories, EXPECTED_AGENT_ROLES)

        for role in sorted(EXPECTED_AGENT_ROLES):
            with self.subTest(role=role):
                role_root = CODEX_AGENT_ROOT / role
                markdown_path = role_root / f"{role}.md"
                toml_path = role_root / f"{role}.toml"

                markdown = markdown_path.read_text(encoding="utf-8")
                self.assertTrue(markdown.strip(), f"empty agent prompt: {markdown_path}")
                self.assertIn(CANONICAL_POLICY, markdown)
                self.assert_contains_policy(
                    markdown,
                    ROLE_POLICY_TOKENS,
                    source=markdown_path,
                )
                self.assert_has_no_unapproved_spawn_allowance(
                    markdown,
                    source=markdown_path,
                )

                toml_content = toml_path.read_text(encoding="utf-8")
                self.assertRegex(
                    toml_content,
                    rf'(?m)^name\s*=\s*"{re.escape(role)}"\s*$',
                )
                instructions_match = re.search(
                    r'(?ms)^developer_instructions\s*=\s*"""(.*?)"""',
                    toml_content,
                )
                self.assertIsNotNone(
                    instructions_match,
                    f"missing developer_instructions: {toml_path}",
                )
                assert instructions_match is not None
                developer_instructions = instructions_match.group(1)
                self.assert_contains_policy(
                    developer_instructions,
                    TOML_POLICY_TOKENS,
                    source=toml_path,
                )
                self.assert_has_no_unapproved_spawn_allowance(
                    developer_instructions,
                    source=toml_path,
                )

    def test_agent_calling_skills_delegate_spawn_to_root(self) -> None:
        """에이전트 호출 스킬은 sub-agent가 아니라 root에 호출을 위임한다."""

        discovered_skills: set[str] = set()
        for skill_path in CODEX_SKILL_ROOT.glob("*/SKILL.md"):
            content = skill_path.read_text(encoding="utf-8")
            dispatches_named_role = any(
                "호출" in line
                and any(role in line for role in EXPECTED_AGENT_ROLES)
                for line in content.splitlines()
            )
            if "spawn_agent" in content or dispatches_named_role:
                discovered_skills.add(skill_path.parent.name)
            self.assert_has_no_unapproved_spawn_allowance(
                content,
                source=skill_path,
            )
        self.assertEqual(discovered_skills, AGENT_CALLING_SKILLS)

        for skill in sorted(discovered_skills):
            with self.subTest(skill=skill):
                skill_path = CODEX_SKILL_ROOT / skill / "SKILL.md"
                content = skill_path.read_text(encoding="utf-8")

                self.assertIn(CANONICAL_POLICY, content)
                self.assert_contains_policy(
                    content,
                    SKILL_POLICY_TOKENS,
                    source=skill_path,
                )
                self.assert_has_no_unapproved_spawn_allowance(
                    content,
                    source=skill_path,
                )

    def test_spawn_allowance_guard_rejects_contradictory_fixture(self) -> None:
        """정책 토큰이 있어도 non-root 허용 문구가 있으면 실패한다."""

        invalid_allowances = (
            "coder는 spawn_agent를 호출한다.",
            "이 역할은 spawn_agent를 호출할 수 있다.",
            "모든 에이전트는 spawn_agent를 사용할 수 있다.",
            "non-root agents may call spawn_agent.",
        )

        for invalid_allowance in invalid_allowances:
            with self.subTest(invalid_allowance=invalid_allowance):
                with self.assertRaises(AssertionError):
                    self.assert_has_no_unapproved_spawn_allowance(
                        CANONICAL_POLICY + f"\n- {invalid_allowance}\n",
                        source="contradictory-fixture",
                    )

    def test_root_multi_agent_feature_remains_enabled(self) -> None:
        """root의 1단계 병렬 호출을 위해 전역 multi-agent 기능을 유지한다."""

        config_path = REPOSITORY_ROOT / ".codex" / "config.toml"
        config_content = config_path.read_text(encoding="utf-8")
        feature_match = re.search(
            r"(?ms)^\[features\.multi_agent_v2\]\s*(.*?)(?=^\[|\Z)",
            config_content,
        )

        self.assertIsNotNone(feature_match, "missing features.multi_agent_v2")
        assert feature_match is not None
        self.assertRegex(feature_match.group(1), r"(?m)^enabled\s*=\s*true\s*$")


if __name__ == "__main__":
    unittest.main()
