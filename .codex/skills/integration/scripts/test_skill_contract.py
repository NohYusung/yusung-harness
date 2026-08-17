import re
import unittest
from pathlib import Path


SKILL_PATH = Path(__file__).resolve().parents[1] / "SKILL.md"
HARD_GATE_PATTERN = re.compile(r"<HARD-GATE>(.*?)</HARD-GATE>", re.DOTALL)


class IntegrationSkillContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.skill = SKILL_PATH.read_text(encoding="utf-8")
        self.hard_gates = HARD_GATE_PATTERN.findall(self.skill)
        commit_marker = "## `--commit <branch-name>`"
        merge_marker = "## `--merge --source <feature-branch> --target <target-branch>`"
        self.commit_section = self.skill.partition(commit_marker)[2].partition(
            merge_marker
        )[0]
        self.merge_section = self.skill.partition(merge_marker)[2]

    def test_commit_script_and_required_arguments_are_documented(self) -> None:
        self.assertTrue(self.hard_gates, "integration 스킬에 HARD-GATE가 필요합니다.")

        self.assertIn("scripts/commit.py", self.skill)
        for argument in (
            "--repo",
            "--expected-branch",
            "--expected-head",
            "--type",
            "--title",
            "--summary",
        ):
            with self.subTest(argument=argument):
                self.assertIn(argument, self.skill)

    def test_raw_git_commit_and_failure_bypass_are_forbidden(self) -> None:
        hard_gate_text = "\n".join(self.hard_gates)

        self.assertIn("git commit", hard_gate_text)
        self.assertRegex(hard_gate_text, r"금지|실행하지|사용하지")
        self.assertIn("우회", hard_gate_text)

    def test_target_scoped_workflow_stages_then_analyzes_then_commits(self) -> None:
        commands = (
            "git -C <TARGET_REPO_ABSOLUTE_PATH> status --short",
            "git -C <TARGET_REPO_ABSOLUTE_PATH> add -A --",
            "git -C <TARGET_REPO_ABSOLUTE_PATH> diff --cached --stat",
            "`git -C <TARGET_REPO_ABSOLUTE_PATH> diff --cached --`",
            "python3 <INTEGRATION_SKILL_DIR>/scripts/commit.py",
            "git -C <TARGET_REPO_ABSOLUTE_PATH> show -s --format=%B",
        )
        for command in commands:
            with self.subTest(command=command):
                self.assertIn(command, self.commit_section)

        add_position = self.commit_section.index("add -A --")
        cached_diff_position = self.commit_section.index("diff --cached --stat")
        commit_position = self.commit_section.index(
            "python3 <INTEGRATION_SKILL_DIR>/scripts/commit.py"
        )
        self.assertLess(add_position, cached_diff_position)
        self.assertLess(cached_diff_position, commit_position)

    def test_prefix_boundaries_and_primary_change_inheritance_are_documented(
        self,
    ) -> None:
        expected_rules = (
            "기능·API·모듈 제거가 주목적이면 `del`을 사용한다.",
            "동작 변화 없이 미사용 코드를 정리하면 `refactor`를 사용한다.",
            "설정·일반 파일 정리가 주목적이면 `chore`를 사용한다.",
            "기능 변경에 테스트·문서 변경이 동반되면 `test`·`docs`가 아니라 "
            "기능 변경의 prefix를 사용한다.",
        )
        for rule in expected_rules:
            with self.subTest(rule=rule):
                self.assertIn(rule, self.commit_section)

    def test_independent_mixed_changes_stop_and_preserve_index(self) -> None:
        self.assertIn(
            "서로 독립적인 주요 목적이 두 개 이상이면 커밋하지 말고 분리가 "
            "필요함을 보고한 뒤 index를 그대로 보존하고 종료한다.",
            self.commit_section,
        )
        self.assertIn(
            "서로 독립적인 주요 목적이 두 개 이상이면 `commit.py`를 실행하지 않는다.",
            "\n".join(self.hard_gates),
        )

    def test_merge_requires_clean_source_and_target(self) -> None:
        expected_rules = (
            "`<source-branch>`와 `<target-branch>`의 미커밋 내역을 확인한다.",
            "`${미커밋 브랜치} 에 commit 작업이 필요합니다.`를 보고하고 종료한다.",
            "양쪽 브랜치가 모두 clean이면 `<source-branch>`를 "
            "`<target-branch>`에 merge한다.",
        )
        for rule in expected_rules:
            with self.subTest(rule=rule):
                self.assertIn(rule, self.merge_section)


if __name__ == "__main__":
    unittest.main()
