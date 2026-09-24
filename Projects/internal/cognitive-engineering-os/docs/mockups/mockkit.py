#!/usr/bin/env python3
"""Shared helpers for the mock tooling (sync-design-system.py, check-mocks.py, build-artifact.py): the page list, the
one domain list (SPEC/methods/examples/domains.yaml), the chip row rendered from it, and the partial markers.
Logic lives here once; the scripts only call it. Not a CLI."""
import pathlib, re

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[4]                                   # COS/docs/mockups -> …/Projects/internal/COS -> repo root
SPEC = REPO / "agency-os/docs/AI_LEGO_Cognitive_Engineering_OS"
DOMAINS_FILE = SPEC / "methods/examples/domains.yaml"    # plan U21: the single domain list
DESIGN_SYSTEM = HERE / "design-system.css"               # plan U19: the single stylesheet
PARTIALS = HERE / "partials"                             # shared markup fragments, copied verbatim into the pages
HOME = ["home-mock.html"]
RESULT = ["iceberg-result-mock.html", "workflow-result-mock.html"]
LESSON = ["iceberg-lesson-mock.html", "workflow-lesson-mock.html"]
FILES = HOME + RESULT + LESSON
# published artifact ids (the product replaces them with routes); check-mocks.py LINKS says who must link to whom
ARTIFACT = {"home-mock.html": "5j9jef81ts5mqmYpVARNmJ",
            "iceberg-result-mock.html": "7JLjM7mGyqTMLJmCMUmWqq", "iceberg-lesson-mock.html": "653Kt4JtExaujnffNDvygY",
            "workflow-result-mock.html": "7xEwPu9Cp2rWf3P8g9X1Pk", "workflow-lesson-mock.html": "TP18Q3Xif2BphmAfbxxrKU"}
# <style> layout: marker line, design-system.css verbatim, end marker, page marker (page section must stay empty)
CSS_START = "  /* == shared design system: start (byte-identical in every mock; check-mocks.py enforces) == */"
CSS_END = "  /* == shared design system: end == */"
CSS_PAGE = "  /* == page-specific == */"
# partials: <!-- == partial: <name>: start … == --> body <!-- == partial: <name>: end == -->; body == partials/<name>.html
REQUIRED_PARTIALS = {f: {"domain-chips", "lesson-chip-script"} for f in LESSON}
FRAG = re.compile(r"^[ \t]*<!-- == partial: ([a-z0-9-]+): start[^\n]*-->\n(?:(.*?)\n)??[ \t]*<!-- == partial: \1: end == -->", re.S | re.M)  # body may be empty (a fresh page before its first sync); lazy so it never reaches a later copy


def partial_start(name):
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


def _yaml(path):
    """yaml.safe_load that rejects a duplicate key (PyYAML silently keeps the last one) and returns the document."""
    import yaml

    class Strict(yaml.SafeLoader):
        def construct_mapping(self, node, deep=False):
            keys = [self.construct_object(k, deep=True) for k, _ in node.value]
            for k in keys:
                if keys.count(k) > 1: raise ValueError(f"{path.name}: duplicate key {k!r} at line {node.start_mark.line + 1}")
            return super().construct_mapping(node, deep)
    return yaml.load(path.read_text(encoding="utf-8"), Loader=Strict)


def _text(x):
    return isinstance(x, str) and x.strip() != ""


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
RECIPES_DIR = SPEC / "recipes/validated"                                     # the workflows GET /recipes lists (ACTIVE *.recipe.yaml)
RECIPE_DISPLAY_FILE = SPEC / "recipes/registry/recipe-display-metadata.yaml"  # zh name / blurb / group per recipe
CONTRACTS_DIR = SPEC / "methods/contracts"                                   # the ACTIVE contracts GET /methods lists; display ids must equal them
# the only method and the only workflow that have a published lesson + result demo today (mock pages)
DEMOS = {"systems.iceberg_model": ("iceberg-lesson-mock.html", "iceberg-result-mock.html"),
         "life-decision-v1": ("workflow-lesson-mock.html", "workflow-result-mock.html")}


