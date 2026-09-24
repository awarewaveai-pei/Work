#!/usr/bin/env python3
"""Cross-page parity gate for the Cognitive OS mockups (plan I11: mocks = spec; U19 theme + palette; U20 layout;
U21 domain list; U15/U18 lessons; U14/§3.10 result skeleton; U16 home; D18 continuity).
Run:  python Projects/internal/cognitive-engineering-os/docs/mockups/check-mocks.py [--dir <folder>]
Exit 0 = the five pages obey the same design rules. Exit 1 = one line per finding (never a traceback: a page that
cannot be parsed is itself a finding). --dir checks page copies in another folder; that folder's own design-system.css
and partials/ are used when present, else the real ones; domains.yaml is always the SPEC file (the self-test uses --dir). Self-test with mutations: check-mocks-selftest.py (must stay
green; a new rule gets its case first). build-artifact.py runs this first and refuses to build when it is red."""
import html.parser, pathlib, re, sys, unicodedata
import mockkit as mk
from mockkit import HOME, RESULT, LESSON, FILES

# who must link to whom (artifact ids in mockkit.ARTIFACT; the product replaces them with routes)
LINKS = {"home-mock.html": RESULT + LESSON,
         "iceberg-result-mock.html": ["iceberg-lesson-mock.html"], "iceberg-lesson-mock.html": ["iceberg-result-mock.html"],
         "workflow-result-mock.html": ["workflow-lesson-mock.html"], "workflow-lesson-mock.html": ["workflow-result-mock.html"]}
# U19: HCI palette (hci30/app/public/index.html:15-19) + the custom dark set
HCI_LIGHT = {"--bg": "#f6f2e9", "--card": "#fffdf8", "--ink": "#232019", "--muted": "#7a7261", "--line": "#e3dbc8",
             "--accent": "#0e5b50", "--ok": "#1f6b47", "--warn": "#a3611c", "--bad": "#a13328", "--tag": "#e2eeea", "--soft": "#f3efe4"}
HCI_DARK = {"--bg": "#1c2b27", "--card": "#243530", "--ink": "#f3efe4", "--muted": "#a9beb6", "--line": "#3a4b45",
            "--accent": "#8fc7b0", "--tag": "#22403a", "--soft": "#2a3b36"}
