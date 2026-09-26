#!/usr/bin/env python3
"""Shared helpers for the mock tooling (sync-design-system.py, check-mocks.py, build-artifact.py): the page list, the
one domain list (SPEC/methods/examples/domains.yaml), the chip row rendered from it, and the partial markers.
Logic lives here once; the scripts only call it. Not a CLI."""
import collections, os, pathlib, re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))   # COS root: the catalog loader lives in ai_lego
from ai_lego.platform.catalog.display_catalog import GLYPHS, SHAPES, Catalog, _text, _yaml, counts  # noqa: E402
from ai_lego.platform.catalog.display_catalog import load_catalog as _load_catalog  # noqa: E402

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[4]                                   # COS/docs/mockups -> …/Projects/internal/COS -> repo root
SPEC = pathlib.Path(os.environ.get("AI_LEGO_SPEC_ROOT") or REPO / "agency-os/docs/AI_LEGO_Cognitive_Engineering_OS")   # same override as ai_lego (SPEC_ROOT_ENV)
DOMAINS_FILE = SPEC / "methods/examples/domains.yaml"    # plan U21: the single domain list
DESIGN_SYSTEM = HERE / "design-system.css"               # plan U19: the single stylesheet
WEB_DESIGN_SYSTEM = HERE.parents[1] / "apps/cognitive-web/app/design-system.css"   # the web app's byte-identical copy (sync writes, the gate compares)
PARTIALS = HERE / "partials"                             # shared markup fragments, copied verbatim into the pages
HOME = ["home-mock.html"]
RESULT = ["iceberg-result-mock.html", "workflow-result-mock.html"]
LESSON = ["iceberg-lesson-mock.html", "workflow-lesson-mock.html"]
FILES = HOME + RESULT + LESSON
# published artifact ids (the product replaces them with routes); check-mocks.py LINKS says who must link to whom
ARTIFACT = {"home-mock.html": "5j9jef81ts5mqmYpVARNmJ",
            "iceberg-result-mock.html": "7JLjM7mGyqTMLJmCMUmWqq", "iceberg-lesson-mock.html": "653Kt4JtExaujnffNDvygY",
            "workflow-result-mock.html": "7xEwPu9Cp2rWf3P8g9X1Pk", "workflow-lesson-mock.html": "TP18Q3Xif2BphmAfbxxrKU"}
# Result pages are the tool's run page (plan U14, operator 2026-09-25 「工具頁完全沒看到可以填表的空格」): the fields you
# fill, then the result. The address picks the state (partials/run-form-script.html): #new = empty fields, #demo = the
# demo filled in, both before any result; other links may use these two fragments although no element carries them.
RUN_STATES = ("new", "demo")
# plan U15 (operator 2026-09-25 「怎麼用？先上 5 分鐘的課 所有的按鍵應該都要用另開新頁面」): a link that opens a lesson
# opens a new tab, so the page behind it (a half-filled form) stays; the ↗ says so before the click.
NEW_TAB = ' target="_blank" rel="noopener"'


def artifact_href(page, fragment=""):
    return f"https://claude.ai/artifact/{ARTIFACT[page]}" + (f"#{fragment}" if fragment else "")


def lesson_link(page, label, cls="btn", fragment=""):
    return f'<a class="{cls}" href="{artifact_href(page, fragment)}"{NEW_TAB}>{label} ↗</a>'


# plan U15/U18 (operator 2026-09-25 「不要塞一整頁，用 Tab 方式安排不同性質的內容；之後其他的工具就要以這個為範本」):
# a lesson = the start card (its one action, above everything) + the domain chips + these tabs, one kind of content each,
# in learning order; the tool page's reading guide lives in the "read" tab (the run page keeps one line per section).
# (id, label, time or None). The tab row is rendered from here (PER_PAGE "lesson-tabs"); check-mocks.py holds each
# lesson's panels to it.
LESSON_TABS = {
    "tool": [("learn", "認識", "1.5 分"), ("example", "看例子", "1 分"), ("fill", "怎麼填", "1.5 分"),
             ("read", "看懂結果", "1 分"), ("teach", "教材版", None), ("sources", "來源", None)],
    "workflow": [("learn", "認識", "30 秒"), ("stations", "各站", "1 分"), ("example", "看例子", "30 秒"),
                 ("walk", "怎麼走", "30 秒"), ("read", "看懂總覽", "30 秒"), ("teach", "教材版", None), ("sources", "來源", None)],
}
LESSON_KIND = {"iceberg-lesson-mock.html": "tool", "workflow-lesson-mock.html": "workflow"}
assert set(LESSON_KIND) == set(LESSON)