def _esc(s):
    import html
    return html.escape(str(s), quote=True)


def load_catalog():
    """-> (methods, families, recipes) from the SPEC registries, fully validated. ValueError on any gap — a method or
    family without its three labels, a display list that differs from the ACTIVE contracts GET /methods serves, an
    ACTIVE recipe without display data or with a step whose method id is unknown — so the gate reports it instead of
    rendering a half-labelled catalogue."""
    dm = _yaml(METHODS_FILE)
    methods = dm.get("entries") if isinstance(dm, dict) else None
    if not isinstance(methods, dict) or not methods: raise ValueError(f"{METHODS_FILE.name}: entries missing or empty")
    for mid, m in methods.items():
        if not isinstance(m, dict) or not all(_text(m.get(k)) for k in ("name_zh", "name_en", "blurb_zh")):
            raise ValueError(f"{METHODS_FILE.name}: {mid} needs non-empty name_zh, name_en, blurb_zh")
        if m.get("abbr") is not None and not isinstance(m["abbr"], str): raise ValueError(f"{METHODS_FILE.name}: {mid} abbr must be text")
    active = set()
    for p in CONTRACTS_DIR.glob("*.contract.yaml"):
        c = _yaml(p)
        if isinstance(c, dict) and c.get("status") == "ACTIVE": active.add(c.get("method_id") or c.get("id"))
    if active != set(methods):
        raise ValueError(f"{METHODS_FILE.name}: display ids differ from the ACTIVE contracts GET /methods serves: {sorted(active ^ set(methods))[:5]}")
    fams = _yaml(FAMILIES_FILE)
    if not isinstance(fams, dict) or fams.get("version") != 1 or not isinstance(fams.get("families"), dict): raise ValueError(f"{FAMILIES_FILE.name}: expected version: 1 and families")
    for f, lab in fams["families"].items():
        if not isinstance(lab, dict) or set(lab) != {"name_zh", "name_en", "blurb_zh"} or not all(_text(v) for v in lab.values()):
            raise ValueError(f"{FAMILIES_FILE.name}: family {f} needs exactly name_zh, name_en, blurb_zh, all non-empty")
    missing = sorted({m.split(".")[0] for m in methods} - set(fams["families"]))
    if missing: raise ValueError(f"{FAMILIES_FILE.name}: no label for families {missing}")
    rd = _yaml(RECIPE_DISPLAY_FILE)
    if not isinstance(rd, dict) or rd.get("version") != 1 or not isinstance(rd.get("entries"), dict) or not isinstance(rd.get("groups"), list):
        raise ValueError(f"{RECIPE_DISPLAY_FILE.name}: expected version: 1, groups, entries")
    if len(set(rd["groups"])) != len(rd["groups"]): raise ValueError(f"{RECIPE_DISPLAY_FILE.name}: duplicate group")
    recipes = []
    for p in sorted(RECIPES_DIR.glob("*.recipe.yaml")):
        r = _yaml(p)
        if not isinstance(r, dict) or r.get("status") != "ACTIVE": continue     # same filter as GET /recipes
        rid = r.get("id")
        if not _text(rid) or not _text(r.get("name") or r.get("title")) or not isinstance(r.get("steps"), list) or not r["steps"]:
            raise ValueError(f"{p.name}: an ACTIVE recipe needs id, name/title and a non-empty steps list")
        d = rd["entries"].get(rid)
        if not isinstance(d, dict) or set(d) != {"group_zh", "name_zh", "blurb_zh"} or not all(_text(v) for v in d.values()):
            raise ValueError(f"{RECIPE_DISPLAY_FILE.name}: {rid} needs exactly group_zh, name_zh, blurb_zh, all non-empty")
        if d["group_zh"] not in rd["groups"]: raise ValueError(f"{RECIPE_DISPLAY_FILE.name}: {rid} group {d['group_zh']!r} not in groups")
        steps = []
        for st in r["steps"]:
            if not isinstance(st, dict): raise ValueError(f"{p.name}: a step is not a mapping")
            if st.get("type") == "method" or st.get("method_id"):
                if st.get("method_id") not in methods: raise ValueError(f"{p.name}: step {st.get('label')!r} uses unknown method {st.get('method_id')!r}")
                steps.append(st["method_id"])
            else:
                steps.append("capability")
        recipes.append({"id": rid, "name": r.get("name") or r.get("title"), "steps": steps, **d})
    if not recipes: raise ValueError(f"{RECIPES_DIR}: no ACTIVE recipe")
    return methods, fams, {"groups": rd["groups"], "recipes": recipes}


