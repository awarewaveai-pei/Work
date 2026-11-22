"""backup-coverage-check.py evaluate() -- each guard fails when its condition breaks. From the repo root:
    python lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/backup-coverage-check.test.py
SRC=<file> tests a mutated copy."""
import importlib.util
import os
import time
import unittest

SRC = os.environ.get("SRC") or os.path.join(os.path.dirname(__file__), "..", "..", "scripts", "backup-coverage-check.py")
spec = importlib.util.spec_from_file_location("coverage", SRC)
cov = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cov)

NOW = 1_800_000_000
FRESH = NOW - 3600
UP = FRESH + 60  # uploaded a minute after the file was written
INV = {
    "max_age_hours": 26, "split_threshold_bytes": 1000,
    "r2": {"lifecycle_max_age_seconds": {"eu/": 2592000, "cognitive/": 432000}, "unlocked_prefixes": ["cognitive/"]},
    "pipelines": {"stack": {"local_root": "/s", "r2_prefix": "eu", "r2_dir": "date"},
                  "ks": {"local_root": "/k", "r2_prefix": "ks", "r2_dir": "stamp", "complete_marker": ".complete"}},
    "stores": [
        {"id": "db", "pipeline": "stack", "mounts": ["db:/data"], "artifacts": ["db.sql.gz"]},
        {"id": "big", "pipeline": "stack", "mounts": ["web:/html"], "artifacts": ["web.tgz"], "sources": {"web:/html": "web_vol"}},
        {"id": "sec", "pipeline": "stack", "mounts": ["db:/conf"],
         "artifacts": [{"name": "env.enc", "members_file": "env.enc.members", "members": ["root/a/.env", "var/key"]}]},
        {"id": "site", "pipeline": "ks", "mounts": ["site:/x"], "artifacts": ["site.tgz"]},
    ],
    "not_backed_up": [{"mounts": ["redis:/data", "db:/init/*"], "reason": "cache"}],
}
MOUNTS = {"db:/data": "db_vol", "db:/conf": "conf_vol", "db:/init/a.sql": "/x/a.sql", "web:/html": "web_vol",
          "site:/x": "site_vol", "redis:/data": "r"}


def state():
    snaps = {"stack": {"stamp": "20260115-023001", "members": {"env.enc.members": ["root/a/.env", "var/key"]},
                       "files": {"db.sql.gz": (10, FRESH), "web.tgz": (2500, FRESH), "env.enc": (9, FRESH),
                                 "env.enc.members": (20, FRESH)}},
             "ks": {"stamp": "20260115-021501", "members": {}, "files": {"site.tgz": (10, FRESH), ".complete": (0, FRESH)}}}
    keys = {"stack": {"eu/2026-01-15/db.sql.gz": (10, UP), "eu/2026-01-15/env.enc": (9, UP),
                      "eu/2026-01-15/web.tgz.part-000": (1000, UP), "eu/2026-01-15/web.tgz.part-001": (1000, UP),
                      "eu/2026-01-15/web.tgz.part-002": (500, UP), "eu/2026-01-15/web.tgz.parts.json": (90, UP)},
            "ks": {"ks/20260115-021501/site.tgz": (10, UP)}}
    return snaps, keys, {"eu/": 2592000, "cognitive/": 432000}, ["ks-aw-01/"]


def fails(rows):
    return {r["id"]: r["detail"] for r in rows if r["status"] == "FAIL"}


