#!/usr/bin/env python3
"""Tool lessons from data (plan D17/D23/D25, I11 M1–M12). A lesson is one entry of the evolvable kind `lessons`
(SPEC/evolution/lessons/<champion>.yaml, read through the registry's champion pointer); this module validates it and
renders it, one renderer for two outputs: the lesson mock's <main> (the tool lessons among mockkit.LESSON, links to
the published mocks) and the web app's lesson (mockkit.WEB_LESSONS, links to web routes). Workflow lessons stay
hand-written mocks exported by mockkit.export_lesson. sync-design-system.py writes both outputs, check-mocks.py
compares them. Not a CLI."""
import json, re, urllib.parse
import mockkit as mk
from ai_lego.errors import InvariantViolation  # noqa: E402  (mockkit put the COS root on sys.path)
from ai_lego.platform.evolution.registry import load_champion, load_version  # noqa: E402

KIND = "lessons"
MAIN = re.compile(r'(<main class="wrap">\n)(.*?)(\n</main>)', re.S)
ZH = "零一二三四五六七八九十"
# Text may carry these inline tags only (課文 a model drafts must not carry markup that runs); the picture only drawing
# elements, with no event handler, link or inline style.
INLINE = re.compile(r'</?(?:b|cite)>|<dfn title="[^"<>]*">|</dfn>')
SVG_TAGS = {"svg", "defs", "linearGradient", "stop", "clipPath", "path", "rect", "line", "g", "text", "tspan", "circle", "ellipse", "polygon", "polyline"}
CITE = re.compile(r"<cite>\[(\d+)\]</cite>")
# Tools whose result picture is drawn by code with fixed units (apps/cognitive-web/components/result/MethodVisual.tsx: the
# iceberg's four bands, top to bottom): their lesson has exactly these unit keys, in this order. Checked here, where data
# enters, so no lessons version the page cannot draw is ever generated.
DRAWN = {"systems.iceberg_model": ["events", "patterns", "structures", "mental_models"]}

# The shape of one lesson. A dict = exactly these keys ("?key" optional); ("domains", x) = exactly the active domains
# of domains.yaml, in its order; ("list", x, n) = at least n items; ("row", n) = exactly n texts.
TEXT, SVG, INT, KEY, URL = "text", "svg", "int", "key", "url"
UNIT_RESULT = {k: TEXT for k in ("name", "title", "short", "question", "ask4", "asks", "seen", "time", "when", "mode", "effect", "lasting")}
SHAPE = {
    "minutes": INT, "outcomes": TEXT,
    "start": {"new": TEXT, "demo": ("domains", TEXT), "prepare": ("list", TEXT, 3)},
    "what": {"how": TEXT, "lead": TEXT, "body": TEXT, "when": TEXT, "picture": SVG, "can": TEXT, "cant": TEXT},
    "units": {"title": TEXT, "how": TEXT, "mnemonic": TEXT,
              "items": ("list", {"key": KEY, "head": TEXT, "ask": TEXT, "examples": ("domains", TEXT), "result": UNIT_RESULT}, 2)},
    "worked": {"how": TEXT, "columns": ("row", 3), "after": TEXT, "result_link": ("domains", TEXT),
               "cases": ("domains", {"lead": TEXT, "rows": ("list", ("row", 3), 2)})},
    "fill": {"title": TEXT, "how": TEXT, "after": TEXT,
             "steps": ("list", {"title": TEXT, "how": TEXT, "good": ("domains", TEXT), "bad": ("domains", TEXT)}, 2)},
    "mistakes": {"how": TEXT, "items": ("list", {"title": TEXT, "?text": TEXT, "?by_domain": ("domains", TEXT)}, 3)},   # M7
    "quiz": ("domains", ("list", ("row", 2), 2)),
    "read": {"how": TEXT, "short": TEXT, "terms_label": TEXT, "steps": ("list", ("row", 2), 3), "terms": ("list", ("row", 2), 2),
             "rows": ("list", ("row", 2), 2)},
    "teach": {"how": TEXT, "handout": TEXT, "note": TEXT, "flow": ("list", ("row", 3), 2), "script": ("list", TEXT, 2),
              "questions": ("list", TEXT, 2), "errors": ("list", TEXT, 2)},
    "sources": ("list", {"text": TEXT, "?url": URL}, 2),
}