def render_families(cat):
    """Family chips (multi-select, aria-pressed) with counts, in descending size order."""
    methods, fams, _ = cat
    counts = {}
    for m in methods: counts[m.split(".")[0]] = counts.get(m.split(".")[0], 0) + 1
    lines = ['    <div class="chips" role="group" aria-label="方法家族（可多選）">', '      <span class="sub">家族：</span>']
    for f, n in sorted(counts.items(), key=lambda x: (-x[1], x[0])):
        lines.append(f'      <button class="chip" aria-pressed="false" data-fam="{f}" title="{_esc(fams["families"][f]["blurb_zh"])}">{_esc(fams["families"][f]["name_zh"])} {n}</button>')
    lines.append("    </div>")
    return "\n".join(lines) + "\n"


def render_workflows(cat):
    """Workflow cards grouped as recipe-display-metadata.yaml says; stations = the method names in order."""
    methods, _, rd = cat
    art = ARTIFACT
    def stations(steps):
        """Method names in order; a run of capability steps collapses to one chip with a count (db-migration has 15)."""
        out, run = [], 0
        for s in steps + [None]:
            if s == "capability": run += 1; continue
            if run: out.append("能力步" if run == 1 else f"能力步 ×{run}"); run = 0
            if s is not None: out.append(_esc(methods[s]["name_zh"]))
        return out
    n = len(rd["recipes"])
    out = ['    <h2>工作流<small><span id="wcount">%d</span>／%d 條：幾個方法排好順序，上一站的結果自動變成下一站的輸入</small></h2>' % (n, n),
           '    <div class="how"><b>怎麼讀</b>一張卡一條路；站列是它會依序跑的方法，按一站可看那個方法。<b>你要做的</b>找到你的情境按「開始」；第一次走先上那條路的短課（可跳）。自己串的工作流也會出現在這裡。</div>']
    for g in rd["groups"]:
        rs = [r for r in rd["recipes"] if r["group_zh"] == g]
        if not rs: continue
        out.append(f'    <section class="wfgroup">')
        out.append(f'    <h3 class="fam">{_esc(g)}<small>{len(rs)} 條</small></h3>')
        out.append('    <div class="mcards">')
        for r in rs:
            demo = DEMOS.get(r["id"])
            q = _esc(" ".join([r["name_zh"], r["name"], r["id"], r["blurb_zh"]] + [methods[s]["name_zh"] for s in r["steps"] if s in methods]).lower())
            out.append(f'      <div class="mcard wf" data-q="{q}">')
            out.append(f'        <div><b>{_esc(r["name_zh"])}</b><span class="tag">{len(r["steps"])} 站</span></div>')
            out.append(f'        <div class="k">{_esc(r["name"])}</div>')
            out.append('        <div class="journey">' + '<i>→</i>'.join(f'<span>{s}</span>' for s in stations(r["steps"])) + '</div>')
            out.append(f'        <div>{_esc(r["blurb_zh"])}</div>')
            if demo:
                out.append(f'        <div class="btns"><span class="btn primary">開始</span><a class="btn" href="https://claude.ai/artifact/{art[demo[0]]}">第一次走？先上 3 分鐘的課 →</a><a class="btn ghost" href="https://claude.ai/artifact/{art[demo[1]]}">看示範總覽 →</a></div>')
            else:
                out.append('        <div class="btns"><span class="btn primary">開始</span><a class="btn" href="#" title="這條路的 3 分鐘課：P3 隨工作流資料產出">第一次走？先上 3 分鐘的課 →</a></div>')
            out.append('      </div>')
        out.append('    </div>')
        out.append('    </section>')
    return "\n".join(out) + "\n"


