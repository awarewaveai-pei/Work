#!/usr/bin/env python3
"""Mutation self-test for check-mocks.py: copies the five mocks plus design-system.css and partials/ to a temp folder,
injects one defect per case and requires the checker to exit 1 with a finding carrying the expected rule tag (and, when
given, the expected message text — so the case proves ITS rule, not a neighbour that happens to fire too) and no
traceback; the untouched copies must be green. domains.yaml is always the SPEC file.
Run:  python Projects/internal/cognitive-engineering-os/docs/mockups/check-mocks-selftest.py"""
import pathlib, re, shutil, subprocess, sys, tempfile
import mockkit as mk

HERE = mk.HERE
CHECK = HERE / "check-mocks.py"
FILES = mk.FILES
CSS = mk.DESIGN_SYSTEM.name
PAGE_MARK = "  /* == page-specific == */\n"
ALL = "*"            # every page
ALL_CSS = "*+css"    # every page AND the design-system.css copy (token rules must be proven without the "stylesheet differs" rule)

# (label, expected "tag" or "tag|message text", target file | ALL | ALL_CSS, kind, old, new)
# kind: "str" exact-once replace | "strall" replace every occurrence (>= 1) | "re" first regex match | "bytes" whole-file bytes
CASES = [
    ("light token drift", "U19|light token --accent", ALL_CSS, "str", "--accent:#0e5b50;--accent-hover", "--accent:#1b4d3e;--accent-hover"),
    ("explicit dark block drifts from media dark block", "theme|two dark blocks differ", ALL_CSS, "str", ':root[data-theme="dark"]{color-scheme:dark;--bg:#1c2b27', ':root[data-theme="dark"]{color-scheme:dark;--bg:#1c2b28'),
    ("dark media wrapper removed", "theme|dark block must be", ALL_CSS, "re", r'@media \(prefers-color-scheme: dark\)\{(:root:not\(\[data-theme="light"\]\)\{[^}]*\})\}', r"\1"),
    ("duplicate token in :root", "theme|defined twice", ALL_CSS, "str", "--bg:#f6f2e9;--card:#fffdf8", "--bg:#f6f2e9;--bg:#ffffff;--card:#fffdf8"),
    ("an extra theme block misses tokens", "theme|differently from the dark token set", ALL_CSS, "str", "  *{box-sizing:border-box}\n", '  :root[data-theme="sepia"]{color-scheme:light;--bg:#f0e6d2}\n  *{box-sizing:border-box}\n'),
    ("css before the shared block", "shared", "iceberg-result-mock.html", "str", "<style>\n  /* == shared", "<style>\n  .card{padding:0}\n  /* == shared"),
    ("second style block", "shared", "workflow-result-mock.html", "str", "</style>", "</style>\n<style>.stations{grid-template-columns:repeat(3,1fr)}</style>"),
    ("style tag with attribute", "shared", "workflow-result-mock.html", "str", "<style>", '<style media="all">'),
    ("shared block drifts in all pages together", "U20", ALL, "str", ".grid2c{display:grid;grid-template-columns:1fr;", ".grid2c{display:grid;grid-template-columns:1fr 1fr;"),
    ("shared block differs in one file", "shared|differs between files", "workflow-lesson-mock.html", "str", ".card{background:var(--card);border:1px solid var(--line);border-radius:12px;", ".card{background:var(--card);border:1px solid var(--line);border-radius:10px;"),
    ("@keyframes then a violation", "U20", "iceberg-result-mock.html", "str", PAGE_MARK, PAGE_MARK + "  @keyframes pulse{0%{opacity:0}100%{opacity:1}}\n  .kpi{grid-template-columns:1fr 1fr}\n"),
    ("repeat(2,1fr)", "U20", "iceberg-result-mock.html", "str", ".todos{display:grid;grid-template-columns:1fr;", ".todos{display:grid;grid-template-columns:repeat(2,1fr);"),
    ("auto-fill grid", "U20", "iceberg-result-mock.html", "str", ".charts{display:grid;grid-template-columns:1fr;", ".charts{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));"),
    ("three columns", "U20", "iceberg-result-mock.html", "str", "grid-template-columns:repeat(auto-fit,minmax(max(260px,calc(50% - 5px)),1fr))", "grid-template-columns:repeat(3,1fr)"),
    ("capped 2-col on a non-method grid", "U20", "iceberg-result-mock.html", "str", ".kpis{display:grid;grid-template-columns:1fr;", ".kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(max(260px,calc(50% - 5px)),1fr));"),
    ("page redefines a shared selector", "shared|redefines shared selector", "workflow-lesson-mock.html", "str", PAGE_MARK, PAGE_MARK + "  .btn{padding:4px}\n"),
    ("comma-list redefines a shared selector", "shared|redefines shared selector", "workflow-lesson-mock.html", "str", PAGE_MARK, PAGE_MARK + "  .station,.card{padding:0}\n"),
    ("page :root overrides a token", "shared|must not define tokens", "workflow-lesson-mock.html", "str", PAGE_MARK, PAGE_MARK + "  :root{--accent:var(--warn)}\n"),
    ("rgb() literal", "U19|literal colour", "workflow-lesson-mock.html", "str", PAGE_MARK, PAGE_MARK + "  .station{color:rgb(255,0,0)}\n"),
    ("min-width with a space", "responsive", "workflow-lesson-mock.html", "str", PAGE_MARK, PAGE_MARK + "  .station{min-width: 480px}\n"),
    ("inline style attribute", "theme|inline style", "iceberg-result-mock.html", "str", '<h3 class="mt6 mb8">', '<h3 class="mt6 mb8" style="color:#ff0000">'),
    ("page-specific css present", "theme|page-specific CSS", "workflow-result-mock.html", "str", PAGE_MARK, PAGE_MARK + "  .foo{margin:0}\n"),
    ("stylesheet edited in the mocks but not in design-system.css", "theme|stylesheet differs", ALL, "str", "  .mt8{margin-top:8px}\n", "  .mt8{margin-top:9px}\n"),
    ("unclosed rect inside svg", "html", "iceberg-result-mock.html", "str", '<rect x="0" y="150" width="1070" height="425" class="water" opacity="0.55"/>', '<rect x="0" y="150" width="1070" height="425" class="water" opacity="0.55">'),
    ("self-closing non-void html", "html", "workflow-result-mock.html", "str", '<span class="tag">已完成</span>', '<span class="tag"/>已完成'),
    ("crlf", "eol", "workflow-result-mock.html", "bytes", b"\n", b"\r\n"),
    ("second h1 on a page", "skeleton|exactly one h1", "home-mock.html", "str", "<h2>我的專案<small>2 個示範・0 個你自己的</small></h2>", "<h1>我的專案<small>2 個示範・0 個你自己的</small></h1>"),
    ("header lesson button moved out of .top (still a link)", "U15|header lesson button", "workflow-result-mock.html", "re", r'(<div class="top">.*?)(<a class="howto"[^>]*>[^<]*</a>)(</div>)', r"\1\3\2"),
    ("lesson mention split across tags, not a link", "U15|not a link", "workflow-result-mock.html", "str", '<a class="btn" href="#" title="SWOT 的方法課：P3 產出後接上">第一次用 SWOT？先看 5 分鐘的課 →</a>', '<span class="btn">第一次用 SWOT？先看 <b>5 分鐘</b>的課 →</span>'),
    ("a.btn without href or title", "U15|placeholder link", "workflow-result-mock.html", "str", '<a class="btn" href="#" title="SWOT 的方法課：P3 產出後接上">', '<a class="btn">'),
    ("fake skip link", "U15|skip link", "iceberg-lesson-mock.html", "str", '<a href="#start">跳過，直接開始</a>', "<u>跳過，直接開始</u>"),
    ("id=start on the wrong card", "U15|id=start", "iceberg-lesson-mock.html", "re", r'(<!-- 5 -->\n  <div class="card")(>.*?<!-- 6 -->\n  <div class="card") id="start"', r'\1 id="start"\2'),
    ("start step loses a button", "U15|three buttons", "workflow-lesson-mock.html", "re", r'\s*<span class="btn">開始我的決定<small>[^<]*</small></span>', ""),
    ("lesson loses its teaching-material card", "U15|教材版 card", "workflow-lesson-mock.html", "re", r'<h2>教材版：給老師／帶領者<small>[^<]*</small></h2>', "<h2>附錄</h2>"),
    ("teaching-material card loses a section", "U15|lacks the 討論題", "iceberg-lesson-mock.html", "str", "<summary><b>討論題（3 題）</b></summary>", "<summary><b>問答</b></summary>"),
    ("status strip drops the teaching-material note", "U15|teaching-material", "iceberg-lesson-mock.html", "str", "<span>底部有教材版（給老師／帶領者）</span>", ""),
    ("self-check quiz removed", "U15|quiz", "iceberg-lesson-mock.html", "re", r'<div class="quiz">.*?</div>\n    </div>\n  </div>', "</div>"),
    ("a section loses its 怎麼讀 strip", "§3.10|must open with", "iceberg-result-mock.html", "re", r'<div class="how">.*?</div>', ""),
    ("怎麼讀 strip not first in its card", "§3.10|must open with", "iceberg-result-mock.html", "str", '<h2>⑤ 總結：在哪一層出手</h2>\n    <div class="how">', '<h2>⑤ 總結：在哪一層出手</h2>\n    <p>x</p>\n    <div class="how">'),
    ("result first card loses the three reading steps", "U14|three .todo steps", "workflow-result-mock.html", "str", '<div class="todos">', '<div class="steps3">'),
    ("result first card loses the four terms", "U14|四個詞", "iceberg-result-mock.html", "re", r'<div class="terms">.*?</div>', ""),
    ("result footer loses the expert-mode details", "expert", "workflow-result-mock.html", "re", r'<details class="mt10"><summary>專家模式.*?</details>', ""),
    ("a bad example removed from a pair (M6)", "M6|good/bad group has", "workflow-lesson-mock.html", "re", r'\s*<div class="bad"><b>壞</b>：第 1 站寫「希望變好」。（好在哪？誰看得到？）</div>', ""),
    ("好／壞 boxes outside any .gb (M6)", "M6|outside a .gb", "workflow-lesson-mock.html", "str", '<div class="todos">\n      <div class="todo"><b>一站一站走</b>', '<div class="good"><b>好</b>：x</div><div class="bad"><b>壞</b>：y</div>\n    <div class="todos">\n      <div class="todo"><b>一站一站走</b>'),
    ("a stray 好 box beside the domain variants inside a .gb (M6)", "M6|good/bad group has", "iceberg-lesson-mock.html", "str", '<div class="gb"><div class="ex" data-set="edd"><div class="good"><b>好</b>：第 6 次 session 8 人只有 2 人主動分享；第 1 次是 6 人。</div>', '<div class="gb"><div class="good"><b>好</b>：x</div><div class="ex" data-set="edd"><div class="good"><b>好</b>：第 6 次 session 8 人只有 2 人主動分享；第 1 次是 6 人。</div>'),
    ("an .ex without data-set (hidden forever after a click)", "D18|without data-set", "iceberg-lesson-mock.html", "str", '<p class="sub mt10 mb0">記法：事件是「一次」', '<p class="ex">先在心裡寫一句再往下。</p>\n    <p class="sub mt10 mb0">記法：事件是「一次」'),
    ("one example group misses a set", "D18|example group has", "iceberg-lesson-mock.html", "re", r'\s*<div class="ex" data-set="ecom" hidden>[^<]*</div>', ""),
    ("chip label edited in a page instead of domains.yaml", "partials|differs from partials", "workflow-lesson-mock.html", "str", ">合作對象</button>", ">合作夥伴</button>"),
    ("chip set changed on one page", "U21|chip sets", "workflow-lesson-mock.html", "str", '<button class="chip" role="tab" aria-selected="false" data-set="daily"', '<button class="chip" role="tab" aria-selected="false" data-set="misc"'),
    ("chip row unmarked (partial dropped)", "partials|required partial", "iceberg-lesson-mock.html", "re", r"\n\s*<!-- == partial: domain-chips: (?:start[^\n]*|end == -->)", ""),
    ("chip script edited in one page only", "partials|differs from partials", "iceberg-lesson-mock.html", "str", 'c.classList.toggle("on", c === chip);', 'c.classList.toggle("on", c == chip);'),
    ("chip script scoped back to step 2 only", "D18|switch every example group", "iceberg-lesson-mock.html", "str", 'querySelectorAll(".ex")', 'querySelectorAll("#examples .ex")'),
    ("demo button loses its per-domain variants", "D18|example groups", "iceberg-lesson-mock.html", "re", r'<small><span class="ex" data-set="edd">主動分享 6 → 2 人那個例子，已填好，按執行就看結果</span>.*?</small>', "<small>主動分享 6 → 2 人那個例子，已填好，按執行就看結果</small>"),
    ("a non-default example left visible", "D18|may be visible", "iceberg-lesson-mock.html", "re", r'(<div class="ex" data-set="partner") hidden(>\s*<p class="lead">合作對象)', r"\1\2"),
    ("the .ex marker class gets a box style (leaks into buttons)", "D18|must not be styled", "workflow-lesson-mock.html", "str", PAGE_MARK, PAGE_MARK + "  .ex{border:1px solid var(--line);padding:8px}\n"),
    ("the [hidden] invariant is dropped from the shared css", "D18|[hidden]", ALL_CSS, "str", "  [hidden]{display:none!important}\n", ""),
    ("tablist chip without aria", "a11y|tablist", "iceberg-lesson-mock.html", "str", 'role="tab" aria-selected="false" data-set="partner"', 'data-set="partner"'),
    ("svg without aria-label", "a11y|svg", "iceberg-lesson-mock.html", "re", r'<svg([^>]*) aria-label="[^"]*"', r"<svg\1"),
    ("select element", "ux", "workflow-lesson-mock.html", "str", "</body>", "<select></select>\n</body>"),
    ("partner link removed", "links|no link to", "iceberg-lesson-mock.html", "str", "https://claude.ai/artifact/7JLjM7mGyqTMLJmCMUmWqq", "https://claude.ai/artifact/0000000000000000000000"),
    ("home loses every link to the workflow overview", "links|no link to", "home-mock.html", "strall", "7xEwPu9Cp2rWf3P8g9X1Pk", "0000000000000000000000"),
    ("crumbs line removed", "links|.crumbs", "workflow-result-mock.html", "re", r'\s*<div class="crumbs">.*?</div>', ""),
    ("crumbs lose the home link", "links|link 首頁", "iceberg-lesson-mock.html", "re", r'<div class="crumbs"><a href="[^"]*">首頁</a>', '<div class="crumbs">首頁'),
    ("second status strip (no pill inside)", "status|status strip missing or duplicated", "iceberg-result-mock.html", "str", "</body>", '<div class="status"><span>x</span></div>\n</body>'),
    ("home loses the problem box", "U16", "home-mock.html", "re", r"<textarea[^>]*></textarea>", ""),
    ("home project table loses its anchor", "U8|id=projects", "home-mock.html", "str", '<div class="card" id="projects">', '<div class="card">'),
    # continuity: the expected message names the loop each case proves (a mutation may trip more than one loop)
    ("page fact removed (PAGE_FACTS)", "continuity|fact missing", "iceberg-result-mock.html", "str", "主動分享人數（8 人團體）", "主動分享人數（8 人團隊）"),
    ("start step loses its preparation intro (PAGE_FACTS)", "continuity|fact missing", "workflow-lesson-mock.html", "str", "<p>手邊有這些會走得比較快，沒有也可以先走、之後補：</p>\n", ""),
    ("an approved plain-language layer line is dropped (PAGE_FACTS)", "continuity|fact missing", "iceberg-lesson-mock.html", "str", '<text x="30" y="62" font-size="15" font-weight="700">看得見：發生了什麼</text>', '<text x="30" y="62" font-size="12" class="m">看得見 Visible</text>'),
    ("one copy of a pinned number drifts (NUMBER_PINS)", "continuity|number drifted", "iceberg-lesson-mock.html", "re", r"第 1 次是 6 人", "第 1 次是 7 人"),
    ("home quotes the demo project with another number (NUMBER_PINS)", "continuity|number drifted", "home-mock.html", "str", "主動分享 6 → 2 人", "主動分享 6 → 1 人"),
    ("station time drifts on one page (NUMBER_PINS sequence)", "continuity|sequence drifted", "workflow-result-mock.html", "re", r"約 3 分鐘・約 NT\$1", "約 6 分鐘・約 NT$1"),
    ("the old story's phrase returns (FORBID)", "continuity|superseded text", "iceberg-lesson-mock.html", "str", "例：「參與者需要專家幫他們看見意義。」", "例：「創作本身就是療癒，回頭講會破壞當下。」"),
    ("route lesson brings back its superseded partner story (FORBID)", "continuity|superseded text", "workflow-lesson-mock.html", "str", "下一檔展覽要不要續約那家近一年每檔都延後付款的畫廊", "要不要和某藝術治療機構合辦 WuSheng 課程"),
    ("route lesson shortens a SWOT label back to S: (FORBID)", "continuity|superseded text", "workflow-lesson-mock.html", "str", "<b>S 強項：</b>週末班口碑好", "<b>S：</b>週末班口碑好"),
    ("superseded fill count returns (FORBID)", "continuity|superseded text", "workflow-result-mock.html", "str", "自動填第 1 格（要決定什麼）", "自動填 2 欄"),
    ("route order differs between the workflow pages (PAIR_FACTS)", "continuity|fact shared with", "workflow-result-mock.html", "str", "問題陳述 → SWOT → 加權決策矩陣", "問題陳述 → 加權決策矩陣 → SWOT"),
    ("lesson drops the shared success condition (PAIR_FACTS)", "continuity|fact shared with", "workflow-lesson-mock.html", "re", r"遠地至少 3 人", "遠地至少 5 人"),
    ("home shows another station count than the overview (PAIR_FACTS)", "continuity|fact shared with", "home-mock.html", "str", "已完成 1/3 站", "已完成 2/3 站"),
    ("lesson iceberg polygon drifts from the result page's (ICEBERG_SHAPE)", "continuity|iceberg drawing", "iceberg-lesson-mock.html", "str", 'L420,290 Z" fill="url(#ice)"', 'L420,292 Z" fill="url(#ice)"'),
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
            for f in FILES + [CSS]: shutil.copyfile(HERE / f, tmp / f)
            if (tmp / "partials").exists(): shutil.rmtree(tmp / "partials")
            shutil.copytree(mk.PARTIALS, tmp / "partials")
        reset()
        rc, out = run_checker(tmp)
        if rc != 0: print("baseline is not green:\n" + out); return 1
        for label, expect, target, kind, old, new in CASES:
            reset()
            targets = FILES + [CSS] if target == ALL_CSS else FILES if target == ALL else [target]
            setup_ok = True
            for f in targets:
                p = tmp / f
                if kind == "bytes":
                    p.write_bytes(p.read_bytes().replace(old, new)); continue
                s = p.read_text(encoding="utf-8")
                if kind == "str":
                    if s.count(old) != 1: print(f"SETUP  {label}: anchor found {s.count(old)}x in {f}"); setup_ok = False; break
                    s = s.replace(old, new)
                elif kind == "strall":
                    if s.count(old) < 1: print(f"SETUP  {label}: anchor not found in {f}"); setup_ok = False; break
                    s = s.replace(old, new)
                else:
                    s, n = re.subn(old, new, s, count=1, flags=re.S)
                    if n != 1: print(f"SETUP  {label}: regex matched nothing in {f}"); setup_ok = False; break
                p.write_text(s, encoding="utf-8", newline="\n")
            if not setup_ok: failures += 1; continue
            rc, out = run_checker(tmp)
            tag, _, msg = expect.partition("|")
            hit = [ln for ln in out.splitlines() if f"[{tag}]" in ln and msg in ln]
            ok = rc == 1 and "Traceback" not in out and bool(hit)
            failures += 0 if ok else 1
            first = (hit or out.strip().splitlines() or [""])[0]
            print(("CAUGHT " if ok else "MISSED ") + f"{label} -> {first[:120]}")
    print(f"selftest: {len(CASES)} mutations, {len(CASES) - failures} caught, {failures} missed")
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
