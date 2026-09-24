#!/usr/bin/env python3
"""Cross-page parity gate for the Cognitive OS mockups (plan I11: mocks = spec; U19 palette; U20 layout; U15 lesson entry).
Run:  python Projects/internal/cognitive-engineering-os/docs/mockups/check-mocks.py [--dir <folder>]
Exit 0 = the four pages obey the same design rules. Exit 1 = one line per finding (never a traceback: a page that
cannot be parsed is itself a finding). Self-test with mutations: check-mocks-selftest.py (must stay green).
build-artifact.py runs this first and refuses to build when it is red."""
import html.parser, pathlib, re, sys, unicodedata

RESULT = ["iceberg-result-mock.html", "workflow-result-mock.html"]
LESSON = ["iceberg-lesson-mock.html", "workflow-lesson-mock.html"]
FILES = RESULT + LESSON
# every page links to its partner page (published artifact ids; the product replaces them with routes)
PARTNER = {
    "iceberg-result-mock.html": "653Kt4JtExaujnffNDvygY",   # -> method lesson
    "iceberg-lesson-mock.html": "7JLjM7mGyqTMLJmCMUmWqq",   # -> result page
    "workflow-result-mock.html": "TP18Q3Xif2BphmAfbxxrKU",  # -> workflow lesson
    "workflow-lesson-mock.html": "7xEwPu9Cp2rWf3P8g9X1Pk",  # -> workflow overview
}
SHARED_START = "/* == shared design system: start"
SHARED_END = "/* == shared design system: end == */"
PAGE_MARK = "/* == page-specific == */"
# U19: HCI palette (hci30/app/public/index.html:15-19) + the custom dark set
HCI_LIGHT = {"--bg": "#f6f2e9", "--card": "#fffdf8", "--ink": "#232019", "--muted": "#7a7261", "--line": "#e3dbc8",
             "--accent": "#0e5b50", "--ok": "#1f6b47", "--warn": "#a3611c", "--bad": "#a13328", "--tag": "#e2eeea", "--soft": "#f3efe4"}
HCI_DARK = {"--bg": "#1c2b27", "--card": "#243530", "--ink": "#f3efe4", "--muted": "#a9beb6", "--line": "#3a4b45",
            "--accent": "#8fc7b0", "--tag": "#22403a", "--soft": "#2a3b36"}
FONT = 'font:15px/1.65 system-ui,-apple-system,"Segoe UI","PingFang TC","Microsoft JhengHei","Noto Sans TC",sans-serif'
# U20: one column by default; only "several methods side by side" may go 2-up, and only by container width
CAPPED_2COL = "repeat(auto-fit,minmax(max(260px,calc(50% - 5px)),1fr))"
TWO_COL_ALLOWED = {".mcards"}                                  # method / station cards, the only 2-up grid
LABEL_ROWS = {".row", ".step", ".mistake"}                     # "label + content" two-cell rows, not card grids
HEX_ALLOW = {}                                                 # no colour literal outside the token blocks, anywhere
DESIGN_SYSTEM = "design-system.css"                            # the one stylesheet; the mocks carry it verbatim
# D18: five example sets; the workflow lesson has no "decision" chip because the whole route is one decision
CHIP_SETS = {"iceberg-lesson-mock.html": {"edd", "partner", "decision", "ecom", "daily"},
             "workflow-lesson-mock.html": {"edd", "partner", "ecom", "daily"}}
