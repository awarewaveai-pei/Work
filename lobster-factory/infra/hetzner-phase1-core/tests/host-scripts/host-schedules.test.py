"""scripts/cron.d/*, cron-run.sh, install-host-schedules.sh and report-host-schedules.py. Needs bash (GNU find). From the
repo root:
    python lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/host-schedules.test.py
SRC=<report-host-schedules.py> tests a mutated copy."""
import glob
import importlib.util
import json
import re
import os
import shutil
import subprocess
import tempfile
import unittest

SCRIPTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "scripts")
SRC = os.environ.get("SRC") or os.path.join(SCRIPTS, "report-host-schedules.py")
spec = importlib.util.spec_from_file_location("rhs", SRC)
rhs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rhs)
BASH = shutil.which("bash")


def bash(args, env=None):
    return subprocess.run([BASH, *args], capture_output=True, text=True, env={**os.environ, **(env or {})})


class CronFiles(unittest.TestCase):
    """A malformed line in these files = a backup that silently stops running."""

    def test_every_line_runs_through_cron_run_with_a_unique_key(self):
        keys = []
        for path in sorted(glob.glob(os.path.join(SCRIPTS, "cron.d", "*"))):
            name = os.path.basename(path)
            self.assertNotIn(".", name, f"cron ignores {name}: a dot in the name")
            text = open(path, encoding="utf-8").read()
            self.assertIn("SHELL=/bin/bash", text, name)
            lines = rhs.parse_cron(text, path, True)
            self.assertTrue(lines, name)
            for l in lines:
                self.assertEqual(l["user"], "root", l)
                m = rhs.WRAPPED.search(l["command"])
                self.assertIsNotNone(m, f"{name}: not through cron-run.sh: {l['command']}")
                self.assertNotIn("%", l["command"], f"{name}: cron turns % into a newline")
                keys.append(m.group(1))
        self.assertEqual(len(keys), len(set(keys)), f"duplicate keys: {sorted(keys)}")


class Reporter(unittest.TestCase):
    def test_parse_keeps_spacing_and_skips_env_and_comments(self):
        got = rhs.parse_cron("# c\nPATH=/x\nA = b\n0 2 * * * root echo  'a  b'\n@daily root true\n", "f", True)
        self.assertEqual([(g["schedule"], g["command"]) for g in got], [("0 2 * * *", "echo  'a  b'"), ("@daily", "true")])
        got = rhs.parse_cron("*/5 * * * * curl -s x\n", "crontab:root", False)
        self.assertEqual(got[0]["command"], "curl -s x")

    def test_wrapped_line_carries_key_log_and_record(self):
        rec = {"k": {"started_at": "a", "finished_at": "b", "exit_code": 0}}
        e = rhs.entry_for({"source": "s", "schedule": "0 2 * * *",
                           "command": "/r/cron-run.sh k '/x.sh >> /var/log/x.log 2>&1'"}, rec)
        self.assertEqual((e["key"], e["log"], e["last"], e["records_result"]), ("k", "/var/log/x.log", rec["k"], True))
        self.assertNotIn("command", e)

    def test_unwrapped_line_is_unregistered_with_secrets_redacted(self):
        e = rhs.entry_for({"source": "s", "schedule": "* * * * *",
                           "command": "API_TOKEN=abc DB_PASSWORD_FILE=/p /x.sh"}, {})
        self.assertIsNone(e["key"])
        self.assertEqual(e["command"], "API_TOKEN=*** DB_PASSWORD_FILE=/p /x.sh")

    def test_secrets_outside_assignments_are_redacted(self):
        cmd = ("curl -H 'Authorization: Bearer s3cr3t' -u bob:pw1 https://u:pw2@h/x?token=t0k&a=1 "
               "--password pw3 >> /var/log/x.log")
        out = rhs.redact(cmd)
        for secret in ("s3cr3t", "bob:pw1", "u:pw2", "t0k", "pw3"):
            self.assertNotIn(secret, out)
        self.assertIn("&a=1", out)

    def test_run_parts_names_follow_run_parts_rules(self):
        self.assertTrue(rhs.RUN_PARTS_NAME.match("netdata-updater"))
        for name in ("backup.disabled", ".hidden", "x~"):
            self.assertIsNone(rhs.RUN_PARTS_NAME.match(name), name)


@unittest.skipUnless(BASH, "bash not found")
class CronRun(unittest.TestCase):
    def test_keeps_exit_code_and_records_it(self):
        d = tempfile.mkdtemp()
        r = bash([os.path.join(SCRIPTS, "cron-run.sh"), "job_a", "echo out; exit 3"], {"CRON_RUN_JOBS_DIR": d})
        self.assertEqual((r.returncode, r.stdout), (3, "out\n"))
        rec = json.load(open(os.path.join(d, "job_a.json")))
        self.assertEqual((rec["key"], rec["exit_code"]), ("job_a", 3))
        self.assertTrue(rec["finished_at"].endswith("Z"))

    def test_bad_key_refused(self):
        r = bash([os.path.join(SCRIPTS, "cron-run.sh"), "Bad-Key", "true"], {"CRON_RUN_JOBS_DIR": tempfile.mkdtemp()})
        self.assertEqual(r.returncode, 64)


