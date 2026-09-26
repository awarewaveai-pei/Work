#!/usr/bin/env python3
"""Mutation self-test for check-mocks.py: copies the five mocks plus design-system.css and partials/ to a temp folder,
injects one defect per case and requires the checker to exit 1 with a finding carrying the expected rule tag (and, when
given, the expected message text — so the case proves ITS rule, not a neighbour that happens to fire too) and no
traceback; the untouched copies must be green, and so must every ACCEPT variant (valid input the checker once rejected — a
false red is a defect too). domains.yaml is always the SPEC file.
Coverage: the checker runs traced (CHECK_MOCKS_TRACE), so each expected line names the rule (self.bad call site) that
raised it; every call site must be proven by some case, except the rules in NO_CASE_YET (a list that may only shrink:
a listed rule that gains a case, or no longer exists, fails the run until it is removed from the list).
Run:  python Projects/internal/cognitive-engineering-os/docs/mockups/check-mocks-selftest.py"""
import ast, os, pathlib, re, shutil, subprocess, sys, tempfile
import mockkit as mk

HERE = mk.HERE
CHECK = HERE / "check-mocks.py"
FILES = mk.FILES
CSS = mk.DESIGN_SYSTEM.name
PAGE_MARK = "  /* == page-specific == */\n"
ALL = "*"            # every page
ALL_CSS = "*+css"    # every page AND the design-system.css copy (token rules must be proven without the "stylesheet differs" rule)

