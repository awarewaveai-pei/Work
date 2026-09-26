"""The display catalog every page lists tools and workflows from: the SPEC registries (method display metadata, family
labels, plain-language goals, recipe display metadata) checked against the ACTIVE contracts and recipes, plus the glyph and
picture markup drawn beside them. One loader for the API (GET /catalog, the web app) and the mock tooling
(docs/mockups/mockkit.py); ValueError on any gap so a half-labelled page is never rendered."""

import collections
import re
from pathlib import Path

from ai_lego import resolve_spec_root
from ai_lego.platform.ai_execution.contract_catalog import is_active
from ai_lego.platform.ai_execution.method_resolver import MethodCatalog


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


def registry_paths(spec_root=None):
    """The registry files the catalog reads. An explicit root is used as given (the mock tooling points at a copy that
    holds only methods/ and recipes/; a missing file then fails in the loader with its own name); without one,
    ai_lego.resolve_spec_root (AI_LEGO_SPEC_ROOT > repo default, fail-closed)."""
    spec = Path(spec_root) if spec_root else resolve_spec_root()
    return {
        "METHODS_FILE": spec / "methods/registry/method-display-metadata.yaml",       # 285 methods: name_zh / name_en / abbr / blurb_zh / url
        "FAMILIES_FILE": spec / "methods/registry/method-family-display.yaml",        # family labels (the `<family>.` prefix of a method id)
        "GOALS_FILE": spec / "methods/registry/method-goal-groups.yaml",              # plain-language goals: families, featured, popular, prompts
        "RECIPES_DIR": spec / "recipes/validated",                                     # the workflows GET /recipes lists (ACTIVE *.recipe.yaml)
        "RECIPE_DISPLAY_FILE": spec / "recipes/registry/recipe-display-metadata.yaml",  # zh name / blurb / goal / audience per recipe
        "CONTRACTS_DIR": spec / "methods/contracts",                                   # the ACTIVE contracts GET /methods lists; display ids must equal them
    }

Catalog = collections.namedtuple("Catalog", "methods families recipes goals nexts")


def load_catalog(spec_root=None):
    """-> Catalog(methods, families, recipes, goals, nexts) from the SPEC registries, fully validated (nexts = each
    ACTIVE contract's recommended_next; an id that is not an ACTIVE tool is a tool the Atlas names but nobody has built
    yet, shown as such, never linked). ValueError on any gap — a
    method or family without its labels, a display list that differs from the ACTIVE contracts GET /methods serves, an
    ACTIVE recipe without display data or with a step whose method id is unknown, a family that belongs to no goal or
    to two, a featured/popular tool that does not exist or sits in another goal, a popular tool without a known
    picture — so the gate reports it instead of rendering a half-labelled page."""
    p = registry_paths(spec_root)
    METHODS_FILE, FAMILIES_FILE, GOALS_FILE = p["METHODS_FILE"], p["FAMILIES_FILE"], p["GOALS_FILE"]
    RECIPES_DIR, RECIPE_DISPLAY_FILE, CONTRACTS_DIR = p["RECIPES_DIR"], p["RECIPE_DISPLAY_FILE"], p["CONTRACTS_DIR"]
    dm = _yaml(METHODS_FILE)
    methods = dm.get("entries") if isinstance(dm, dict) else None
    if not isinstance(methods, dict) or not methods: raise ValueError(f"{METHODS_FILE.name}: entries missing or empty")
    for mid, m in methods.items():
        if not isinstance(mid, str) or not re.fullmatch(r"[a-z_]+\.[a-z_]+", mid):   # SPEC/specs/cognitive/method.schema.yaml:153; ids go into href/id
            raise ValueError(f"{METHODS_FILE.name}: method id {mid!r} is not <family>.<name> (lower-case letters and _)")
        if not isinstance(m, dict) or not all(_text(m.get(k)) for k in ("name_zh", "name_en", "blurb_zh")):
            raise ValueError(f"{METHODS_FILE.name}: {mid} needs non-empty name_zh, name_en, blurb_zh")
        if m.get("abbr") is not None and not isinstance(m["abbr"], str): raise ValueError(f"{METHODS_FILE.name}: {mid} abbr must be text")
    # A tool = what GET /methods serves: MethodCatalog's own definition (an ACTIVE contract that is not an Atlas lens,
    # method_resolver.py from_spec_root). A display entry for an ACTIVE lens (type: perspective) is kept in the
    # registry but is not a tool; any other display id without a served method is a gap.
    served = {mid for mid, entry in MethodCatalog.from_spec_root(CONTRACTS_DIR.parents[1]).contracts.items() if is_active(entry)}
    active, lenses, nexts = set(), set(), {}
    for p in CONTRACTS_DIR.glob("*.contract.yaml"):
        c = _yaml(p)
        if not isinstance(c, dict) or c.get("status") != "ACTIVE": continue
        mid = c.get("method_id") or c.get("id")
        if mid not in served:
            lenses.add(mid); continue
        active.add(mid)
        rn = c.get("recommended_next") or []
        if not isinstance(rn, list) or not all(isinstance(x, str) and re.fullmatch(r"[a-z_]+\.[a-z_]+", x) for x in rn):
            raise ValueError(f"{p.name}: recommended_next must be a list of <family>.<name> ids")
        nexts[mid] = rn
    methods = {mid: m for mid, m in methods.items() if mid not in lenses}
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
    return Catalog(methods, fams, recipes, g, nexts)


def counts(cat):
    """The numbers the hand-written hero sentence states: tools, user workflows, internal workflows (the gate pins them)."""
    return len(cat.methods), sum(r["audience"] == "user" for r in cat.recipes), sum(r["audience"] == "internal" for r in cat.recipes)


def goal_of(goals, mid):
    """The goal a method belongs to (through its family)."""
    fam = mid.split(".")[0]
    return next(x for x in goals["goals"] if fam in x["families"])


def catalog_payload(cat):
    """The catalog as JSON for GET /catalog: everything the home page, the tool directory and the workflow list show,
    with the glyph and picture markup they draw (both live only here)."""
    tools, users, internals = counts(cat)
    return {
        "counts": {"tools": tools, "user_workflows": users, "internal_workflows": internals},
        "methods": {mid: {**m, "family": mid.split(".")[0], "goal": goal_of(cat.goals, mid)["id"], "next": cat.nexts.get(mid, [])}
                    for mid, m in sorted(cat.methods.items())},
        "families": cat.families["families"],
        "goals": cat.goals["goals"],
        "popular": cat.goals["popular"],
        "prompts": cat.goals["prompts"],
        "recipes": cat.recipes,
        "glyphs": GLYPHS,
        "shapes": SHAPES,
    }