# the chips drive the whole lesson (operator 2026-09-24): at least this many example groups per lesson page
# method lesson: 4 layers + worked example + its button note + 4 good/bad rows + mistake example + self-check + demo button = 13
# workflow lesson: 3 stations + walked example + its button note + good/bad + demo button = 7
MIN_EX_GROUPS = {"iceberg-lesson-mock.html": 13, "workflow-lesson-mock.html": 7}
# continuity (matched on the visible text of the page, NFKC-normalised, style/script/attributes excluded)
# PAIR_FACTS: regexes that must match on BOTH pages of a pair — the story is told once, on both sides.
PAIR_FACTS = {
    ("iceberg-result-mock.html", "iceberg-lesson-mock.html"): [
        r"8 (?:人|位參與者)只有 2 (?:人|位)", r"第 1 次是 6 (?:人|位)", r"第 4 次", r"說明佔 35 分", r"參與者需要專家幫他們看見意義", r"達到洞察", r"帶領者先(?:講|解讀)",
    ],
    ("workflow-result-mock.html", "workflow-lesson-mock.html"): [
        r"問題陳述[^。]{0,10}→[^。]{0,10}SWOT[^。]{0,10}→[^。]{0,10}加權決策矩陣", r"線上\+實體", r"主動分享(?:人數)?不降", r"遠地(?:參加者)?至少 3 人",
        r"帶領者(?:負擔|每週準備時間)不(?:增|超過)", r"S/W/O/T 各至少 2 條", r"每個準則的權重",
        r"第 1 站[\s\S]{0,900}?2 分鐘", r"第 2 站[\s\S]{0,1400}?3 分鐘", r"第 3 站[\s\S]{0,1400}?3 分鐘",
    ],
}
# PAGE_FACTS: regexes that must match on one page.
PAGE_FACTS = {
    "iceberg-result-mock.html": [r"6 人掉到 2 人", r"主動分享 6 → 2 人", r"8 人團體", r"現在 2 人"],
    # the four plain-language layer lines the operator approved on 2026-09-24 stay on the lesson iceberg
    "iceberg-lesson-mock.html": [r"主動分享 6 → 2 人", r"同一個案例", r"看得見:發生了什麼", r"看不見:", r"一直重複的模式", r"製造模式的制度", r"撐住制度的信念"],
    "workflow-result-mock.html": [r"自動填第 1 格", r"你填了 2 格"],
    "workflow-lesson-mock.html": [r"三個格子"],
}
# NUMBER_PINS: every occurrence of the pattern on the listed pages must carry exactly these numbers (drift in one copy fails).
NUMBER_PINS = [
    (("iceberg-result-mock.html", "iceberg-lesson-mock.html"), r"第 1 次是 (\d+)", ("6",)),
    (("iceberg-result-mock.html", "iceberg-lesson-mock.html"), r"(\d+) (?:人|位參與者)只有 (\d+) (?:人|位)", ("8", "2")),
    (("iceberg-result-mock.html", "iceberg-lesson-mock.html"), r"說明佔 (\d+) 分", ("35",)),
    (("iceberg-result-mock.html",), r"主動分享 (\d+) → (\d+) 人", ("6", "2")),
    (("iceberg-result-mock.html",), r"現在 (\d+) 人", ("2",)),
    (("workflow-result-mock.html", "workflow-lesson-mock.html"), r"遠地(?:參加者)?至少 (\d+) 人", ("3",)),
    # a list pins the whole ordered sequence of occurrences: station 1 = 2 min, stations 2 and 3 = 3 min, NT$1 each
    (("workflow-result-mock.html",), r"(?:用了|約) (\d+) 分鐘・(?:約 )?NT\$(\d+)", [("2", "1"), ("3", "1"), ("3", "1")]),
    (("workflow-lesson-mock.html",), r"(\d+) 分鐘・NT\$(\d+)", [("2", "1"), ("3", "1"), ("3", "1")]),
]
# FORBID: the other story and the superseded numbers must not creep back in (regexes).
FORBID = {
    "iceberg-result-mock.html": [r"[57]\s*→\s*2", r"上一?期同一次", r"上期對照"],
    "iceberg-lesson-mock.html": [r"[57]\s*→\s*2", r"上一?期同一次", r"再檢視", r"創作本身就是療癒", r"回頭講"],
    "workflow-result-mock.html": [r"自動填 2 欄", r"你填了 3 欄"] + [
        r"加權決策矩陣[^→。]{0,6}→[^→。]{0,12}SWOT", r"SWOT[^→。]{0,6}→[^→。]{0,12}問題陳述", r"加權決策矩陣[^→。]{0,6}→[^→。]{0,12}問題陳述"],
    "workflow-lesson-mock.html": [
        r"加權決策矩陣[^→。]{0,6}→[^→。]{0,12}SWOT", r"SWOT[^→。]{0,6}→[^→。]{0,12}問題陳述", r"加權決策矩陣[^→。]{0,6}→[^→。]{0,12}問題陳述"],
}
# one drawing on both iceberg pages: the polygon and the gradient must be byte-identical (raw HTML)
ICEBERG_SHAPE = [
    '<path d="M550,150 L585,40 L620,85 L645,55 L690,150 L810,290 L780,420 L690,540 L560,540 L460,420 L420,290 Z" fill="url(#ice)"',
    '<stop offset="0" stop-color="#fbe3d6"/><stop offset="0.2" stop-color="#cfe3f3"/><stop offset="0.5" stop-color="#5a93c4"/><stop offset="0.75" stop-color="#245b8a"/><stop offset="1" stop-color="#0b2a4a"/>',
    'aria-label="冰山模型四層圖"',
]
_known = set(FILES)
assert all(a in _known and b in _known for a, b in PAIR_FACTS) and set(PAGE_FACTS) <= _known and set(FORBID) <= _known \
    and all(set(pages) <= _known for pages, _, _ in NUMBER_PINS), "continuity tables name a page that is not checked"
