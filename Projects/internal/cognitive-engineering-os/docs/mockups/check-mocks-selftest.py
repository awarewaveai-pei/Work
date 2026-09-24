#!/usr/bin/env python3
"""Mutation self-test for check-mocks.py: copies the four mocks to a temp folder, injects one defect per case and
requires the checker to exit 1 with a finding carrying the expected rule tag and no traceback; the untouched copies
must be green. Run:  python Projects/internal/cognitive-engineering-os/docs/mockups/check-mocks-selftest.py"""
import pathlib, re, shutil, subprocess, sys, tempfile

HERE = pathlib.Path(__file__).resolve().parent
CHECK = HERE / "check-mocks.py"
FILES = ["iceberg-result-mock.html", "iceberg-lesson-mock.html", "workflow-result-mock.html", "workflow-lesson-mock.html"]
PAGE_MARK = "  /* == page-specific == */\n"
ALL = "*"

# (label, expected rule tag, file or ALL, kind, old, new)   kind: "str" exact-once replace | "re" first regex match | "bytes" whole-file bytes
CASES = [
    ("light token drift in one file", "U19", "workflow-result-mock.html", "str", "--accent:#0e5b50;--accent-hover", "--accent:#1b4d3e;--accent-hover"),
    ("explicit dark block drifts from media dark block", "theme", "iceberg-lesson-mock.html", "str", ':root[data-theme="dark"]{color-scheme:dark;--bg:#1c2b27', ':root[data-theme="dark"]{color-scheme:dark;--bg:#1c2b28'),
    ("dark media wrapper removed", "theme", "iceberg-lesson-mock.html", "re", r'@media \(prefers-color-scheme: dark\)\{(:root:not\(\[data-theme="light"\]\)\{[^}]*\})\}', r"\1"),
    ("duplicate token in :root", "theme", "workflow-lesson-mock.html", "str", "--bg:#f6f2e9;--card:#fffdf8", "--bg:#f6f2e9;--bg:#ffffff;--card:#fffdf8"),
    ("css before the shared block", "shared", "iceberg-result-mock.html", "str", "<style>\n  /* == shared", "<style>\n  .card{padding:0}\n  /* == shared"),
    ("second style block", "shared", "workflow-result-mock.html", "str", "</style>", "</style>\n<style>.stations{grid-template-columns:repeat(3,1fr)}</style>"),
    ("style tag with attribute", "shared", "workflow-result-mock.html", "str", "<style>", '<style media="all">'),
    ("shared block drifts in all four together", "U20", ALL, "str", ".grid2c{display:grid;grid-template-columns:1fr;", ".grid2c{display:grid;grid-template-columns:1fr 1fr;"),
    ("shared block differs in one file", "shared", "workflow-lesson-mock.html", "str", ".card{background:var(--card);border:1px solid var(--line);border-radius:12px;", ".card{background:var(--card);border:1px solid var(--line);border-radius:10px;"),
    ("@keyframes then a violation", "U20", "iceberg-result-mock.html", "str", PAGE_MARK, PAGE_MARK + "  @keyframes pulse{0%{opacity:0}100%{opacity:1}}\n  .kpi{grid-template-columns:1fr 1fr}\n"),
    ("repeat(2,1fr)", "U20", "iceberg-result-mock.html", "str", ".todos{display:grid;grid-template-columns:1fr;", ".todos{display:grid;grid-template-columns:repeat(2,1fr);"),
    ("auto-fill grid", "U20", "iceberg-result-mock.html", "str", ".charts{display:grid;grid-template-columns:1fr;", ".charts{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));"),
    ("three columns", "U20", "iceberg-result-mock.html", "str", "grid-template-columns:repeat(auto-fit,minmax(max(260px,calc(50% - 5px)),1fr))", "grid-template-columns:repeat(3,1fr)"),
    ("capped 2-col on a non-method grid", "U20", "iceberg-result-mock.html", "str", ".kpis{display:grid;grid-template-columns:1fr;", ".kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(max(260px,calc(50% - 5px)),1fr));"),
    ("page redefines a shared selector", "shared", "workflow-lesson-mock.html", "str", PAGE_MARK, PAGE_MARK + "  .btn{padding:4px}\n"),
    ("comma-list redefines a shared selector", "shared", "workflow-lesson-mock.html", "str", PAGE_MARK, PAGE_MARK + "  .station,.card{padding:0}\n"),
    ("page :root overrides a token", "shared", "workflow-lesson-mock.html", "str", PAGE_MARK, PAGE_MARK + "  :root{--accent:var(--warn)}\n"),
    ("rgb() literal", "U19", "workflow-lesson-mock.html", "str", PAGE_MARK, PAGE_MARK + "  .station{color:rgb(255,0,0)}\n"),
    ("min-width with a space", "responsive", "workflow-lesson-mock.html", "str", PAGE_MARK, PAGE_MARK + "  .station{min-width: 480px}\n"),
    ("literal colour in inline style outside svg", "U19", "iceberg-result-mock.html", "str", '<h3 style="margin:6px 0 8px">', '<h3 style="margin:6px 0 8px;color:#ff0000">'),
    ("unclosed rect inside svg", "html", "iceberg-result-mock.html", "str", '<rect x="0" y="150" width="1070" height="425" class="water" opacity="0.55"/>', '<rect x="0" y="150" width="1070" height="425" class="water" opacity="0.55">'),
    ("self-closing non-void html", "html", "workflow-result-mock.html", "str", '<span class="tag">已完成</span>', '<span class="tag"/>已完成'),
    ("crlf", "eol", "workflow-result-mock.html", "bytes", b"\n", b"\r\n"),
    ("header lesson button removed", "U15", "workflow-result-mock.html", "re", r'<a class="howto" href="[^"]*">([^<]*)</a>', r'<span class="k">\1</span>'),
    ("lesson mention split across tags, not a link", "U15", "workflow-result-mock.html", "str", '<a class="btn" href="#" title="SWOT 的方法課：P3 產出後接上">第一次用 SWOT？先看 5 分鐘的課 →</a>', '<span class="btn">第一次用 SWOT？先看 <b>5 分鐘</b>的課 →</span>'),
    ("a.btn without href or title", "U15", "workflow-result-mock.html", "str", '<a class="btn" href="#" title="SWOT 的方法課：P3 產出後接上">', '<a class="btn">'),
    ("fake skip link", "U15", "iceberg-lesson-mock.html", "str", '<a href="#start">跳過，直接開始</a>', "<u>跳過，直接開始</u>"),
    ("id=start on the wrong card", "U15", "iceberg-lesson-mock.html", "re", r'(<!-- 5 -->\n  <div class="card")(>.*?<!-- 6 -->\n  <div class="card") id="start"', r'\1 id="start"\2'),
    ("a section loses its 怎麼讀 strip", "§3.10", "iceberg-result-mock.html", "re", r'<div class="how">.*?</div>', ""),
    ("one example group misses a set", "D18", "iceberg-lesson-mock.html", "re", r'\s*<div class="ex" data-set="ecom" hidden>[^<]*</div>', ""),
    ("chip set changed", "D18", "workflow-lesson-mock.html", "str", '<button class="chip" role="tab" aria-selected="false" data-set="daily"', '<button class="chip" role="tab" aria-selected="false" data-set="misc"'),
    ("chip script scoped back to step 2 only", "D18", "iceberg-lesson-mock.html", "str", 'querySelectorAll(".ex")', 'querySelectorAll("#examples .ex")'),
    ("demo button loses its per-domain variants", "D18", "iceberg-lesson-mock.html", "re", r'<small><span class="ex" data-set="edd">主動分享 6 → 2 人那個例子，已填好，按執行就看結果</span>.*?</small>', "<small>主動分享 6 → 2 人那個例子，已填好，按執行就看結果</small>"),
    ("a non-default example left visible", "D18", "iceberg-lesson-mock.html", "re", r'(<div class="ex" data-set="partner") hidden(>\s*<p class="lead">合作對象)', r"\1\2"),
    ("the .ex marker class gets a box style (leaks into buttons)", "D18", "workflow-lesson-mock.html", "str", PAGE_MARK, PAGE_MARK + "  .ex{border:1px solid var(--line);padding:8px}\n"),
    ("the [hidden] invariant is dropped from the shared css", "D18", ALL, "str", "  [hidden]{display:none!important}\n", ""),
    ("tablist chip without aria", "a11y", "iceberg-lesson-mock.html", "str", 'role="tab" aria-selected="false" data-set="partner"', 'data-set="partner"'),
    ("svg without aria-label", "a11y", "iceberg-lesson-mock.html", "re", r'<svg([^>]*) aria-label="[^"]*"', r"<svg\1"),
    ("select element", "ux", "workflow-lesson-mock.html", "str", "</body>", "<select></select>\n</body>"),
    ("partner link removed", "links", "iceberg-lesson-mock.html", "str", "https://claude.ai/artifact/7JLjM7mGyqTMLJmCMUmWqq", "https://claude.ai/artifact/0000000000000000000000"),
    ("second status strip", "status", "iceberg-result-mock.html", "str", "</body>", '<div class="status"><span class="pill">x</span></div>\n</body>'),
    # continuity: each case exercises exactly one of the four continuity loops
    ("page fact changed to a value no other rule forbids (PAGE_FACTS)", "continuity", "iceberg-result-mock.html", "str", "主動分享 6 → 2 人", "主動分享 6 → 3 人"),
    ("one copy of a pinned number drifts (NUMBER_PINS)", "continuity", "iceberg-lesson-mock.html", "re", r"第 1 次是 6 人", "第 1 次是 7 人"),
    ("the old story's phrase returns (FORBID)", "continuity", "iceberg-lesson-mock.html", "str", "例：「參與者需要專家幫他們看見意義。」", "例：「創作本身就是療癒，回頭講會破壞當下。」"),
    ("superseded fill count returns (FORBID)", "continuity", "workflow-result-mock.html", "str", "自動填第 1 格（要決定什麼）", "自動填 2 欄"),
    ("route order differs between the workflow pages (PAIR_FACTS)", "continuity", "workflow-result-mock.html", "str", "問題陳述 → SWOT → 加權決策矩陣", "問題陳述 → 加權決策矩陣 → SWOT"),
    ("station time drifts on one page (PAIR_FACTS)", "continuity", "workflow-result-mock.html", "re", r"約 3 分鐘・約 NT\$1", "約 6 分鐘・約 NT$1"),
    ("lesson drops the shared success condition (PAIR_FACTS)", "continuity", "workflow-lesson-mock.html", "re", r"遠地至少 3 人", "遠地至少 5 人"),
    ("lesson iceberg polygon drifts from the result page's (ICEBERG_SHAPE)", "continuity", "iceberg-lesson-mock.html", "str", 'L420,290 Z" fill="url(#ice)"', 'L420,292 Z" fill="url(#ice)"'),
    ("an approved plain-language layer line is dropped (PAGE_FACTS)", "continuity", "iceberg-lesson-mock.html", "str", '<text x="30" y="62" font-size="15" font-weight="700">看得見：發生了什麼</text>', '<text x="30" y="62" font-size="12" class="m">看得見 Visible</text>'),
]


