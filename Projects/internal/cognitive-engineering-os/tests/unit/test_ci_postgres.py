"""The CI PostgreSQL gate must run against a server, not turn skipped database tests green."""

from __future__ import annotations

import os
import subprocess
import sys
import unittest
from pathlib import Path

import yaml

from tests import pg

COS = Path(__file__).resolve().parents[2]
REPO = COS.parents[2]
WORKFLOW = REPO / ".github/workflows/cognitive-os-full-suite.yml"
SCRIPTS = COS / "scripts"
sys.path.insert(0, str(SCRIPTS))
from image_test_modules import CHECKOUT_ONLY_TEST_MODULES, all_test_modules, checkout_test_modules, image_test_modules  # noqa: E402


class CiPostgresTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.workflow = yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))
        cls.python_steps = cls.workflow["jobs"]["python"]["steps"]
        cls.full = next(step["run"] for step in cls.python_steps if step.get("name") == "Full suite")

    def test_python_job_starts_waits_and_cleans_its_networked_database(self):
        self.assertIn("docker network create cos-ci-net", self.full)
        self.assertIn("--network cos-ci-net --network-alias postgres", self.full)
        self.assertIn("pg_isready -h 127.0.0.1", self.full)
        self.assertIn("--network cos-ci-net", self.full)
        self.assertIn("COGNITIVE_OS_TEST_DATABASE_URL=", self.full)
        self.assertIn("COGNITIVE_OS_REQUIRE_POSTGRES=1", self.full)
        cleanup = next(step for step in self.python_steps if step.get("name") == "Remove test PostgreSQL and network")
        self.assertEqual(cleanup.get("if"), "always()")
        self.assertIn("docker rm -f cos-ci-postgres", cleanup["run"])
        self.assertIn("docker network rm cos-ci-net", cleanup["run"])

    def test_workflow_uses_the_fixture_pinned_image(self):
        self.assertIn(f'PG_IMAGE="{pg.IMAGE}"', self.full)
        self.assertIn('"$PG_IMAGE"', self.full)

    def test_password_is_per_run_masked_and_not_logged(self):
        self.assertIn('PG_PASSWORD="$(openssl rand -hex 16)"', self.full)
        self.assertIn('echo "::add-mask::$PG_PASSWORD"', self.full)
        self.assertLess(self.full.index("::add-mask::"), self.full.index("POSTGRES_PASSWORD="))
        self.assertNotIn("set -x", self.full)
        for line in self.full.splitlines():
            if "$PG_PASSWORD" in line and ("echo " in line or "printf " in line):
                self.assertIn("::add-mask::", line)

    def test_data_and_fixture_changes_trigger_the_workflow(self):
        paths = self.workflow.get("on", self.workflow.get(True))["push"]["paths"]
        for path in (
            "Projects/internal/cognitive-engineering-os/tests/pg.py",
            "Projects/internal/cognitive-engineering-os/ai_lego/data/**",
            "Projects/internal/cognitive-engineering-os/ai_lego/data/migrations/**",
        ):
            self.assertIn(path, paths)

    @staticmethod
    def _probe(require: bool) -> subprocess.CompletedProcess[str]:
        env = dict(os.environ)
        env.pop(pg.TEST_DATABASE_URL_ENV, None)
        env["PATH"] = ""  # no Docker, independent of the test host
        if require:
            env[pg.REQUIRE_POSTGRES_ENV] = "1"
        else:
            env.pop(pg.REQUIRE_POSTGRES_ENV, None)
        code = "import unittest; from tests import pg\ntry: pg.server()\nexcept unittest.SkipTest as error: print(error)"
        return subprocess.run([sys.executable, "-c", code], cwd=COS, env=env, capture_output=True, text=True)

    def test_required_postgres_fails_and_laptop_still_skips_with_reason(self):
        required = self._probe(True)
        self.assertNotEqual(required.returncode, 0)
        self.assertIn(pg.REQUIRE_POSTGRES_ENV, required.stderr)
        laptop = self._probe(False)
        self.assertEqual(laptop.returncode, 0, laptop.stderr)
        self.assertIn(pg.TEST_DATABASE_URL_ENV, laptop.stdout + laptop.stderr)
        self.assertIn("did NOT run", laptop.stdout + laptop.stderr)

    def test_data_changes_select_postgres_and_repository_tests(self):
        sys.path.insert(0, str(COS / "scripts"))
        from affected_tests import affected_test_modules

        tests, _, _ = affected_test_modules(["Projects/internal/cognitive-engineering-os/ai_lego/data/db.py"])
        self.assertIn("tests.unit.test_pg_foundation", tests)
        self.assertIn("tests.unit.test_collection_run_repository", tests)
        self.assertIn("tests.unit.test_project_source_repository", tests)

    def test_every_test_module_has_one_explicit_image_or_checkout_home(self):
        checkout_job = self.workflow["jobs"]["checkout-tests"]
        checkout_run = next(
            step["run"] for step in checkout_job["steps"] if step.get("name") == "Run the explicit checkout-only test list"
        )
        self.assertIn("--checkout", checkout_run)
        checkout_env = next(step for step in checkout_job["steps"] if step.get("name") == "Run the explicit checkout-only test list").get("env", {})
        self.assertEqual(checkout_env.get(pg.REQUIRE_POSTGRES_ENV), "1")   # its block tests need PostgreSQL: red, not skipped
        self.assertEqual(checkout_env.get("COS_FULL_SUITE"), "1")

        all_modules = set(all_test_modules(COS / "tests"))
        checkout_modules = set(CHECKOUT_ONLY_TEST_MODULES)
        image_modules = set(image_test_modules(COS / "tests"))
        self.assertEqual(set(checkout_test_modules(COS / "tests")), checkout_modules)
        self.assertTrue(checkout_modules <= all_modules)
        self.assertEqual(checkout_modules | image_modules, all_modules)
        self.assertEqual(checkout_modules & image_modules, set())
        for module in (
            "tests.unit.test_ci_postgres",
            "tests.unit.test_cognitive_db_ops",
            "tests.unit.test_codex_queue",
        ):
            self.assertIn(module, checkout_modules)

        dockerfile = (COS / "Dockerfile").read_text(encoding="utf-8")
        for copied in (
            "Projects/internal/cognitive-engineering-os/ai_lego",
            "agency-os/docs/AI_LEGO_Cognitive_Engineering_OS",
            "Projects/internal/cognitive-engineering-os/tests",
            "Projects/internal/cognitive-engineering-os/eval",
            "Projects/internal/cognitive-engineering-os/scripts",
            "Projects/internal/cognitive-engineering-os/apps/cognitive-web/fixtures",
        ):
            self.assertIn(copied, dockerfile)
        gate = (COS / "scripts" / "test-gate.sh").read_text(encoding="utf-8")
        self.assertIn("python scripts/image_test_modules.py --image", gate)
        self.assertNotIn("discover -s tests", gate)


if __name__ == "__main__":
    unittest.main()