FONT = 'font:15px/1.65 system-ui,-apple-system,"Segoe UI","PingFang TC","Microsoft JhengHei","Noto Sans TC",sans-serif'
# U20: one column by default; only "several methods side by side" may go 2-up, and only by container width
CAPPED_2COL = "repeat(auto-fit,minmax(max(260px,calc(50% - 5px)),1fr))"
TWO_COL_ALLOWED = {".mcards"}                                  # method / station / line cards, the only 2-up grid
LABEL_ROWS = {".row", ".step", ".mistake"}                     # "label + content" two-cell rows, not card grids
HEX_ALLOW = {}                                                 # no colour literal outside the token blocks, anywhere
# D18: the chips drive the whole lesson — at least this many example groups per lesson page
# method lesson: 4 layers + worked + its button note + 4 good/bad rows + mistake example + self-check + demo button = 13
# workflow lesson: 3 stations + walked + its button note + good/bad + self-check + demo button = 8
MIN_EX_GROUPS = {"iceberg-lesson-mock.html": 13, "workflow-lesson-mock.html": 8}
TEACH_PARTS = ["課堂流程", "講稿要點", "討論題", "最常錯", "講義"]   # the teaching-material card's five sections (D25 ③)
# continuity (matched on the visible text of the page, NFKC-normalised: ＋ → +, ／ → /, （ → (, ： → :)
# PAIR_FACTS: regexes that must match on BOTH pages of a pair — the story is told once, on both sides.
PAIR_FACTS = {
    ("iceberg-result-mock.html", "iceberg-lesson-mock.html"): [
        r"8 (?:人|位參與者)只有 2 (?:人|位)", r"第 1 次是 6 (?:人|位)", r"第 4 次", r"說明佔 35 分", r"參與者需要專家幫他們看見意義", r"達到洞察", r"帶領者先(?:講|解讀)",
    ],
    ("workflow-result-mock.html", "workflow-lesson-mock.html"): [
        r"問題陳述[^。]{0,10}→[^。]{0,10}SWOT[^。]{0,10}→[^。]{0,10}加權決策矩陣", r"線上\+實體", r"主動分享(?:人數)?不降", r"遠地(?:參加者)?至少 3 人",
        r"帶領者(?:負擔|每週準備時間)不(?:增|超過)", r"S/W/O/T 各至少 2 條", r"每個準則的權重",   # station minutes/cost: NUMBER_PINS below
    ],
    # one storyline per domain across the two lessons (D18): the decision route continues the iceberg case
    ("iceberg-lesson-mock.html", "workflow-lesson-mock.html"): [r"畫廊", r"延後付款", r"平日班", r"退貨率 12%", r"尺寸類", r"週日晚上", r"家事"],
    # the home page quotes the two demo projects exactly as their pages state them
    ("home-mock.html", "iceberg-result-mock.html"): [r"主動分享 6 → 2 人", r"AI 草稿・尚未核准", r"6k tokens"],
    ("home-mock.html", "workflow-result-mock.html"): [r"線上\+實體", r"已完成 1/3 站", r"問題陳述 → SWOT → 加權決策矩陣", r"NT\$3\(已用 NT\$1\)"],
}
# PAGE_FACTS: regexes that must match on one page.
PAGE_FACTS = {
    "home-mock.html": [r"查一家公司", r"評估一個決定", r"整理文獻", r"藝術反思", r"描述你的問題", r"建立 ?→ ?蒐集 ?→ ?彙整 ?→ ?分析 ?→ ?報表 ?→ ?核准", r"示範專案"],
    "iceberg-result-mock.html": [r"6 人掉到 2 人", r"主動分享 6 → 2 人", r"8 人團體", r"現在 2 人"],
    # the four plain-language layer lines the operator approved on 2026-09-24 stay on the lesson iceberg
    "iceberg-lesson-mock.html": [r"主動分享 6 → 2 人", r"同一個案例", r"看得見:發生了什麼", r"看不見:", r"一直重複的模式", r"製造模式的制度", r"撐住制度的信念", r"手邊有這些會"],
    "workflow-result-mock.html": [r"自動填第 1 格", r"你填了 2 格"],
    "workflow-lesson-mock.html": [r"三個格子", r"手邊有這些會"],
}
# NUMBER_PINS: every occurrence of the pattern on the listed pages must carry exactly these numbers (drift in one copy fails).
NUMBER_PINS = [
    (("iceberg-result-mock.html", "iceberg-lesson-mock.html"), r"第 1 次是 (\d+)", ("6",)),
    (("iceberg-result-mock.html", "iceberg-lesson-mock.html"), r"(\d+) (?:人|位參與者)只有 (\d+) (?:人|位)", ("8", "2")),
    (("iceberg-result-mock.html", "iceberg-lesson-mock.html"), r"說明佔 (\d+) 分", ("35",)),
    (("iceberg-result-mock.html", "home-mock.html"), r"主動分享 (\d+) → (\d+) 人", ("6", "2")),
    (("iceberg-result-mock.html",), r"現在 (\d+) 人", ("2",)),
    (("workflow-result-mock.html", "workflow-lesson-mock.html"), r"遠地(?:參加者)?至少 (\d+) 人", ("3",)),
    # a list pins the whole ordered sequence of occurrences: station 1 = 2 min, stations 2 and 3 = 3 min, NT$1 each
    (("workflow-result-mock.html",), r"(?:用了|約) (\d+) 分鐘・(?:約 )?NT\$(\d+)", [("2", "1"), ("3", "1"), ("3", "1")]),
    (("workflow-lesson-mock.html",), r"(\d+) 分鐘・NT\$(\d+)", [("2", "1"), ("3", "1"), ("3", "1")]),
]
# FORBID: the other story and the superseded numbers must not creep back in (regexes on the NFKC visible text).
ROUTE_ORDER = [r"加權決策矩陣[^→。]{0,6}→[^→。]{0,12}SWOT", r"SWOT[^→。]{0,6}→[^→。]{0,12}問題陳述", r"加權決策矩陣[^→。]{0,6}→[^→。]{0,12}問題陳述"]
FORBID = {
    "home-mock.html": ROUTE_ORDER,
    "iceberg-result-mock.html": [r"[57]\s*→\s*2", r"上一?期同一次", r"上期對照"],
    "iceberg-lesson-mock.html": [r"[57]\s*→\s*2", r"上一?期同一次", r"再檢視", r"創作本身就是療癒", r"回頭講"],
    "workflow-result-mock.html": [r"自動填 2 欄", r"你填了 3 欄"] + ROUTE_ORDER,
    # the route lesson's domain stories continue the iceberg ones; the earlier unrelated cases and the short S:/W: labels stay out
    "workflow-lesson-mock.html": ROUTE_ORDER + [r"藝術治療機構", r"文具", r"搬到市區", r"郊區", r"(?<![A-Za-z])[SWOT]:"],
}
# one drawing on both iceberg pages: the polygon and the gradient must be byte-identical (raw HTML)
ICEBERG_SHAPE = [
    '<path d="M550,150 L585,40 L620,85 L645,55 L690,150 L810,290 L780,420 L690,540 L560,540 L460,420 L420,290 Z" fill="url(#ice)"',
    '<stop offset="0" stop-color="#fbe3d6"/><stop offset="0.2" stop-color="#cfe3f3"/><stop offset="0.5" stop-color="#5a93c4"/><stop offset="0.75" stop-color="#245b8a"/><stop offset="1" stop-color="#0b2a4a"/>',
    'aria-label="冰山模型四層圖"',
]
_known = set(FILES)
assert all(a in _known and b in _known for a, b in PAIR_FACTS) and set(PAGE_FACTS) <= _known and set(FORBID) <= _known \
    and set(LINKS) == _known and all(set(v) <= _known for v in LINKS.values()) \
    and all(set(pages) <= _known for pages, _, _ in NUMBER_PINS), "a table names a page that is not checked"
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
    def has(self, cls): return cls in self.classes()
    def elements(self): return [c for c in self.children if isinstance(c, Node)]
    def text(self): return "".join(c if isinstance(c, str) else c.text() for c in self.children)
    def find(self, cls=None, tag=None): return [d for d in self.walk() if d is not self and (cls is None or d.has(cls)) and (tag is None or d.tag == tag)]

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