def render_lesson_tabs(page):
    """The tab row exactly as `page` carries it (the first tab selected); empty for a page that is not a lesson."""
    if page not in LESSON_KIND: return ""
    out = ['  <div class="tabs" role="tablist" aria-label="課程內容">']
    for i, (tid, label, time) in enumerate(LESSON_TABS[LESSON_KIND[page]]):
        on = i == 0
        out.append(f'    <button class="tab" type="button" role="tab" id="tab-{tid}" aria-controls="panel-{tid}" aria-selected="{"true" if on else "false"}" '
                   f'tabindex="{0 if on else -1}">{label}' + (f"<small>{time}</small>" if time else "") + '</button>')
    out.append('  </div>')
    return "\n".join(out) + "\n"


# <style> layout: marker line, design-system.css verbatim, end marker, page marker (page section must stay empty)
CSS_START = "  /* == shared design system: start (byte-identical in every mock; check-mocks.py enforces) == */"
CSS_END = "  /* == shared design system: end == */"
CSS_PAGE = "  /* == page-specific == */"
# partials: <!-- == partial: <name>: start … == --> body <!-- == partial: <name>: end == -->; body == partials/<name>.html
REQUIRED_PARTIALS = {f: {"domain-chips", "lesson-chip-script", "lesson-tabs", "tabs-script"} for f in LESSON}
REQUIRED_PARTIALS.update({f: {"run-form-script"} for f in RESULT})
FRAG = re.compile(r"^[ \t]*<!-- == partial: ([a-z0-9-]+): start[^\n]*-->\n(?:(.*?)\n)??[ \t]*<!-- == partial: \1: end == -->", re.S | re.M)  # body may be empty (a fresh page before its first sync); lazy so it never reaches a later copy


def partial_start(name):
    if name in PER_PAGE:
        return f"<!-- == partial: {name}: start (rendered for this page by mockkit.PER_PAGE via sync-design-system.py; check-mocks.py enforces) == -->"
    return f"<!-- == partial: {name}: start (verbatim from partials/{name}.html via sync-design-system.py; check-mocks.py enforces) == -->"


def partial_end(name):
    return f"<!-- == partial: {name}: end == -->"


def fragments(html):
    """-> {name: body} for every marked fragment in a page; a name marked twice raises ValueError."""
    out = {}
    for m in FRAG.finditer(html):
        if m.group(1) in out: raise ValueError(f"partial {m.group(1)} marked twice")
        out[m.group(1)] = m.group(2) or ""
    return out


def load_domains(path=DOMAINS_FILE):
    """Parse and validate the domain list; ValueError on a malformed file (the gate reports it, never a traceback)."""
    d = _yaml(path)
    if not isinstance(d, dict) or d.get("version") != 1 or not isinstance(d.get("domains"), list) or not d["domains"]:
        raise ValueError(f"{path.name}: expected version: 1 and a non-empty domains list")
    ids = []
    for x in d["domains"]:
        if not isinstance(x, dict) or set(x) != {"id", "label", "status", "lessons_key"}:
            raise ValueError(f"{path.name}: every domain needs exactly id, label, status, lessons_key ({x!r})")
        if not re.fullmatch(r"[a-z][a-z0-9_]*", str(x["id"])): raise ValueError(f"{path.name}: bad id {x['id']!r}")
        if x["status"] not in ("active", "retired"): raise ValueError(f"{path.name}: {x['id']} status must be active or retired")
        if not isinstance(x["label"], str) or not x["label"].strip(): raise ValueError(f"{path.name}: {x['id']} needs a non-empty text label")
        ids.append(x["id"])
    if len(set(ids)) != len(ids): raise ValueError(f"{path.name}: duplicate domain id")
    act = [x["id"] for x in d["domains"] if x["status"] == "active"]
    if d.get("default") not in act: raise ValueError(f"{path.name}: default {d.get('default')!r} is not an active domain")
    return d


def active_ids(d):
    return [x["id"] for x in d["domains"] if x["status"] == "active"]