def _check(v, shape, at, domains):
    if isinstance(shape, dict):
        if not isinstance(v, dict): raise ValueError(f"{at}: expected a mapping")
        need = {k for k in shape if not k.startswith("?")}
        allowed = need | {k[1:] for k in shape if k.startswith("?")}
        if not need <= set(v) <= allowed: raise ValueError(f"{at}: keys {sorted(v)} (need {sorted(need)}, may add {sorted(allowed - need)})")
        for k, x in v.items(): _check(x, shape[k] if k in shape else shape["?" + k], f"{at}.{k}", domains)
    elif isinstance(shape, tuple) and shape[0] == "domains":
        if not isinstance(v, dict) or list(v) != domains: raise ValueError(f"{at}: one entry per active domain, in domains.yaml order {domains}")
        for k, x in v.items(): _check(x, shape[1], f"{at}.{k}", domains)
    elif isinstance(shape, tuple) and shape[0] == "list":
        if not isinstance(v, list) or len(v) < shape[2]: raise ValueError(f"{at}: a list of at least {shape[2]}")
        for i, x in enumerate(v): _check(x, shape[1], f"{at}[{i}]", domains)
    elif isinstance(shape, tuple) and shape[0] == "row":
        if not isinstance(v, list) or len(v) != shape[1]: raise ValueError(f"{at}: exactly {shape[1]} texts")
        for i, x in enumerate(v): _check(x, TEXT, f"{at}[{i}]", domains)
    elif shape == INT:
        if not isinstance(v, int) or isinstance(v, bool) or v < 1: raise ValueError(f"{at}: a positive whole number")
    else:
        if not isinstance(v, str) or not v.strip(): raise ValueError(f"{at}: non-empty text")
        if shape == KEY and not re.fullmatch(r"[a-z][a-z0-9_]*", v): raise ValueError(f"{at}: {v!r} is not a key (a-z, 0-9, _)")
        if shape == URL and not re.fullmatch(r"https?://[^\s\"<>]+", v): raise ValueError(f"{at}: {v!r} is not an http(s) address")
        if shape == TEXT:
            bad = [t for t in re.findall(r"<[^>]*>", v) if not INLINE.fullmatch(t)]
            if bad: raise ValueError(f"{at}: markup {bad[0]!r} (text may carry only <b>, <cite>, <dfn title>)")
        if shape == SVG:
            head = v.split(">", 1)[0]
            if not v.startswith("<svg ") or 'role="img"' not in head or "aria-label=" not in head:
                raise ValueError(f'{at}: one <svg role="img" aria-label=…> picture')
            for close, tag, attrs in re.findall(r"<(/?)([A-Za-z]+)([^>]*)>", v):
                names = [x.lower() for x in re.findall(r"([\w:-]+)\s*=", attrs)]
                if tag not in SVG_TAGS or any(x.startswith("on") or x in ("href", "xlink:href", "style") for x in names):
                    raise ValueError(f"{at}: <{close}{tag}{attrs}> is not a drawing element (allowed: {', '.join(sorted(SVG_TAGS))}; no on*, href, style)")


def _texts(v):
    if isinstance(v, str): yield v
    elif isinstance(v, dict):
        for x in v.values(): yield from _texts(x)
    elif isinstance(v, list):
        for x in v: yield from _texts(x)