def run_checker(folder):
    r = subprocess.run([sys.executable, str(CHECK), "--dir", str(folder)], capture_output=True, text=True, encoding="utf-8", errors="replace")
    return r.returncode, (r.stdout or "") + (r.stderr or "")


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    failures = 0
    with tempfile.TemporaryDirectory() as td:
        tmp = pathlib.Path(td)
        def reset():
            for f in FILES: shutil.copyfile(HERE / f, tmp / f)
        reset()
        rc, out = run_checker(tmp)
        if rc != 0: print("baseline is not green:\n" + out); return 1
        for label, tag, target, kind, old, new in CASES:
            reset()
            for f in (FILES if target == ALL else [target]):
                p = tmp / f
                if kind == "bytes":
                    p.write_bytes(p.read_bytes().replace(old, new))
                else:
                    s = p.read_text(encoding="utf-8")
                    if kind == "str":
                        if s.count(old) != 1: print(f"SETUP  {label}: anchor found {s.count(old)}x in {f}"); failures += 1; continue
                        s = s.replace(old, new)
                    else:
                        s, n = re.subn(old, new, s, count=1, flags=re.S)
                        if n != 1: print(f"SETUP  {label}: regex matched nothing in {f}"); failures += 1; continue
                    p.write_text(s, encoding="utf-8", newline="\n")
            rc, out = run_checker(tmp)
            first = (out.strip().splitlines() or [""])[0]
            ok = rc == 1 and "Traceback" not in out and f"[{tag}]" in out
            failures += 0 if ok else 1
            print(("CAUGHT " if ok else "MISSED ") + f"{label} -> {first[:120]}")
    print(f"selftest: {len(CASES)} mutations, {len(CASES) - failures} caught, {failures} missed")
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
