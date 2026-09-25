#!/usr/bin/env python3
"""Shared helpers for the mock tooling (sync-design-system.py, check-mocks.py, build-artifact.py): the page list, the
one domain list (SPEC/methods/examples/domains.yaml), the chip row rendered from it, and the partial markers.
Logic lives here once; the scripts only call it. Not a CLI."""
import os, pathlib, re

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[4]                                   # COS/docs/mockups -> …/Projects/internal/COS -> repo root
SPEC = pathlib.Path(os.environ.get("AI_LEGO_SPEC_ROOT") or REPO / "agency-os/docs/AI_LEGO_Cognitive_Engineering_OS")   # same override as ai_lego (SPEC_ROOT_ENV)
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


def _yaml(path):
    """yaml.safe_load that rejects a duplicate key (PyYAML silently keeps the last one) and returns the document."""
    import yaml

    def mapping(loader, node, deep=False):
        # same constructor as SPEC tests/run_golden_tests.py _construct_mapping: explicit keys are checked, then
        # flatten_mapping expands `<<: *anchor` (an explicit key overriding a merged one is precedence, not a duplicate).
        # A plain function, not SafeLoader's deferred generator: a merge source must be checked before a later merge
        # flattens it in place, or its own override reads as a duplicate.
        seen = set()
        for k, _ in node.value:
            if k.tag == "tag:yaml.org,2002:merge": continue
            key = loader.construct_object(k, deep=deep)
            try: dup = key in seen
            except TypeError: raise ValueError(f"{path.name}: unhashable key at line {k.start_mark.line + 1}") from None
            if dup: raise ValueError(f"{path.name}: duplicate key {key!r} at line {k.start_mark.line + 1}")
            seen.add(key)
        loader.flatten_mapping(node)
        return {loader.construct_object(k, deep=deep): loader.construct_object(v, deep=deep) for k, v in node.value}

    class Strict(yaml.SafeLoader): pass
    Strict.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, mapping)
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
GOALS_FILE = SPEC / "methods/registry/method-goal-groups.yaml"              # plain-language goals: families, featured, popular, prompts
RECIPES_DIR = SPEC / "recipes/validated"                                     # the workflows GET /recipes lists (ACTIVE *.recipe.yaml)
RECIPE_DISPLAY_FILE = SPEC / "recipes/registry/recipe-display-metadata.yaml"  # zh name / blurb / goal / audience per recipe
CONTRACTS_DIR = SPEC / "methods/contracts"                                   # the ACTIVE contracts GET /methods lists; display ids must equal them
# the only method and the only workflow that have a published lesson + result demo today (mock pages)
DEMOS = {"systems.iceberg_model": ("iceberg-lesson-mock.html", "iceberg-result-mock.html"),
         "life-decision-v1": ("workflow-lesson-mock.html", "workflow-result-mock.html")}