def render_chips(d):
    """The chip row exactly as the lesson pages carry it (4-space indent, the default chip on and labelled 你的預設)."""
    import html
    lines = ['    <div class="chips" role="tablist" aria-label="例子領域">', '      <span class="sub">例子領域：</span>']
    for x in d["domains"]:
        if x["status"] != "active": continue
        on = x["id"] == d["default"]
        label = html.escape(f"{x['label']}（你的預設）" if on else x["label"], quote=False)
        lines.append(f'      <button class="chip{" on" if on else ""}" role="tab" aria-selected="{"true" if on else "false"}" '
                     f'data-set="{x["id"]}" id="chip-{x["id"]}">{label}</button>')
    lines.append("    </div>")
    return "\n".join(lines) + "\n"


METHODS_FILE = SPEC / "methods/registry/method-display-metadata.yaml"       # 285 methods: name_zh / name_en / abbr / blurb_zh / url
FAMILIES_FILE = SPEC / "methods/registry/method-family-display.yaml"        # family labels (the `<family>.` prefix of a method id)
GOALS_FILE = SPEC / "methods/registry/method-goal-groups.yaml"              # plain-language goals: families, featured, popular, prompts
RECIPES_DIR = SPEC / "recipes/validated"                                     # the workflows GET /recipes lists (ACTIVE *.recipe.yaml)
RECIPE_DISPLAY_FILE = SPEC / "recipes/registry/recipe-display-metadata.yaml"  # zh name / blurb / goal / audience per recipe
CONTRACTS_DIR = SPEC / "methods/contracts"                                   # the ACTIVE contracts GET /methods lists; display ids must equal them


def load_catalog():
    """The display catalog (ai_lego/platform/catalog/display_catalog.py) read from this tooling's SPEC."""
    return _load_catalog(SPEC)
# the only method and the only workflow that have a published lesson + result demo today (mock pages)
DEMOS = {"systems.iceberg_model": ("iceberg-lesson-mock.html", "iceberg-result-mock.html"),
         "life-decision-v1": ("workflow-lesson-mock.html", "workflow-result-mock.html")}
def _esc(s):
    import html
    return html.escape(str(s), quote=True)


def glyph(name, label):
    return f'<svg class="glyph" viewBox="0 0 24 24" role="img" aria-label="{_esc(label)}">{GLYPHS[name]}</svg>'


def icon(name):
    """A decorative glyph beside a text label (menu items): hidden from screen readers, the label speaks."""
    return f'<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">{GLYPHS[name]}</svg>'


def picture(name, label):
    return f'<svg class="shape" viewBox="0 0 64 40" role="img" aria-label="{_esc(label)}">{SHAPES[name]}</svg>'


def _goal_of(goals, mid):
    fam = mid.split(".")[0]
    return next(x for x in goals["goals"] if fam in x["families"])


def tool_href(mid):
    """Every tool name on the home page opens that tool's own page (section#tool, plan U1); a plain #anchor, which the
    artifact frame passes on to the page."""
    return f"#t-{mid}"


def tool_link(methods, mid):
    return f'<a href="{tool_href(mid)}">{_esc(methods[mid]["name_zh"])}</a>'


# What a control will do in the product. A mock cannot do it, so the button says so under its row when clicked
# (partials/page-actions-script.html) instead of doing nothing; anything the mock CAN show is a real <a href>.
MOCK_START_TOOL = "正式版按這裡會打開這個工具的填寫頁：貼上你的情況，系統先免費幫你填欄，不夠才用 AI；你確認才執行、才花錢。"
MOCK_LESSON_TOOL = "正式版每個工具都有一堂 5 分鐘的課，由工具資料產生；示意稿只做了冰山模型這一堂。"
MOCK_START_WF = "正式版按這裡會打開這條工作流的第 1 站：可以一站一站走，也可以一次跑完；會花錢的步驟都先問你。"
MOCK_LESSON_WF = "正式版每條工作流都有一堂 3 分鐘的課，由工作流資料產生；示意稿只做了「做一個決定」這一堂。"


def mock_button(label, does, cls="btn"):
    return f'<button type="button" class="{cls}" data-mock="{_esc(does)}">{label}</button>'


