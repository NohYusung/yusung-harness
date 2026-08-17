from __future__ import annotations

import hashlib
import os
import subprocess
import tempfile
import unittest
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(
    os.environ.get("RUN_INSTALL_ACCEPTANCE") == "1",
    "set RUN_INSTALL_ACCEPTANCE=1 to perform a real frozen pnpm install",
)
class InstallerAcceptanceTest(unittest.TestCase):
    def test_installs_current_payload_and_dependencies_into_temporary_target(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            target = Path(temp_dir) / "target project"
            result = subprocess.run(
                ["python3", str(REPOSITORY_ROOT / "install.py"), str(target)],
                cwd=REPOSITORY_ROOT,
                text=True,
                capture_output=True,
                check=False,
            )

            self.assertEqual(
                result.returncode,
                0,
                msg=f"stdout:\n{result.stdout}\n\nstderr:\n{result.stderr}",
            )
            self.assertTrue(target.joinpath("AGENTS.md").is_file())
            self.assertTrue(target.joinpath(".codex/config.toml").is_file())
            self.assertTrue(
                target.joinpath(
                    ".codex/skills/integration/scripts/worktree.py"
                ).is_file()
            )
            self.assertTrue(
                target.joinpath(
                    ".codex/skills/integration/scripts/test_worktree.py"
                ).is_file()
            )
            self.assertFalse(
                target.joinpath(".codex/skills/code/scripts/worktree.py").exists()
            )
            self.assertFalse(
                target.joinpath(".codex/skills/code/scripts/test_worktree.py").exists()
            )
            self.assertTrue(target.joinpath("apps/server/src/main.ts").is_file())
            self.assertTrue(target.joinpath("apps/web/src/app/page.tsx").is_file())
            self.assertTrue(target.joinpath("apps/server/.env").is_file())
            self.assertTrue(target.joinpath("apps/web/.env.local").is_file())
            self.assertTrue(target.joinpath("apps/node_modules").is_dir())
            self.assertFalse(target.joinpath("apps/server/prisma/harness-board.db").exists())
            self.assertFalse(target.joinpath("apps/server/dist").exists())
            self.assertFalse(target.joinpath("apps/web/.next").exists())
            self.assertEqual(
                self._sha256(REPOSITORY_ROOT / "apps/pnpm-lock.yaml"),
                self._sha256(target / "apps/pnpm-lock.yaml"),
            )

    @staticmethod
    def _sha256(path: Path) -> str:
        return hashlib.sha256(path.read_bytes()).hexdigest()


if __name__ == "__main__":
    unittest.main()