# 24x24 line glyphs, one per goal (stroke = accent via .glyph in design-system.css; no colour literal here)
GLYPHS = {
    "layers": '<path d="M12 3 4 8l8 5 8-5-8-5z"/><path d="M4 12l8 5 8-5"/><path d="M4 16l8 5 8-5"/>',
    "scale": '<path d="M12 4v15M7 19h10M6 5h12"/><path d="M3 11l3-6 3 6a3 3 0 0 1-6 0z"/><path d="M15 11l3-6 3 6a3 3 0 0 1-6 0z"/>',
    "target": '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
    "spark": '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>',
    "compass": '<circle cx="12" cy="12" r="9"/><path d="M15 9l-2 6-4 2 2-6z"/>',
    "coins": '<ellipse cx="12" cy="7" rx="7" ry="3"/><path d="M5 7v10c0 1.7 3.1 3 7 3s7-1.3 7-3V7"/><path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>',
    "shield": '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    "person": '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
    "circle": '<circle cx="12" cy="12" r="3"/><circle cx="5" cy="9" r="2"/><circle cx="19" cy="9" r="2"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    "roadmap": '<path d="M4 18c4 0 4-12 8-12s4 12 8 12"/><circle cx="4" cy="18" r="1.5"/><circle cx="12" cy="6" r="1.5"/><circle cx="20" cy="18" r="1.5"/>',
    "gear": '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/>',
    "book": '<path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z"/><path d="M20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z"/>',
    # main-menu icons (NAV)
    "home": '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    "grid": '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    "flow": '<circle cx="5" cy="12" r="2.5"/><circle cx="19" cy="6" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="M7.5 12h4M11.5 12c3 0 3-6 5-6M11.5 12c3 0 3 6 5 6"/>',
    "folder": '<path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>',
}
# 64x40 pictures of a tool's own shape (untools draws each tool; .shape in design-system.css strokes with the accent
# and fills class "f" with the tag tint — no colour literal here). Key = `shape:` of a popular entry in the goals file.
SHAPES = {
    "iceberg": '<path d="M2 14H62"/><path class="f" d="M24 14 32 3l8 11 10 12-9 11H23l-9-11z"/><path d="M17 22h30M19 30h26"/>',
    "grid2x2": '<rect class="f" x="10" y="3" width="21" height="16" rx="2"/><rect x="33" y="3" width="21" height="16" rx="2"/><rect x="10" y="21" width="21" height="16" rx="2"/><rect x="33" y="21" width="21" height="16" rx="2"/>',
    "matrix": '<rect class="f" x="34" y="4" width="12" height="32"/><rect x="6" y="4" width="52" height="32" rx="2"/><path d="M22 4v32M34 4v32M46 4v32M6 12h52M6 20h52M6 28h52"/>',
    "gap": '<rect x="3" y="12" width="18" height="16" rx="3"/><rect class="f" x="43" y="12" width="18" height="16" rx="3"/><path d="M24 20h15M35 16l4 4-4 4"/><path d="M24 34h15"/>',
    "chain": '<circle cx="8" cy="6" r="3.5"/><circle cx="20" cy="13" r="3.5"/><circle cx="32" cy="20" r="3.5"/><circle cx="44" cy="27" r="3.5"/><circle class="f" cx="56" cy="34" r="3.5"/><path d="M11 7.8l6 3.4M23 14.8l6 3.4M35 21.8l6 3.4M47 28.8l6 3.4"/>',
    "radial": '<path d="M25 17 10 7M25 23 10 33M39 17l15-10M39 23l15 10"/><ellipse class="f" cx="32" cy="20" rx="8" ry="5"/><circle cx="8" cy="6" r="2.5"/><circle cx="8" cy="34" r="2.5"/><circle cx="56" cy="6" r="2.5"/><circle cx="56" cy="34" r="2.5"/>',
    "premortem": '<path d="M4 30h42M42 26l4 4-4 4"/><path d="M52 25l8 8M60 25l-8 8"/><path d="M56 20C48 4 16 4 8 18M8 18l-2-5M8 18l5-2"/>',
    "quadrant": '<rect x="6" y="3" width="52" height="34" rx="3"/><path d="M32 3v34M6 20h52"/><circle class="f" cx="32" cy="20" r="7"/>',
}


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


