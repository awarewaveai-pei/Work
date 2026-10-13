"""Two go-live guards that decide whether a secret leaks or production data is overwritten, run as the real bash they guard
(no Docker, no PostgreSQL: `docker` and compose are stubs):
- deploy/lib-db.sh: a migration (and a rollback's dump restore) only starts once the API and web are PROVEN stopped;
- ops/cognitive-db/install-cognitive-db.sh: the file that will hold the database URL must already be mode 600.
And the proxy in front of the API outwaits its AI timeout (reads lobster-factory's nginx: checkout-only)."""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from ai_lego import REPO_ROOT
from ai_lego.platform.ai_gateway.provider import DEFAULT_TIMEOUT_SECONDS

COS = Path(__file__).resolve().parents[2]
LIB = COS / "deploy" / "lib-db.sh"
INSTALLER = COS / "ops" / "cognitive-db" / "install-cognitive-db.sh"


def _bash() -> str:
    git_bash = Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "Git" / "bin" / "bash.exe"
    found = str(git_bash) if git_bash.is_file() else shutil.which("bash")
    if found is None:
        raise unittest.SkipTest("LOUD SKIP: bash is not on PATH")
    return found


def _posix(path: Path) -> str:
    resolved = path.resolve().as_posix()
    return f"/{resolved[0].lower()}{resolved[2:]}" if os.name == "nt" else resolved