# (label, expected "tag" or "tag|message text", target file | ALL | ALL_CSS, kind, old, new)
# kind: "str" exact-once replace | "strall" replace every occurrence (>= 1) | "re" first regex match | "reall" every regex match (>= 1)
#       | "bytes" whole-file bytes | "delete" remove the file. target: a page, ALL, ALL_CSS, "partials/<name>.html", "design-system.css",
#       or "spec:<path under SPEC>" (the checker then reads a copy of the registries through AI_LEGO_SPEC_ROOT)
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
    ("second h1 on a page", "skeleton|exactly one h1 per page", "iceberg-result-mock.html", "str", "<h1>冰山模型分析", "<h1>另一個標題</h1><h1>冰山模型分析"),
    ("header lesson button moved out of .top (still a link)", "U15|header lesson button", "workflow-result-mock.html", "re", r'(<div class="top">.*?)(<a class="howto"[^>]*>[^<]*</a>)(</div>)', r"\1\3\2"),
    ("lesson mention split across tags, not a link", "U15|lesson mention", "workflow-result-mock.html", "str", '<main class="wrap">\n', '<main class="wrap">\n  <p>回頭看 <b>3 分鐘</b>的課</p>\n'),
    ("a link with no destination (href=#)", "controls|link without a destination", "workflow-result-mock.html", "str", '<main class="wrap">\n', '<main class="wrap">\n  <a class="btn" href="#">之後</a>\n'),
    ("the start card's main button leads nowhere again (no #new: the empty fields)", "U15|the start card's only primary button", "iceberg-lesson-mock.html", "str", '<a class="btn primary big" href="https://claude.ai/artifact/7JLjM7mGyqTMLJmCMUmWqq#new">', '<a class="btn primary big" href="https://claude.ai/artifact/7JLjM7mGyqTMLJmCMUmWqq">'),
    ("the demo button outranks the start button", "U15|the start card's only primary button", "workflow-lesson-mock.html", "str", '<a class="btn" href="https://claude.ai/artifact/7xEwPu9Cp2rWf3P8g9X1Pk#demo">', '<a class="btn primary" href="https://claude.ai/artifact/7xEwPu9Cp2rWf3P8g9X1Pk#demo">'),
    ("the start card loses its accent frame (.cta)", "U15|id=start must be the .card.cta", "iceberg-lesson-mock.html", "str", '<div class="card cta" id="start">', '<div class="card" id="start">'),
    ("start step loses a button", "U15|three buttons", "workflow-lesson-mock.html", "re", r'\s*<a class="btn ghost" href="https://claude\.ai/artifact/5j9jef81ts5mqmYpVARNmJ#ask">這條路適合我的問題嗎？<small>[^<]*</small></a>', ""),
    ("lesson loses its teaching-material card", "U15|教材版 card", "workflow-lesson-mock.html", "re", r'<h2>教材版：給老師／帶領者<small>[^<]*</small></h2>', "<h2>附錄</h2>"),
    ("teaching-material card loses a section", "U15|lacks the 討論題", "iceberg-lesson-mock.html", "str", "<summary><b>討論題（3 題）</b></summary>", "<summary><b>問答</b></summary>"),
    ("status strip drops the teaching-material note", "U15|教材版 tab", "iceberg-lesson-mock.html", "str", "<span>教材版在「教材版」分頁（給老師／帶領者）</span>", ""),
    ("self-check quiz removed", "U15|quiz", "iceberg-lesson-mock.html", "re", r'<div class="quiz">.*?</div>\n    </div>\n  </div>', "</div>"),
    ("a section loses its 怎麼讀 strip", "§3.10|must open with", "iceberg-result-mock.html", "re", r'<div class="how">.*?</div>', ""),
    ("怎麼讀 strip not first in its card", "§3.10|must open with", "iceberg-result-mock.html", "str", '<h2>⑤ 總結：在哪一層出手</h2>\n    <div class="how">', '<h2>⑤ 總結：在哪一層出手</h2>\n    <p>x</p>\n    <div class="how">'),
    ("the lesson's read tab loses its three reading steps", "U14|lacks the reading guide: three .todo", "workflow-lesson-mock.html", "str", '<div class="todos">\n      <div class="todo"><b>① 先看站列</b>', '<div class="steps3">\n      <div class="todo"><b>① 先看站列</b>'),
    ("the read tab loses the four terms", "U14|四個詞", "iceberg-lesson-mock.html", "re", r'<div class="terms">.*?</div>', ""),
    ("result footer loses the expert-mode details", "expert", "workflow-result-mock.html", "re", r'<details class="mt10" id="expert"><summary>專家模式.*?</details>', ""),
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
    ("partner link removed", "links|no link to", "iceberg-lesson-mock.html", "strall", "https://claude.ai/artifact/7JLjM7mGyqTMLJmCMUmWqq", "https://claude.ai/artifact/0000000000000000000000"),
    ("home loses every link to the workflow overview", "links|no link to", "home-mock.html", "strall", "7xEwPu9Cp2rWf3P8g9X1Pk", "0000000000000000000000"),
    ("unlinked text before the crumbs link", "links|starting with a link 工具", "iceberg-lesson-mock.html", "str", '<div class="crumbs"><a', '<div class="crumbs">首頁 › <a'),
    ("the start-here card lands in the tools view (placement)", "U1|#featured belongs in the home view", "home-mock.html", "str", '<div class="top"><div><h1>工具</h1>', '<div class="top" id="featured"><div><h1>工具</h1>'),
    ("crumbs line removed", "links|.crumbs", "workflow-result-mock.html", "re", r'\s*<div class="crumbs">.*?</div>', ""),
    ("crumbs lose the link to their menu item", "links|starting with a link 工具", "iceberg-lesson-mock.html", "re", r'<div class="crumbs"><a href="[^"]*">工具</a>', '<div class="crumbs">工具'),
    ("second status strip (no pill inside)", "status|status strip missing or duplicated", "iceberg-result-mock.html", "str", "</body>", '<div class="status"><span>x</span></div>\n</body>'),
    ("home loses the problem box", "U16", "home-mock.html", "re", r"<textarea[^>]*></textarea>", ""),
    ("home loses the search box", "U1|search box", "home-mock.html", "re", r'<input class="search" id="q"[^>]*>', ""),
    ("a tool row hand-deleted from the directory", "partials|catalog-directory differs", "home-mock.html", "re", r'\n\s*<div class="tool" id="m-strategy\.swot" data-q="[^"]*">[^\n]*', ""),
    ("a workflow card hand-deleted", "partials|catalog-workflows differs", "home-mock.html", "re", r'\s*<div class="mcard wf" id="wf-life-decision-v1".*?\n      </div>', ""),
    ("a goal card hand-deleted", "partials|catalog-goals differs", "home-mock.html", "re", r'\s*<div class="mcard goal" id="goal-law">.*?\n      </div>', ""),
    ("an example situation button loses its text", "partials|catalog-prompts differs", "home-mock.html", "re", r' data-prompt="[^"]*"', ""),
    ("catalogue script edited in the page", "partials|home-catalog-script differs", "home-mock.html", "str", 'if (!t) { say(["共 ", count', 'if (!t) { say(["總 ", count'),
    ("demo project cards lose their finished state (U9)", "U9|示範專案", "home-mock.html", "strall", 'class="mcard done"', 'class="mcard"'),
    ("the all-tools card loses its id, so the search is no longer inside it (U1)", "U1|inside the #directory card", "home-mock.html", "str", '<div class="card" id="directory">', '<div class="card" id="all-tools">'),
    ("the project table becomes a div (U8)", "U8|project table", "home-mock.html", "re", r"<table>(.*?)</table>", r"<div>\1</div>"),
    ("hero states a stale tool count (numbers pinned to the registries)", "catalog|hero sentence", "home-mock.html", "str", '284 個思考工具、12 條工作流', '285 個思考工具、12 條工作流'),
    ("the invented word 路線 comes back on the home page (FORBID)", "continuity|superseded text", "home-mock.html", "str", '要開新的，按上面「開新專案」', '要開新的，挑一條路線'),
    ("six-step strip loses its .journey class (the workflow cards' own strips must not satisfy the rule)", "U2|six-step", "home-mock.html", "str", '<div class="journey">\n      <span>建立</span>', '<div class="steps">\n      <span>建立</span>'),
    ("the worked example of three suggestions removed from the 說你卡在哪 card (U16)", "U16|worked example", "home-mock.html", "re", r'\s*<div class="mcards">\s*<div class="mcard now">\s*<div><b>1 <a href="#t-systems\.iceberg_model">冰山模型</a></b>.*?\n      </div>\n(?=      <div class="btns mt10">)', ""),
    ("a view waits visible instead of hidden (U1 views)", "U1|views must be", "home-mock.html", "str", '<section class="view" id="tools" data-view="tools" hidden>', '<section class="view" id="tools" data-view="tools">'),
    # app shell (U1, operator 2026-09-25): main menu, views, h1 per view, crumbs only below a menu item, in-page links
    ("main.wrap renamed (app shell)", "U1|div.app holding exactly", "iceberg-result-mock.html", "str", '<main class="wrap">', '<main class="page">'),
    ("the menu loses its aria-current (per-page menu)", "U1|on workflows only", "workflow-lesson-mock.html", "str", 'data-view="workflows" aria-current="true"', 'data-view="workflows"'),
    ("the menu brand edited by hand (per-page partial)", "partials|render for this page", "workflow-result-mock.html", "str", "<b>認知作業系統</b>", "<b>認知 OS</b>"),
    ("a menu icon loses aria-hidden", "a11y|svg without role=img", "iceberg-lesson-mock.html", "re", r' aria-hidden="true"', ""),
    ("a second h1 in the tools view", "skeleton|view tools: exactly one h1", "home-mock.html", "str", "<h1>工具</h1>", "<h1>工具</h1><h1>全部</h1>"),
    ("an h1 outside the views", "skeleton|an h1 outside the views", "home-mock.html", "str", '<main class="wrap">\n', '<main class="wrap">\n<h1>首頁</h1>\n'),
    ("home gets a crumbs line back", "links|carry no .crumbs", "home-mock.html", "str", '<main class="wrap">\n', '<main class="wrap">\n  <div class="crumbs">首頁</div>\n'),
    ("an in-page link points nowhere", "links|in-page link #projectz", "home-mock.html", "str", '<a href="#projects">示範專案 2 個', '<a href="#projectz">示範專案 2 個'),
    ("an id used twice", "links|id 'ask' on lines", "home-mock.html", "str", "<h1>把一件事想清楚</h1>", '<h1 id="ask">把一件事想清楚</h1>'),
    ("the goals card id reappears in the tools view (placement)", "U1|#goals belongs in the home view", "home-mock.html", "str", "<div class=\"top\"><div><h1>工具</h1>", "<div class=\"top\" id=\"goals\"><div><h1>工具</h1>"),
    ("the projects view renamed: table and demos lose their home (U8/U9)", "U9|in the projects view", "home-mock.html", "str", 'id="projects" data-view="projects"', 'id="projects" data-view="project"'),
    ("a stale second hero sentence in the footer", "catalog|appear once", "home-mock.html", "str", "<span>語言 <b>zh-TW</b>", "<span>280 個思考工具、9 條工作流（另 7 條平台維運用）</span><span>語言 <b>zh-TW</b>"),
    ("the internal workflows fold left open", "catalog|folded (closed)", "home-mock.html", "str", 'id="wf-internal">', 'id="wf-internal" open>'),
    ("方法 comes back on a result page (COMMON_FORBID)", "continuity|方法", "iceberg-result-mock.html", "str", "<b>怎麼讀</b>上面填、下面看", "<b>怎麼讀</b>上面填方法、下面看"),
    ("a grid on the sidebar (U20: the shell grid is .app only)", "U20|.side", ALL_CSS, "str", ".side{position:sticky;", ".side{grid-template-columns:200px minmax(0,1fr);position:sticky;"),
    # one case per rule that had none (coverage gate, 2026-09-25)
    ("domains.yaml default is not an active domain", "U21|domains.yaml", "spec:methods/examples/domains.yaml", "str", "default: edd", "default: nope"),
    ("the domain chips cannot be rendered from a broken domains.yaml", "U21|domain-chips.html cannot be rendered", "spec:methods/examples/domains.yaml", "str", "default: edd", "default: nope"),
    ("a generated partial file deleted", "catalog|catalog-goals.html missing", "partials/catalog-goals.html", "delete", "", ""),
    ("a page marks a partial that has no file", "partials|fragment catalog-goals has no", "partials/catalog-goals.html", "delete", "", ""),
    ("a generated partial edited by hand", "catalog|catalog-prompts.html differs from its registries", "partials/catalog-prompts.html", "strall", "要不要開", "要不要辦"),
    ("a registry gap stops the catalogue", "catalog|registries:", "spec:recipes/registry/recipe-display-metadata.yaml", "str", "champion-challenger: {audience: internal", "champion-challenger: {audience: nobody"),
    ("a registry gap stops the per-page menu", "partials|app-nav cannot be rendered", "spec:recipes/registry/recipe-display-metadata.yaml", "str", "champion-challenger: {audience: internal", "champion-challenger: {audience: nobody"),
    # controls and tool pages (operator 2026-09-25: tools were only text, buttons did nothing)
    ("a span styled as a button", "controls|looks clickable", "iceberg-result-mock.html", "str", '<main class="wrap">\n', '<main class="wrap">\n  <span class="btn">假按鈕</span>\n'),
    ("a button without a behaviour", "controls|without a behaviour", "workflow-result-mock.html", "str", '<main class="wrap">\n', '<main class="wrap">\n  <button type="button" class="btn">什麼都不做</button>\n'),
    ("a mock action that does not say what the product does", "controls|start with 正式版", "home-mock.html", "str", 'data-mock="正式版打開設定頁', 'data-mock="打開設定頁'),
    ("a link into another mock that lands nowhere", "links|has no target on home-mock.html", "workflow-lesson-mock.html", "str", '#t-strategy.swot"', '#t-strategy.nope"'),
    ("a link to an artifact that is not a mock", "links|is not one of the mocks", "iceberg-result-mock.html", "str", '<main class="wrap">\n', '<main class="wrap">\n  <a href="https://claude.ai/artifact/NotAMock123#tools">外面</a>\n'),
    ("a cross-page anchor the artifact frame would drop", "links|not a plain anchor", "iceberg-lesson-mock.html", "str", '#t-systems.iceberg_model">冰山模型</a>', '#t=systems.iceberg_model">冰山模型</a>'),
    ("a tool page with a second h1", "skeleton|exactly one h1 per page", "home-mock.html", "str", '<h1>冰山模型</h1>', '<h1>冰山模型</h1><h1>又一個</h1>'),
    ("crumbs in a menu view", "links|menu views carry no .crumbs", "home-mock.html", "str", '<section class="view" id="tools" data-view="tools" hidden>\n', '<section class="view" id="tools" data-view="tools" hidden>\n  <div class="crumbs"><a href="#home">首頁</a></div>\n'),
    ("a tool page crumb that does not start at 工具", "links|a tool page carries exactly one .crumbs", "home-mock.html", "re", r'<div class="crumbs"><a href="#tools">工具</a>', '<div class="crumbs"><a href="#home">工具</a>'),
    ("a tool page removed", "catalog|one hidden article.tpage", "home-mock.html", "re", r'\s*<article class="tpage" id="t-strategy\.swot" hidden>.*?</article>', ""),
    ("a directory row that no longer opens its page", "catalog|a tool row opens its own page", "home-mock.html", "re", r'(<div class="tool" id="m-strategy\.swot" data-q="[^"]*"><b>)<a href="#t-strategy\.swot">([^<]*)</a>', r'\1\2'),
    ("a tool link that calls the tool something else", "links|must show its name", "iceberg-result-mock.html", "str", '#t-root_cause.five_whys">五個為什麼</a>', '#t-root_cause.five_whys">五問法</a>'),
    ("the tool view hung under no menu item", "U1|a sub-view is", "home-mock.html", "str", 'data-view="tool" data-under="tools" hidden>', 'data-view="tool" data-under="nowhere" hidden>'),
    ("a registry repeats a key (PyYAML would keep the last one)", "catalog|duplicate key 'goal'", "spec:recipes/registry/recipe-display-metadata.yaml", "str", "champion-challenger: {audience: internal, goal: engineering,", "champion-challenger: {audience: internal, goal: engineering, goal: engineering,"),
    ("a page that is not UTF-8", "parse|UnicodeDecodeError", "iceberg-result-mock.html", "bytes", b"<body>", b"<body>\xff"),
    ("page CSS defines a token", "shared|page CSS defines token --x", "workflow-lesson-mock.html", "str", PAGE_MARK, PAGE_MARK + "  .station{--x:1px}\n"),
    ("a second light :root block", "theme|expected one light :root block", ALL_CSS, "str", "  *{box-sizing:border-box}\n", "  :root{--bg:#f6f2e9}\n  *{box-sizing:border-box}\n"),
    ("the explicit dark block removed", "theme|explicit dark block", ALL_CSS, "re", r'\n  :root\[data-theme="dark"\]\{[^}]*\}', ""),
    ("the explicit dark block loses color-scheme:dark", "theme|dark(explicit) lacks color-scheme:dark", ALL_CSS, "str", ':root[data-theme="dark"]{color-scheme:dark;', ':root[data-theme="dark"]{'),
    ("both dark blocks drift on one token", "U19|dark(media) token --accent", ALL_CSS, "strall", "--accent:#8fc7b0", "--accent:#8fc7b1"),
    ("the dark blocks define a token the light block lacks", "theme|defines --zz that the light block does not", ALL_CSS, "strall", "color-scheme:dark;--bg:#1c2b27", "color-scheme:dark;--zz:#000000;--bg:#1c2b27"),
    ("a page file missing", "exists|missing", "workflow-lesson-mock.html", "delete", "", ""),
    ("a page loses its charset meta", "skeleton|missing <meta charset", "iceberg-result-mock.html", "str", '<meta charset="utf-8">', ""),
    ("a one-character title", "title|title missing", "home-mock.html", "str", "<title>認知作業系統首頁</title>", "<title>首</title>"),
    ("the page-specific marker removed", "shared|shared end / page-specific markers missing", "iceberg-result-mock.html", "str", PAGE_MARK, ""),
    ("CSS between the shared end and the page marker", "shared|CSS between", "iceberg-result-mock.html", "str", "  /* == shared design system: end == */\n", "  /* == shared design system: end == */\n  .x{color:var(--ink)}\n"),
    ("the folder's design-system.css missing", "theme|design-system.css missing", "design-system.css", "delete", "", ""),
    ("the font stack drifts", "U19|font stack drifted", ALL_CSS, "str", "font:15px/1.65 system-ui", "font:16px/1.65 system-ui"),
    ("page CSS that does not parse", "css|", "workflow-lesson-mock.html", "str", PAGE_MARK, PAGE_MARK + "  .station{color:var(--ink)\n"),
    ("a partial marked twice", "partials|marked twice", "iceberg-lesson-mock.html", "str", '<main class="wrap">\n', '<main class="wrap">\n  <!-- == partial: domain-chips: start (verbatim from partials/domain-chips.html via sync-design-system.py; check-mocks.py enforces) == -->\n  <!-- == partial: domain-chips: end == -->\n'),
    ("a fragment of a partial that does not exist", "partials|fragment nope has no", "iceberg-result-mock.html", "str", '<main class="wrap">\n', '<main class="wrap">\n  <!-- == partial: nope: start (verbatim from partials/nope.html via sync-design-system.py; check-mocks.py enforces) == -->\n  <!-- == partial: nope: end == -->\n'),
    ("a partial start marker reworded", "partials|start marker text drifted", "iceberg-lesson-mock.html", "str", "domain-chips: start (verbatim", "domain-chips: start (copied"),
    ("a second banner", "skeleton|示意稿 banner", "iceberg-result-mock.html", "str", '<main class="wrap">\n', '<main class="wrap">\n  <div class="banner">另一條</div>\n'),
    ("a chip that is a span", "a11y|chip must be a <button>", "iceberg-result-mock.html", "str", '<main class="wrap">\n', '<main class="wrap">\n  <span class="chip">標籤</span>\n'),
    ("a second status pill", "status|exactly one status pill", "iceberg-result-mock.html", "str", '<main class="wrap">\n', '<main class="wrap">\n  <span class="pill">另一個</span>\n'),
    ("a result page without cards", "§3.10|no cards", "workflow-result-mock.html", "reall", r'class="card(\b[^"]*)"', r'class="box\1"'),
    ("the first card loses its status strip", "U14|first card must carry the status strip", "iceberg-result-mock.html", "str", 'class="status"', 'class="stat"'),
    ("teaching comes back onto the run page (the reading steps)", "U14|.todos is teaching", "iceberg-result-mock.html", "str", "  <!-- 填寫：四個格子（工具頁的主要動作） -->", '  <div class="todos"><div class="todo">x</div></div>\n  <!-- 填寫：四個格子（工具頁的主要動作） -->'),
    ("the 認識 tab loses can/cant", "U14|the 認識 tab must carry", "iceberg-lesson-mock.html", "str", '<div class="can"><b>這工具能回答</b>', '<div class="kan"><b>這工具能回答</b>'),
    ("the read tab forgets the 30-second line", "U14|the 30-second line", "iceberg-lesson-mock.html", "strall", "只有 30 秒", "只有一點時間"),
    ("the last card loses its source strip", "§3.10|.meta-bar", "iceberg-result-mock.html", "str", 'class="meta-bar"', 'class="metabar"'),
    ("the last card loses its actions", "§3.10|approve/return actions", "iceberg-result-mock.html", "re", r'<div class="btns mt12">(?![\s\S]*<div class="btns mt12">)', '<div class="row mt12">'),
    ("no chip on by default", "D18|exactly one chip must be on", "iceberg-lesson-mock.html", "str", 'class="chip on" role="tab" aria-selected="true"', 'class="chip" role="tab" aria-selected="true"'),
    ("the start step loses its checklist", "U15|ul.check", "iceberg-lesson-mock.html", "strall", '<ul class="check">', '<ul class="list">'),
    ("a second tab panel starts visible", "U15|only the first visible", "iceberg-lesson-mock.html", "str", '<section class="tabpanel" id="panel-read" role="tabpanel" aria-labelledby="tab-read" hidden>', '<section class="tabpanel" id="panel-read" role="tabpanel" aria-labelledby="tab-read">'),
    ("the mistakes lose their rows", "M7|常見錯誤", "iceberg-lesson-mock.html", "strall", 'class="mistake"', 'class="mis"'),
    ("the sources card renamed", "M8|課程來源", "iceberg-lesson-mock.html", "str", "<h2>課程來源", "<h2>參考"),
    ("a tool row hand-deleted (count)", "catalog|tool rows on the page", "home-mock.html", "re", r'\n\s*<div class="tool" id="m-strategy\.swot" data-q="[^"]*">[^\n]*', ""),
    ("a workflow card hand-deleted (count)", "catalog|workflow cards on the page", "home-mock.html", "re", r'\s*<div class="mcard wf" id="wf-life-decision-v1".*?\n      </div>', ""),
    ("a goal card hand-deleted (count)", "catalog|goal cards", "home-mock.html", "re", r'\s*<div class="mcard goal" id="goal-law">.*?\n      </div>', ""),
    ("a directory fold loses data-dir", "catalog|directory folds", "home-mock.html", "str", 'data-dir="law"', 'data-x="law"'),
    ("a start-here picture loses its class", "catalog|start-here cards", "home-mock.html", "re", r'<svg class="shape"', '<svg class="picture"'),
    ("an example situation button loses its data (count)", "U16|example situation buttons", "home-mock.html", "re", r' data-prompt="[^"]*"', ""),
    # 2026-09-25 operator: lessons open in a new tab; a lesson = start card on top + chips + tabs; the run page = the
    # fields, then the result; the reading guide lives in the lesson's read tab
    ("a lesson link loses its new tab (demo-project card)", "U15|opens a new tab", "home-mock.html", "str", 'href="https://claude.ai/artifact/653Kt4JtExaujnffNDvygY" target="_blank" rel="noopener">它的 5 分鐘課 ↗</a>', 'href="https://claude.ai/artifact/653Kt4JtExaujnffNDvygY">它的 5 分鐘課 ↗</a>'),
    ("the run page's 怎麼用？ button opens the lesson in the same tab", "U15|opens a new tab", "iceberg-result-mock.html", "str", '<a class="howto" href="https://claude.ai/artifact/653Kt4JtExaujnffNDvygY" target="_blank" rel="noopener">', '<a class="howto" href="https://claude.ai/artifact/653Kt4JtExaujnffNDvygY">'),
    ("the run page stops linking to the lesson's reading tab", "U14|reading tab", "iceberg-result-mock.html", "str", '653Kt4JtExaujnffNDvygY#panel-read"', '653Kt4JtExaujnffNDvygY"'),
    ("a run-page 怎麼讀 strip grows back into a lesson", "U14|characters (max", "iceberg-result-mock.html", "str", "<b>你要做的</b>在最下面寫你自己的判斷。</div>", "<b>你要做的</b>在最下面寫你自己的判斷：同意、部分同意或不同意；你的原話才是紀錄，AI 寫的只是附掛；沒填也能核准。</div>"),
    ("the input form is no longer the card after the header", "U14|card after the header must hold the input form", "iceberg-result-mock.html", "str", '<form class="runform" aria-label="冰山模型的四個格子">', '<form class="intake" aria-label="冰山模型的四個格子">'),
    ("a run field loses its label", "U14|a run form =", "iceberg-result-mock.html", "str", '<label for="f-pattern">', '<label for="f-patterns">'),
    ("a run form's clear button turns into a second fill button", "U14|a run form =", "workflow-result-mock.html", "re", r'(<button type="button" class="btn ghost") data-clear(>清空，填我自己的</button>\s*</div>\s*</form>\s*</div>\s*<!-- 第 1 站摘要)', r'\1 data-fill\2'),
    ("a result card loses its state (it would show before any run)", "U14|shows with a result or before one", "iceberg-result-mock.html", "str", '<!-- 3. 總結 -->\n  <div class="card" data-when="result">', '<!-- 3. 總結 -->\n  <div class="card">'),
    ("an empty-state element starts visible", "U14|starts hidden", "workflow-result-mock.html", "str", '<div class="journey" data-when="empty" hidden>', '<div class="journey" data-when="empty">'),
    ("the result landing card loses id=result", "U14|id=result", "iceberg-result-mock.html", "str", '<div class="card accent" id="result" data-when="result">', '<div class="card accent" data-when="result">'),
    ("the domain chips move below the tabs (they drive every tab)", "U15|main holds the start card", "workflow-lesson-mock.html", "re", r'(  <!-- == partial: domain-chips: start.*?<!-- == partial: domain-chips: end == -->\n)(  <!-- == partial: lesson-tabs: start.*?<!-- == partial: lesson-tabs: end == -->\n)', r'\2\1'),
    ("a lesson card left outside the tab panels", "U15|outside the tab panels", "iceberg-lesson-mock.html", "str", "  </section>\n</main>", '  </section>\n  <div class="card"><h2>附註</h2><div class="how"><b>怎麼讀</b>x<b>你要做的</b>y</div></div>\n</main>'),
    ("the tab row is edited by hand (generated from mockkit.LESSON_TABS)", "partials|lesson-tabs differs from its render", "iceberg-lesson-mock.html", "str", ">看懂結果<small>", ">讀結果<small>"),
    ("a run button without its product sentence", "controls|data-run must say", "iceberg-result-mock.html", "str", 'data-run="正式版用你填的四格分析', 'data-run="用你填的四格分析'),
    ("the saved run shows no fields (the only visible form moved into the no-result state)", "U14|fields must be visible in both states", "workflow-result-mock.html", "str", '<div class="card cta" id="result" data-when="result">', '<div class="card cta" id="result" data-when="empty" hidden>'),
    ("a run form hidden outright (a [hidden] ancestor the run script never toggles)", "U14|fields must be visible in both states", "iceberg-result-mock.html", "str", '<form class="runform" aria-label="冰山模型的四個格子">', '<form class="runform" aria-label="冰山模型的四個格子" hidden>'),
    ("one field of the saved-run form shows only before a run (nested data-when)", "U14|fields must be visible in both states", "workflow-result-mock.html", "re", r'<div class="field">(\s*<label for="s2-s">)', r'<div class="field" data-when="empty" hidden>\1'),
    ("a second primary link elsewhere in the start card", "U15|start step needs exactly three buttons", "iceberg-lesson-mock.html", "re", r'(之後補：</p>\s*)<ul class="check">', r'\1<p><a class="btn primary" href="#panel-fill">先看怎麼填</a></p><ul class="check">'),
    ("the web app's stylesheet drifts from the design system", "U19|web copy of design-system.css", "web-design-system.css", "str", "[hidden]{display:none!important}", "[hidden]{display:none}"),
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