def validate(doc, domains, methods):
    """-> {method id: lesson} of a lessons version document; ValueError naming the first defect."""
    if not isinstance(doc.get("methods"), dict) or not doc["methods"]: raise ValueError("lessons: expected a non-empty methods mapping")
    for mid, lesson in doc["methods"].items():
        if mid not in methods: raise ValueError(f"lessons: {mid} is not an ACTIVE method")
        _check(lesson, SHAPE, mid, domains)
        keys = [u["key"] for u in lesson["units"]["items"]]
        if len(set(keys)) != len(keys): raise ValueError(f"{mid}.units.items: duplicate key")
        if mid in DRAWN and keys != DRAWN[mid]: raise ValueError(f"{mid}.units.items: keys {keys} must be {DRAWN[mid]} (its result picture draws exactly these, in order)")
        for i, m in enumerate(lesson["mistakes"]["items"]):
            if ("text" in m) == ("by_domain" in m): raise ValueError(f"{mid}.mistakes.items[{i}]: exactly one of text, by_domain")
        end = 0
        for i, (span, _, _) in enumerate(lesson["teach"]["flow"]):
            m = re.fullmatch(r"(\d+)–(\d+)", span)
            if not m or int(m.group(1)) != end or int(m.group(2)) <= end: raise ValueError(f"{mid}.teach.flow[{i}]: {span!r} must run on from {end} (a–b minutes)")
            end = int(m.group(2))
        n = len(lesson["sources"])
        for t in _texts(lesson):
            for c in CITE.findall(t):
                if not 1 <= int(c) <= n: raise ValueError(f"{mid}: [{c}] cites no source (there are {n})")
    return doc["methods"]


def gaps(lesson):
    """What this lesson still lacks for M8 (at least two source addresses, every source cited): its 知識不足 list. The
    other lesson checks (M1, M2, M4–M7, M12) are the shape: a lesson that misses one does not load."""
    out = []
    if sum("url" in s for s in lesson["sources"]) < 2: out.append("M8（來源網址少於 2 個）")
    cited = {int(c) for t in _texts(lesson) for c in CITE.findall(t)}
    loose = [i for i in range(1, len(lesson["sources"]) + 1) if i not in cited]
    if loose: out.append("M8（來源 " + "、".join(f"[{i}]" for i in loose) + " 沒有被課文引用）")
    return out


def load(version=None):
    """-> (version, {method id: lesson}): the champion, or `version` (a candidate to preview); ValueError on any defect."""
    try:
        version, doc = (version, load_version(mk.SPEC, KIND, version)) if version else load_champion(mk.SPEC, KIND)
    except InvariantViolation as e:
        raise ValueError(str(e)) from e
    return version, validate(doc, mk.active_ids(mk.load_domains()), mk._catalog().methods)


# -- links: a lesson names where a link goes (tools, tool, ask, new, demo, result); the mode says what it is
def mock_links(mid):
    """Links into the published mocks (a method with demo pages, mockkit.DEMOS)."""
    _, result = mk.DEMOS[mid]
    home = mk.HOME[0]
    to = {"tools": mk.artifact_href(home, "tools"), "tool": mk.artifact_href(home, f"t-{mid}"), "ask": mk.artifact_href(home, "ask"),
          "new": mk.artifact_href(result, "new"), "demo": mk.artifact_href(result, "demo"), "result": mk.artifact_href(result)}
    return lambda target: ("href", to[target])


def web_links(mid):
    """Web routes; the finished demo result page the web does not have yet says so instead (mockkit.WEB_PENDING)."""
    to = {"tools": ("href", mk.WEB_HOME["tools"]), "tool": ("href", mk.WEB_HOME_PREFIX["t-"].format(mid)), "ask": ("href", mk.WEB_HOME["ask"]),
          "new": ("href", mk.web_run(mid)), "demo": ("href", mk.web_run(mid, "demo")), "result": ("note", mk.WEB_PENDING["tool"])}
    return lambda target: to[target]