class Coverage(unittest.TestCase):
    def run_eval(self, mounts=None, mutate=None):
        snaps, keys, life, locks = state()
        if mutate:
            out = mutate(snaps, keys, life, locks)
            if out is not None:
                locks = out
        return fails(cov.evaluate(INV, MOUNTS if mounts is None else mounts, snaps, keys, life, locks, NOW))

    def test_all_good_passes(self):
        self.assertEqual(self.run_eval(), {})

    def test_unlisted_mount_fails_inventory(self):
        self.assertIn("new-db:/var/lib/postgresql/data", self.run_eval({**MOUNTS, "new-db:/var/lib/postgresql/data": "v"})["inventory"])

    def test_no_mounts_at_all_fails(self):
        self.assertIn("no writable mounts", self.run_eval({})["inventory"])

    def test_prefix_pattern_covers_only_its_prefix(self):
        self.assertIn("db:/initx", self.run_eval({**MOUNTS, "db:/initx": "v"})["inventory"])

    def test_mount_source_changed_fails(self):
        self.assertIn("now mounts web_vol_v2", self.run_eval({**MOUNTS, "web:/html": "web_vol_v2"})["inventory"])

    def test_missing_artifact_fails_store(self):
        def m(s, k, l, lk):
            del s["stack"]["files"]["db.sql.gz"]
        self.assertIn("db.sql.gz missing", self.run_eval(mutate=m)["db"])

    def test_unfinished_run_fails(self):
        def m(s, k, l, lk):
            del s["ks"]["files"][".complete"]
        self.assertIn("did not finish", self.run_eval(mutate=m)["site"])

    def test_old_artifact_fails(self):
        def m(s, k, l, lk):
            s["stack"]["files"]["db.sql.gz"] = (10, NOW - 27 * 3600)
        self.assertIn("27h old", self.run_eval(mutate=m)["db"])

    def test_not_in_r2_fails(self):
        def m(s, k, l, lk):
            del k["stack"]["eu/2026-01-15/db.sql.gz"]
        self.assertIn("not in R2", self.run_eval(mutate=m)["db"])

    def test_r2_size_differs_fails(self):
        def m(s, k, l, lk):
            k["stack"]["eu/2026-01-15/db.sql.gz"] = (7, UP)
        self.assertIn("7 bytes, local 10", self.run_eval(mutate=m)["db"])

    def test_r2_object_from_an_earlier_run_fails(self):
        def m(s, k, l, lk):
            k["stack"]["eu/2026-01-15/db.sql.gz"] = (10, FRESH - 3600)
        self.assertIn("predates", self.run_eval(mutate=m)["db"])

    def test_big_file_needs_parts_manifest(self):
        def m(s, k, l, lk):
            del k["stack"]["eu/2026-01-15/web.tgz.parts.json"]
        self.assertIn("web.tgz.parts.json", self.run_eval(mutate=m)["big"])

    def test_parts_that_do_not_add_up_fail(self):
        def m(s, k, l, lk):
            del k["stack"]["eu/2026-01-15/web.tgz.part-002"]
        self.assertIn("add up to 2000", self.run_eval(mutate=m)["big"])

    def test_old_part_mixed_into_todays_set_fails(self):
        def m(s, k, l, lk):
            k["stack"]["eu/2026-01-15/web.tgz.part-001"] = (1000, FRESH - 7200)
        self.assertIn("part-001 predates", self.run_eval(mutate=m)["big"])

    def test_stamp_layout_keys_by_stamp(self):
        def m(s, k, l, lk):
            k["ks"] = {"ks/2026-01-15/site.tgz": (10, UP)}
        self.assertIn("ks/20260115-021501/site.tgz", self.run_eval(mutate=m)["site"])

    def test_bundle_missing_member_fails(self):
        def m(s, k, l, lk):
            s["stack"]["members"]["env.enc.members"] = ["root/a/.env"]
        self.assertIn("lacks var/key", self.run_eval(mutate=m)["sec"])

    def test_r2_listing_failure_is_a_fail_not_a_pass(self):
        def m(s, k, l, lk):
            k["stack"] = None
        self.assertIn("R2 listing failed", self.run_eval(mutate=m)["db"])

    def test_cognitive_lifecycle_longer_than_inventory_fails(self):
        def m(s, k, l, lk):
            l["cognitive/"] = 2592000
        self.assertIn("cognitive/", self.run_eval(mutate=m)["r2-retention"])

    def test_lock_covering_cognitive_fails(self):
        self.assertIn("lock on 'cognitive/'", self.run_eval(mutate=lambda s, k, l, lk: lk + ["cognitive/"])["r2-retention"])

    def test_bucket_wide_lock_fails(self):
        self.assertIn("lock on ''", self.run_eval(mutate=lambda s, k, l, lk: lk + [""])["r2-retention"])

    def test_no_snapshot_fails(self):
        def m(s, k, l, lk):
            s["ks"] = None
        self.assertIn("no snapshot", self.run_eval(mutate=m)["site"])