# rules that have no mutation case yet (a substring of the rule's source in check-mocks.py). Shrink only: write the case,
# then delete the entry (the run fails until you do). Filled from the first traced run on 2026-09-25.
NO_CASE_YET = [
]

# valid variants the checker must accept: (label, target, kind, old, new), same mutation format as CASES, run must exit 0
ACCEPT = [
    # 2026-09-25: mockkit._yaml's duplicate-key loader crashed on `<<:` (same bug as the golden runner, 40366864a);
    # explicit name_zh/blurb_zh overriding the merged ones is merge precedence, not a duplicate
    ("a registry uses a YAML merge key", "spec:recipes/registry/recipe-display-metadata.yaml", "re",
     r"  champion-challenger: \{audience: internal, goal: engineering, (name_zh: [^\n]*\n)  db-migration-expand-contract: \{audience: internal, goal: engineering, ",
     r"  champion-challenger: &eng {audience: internal, goal: engineering, \1  db-migration-expand-contract: {<<: *eng, "),
]


def run_checker(folder, spec=None):
    r = subprocess.run([sys.executable, str(CHECK), "--dir", str(folder)], capture_output=True, text=True, encoding="utf-8", errors="replace",
                       env={**os.environ, "CHECK_MOCKS_TRACE": "1", **({"AI_LEGO_SPEC_ROOT": str(spec)} if spec else {})})
    return r.returncode, (r.stdout or "") + (r.stderr or "")