def render(mid, lesson, go, mock):
    """The lesson's <main> content: with `mock` the mock page's (banner, comment and partial-marker lines), else the
    web app's (mockkit.export_lesson's form)."""
    d = mk.load_domains()
    ids, default = mk.active_ids(d), d["default"]
    name = mk._esc(mk._catalog().methods[mid]["name_zh"])
    tabs = mk.LESSON_TABS["tool"]

    def a(target, inner, cls=None):
        kind, value = go(target)
        if kind == "note": return f'<button type="button" class="{cls or "btn"}" data-note="{mk._esc(value)}">{inner}</button>'
        return (f'<a class="{cls}" ' if cls else "<a ") + f'href="{mk._esc(value)}">{inner}</a>'

    def hide(x):
        return "" if x == default else " hidden"

    def ex(tag, values, fmt=lambda v: v):   # one element per domain, only the default visible (D18)
        return [f'<{tag} class="ex" data-set="{x}"{hide(x)}>{fmt(values[x])}</{tag}>' for x in ids]

    def panel(i):
        tid = tabs[i][0]
        return f'  <section class="tabpanel" id="panel-{tid}" role="tabpanel" aria-labelledby="tab-{tid}"{" hidden" if i else ""}>'

    def tabnext(i):
        tid, label, _ = tabs[i + 1]
        return f'  <div class="tabnext"><button type="button" class="btn" data-tab-go="{tid}">下一個分頁：{label} →</button>{a("new", "開始填我的案例 →", "btn primary")}</div>'

    def partial(pname, body):
        return ([f"  {mk.partial_start(pname)}"] if mock else []) + [body.rstrip("\n")] + ([f"  {mk.partial_end(pname)}"] if mock else [])

    S, W, U, F, fill, M, R, T = (lesson[k] for k in ("start", "what", "units", "worked", "fill", "mistakes", "read", "teach"))
    src, minutes = lesson["sources"], lesson["minutes"]
    missing = gaps(lesson)
    pill = f'<span class="pill">知識不足：缺 {"、".join(missing)}</span>' if missing else '<span class="pill ok">工具齊備 M1–M10 ✓</span>'
    out = [""]
    if mock: out.append(f'  <div class="banner"><b>示意稿</b>：這是第一次用「{name}」的人，按下工具之前會先看到的一堂課：最上面一張「開始」卡，下面的分頁按內容分開，不用一次看完。之後每個工具都照這個樣子有一堂，內容來自工具資料，會隨回饋改進。</div>')
    out += [f'  <div class="crumbs">{a("tools", "工具")} › {a("tool", name)} › {minutes} 分鐘課</div>', "",
            '  <div class="top">', "    <div>", f"      <h1>{name}：開始前 {minutes} 分鐘</h1>",
            '      <div class="sub">想直接做，按下面的「開始填我的案例」；想先學，照分頁一頁一頁看，每頁不到兩分鐘。</div>', "    </div>", "  </div>",
            f'  <div class="status">{pill}<span>課程來源 {len(src)} 筆 ' + "".join(f"<cite>[{i}]</cite>" for i in range(1, len(src) + 1))
            + f'</span><span>約 {minutes} 分鐘</span><span>學完你會：{lesson["outcomes"]}</span><span>教材版在「教材版」分頁（給老師／帶領者）</span></div>', ""]
    if mock: out.append("  <!-- 開始：這堂課唯一的主要動作，永遠在最上面 -->")
    # 開始 (U15: the one action, above everything)
    out += ['  <div class="card cta" id="start">', "    <h2>開始：填你自己的案例<small>準備 30 秒</small></h2>",
            '    <div class="how"><b>怎麼讀</b>這張卡一直在最上面；下面的分頁是課程，看完或看到一半都能回來按。<b>你要做的</b>按「開始填我的案例」；還不確定，先用示範案例試一次，或按第三顆讓系統幫你挑。</div>',
            '    <div class="btns">', "      " + a("new", f'開始填我的案例 →<small>{S["new"]}</small>', "btn primary big"),
            "      " + a("demo", "用示範案例試一次<small>" + "".join(ex("span", S["demo"], lambda v: v + "，已填好，按執行就看結果")) + "</small>", "btn"),
            "      " + a("ask", "這工具適合我的問題嗎？<small>描述你的問題，系統幫你挑，最多三個建議</small>", "btn ghost"), "    </div>",
            '    <p class="sub mt10 mb0">手邊有這些會填得比較快，沒有也可以先填、之後補：</p>', '    <ul class="check">']
    out += [f"      <li>{x}</li>" for x in S["prepare"]]
    out += ["    </ul>", '    <p class="sub mb0">這堂課之後不會再自動出現；想再看，工具頁右上角「怎麼用？」隨時能打開，會另開一個分頁，填到一半的格子不會不見。</p>', "  </div>", ""]
    out += partial("domain-chips", mk.render_chips(d)) + partial("lesson-tabs", mk.render_tabs("tool")) + [""]
    # 認識
    out += [panel(0), '  <div class="card">', "    <h2>這是什麼<small>30 秒</small></h2>", f'    <div class="how">{W["how"]}</div>', '    <div class="grid2">',
            "      <div>", f'        <p class="lead">{W["lead"]}</p>', f'        <p>{W["body"]}</p>', f'        <p class="sub">{W["when"]}</p>', "      </div>"]
    out += ["      " + ln for ln in W["picture"].split("\n")]
    out += ["    </div>", '    <div class="grid2c">', f'      <div class="can"><b>這工具能回答</b>{W["can"]}</div>',
            f'      <div class="cant"><b>這工具不能回答</b>{W["cant"]}</div>', "    </div>", "  </div>", "",
            '  <div class="card">', f'    <h2>{U["title"]}<small>1 分鐘</small></h2>', f'    <div class="how">{U["how"]}</div>', '    <div class="grid2" id="examples">']
    for i, u in enumerate(U["items"], 1):
        rows = ex("div", u["examples"], lambda v: "例：" + v)
        out += [f'      <div class="exlayer l{i}"><b>{u["head"]}</b><div class="q">問：{u["ask"]}</div>'] + ["        " + r for r in rows[:-1]] + ["        " + rows[-1] + "</div>"]
    out += ["    </div>", f'    <p class="sub mt10 mb0">{U["mnemonic"]}</p>', "  </div>", tabnext(0), "  </section>", ""]
    # 看例子
    out += [panel(1), '  <div class="card">', "    <h2>看一個做完的例子<small>1 分鐘</small></h2>", f'    <div class="how">{F["how"]}</div>', '    <div id="worked">']
    for x in ids:
        c = F["cases"][x]
        out += [f'    <div class="ex" data-set="{x}"{hide(x)}>', f'      <p class="lead">{c["lead"]}</p>', "      <table>",
                "        <tr>" + "".join(f"<th>{h}</th>" for h in F["columns"]) + "</tr>"]
        out += ["        <tr>" + "".join(f"<td>{v}</td>" for v in row) + "</tr>" for row in c["rows"]]
        out += ["      </table>", "    </div>"]
    out += ["    </div>", f'    <p class="sub mt8 mb0">{F["after"]}</p>',
            '    <div class="btns mt8">' + a("result", "看一個完整分析頁 →<small>" + "".join(ex("span", F["result_link"])) + "</small>", "btn primary") + "</div>",
            "  </div>", tabnext(1), "  </section>", ""]
    # 怎麼填 (M6) + 常見錯誤 (M7) + 自我檢查
    out += [panel(2), '  <div class="card">', f'    <h2>{fill["title"]}<small>1 分鐘</small></h2>', f'    <div class="how">{fill["how"]}</div>']
    for i, st in enumerate(fill["steps"], 1):
        pairs = {x: f'<div class="good"><b>好</b>：{st["good"][x]}</div><div class="bad"><b>壞</b>：{st["bad"][x]}</div>' for x in ids}
        out += [f'    <div class="step"><div class="n">{i}</div><div><b>{st["title"]}</b>：{st["how"]}',
                '      <div class="gb">' + "".join(ex("div", pairs)) + "</div></div></div>"]
    out += [f'    <p class="sub mt8 mb0">{fill["after"]}</p>', "  </div>", "",
            '  <div class="card">', "    <h2>常見錯誤<small>30 秒</small></h2>", f'    <div class="how">{M["how"]}</div>']
    out += [f'    <div class="mistake"><i>✕</i><span><b>{m["title"]}</b>：' + (m["text"] if "text" in m else "".join(ex("span", m["by_domain"]))) + "</span></div>" for m in M["items"]]
    out.append('    <div class="quiz"><b>自我檢查（30 秒，點開看答案）</b>')
    for x in ids:
        out.append(f'      <div class="ex" data-set="{x}"{hide(x)}>')
        out += [f"        <details><summary>{q}</summary>{ans}</details>" for q, ans in lesson["quiz"][x]]
        out.append("      </div>")
    out += ["    </div>", "  </div>", "", tabnext(2), "  </section>", ""]
    # 看懂結果
    out += [panel(3), '  <div class="card">', "    <h2>看懂結果：按「執行分析」之後那一頁怎麼讀<small>1 分鐘</small></h2>", f'    <div class="how">{R["how"]}</div>', '    <div class="todos">']
    out += [f'      <div class="todo"><b>{h}</b>{t}</div>' for h, t in R["steps"]]
    out += ["    </div>", f'    <p class="sub mt8">{R["short"]}</p>',
            f'    <div class="terms"><b>{R["terms_label"]}：</b>' + "".join(f"<span><b>{t}</b> {v}</span>" for t, v in R["terms"]) + "</div>",
            '    <h3 class="fam">頁首和九段，每段回答一件事</h3>']
    out += [f'    <div class="row"><b>{h}</b><span>{t}</span></div>' for h, t in R["rows"]]
    out += ["  </div>", f'  <div class="tabnext">{a("new", "開始填我的案例 →", "btn primary")}{a("result", "對照一個做完的結果頁 →", "btn")}</div>', "  </section>", ""]
    # 教材版 (D25 ③, M12)
    total, n_err = T["flow"][-1][0].split("–")[1], len(T["errors"])
    out += [panel(4), '  <div class="card">', "    <h2>教材版：給老師／帶領者<small>同一份資料，另一種排版</small></h2>", f'    <div class="how">{T["how"]}</div>',
            f"    <details><summary><b>課堂流程（{total} 分鐘）</b></summary>", '      <table class="mt6">', "        <tr><th>分</th><th>做什麼</th><th>用學員版哪一頁</th></tr>"]
    out += ["        <tr>" + "".join(f"<td>{v}</td>" for v in row) + "</tr>" for row in T["flow"]]
    out += ["      </table>", "    </details>", "    <details><summary><b>講稿要點（每步 2–3 句）</b></summary>", '      <ul class="check">']
    out += [f"        <li>{x}</li>" for x in T["script"]]
    out += ["      </ul>", "    </details>", f'    <details><summary><b>討論題（{len(T["questions"])} 題）</b></summary>', '      <ol class="src">']
    out += [f"        <li>{x}</li>" for x in T["questions"]]
    out += ["      </ol>", "    </details>", f"    <details><summary><b>學員最常錯的{ZH[n_err] if n_err <= 10 else n_err}件事，怎麼接</b></summary>", '      <ul class="check">']
    out += [f"        <li>{x}</li>" for x in T["errors"]]
    out += ["      </ul>", "    </details>", "    <details><summary><b>講義與投影片</b></summary>", f'      <p class="my6">{T["handout"]}</p>', "    </details>",
            f'    <p class="sub mt8 mb0">{T["note"]}</p>', "  </div>", "  </section>", ""]
    # 來源 (M8)
    out += [panel(5), '  <div class="card">', "    <h2>課程來源（每段課文的 [n]）</h2>",
            '    <div class="how"><b>怎麼讀</b>[n] 是那段課文的依據；來源不足的工具會在頂端顯示「知識不足：缺哪幾項」。<b>你要做的</b>不用做；發現寫錯可以回報。</div>', '    <ol class="src">']
    for s in src:
        link = f' <a href="{mk._esc(s["url"])}"{mk.NEW_TAB}>{mk._esc(urllib.parse.urlsplit(s["url"]).netloc)} ↗</a>' if "url" in s else ""
        out.append(f"      <li>{s['text']}{link}</li>")
    out += ["    </ol>", '    <p class="sub">課文由工具自己的資料庫（來源、契約、範例）生成並由人審定；之後每個工具都用同一套規則產生自己的課。</p>', "  </div>", "  </section>"]
    return "\n".join(out)


