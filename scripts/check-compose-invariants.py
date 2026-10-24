#!/usr/bin/env python3
"""Every service of a production compose file fails fast instead of dragging the host down.

I1 memory limit set; I2 memswap_limit == memory (no swap); I3 pids limit set;
I4 the healthcheck that runs (compose, else the image's Dockerfile HEALTHCHECK) is
   one command with a positive timeout: `timeout N`, curl -m, wget -T, AbortSignal.timeout(N), or pg_isready;
I5 Apache-prefork WordPress: MaxRequestWorkers x worker_rss_mb + base_mb <= memory (both declared in the mpm conf);
I6 init: true -- a PID 1 that does not reap fills the pids cap with zombie healthcheck processes.
Why: WORKLOG 2026-10-24 (lobster-wordpress OOM-thrashed the host for 11 h; I6: lobster-redis hit pids 60/64).

  python scripts/check-compose-invariants.py              ENFORCED files + every tracked compose file is listed below
  python scripts/check-compose-invariants.py <file>...    those files only (e.g. the live copies on the host)
  python3 check-compose-invariants.py --running <file>... on the host: also each running container of those services --
      a compose edit takes effect only when the container is recreated (2026-10-24: 9 services had `init: true` in the
      file and not in the container). R1 Memory, R2 MemorySwap == Memory, R3 PidsLimit, R6 Init, each equal to the file;
      R4 the healthcheck the container runs (an image's own HEALTHCHECK included) bounds itself, as in I4.
Exit 1 = violations, or a file / Dockerfile that could not be read.
"""
import json
import os
import re
import subprocess
import sys

import yaml

ENFORCED = [
    "lobster-factory/infra/hetzner-phase1-core/docker-compose.yml",
    "lobster-factory/infra/soulful/docker-compose.yml",
    "lobster-factory/infra/mainwp/docker-compose.yml",
    "lobster-factory/infra/chatwoot/docker-compose.yml",
    "lobster-factory/infra/n8n/docker-compose.yml",
    "lobster-factory/infra/postiz/docker-compose.yml",
    "lobster-factory/infra/supabase/docker-compose.yml",
    "lobster-factory/infra/trigger/docker-compose.yml",
    "lobster-factory/infra/hetzner-eu/uptime-kuma-compose.yml",
    "lobster-factory/infra/hetzner-phase1-core/docker-compose.observability.yml",
    "lobster-factory/infra/hetzner-phase1-core/apps/video-service/docker-compose.video.yml",
    "lobster-factory/infra/hetzner-phase1-core/apps/remotion-service/docker-compose.remotion.yml",
    "Projects/internal/cognitive-engineering-os/docker-compose.yml",
    "Projects/internal/cognitive-engineering-os/ops/cognitive-db/docker-compose.cognitive-db.yml",
    "Projects/internal/ziwei-doushu/docker-compose.yml",   # prod: oracle-web at /opt/oracle (was listed as local dev)
]
# Not production. A new compose file must be added to one of the two lists.
PENDING = {
    "lobster-factory/infra/hetzner-phase1-core/docker-compose.staging.yml": "staging overlay",
    "lobster-factory/infra/hetzner-phase1-core/docker-compose.renderer-staging.yml": "staging overlay",
    "lobster-factory/infra/hetzner-phase1-core/docker-compose.recommended-ai-native.yml": "reference, not deployed",
    "Projects/internal/cognitive-engineering-os/ops/load-test/docker-compose.load.yml": "load test",
    "Projects/internal/cognitive-engineering-os/ops/load-test/docker-compose.patched.yml": "load test",
    "Projects/internal/hci30/infra/local/compose.dev.yml": "local dev",
    "Projects/internal/hci30/infra/local/compose.fetch-runner.yml": "local dev",
    "Projects/internal/hci30/infra/local/compose.test.yml": "local test",
}
# In the repo hci-app's build context lives outside apps/ (= sg-deploy.sh app_git_source_root); the host has it in apps/.
REPO_CONTEXT = {"./apps/hci-app": "../../../Projects/internal/hci30"}
COMPOSE_RE = re.compile(r"(^|/)(docker-)?compose[^/]*\.ya?ml$")
MPM_DEST = "/etc/apache2/mods-available/mpm_prefork.conf"


def to_bytes(v):
    m = re.fullmatch(r"(\d+(?:\.\d+)?)\s*([kmg]?)b?", str(v).strip().lower())
    if not m:
        return None
    return int(float(m.group(1)) * {"": 1, "k": 1 << 10, "m": 1 << 20, "g": 1 << 30}[m.group(2)])