def load_catalog():
    """-> (methods, families, recipes, goals) from the SPEC registries, fully validated. ValueError on any gap — a
    method or family without its labels, a display list that differs from the ACTIVE contracts GET /methods serves, an
    ACTIVE recipe without display data or with a step whose method id is unknown, a family that belongs to no goal or
    to two, a featured/popular tool that does not exist or sits in another goal, a popular tool without a known
    picture — so the gate reports it instead of rendering a half-labelled page."""
    dm = _yaml(METHODS_FILE)
    methods = dm.get("entries") if isinstance(dm, dict) else None
    if not isinstance(methods, dict) or not methods: raise ValueError(f"{METHODS_FILE.name}: entries missing or empty")
    for mid, m in methods.items():
        if not isinstance(mid, str) or not re.fullmatch(r"[a-z_]+\.[a-z_]+", mid):   # SPEC/specs/cognitive/method.schema.yaml:153; ids go into href/id
            raise ValueError(f"{METHODS_FILE.name}: method id {mid!r} is not <family>.<name> (lower-case letters and _)")
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
    all_fams = {m.split(".")[0] for m in methods}
    missing = sorted(all_fams - set(fams["families"]))
    if missing: raise ValueError(f"{FAMILIES_FILE.name}: no label for families {missing}")
    g = _yaml(GOALS_FILE)
    if not isinstance(g, dict) or g.get("version") != 1 or not isinstance(g.get("goals"), list) or not g["goals"] \
            or not isinstance(g.get("popular"), list) or not isinstance(g.get("prompts"), list):
        raise ValueError(f"{GOALS_FILE.name}: expected version: 1, goals, popular, prompts")
    seen, ids = {}, []
    for x in g["goals"]:
        if not isinstance(x, dict) or set(x) != {"id", "title_zh", "short_zh", "blurb_zh", "icon", "families", "featured"}:
            raise ValueError(f"{GOALS_FILE.name}: a goal needs exactly id, title_zh, short_zh, blurb_zh, icon, families, featured")
        if not re.fullmatch(r"[a-z][a-z0-9_]*", str(x["id"])) or x["id"] in ids: raise ValueError(f"{GOALS_FILE.name}: bad or duplicate goal id {x['id']!r}")
        ids.append(x["id"])
        if not all(_text(x[k]) for k in ("title_zh", "short_zh", "blurb_zh")): raise ValueError(f"{GOALS_FILE.name}: goal {x['id']} has an empty label")
        if x["icon"] not in GLYPHS: raise ValueError(f"{GOALS_FILE.name}: goal {x['id']} icon {x['icon']!r} is not a known glyph")
        if not isinstance(x["families"], list) or not x["families"]: raise ValueError(f"{GOALS_FILE.name}: goal {x['id']} needs families")
        for f in x["families"]:
            if f not in all_fams: raise ValueError(f"{GOALS_FILE.name}: goal {x['id']} names unknown family {f!r}")
            if f in seen: raise ValueError(f"{GOALS_FILE.name}: family {f} is in goals {seen[f]} and {x['id']}")
            seen[f] = x["id"]
        if not isinstance(x["featured"], list) or len(x["featured"]) != 3 or len(set(x["featured"])) != 3: raise ValueError(f"{GOALS_FILE.name}: goal {x['id']} needs exactly three distinct featured tools")
        for mid in x["featured"]:
            if mid not in methods: raise ValueError(f"{GOALS_FILE.name}: goal {x['id']} features unknown method {mid!r}")
            if mid.split(".")[0] not in x["families"]: raise ValueError(f"{GOALS_FILE.name}: {mid} is featured under goal {x['id']} but its family is elsewhere")
    orphan = sorted(all_fams - set(seen))
    if orphan: raise ValueError(f"{GOALS_FILE.name}: families in no goal: {orphan}")
    pop_ids = []
    for x in g["popular"]:
        if not isinstance(x, dict) or set(x) != {"id", "shape", "line_zh"} or x.get("id") not in methods or x.get("shape") not in SHAPES or not _text(x.get("line_zh")):
            raise ValueError(f"{GOALS_FILE.name}: every popular entry needs exactly an existing id, a known shape and a line_zh ({x!r})")
        pop_ids.append(x["id"])
    if not pop_ids or len(set(pop_ids)) != len(pop_ids): raise ValueError(f"{GOALS_FILE.name}: popular must be a non-empty list of distinct tools")
    if len(g["prompts"]) < 3 or not all(_text(p) for p in g["prompts"]): raise ValueError(f"{GOALS_FILE.name}: at least three non-empty prompts")
    rd = _yaml(RECIPE_DISPLAY_FILE)
    if not isinstance(rd, dict) or rd.get("version") != 1 or not isinstance(rd.get("entries"), dict): raise ValueError(f"{RECIPE_DISPLAY_FILE.name}: expected version: 1 and entries")
    recipes = []
    for p in sorted(RECIPES_DIR.glob("*.recipe.yaml")):
        r = _yaml(p)
        if not isinstance(r, dict) or r.get("status") != "ACTIVE": continue     # same filter as GET /recipes
        rid = r.get("id")
        if not _text(rid) or not re.fullmatch(r"[a-z0-9][a-z0-9-]*", rid) or not _text(r.get("name") or r.get("title")) or not isinstance(r.get("steps"), list) or not r["steps"]:
            raise ValueError(f"{p.name}: an ACTIVE recipe needs a lower-case id, name/title and a non-empty steps list")
        d = rd["entries"].get(rid)
        if not isinstance(d, dict) or set(d) != {"audience", "goal", "name_zh", "blurb_zh"} or not all(_text(v) for v in d.values()):
            raise ValueError(f"{RECIPE_DISPLAY_FILE.name}: {rid} needs exactly audience, goal, name_zh, blurb_zh, all non-empty")
        if d["audience"] not in ("user", "internal"): raise ValueError(f"{RECIPE_DISPLAY_FILE.name}: {rid} audience must be user or internal")
        if d["goal"] not in ids: raise ValueError(f"{RECIPE_DISPLAY_FILE.name}: {rid} goal {d['goal']!r} is not in {GOALS_FILE.name}")
        steps = []
        for st in r["steps"]:
            if not isinstance(st, dict): raise ValueError(f"{p.name}: a step is not a mapping")
            if st.get("type") == "method" or st.get("method_id"):
                if st.get("method_id") not in methods: raise ValueError(f"{p.name}: step {st.get('label')!r} uses unknown method {st.get('method_id')!r}")
                steps.append(st["method_id"])
            else:
                steps.append("capability")
        recipes.append({"id": rid, "name": r.get("name") or r.get("title"), "steps": steps, **d})
    if not any(r["audience"] == "user" for r in recipes): raise ValueError(f"{RECIPES_DIR}: no ACTIVE user-facing recipe")
    return methods, fams, recipes, g


