#!/usr/bin/env python3
"""Publish helper: turn a repo mock into the Artifact page body (the publisher wraps its own skeleton).
Runs check-mocks.py first and refuses to build while it is red. No colour or layout rewriting happens here:
the mock is the spec. Run:  python Projects/internal/cognitive-engineering-os/docs/mockups/build-artifact.py <out-dir> [mock ...]
Output names: home-mock.html -> home.html, iceberg-result-mock.html -> iceberg-analysis.html, iceberg-lesson-mock.html ->
iceberg-lesson.html, workflow-result-mock.html -> workflow-overview.html, workflow-lesson-mock.html -> workflow-lesson.html."""
import pathlib, re, subprocess, sys
import mockkit as mk

OUT_NAME = {"home-mock.html": "home.html", "iceberg-result-mock.html": "iceberg-analysis.html", "iceberg-lesson-mock.html": "iceberg-lesson.html",
            "workflow-result-mock.html": "workflow-overview.html", "workflow-lesson-mock.html": "workflow-lesson.html"}
assert set(OUT_NAME) == set(mk.FILES), "OUT_NAME must name every mock in mockkit.FILES"


def build(name, out_dir):
    src = (mk.HERE / name).read_text(encoding="utf-8")
    title = re.search(r"<title>.*?</title>", src, re.S).group(0)
    styles = re.findall(r"<style>.*?</style>", src, re.S)
    head = re.search(r"<head>(.*?)</head>", src, re.S).group(1)
    body = re.search(r"<body>(.*?)</body>", src, re.S).group(1).strip("\n")
    scripts = re.findall(r"<script\b[^>]*>.*?</script>", head, re.S)   # head scripts run after the body they touch
    if len(styles) != 1 or len(scripts) != src.count("<script"):
        raise SystemExit(f"{name}: expected one <style> and every <script> in <head> (styles={len(styles)}, head scripts={len(scripts)}, total scripts={src.count('<script')})")
    out = f'{title}\n{styles[0]}\n<div lang="zh-Hant">\n{body}\n</div>\n' + "".join(scripts) + "\n"
    dest = out_dir / OUT_NAME[name]
    dest.write_text(out, encoding="utf-8", newline="\n")
    print(f"{name} -> {dest} ({len(out.encode('utf-8'))} bytes)")


def main(argv):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")   # findings carry CJK; a cp950 pipe must not crash the refusal
    except Exception:
        pass
    if not argv or any(a not in OUT_NAME for a in argv[1:]):
        print(f"usage: build-artifact.py <out-dir> [{' | '.join(OUT_NAME)}]"); return 2
    gate = subprocess.run([sys.executable, str(mk.HERE / "check-mocks.py")], capture_output=True, text=True, encoding="utf-8", errors="replace")
    if gate.returncode != 0:
        print((gate.stdout + gate.stderr).strip()); print("build-artifact: refused, check-mocks.py is red"); return 1
    out_dir = pathlib.Path(argv[0]); out_dir.mkdir(parents=True, exist_ok=True)
    for name in argv[1:] or list(OUT_NAME): build(name, out_dir)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