def _tool_buttons(mid, cls="btns"):
    """開始 opens the tool's run page with empty fields where the mock has one (#new), else says what the product will
    open; the lesson opens in a new tab."""
    demo = DEMOS.get(mid)
    if demo:
        out = [f'<a class="btn primary" href="{artifact_href(demo[1], "new")}">開始 →</a>', lesson_link(demo[0], "第一次用？先上 5 分鐘的課"),
               f'<a class="btn ghost" href="{artifact_href(demo[1])}">看做完的結果頁 →</a>']
    else:
        out = [mock_button("開始", MOCK_START_TOOL, "btn primary"), mock_button("第一次用？先上 5 分鐘的課", MOCK_LESSON_TOOL)]
    return f'<div class="{cls}">' + "".join(out) + "</div>"


def render_prompts(cat):
    """Example situations under the 'say what you are stuck on' box; a click copies the text into the box."""
    goals = cat.goals
    out = ['    <div class="btns" id="prompts">']
    for p in goals["prompts"]:
        out.append(f'      <button class="btn ghost" type="button" data-prompt="{_esc(p)}">{_esc(p)}</button>')
    out.append('    </div>')
    return "\n".join(out) + "\n"


def render_goals(cat):
    """'Find by what you want to do': one card per goal — question, one line, counts, three common tools, see all."""
    methods, recipes, goals = cat.methods, cat.recipes, cat.goals
    out = ['    <h2>按你想做的事找<small>%d 種你可能想做的事；每一種先給三個常用工具，全部 %d 個工具都分在其中一種</small></h2>' % (len(goals["goals"]), len(methods)),
           '    <div class="how"><b>怎麼讀</b>每張卡是一件你可能想做的事，用問句寫；「常用」是這一類最常被用的三個工具，滑過去看它做什麼；「看全部」打開這一類的完整清單。<b>你要做的</b>找到最像你的那個問句，按一個工具；都不像就回到上面說你卡在哪。</div>',
           '    <div class="mcards">']
    for gl in goals["goals"]:
        mids = [mid for mid in methods if mid.split(".")[0] in gl["families"]]
        wfs = [r for r in recipes if r["goal"] == gl["id"] and r["audience"] == "user"]
        out.append(f'      <div class="mcard goal" id="goal-{gl["id"]}">')
        out.append(f'        <div class="gh">{glyph(gl["icon"], gl["short_zh"])}<b>{_esc(gl["title_zh"])}</b></div>')
        out.append(f'        <div>{_esc(gl["blurb_zh"])}</div>')
        out.append(f'        <div class="k">{len(mids)} 個工具' + (f'・{len(wfs)} 條工作流' if wfs else '') + '</div>')
        out.append('        <div><span class="k">常用：</span>' + '、'.join(f'<a href="{tool_href(mid)}" title="{_esc(methods[mid]["blurb_zh"])}">{_esc(methods[mid]["name_zh"])}</a>' for mid in gl["featured"]) + '</div>')
        out.append(f'        <div class="btns"><a class="btn" href="#dir-{gl["id"]}">看全部 {len(mids)} 個 →</a></div>')
        out.append('      </div>')
    out.append('    </div>')
    return "\n".join(out) + "\n"


def render_featured(cat):
    """'Start here': the popular tools — a picture of the tool's shape, name, goal tag, one plain line, the actions."""
    methods, goals = cat.methods, cat.goals
    out = ['    <h2>先從這幾個開始<small>%d 個最常見的起點（人工挑選；有使用資料後改成大家最常用的）</small></h2>' % len(goals["popular"]),
           '    <div class="how"><b>怎麼讀</b>每張卡一個工具：小圖是它長的樣子，一句話是它幫你做什麼，標籤是它屬於哪一件你想做的事。<b>你要做的</b>看到像你的情況就按「開始」；第一次用先看它的短課（可跳）。</div>',
           '    <div class="mcards">']
    for x in goals["popular"]:
        mid = x["id"]; m = methods[mid]; gl = _goal_of(goals, mid)
        out.append(f'      <div class="mcard pop" id="pop-{mid}">')
        out.append(f'        <div class="gh">{picture(x["shape"], m["name_zh"] + "的樣子")}<div><b>{tool_link(methods, mid)}</b><span class="tag">{_esc(gl["short_zh"])}</span><div class="k">{_esc(m["name_en"])}</div></div></div>')
        out.append(f'        <div>{_esc(x["line_zh"])}</div>')
        out.append('        ' + _tool_buttons(mid))
        out.append('      </div>')
    out.append('    </div>')
    return "\n".join(out) + "\n"


