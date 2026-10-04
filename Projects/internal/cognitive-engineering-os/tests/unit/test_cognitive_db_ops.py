"""Source-level gates for the unapplied cognitive-db deployment files."""

from __future__ import annotations

from datetime import datetime, timezone
import os
from pathlib import Path
import secrets
import shlex
import shutil
import subprocess
import tempfile
import time
import unittest

import yaml

from tests import pg


COS = Path(__file__).resolve().parents[2]
OPS = COS / "ops" / "cognitive-db"
COMPOSE = OPS / "docker-compose.cognitive-db.yml"
BACKUP = OPS / "backup-cognitive-db.sh"
README = OPS / "README.md"
RESTORE = OPS / "restore-cognitive-db.md"


def _docker_problem() -> str | None:
    if shutil.which("docker") is None:
        return "docker is not on PATH"
    try:
        probe = subprocess.run(
            ["docker", "info", "--format", "{{.ServerVersion}}"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=30,
        )
    except subprocess.TimeoutExpired:
        return "the Docker daemon did not answer within 30 seconds"
    if probe.returncode != 0:
        return "the Docker daemon is not available"
    return None


def _run_docker(*args: str, timeout: int = 120) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["docker", *args], capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout
    )


class CognitiveDbOpsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.compose_text = COMPOSE.read_text(encoding="utf-8")
        cls.compose = yaml.safe_load(cls.compose_text)
        cls.service = cls.compose["services"]["cognitive-db"]
        cls.backup_text = BACKUP.read_text(encoding="utf-8")
        cls.readme_text = README.read_text(encoding="utf-8")

    def test_compose_has_one_private_digest_pinned_service(self) -> None:
        self.assertEqual(set(self.compose["services"]), {"cognitive-db"})
        self.assertEqual(self.service["image"], pg.IMAGE)
        self.assertNotIn("ports", self.service)
        self.assertEqual(self.service["restart"], "unless-stopped")
        self.assertIn("mem_limit", self.service)
        self.assertIn("shm_size", self.service)
        self.assertEqual(self.service["networks"], ["lobster-net"])
        self.assertTrue(self.compose["networks"]["lobster-net"]["external"])

    def test_compose_uses_a_named_volume_and_healthcheck(self) -> None:
        self.assertIn("cognitive-db-data", self.compose["volumes"])
        self.assertIn("cognitive-db-data:/var/lib/postgresql/data", self.service["volumes"])
        healthcheck = self.service["healthcheck"]
        self.assertIn("pg_isready", " ".join(healthcheck["test"]))
        self.assertGreaterEqual(healthcheck["retries"], 1)

    def test_compose_uses_secret_file_and_data_checksums(self) -> None:
        environment = self.service["environment"]
        self.assertEqual(environment["POSTGRES_PASSWORD_FILE"], "/run/secrets/cognitive_db_password")
        self.assertEqual(environment["POSTGRES_INITDB_ARGS"], "--data-checksums")
        self.assertEqual(self.service["secrets"], ["cognitive_db_password"])
        self.assertIn("file:", self.compose_text)
        self.assertNotIn("POSTGRES_PASSWORD", environment)
        folder_text = "\n".join(path.read_text(encoding="utf-8") for path in OPS.glob("*") if path.is_file())
        self.assertNotIn("POSTGRES_PASSWORD=", folder_text)
        self.assertNotIn("POSTGRES_PASSWORD:", self.compose_text)

    def test_postgres_flags_have_reasons(self) -> None:
        for flag, reason in (
            ("max_connections=100", "connection"),
            ("shared_buffers=128MB", "cache"),
            ("log_min_duration_statement=1000", "slow"),
        ):
            flag_index = self.compose_text.index(flag)
            before_flag = self.compose_text[max(0, flag_index - 180) : flag_index].lower()
            self.assertIn(reason, before_flag, flag)

    def test_backup_script_has_fail_closed_proof_and_safe_rotation(self) -> None:
        self.assertIn("set -euo pipefail", self.backup_text)
        self.assertIn("pg_dump -Fc", self.backup_text)
        self.assertIn("pg_restore --list", self.backup_text)
        self.assertIn("BACKUP FAILED:", self.backup_text)
        self.assertNotRegex(self.backup_text, r"\brm\s+-rf\b")
        self.assertIn('"$BACKUP_DIR"/cognitive-db-????-??-??-*.dump', self.backup_text)
        self.assertIn('rm -f -- "$dump"', self.backup_text)
        self.assertIn("COGNITIVE_DB_BACKUP_DIR", self.backup_text)
        self.assertIn("COGNITIVE_DB_BACKUP_KEEP_DAYS", self.backup_text)

    def test_readme_records_unapplied_state_and_go_live_checks(self) -> None:
        self.assertIn("Nothing in this folder has been applied.", self.readme_text)
        self.assertIn("safe-infra-patch.sh compose", self.readme_text)
        self.assertIn("/etc/cron.d/ks-stack-backup", self.readme_text)
        for required in ("pg_isready", "EMPTY database", "migration to head", "backup", "restore", "ClaimReview"):
            self.assertIn(required, self.readme_text)
        self.assertRegex(self.readme_text, r"(?i)(?:small|很小).*?(?:GiB|GB|MB)")
        self.assertIn("ClaimReview mirror is NOT in this database.", self.readme_text)
        self.assertIn("throwaway", RESTORE.read_text(encoding="utf-8"))

    def test_backup_script_is_bash_syntax_valid(self) -> None:
        git_bash = Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "Git" / "bin" / "bash.exe"
        bash = str(git_bash) if git_bash.is_file() else shutil.which("bash")
        if bash is None:
            self.skipTest("LOUD SKIP: bash is not on PATH; run bash -n on a Unix host")
        script_arg = str(BACKUP).replace("\\", "/")
        result = subprocess.run(
            [bash, "-n", script_arg], capture_output=True, text=True, encoding="utf-8", errors="replace"
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_docker_compose_config_with_dummy_secret(self) -> None:
        problem = _docker_problem()
        if problem:
            self.skipTest(f"LOUD SKIP: docker compose config did not run because {problem}")
        with tempfile.TemporaryDirectory() as temporary:
            secret = Path(temporary) / "cognitive-db-password"
            secret.write_text("test-only-dummy-secret\n", encoding="utf-8")
            environment = dict(os.environ)
            environment["COGNITIVE_DB_PASSWORD_FILE"] = str(secret)
            result = subprocess.run(
                ["docker", "compose", "-f", str(COMPOSE), "config", "-q"],
                cwd=OPS,
                env=environment,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
            )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_optional_docker_backup_dump_restore_listing_rotation_and_corruption(self) -> None:
        problem = _docker_problem()
        if problem:
            self.skipTest(f"LOUD SKIP: optional Docker backup test did not run because {problem}")

        name = f"cos-db-test-backup-{secrets.token_hex(4)}"
        password = secrets.token_urlsafe(18)
        script_path = "/tmp/backup-cognitive-db.sh"
        container = _run_docker(
            "run",
            "-d",
            "--name",
            name,
            "--env",
            "POSTGRES_PASSWORD=" + password,
            pg.IMAGE,
        )
        self.assertEqual(container.returncode, 0, container.stderr)
        try:
            ready = False
            for _ in range(90):
                probe = _run_docker("exec", name, "pg_isready", "-U", "postgres")
                if probe.returncode == 0:
                    ready = True
                    break
                time.sleep(1)
            self.assertTrue(ready, "throwaway PostgreSQL did not become ready")
            copied = _run_docker("cp", str(BACKUP), f"{name}:{script_path}")
            self.assertEqual(copied.returncode, 0, copied.stderr)

            def run_backup() -> subprocess.CompletedProcess[str]:
                return _run_docker(
                    "exec",
                    "--env",
                    "BACKUP_DIR=/tmp/cognitive-db-backups",
                    "--env",
                    "KEEP_DAYS=14",
                    "--env",
                    "PGHOST=127.0.0.1",
                    "--env",
                    "PGUSER=postgres",
                    "--env",
                    "PGPASSWORD=" + password,
                    name,
                    "bash",
                    script_path,
                )

            first = run_backup()
            self.assertEqual(first.returncode, 0, first.stderr)
            listed = _run_docker(
                "exec",
                name,
                "sh",
                "-c",
                "find /tmp/cognitive-db-backups -maxdepth 1 -type f -name 'cognitive-db-*.dump' -print",
            )
            self.assertEqual(listed.returncode, 0, listed.stderr)
            dumps = [line.strip() for line in listed.stdout.splitlines() if line.strip()]
            self.assertTrue(dumps, "the first backup did not create a dump")
            archive_check = _run_docker("exec", name, "pg_restore", "--list", dumps[0])
            self.assertEqual(archive_check.returncode, 0, archive_check.stderr)

            old_dump = "/tmp/cognitive-db-backups/cognitive-db-2000-01-01-rotation.dump"
            old_copy = _run_docker("exec", name, "sh", "-c", f"cp {shlex.quote(dumps[0])} {shlex.quote(old_dump)}")
            self.assertEqual(old_copy.returncode, 0, old_copy.stderr)
            second = run_backup()
            self.assertEqual(second.returncode, 0, second.stderr)
            rotated = _run_docker("exec", name, "test", "!", "-e", old_dump)
            self.assertEqual(rotated.returncode, 0, "an expired dated dump was not rotated")

            current_date = datetime.now(timezone.utc).date().isoformat()
            corrupt_dump = f"/tmp/cognitive-db-backups/cognitive-db-{current_date}-corrupt.dump"
            corrupt = _run_docker(
                "exec",
                name,
                "sh",
                "-c",
                f"head -c 7 {shlex.quote(dumps[0])} > {shlex.quote(corrupt_dump)}",
            )
            self.assertEqual(corrupt.returncode, 0, corrupt.stderr)
            failed = run_backup()
            self.assertNotEqual(failed.returncode, 0)
            self.assertIn("BACKUP FAILED:", failed.stdout + failed.stderr)
        finally:
            _run_docker("rm", "-f", name)


if __name__ == "__main__":
    unittest.main()