COLOUR = re.compile(r"#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|(?<![\w-])(?:white|black|red|blue|green|gray|grey|orange|yellow)(?![\w-])")
MINW = re.compile(r"min-width\s*:\s*(\d+)px")
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}
LESSON_PHRASE = re.compile(r"(先看|先上|回頭看).{0,12}分鐘(的)?課")


# ---------------- CSS ----------------
class CssError(Exception):
    pass


def _block_end(css, i):
    """i at '{' -> index just past the matching '}' (quoted strings respected)."""
    depth, q, n = 0, None, len(css)
    while i < n:
        c = css[i]
        if q:
            if c == "\\": i += 1
            elif c == q: q = None
        elif c in "\"'": q = c
        elif c == "{": depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0: return i + 1
        i += 1
    raise CssError("unbalanced braces")


def parse_css(css, media=None):
    """-> [(media|None, selector-prelude, declarations)] in source order; nested @media/@supports/@container/@layer
    are flattened with their prelude as `media`; @keyframes/@font-face/@page blocks are skipped whole; anything
    that cannot be parsed raises CssError (the caller turns it into a finding)."""
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    rules, i, n = [], 0, len(css)
    while True:
        while i < n and css[i].isspace(): i += 1
        if i >= n: return rules
        j = i
        while j < n and css[j] not in "{;": j += 1
        if j >= n: raise CssError(f"unparsed CSS from offset {i}: {css[i:i + 40]!r}")
        prelude = " ".join(css[i:j].split())
        if css[j] == ";":
            i = j + 1; continue
        end = _block_end(css, j)
        inner = css[j + 1:end - 1]
        if prelude.startswith("@"):
            name = prelude.split("(")[0].split()[0].lower()
            if name in ("@media", "@supports", "@container", "@layer"):
                rules.extend(parse_css(inner, prelude if media is None else f"{media} && {prelude}"))
            elif name in ("@keyframes", "@-webkit-keyframes", "@font-face", "@page"):
                pass
            else:
                raise CssError(f"unknown at-rule {prelude!r}")
        else:
            rules.append((media, prelude, inner.strip()))
        i = end


def split_selectors(prelude):
    out, depth, cur = [], 0, []
    for c in prelude:
        if c in "([": depth += 1
        elif c in ")]": depth -= 1
        if c == "," and depth == 0:
            out.append("".join(cur).strip()); cur = []
        else:
            cur.append(c)
    out.append("".join(cur).strip())
    return [s for s in out if s]


def decls(body):
    """-> [(prop, value)] ; quotes and parentheses respected."""
    out, depth, q, cur = [], 0, None, []
    for c in body + ";":
        if q:
            cur.append(c)
            if c == q: q = None
            continue
        if c in "\"'": q = c; cur.append(c); continue
        if c == "(": depth += 1
        elif c == ")": depth -= 1
        if c == ";" and depth == 0:
            item = "".join(cur).strip(); cur = []
            if item:
                k, _, v = item.partition(":")
                out.append((k.strip(), v.strip()))
        else:
            cur.append(c)
    return out


# ---------------- HTML (tiny DOM) ----------------
class Node:
    __slots__ = ("tag", "attrs", "children", "parent", "line")

    def __init__(self, tag, attrs, parent, line):
        self.tag, self.attrs, self.children, self.parent, self.line = tag, attrs, [], parent, line

    def classes(self): return self.attrs.get("class", "").split()
    def elements(self): return [c for c in self.children if isinstance(c, Node)]
    def text(self): return "".join(c if isinstance(c, str) else c.text() for c in self.children)

    def walk(self):
        yield self
        for c in self.elements(): yield from c.walk()


