"""systems-import.py against throwaway git repos (origin + bare mirror). From the repo root:
    python lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/systems-import.test.py
SRC=<file> tests a mutated copy of the importer."""
import importlib.util
import io
import json
import os
import subprocess
import tempfile
import threading
import unittest
from contextlib import redirect_stderr, redirect_stdout
from http.server import BaseHTTPRequestHandler, HTTPServer

SRC = os.environ.get("SRC") or os.path.join(os.path.dirname(__file__), "..", "..", "scripts", "systems-import.py")
spec = importlib.util.spec_from_file_location("systems_import", SRC)
si = importlib.util.module_from_spec(spec)
spec.loader.exec_module(si)

REGISTRY = {
    "version": 1,
    "shared_paths": ["agency-os/systems/", "apps/b/package.json"],
    "ignore_paths": ["agency-os/WORKLOG.md"],
    "systems": [
        {"id": "00000000-0000-4000-8000-00000000000a", "slug": "alpha", "name": "甲", "aliases": [], "type": "product",
         "purpose": "x", "product_key": None, "source_paths": ["apps/"],
         "phases": [{"id": "00000000-0000-4000-8000-0000000000a1", "slug": "p1", "name": "一", "legacy_source_path": None}],
         "features": [{"id": "00000000-0000-4000-8000-0000000000a2", "slug": "send-mail", "name": "寄信", "phase": "p1"}]},
        {"id": "00000000-0000-4000-8000-00000000000b", "slug": "beta", "name": "乙", "aliases": ["Bee"], "type": "internal",
         "purpose": "y", "product_key": None, "source_paths": ["apps/b/"], "phases": [], "features": []},
    ],
}


class Repo:
    def __init__(self, root):
        self.root = root
        self.origin = os.path.join(root, "origin")
        self.mirror = os.path.join(root, "mirror.git")
        self.state = os.path.join(root, "state", "head")
        gcfg = os.path.join(root, "gitconfig")
        with open(gcfg, "w") as f:  # isolate from the machine's hooks, signing and identity
            f.write("[user]\n\tname = t\n\temail = t@example.invalid\n[commit]\n\tgpgsign = false\n"
                    "[core]\n\thooksPath = /nonexistent\n\tautocrlf = false\n[init]\n\tdefaultBranch = main\n")
        self.env = dict(os.environ, GIT_CONFIG_GLOBAL=gcfg, GIT_CONFIG_NOSYSTEM="1")
        os.environ.update(GIT_CONFIG_GLOBAL=gcfg, GIT_CONFIG_NOSYSTEM="1")  # the importer's own git calls
        self.git("init", "-q", self.origin, cwd=root)
        self.commit({"agency-os/systems/registry.json": json.dumps(REGISTRY)}, "registry")
        self.git("clone", "-q", "--mirror", self.origin, self.mirror, cwd=root)

    def git(self, *args, cwd=None):
        return subprocess.run(["git", *args], cwd=cwd or self.origin, env=self.env, check=True,
                              capture_output=True, text=True).stdout.strip()

    def commit(self, files, message):
        for path, text in files.items():
            p = os.path.join(self.origin, path)
            os.makedirs(os.path.dirname(p), exist_ok=True)
            with open(p, "w", encoding="utf-8", newline="\n") as f:
                f.write(text)
            self.git("add", path)
        self.git("commit", "-q", "-m", message)
        return self.git("rev-parse", "HEAD")


def events(bodies):
    return [e for b in bodies for e in b["events"] if e["event_type"] != "import_run"]


class Server:
    """Stands in for the ingest route: records each body, answers 200."""

    def __init__(self):
        self.bodies = []
        outer = self

        class H(BaseHTTPRequestHandler):
            def do_POST(self):
                outer.bodies.append(json.loads(self.rfile.read(int(self.headers["Content-Length"]))))
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'{"inserted":1,"skipped":0}')

            def log_message(self, *a):
                pass

        self.httpd = HTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.url = f"http://127.0.0.1:{self.httpd.server_port}/api/internal/systems/ingest"

    def close(self):
        self.httpd.shutdown()
        self.httpd.server_close()


class SystemsImportTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.saved = dict(os.environ)
        self.r = Repo(self.tmp.name)
        os.environ["SYSTEMS_ENV_FILE"] = os.path.join(self.tmp.name, "no.env")

    def tearDown(self):
        os.environ.clear()
        os.environ.update(self.saved)
        self.tmp.cleanup()

    def build(self):
        return si.build(self.r.mirror, self.r.state, "refs/heads/main", 90)

    def run_main(self, *extra):
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            rc = si.main(["--mirror", self.r.mirror, "--state", self.r.state, *extra])
        return rc, out.getvalue() + err.getvalue()

    def test_longest_prefix_shared_and_ignore(self):
        self.r.commit({"apps/x.ts": "1", "apps/b/y.ts": "1", "apps/b/package.json": "{}",
                       "agency-os/WORKLOG.md": "w", "other/z.ts": "1"}, "touch everything")
        bodies, _, _ = self.build()
        act = {e["system_slug"]: e["payload"] for e in events(bodies) if e["event_type"] == "activity"}
        self.assertEqual(act, {"alpha": {"subject": "touch everything", "files": 1},
                               "beta": {"subject": "touch everything", "files": 1}})
        self.assertEqual(bodies[-1]["events"][-1]["payload"]["gaps"]["unowned_paths"], ["other/z.ts"])

    def test_trailers_several_systems_and_unknown_slugs(self):
        sha = self.r.commit({"docs/n.md": "1"}, "plan\n\nSystem: alpha\nSystem: Bee\nSystem: nope\nPhase: p1\n"
                            "Next: write the route\nFeature: send-mail=verified\nFeature: ghost=todo\nTest: t1")
        evs = [e for e in events(self.build()[0]) if e["commit_sha"] == sha]
        got = [(e["event_type"], e["system_slug"], e["phase_slug"], e["feature_slug"]) for e in evs]
        self.assertEqual(got, [("handoff", "alpha", "p1", None), ("handoff", "beta", None, None),
                               ("handoff", None, None, None), ("feature_update", "alpha", "p1", "send-mail"),
                               ("feature_update", None, None, None)])
        self.assertEqual(evs[0]["payload"], {"subject": "plan", "next": "write the route"})
        self.assertEqual(evs[2]["payload"]["unclassified"], "unknown system: nope")
        self.assertEqual(evs[3]["payload"], {"status": "implemented", "test": "t1"})  # a commit cannot claim verified
        self.assertEqual(evs[4]["payload"]["unclassified"], "unknown feature: ghost")

    def test_revert(self):
        bad = self.r.commit({"apps/x.ts": "1"}, "bad change")
        self.r.git("revert", "--no-edit", "HEAD")
        rev = [e for e in events(self.build()[0]) if e["event_type"] == "revert"]
        self.assertEqual([(e["system_slug"], e["payload"]) for e in rev], [("alpha", {"reverted_sha": bad})])

    def test_rerun_same_range_same_event_keys(self):
        self.r.commit({"apps/x.ts": "1"}, "one\n\nNext: two")
        self.r.commit({"apps/b/y.ts": "1"}, "three")
        keyed = lambda: {e["event_key"]: (e["event_type"], e["system_slug"]) for e in events(self.build()[0])}
        first = keyed()
        self.assertTrue(first)
        self.assertEqual(first, keyed())
        # a system added ahead of alpha between two runs over the same commits must not move keys onto other events
        reg = dict(REGISTRY, systems=REGISTRY["systems"] + [dict(REGISTRY["systems"][1], id="00000000-0000-4000-8000-00000000000c",
                   slug="aardvark", aliases=[], source_paths=["apps/x.ts"])])
        self.r.commit({"agency-os/systems/registry.json": json.dumps(reg)}, "add aardvark")
        again = keyed()
        self.assertEqual({k: again[k] for k in first if k in again}, {k: first[k] for k in first if k in again})

    def test_history_diverged_sends_no_events_and_keeps_state(self):
        os.environ.update(SYSTEMS_IMPORT_ENABLED="true", SYSTEMS_INGEST_TOKEN="tok")
        srv = Server()
        os.environ["SYSTEMS_INGEST_URL"] = srv.url
        try:
            self.r.commit({"apps/x.ts": "1"}, "first")
            self.assertEqual(self.run_main()[0], 0)
            with open(self.r.state) as f:
                kept = f.read().strip()
            self.r.git("reset", "-q", "--hard", "HEAD~1")  # a force push upstream
            self.r.commit({"apps/x.ts": "2"}, "rewritten")
            rc, out = self.run_main()
            self.assertEqual(rc, 1, out)
            last = srv.bodies[-1]
            run = last["events"][-1]["payload"]
            self.assertEqual(run["status"], "history_diverged")
            self.assertIn("1 orphaned", run["error"])
            self.assertEqual([e["event_type"] for e in last["events"]], ["import_run"])
            with open(self.r.state) as f:
                self.assertEqual(f.read().strip(), kept)
        finally:
            srv.close()

    def test_disabled_does_nothing(self):
        os.environ.update(SYSTEMS_IMPORT_ENABLED="false", SYSTEMS_INGEST_TOKEN="tok")
        srv = Server()
        os.environ["SYSTEMS_INGEST_URL"] = srv.url
        try:
            before = self.r.git("rev-parse", "refs/heads/main", cwd=self.r.mirror)
            self.r.commit({"apps/x.ts": "1"}, "new")
            rc, out = self.run_main()
            self.assertEqual((rc, srv.bodies), (0, []))
            self.assertIn("not true", out)
            self.assertFalse(os.path.exists(self.r.state))
            self.assertEqual(self.r.git("rev-parse", "refs/heads/main", cwd=self.r.mirror), before)  # not fetched
        finally:
            srv.close()


if __name__ == "__main__":
    unittest.main()
