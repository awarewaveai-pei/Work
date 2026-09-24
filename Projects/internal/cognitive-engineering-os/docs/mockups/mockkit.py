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
FRAG = re.compile(r"^[ \t]*<!-- == partial: ([a-z0-9-]+): start[^\n]*-->\n(.*?)\n[ \t]*<!-- == partial: \1: end == -->", re.S | re.M)


def partial_start(name):
    return f"<!-- == partial: {name}: start (verbatim from partials/{name}.html via sync-design-system.py; check-mocks.py enforces) == -->"


def partial_end(name):
    return f"<!-- == partial: {name}: end == -->"


def fragments(html):
    """-> {name: body} for every marked fragment in a page; a name marked twice raises ValueError."""
    out = {}
    for m in FRAG.finditer(html):
        if m.group(1) in out: raise ValueError(f"partial {m.group(1)} marked twice")
        out[m.group(1)] = m.group(2)
    return out


def load_domains(path=DOMAINS_FILE):
    """Parse and validate the domain list; ValueError on a malformed file (the gate reports it, never a traceback)."""
    import yaml
    d = yaml.safe_load(path.read_text(encoding="utf-8"))
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


GENERATED = {"domain-chips": lambda: render_chips(load_domains())}   # partials rendered from data; the gate checks file == render