def _stations(methods, steps):
    """Stations in order: a tool is a link to its page; a run of capability steps collapses to one chip with a count
    (db-migration has 15) and stays text — a capability has no page."""
    out, run = [], 0
    for s in steps + [None]:
        if s == "capability": run += 1; continue
        if run: out.append("<span>能力步</span>" if run == 1 else f"<span>能力步 ×{run}</span>"); run = 0
        if s is not None: out.append(tool_link(methods, s))
    return out


def _wf_card(methods, goals, r):
    gl = next(x for x in goals["goals"] if x["id"] == r["goal"])
    demo = DEMOS.get(r["id"])
    q = _esc(" ".join([r["name_zh"], r["name"], r["id"], r["blurb_zh"]] + [methods[s]["name_zh"] for s in r["steps"] if s in methods]).lower())
    out = [f'      <div class="mcard wf" id="wf-{r["id"]}" data-q="{q}">',
           f'        <div class="gh">{glyph(gl["icon"], gl["short_zh"])}<b>{_esc(r["name_zh"])}</b><span class="tag">{len(r["steps"])} 站</span></div>',
           f'        <div class="k">{_esc(r["name"])}</div>',
           '        <div class="journey">' + '<i>→</i>'.join(_stations(methods, r["steps"])) + '</div>',
           f'        <div>{_esc(r["blurb_zh"])}</div>']
    if demo:
        out.append(f'        <div class="btns"><a class="btn primary" href="{artifact_href(demo[1], "new")}">開始 →</a>{lesson_link(demo[0], "第一次走？先上 3 分鐘的課")}'
                   f'<a class="btn ghost" href="{artifact_href(demo[1])}">看走到一半的示範 →</a></div>')
    else:
        out.append(f'        <div class="btns">{mock_button("開始", MOCK_START_WF, "btn primary")}{mock_button("第一次走？先上 3 分鐘的課", MOCK_LESSON_WF)}</div>')
    out.append('      </div>')
    return out


def render_workflows(cat):
    """User workflows grouped by goal; the platform-internal ones (governance, fixtures) folded at the end."""
    methods, recipes, goals = cat.methods, cat.recipes, cat.goals
    user = [r for r in recipes if r["audience"] == "user"]
    internal = [r for r in recipes if r["audience"] == "internal"]
    out = ['    <h2>工作流：一次走完幾個工具<small>%d 條；上一站的結果自動變成下一站的輸入</small></h2>' % len(user),
           '    <div class="how"><b>怎麼讀</b>一張卡一條工作流，站列是它會依序跑的工具，按你想做的事分組；每條都有自己的 3 分鐘課。<b>你要做的</b>情況像哪條就按「開始」；第一次走選「一站一站走」，每站都會停下來確認。你自己串的工作流也會出現在這裡。</div>']
    for gl in goals["goals"]:
        rs = [r for r in user if r["goal"] == gl["id"]]
        if not rs: continue
        out.append('    <section class="wfgroup">')
        out.append(f'    <h3 class="fam">{_esc(gl["title_zh"])}<small>{len(rs)} 條</small></h3>')
        out.append('    <div class="mcards">')
        for r in rs: out.extend(_wf_card(methods, goals, r))
        out.append('    </div>')
        out.append('    </section>')
    if internal:
        out.append(f'    <details class="dir mt14" id="wf-internal"><summary><b>平台維運用的工作流</b><small>{len(internal)} 條：{"、".join(_esc(r["name_zh"]) for r in internal)}；一般使用不需要</small></summary>')
        out.append('    <div class="mcards">')
        for r in internal: out.extend(_wf_card(methods, goals, r))
        out.append('    </div>')
        out.append('    </details>')
    return "\n".join(out) + "\n"