class RealInventory(unittest.TestCase):
    """The shipped backup-inventory.json is internally consistent (a typo there silently drops a store)."""

    @classmethod
    def setUpClass(cls):
        import json
        with open(os.path.join(os.path.dirname(SRC), "backup-inventory.json"), encoding="utf-8") as fh:
            cls.inv = json.load(fh)

    def test_store_ids_unique_and_pipelines_exist(self):
        ids = [s["id"] for s in self.inv["stores"]]
        self.assertEqual(len(ids), len(set(ids)))
        for s in self.inv["stores"]:
            self.assertIn(s["pipeline"], self.inv["pipelines"], s["id"])
            for key in s.get("sources", {}):
                self.assertIn(key, s["mounts"], f"{s['id']}: source for an unlisted mount {key}")

    def test_every_r2_prefix_has_a_lifecycle_rule(self):
        rules = self.inv["r2"]["lifecycle_max_age_seconds"]
        for name, p in self.inv["pipelines"].items():
            self.assertIn(p["r2_prefix"] + "/", rules, name)

    def test_cognitive_expires_within_the_erasure_promise(self):
        # backup-cognitive-db.sh:6 -- erased data lives at most 7 days in a dump; R2 may delete up to a day late
        self.assertLessEqual(self.inv["r2"]["lifecycle_max_age_seconds"]["cognitive/"], 6 * 86400)
        self.assertIn("cognitive/", self.inv["r2"]["unlocked_prefixes"])