def render_methods(cat):
    """Every method, grouped by family (largest first): zh name (abbr) · en name · one-line blurb; search text in data-q."""
    methods, fams, _ = cat
    art = ARTIFACT
    by = {}
    for mid, m in methods.items(): by.setdefault(mid.split(".")[0], []).append((mid, m))
    n = len(methods)
    out = ['    <h2>單一方法<small><span id="mcount">%d</span>／%d 個，%d 個家族：一個方法 = 一張表單、一堂短課、一頁結果</small></h2>' % (n, n, len(by)),
           '    <div class="how"><b>怎麼讀</b>按家族分組，多的在前；每列是中文名（縮寫）、英文名、一句話用途。<b>你要做的</b>用上面的搜尋或家族晶片縮小範圍；按一列進表單（PI-a 落地後）；有「示範」的那列可以先看課和結果頁長什麼樣。</div>']
    for f, items in sorted(by.items(), key=lambda x: (-len(x[1]), x[0])):
        lab = fams["families"][f]
        out.append(f'    <section class="famgroup" data-fam="{f}">')
        out.append(f'    <h3 class="fam" id="fam-{f}">{_esc(lab["name_zh"])} <span class="k">{_esc(lab["name_en"])}</span><small>{len(items)} 個</small></h3>')
        out.append(f'    <p class="sub mt0">{_esc(lab["blurb_zh"])}</p>')
        for mid, m in sorted(items, key=lambda x: x[1].get("name_zh", "")):
            q = _esc(" ".join(str(x) for x in [m.get("name_zh"), m.get("name_en"), m.get("abbr"), mid, m.get("blurb_zh")] if x).lower())
            a = m.get("abbr") or ""
            abbr = f' <small>{_esc(a)}</small>' if a and a not in (m.get("name_zh") or "") and a != (m.get("name_en") or "") else ""   # no "SCAMPER SCAMPER SCAMPER"
            out.append(f'    <div class="tool" data-fam="{f}" data-q="{q}"><b>{_esc(m.get("name_zh") or mid)}{abbr}</b><span class="k">{_esc(m.get("name_en") or "")}</span><div class="sub">{_esc(m.get("blurb_zh") or "")}</div>')
            demo = DEMOS.get(mid)
            if demo:
                out.append(f'      <div class="btns mt6"><a class="btn" href="https://claude.ai/artifact/{art[demo[0]]}">示範：5 分鐘課 →</a><a class="btn ghost" href="https://claude.ai/artifact/{art[demo[1]]}">示範：結果頁 →</a></div>')
            out.append('    </div>')
        out.append('    </section>')
    return "\n".join(out) + "\n"


def _catalog_partials(_cache={}):
    if "v" in _cache: return _cache["v"]                     # the three lambdas below share one parse per process
    cat = load_catalog()
    _cache["v"] = {"catalog-families": render_families(cat), "catalog-workflows": render_workflows(cat), "catalog-methods": render_methods(cat)}
    return _cache["v"]


# partials rendered from data; the gate checks file == render (sync regenerates them first)
GENERATED = {"domain-chips": lambda: render_chips(load_domains()),
             "catalog-families": lambda: _catalog_partials()["catalog-families"],
             "catalog-workflows": lambda: _catalog_partials()["catalog-workflows"],
             "catalog-methods": lambda: _catalog_partials()["catalog-methods"]}
REQUIRED_PARTIALS["home-mock.html"] = {"catalog-families", "catalog-workflows", "catalog-methods", "home-catalog-script"}
