"""backup-restore-drill.py's FAIL guards and backup-coverage-check.py's restore-drill and ids rows. From the repo root:
    python lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/backup-restore-drill.test.py
SRC=<file> tests a mutated copy of the drill."""
import fnmatch
import gzip
import importlib.util
import json
import os
import tempfile
import unittest
from datetime import datetime, timezone

SCRIPTS = os.path.join(os.path.dirname(__file__), "..", "..", "scripts")


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


drill = load("drill", os.environ.get("SRC") or os.path.join(SCRIPTS, "backup-restore-drill.py"))
cov = drill.cov

DUMPALL = """\\connect template1
\\connect -reuse-previous=on "dbname='postgres'"
COPY auth.users (id, email) FROM stdin;
1\ta@x
2\tb@x
\\.
COPY public."my table" (id) FROM stdin;
9
\\.
COPY public.no_columns  FROM stdin;


\\.
CREATE EVENT TRIGGER issue_pg_net_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_net_access();
\\connect -reuse-previous=on "dbname='n8n'"
COPY public.workflow_entity (id) FROM stdin;
7
\\.
--
-- PostgreSQL database cluster dump complete
--
""".splitlines(keepends=True)


class Guards(unittest.TestCase):
    def test_every_copy_block_is_counted_per_database(self):
        scan = drill.scan_pg(DUMPALL, "postgres")
        self.assertEqual(scan["rows"], {("postgres", "auth.users"): 2, ("postgres", 'public."my table"'): 1,
                                        ("postgres", "public.no_columns"): 2, ("n8n", "public.workflow_entity"): 1})
        self.assertEqual(scan["dbs"], {"postgres", "template1", "n8n"})
        self.assertEqual(scan["event_triggers"], {"issue_pg_net_access": "ddl_command_end|CREATE EXTENSION|extensions.grant_pg_net_access"})

    def test_unterminated_trigger_is_recorded_and_does_not_swallow_the_next_database(self):
        lines = ["CREATE EVENT TRIGGER t1 ON ddl_command_end\n", "\\connect -reuse-previous=on \"dbname='n8n'\"\n",
                 "COPY public.w (id) FROM stdin;\n", "1\n", "\\.\n"]
        scan = drill.scan_pg(lines, "postgres")
        self.assertTrue(scan["event_triggers"]["t1"].startswith("unparsed"))
        self.assertEqual(scan["rows"], {("n8n", "public.w"): 1})

    def test_trigger_defined_differently_fails(self):
        dump = drill.scan_pg(DUMPALL, "postgres")["event_triggers"]
        good = ["issue_pg_net_access|ddl_command_end|CREATE EXTENSION|extensions.grant_pg_net_access"]
        self.assertEqual(drill.trigger_problems(dump, good), [])
        self.assertIn("defined differently", drill.trigger_problems(dump, [good[0].replace("EXTENSION", "SCHEMA")])[0])
        self.assertIn("missing", drill.trigger_problems(dump, [])[0])

    def test_dump_cut_before_its_trailer_fails(self):
        self.assertTrue(drill.has_trailer(drill.scan_pg(DUMPALL, "postgres")["tail"], "pg_dumpall"))
        self.assertFalse(drill.has_trailer(drill.scan_pg(DUMPALL[:-3], "postgres")["tail"], "pg_dumpall"))
        self.assertFalse(drill.has_trailer(drill.scan_mysql(["INSERT INTO `wp_posts` VALUES (1);\n"], "w")["tail"], "mysqldump"))

    def test_truncated_gzip_is_a_store_fail_not_a_crash(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "x.sql.gz")
            with open(path, "wb") as fh:
                fh.write(gzip.compress("".join(DUMPALL).encode() * 50)[:200])
            with self.assertRaisesRegex(drill.DrillError, "unreadable gzip"):
                drill.scan_gz(path, drill.scan_pg, "postgres")

    def test_rows_lost_or_table_missing_fails(self):
        want = {("postgres", "auth.users"): 2, ("postgres", "cron.job"): 1}
        self.assertEqual(drill.count_problems(want, want), [])
        self.assertEqual(drill.count_problems(want, {("postgres", "auth.users"): 0}),
                         ["postgres auth.users: dump 2, restored 0", "postgres cron.job: dump 1, restored none"])

    def test_an_empty_dump_or_an_expected_table_without_rows_fails(self):
        self.assertEqual(drill.completeness_problems({}, []), ["no table data in the dump"])
        want = {("postgres", "auth.users"): 0, ("postgres", "public.organizations"): 6}
        self.assertEqual(drill.completeness_problems(want, [("postgres", "public.organizations")]), [])
        self.assertEqual(len(drill.completeness_problems(want, [("postgres", "auth.users"), ("n8n", "public.x")])), 2)

    def test_only_the_named_unavoidable_errors_are_tolerated(self):
        err = ('psql:<stdin>:12: ERROR:  role "supabase_admin" already exists\n'
               "ERROR:  Superuser owned event trigger must execute a superuser owned function\n"
               'ERROR:  event trigger "issue_pg_net_access" does not exist\n'
               'ERROR:  column "is_sso_user" of relation "auth.users" does not exist\n'
               "psql: error: connection to server failed: FATAL:  password authentication failed\n"
               "You are currently not connected to a database.\n")
        got = drill.unexpected_errors(err)
        self.assertEqual(len(got), 3, got)
        self.assertIn('column "is_sso_user" of relation "auth.users" does not exist', got)

    def test_error_details_drop_row_values(self):
        msg = drill.first_error("ERROR:  duplicate key value violates unique constraint \"u\"\n"
                                "DETAIL:  Key (email)=(alice@example.com) already exists. 'secret'")
        self.assertNotIn("alice", msg)
        self.assertEqual(drill.scrub("Key (email)=(alice@example.com) value 'bob'"), "Key (email)=(...) value '...'")

    def test_manual_or_stale_snapshot_dirs_are_never_drilled(self):
        pipe = {"r2_prefix": "eu", "r2_dir": "date"}
        listing = {"eu/2026-10-14/a.sql.gz": (1, 0), "eu/manual-pre-migration/a.sql.gz": (1, 0)}
        now = datetime(2026, 10, 15, 4, 15, tzinfo=timezone.utc)
        self.assertEqual(drill.pick_snapshot(listing, pipe, 26, now), "eu/2026-10-14")
        with self.assertRaisesRegex(drill.DrillError, "h old"):
            drill.pick_snapshot(listing, pipe, 26, datetime(2026, 10, 17, 4, 15, tzinfo=timezone.utc))
        with self.assertRaisesRegex(drill.DrillError, "no stamp snapshot"):
            drill.pick_snapshot(listing, {"r2_prefix": "eu", "r2_dir": "stamp"}, 26, now)

    def test_wildcard_takes_every_dump_including_a_split_one(self):
        listing = {"c/2026-10-14/a.dump": 0, "c/2026-10-14/b.dump.parts.json": 0, "c/2026-10-14/b.dump.part-000": 0,
                   "c/2026-10-14/runtime.tgz": 0, "c/2026-10-13/old.dump": 0}
        self.assertEqual(drill.expand(["*.dump"], listing, "c/2026-10-14"), ["a.dump", "b.dump"])

    def test_mysql_scan_tracks_each_database_of_a_databases_dump(self):
        scan = drill.scan_mysql(["CREATE TABLE `wp_posts` (\n", "INSERT INTO `wp_posts` VALUES (1),(2);\n",
                                 "USE `wp_s_1`;\n", "CREATE TABLE `wp_posts` (\n", "CREATE TABLE `wp_empty` (\n",
                                 "-- Dump completed on 2026-10-14\n"], "wordpress")
        self.assertEqual(scan["created"], {("wordpress", "wp_posts"), ("wp_s_1", "wp_posts"), ("wp_s_1", "wp_empty")})
        self.assertEqual((scan["inserted"], scan["dbs"]), ({("wordpress", "wp_posts")}, {"wordpress", "wp_s_1"}))
        self.assertTrue(drill.has_trailer(scan["tail"], "mysqldump"))


