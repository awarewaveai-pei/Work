"""scripts/check-compose-invariants.py: each invariant goes red on its violation and green when fixed.
Run: python tests/scripts/test_check_compose_invariants.py
"""
import importlib.util
import os
import pathlib
import re
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("cci", ROOT / "scripts" / "check-compose-invariants.py")
cci = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cci)

GOOD = """services:
  web:
    image: nginx:1
    init: true
    memswap_limit: 256M
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS -m 4 http://127.0.0.1/ || exit 1"]
    deploy:
      resources:
        limits:
          memory: 256M
          pids: 64
"""
CONF = "# worker_rss_mb: 80\n# base_mb: 250\n<IfModule mpm_prefork_module>\n\tMaxRequestWorkers\t\t{w}\n</IfModule>\n"


class Invariants(unittest.TestCase):
    def run_compose(self, text, files=None):
        d = tempfile.mkdtemp()
        for name, body in (files or {}).items():
            pathlib.Path(d, name).write_text(body, encoding="utf-8")
        p = os.path.join(d, "docker-compose.yml")
        pathlib.Path(p).write_text(text, encoding="utf-8")
        return [x.split(": ", 2)[2] for x in cci.check_file(p)]

    def test_good_service_passes(self):
        self.assertEqual(self.run_compose(GOOD), [])

    def test_i1_no_memory_limit(self):
        out = self.run_compose(GOOD.replace("          memory: 256M\n", ""))
        self.assertTrue(any(x.startswith("I1") for x in out), out)

    def test_i2_swap_allowed(self):
        self.assertIn("I2 memswap_limit must equal memory (256M)", self.run_compose(GOOD.replace("    memswap_limit: 256M\n", "")))
        self.assertIn("I2 memswap_limit must equal memory (256M)", self.run_compose(GOOD.replace("memswap_limit: 256M", "memswap_limit: 512M")))
        self.assertEqual(self.run_compose(GOOD.replace("memswap_limit: 256M", "memswap_limit: 262144k")), [])

    def test_i3_no_pids_limit(self):
        self.assertIn("I3 no pids limit", self.run_compose(GOOD.replace("          pids: 64\n", "")))

    def test_i6_no_init(self):
        self.assertIn("I6 no init: true", self.run_compose(GOOD.replace("    init: true\n", "")))
        self.assertIn("I6 no init: true", self.run_compose(GOOD.replace("init: true", "init: false")))

    def test_i4_unbounded_probes(self):
        for bad in ["curl -fsS http://127.0.0.1/", "wget -qO- http://127.0.0.1/", "redis-cli ping",
                    "node -e fetch('http://127.0.0.1/')"]:
            out = self.run_compose(GOOD.replace("curl -fsS -m 4 http://127.0.0.1/ || exit 1", bad))
            self.assertTrue(any(x.startswith("I4 healthcheck") for x in out), (bad, out))
        for ok in ["wget -T 4 -qO- http://127.0.0.1/", "timeout 2 redis-cli ping", "pg_isready -U x",
                   "node -e fetch('http://x',{signal:AbortSignal.timeout(4000)})", "curl --max-time 3 http://x >/dev/null 2>&1"]:
            self.assertEqual(self.run_compose(GOOD.replace("curl -fsS -m 4 http://127.0.0.1/ || exit 1", ok)), [], ok)

    def test_i4_one_command_with_a_positive_timeout(self):
        for bad in ["curl -fsS http://x/; timeout 4 true", "curl -m 2 http://x && redis-cli ping", "timeout 4 curl http://x && sleep 600",
                    "curl -m 0 http://x", "wget -T 0 -qO- http://x", "timeout 0 redis-cli ping", "curl -m 4 http://x/$(sleep 600)", "curl -m 4 http://x/`sleep 600`", "node -e fetch('x',{signal:AbortSignal.timeout(0)})"]:
            out = self.run_compose(GOOD.replace("curl -fsS -m 4 http://127.0.0.1/ || exit 1", bad))
            self.assertTrue(any(x.startswith("I4 healthcheck") for x in out), (bad, out))

    def test_i4_dockerfile_healthcheck_only_when_compose_has_none(self):
        compose = GOOD.replace("    image: nginx:1\n", "    build: .\n")
        no_hc = re.sub(r"    healthcheck:\n      test: .*\n", "", compose)
        df = "FROM nginx:1\nHEALTHCHECK --interval=20s \\\n  CMD curl -fsS http://127.0.0.1/ || exit 1\n"
        out = self.run_compose(no_hc, {"Dockerfile": df})
        self.assertTrue(any(x.startswith("I4 Dockerfile HEALTHCHECK") for x in out), out)
        self.assertEqual(self.run_compose(no_hc, {"Dockerfile": df.replace("curl -fsS", "curl -fsS -m 4")}), [])
        self.assertEqual(self.run_compose(compose, {"Dockerfile": df}), [])   # compose healthcheck replaces it

    def test_unreadable_inputs_are_problems(self):
        out = self.run_compose(GOOD.replace("    image: nginx:1\n", "    build: ./absent\n"))
        self.assertTrue(any(x.startswith("Dockerfile not readable") for x in out), out)
        self.assertEqual(cci.check_file(os.path.join(tempfile.mkdtemp(), "nope.yml"))[0].split(": ")[-1], "not readable")
        d = tempfile.mkdtemp(); os.mkdir(os.path.join(d, "Dockerfile"))   # exists, cannot be read as a file
        compose = GOOD.replace("    image: nginx:1\n", "    build: .\n")
        pathlib.Path(d, "docker-compose.yml").write_text(compose, encoding="utf-8")
        self.assertTrue(any("Dockerfile not readable" in x for x in cci.check_file(os.path.join(d, "docker-compose.yml"))))

    def test_i5_wordpress_workers_vs_memory(self):
        wp = GOOD.replace("image: nginx:1", "image: wordpress:6.7-apache").replace("256M", "1536M")
        self.assertIn("I5 no readable mpm_prefork conf at /etc/apache2/mods-available/mpm_prefork.conf (image default = 150 workers)",
                      self.run_compose(wp))
        mounted = wp.replace("    memswap_limit", "    volumes:\n      - ./mpm.conf:/etc/apache2/mods-available/mpm_prefork.conf:ro\n    memswap_limit")
        self.assertEqual(self.run_compose(mounted, {"mpm.conf": CONF.format(w=16)}), [])
        self.assertIn("I5 17 workers x 80 MB + 250 MB > memory 1536 MB", self.run_compose(mounted, {"mpm.conf": CONF.format(w=17)}))
        self.assertIn("I5 mpm.conf lacks worker_rss_mb", self.run_compose(mounted, {"mpm.conf": CONF.format(w=16).replace("# worker_rss_mb: 80\n", "")}))
        built = wp.replace("    image: wordpress:6.7-apache\n", "    build: .\n")
        df = "FROM wordpress:6.9-php8.2-apache\nCOPY mpm.conf /etc/apache2/mods-available/mpm_prefork.conf\n"
        self.assertEqual(self.run_compose(built, {"Dockerfile": df, "mpm.conf": CONF.format(w=16)}), [])
        twice = df + "COPY big.conf /etc/apache2/mods-available/mpm_prefork.conf\n"   # the last COPY is what the image has
        self.assertTrue(any(x.startswith("I5 17") for x in self.run_compose(built, {"Dockerfile": twice, "mpm.conf": CONF.format(w=16), "big.conf": CONF.format(w=17)})))
        multi = "FROM node:20 AS build\nRUN true\nFROM wordpress:6.7-apache\n"   # runtime = last stage
        self.assertTrue(any(x.startswith("I5") for x in self.run_compose(built, {"Dockerfile": multi})))
        self.assertEqual(self.run_compose(wp.replace("6.7-apache", "6.7-fpm")), [])
        for ref in ["wordpress@sha256:abc", "library/wordpress", "docker.io/library/wordpress:6"]:
            self.assertTrue(any(x.startswith("I5") for x in self.run_compose(wp.replace("wordpress:6.7-apache", ref))), ref)

    def test_running_container_must_match_the_file(self):
        svc = {"init": True, "memswap_limit": "256M", "deploy": {"resources": {"limits": {"memory": "256M", "pids": 64}}}}
        ok = {"name": "web", "Memory": 256 << 20, "MemorySwap": 256 << 20, "PidsLimit": 64, "Init": True}
        run = lambda c: cci.check_running("f.yml", "web", svc, containers=lambda p, n: c)
        self.assertEqual(run([ok]), [])
        self.assertEqual(run([]), [])   # nothing running = NOTE, not a pass claim on a container
        for key, bad in [("Memory", 128 << 20), ("MemorySwap", 512 << 20), ("PidsLimit", None), ("Init", False)]:
            out = run([{**ok, key: bad}])
            self.assertTrue(len(out) == 1 and key in out[0], (key, out))
        self.assertTrue(any(x.startswith("R4") for x in run([{**ok, "Healthcheck": "extra/healthcheck"}])))
        self.assertEqual(run([{**ok, "Healthcheck": "timeout 4 extra/healthcheck"}]), [])

    def test_repo_files_are_listed_and_green(self):
        cwd = os.getcwd()
        try:
            self.assertEqual(cci.main([]), 0)
        finally:
            os.chdir(cwd)


if __name__ == "__main__":
    unittest.main()