TOOL_MOCKS = [f for f in mk.LESSON if mk.LESSON_KIND[f] == "tool"]   # lesson mocks whose <main> is rendered from data


def mock_main(page):
    """The <main> content `page` (one of TOOL_MOCKS) must carry: its method's lesson in the champion, mock form."""
    _, mid, _ = mk.lesson_route(page)
    _, lessons = load()
    if mid not in lessons: raise ValueError(f"{page} shows {mid}, which has no lesson in the {KIND} champion")
    return render(mid, lessons[mid], mock_links(mid), mock=True)


WEB_UNITS = mk.HERE.parents[1] / "apps/cognitive-web/lib/toolsheets.generated.ts"


NO_LESSON = ["M1、M2、M4–M8（這個工具還沒有課）"]   # a tool absent from the lessons data: its units and its lesson
SHOWS_FILE = mk.SPEC / "methods/registry/result-page-shows.yaml"   # which tools' views ③ of a tool's result page draws


def render_web_units():
    """apps/cognitive-web/lib/toolsheets.generated.ts: each tool's units (units.items[].result) for its result page,
    what each tool's knowledge still lacks (gaps; NO_LESSON for a tool without a lesson) for its result page's top, and
    the tools each tool's ③ draws besides A and B (SHOWS_FILE by_method; the web's OWN_CHARTS must match it)."""
    _, lessons = load()
    j = lambda v: json.dumps(v, ensure_ascii=False)
    out = ["// GENERATED by docs/mockups/sync-design-system.py from the lessons data (lessonkit). Do not edit: a new lessons version",
           "// + sync; check-mocks.py fails while this differs. Per tool, its picture's units in order (plan I11 M1/M2), the",
           "// 知識不足 list (I11 M1–M12): empty = complete; a tool not listed has no lesson yet (NO_LESSON); and the tools whose view",
           "// ③ draws as its own chart (methods/registry/result-page-shows.yaml by_method).",
           "export type UnitFacts = { " + "; ".join(f"{k}: string" for k in ["key", *UNIT_RESULT]) + " };",
           "export const UNIT_FACTS: Record<string, UnitFacts[]> = {"]
    for mid, lesson in lessons.items():
        out.append(f"  {j(mid)}: [")
        out += [f"    {j({'key': u['key'], **u['result']})}," for u in lesson["units"]["items"]]
        out.append("  ],")
    out += ["};", "export const KNOWLEDGE_GAPS: Record<string, string[]> = {"]
    out += [f"  {j(mid)}: {j(gaps(lesson))}," for mid, lesson in lessons.items()]
    out += ["};", f"export const NO_LESSON: string[] = {j(NO_LESSON)};", "export const RESULT_PAGE_SHOWS: Record<string, string[]> = {"]
    out += [f"  {j(mid)}: {j([str(x) for x in ids])}," for mid, ids in (mk._yaml(SHOWS_FILE).get("by_method") or {}).items()]
    out += ["};"]
    return "\n".join(out) + "\n"