def reset(tmp):
    for f in FILES + [CSS]: shutil.copyfile(HERE / f, tmp / f)
    shutil.copyfile(mk.WEB_DESIGN_SYSTEM, tmp / "web-design-system.css")   # the web app's copy (check-mocks.py --dir reads it here)
    if (tmp / "partials").exists(): shutil.rmtree(tmp / "partials")
    shutil.copytree(mk.PARTIALS, tmp / "partials")


def mutate(tmp, label, target, kind, old, new):
    """Fresh copies in tmp with one mutation applied -> (spec root copy or None, setup ok)."""
    reset(tmp)
    spec = None
    if target.startswith("spec:"):   # registry mutation: a copy of the registries the mocks read
        spec = tmp / "spec"
        if spec.exists(): shutil.rmtree(spec)
        for sub in ("methods", "recipes"): shutil.copytree(mk.SPEC / sub, spec / sub)
        target = "spec/" + target[len("spec:"):]
    targets = FILES + [CSS] if target == ALL_CSS else FILES if target == ALL else [target]
    for f in targets:
        p = tmp / f
        if kind == "delete":
            if not p.exists(): print(f"SETUP  {label}: {f} does not exist"); return spec, False
            p.unlink(); continue
        if kind == "bytes":
            p.write_bytes(p.read_bytes().replace(old, new)); continue
        s = p.read_text(encoding="utf-8")
        if kind == "str":
            if s.count(old) != 1: print(f"SETUP  {label}: anchor found {s.count(old)}x in {f}"); return spec, False
            s = s.replace(old, new)
        elif kind == "strall":
            if s.count(old) < 1: print(f"SETUP  {label}: anchor not found in {f}"); return spec, False
            s = s.replace(old, new)
        elif kind == "reall":
            s, n = re.subn(old, new, s, flags=re.S)
            if n < 1: print(f"SETUP  {label}: regex matched nothing in {f}"); return spec, False
        else:
            s, n = re.subn(old, new, s, count=1, flags=re.S)
            if n != 1: print(f"SETUP  {label}: regex matched nothing in {f}"); return spec, False
        p.write_text(s, encoding="utf-8", newline="\n")
    return spec, True


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    missed = rejected = 0
    covered = set()
    with tempfile.TemporaryDirectory() as td:
        tmp = pathlib.Path(td)
        reset(tmp)
        rc, out = run_checker(tmp)
        if rc != 0: print("baseline is not green:\n" + out); return 1
        for label, expect, target, kind, old, new in CASES:
            spec, setup_ok = mutate(tmp, label, target, kind, old, new)
            if not setup_ok: missed += 1; continue
            rc, out = run_checker(tmp, spec)
            tag, _, msg = expect.partition("|")
            hit = [ln for ln in out.splitlines() if f"[{tag}]" in ln and msg in ln]
            covered |= {int(m) for ln in hit for m in re.findall(r"@site:(\d+)", ln)}
            ok = rc == 1 and "Traceback" not in out and bool(hit)
            missed += 0 if ok else 1
            first = (hit or out.strip().splitlines() or [""])[0]
            print(("CAUGHT " if ok else "MISSED ") + f"{label} -> {first[:120]}")
        for label, target, kind, old, new in ACCEPT:
            spec, setup_ok = mutate(tmp, label, target, kind, old, new)
            if not setup_ok: rejected += 1; continue
            rc, out = run_checker(tmp, spec)
            ok = rc == 0
            rejected += 0 if ok else 1
            print(("ACCEPTED " if ok else "REJECTED ") + f"{label} -> {(out.strip().splitlines() or [''])[0][:120]}")
    print(f"selftest: {len(CASES)} mutations, {len(CASES) - missed} caught, {missed} missed; "
          f"{len(ACCEPT)} valid variants, {len(ACCEPT) - rejected} accepted, {rejected} rejected")
    gaps = coverage(covered)
    return 0 if missed == 0 and rejected == 0 and not gaps else 1


def coverage(covered):
    """Every self.bad call site in check-mocks.py is proven by a case, or listed in NO_CASE_YET (which may only shrink)."""
    src = CHECK.read_text(encoding="utf-8")
    sites = {n.lineno: ast.get_source_segment(src, n) for n in ast.walk(ast.parse(src)) if isinstance(n, ast.Call) and getattr(n.func, "attr", "") == "bad"}
    gaps = []
    for line, code in sorted(sites.items()):
        listed = [k for k in NO_CASE_YET if k in code]
        if line in covered and listed: gaps.append(f"check-mocks.py:{line} now has a case: remove {listed[0]!r} from NO_CASE_YET")
        elif line not in covered and not listed: gaps.append(f"check-mocks.py:{line} rule has no case: {' '.join(code.split())[:100]}")
    for k in NO_CASE_YET:
        if not any(k in code for code in sites.values()): gaps.append(f"NO_CASE_YET entry matches no rule any more: {k!r}")
    for g in gaps: print("COVERAGE " + g)
    print(f"coverage: {len(sites)} rules, {len(set(sites) & covered)} proven by a case, {len(NO_CASE_YET)} listed without a case yet, {len(gaps)} gap(s)")
    return gaps


if __name__ == "__main__":
    sys.exit(main())