def render_directory(cat):
    """All tools, folded by goal (every method once: name (abbr) · en · one line, the row opens the tool's page), with
    the name search on top."""
    methods, goals = cat.methods, cat.goals
    n = len(methods)
    out = ['    <h2>全部 %d 個工具<small>按你想做的事分 %d 類；點開一類，或直接搜名字</small></h2>' % (n, len(goals["goals"])),
           '    <div class="how"><b>怎麼讀</b>每一類摺起來，標題就是首頁問句卡上的問句；點開是這一類的全部工具，每列中文名（縮寫）、英文名、一句話。<b>你要做的</b>知道名字就在下面搜，符合的類別會自動打開，符合的工作流列在搜尋框下；不知道名字就回首頁，從問句卡或「先說你卡在哪」進去。</div>',
           '    <input class="search" id="q" type="search" placeholder="知道名字就直接搜：SWOT、冰山、五力、決策樹、STRIDE…" aria-label="搜尋工具與工作流">',
           '    <p class="sub my6" id="hits" aria-live="polite">共 <span id="mcount">%d</span> 個工具</p>' % n]
    for gl in goals["goals"]:
        items = sorted(((mid, m) for mid, m in methods.items() if mid.split(".")[0] in gl["families"]), key=lambda x: x[1]["name_zh"])
        out.append(f'    <details class="dir" id="dir-{gl["id"]}" data-dir="{gl["id"]}"><summary><b>{_esc(gl["title_zh"])}</b><small>{len(items)} 個</small></summary>')
        for mid, m in items:
            q = _esc(" ".join(str(x) for x in [m["name_zh"], m["name_en"], m.get("abbr"), mid, m["blurb_zh"]] if x).lower())
            a = m.get("abbr") or ""
            abbr = f' <small>{_esc(a)}</small>' if a and a not in m["name_zh"] and a != m["name_en"] else ""   # no "SCAMPER SCAMPER SCAMPER"
            out.append(f'    <div class="tool" id="m-{mid}" data-q="{q}"><b><a href="{tool_href(mid)}">{_esc(m["name_zh"])}</a>{abbr}</b><span class="k">{_esc(m["name_en"])}</span><div class="sub">{_esc(m["blurb_zh"])}</div></div>')
        out.append('    </details>')
    return "\n".join(out) + "\n"


def render_tool_pages(cat):
    """One page per tool, shown one at a time in section#tool (the home script): what it does, how to start, what
    usually comes next, the workflows that use it, the common tools of its goal. Every line comes from the registries."""
    methods, recipes, goals, nexts = cat.methods, cat.recipes, cat.goals, cat.nexts
    size = {gl["id"]: sum(mid.split(".")[0] in gl["families"] for mid in methods) for gl in goals["goals"]}
    out = []
    for mid, m in methods.items():
        gl = _goal_of(goals, mid)
        a = m.get("abbr") or ""
        abbr = f' <small>{_esc(a)}</small>' if a and a not in m["name_zh"] and a != m["name_en"] else ""
        out += [f'    <article class="tpage" id="t-{mid}" hidden>',
                f'    <div class="crumbs"><a href="#tools">工具</a> › <a href="#dir-{gl["id"]}">{_esc(gl["title_zh"])}</a> › {_esc(m["name_zh"])}</div>',
                f'    <div class="top"><div><h1>{_esc(m["name_zh"])}{abbr}</h1><div class="sub">{_esc(m["name_en"])}</div></div></div>',
                '    <div class="card">',
                '      <h2>它幫你做什麼</h2>',
                '      <div class="how"><b>怎麼讀</b>第一句是它做什麼、什麼時候用；下面是做完常接的工具、用到它的工作流、同一類常用的工具，點名字就過去。<b>你要做的</b>像你的情況就按「開始」；第一次用先上它的課；不像就看同一類的其他工具。</div>',
                f'      <p class="lead">{_esc(m["blurb_zh"])}</p>',
                '      ' + _tool_buttons(mid),
                '      <h3 class="fam">做完常接</h3>']
        nx = nexts.get(mid, [])
        if nx:   # an id that is not an ACTIVE tool = named by the Atlas, not built yet: say so, never link it
            out.append('      <p class="my6">' + '、'.join(tool_link(methods, x) if x in methods else f'<span class="k">尚未上架的工具（{_esc(x)}）</span>' for x in nx) + '</p>')
        else:
            out.append('      <p class="sub my6">這個工具沒有固定的下一步：看下面同一類常用的，或回<a href="#home">首頁</a>說你卡在哪。</p>')
        out.append('      <h3 class="fam">用到它的工作流</h3>')
        wfs = [r for r in recipes if mid in r["steps"]]
        if wfs:
            out.append('      <p class="my6">' + '、'.join(f'<a href="#wf-{r["id"]}">{_esc(r["name_zh"])}</a>' + ('（平台維運用）' if r["audience"] == "internal" else '') for r in wfs) + '</p>')
        else:
            out.append('      <p class="sub my6">目前沒有工作流用到它；它可以單獨用。</p>')
        out += [f'      <h3 class="fam">同一類常用<small>{_esc(gl["title_zh"])}</small></h3>',
                '      <p class="my6">' + '、'.join(tool_link(methods, x) for x in gl["featured"] if x != mid) + f'；<a href="#dir-{gl["id"]}">看這一類全部 {size[gl["id"]]} 個 →</a></p>',
                '    </div>',
                '    </article>']
    return "\n".join(out) + "\n"