NOW = 1_800_000_000
INV = {"max_age_hours": 26, "split_threshold_bytes": 1000, "pipelines": {"p": {"local_root": "/p", "r2_prefix": "p", "r2_dir": "date"}},
       "not_backed_up": [], "r2": {"lifecycle_max_age_seconds": {}, "unlocked_prefixes": []},
       "restore_drill": {"status_file": "/x/restore-drill.json", "max_age_days": 35, "label": "l", "work_root": "/w"},
       "reconcile": {"checks": {"postiz-integrations": "Postiz"}},
       "stores": [{"id": "db", "pipeline": "p", "mounts": [], "artifacts": [], "drill": {"engine": "postgres"}}]}


def rows_for(drill_status="PASS", hours_ago=24, rows=None, leftovers=(), reconcile=None):
    when = datetime.fromtimestamp(NOW - hours_ago * 3600, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    status = drill_status if isinstance(drill_status, dict) or drill_status is None else \
        {"generated_at": when, "overall": drill_status, "rows": [{"id": "db", "status": "PASS", "detail": "ok"}] if rows is None else rows}
    result = cov.evaluate(INV, {"m:/d": "v"}, {"p": None}, {"p": {}}, {}, [], NOW, status, leftovers, reconcile)
    return {r["id"]: r for r in result}


class CoverageRows(unittest.TestCase):
    def test_recent_pass_passes(self):
        self.assertEqual(rows_for()["restore-drill"]["status"], "PASS")

    def test_never_ran_or_unreadable_fails(self):
        self.assertIn("never ran", rows_for(None)["restore-drill"]["detail"])
        self.assertIn("unreadable", rows_for({"unreadable": "ValueError"})["restore-drill"]["detail"])

    def test_older_than_max_age_fails(self):
        self.assertIn("36 days old", rows_for(hours_ago=36 * 24)["restore-drill"]["detail"])

    def test_a_failed_or_skipped_database_or_error_fails(self):
        self.assertIn("db: rows lost", rows_for(rows=[{"id": "db", "status": "FAIL", "detail": "rows lost"}])["restore-drill"]["detail"])
        self.assertIn("skipped db", rows_for(rows=[])["restore-drill"]["detail"])
        self.assertIn("did not run", rows_for("ERROR", rows=[])["restore-drill"]["detail"])

    def test_a_drill_running_for_hours_was_killed(self):
        self.assertEqual(rows_for("RUNNING", hours_ago=1, rows=[])["restore-drill"]["status"], "PASS")
        self.assertIn("never finished", rows_for("RUNNING", hours_ago=7, rows=[])["restore-drill"]["detail"])

    def test_leftover_client_data_fails(self):
        self.assertIn("left 1 volume(s)", rows_for(leftovers=["1 volume(s) labelled l"])["restore-drill"]["detail"])

    def test_ids_row_fails_on_dangling_error_or_silence(self):
        ok = {"checks": [{"id": "postiz-integrations", "checked": 3, "dangling": []}]}
        self.assertEqual(rows_for(reconcile=ok)["ids:postiz-integrations"]["status"], "PASS")
        bad = {"checks": [{"id": "postiz-integrations", "checked": 3, "dangling": [{"where": "social_accounts r1", "id": "gone"}]}]}
        self.assertIn("r1 -> gone", rows_for(reconcile=bad)["ids:postiz-integrations"]["detail"])
        self.assertIn("502", rows_for(reconcile={"checks": [{"id": "postiz-integrations", "error": "Postiz 502", "dangling": []}]})["ids:postiz-integrations"]["detail"])
        self.assertIn("not reported", rows_for(reconcile={"checks": []})["ids:postiz-integrations"]["detail"])
        self.assertIn("HTTP 401", rows_for(reconcile={"error": "HTTP 401"})["ids:postiz-integrations"]["detail"])
        self.assertIn("not called", rows_for(reconcile=None)["ids:postiz-integrations"]["detail"])


class RealInventory(unittest.TestCase):
    """The shipped drill and reconcile entries point at real artifacts and engines (a typo silently skips one)."""

    def test_drill_entries_are_consistent(self):
        with open(os.path.join(SCRIPTS, "backup-inventory.json"), encoding="utf-8") as fh:
            inv = json.load(fh)
        self.assertTrue({"status_file", "max_age_days", "label", "work_root"} <= set(inv["restore_drill"]))
        members = {m for s in inv["stores"] for a in s["artifacts"] if isinstance(a, dict) for m in a["members"]}
        for s in (s for s in inv["stores"] if "drill" in s):
            d, names = s["drill"], [a if isinstance(a, str) else a["name"] for a in s["artifacts"]]
            self.assertIn(d["engine"], ("postgres", "mysql", "supabase"), s["id"])
            self.assertTrue(d.get("expect"), f"{s['id']}: no expect list")
            for n in d.get("artifacts", []) + ([d["roles"]] if "roles" in d else []):
                self.assertTrue(fnmatch.filter(names, n), f"{s['id']}: {n} matches no store artifact")
            if d["engine"] == "supabase":
                self.assertTrue({d["secrets"]["key"], d["secrets"]["env"]} <= members, s["id"])


if __name__ == "__main__":
    unittest.main(verbosity=1)