@unittest.skipUnless(BASH, "bash not found")
class Installer(unittest.TestCase):
    """The installer empties root's crontab: it must refuse when that would lose a job, and must be undoable."""

    def setUp(self):
        self.t = tempfile.mkdtemp()
        self.sd = os.path.join(self.t, "scripts")
        shutil.copytree(SCRIPTS, self.sd, ignore=shutil.ignore_patterns("__pycache__"))
        self.dest = os.path.join(self.t, "etc")
        os.makedirs(self.dest)
        with open(os.path.join(self.dest, "lobster-backup"), "w") as f:
            f.write("0 2 * * * root /old.sh\n")
        self.ct = os.path.join(self.t, "crontab.txt")
        bindir = os.path.join(self.t, "bin")
        os.makedirs(bindir)
        stub = os.path.join(bindir, "crontab")
        with open(stub, "w", newline="\n") as f:  # crontab -l / -r / <file>, backed by $CT
            f.write('#!/bin/bash\ncase "$1" in -l) [ -s "$CT" ] && cat "$CT" || exit 1;; -r) : > "$CT";; *) cp "$1" "$CT";; esac\n')
        os.chmod(stub, 0o755)
        # Every script the cron lines run, as an empty file under CRON_SCRIPT_ROOT (the installer checks they exist).
        self.root = os.path.join(self.t, "root")
        for path in glob.glob(os.path.join(SCRIPTS, "cron.d", "*")):
            for cmd in re.findall(r"cron-run\.sh [a-z0-9_]+ '(.*)'\s*$", open(path, encoding="utf-8").read(), re.M):
                exe = next((t for t in cmd.split() if "=" not in t and t not in ("bash", "sh", "python3")), "")
                if exe.startswith("/"):
                    os.makedirs(os.path.dirname(self.root + exe), exist_ok=True)
                    open(self.root + exe, "w").close()
        self.env = {"CRON_D_DIR": self.dest, "CRON_BACKUP_ROOT": os.path.join(self.t, "bk"), "CRON_SCRIPT_ROOT": self.root,
                    "CRON_RUN_JOBS_DIR": os.path.join(self.t, "jobs"), "CT": self.ct,
                    "PATH": bindir + os.pathsep + os.environ["PATH"]}

    def run_inst(self, *args):
        return bash([os.path.join(self.sd, "install-host-schedules.sh"), *args], self.env)

    def test_refuses_when_a_root_crontab_job_would_be_lost(self):
        open(self.ct, "w").write("*/15 * * * * /root/lobster-phase1/scripts/reconcile-videos.sh\n0 1 * * * /not/moved.sh\n")
        r = self.run_inst()
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertIn("/not/moved.sh", r.stdout)
        self.assertEqual(open(os.path.join(self.dest, "lobster-backup")).read(), "0 2 * * * root /old.sh\n")
        self.assertIn("/not/moved.sh", open(self.ct).read())

    def test_refuses_a_root_crontab_variable_line(self):
        open(self.ct, "w").write("CRON_TZ=Asia/Taipei\n")
        r = self.run_inst()
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertIn("CRON_TZ", r.stdout)
        self.assertIn("CRON_TZ", open(self.ct).read())

    def test_refuses_a_line_whose_script_is_not_on_the_host(self):
        open(self.ct, "w").write("")
        os.remove(self.root + "/root/lobster-phase1/scripts/docker-weekly-cleanup.sh")
        chk = self.run_inst("--check")
        self.assertEqual(chk.returncode, 1, chk.stdout + chk.stderr)
        self.assertIn("MISSING script", chk.stdout)
        self.assertIn("docker-weekly-cleanup.sh", chk.stdout)
        r = self.run_inst()
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertEqual(open(os.path.join(self.dest, "lobster-backup")).read(), "0 2 * * * root /old.sh\n")
        self.assertFalse(os.path.exists(os.path.join(self.dest, "awarewave-schedules")))

    def test_install_then_rollback(self):
        root = "*/15 * * * * /root/lobster-phase1/scripts/reconcile-videos.sh\n"
        open(self.ct, "w").write(root)
        r = self.run_inst()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        for path in glob.glob(os.path.join(self.sd, "cron.d", "*")):
            self.assertEqual(open(os.path.join(self.dest, os.path.basename(path))).read(), open(path).read())
        self.assertEqual(open(self.ct).read(), "")
        self.assertEqual(self.run_inst("--check").returncode, 0)
        bk = re.search(r"--rollback (\S+?)\)?$", r.stdout, re.M).group(1)
        self.assertEqual(self.run_inst("--rollback", bk).returncode, 0)
        self.assertEqual(open(os.path.join(self.dest, "lobster-backup")).read(), "0 2 * * * root /old.sh\n")
        self.assertFalse(os.path.exists(os.path.join(self.dest, "awarewave-schedules")))
        self.assertEqual(open(self.ct).read(), root)

    def test_a_file_removed_from_the_repo_is_removed_from_the_host(self):
        open(self.ct, "w").write("")
        self.assertEqual(self.run_inst().returncode, 0)
        os.remove(os.path.join(self.sd, "cron.d", "hci-postgres-backup"))
        chk = self.run_inst("--check")
        self.assertEqual(chk.returncode, 1)
        self.assertIn("retired", chk.stdout)
        r = self.run_inst()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertFalse(os.path.exists(os.path.join(self.dest, "hci-postgres-backup")))
        bk = re.search(r"--rollback (\S+?)\)?$", r.stdout, re.M).group(1)
        self.assertEqual(self.run_inst("--rollback", bk).returncode, 0)
        self.assertTrue(os.path.exists(os.path.join(self.dest, "hci-postgres-backup")))


if __name__ == "__main__":
    unittest.main()
