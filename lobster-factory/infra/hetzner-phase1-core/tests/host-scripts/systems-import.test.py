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
    """Stands in for the ingest route (records each body, answers 200 unless self.refuse(body)) and the pending route
    (answers self.pending; an accepted body with an import_run answers the refresh request, as store.ts does)."""

    def __init__(self):
        self.bodies = []
        self.gets = []
        self.pending = {"refresh": False, "proposals": []}
        self.refuse = lambda body: False
        outer = self

        class H(BaseHTTPRequestHandler):
            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                outer.bodies.append(body)
                if outer.refuse(body):
                    self.send_response(500)
                    self.end_headers()
                    self.wfile.write(b'{"ok":false}')
                    return
                if any(e["event_type"] == "import_run" for e in body["events"]):
                    outer.pending = dict(outer.pending, refresh=False)
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'{"inserted":1,"skipped":0}')

            def do_GET(self):
                outer.gets.append((self.path, self.headers.get("Authorization")))
                self.send_response(200)
                self.end_headers()
                self.wfile.write(json.dumps(outer.pending).encode("utf-8"))

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

    def test_revert_and_revert_of_revert(self):
        bad = self.r.commit({"apps/x.ts": "1"}, "bad change")
        self.r.git("revert", "--no-edit", "HEAD")
        undo = self.r.git("rev-parse", "HEAD")
        self.r.git("revert", "--no-edit", "HEAD")  # re-applies bad: the projection toggles by time, it needs both
        rev = [e for e in events(self.build()[0]) if e["event_type"] == "revert"]
        self.assertEqual([(e["system_slug"], e["payload"]) for e in rev],
                         [("alpha", {"reverted_sha": bad}), ("alpha", {"reverted_sha": undo})])

    def test_one_commit_reverting_two(self):
        a = self.r.commit({"apps/x.ts": "1"}, "A")
        b = self.r.commit({"apps/b/y.ts": "1"}, "B")
        self.r.git("revert", "-n", b, a)
        self.r.git("commit", "-q", "-m", f"Revert A and B\n\nThis reverts commit {b}.\nThis reverts commit {a}.")
        rev = [e for e in events(self.build()[0]) if e["event_type"] == "revert"]
        self.assertEqual(sorted((e["system_slug"], e["payload"]["reverted_sha"]) for e in rev),
                         sorted([("alpha", a), ("beta", a), ("alpha", b), ("beta", b)]))
        self.assertEqual(len({e["event_key"] for e in rev}), 4)

    def test_registry_rules_are_fatal_and_named(self):
        s0 = REGISTRY["systems"][0]
        cases = [
            (dict(s0, id="not-a-uuid"), "systems[0].id: not a uuid"),
            (dict(s0, slug="Alpha_1"), "systems[0].slug: not a kebab slug"),
            (dict(s0, name="x" * 201), "systems[0].name: not a string of at most 200"),
            (dict(s0, type="toy"), "systems[0].type: not one of"),
            (dict(s0, features=[dict(s0["features"][0], phase=None)]), "systems[0].features[0].phase: required"),
            (dict(s0, features=[dict(s0["features"][0], phase="p9")]), "systems[0].features[0].phase: no phase p9"),
            (dict(s0, slug="beta"), "systems[1].slug: duplicate system slug beta"),
            (dict(s0, features=[dict(s0["features"][0], legacy_code="")]), "systems[0].features[0].legacy_code: empty"),
            (dict(s0, features=[dict(s0["features"][0], legacy_code="x" * 41)]),
             "systems[0].features[0].legacy_code: not a string of at most 40"),
            (dict(s0, features=[dict(s0["features"][0], legacy_code=3)]), "systems[0].features[0].legacy_code: not a string"),
        ]
        for system, msg in cases:
            with self.subTest(msg):
                reg = dict(REGISTRY, systems=[system] + REGISTRY["systems"][1:])
                with self.assertRaises(si.Fatal) as cm:
                    si.load_registry(json.dumps(reg))
                self.assertIn(msg, str(cm.exception))

    def test_legacy_code_optional_and_ignore_paths_not_dead_checked(self):
        s0 = REGISTRY["systems"][0]
        reg = dict(REGISTRY, ignore_paths=REGISTRY["ignore_paths"] + ["ops/DEPLOY_HOLD"],
                   shared_paths=REGISTRY["shared_paths"] + ["gone.txt"],
                   systems=[dict(s0, features=[dict(s0["features"][0], legacy_code="批0")])] + REGISTRY["systems"][1:])
        loaded = si.load_registry(json.dumps(reg))  # legacy_code present: fine; absent (beta, REGISTRY): fine
        head = self.r.git("rev-parse", "HEAD")
        dead = si.head_gaps(self.r.origin + "/.git", head, loaded)[2]
        self.assertIn("gone.txt", dead)  # shared_paths still checked
        self.assertNotIn("ops/DEPLOY_HOLD", dead)

    def test_real_registry_passes_with_no_dead_paths(self):
        root = os.path.abspath(os.path.join(os.path.dirname(SRC), "..", "..", "..", ".."))
        git_dir = subprocess.run(["git", "rev-parse", "--absolute-git-dir"], cwd=root, check=True,
                                 capture_output=True, text=True).stdout.strip()
        with open(os.path.join(root, si.REGISTRY_PATH), encoding="utf-8") as f:
            reg = si.load_registry(f.read())  # the working-tree copy, checked against the files at HEAD
        self.assertEqual(si.head_gaps(git_dir, "HEAD", reg)[2], [])

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

    def test_history_diverged_sends_only_orphans_and_keeps_state(self):
        os.environ.update(SYSTEMS_IMPORT_ENABLED="true", SYSTEMS_INGEST_TOKEN="tok")
        srv = Server()
        os.environ["SYSTEMS_INGEST_URL"] = srv.url
        try:
            dropped = self.r.commit({"apps/x.ts": "1"}, "first")
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
            self.assertEqual([(e["event_type"], e["event_key"], e["system_slug"], e["payload"]) for e in last["events"][:-1]],
                             [("orphaned", f"orphan:{dropped}", None, {"sha": dropped})])  # and no activity for "rewritten"
            self.assertEqual(last["events"][-1]["event_type"], "import_run")
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

    def test_if_requested(self):
        os.environ.update(SYSTEMS_IMPORT_ENABLED="true", SYSTEMS_INGEST_TOKEN="tok")
        srv = Server()
        os.environ["SYSTEMS_INGEST_URL"] = srv.url
        try:
            before = self.r.git("rev-parse", "refs/heads/main", cwd=self.r.mirror)
            self.r.commit({"apps/x.ts": "1"}, "new")
            # refresh false: one GET to /pending with the token, no fetch, no POST, no state, no log line
            rc, out = self.run_main("--if-requested")
            self.assertEqual((rc, srv.bodies, out), (0, [], ""))
            self.assertEqual(srv.gets, [("/api/internal/systems/pending", "Bearer tok")])
            self.assertEqual(self.r.git("rev-parse", "refs/heads/main", cwd=self.r.mirror), before)
            self.assertFalse(os.path.exists(self.r.state))
            # refresh true: imports as usual, the import_run (last) is what answers the request
            srv.pending = {"refresh": True, "requested_at": "r1", "proposals": []}
            rc, out = self.run_main("--if-requested")
            self.assertEqual(rc, 0, out)
            self.assertEqual([e["event_type"] for e in srv.bodies[-1]["events"]], ["activity", "import_run"])
            head = self.r.git("rev-parse", "HEAD")
            with open(self.r.state) as f:
                self.assertEqual(f.read().strip(), head)
            # still requested with nothing new: a run record alone is sent (else the request would stay pending)
            srv.pending = {"refresh": True, "requested_at": "r2", "proposals": []}
            rc, out = self.run_main("--if-requested")
            self.assertEqual(rc, 0, out)
            self.assertEqual([(e["event_type"], e["payload"]["head"]) for e in srv.bodies[-1]["events"]], [("import_run", head)])
        finally:
            srv.close()

    def test_if_requested_failure_still_answers_the_request(self):
        os.environ.update(SYSTEMS_IMPORT_ENABLED="true", SYSTEMS_INGEST_TOKEN="tok")
        srv = Server()
        os.environ["SYSTEMS_INGEST_URL"] = srv.url
        try:
            self.r.commit({"apps/x.ts": "1"}, "new")
            srv.pending = {"refresh": True, "requested_at": "r1", "proposals": []}
            srv.refuse = lambda body: any(e["event_type"] != "import_run" for e in body["events"])  # the import batch fails
            rc, out = self.run_main("--if-requested")
            self.assertEqual(rc, 1, out)
            self.assertFalse(os.path.exists(self.r.state))
            last = srv.bodies[-1]["events"]
            self.assertEqual([e["event_type"] for e in last], ["import_run"])
            self.assertEqual(last[0]["payload"]["status"], "error")
            self.assertIn("HTTP 500", last[0]["payload"]["error"])
            self.assertRegex(last[0]["occurred_at"], r"\.\d{3}\+00:00$")  # milliseconds
            # answered: the next tick does no import
            sent = len(srv.bodies)
            rc, out = self.run_main("--if-requested")
            self.assertEqual((rc, len(srv.bodies), out), (0, sent, ""))
        finally:
            srv.close()


    def test_if_requested_works_on_one_request_once(self):
        os.environ.update(SYSTEMS_IMPORT_ENABLED="true", SYSTEMS_INGEST_TOKEN="tok")
        srv = Server()
        os.environ["SYSTEMS_INGEST_URL"] = srv.url
        try:
            self.r.commit({"apps/x.ts": "1"}, "new")
            srv.pending = {"refresh": True, "requested_at": "2026-11-22T01:00:00.000Z", "proposals": []}
            srv.refuse = lambda body: True  # the route refuses every body, the error run record too
            rc, out = self.run_main("--if-requested")
            self.assertEqual(rc, 1, out)
            self.assertEqual(out.count("HTTP 500"), 2, out)  # the batch, then the error record
            # the same request stays pending on the app side, but this host already worked on it: no git work
            before = self.r.git("rev-parse", "refs/heads/main", cwd=self.r.mirror)
            self.r.commit({"apps/x.ts": "2"}, "newer")
            sent = len(srv.bodies)
            rc, out = self.run_main("--if-requested")
            self.assertEqual((rc, len(srv.bodies), out), (0, sent, ""))
            self.assertEqual(self.r.git("rev-parse", "refs/heads/main", cwd=self.r.mirror), before)  # not fetched
            # a new press is a new request: worked on again; the same error line is not printed a second time
            srv.pending = dict(srv.pending, requested_at="2026-11-22T01:10:00.000Z")
            rc, out = self.run_main("--if-requested")
            self.assertEqual(rc, 1, out)
            self.assertGreater(len(srv.bodies), sent)
            self.assertEqual(out, "")  # both error lines are the same as last time: not printed again
        finally:
            srv.close()

if __name__ == "__main__":
    unittest.main()