POS = r"0*[1-9]\d*(?:\.\d+)?"   # a timeout of 0 means "no timeout" for timeout(1), curl and wget


def bounded(cmd):
    """One command (redirects and a trailing `|| exit 1` aside) carrying a positive timeout of its own.
    A closed set on purpose: shell operators are refused, not interpreted (codex rounds 1-2, 2026-10-24)."""
    one = re.sub(r"\s*\|\|\s*exit\s+1\s*$", "", re.sub(r"\s*\d*>&\d+|\s*>\s*/dev/null", "", cmd)).strip()
    if re.search(r"&&|\|\||[;|&`]|\$\(", one):   # also refuses $(...) and `...`
        return False
    return bool(re.match(rf"timeout\s+(-\S+\s+)*{POS}s?\s", one) or re.match(r"pg_isready\b", one)
                or (one.startswith("curl ") and re.search(rf"(\s-m\s*|--max-time[\s=]){POS}\b", one))
                or (one.startswith("wget ") and re.search(rf"(\s-T\s*|--timeout[\s=]){POS}\b", one))
                or re.search(rf"AbortSignal\.timeout\({POS}\)", one))


def hc_cmd(test):
    if isinstance(test, list):
        if not test or test[0] == "NONE":
            return None
        return " ".join(test[1:]) if test[0] in ("CMD", "CMD-SHELL") else " ".join(test)
    return test


def read(path):
    try:
        return open(path, encoding="utf-8").read()
    except (OSError, UnicodeDecodeError):
        return None


def wordpress_tag(ref):
    """'' or the tag when ref names the official wordpress image (tag, digest or library/ prefix), else None."""
    name = ref.split("/")[-1]
    base = re.split(r"[:@]", name, maxsplit=1)
    return (base[1] if len(base) > 1 else "") if base[0] == "wordpress" else None


def build_paths(base, svc):
    b = svc.get("build")
    if not b:
        return None, None
    rel = b if isinstance(b, str) else b.get("context", ".")
    ctx = os.path.join(base, rel)
    for prefix, repo_rel in REPO_CONTEXT.items():
        if not os.path.isdir(ctx) and rel.startswith(prefix):
            ctx = os.path.join(base, repo_rel + rel[len(prefix):])
    return ctx, os.path.join(ctx, "Dockerfile" if isinstance(b, str) else b.get("dockerfile", "Dockerfile"))


def limits(svc):
    lim = ((svc.get("deploy") or {}).get("resources") or {}).get("limits") or {}
    return lim, to_bytes(lim.get("memory", svc.get("mem_limit", ""))), lim.get("pids") or svc.get("pids_limit")


def docker_containers(path, name):
    """HostConfig of every container of service `name` created from compose file `path` (its compose labels)."""
    ids = subprocess.run(["docker", "ps", "-q", "--filter", f"label=com.docker.compose.service={name}"],
                         capture_output=True, text=True, check=True).stdout.split()
    fmt = ('{{index .Config.Labels "com.docker.compose.project.config_files"}}|{{.Name}}|{{.HostConfig.Memory}}|'
           '{{.HostConfig.MemorySwap}}|{{.HostConfig.PidsLimit}}|{{.HostConfig.Init}}|{{json .Config.Healthcheck}}')
    out = []
    for cid in ids:
        files, cname, mem, swap, pids, init, hc = subprocess.run(["docker", "inspect", "-f", fmt, cid], capture_output=True,
                                                                text=True, check=True).stdout.strip().split("|", 6)
        if os.path.abspath(path) in files.split(","):
            out.append({"name": cname.lstrip("/"), "Memory": int(mem), "MemorySwap": int(swap),
                        "PidsLimit": None if pids in ("", "<nil>") else int(pids), "Init": init == "true",
                        "Healthcheck": hc_cmd((json.loads(hc) or {}).get("Test"))})
    return out


def check_running(path, name, svc, containers=docker_containers):
    _, mem, pids = limits(svc)
    found = containers(path, name)
    if not found:
        print(f"NOTE {path}: {name}: no running container (not checked)")
    out = []
    for c in found:
        want = {"R1 Memory": mem, "R2 MemorySwap": mem, "R3 PidsLimit": int(pids) if pids else None, "R6 Init": True}
        got = {"R1 Memory": c["Memory"], "R2 MemorySwap": c["MemorySwap"], "R3 PidsLimit": c["PidsLimit"], "R6 Init": c["Init"]}
        out += [f"{k} of container {c['name']} is {got[k]}, file says {v} (recreate it)" for k, v in want.items() if got[k] != v]
        # The probe that actually runs: an image HEALTHCHECK of a non-built service is invisible to the file check (I4).
        if c.get("Healthcheck") and not bounded(c["Healthcheck"]):
            out.append(f"R4 container {c['name']} runs a healthcheck that does not bound itself: {c['Healthcheck'][:90]}")
    return out