class Dom(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("#root", {}, None, 0); self.cur = self.root; self.err = []; self.svg = 0

    def handle_starttag(self, tag, attrs):
        node = Node(tag, dict(attrs), self.cur, self.getpos()[0]); self.cur.children.append(node)
        if tag in VOID and self.svg == 0: return
        if tag == "svg": self.svg += 1
        self.cur = node

    def handle_startendtag(self, tag, attrs):
        node = Node(tag, dict(attrs), self.cur, self.getpos()[0]); self.cur.children.append(node)
        if self.svg == 0 and tag not in VOID:
            self.err.append(f"line {self.getpos()[0]}: <{tag}/> is not a void element; a browser ignores the slash")

    def handle_endtag(self, tag):
        if tag in VOID and self.svg == 0: return
        if self.cur.tag == tag:
            if tag == "svg": self.svg -= 1
            self.cur = self.cur.parent
        else:
            self.err.append(f"line {self.getpos()[0]}: </{tag}> closes <{self.cur.tag}> opened at line {self.cur.line}")

    def handle_data(self, d):
        self.cur.children.append(d)


def visible_text(html_src):
    """Text a reader sees: body text without <style>/<script>, attributes dropped, NFKC (＋ → +, ／ → /), spaces collapsed."""
    dom = Dom(); dom.feed(html_src); dom.close()
    out = []
    def walk(n):
        for c in n.children:
            if isinstance(c, str): out.append(c)
            elif c.tag not in ("style", "script", "title"): walk(c)
    walk(dom.root)
    return " ".join(unicodedata.normalize("NFKC", "".join(out)).split())


def in_svg(node):
    while node is not None:
        if node.tag == "svg": return True
        node = node.parent
    return False


# ---------------- checks ----------------
class Checker:
    def __init__(self, folder):
        self.folder = pathlib.Path(folder); self.findings = []; self.shared_blocks = {}; self.texts = {}; self.raw = {}

    def bad(self, f, rule, msg): self.findings.append(f"{f}: [{rule}] {msg}")

    def run(self):
        for f in FILES:
            try:
                self.check_file(f)
            except Exception as e:  # a page that cannot be checked is a finding, never a traceback
                self.bad(f, "parse", f"{type(e).__name__}: {e}")
        if len(set(self.shared_blocks.values())) > 1:
            self.bad("*", "shared", "shared design-system block differs between files (copy the block from the file you edited to the other three)")
        self.check_continuity()
        return self.findings

    def check_continuity(self):
        t = self.texts
        for (a, b), pats in PAIR_FACTS.items():
            for pat in pats:
                for f in (a, b):
                    if f in t and not re.search(pat, t[f]): self.bad(f, "continuity", f"fact shared with {b if f == a else a} not found: /{pat}/")
        for f, pats in PAGE_FACTS.items():
            for pat in pats:
                if f in t and not re.search(pat, t[f]): self.bad(f, "continuity", f"fact missing: /{pat}/")
        for pages, pat, want in NUMBER_PINS:
            for f in pages:
                got = [m.groups() for m in re.finditer(pat, t.get(f, ""))]
                if isinstance(want, list):
                    if got != want: self.bad(f, "continuity", f"sequence drifted for /{pat}/: {got} (pinned {want})")
                else:
                    for g in got:
                        if g != want: self.bad(f, "continuity", f"number drifted: {g} for /{pat}/ (pinned {want})")
        for f, pats in FORBID.items():
            for pat in pats:
                m = re.search(pat, t.get(f, ""))
                if m: self.bad(f, "continuity", f"superseded text present: {m.group(0)!r} (/{pat}/)")
        for f in ("iceberg-result-mock.html", "iceberg-lesson-mock.html"):
            for piece in ICEBERG_SHAPE:
                if f in self.raw and piece not in self.raw[f]: self.bad(f, "continuity", f"iceberg drawing differs from the shared shape: {piece[:48]}…")

    # -- css helpers
    def check_rule(self, f, where, media, prelude, body):
        sels = split_selectors(prelude)
        if any(s.startswith(":root") for s in sels):
            if where == "page": self.bad(f, "shared", f"page CSS must not define tokens ({prelude})")
            return
        for sel in sels:  # `.ex` marks "switches with the domain"; it must never carry looks (2026-09-24: a box style leaked into buttons)
            if sel == ".ex" or sel.startswith((".ex ", ".ex.", ".ex[", ".ex:", ".ex>")):
                self.bad(f, "D18", f"{prelude}: the .ex domain marker must not be styled directly; scope the rule to its container")
        ds = decls(body)
        for k, v in ds:
            if k.startswith("--") and where == "page": self.bad(f, "shared", f"page CSS defines token {k}")
            if COLOUR.search(v) and prelude not in HEX_ALLOW:
                self.bad(f, "U19", f"literal colour in {where} rule {prelude} ({k}:{v}); use a token")
            if k == "grid-template-columns":
                ok = v == "1fr" or (v == CAPPED_2COL and set(sels) <= TWO_COL_ALLOWED) \
                     or (re.fullmatch(r"\d+px 1fr", v) is not None and set(sels) <= LABEL_ROWS)
                if not ok: self.bad(f, "U20", f"{prelude} grid-template-columns:{v} (allowed: 1fr; capped 2-col only for {sorted(TWO_COL_ALLOWED)}; '<n>px 1fr' only for label rows)")
            if k == "min-width":
                m = MINW.match(f"min-width:{v}")
                if m and int(m.group(1)) > 360: self.bad(f, "responsive", f"{prelude} min-width {v} wider than a phone")

    def check_tokens(self, f, rules):
        light = [(m, p, b) for m, p, b in rules if m is None and p == ":root"]
        dark_media = [(m, p, b) for m, p, b in rules if m and "prefers-color-scheme: dark" in m and p == ':root:not([data-theme="light"])']
        dark_expl = [(m, p, b) for m, p, b in rules if m is None and p == ':root[data-theme="dark"]']
        themes = [(p, b) for m, p, b in rules if m is None and p.startswith(':root[data-theme="') and p != ':root[data-theme="dark"]']
        if len(light) != 1: self.bad(f, "theme", f"expected one light :root block in the shared css, found {len(light)}"); return
        if len(dark_media) != 1: self.bad(f, "theme", 'dark block must be `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){…}}`')
        if len(dark_expl) != 1: self.bad(f, "theme", 'explicit dark block `:root[data-theme="dark"]{…}` missing')
        def tok(body, label):
            d = {}
            for k, v in decls(body):
                if k in d: self.bad(f, "theme", f"{label}: token {k} defined twice")
                d[k] = v
            return d
        lt = tok(light[0][2], "light")
        for k, v in HCI_LIGHT.items():
            if lt.get(k) != v: self.bad(f, "U19", f"light token {k} = {lt.get(k)} (expected {v})")
        if not dark_media or not dark_expl: return
        dm, de = tok(dark_media[0][2], "dark(media)"), tok(dark_expl[0][2], "dark(explicit)")
        for label, d in (("dark(media)", dm), ("dark(explicit)", de)):
            if d.get("color-scheme") != "dark": self.bad(f, "theme", f"{label} lacks color-scheme:dark")
            for k, v in HCI_DARK.items():
                if d.get(k) != v: self.bad(f, "U19", f"{label} token {k} = {d.get(k)} (expected {v})")
            for k in d:
                if k.startswith("--") and k not in lt: self.bad(f, "theme", f"{label} defines {k} that the light block does not")
        if dm != de: self.bad(f, "theme", "the two dark blocks differ (system-dark and toggle-dark would render differently)")
        for p, b in themes:  # any extra theme must define exactly the dark block's key set: a theme is a complete token set
            keys = {k for k, _ in decls(b)}
            if keys != set(dm): self.bad(f, "theme", f"{p} defines {sorted(keys ^ set(dm))} differently from the dark token set")

    # -- one file
    def check_file(self, f):
        p = self.folder / f
        if not p.exists(): self.bad(f, "exists", "missing"); return
        raw = p.read_bytes()
        if b"\r\n" in raw: self.bad(f, "eol", "CRLF present; repo mocks are LF")
        s = raw.decode("utf-8")
        for needle in ("<!doctype html>", 'lang="zh-Hant"', '<meta charset="utf-8">', 'name="viewport"', "示意稿"):
            if needle not in s: self.bad(f, "skeleton", f"missing {needle}")
        t = re.search(r"<title>(.*?)</title>", s)
        if not t or not (2 <= len(t.group(1)) <= 12): self.bad(f, "title", "title missing or not a 2–12 char name")
        self.texts[f] = visible_text(s); self.raw[f] = s
        # style block structure (exactly one; starts with the shared block; page rules after the page mark)
        styles = re.findall(r"<style\b([^>]*)>(.*?)</style>", s, re.S)
        if len(styles) != 1: self.bad(f, "shared", f"expected exactly one <style>, found {len(styles)}"); return
        attrs, style = styles[0]
        if attrs.strip(): self.bad(f, "shared", f"<style{attrs}> must carry no attributes")
        if not style.lstrip().startswith(SHARED_START): self.bad(f, "shared", "<style> must start with the shared design-system block"); return
        if SHARED_END not in style or PAGE_MARK not in style: self.bad(f, "shared", "shared end / page-specific markers missing"); return
        a, b, c = style.find(SHARED_START), style.find(SHARED_END), style.find(PAGE_MARK)
        shared_css, between, page_css = style[a:b], style[b + len(SHARED_END):c], style[c + len(PAGE_MARK):]
        if between.strip(): self.bad(f, "shared", "CSS between the shared end marker and the page marker")
        self.shared_blocks[f] = shared_css
        ds = pathlib.Path(__file__).resolve().parent / DESIGN_SYSTEM
        if not ds.exists(): self.bad(f, "theme", f"{DESIGN_SYSTEM} missing")
        elif shared_css.split("\n", 1)[1].strip() != ds.read_text(encoding="utf-8").strip():  # drop the marker line itself
            self.bad(f, "theme", f"stylesheet differs from {DESIGN_SYSTEM} (edit the .css, then run sync-design-system.py)")
        if page_css.strip(): self.bad(f, "theme", "page-specific CSS is not allowed: add the component to design-system.css and sync")
        if FONT not in shared_css: self.bad(f, "U19", "font stack drifted")
        if "[hidden]{display:none!important}" not in shared_css:
            self.bad(f, "D18", "shared css must pin [hidden]{display:none!important}: any display: rule on a switchable element would otherwise un-hide it")
        try:
            shared_rules, page_rules = parse_css(shared_css), parse_css(page_css)
        except CssError as e:
            self.bad(f, "css", str(e)); return
        self.check_tokens(f, shared_rules)
        shared_sels = {sel for _, prelude, _ in shared_rules for sel in split_selectors(prelude) if not sel.startswith(":root")}
        for m, prelude, body in shared_rules: self.check_rule(f, "shared", m, prelude, body)
        for m, prelude, body in page_rules:
            self.check_rule(f, "page", m, prelude, body)
            for sel in split_selectors(prelude):
                if sel in shared_sels: self.bad(f, "shared", f"page CSS redefines shared selector {sel}")
        # html
        dom = Dom(); dom.feed(s); dom.close()
        for e in dom.err[:5]: self.bad(f, "html", e)
        nodes = list(dom.root.walk())
        for n in nodes:
            if n.tag == "select": self.bad(f, "ux", f"line {n.line}: <select>; ops UI uses visible buttons/chips")
            if n.tag == "svg" and (n.attrs.get("role") != "img" or not n.attrs.get("aria-label")): self.bad(f, "a11y", f"line {n.line}: svg without role=img + aria-label")
            if "style" in n.attrs: self.bad(f, "theme", f"line {n.line}: inline style on <{n.tag}>; use a class from design-system.css")
            if n.attrs.get("role") == "tablist":
                tabs = [c for c in n.elements() if "chip" in c.classes()]
                if any(c.attrs.get("role") != "tab" or c.attrs.get("aria-selected") not in ("true", "false") for c in tabs) \
                        or sum(c.attrs.get("aria-selected") == "true" for c in tabs) != 1:
                    self.bad(f, "a11y", f"line {n.line}: tablist chips need role=tab and exactly one aria-selected=true")
        # lesson mentions must be links (U15); an <a> with no destination must say which phase delivers it
        def lesson_text_ok(n):
            # descend while one child still holds the whole phrase; the element where it stops holding together
            # is the element that carries the mention, and that element must be an <a> (a phrase split across
            # <b>/<span> children inside a non-link is still not a link)
            if n.tag == "a": return
            kids = [c for c in n.elements() if LESSON_PHRASE.search(c.text())]
            if kids:
                for c in kids: lesson_text_ok(c)
            elif LESSON_PHRASE.search(n.text()):
                self.bad(f, "U15", f"line {n.line}: lesson mention that is not a link: {' '.join(n.text().split())[:40]}")
        lesson_text_ok(dom.root)
        anchors = [n for n in nodes if n.tag == "a"]
        for n in anchors:
            href = n.attrs.get("href", "")
            if href in ("", "#") and "P3" not in n.attrs.get("title", ""): self.bad(f, "U15", f"line {n.line}: placeholder link without a title saying which phase delivers it")
        if not any(PARTNER[f] in n.attrs.get("href", "") for n in anchors): self.bad(f, "links", f"no link to partner page {PARTNER[f]}")
        if sum("status" in n.classes() for n in nodes) != 1: self.bad(f, "status", "status strip missing or duplicated")
        if sum("pill" in n.classes() for n in nodes) != 1: self.bad(f, "status", "expected exactly one status pill")
        # every section card (a .card with an h2) opens with 怎麼讀／你要做的 (§3.10, M9)
        for n in nodes:
            if "card" in n.classes() and any(d.tag == "h2" for d in n.walk()):
                hows = [d for d in n.walk() if "how" in d.classes()]
                if not any("怎麼讀" in d.text() and "你要做的" in d.text() for d in hows):
                    self.bad(f, "§3.10", f"line {n.line}: section card without a 怎麼讀／你要做的 strip")
        if f in RESULT:
            howto = [n for n in anchors if "howto" in n.classes() and n.attrs.get("href", "").startswith("https://claude.ai/artifact/")]
            if not howto or "top" not in howto[0].parent.classes(): self.bad(f, "U15", "header lesson button (.top > a.howto) missing")
        if f in LESSON:
            chips = [n for n in nodes if "chip" in n.classes()]
            got = {n.attrs.get("data-set") for n in chips}
            if got != CHIP_SETS[f]: self.bad(f, "D18", f"chip sets {sorted(map(str, got))} != expected {sorted(CHIP_SETS[f])}")
            on = [n for n in chips if "on" in n.classes()]
            if len(on) != 1 or on[0].attrs.get("data-set") != "edd": self.bad(f, "D18", "exactly one chip must be on by default, and it is edd")
            groups = 0
            for n in nodes:  # every example group must carry every set, or a chip click leaves a blank spot
                sets = {c.attrs.get("data-set") for c in n.elements() if "ex" in c.classes() and c.attrs.get("data-set")}
                if sets:
                    groups += 1
                    if sets != got: self.bad(f, "D18", f"line {n.line}: example group has {sorted(map(str, sets))}, chips are {sorted(map(str, got))}")
                    shown = [c for c in n.elements() if "ex" in c.classes() and c.attrs.get("data-set") and "hidden" not in c.attrs]
                    if len(shown) != 1 or shown[0].attrs.get("data-set") != "edd": self.bad(f, "D18", f"line {n.line}: exactly the edd example may be visible before a chip is clicked")
            if groups < MIN_EX_GROUPS[f]: self.bad(f, "D18", f"only {groups} example groups; the chips must drive every step ({MIN_EX_GROUPS[f]} expected)")
            if 'querySelectorAll(".ex")' not in s: self.bad(f, "D18", 'chip script must switch every example group (querySelectorAll(".ex"))')
            skip = [n for n in anchors if n.attrs.get("href") == "#start"]
            start = [n for n in nodes if n.attrs.get("id") == "start"]
            if not skip: self.bad(f, "U15", "skip link (href=#start) missing")
            if len(start) != 1 or "card" not in start[0].classes() or not any(d.tag == "h2" and "開始" in d.text() for d in start[0].walk()):
                self.bad(f, "U15", "id=start must be the card whose h2 says 開始 (the skip link must land on the start step)")


def main(argv):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    folder = pathlib.Path(__file__).resolve().parent
    if len(argv) == 2 and argv[0] == "--dir": folder = pathlib.Path(argv[1])
    elif argv: print("usage: check-mocks.py [--dir <folder>]"); return 2
    findings = Checker(folder).run()
    if findings:
        print("\n".join(findings)); print(f"{len(findings)} finding(s)"); return 1
    print(f"check-mocks: {len(FILES)} pages, shared block identical, all rules green"); return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