def counts(cat):
    """The numbers the hand-written hero sentence states: tools, user workflows, internal workflows (the gate pins them)."""
    methods, _, recipes, _ = cat
    return len(methods), sum(r["audience"] == "user" for r in recipes), sum(r["audience"] == "internal" for r in recipes)


def _goal_of(goals, mid):
    fam = mid.split(".")[0]
    return next(x for x in goals["goals"] if fam in x["families"])


def _tool_buttons(mid, cls="btns"):
    demo = DEMOS.get(mid)
    if demo:
        return (f'<div class="{cls}"><span class="btn primary">開始</span><a class="btn" href="https://claude.ai/artifact/{ARTIFACT[demo[0]]}">第一次用？先上 5 分鐘的課 →</a>'
                f'<a class="btn ghost" href="https://claude.ai/artifact/{ARTIFACT[demo[1]]}">看做完的結果頁 →</a></div>')
    return f'<div class="{cls}"><span class="btn primary">開始</span><a class="btn" href="#" title="這個工具的 5 分鐘課：P3 隨工具資料產出">第一次用？先上 5 分鐘的課 →</a></div>'


def render_prompts(cat):
    """Example situations under the 'say what you are stuck on' box; a click copies the text into the box."""
    goals = cat[3]
    out = ['    <div class="btns" id="prompts">']
    for p in goals["prompts"]:
        out.append(f'      <button class="btn ghost" type="button" data-prompt="{_esc(p)}">{_esc(p)}</button>')
    out.append('    </div>')
    return "\n".join(out) + "\n"


def render_goals(cat):
    """'Find by what you want to do': one card per goal — question, one line, counts, three common tools, see all."""
    methods, _, recipes, goals = cat
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
        out.append('        <div><span class="k">常用：</span>' + '、'.join(f'<a href="#m-{mid}" title="{_esc(methods[mid]["blurb_zh"])}">{_esc(methods[mid]["name_zh"])}</a>' for mid in gl["featured"]) + '</div>')
        out.append(f'        <div class="btns"><a class="btn" href="#dir-{gl["id"]}">看全部 {len(mids)} 個 →</a></div>')
        out.append('      </div>')
    out.append('    </div>')
    return "\n".join(out) + "\n"