def render_web_lessons(folder=None):
    """apps/cognitive-web/lib/lessons.generated.ts: every tool lesson in the champion, then the workflow lesson mocks in
    `folder` (default: these mocks) through mockkit.export_lesson."""
    folder = mk.pathlib.Path(folder or mk.HERE)
    j = lambda v: json.dumps(v, ensure_ascii=False)
    out = ["// GENERATED by docs/mockups/sync-design-system.py: tool lessons from the lessons data (lessonkit), workflow lessons from",
           "// their mocks (mockkit.export_lesson). Do not edit: edit the data or the mock and run sync; check-mocks.py fails while this differs.",
           'export type Lesson = { kind: "tool" | "workflow"; href: string; title: string; html: string };',
           "export const LESSONS: Record<string, Lesson> = {"]
    _, lessons = load()
    names = mk._catalog().methods
    for mid, lesson in lessons.items():
        body = render(mid, lesson, web_links(mid), mock=False).strip("\n") + "\n"
        title = f'{names[mid]["name_zh"]}：開始前 {lesson["minutes"]} 分鐘'
        out.append(f'  {j(mid)}: {{ kind: "tool", href: {j(f"/learn/{mid}")}, title: {j(title)}, html: {j(body)} }},')
    for page in mk.LESSON:
        if page in TOOL_MOCKS: continue
        kind, lid, href = mk.lesson_route(page)
        title, body = mk.export_lesson(page, (folder / page).read_bytes().decode("utf-8"))
        out.append(f"  {j(lid)}: {{ kind: {j(kind)}, href: {j(href)}, title: {j(title)}, html: {j(body)} }},")
    out.append("};")
    return "\n".join(out) + "\n"