def check_service(path, svc):
    base = os.path.dirname(path)
    out = []
    lim, mem, _ = limits(svc)
    if mem is None:
        out.append("I1 no memory limit")
    elif to_bytes(svc.get("memswap_limit", "")) != mem:
        out.append(f"I2 memswap_limit must equal memory ({lim.get('memory', svc.get('mem_limit'))})")
    if not (lim.get("pids") or svc.get("pids_limit")):
        out.append("I3 no pids limit")
    if svc.get("init") is not True:
        out.append("I6 no init: true")

    ctx, df = build_paths(base, svc)
    dockerfile = ""
    if df:
        dockerfile = read(df)
        if dockerfile is None:
            return out + [f"Dockerfile not readable at {df} (cannot check I4/I5)"]
    if "healthcheck" in svc:   # compose replaces the image's HEALTHCHECK
        hc = svc["healthcheck"] or {}
        probes = [] if hc.get("disable") or not hc_cmd(hc.get("test")) else [("healthcheck", hc_cmd(hc.get("test")))]
    else:
        probes = [("Dockerfile HEALTHCHECK", m.group(1))
                  for m in re.finditer(r"^HEALTHCHECK\b.*?\bCMD\s+(.*)$", dockerfile.replace("\\\n", " "), re.M)]
    out += [f"I4 {where} does not bound itself: {cmd[:90]}" for where, cmd in probes if not bounded(cmd)]

    stages = re.findall(r"^FROM\s+(?:--\S+\s+)*(\S+)", dockerfile, re.M)   # the last stage is the runtime image
    tag = wordpress_tag(stages[-1] if stages else str(svc.get("image", "")))
    if tag is None or "fpm" in tag:
        return out
    conf = None
    copies = re.findall(rf"^COPY\s+(\S+)\s+{re.escape(MPM_DEST)}\s*$", dockerfile, re.M)   # the last COPY wins
    if copies:
        conf = os.path.join(ctx, copies[-1])
    for v in svc.get("volumes") or []:
        parts = str(v).split(":")
        if len(parts) >= 2 and parts[1] == MPM_DEST:
            conf = os.path.join(base, parts[0])
    text = read(conf) if conf else None
    if text is None:
        return out + [f"I5 no readable mpm_prefork conf at {MPM_DEST} (image default = 150 workers)"]
    vals = {"MaxRequestWorkers": re.search(r"^\s*MaxRequestWorkers\s+(\d+)", text, re.M),
            **{k: re.search(rf"^#\s*{k}:\s*(\d+)", text, re.M) for k in ("worker_rss_mb", "base_mb")}}
    missing = [k for k, v in vals.items() if not v]
    if missing:
        return out + [f"I5 {os.path.basename(conf)} lacks {', '.join(missing)}"]
    w, rss, b = (int(vals[k].group(1)) for k in ("MaxRequestWorkers", "worker_rss_mb", "base_mb"))
    if mem is not None and (w * rss + b) << 20 > mem:
        out.append(f"I5 {w} workers x {rss} MB + {b} MB > memory {mem >> 20} MB")
    return out


def check_file(path, running=False):
    text = read(path)
    if text is None:
        return [f"{path}: not readable"]
    data = yaml.safe_load(text) or {}
    return [f"{path}: {name}: {v}" for name, svc in (data.get("services") or {}).items()
            for v in check_service(path, svc or {}) + (check_running(path, name, svc or {}) if running else [])]


def main(argv):
    problems = []
    running = "--running" in argv
    argv = [a for a in argv if a != "--running"]
    files = argv
    if not argv:
        root = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=True).stdout.strip()
        os.chdir(root)
        files = ENFORCED
        tracked = set(subprocess.run(["git", "ls-files"], capture_output=True, text=True, check=True).stdout.split("\n"))
        problems += [f"{f}: not listed in check-compose-invariants.py ENFORCED or PENDING"
                     for f in sorted(tracked) if COMPOSE_RE.search(f) and f not in ENFORCED and f not in PENDING]
        problems += [f"{f}: listed but not tracked" for f in ENFORCED + list(PENDING) if f not in tracked]
    for f in files:
        problems += check_file(f, running)
    for p in problems:
        print(p)
    print(f"check-compose-invariants: {len(files)} file(s), {len(problems)} problem(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