CATALOG_PARTIALS = {"catalog-prompts": render_prompts, "catalog-goals": render_goals, "catalog-featured": render_featured,
                    "catalog-workflows": render_workflows, "catalog-directory": render_directory, "catalog-tools": render_tool_pages}


def _catalog_partials(_cache={}):
    if "v" in _cache: return _cache["v"]                     # the lambdas below share one parse per process
    cat = _catalog()
    _cache["v"] = {name: render(cat) for name, render in CATALOG_PARTIALS.items()}
    return _cache["v"]


# partials rendered from data; the gate checks file == render (sync regenerates them first)
GENERATED = {"domain-chips": lambda: render_chips(load_domains())}
for _name in CATALOG_PARTIALS:
    GENERATED[_name] = (lambda n: (lambda: _catalog_partials()[n]))(_name)
REQUIRED_PARTIALS["home-mock.html"] = set(CATALOG_PARTIALS) | {"home-catalog-script"}


# plan U1 (operator 2026-09-25): an app, not one long page. The main menu is a left sidebar on a desktop and a bottom
# bar on a phone (NN/g left-side vertical nav: always visible, text labels; Material 3: navigation bar on compact
# widths, at most five destinations, labels always shown). Its four destinations are the four views of the home page.
NAV = [{"id": "home", "label": "首頁", "icon": "home"}, {"id": "tools", "label": "工具", "icon": "grid"},
       {"id": "workflows", "label": "工作流", "icon": "flow"}, {"id": "projects", "label": "我的專案", "icon": "folder"}]
SECTION = {"home-mock.html": "home", "iceberg-result-mock.html": "projects", "workflow-result-mock.html": "projects",
           "iceberg-lesson-mock.html": "tools", "workflow-lesson-mock.html": "workflows"}   # the menu item each page sits under
assert set(SECTION) == set(FILES) and set(SECTION.values()) <= {x["id"] for x in NAV}


def nav_href(page, view):
    """The home page switches its own views (#view); every other page opens the home artifact at that view."""
    return f"#{view}" if page in HOME else f"https://claude.ai/artifact/{ARTIFACT[HOME[0]]}#{view}"


def current_value(page):
    """aria-current: "page" for the view you are on (home), "true" for the section a deeper page sits under."""
    return "page" if page in HOME else "true"


def render_nav(page):
    """The main menu exactly as `page` carries it; aria-current marks the page's section (the home script moves it)."""
    n_tools, n_user, _ = counts(_catalog())
    num = {"tools": n_tools, "workflows": n_user}
    out = ['  <nav class="side" aria-label="主選單">',
           f'    <a class="brand" href="{nav_href(page, "home")}"><b>認知作業系統</b><small>思考工具・示意稿</small></a>']
    for x in NAV:
        cur = f' aria-current="{current_value(page)}"' if x["id"] == SECTION[page] else ""
        n = f'<small aria-hidden="true">{num[x["id"]]}</small>' if x["id"] in num else ""
        out.append(f'    <a class="navi" href="{nav_href(page, x["id"])}" data-view="{x["id"]}"{cur}>{icon(x["icon"])}<span>{x["label"]}</span>{n}</a>')
    out.append('  </nav>')
    return "\n".join(out) + "\n"


def _catalog(_cache={}):
    if "v" not in _cache: _cache["v"] = load_catalog()
    return _cache["v"]


PER_PAGE = {"app-nav": render_nav, "lesson-tabs": render_lesson_tabs}   # partials rendered per page (sync writes them, the gate compares); no file in partials/
for _f in FILES: REQUIRED_PARTIALS.setdefault(_f, set()).update({"app-nav", "page-actions-script"})
