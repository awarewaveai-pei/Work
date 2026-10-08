"""Source-level gates for the unapplied cognitive-db deployment files."""

from __future__ import annotations

from datetime import datetime, timezone
import os
from pathlib import Path
import secrets
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
RESTORE_SCRIPT = OPS / "restore-cognitive-db.sh"
REPO = COS.parents[2]


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


def _bash_path(path: Path) -> str:
    resolved = path.resolve().as_posix()
    if os.name == "nt":
        return f"/{resolved[0].lower()}{resolved[2:]}"
    return resolved


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
        self.assertIn("COGNITIVE_DB_PASSWORD_FILE:?", self.compose_text)
        self.assertNotIn("POSTGRES_PASSWORD", environment)
        folder_text = "\n".join(path.read_text(encoding="utf-8") for path in OPS.glob("*") if path.is_file())
        self.assertNotIn("POSTGRES_PASSWORD=", folder_text)
        self.assertNotIn("POSTGRES_PASSWORD:", self.compose_text)
        self.assertIn("cognitive-db-password", (REPO / ".gitignore").read_text(encoding="utf-8"))

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
        self.assertRegex(self.backup_text, r"pg_dump\b[^\n]*-Fc")
        self.assertIn("pg_restore --exit-on-error -f /dev/null", self.backup_text)
        self.assertNotIn("TOC Entries:", self.backup_text)
        self.assertNotIn("MIN_OBJECTS", self.backup_text)
        self.assertIn("quarantined", self.backup_text)
        self.assertIn("BACKUP FAILED:", self.backup_text)
        self.assertIn('tail -n 20 -- "$ERROR_LOG"', self.backup_text)
        self.assertNotRegex(self.backup_text, r"\brm\s+-rf\b")
        self.assertIn('"$BACKUP_DIR"/cognitive-db-????-??-??-*.dump', self.backup_text)
        self.assertIn('rm -f -- "$dump"', self.backup_text)
        self.assertIn("COGNITIVE_DB_BACKUP_DIR", self.backup_text)
        self.assertIn("COGNITIVE_DB_BACKUP_KEEP_DAYS", self.backup_text)

    def test_readme_records_unapplied_state_and_go_live_checks(self) -> None:
        self.assertIn("Nothing in this folder has been applied.", self.readme_text)
        self.assertIn("safe-infra-patch.sh compose", self.readme_text)
        self.assertIn("沒有可執行的套用命令", self.readme_text)
        self.assertIn("docker exec", self.backup_text)
        self.assertIn("/etc/cron.d/ks-stack-backup", self.readme_text)
        for required in ("pg_isready", "EMPTY database", "migration to head", "backup", "restore", "ClaimReview"):
            self.assertIn(required, self.readme_text)
        self.assertRegex(self.readme_text, r"(?i)(?:small|很小).*?(?:GiB|GB|MB)")
        self.assertIn("ClaimReview mirror is NOT in this database.", self.readme_text)
        self.assertIn("throwaway", RESTORE.read_text(encoding="utf-8"))
        self.assertIn("Every container on the external `lobster-net` can reach this service by name.", self.readme_text)
        self.assertIn("dedicated network is an unapplied hardening step", self.readme_text)
        self.assertIn("restore-cognitive-db.sh", self.readme_text)
        self.assertIn("periodic", self.readme_text.lower())

    def test_periodic_restore_script_is_unapplied_and_bash_valid(self) -> None:
        text = RESTORE_SCRIPT.read_text(encoding="utf-8")
        self.assertIn("COGNITIVE_DB_PASSWORD_FILE:?", text)
        self.assertIn("COGNITIVE_DB_DUMP_FILE:?", text)
        self.assertIn("pg_restore", text)
        self.assertIn('--network none', text)
        self.assertNotIn('docker network inspect', text)
        self.assertRegex(text, r'pg_restore\s+-U "\$USER"\s+')
        self.assertIn("docker run", text)
        self.assertNotIn("docker compose up", text)
        git_bash = Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "Git" / "bin" / "bash.exe"
        bash = str(git_bash) if git_bash.is_file() else shutil.which("bash")
        if bash is None:
            self.skipTest("LOUD SKIP: bash is not on PATH; run bash -n on a Unix host")
        result = subprocess.run(
            [bash, "-n", str(RESTORE_SCRIPT).replace("\\", "/")],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_restore_script_runs_the_real_docker_drill_with_a_private_restore_container(self) -> None:
        problem = _docker_problem()
        if problem:
            self.skipTest(f"LOUD SKIP: restore Docker drill did not run because {problem}")
        git_bash = Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "Git" / "bin" / "bash.exe"
        bash = str(git_bash) if git_bash.is_file() else shutil.which("bash")
        if bash is None:
            self.skipTest("LOUD SKIP: host bash is unavailable")

        source_name = f"cos-db-test-restore-source-{secrets.token_hex(4)}"
        restore_name = f"cos-db-test-restore-drill-{secrets.token_hex(4)}"
        password = secrets.token_urlsafe(18)
        source = _run_docker(
            "run", "-d", "--name", source_name,
            "--env", "POSTGRES_PASSWORD=" + password,
            "--env", "POSTGRES_USER=cognitive",
            "--env", "POSTGRES_DB=cognitive_os",
            pg.IMAGE,
        )
        self.assertEqual(source.returncode, 0, source.stderr)
        try:
            ready = False
            for _ in range(90):
                probe = _run_docker("exec", source_name, "pg_isready", "-U", "cognitive", "-d", "cognitive_os")
                if probe.returncode == 0:
                    ready = True
                    break
                time.sleep(1)
            self.assertTrue(ready, "throwaway PostgreSQL did not become ready")
            proof = _run_docker(
                "exec", source_name, "psql", "-U", "cognitive", "-d", "cognitive_os",
                "-c", "CREATE TABLE restore_proof (id integer); INSERT INTO restore_proof VALUES (11);",
            )
            self.assertEqual(proof.returncode, 0, proof.stderr)

            with tempfile.TemporaryDirectory() as temporary:
                temporary_path = Path(temporary)
                dump = temporary_path / "source.dump"
                password_file = temporary_path / "password"
                password_file.write_text(password + "\n", encoding="utf-8")
                dumped = _run_docker(
                    "exec", source_name, "pg_dump", "-U", "cognitive", "-Fc", "-d", "cognitive_os",
                    "-f", "/tmp/source.dump",
                )
                self.assertEqual(dumped.returncode, 0, dumped.stderr)
                copied = _run_docker("cp", f"{source_name}:/tmp/source.dump", str(dump))
                self.assertEqual(copied.returncode, 0, copied.stderr)

                environment = dict(os.environ)
                # Git Bash would rewrite /run/secrets/... into a Windows path; docker.exe
                # needs C:/ style host paths, so hand it those.
                environment["MSYS_NO_PATHCONV"] = "1"
                environment.update(
                    COGNITIVE_DB_PASSWORD_FILE=password_file.resolve().as_posix(),
                    COGNITIVE_DB_DUMP_FILE=dump.resolve().as_posix(),
                    COGNITIVE_DB_RESTORE_CONTAINER=restore_name,
                    COGNITIVE_DB_RESTORE_USER="cognitive",
                    COGNITIVE_DB_RESTORE_DATABASE="cognitive_os",
                    COGNITIVE_DB_RESTORE_TARGET_DATABASE="restore_check",
                )
                result = subprocess.run(
                    [bash, _bash_path(RESTORE_SCRIPT)], cwd=COS, env=environment,
                    capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=180,
                )
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertIn("RESTORE OK:", result.stdout)
                leftover = _run_docker("ps", "-a", "-q", "--filter", f"name={restore_name}")
                self.assertEqual(leftover.stdout.strip(), "", "the restore drill left its container behind")
        finally:
            _run_docker("rm", "-f", source_name)

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

    def test_backup_retention_date_uses_alpine_compatible_epoch_arithmetic(self) -> None:
        self.assertIn('date -u +%s', self.backup_text)
        self.assertIn('cutoff_epoch=$(( now_epoch - (KEEP_DAYS - 1) * 86400 ))', self.backup_text)
        self.assertIn('date -u -d "@$cutoff_epoch" +%F', self.backup_text)
        self.assertNotIn('date -u -d "$today - $KEEP_DAYS days" +%F', self.backup_text)
        self.assertNotIn('date -u -d "-$KEEP_DAYS days" +%F', self.backup_text)

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

    def test_docker_compose_config_requires_password_file_environment(self) -> None:
        problem = _docker_problem()
        if problem:
            self.skipTest(f"LOUD SKIP: docker compose config did not run because {problem}")
        environment = dict(os.environ)
        environment.pop("COGNITIVE_DB_PASSWORD_FILE", None)
        result = subprocess.run(
            ["docker", "compose", "-f", str(COMPOSE), "config", "-q"],
            cwd=OPS,
            env=environment,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("COGNITIVE_DB_PASSWORD_FILE", result.stderr)

    def test_optional_docker_backup_dump_restore_listing_rotation_and_corruption(self) -> None:
        problem = _docker_problem()
        if problem:
            self.skipTest(f"LOUD SKIP: optional Docker backup test did not run because {problem}")
        git_bash = Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "Git" / "bin" / "bash.exe"
        bash = str(git_bash) if git_bash.is_file() else shutil.which("bash")
        if bash is None:
            self.skipTest("LOUD SKIP: host bash is unavailable")

        name = f"cos-db-test-backup-{secrets.token_hex(4)}"
        password = secrets.token_urlsafe(18)
        container = _run_docker(
            "run",
            "-d",
            "--name",
            name,
            "--env",
            "POSTGRES_PASSWORD=" + password,
            "--env",
            "POSTGRES_USER=cognitive",
            "--env",
            "POSTGRES_DB=cognitive_os",
            pg.IMAGE,
        )
        self.assertEqual(container.returncode, 0, container.stderr)
        try:
            ready = False
            for _ in range(90):
                probe = _run_docker("exec", name, "pg_isready", "-U", "cognitive", "-d", "cognitive_os")
                if probe.returncode == 0:
                    ready = True
                    break
                time.sleep(1)
            self.assertTrue(ready, "throwaway PostgreSQL did not become ready")
            proof = _run_docker("exec", name, "psql", "-U", "cognitive", "-d", "cognitive_os", "-c", "CREATE TABLE backup_proof (id integer); INSERT INTO backup_proof VALUES (7);")
            self.assertEqual(proof.returncode, 0, proof.stderr)
            for database in ("a b", "a_b"):
                created = _run_docker("exec", name, "createdb", "-U", "cognitive", database)
                self.assertEqual(created.returncode, 0, created.stderr)

            with tempfile.TemporaryDirectory() as temporary:
                backup_dir = Path(temporary) / "backups"
                environment = dict(os.environ)
                environment.update(
                    COGNITIVE_DB_CONTAINER=name,
                    COGNITIVE_DB_BACKUP_DIR=_bash_path(backup_dir),
                    COGNITIVE_DB_USER="cognitive",
                    COGNITIVE_DB_MAINTENANCE_DB="cognitive_os",
                )

                def run_backup() -> subprocess.CompletedProcess[str]:
                    return subprocess.run(
                        [bash, _bash_path(BACKUP)], cwd=COS, env=environment,
                        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120,
                    )

                first = run_backup()
                self.assertEqual(first.returncode, 0, first.stdout + first.stderr)
                dumps = sorted(backup_dir.glob("cognitive-db-*.dump"))
                self.assertEqual(len(dumps), 4, [path.name for path in dumps])
                for database in ("a b", "a_b"):
                    encoded = database.encode().hex()
                    self.assertEqual(len([path for path in dumps if f"-{encoded}-" in path.name]), 1)
                source_dump = next(path for path in dumps if f"-{b'cognitive_os'.hex()}-" in path.name)
                created = _run_docker("exec", name, "createdb", "-U", "cognitive", "restore_check")
                self.assertEqual(created.returncode, 0, created.stderr)
                copied = _run_docker("cp", str(source_dump), f"{name}:/tmp/restore.dump")
                self.assertEqual(copied.returncode, 0, copied.stderr)
                restored = _run_docker("exec", name, "pg_restore", "-U", "cognitive", "--exit-on-error", "--no-owner", "--dbname=restore_check", "/tmp/restore.dump")
                self.assertEqual(restored.returncode, 0, restored.stderr)
                proof = _run_docker("exec", name, "psql", "-U", "cognitive", "-d", "restore_check", "-At", "-c", "SELECT id FROM backup_proof")
                self.assertEqual(proof.returncode, 0, proof.stderr)
                self.assertEqual(proof.stdout.strip(), "7")

                old_dump = backup_dir / "cognitive-db-2000-01-01-rotation.dump"
                shutil.copy2(source_dump, old_dump)
                second = run_backup()
                self.assertEqual(second.returncode, 0, second.stdout + second.stderr)
                self.assertFalse(old_dump.exists(), "an expired dated dump was not rotated")

                current_date = datetime.now(timezone.utc).date().isoformat()
                corrupt_dump = backup_dir / f"cognitive-db-{current_date}-corrupt.dump"
                before_corrupt = len(list(backup_dir.glob("cognitive-db-*.dump")))
                source_bytes = source_dump.read_bytes()
                corrupt_dump.write_bytes(source_bytes[: max(7, len(source_bytes) // 2)])
                failed = run_backup()
                self.assertNotEqual(failed.returncode, 0)
                self.assertIn("BACKUP FAILED:", failed.stdout + failed.stderr)
                self.assertGreater(len(list(backup_dir.glob("cognitive-db-*.dump"))), before_corrupt)
                self.assertTrue((backup_dir / (corrupt_dump.name + ".corrupt")).is_file())
                self.assertIn("pg_restore", failed.stdout + failed.stderr)
        finally:
            _run_docker("rm", "-f", name)


if __name__ == "__main__":
    unittest.main()