def render_featured(cat):
    """'Start here': the popular tools — a picture of the tool's shape, name, goal tag, one plain line, the actions."""
    methods, _, _, goals = cat
    out = ['    <h2>先從這幾個開始<small>%d 個最常見的起點（人工挑選；有使用資料後改成大家最常用的）</small></h2>' % len(goals["popular"]),
           '    <div class="how"><b>怎麼讀</b>每張卡一個工具：小圖是它長的樣子，一句話是它幫你做什麼，標籤是它屬於哪一件你想做的事。<b>你要做的</b>看到像你的情況就按「開始」；第一次用先看它的短課（可跳）。</div>',
           '    <div class="mcards">']
    for x in goals["popular"]:
        mid = x["id"]; m = methods[mid]; gl = _goal_of(goals, mid)
        out.append(f'      <div class="mcard pop" id="pop-{mid}">')
        out.append(f'        <div class="gh">{picture(x["shape"], m["name_zh"] + "的樣子")}<div><b>{_esc(m["name_zh"])}</b><span class="tag">{_esc(gl["short_zh"])}</span><div class="k">{_esc(m["name_en"])}</div></div></div>')
        out.append(f'        <div>{_esc(x["line_zh"])}</div>')
        out.append('        ' + _tool_buttons(mid))
        out.append('      </div>')
    out.append('    </div>')
    return "\n".join(out) + "\n"


def _stations(methods, steps):
    """Method names in order; a run of capability steps collapses to one chip with a count (db-migration has 15)."""
    out, run = [], 0
    for s in steps + [None]:
        if s == "capability": run += 1; continue
        if run: out.append("能力步" if run == 1 else f"能力步 ×{run}"); run = 0
        if s is not None: out.append(_esc(methods[s]["name_zh"]))
    return out


def _wf_card(methods, goals, r):
    gl = next(x for x in goals["goals"] if x["id"] == r["goal"])
    demo = DEMOS.get(r["id"])
    q = _esc(" ".join([r["name_zh"], r["name"], r["id"], r["blurb_zh"]] + [methods[s]["name_zh"] for s in r["steps"] if s in methods]).lower())
    out = [f'      <div class="mcard wf" id="wf-{r["id"]}" data-q="{q}">',
           f'        <div class="gh">{glyph(gl["icon"], gl["short_zh"])}<b>{_esc(r["name_zh"])}</b><span class="tag">{len(r["steps"])} 站</span></div>',
           f'        <div class="k">{_esc(r["name"])}</div>',
           '        <div class="journey">' + '<i>→</i>'.join(f'<span>{s}</span>' for s in _stations(methods, r["steps"])) + '</div>',
           f'        <div>{_esc(r["blurb_zh"])}</div>']
    if demo:
        out.append(f'        <div class="btns"><span class="btn primary">開始</span><a class="btn" href="https://claude.ai/artifact/{ARTIFACT[demo[0]]}">第一次走？先上 3 分鐘的課 →</a><a class="btn ghost" href="https://claude.ai/artifact/{ARTIFACT[demo[1]]}">看走到一半的示範 →</a></div>')
    else:
        out.append('        <div class="btns"><span class="btn primary">開始</span><a class="btn" href="#" title="這條工作流的 3 分鐘課：P3 隨工作流資料產出">第一次走？先上 3 分鐘的課 →</a></div>')
    out.append('      </div>')
    return out


def render_workflows(cat):
    """User workflows grouped by goal; the platform-internal ones (governance, fixtures) folded at the end."""
    methods, _, recipes, goals = cat
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
    """All tools, folded by goal (every method once: name (abbr) · en · one line), with the name search on top."""
    methods, _, _, goals = cat
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
            out.append(f'    <div class="tool" id="m-{mid}" data-q="{q}"><b>{_esc(m["name_zh"])}{abbr}</b><span class="k">{_esc(m["name_en"])}</span><div class="sub">{_esc(m["blurb_zh"])}</div>')
            if mid in DEMOS: out.append('      ' + _tool_buttons(mid, "btns mt6"))
            out.append('    </div>')
        out.append('    </details>')
    return "\n".join(out) + "\n"


CATALOG_PARTIALS = {"catalog-prompts": render_prompts, "catalog-goals": render_goals, "catalog-featured": render_featured,
                    "catalog-workflows": render_workflows, "catalog-directory": render_directory}


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


PER_PAGE = {"app-nav": render_nav}   # partials rendered per page (sync writes them, the gate compares); no file in partials/
for _f in FILES: REQUIRED_PARTIALS.setdefault(_f, set()).add("app-nav")
