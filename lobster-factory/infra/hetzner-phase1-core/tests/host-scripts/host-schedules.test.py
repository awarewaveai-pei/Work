"""scripts/cron.d/*, cron-run.sh, install-host-schedules.sh and report-host-schedules.py. Needs bash (GNU find). From the
repo root:
    python lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/host-schedules.test.py
SRC=<report-host-schedules.py> tests a mutated copy."""
import glob
import importlib.util
import io
import json
import re
import os
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

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


class External(unittest.TestCase):
    """Clocks off this host's cron (C5): every one becomes an entry the page can judge, with its last outcome."""

    @staticmethod
    def gha_run(at, conclusion="success", **extra):
        return {"event": "schedule", "head_branch": "main", "status": "completed", "conclusion": conclusion,
                "created_at": at, "updated_at": at, **extra}

    def test_pg_cron_rows(self):
        got = rhs.pg_cron_entries("archive-stale-repair-runs\t0 2 * * *\tfailed\t2026-10-24T02:00:13Z\nnew job\t*/5 * * * *\t\t\n")
        self.assertEqual([(e["key"], e["name"], e["schedule"]) for e in got],
                         [("pg_cron_archive_stale_repair_runs", "archive-stale-repair-runs", "0 2 * * *"),
                          ("pg_cron_new_job", "new job", "*/5 * * * *")])
        self.assertEqual(got[0]["last"]["exit_code"], 1)
        self.assertIsNone(got[1]["last"])  # never finished = no record, not "ok"

    def test_n8n_rows(self):
        got = rhs.n8n_entries("Abc12\tdaily ping\tsuccess\t2026-10-25T01:00:00Z\nXy\tbroken\terror\t2026-10-25T01:00:00Z\n")
        self.assertEqual([(e["key"], e["last"]["exit_code"]) for e in got], [("n8n_Abc12", 0), ("n8n_Xy", 1)])
        self.assertEqual(rhs.n8n_entries(""), [])

    def test_repo_report(self):
        e = rhs.repo_report_entry("cloud_weekly_review", "a/b.md", "@weekly", 9, 1_700_000_000)
        self.assertEqual((e["stale_after_s"], e["last"]["finished_at"], e["last"]["exit_code"]), (9 * 86400, "2023-11-14T22:13:20Z", 0))
        self.assertIsNone(rhs.repo_report_entry("k", "p", "@daily", 3, None)["last"])

    def test_build_lists_external_entries(self):
        ext = rhs.pg_cron_entries("j\t0 2 * * *\tsucceeded\t2026-10-25T02:00:00Z\n")
        doc = rhs.build([], [], [], {}, [], [], [], 0, ext)
        self.assertEqual([e["key"] for e in doc["entries"]], ["pg_cron_j"])

    def test_github_workflow_and_run(self):
        self.assertIsNone(rhs.gha_workflow("ci.yml", "\n".join(["name: CI", "on: push"])))
        w = rhs.gha_workflow("host-liveness-probe.yml",
                             "\n".join(["name: Host liveness probe", "on:", "  schedule:", '    - cron: "*/5 * * * *"']))
        self.assertEqual(w, ("host-liveness-probe.yml", "Host liveness probe", "*/5 * * * *"))
        e = rhs.gha_entry(*w, {"workflow_runs": [self.gha_run("2026-10-25T14:00:00Z", "failure", html_url="u")]})
        self.assertEqual((e["key"], e["source"], e["last"]["exit_code"], e["stale_after_s"]), ("gha_host_liveness_probe", "github:host-liveness-probe.yml", 1, 7200))
        runs = {"workflow_runs": [self.gha_run("2026-10-25T14:05:00Z", "cancelled"),
                                  self.gha_run("2026-10-25T14:00:00Z")]}
        self.assertEqual(rhs.gha_entry(*w, runs)["last"]["exit_code"], 0)  # a superseded run says nothing
        weekly = rhs.gha_entry("a.yml", "A", "30 1 * * 1", {"workflow_runs": []})
        self.assertIsNone(weekly["last"])
        self.assertNotIn("stale_after_s", weekly)

    def test_manual_result_does_not_refresh_scheduled_clock(self):
        runs = [self.gha_run("2026-10-26T01:00:00Z", "failure"), self.gha_run("2026-10-25T20:00:00Z"),
                self.gha_run("2026-10-26T09:11:00Z", event="workflow_dispatch", html_url="manual")]
        e = rhs.gha_entry("probe.yml", "Probe", "*/5 * * * *", {"workflow_runs": runs})
        self.assertEqual((e["last"]["exit_code"], e["last"]["finished_at"], e["log"]),
                         (0, "2026-10-26T09:11:00Z", "manual"))
        self.assertEqual((e["latest_scheduled_at"], e["previous_scheduled_at"]),
                         ("2026-10-26T01:00:00Z", "2026-10-25T20:00:00Z"))

    def test_only_latest_completed_operational_main_run_replaces_result(self):
        older = self.gha_run("2026-10-25T01:00:00Z", updated_at="2026-10-27T01:00:00Z")
        latest = self.gha_run("2026-10-26T01:00:00Z", "failure")
        ignored = [self.gha_run("2026-10-28T01:00:00Z", **fields) for fields in (
            {"event": "push"}, {"event": "pull_request"}, {"head_branch": "fix"},
            {"status": "in_progress", "conclusion": None}, {"conclusion": "cancelled"}, {"conclusion": "skipped"})]
        e = rhs.gha_entry("a.yml", "A", "30 1 * * 1", {"workflow_runs": [older, *ignored, latest]})
        self.assertEqual(e["last"], rhs.done("2026-10-26T01:00:00Z", False))

    def test_rerun_does_not_refresh_scheduled_clock(self):
        runs = [self.gha_run("2026-10-26T01:00:00Z", updated_at="2026-10-26T09:00:00Z"),
                self.gha_run("2026-10-26T05:00:00Z", updated_at="2026-10-26T09:01:00Z")]
        e = rhs.gha_entry("probe.yml", "Probe", "*/5 * * * *", {"workflow_runs": runs})
        self.assertEqual((e["latest_scheduled_at"], e["previous_scheduled_at"]),
                         ("2026-10-26T05:00:00Z", "2026-10-26T01:00:00Z"))
        self.assertEqual(e["last"]["finished_at"], "2026-10-26T09:01:00Z")

    def test_github_queries_events_separately_and_pages_past_cancelled_runs(self):
        requested = []

        def fetch(req, timeout):
            q = parse_qs(urlparse(req.full_url).query)
            requested.append(q)
            self.assertEqual((q["branch"], q["status"], q["per_page"]), (["main"], ["completed"], ["100"]))
            if q["event"] == ["workflow_dispatch"]:
                runs = [self.gha_run("2026-10-26T09:00:00Z", event="workflow_dispatch")]
            elif q["page"] == ["1"]:
                runs = [self.gha_run("2026-10-27T01:00:00Z", "cancelled")] * 100
            else:
                runs = [self.gha_run("2026-10-26T01:00:00Z", "failure"), self.gha_run("2026-10-25T01:00:00Z")]
            return io.BytesIO(json.dumps({"workflow_runs": runs}).encode())

        with patch.object(rhs.urllib.request, "urlopen", side_effect=fetch):
            result = rhs.collect_gha_runs("a.yml")
        self.assertEqual([(q["event"][0], q["page"][0]) for q in requested],
                         [("schedule", "1"), ("schedule", "2"), ("workflow_dispatch", "1")])
        self.assertEqual(len(result["workflow_runs"]), 3)

    def test_github_search_limit_is_unknown_instead_of_missing(self):
        batch = {"workflow_runs": [self.gha_run("2026-10-27T01:00:00Z", "cancelled")] * 100}
        with patch.object(rhs.urllib.request, "urlopen", side_effect=lambda *a, **k: io.BytesIO(json.dumps(batch).encode())):
            with self.assertRaisesRegex(ValueError, "1,000-run search limit"):
                rhs.collect_gha_runs("a.yml")

    def test_external_errors_kept_apart(self):
        doc = rhs.build([], [], [], {}, [], [], [], 0, [], ["n8n: down"])
        self.assertEqual((doc["errors"], doc["external_errors"]), ([], ["n8n: down"]))


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

    def test_watchdog_can_call_a_nonexecutable_sender(self):
        with tempfile.TemporaryDirectory() as temp:
            sender, message, delivered = [os.path.join(temp, name) for name in ("notify.sh", "message", "delivered")]
            with open(sender, "w") as f:
                f.write('#!/bin/bash\ncat > "$DELIVERED"\n')
            os.chmod(sender, 0o644)
            with open(message, "w") as f:
                f.write("watchdog test\n")
            watchdog = os.path.join(SCRIPTS, "../../../../scripts/routine-output-watchdog.sh")
            with open(watchdog, encoding="utf-8") as f:
                command = next(line for line in f if '"${NOTIFY_SH:-' in line)
            result = bash(["-c", 'sent_ok=0\n' + command + '\ntest "$sent_ok" = 1'],
                          {"NOTIFY_SH": sender, "MSGFILE": message, "DELIVERED": delivered})
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            with open(delivered) as f:
                self.assertEqual(f.read(), "watchdog test\n")


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
                    os.chmod(self.root + exe, 0o755)
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

    def test_refuses_a_direct_script_without_execute_permission(self):
        open(self.ct, "w").write("")
        target = self.root + "/root/lobster-phase1/scripts/docker-weekly-cleanup.sh"
        os.chmod(target, 0o644)
        chk = self.run_inst("--check")
        self.assertEqual(chk.returncode, 1, chk.stdout + chk.stderr)
        self.assertIn("NOT EXECUTABLE", chk.stdout)
        result = self.run_inst()
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertFalse(os.path.exists(os.path.join(self.dest, "awarewave-schedules")))

    def test_interpreter_can_run_a_readable_nonexecutable_script(self):
        open(self.ct, "w").write("")
        os.chmod(self.root + "/root/Work/scripts/routine-output-watchdog.sh", 0o644)
        result = self.run_inst()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_watchdog_cron_uses_an_interpreter_for_the_git_checkout_script(self):
        path = os.path.join(SCRIPTS, "cron.d", "awarewave-schedules")
        self.assertIn("LC_ALL=C.UTF-8 bash /root/Work/scripts/routine-output-watchdog.sh", open(path).read())

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