# ---------------- checks ----------------
class Checker:
    def __init__(self, folder):
        self.folder = pathlib.Path(folder); self.findings = []; self.shared_blocks = {}; self.texts = {}; self.raw = {}
        self.domains = None; self.partials = {}
        # --dir may carry its own design-system.css / partials/ (the self-test mutates copies); otherwise the real ones
        self.css_path = self.folder / mk.DESIGN_SYSTEM.name if (self.folder / mk.DESIGN_SYSTEM.name).exists() else mk.DESIGN_SYSTEM
        self.partials_dir = self.folder / "partials" if (self.folder / "partials").is_dir() else mk.PARTIALS

    def bad(self, f, rule, msg): self.findings.append(f"{f}: [{rule}] {msg}")

    def run(self):
        try:
            self.domains = mk.load_domains()
        except Exception as e:
            self.bad("*", "U21", f"{mk.DOMAINS_FILE.name}: {e}")
        for p in sorted(self.partials_dir.glob("*.html")): self.partials[p.stem] = p.read_text(encoding="utf-8").rstrip("\n")
        for name, render in mk.GENERATED.items():   # a generated partial must equal its data (edit the yaml, run sync)
            if name not in self.partials: self.bad("*", "U21", f"partials/{name}.html missing (run sync-design-system.py)")
            elif self.domains and self.partials[name] != render().rstrip("\n"):
                self.bad("*", "U21", f"partials/{name}.html differs from {mk.DOMAINS_FILE.name} (run sync-design-system.py)")
        for f in FILES:
            try:
                self.check_file(f)
            except Exception as e:  # a page that cannot be checked is a finding, never a traceback
                self.bad(f, "parse", f"{type(e).__name__}: {e}")
        if len(set(self.shared_blocks.values())) > 1:
            self.bad("*", "shared", "shared design-system block differs between files (run sync-design-system.py)")
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
        self.check_style(f, s)
        self.check_partials(f, s)
        dom = Dom(); dom.feed(s); dom.close()
        for e in dom.err[:5]: self.bad(f, "html", e)
        nodes = list(dom.root.walk())
        self.check_common(f, s, dom.root, nodes)
        if f in RESULT: self.check_result(f, dom.root, nodes)
        if f in LESSON: self.check_lesson(f, s, dom.root, nodes)
        if f in HOME: self.check_home(f, dom.root, nodes)

    def check_style(self, f, s):
        # exactly one <style>: the shared block (== design-system.css) then an empty page section
        styles = re.findall(r"<style\b([^>]*)>(.*?)</style>", s, re.S)
        if len(styles) != 1: self.bad(f, "shared", f"expected exactly one <style>, found {len(styles)}"); return
        attrs, style = styles[0]
        if attrs.strip(): self.bad(f, "shared", f"<style{attrs}> must carry no attributes")
        if not style.lstrip().startswith(mk.CSS_START.strip()): self.bad(f, "shared", "<style> must start with the shared design-system block"); return
        end, page = mk.CSS_END.strip(), mk.CSS_PAGE.strip()
        if end not in style or page not in style: self.bad(f, "shared", "shared end / page-specific markers missing"); return
        a, b, c = style.find(mk.CSS_START.strip()), style.find(end), style.find(page)
        shared_css, between, page_css = style[a:b], style[b + len(end):c], style[c + len(page):]
        if between.strip(): self.bad(f, "shared", "CSS between the shared end marker and the page marker")
        self.shared_blocks[f] = shared_css
        if not self.css_path.exists(): self.bad(f, "theme", f"{mk.DESIGN_SYSTEM.name} missing")
        elif shared_css.split("\n", 1)[1].strip() != self.css_path.read_text(encoding="utf-8").strip():  # drop the marker line itself
            self.bad(f, "theme", f"stylesheet differs from {mk.DESIGN_SYSTEM.name} (edit the .css, then run sync-design-system.py)")
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

    def check_partials(self, f, s):
        # a marked fragment must be byte-identical to partials/<name>.html (run sync-design-system.py); lessons must carry theirs
        try:
            frags = mk.fragments(s)
        except ValueError as e:
            self.bad(f, "partials", str(e)); return
        for name, body in frags.items():
            if name not in self.partials: self.bad(f, "partials", f"fragment {name} has no partials/{name}.html")
            elif body != self.partials[name]: self.bad(f, "partials", f"fragment {name} differs from partials/{name}.html (run sync-design-system.py)")
            if mk.partial_start(name) not in s: self.bad(f, "partials", f"fragment {name}: start marker text drifted (run sync-design-system.py)")
        for name in mk.REQUIRED_PARTIALS.get(f, ()):
            if name not in frags: self.bad(f, "partials", f"required partial {name} is not marked in the page")

    def check_common(self, f, s, root, nodes):
        # every page: one h1, one banner, one crumbs line (linking home unless this is home), one status strip + pill,
        # no <select>, no inline style, svg a11y, tablist a11y, lesson mentions are links, partner links, section cards open with 怎麼讀／你要做的
        if sum(n.tag == "h1" for n in nodes) != 1: self.bad(f, "skeleton", "exactly one h1 per page")
        if sum(n.has("banner") for n in nodes) != 1: self.bad(f, "skeleton", "exactly one 示意稿 banner")
        crumbs = [n for n in nodes if n.has("crumbs")]
        if len(crumbs) != 1 or not crumbs[0].text().strip().startswith("首頁"): self.bad(f, "links", "exactly one .crumbs line starting with 首頁")
        elif f not in HOME:
            first = crumbs[0].elements()[:1]
            home_id = mk.ARTIFACT["home-mock.html"]
            if not first or first[0].tag != "a" or first[0].text().strip() != "首頁" or (home_id and home_id not in first[0].attrs.get("href", "")):
                self.bad(f, "links", "crumbs must start with a link 首頁 to the home page")
        for n in nodes:
            if n.tag == "select": self.bad(f, "ux", f"line {n.line}: <select>; ops UI uses visible buttons/chips")
            if n.tag == "svg" and (n.attrs.get("role") != "img" or not n.attrs.get("aria-label")): self.bad(f, "a11y", f"line {n.line}: svg without role=img + aria-label")
            if "style" in n.attrs: self.bad(f, "theme", f"line {n.line}: inline style on <{n.tag}>; use a class from design-system.css")
            if n.attrs.get("role") == "tablist":
                tabs = [c for c in n.elements() if c.has("chip")]
                if any(c.attrs.get("role") != "tab" or c.attrs.get("aria-selected") not in ("true", "false") for c in tabs) \
                        or sum(c.attrs.get("aria-selected") == "true" for c in tabs) != 1:
                    self.bad(f, "a11y", f"line {n.line}: tablist chips need role=tab and exactly one aria-selected=true")
        # lesson mentions must be links (U15); an <a> with no destination must say which phase delivers it
        def lesson_text_ok(n):
            # descend while one child still holds the whole phrase; the element where it stops holding together
            # carries the mention and must be an <a> (a phrase split across <b>/<span> inside a non-link is still not a link)
            if n.tag == "a": return
            kids = [c for c in n.elements() if LESSON_PHRASE.search(c.text())]
            if kids:
                for c in kids: lesson_text_ok(c)
            elif LESSON_PHRASE.search(n.text()):
                self.bad(f, "U15", f"line {n.line}: lesson mention that is not a link: {' '.join(n.text().split())[:40]}")
        lesson_text_ok(root)
        anchors = [n for n in nodes if n.tag == "a"]
        for n in anchors:
            href = n.attrs.get("href", "")
            if href in ("", "#") and "P3" not in n.attrs.get("title", ""): self.bad(f, "U15", f"line {n.line}: placeholder link without a title saying which phase delivers it")
        for target in LINKS[f]:
            if not any(mk.ARTIFACT[target] in n.attrs.get("href", "") for n in anchors): self.bad(f, "links", f"no link to {target} ({mk.ARTIFACT[target]})")
        if sum(n.has("status") for n in nodes) != 1: self.bad(f, "status", "status strip missing or duplicated")
        if sum(n.has("pill") for n in nodes) != 1: self.bad(f, "status", "expected exactly one status pill")
        # every section card (a .card with an h1/h2) OPENS with 怎麼讀／你要做的 (§3.10, M9): the strip is the first
        # element after the heading / header pieces, not somewhere further down
        for n in nodes:
            if n.has("card") and any(d.tag in ("h1", "h2") for d in n.walk()):
                first = next((c for c in n.elements() if c.tag not in ("h1", "h2") and not (c.has("top") or c.has("sub") or c.has("status"))), None)
                if first is None or not first.has("how") or "怎麼讀" not in first.text() or "你要做的" not in first.text():
                    self.bad(f, "§3.10", f"line {n.line}: section card must open with a 怎麼讀／你要做的 strip (first element after the heading)")
        # good/bad examples come in pairs (M6), starting from every 好／壞 box: it must sit inside a .gb, and its unit
        # (the domain variant .ex it belongs to, or the .gb itself for boxes placed directly) has as many 好 as 壞
        units = {}
        for n in nodes:
            if not (n.has("good") or n.has("bad")): continue
            gb = n.parent
            while gb is not None and gb.tag != "#root" and not gb.has("gb"): gb = gb.parent
            if gb is None or gb.tag == "#root": self.bad(f, "M6", f"line {n.line}: 好／壞 box outside a .gb group (options are not examples)"); continue
            u = n
            while u.parent is not gb: u = u.parent
            unit = u if u.has("ex") else gb
            units.setdefault(unit, [0, 0])[0 if n.has("good") else 1] += 1
        for unit, (g, b) in units.items():
            if g < 1 or g != b: self.bad(f, "M6", f"line {unit.line}: good/bad group has {g} 好 and {b} 壞 (they come in pairs)")
        # `.ex` = "switches with the domain"; without data-set the chip script hides it for good after the first click
        for n in nodes:
            if n.has("ex") and not n.attrs.get("data-set"): self.bad(f, "D18", f"line {n.line}: .ex without data-set (the chip script would hide it forever)")

    def check_result(self, f, root, nodes):
        cards = [n for n in nodes if n.has("card") and not n.has("layer")]
        if not cards: self.bad(f, "§3.10", "no cards"); return
        top, last = cards[0], cards[-1]
        anchors = [n for n in nodes if n.tag == "a"]
        howto = [n for n in anchors if n.has("howto") and n.attrs.get("href", "").startswith("https://claude.ai/artifact/")]
        if not howto or not howto[0].parent.has("top") or howto[0].parent.parent is not top: self.bad(f, "U15", "header lesson button (.top > a.howto) missing from the first card")
        # U14 / §3.10 (0): the first card = status, how, lead, can/cant, three reading steps, the 30-second line, four terms
        if not top.find("status"): self.bad(f, "U14", "first card must carry the status strip")
        if not top.find("lead"): self.bad(f, "U14", "first card must carry a .lead sentence")
        if not (top.find("can") and top.find("cant")): self.bad(f, "U14", "first card must carry 能回答／不能回答 (.can/.cant)")
        todos = [n for n in top.find("todos") if len(n.find("todo")) >= 3]
        if not todos: self.bad(f, "U14", "first card must carry 怎麼讀這一頁 as .todos with three .todo steps")
        if "30 秒" not in top.text(): self.bad(f, "U14", "first card must say what to read with only 30 seconds")
        if not top.find("terms"): self.bad(f, "U14", "first card must carry the 四個詞 .terms line")
        # the last card = source strip, what approve/return/delete mean, actions, expert mode folded in a <details><pre>
        if not last.find("meta-bar"): self.bad(f, "§3.10", "last card must carry the .meta-bar source strip")
        if not last.find("btns"): self.bad(f, "§3.10", "last card must carry the approve/return actions")
        if not any(d.find(tag="pre") for d in last.find(tag="details")): self.bad(f, "expert", "last card must fold expert mode into <details> with a <pre>")

    def check_lesson(self, f, s, root, nodes):
        d = self.domains
        want = set(mk.active_ids(d)) if d else set()
        default = d["default"] if d else None
        chips = [n for n in nodes if n.has("chip")]
        got = {n.attrs.get("data-set") for n in chips}
        if d and got != want: self.bad(f, "U21", f"chip sets {sorted(map(str, got))} != domains.yaml {sorted(want)}")
        on = [n for n in chips if n.has("on")]
        if len(on) != 1 or on[0].attrs.get("data-set") != default: self.bad(f, "D18", f"exactly one chip must be on by default, and it is the default domain ({default})")
        groups = 0
        for n in nodes:  # every example group must carry every set, or a chip click leaves a blank spot
            sets = {c.attrs.get("data-set") for c in n.elements() if c.has("ex") and c.attrs.get("data-set")}
            if sets:
                groups += 1
                if sets != got: self.bad(f, "D18", f"line {n.line}: example group has {sorted(map(str, sets))}, chips are {sorted(map(str, got))}")
                shown = [c for c in n.elements() if c.has("ex") and c.attrs.get("data-set") and "hidden" not in c.attrs]
                if len(shown) != 1 or shown[0].attrs.get("data-set") != default: self.bad(f, "D18", f"line {n.line}: exactly the default ({default}) example may be visible before a chip is clicked")
        if groups < MIN_EX_GROUPS[f]: self.bad(f, "D18", f"only {groups} example groups; the chips must drive every step ({MIN_EX_GROUPS[f]} expected)")
        if 'querySelectorAll(".ex")' not in s: self.bad(f, "D18", 'chip script must switch every example group (querySelectorAll(".ex"))')
        anchors = [n for n in nodes if n.tag == "a"]
        if not [n for n in anchors if n.attrs.get("href") == "#start"]: self.bad(f, "U15", "skip link (href=#start) missing")
        start = [n for n in nodes if n.attrs.get("id") == "start"]
        if len(start) != 1 or not start[0].has("card") or not any(x.tag == "h2" and "開始" in x.text() for x in start[0].walk()):
            self.bad(f, "U15", "id=start must be the card whose h2 says 開始 (the skip link must land on the start step)")
        else:  # the start step: preparation list + exactly three buttons (demo / mine / is this for me)
            st = start[0]
            if not any(len(u.find(tag="li")) >= 3 for u in st.find("check", tag="ul")): self.bad(f, "U15", "start step needs a ul.check with at least three items")
            btns = st.find("btns")
            if not btns or len(btns[0].find("btn")) != 3: self.bad(f, "U15", "start step needs exactly three buttons")
        prog = [n for n in nodes if n.has("progress")]
        if len(prog) != 1 or not prog[0].elements() or not prog[0].elements()[0].has("done"): self.bad(f, "U15", "one .progress strip whose first step is done")
        status = [n for n in nodes if n.has("status")]
        if status and "教材版" not in status[0].text(): self.bad(f, "U15", "status strip must point to the teaching-material card at the bottom")
        quiz = [n for n in nodes if n.has("quiz")]
        if len(quiz) != 1 or len(quiz[0].find(tag="details")) < 2: self.bad(f, "U15", "one self-check .quiz with at least two questions")
        if sum(n.has("mistake") for n in nodes) < 3: self.bad(f, "M7", "at least three 常見錯誤 rows")
        teach = [n for n in nodes if n.has("card") and any(x.tag == "h2" and "教材版" in x.text() for x in n.walk())]
        if len(teach) != 1: self.bad(f, "U15", "exactly one 教材版 card (D25 ③)")
        else:
            sums = " ".join(x.text() for x in teach[0].find(tag="summary"))
            for part in TEACH_PARTS:
                if part not in sums: self.bad(f, "U15", f"教材版 card lacks the {part} section")
        src = [n for n in nodes if n.has("card") and any(x.tag == "h2" and "課程來源" in x.text() for x in n.walk())]
        if len(src) != 1 or not any(len(o.find(tag="li")) >= 2 for o in src[0].find("src", tag="ol")): self.bad(f, "M8", "one 課程來源 card with at least two numbered sources")

    def check_home(self, f, root, nodes):
        if sum(n.tag == "textarea" for n in nodes) != 1: self.bad(f, "U16", "home carries exactly one 描述你的問題 textarea")
        proj = [n for n in nodes if n.attrs.get("id") == "projects"]
        if len(proj) != 1 or not proj[0].has("card") or not proj[0].find(tag="table"): self.bad(f, "U8", "id=projects must be the card with the project table")
        if sum(n.has("journey") for n in nodes) != 1: self.bad(f, "U2", "one .journey strip with the six project steps")
        if sum(n.has("mcards") for n in nodes) < 3: self.bad(f, "U1", "home needs the line cards, the routing suggestions and the demo projects as .mcards")
        skip = [n for n in nodes if n.tag == "a" and n.attrs.get("href") == "#projects"]
        if not skip: self.bad(f, "U8", "header link to #projects missing")


def main(argv):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    folder = mk.HERE
    if len(argv) == 2 and argv[0] == "--dir": folder = pathlib.Path(argv[1])
    elif argv: print("usage: check-mocks.py [--dir <folder>]"); return 2
    findings = Checker(folder).run()
    if findings:
        print("\n".join(findings)); print(f"{len(findings)} finding(s)"); return 1
    print(f"check-mocks: {len(FILES)} pages, shared block identical, all rules green"); return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