class RegisteredSites(unittest.TestCase):
    """SF-F: every site in sites.d is a store of the ks-aw-01 pipeline (backup-ks-aw-01.sh section 4b)."""
    INV = {**INV, "pipelines": {**INV["pipelines"], "ks-aw-01": {"local_root": "/w", "r2_prefix": "ksw", "r2_dir": "stamp"}}}
    MOUNTS = {**MOUNTS, "a-wp:/var/www/html": "a_wordpress_data", "a-db:/var/lib/mysql": "a_db_data",
              "b-wp:/var/www/html": "b_wordpress_data", "b-db:/var/lib/mysql": "b_db_data"}
    SITES = [{"slug": "a", "created": FRESH - 86400 * 30}, {"slug": "b", "created": None}]

    def run_eval(self, sites=None, mounts=None, drop=(), retained=()):
        snaps, keys, life, locks = state()
        files = {"manifest.json": (100, FRESH)}
        stamp = time.strftime("%Y%m%d-%H%M%S", time.localtime(FRESH - 600))  # the run started 10 min before writing
        for slug in ("a", "b"):
            for art in (f"{slug}-db.sql.gz", f"{slug}-wordpress.tgz"):
                if art not in drop:
                    files[art] = (10, FRESH)
                keys.setdefault("ks-aw-01", {})[f"ksw/{stamp}/{art}"] = (10, UP)
        snaps["ks-aw-01"] = {"stamp": stamp, "members": {}, "files": files}
        return cov.evaluate(self.INV, self.MOUNTS if mounts is None else mounts, snaps, keys, life, locks, NOW,
                            sites=self.SITES if sites is None else sites, retained=retained)

    def test_registered_sites_covered_pass(self):
        rows = self.run_eval()
        self.assertEqual(fails(rows), {})
        self.assertEqual({r["id"] for r in rows} >= {"site:a", "site:b", "site-registry"}, True)

    def test_missing_site_artifact_fails_that_site(self):
        self.assertIn("a-wordpress.tgz missing", fails(self.run_eval(drop=("a-wordpress.tgz",)))["site:a"])

    def test_site_taken_out_of_the_registry_is_reported(self):
        # its containers still run: their mounts are no longer listed anywhere
        f = fails(self.run_eval(sites=[self.SITES[1]]))
        self.assertIn("a-wp:/var/www/html", f["inventory"])
        self.assertIn("a-db:/var/lib/mysql", f["inventory"])

    def test_unreadable_registry_fails(self):
        f = fails(self.run_eval(sites=self.SITES + [{"file": "c.json", "error": "unreadable (JSONDecodeError)"}]))
        self.assertIn("c.json", f["site-registry"])

    def test_site_registered_after_the_snapshot_is_not_due_yet(self):
        rows = self.run_eval(sites=[{"slug": "a", "created": FRESH + 60}], drop=("a-db.sql.gz", "a-wordpress.tgz"),
                             mounts={k: v for k, v in self.MOUNTS.items() if not k.startswith("b-")})
        self.assertEqual(fails(rows), {})
        self.assertIn("first due", next(r for r in rows if r["id"] == "site:a")["detail"])

    def test_site_registered_while_the_run_went_on_is_not_due_yet(self):
        # read by 4b or not: after the STAMP it is never required (manifest mtime would be too late a cutoff)
        rows = self.run_eval(sites=[{"slug": "a", "created": FRESH - 300}], drop=("a-db.sql.gz", "a-wordpress.tgz"),
                             mounts={k: v for k, v in self.MOUNTS.items() if not k.startswith("b-")})
        self.assertEqual(fails(rows), {})

    def test_future_created_at_fails_instead_of_exempting_forever(self):
        self.assertIn("future", fails(self.run_eval(sites=[{"slug": "a", "created": NOW + 3600}, self.SITES[1]]))["site:a"])

    def test_retained_volumes_are_a_reminder_not_a_failure(self):
        rows = self.run_eval(retained=[("old", ["old_wordpress_data", "old_db_data"])])
        self.assertEqual(fails(rows), {})
        self.assertIn("old (old_wordpress_data, old_db_data)", next(r for r in rows if r["id"] == "retained-volumes")["detail"])

    def test_no_sites_adds_no_rows(self):
        self.assertFalse({"site-registry", "retained-volumes"} & {r["id"] for r in cov.evaluate(
            INV, MOUNTS, *state(), NOW)})

    def test_read_sites_refuses_names_render_sh_would_not_derive(self):
        import json
        import tempfile
        good = {"slug": "a", "domain": "a.example.org", "ingress": "host-vhost", "container": "a-wp", "db_container": "a-db",
                "volumes": ["a_wordpress_data", "a_db_data"], "port": 8100, "compose_file": "/root/sites/a/docker-compose.yml",
                "vhost_file": None, "created_at": "2026-11-22T10:00:00Z"}
        with tempfile.TemporaryDirectory() as d:
            for name, body in (("a.json", good), ("b.json", {**good, "slug": "b", "container": "b-wp", "db_container": "x",
                                                            "volumes": ["b_wordpress_data", "b_db_data"]}),
                               ("Bad.json", good), ("c.json", "{not json")):
                with open(os.path.join(d, name), "w", encoding="utf-8") as fh:
                    fh.write(body if isinstance(body, str) else json.dumps(body))
            got = {s.get("slug") or s["file"]: s for s in cov.read_sites(d)}
        self.assertEqual(got["a"]["created"], 1795341600.0)
        self.assertIn("differ", got["b.json"]["error"])
        self.assertIn("not a site slug", got["Bad.json"]["error"])
        self.assertIn("unreadable", got["c.json"]["error"])


if __name__ == "__main__":
    unittest.main(verbosity=1)