def _run(script: Path, *args: str, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run([_bash(), _posix(script), *args], capture_output=True, text=True, encoding="utf-8", errors="replace",
                          env={**os.environ, **(env or {})}, timeout=120)


class MigrationWaitsForProvenStopTests(unittest.TestCase):
    # compose_app is a stub: `stop` returns STOP_RC, `ps -q` prints PS_OUT (the containers still running). The first
    # `migrate_db --check` says "behind"; after the migration ran it says "at head".
    DRIVER = """
set -uo pipefail
log() { :; }
notify() { echo "NOTIFY: $*"; }
PRODUCT_ROOT="@PRODUCT@"; COMPOSE_FILE=unused; SERVICES=(api web); LOG=/dev/null
source "@LIB@"
DB_CONTAINER=db1; PRE_DEPLOY_DUMP=/dump; MIGRATION_RAN=0
compose_app() { case "$1" in stop) return @STOP_RC@;; ps) printf '%s' "@PS_OUT@";; esac; }
db_migrate_run() { if [ "${1:-}" = --check ]; then return $((1 - MIGRATION_RAN)); fi; MIGRATION_RAN=1; }
db_backup() { echo DUMP-TAKEN; }
@SCENARIO@
"""

    def drive(self, *, stop_rc: int, ps_out: str, scenario: str) -> str:
        with tempfile.TemporaryDirectory() as folder:
            script = Path(folder) / "driver.sh"
            body = (self.DRIVER.replace("@PRODUCT@", _posix(COS)).replace("@LIB@", _posix(LIB)).replace("@STOP_RC@", str(stop_rc))
                    .replace("@PS_OUT@", ps_out).replace("@SCENARIO@", scenario))
            script.write_text(body, encoding="utf-8", newline="\n")
            result = _run(script)
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout

    def test_no_dump_and_no_migration_while_a_service_may_still_be_writing(self):
        # the stop failed and a container is still up: refuse, touch nothing
        out = self.drive(stop_rc=1, ps_out="abc123\n", scenario='db_prepare; echo "rc=$? quiesced=$QUIESCED ran=$MIGRATION_RAN"')
        self.assertIn("rc=1 quiesced=1 ran=0", out)
        self.assertNotIn("DUMP-TAKEN", out)
        # a stop that fails with every container already gone is proven by `ps`, so the work goes ahead
        out = self.drive(stop_rc=1, ps_out="", scenario='db_prepare; echo "rc=$? ran=$MIGRATION_RAN"')
        self.assertIn("DUMP-TAKEN", out)
        self.assertIn("rc=0 ran=1", out)
        # the rollback restores the dump only over stopped writers
        scenario = ('MIGRATED=1; QUIESCED=1; COGNITIVE_DB_CONTAINER=x; '
                    'bash() { echo "RESTORE-RAN $*"; }; rollback_all "health"; echo "rc=$?"')
        out = self.drive(stop_rc=1, ps_out="abc123\n", scenario=scenario)
        self.assertIn("rc=1", out)
        self.assertNotIn("RESTORE-RAN", out)


class InstallerRefusesALooseEnvFileTests(unittest.TestCase):
    SHIM = """#!/usr/bin/env bash
case "$1 $2" in
  "compose version") exit 0 ;;
  "network inspect") exit 0 ;;
  "volume inspect") exit 1 ;;
  "image inspect") exit 0 ;;
  "run --rm") echo 0007; exit 0 ;;
esac
if [ "$1" = compose ]; then
  case " $* " in *" ps "*) exit 0 ;; *" config "*) exit 0 ;; esac
fi
exit 0
"""

    def install(self, env_mode: str) -> subprocess.CompletedProcess[str]:
        if os.name == "nt":
            raise unittest.SkipTest("LOUD SKIP: Git Bash on Windows reports file modes from the umask, not the file; run this on Linux")
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "bin").mkdir()
            shim = root / "bin" / "docker"
            shim.write_text(self.SHIM, encoding="utf-8", newline="\n")
            shim.chmod(0o755)
            password = root / "password"
            password.write_text("a" * 32 + "\n", encoding="utf-8")
            password.chmod(0o600)
            (root / "deploy").mkdir()
            env_file = root / "deploy" / ".env"
            env_file.write_text("COGNITIVE_OS_ANTHROPIC_API_KEY=\n", encoding="utf-8")
            env_file.chmod(int(env_mode, 8))
            return _run(INSTALLER, "--dry-run", "--region", "eu", env={
                "PATH": f"{root / 'bin'}{os.pathsep}{os.environ['PATH']}", "COGNITIVE_DB_PASSWORD_FILE": str(password),
                "COGNITIVE_DB_ENGINE_ENV_FILE": str(env_file), "COGNITIVE_DB_BACKUP_DIR": str(root / "backups")})

    def test_a_0644_env_file_is_refused_before_anything_is_written_and_a_0600_one_passes(self):
        loose = self.install("644")
        self.assertEqual(loose.returncode, 2, loose.stdout + loose.stderr)
        self.assertIn("not mode 600", loose.stdout)
        tight = self.install("600")
        self.assertEqual(tight.returncode, 0, tight.stdout + tight.stderr)
        self.assertIn("DRY RUN OK", tight.stdout)


if __name__ == "__main__":
    unittest.main()


class ProxyTimeoutTests(unittest.TestCase):
    def test_the_page_gets_the_apis_answer_before_a_proxy_gives_up(self):
        """2026-10-13: the AI timeout and nginx's were both 60 s, so a turn ending near 60 s reached the page as nginx's 504.
        The API answers inside nginx's limit; nginx waits less than Cloudflare's 100 s."""
        conf = (REPO_ROOT / "lobster-factory/infra/hetzner-phase1-core/nginx/default.conf").read_text(encoding="utf-8")
        server = re.search(r"server_name cognitive\.aware-wave\.com;(.*?)\n}", conf, re.S)
        self.assertIsNotNone(server, "default.conf: the cognitive server block is not found")
        for setting in ("proxy_read_timeout", "proxy_send_timeout"):
            [seconds] = [int(value) for value in re.findall(setting + r" (\d+)s;", server.group(1))]
            self.assertTrue(DEFAULT_TIMEOUT_SECONDS + 5 <= seconds < 100, f"{setting} {seconds}s vs the AI timeout {DEFAULT_TIMEOUT_SECONDS}s")
