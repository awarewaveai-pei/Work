#!/usr/bin/env python3
"""Cross-page parity gate for the Cognitive OS mockups (plan I11: mocks = spec; U19 theme + palette; U20 layout;
U21 domain list; U15/U18 lessons; U14/§3.10 result skeleton; U16 home; D18 continuity).
Run:  python Projects/internal/cognitive-engineering-os/docs/mockups/check-mocks.py [--dir <folder>]
      python …/check-mocks.py --page result <rendered.html> [--lesson <the tool's lesson path>] [--mock <mock.html>]   (the web result page)
Exit 0 = the five pages obey the same design rules. Exit 1 = one line per finding (never a traceback: a page that
cannot be parsed is itself a finding). --dir checks page copies in another folder, with that folder's own design-system.css and partials/;
the registries come from SPEC (AI_LEGO_SPEC_ROOT overrides it; the self-test uses both). Self-test with mutations: check-mocks-selftest.py (must stay
green; a new rule gets its case first). build-artifact.py runs this first and refuses to build when it is red."""
import html.parser, os, pathlib, re, sys, unicodedata
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
SHELL = {".app"}                                               # the app shell: sidebar + content (U1)
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
    "home-mock.html": [r"先說你卡在哪", r"按你想做的事找", r"先從這幾個開始", r"工作流:一次走完幾個工具", r"全部 \d+ 個工具", r"建立 ?→ ?蒐集 ?→ ?彙整 ?→ ?分析 ?→ ?報表 ?→ ?核准", r"示範專案"],
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
    # the home page speaks the operator's words (工具／工作流); internal taxonomy (家族) and my invented 路線 stay out;
    # 路線圖 (roadmap) is a real tool name, hence the look-ahead
    "home-mock.html": ROUTE_ORDER + [r"家族", r"路線(?!圖)", r"單一方法"],
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
COMMON_FORBID = [r"方法(?!論)"]                                  # every page says 工具 (operator's word), never 方法
# U14 (operator 2026-09-25 「講解塞太多…詳解主要放在五分鐘課程裡」): a run page keeps one short line per section; the
# reading guide (three steps, 30 seconds, four terms, the per-section detail) lives in its lesson's "read" tab
HOW_MAX = 60                                                    # characters of a run page's 怎麼讀／你要做的 strip (NFKC, spaces collapsed)
TEACHING = ("can", "cant", "todos", "terms")                   # teaching blocks that belong in the lesson, never on a run page
RUN_OF = {lesson: run for lesson, run in mk.DEMOS.values()}     # each lesson's run page (its start buttons land there)
LESSON_OF = {run: lesson for lesson, run in RUN_OF.items()}
BEHAVIOUR = ("data-mock", "data-prompt", "data-set", "aria-pressed", "data-run", "data-fill", "data-clear", "data-tab-go")
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
        self.root = Node("#root", {}, None, 0); self.cur = self.root; self.err = []; self.svg = 0; self.foreign = 0

    def _html(self):
        """HTML rules apply outside svg and inside a foreignObject (a browser serializes <br> there without a slash)."""
        return self.svg == 0 or self.foreign > 0

    def handle_starttag(self, tag, attrs):
        node = Node(tag, dict(attrs), self.cur, self.getpos()[0]); self.cur.children.append(node)
        if tag in VOID and self._html(): return
        if tag == "svg": self.svg += 1
        if tag == "foreignobject": self.foreign += 1
        self.cur = node

    def handle_startendtag(self, tag, attrs):
        node = Node(tag, dict(attrs), self.cur, self.getpos()[0]); self.cur.children.append(node)
        if self._html() and tag not in VOID:
            self.err.append(f"line {self.getpos()[0]}: <{tag}/> is not a void element; a browser ignores the slash")

    def handle_endtag(self, tag):
        if tag in VOID and self._html(): return
        if self.cur.tag == tag:
            if tag == "svg": self.svg -= 1
            if tag == "foreignobject": self.foreign -= 1
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
        self.domains = None; self.partials = {}; self.ids = {}; self.xlinks = {}
        # the checked folder carries its own design-system.css and partials/ (--dir: the self-test's mutated copies)
        self.css_path = self.folder / mk.DESIGN_SYSTEM.name
        self.partials_dir = self.folder / "partials"

    @staticmethod
    def _ancestors(n):
        a = n.parent
        while a is not None:
            yield a
            a = a.parent

    def bad(self, f, rule, msg):
        site = f"  @site:{sys._getframe(1).f_lineno}" if os.environ.get("CHECK_MOCKS_TRACE") else ""   # the selftest maps findings to rules
        self.findings.append(f"{f}: [{rule}] {msg}{site}")

    def run(self):
        try:
            self.domains = mk.load_domains()
        except Exception as e:
            self.bad("*", "U21", f"{mk.DOMAINS_FILE.name}: {e}")
        # the web app uses the same stylesheet byte for byte (a --dir copy carries it as web-design-system.css)
        web_css = mk.WEB_DESIGN_SYSTEM if self.folder.resolve() == mk.HERE else self.folder / "web-design-system.css"
        if not web_css.exists() or not self.css_path.exists() or web_css.read_bytes() != self.css_path.read_bytes():
            self.bad("*", "U19", f"web copy of {mk.DESIGN_SYSTEM.name} ({web_css.name}) is missing or differs (run sync-design-system.py)")
        for p in sorted(self.partials_dir.glob("*.html")): self.partials[p.stem] = p.read_text(encoding="utf-8").rstrip("\n")
        for name, render in mk.GENERATED.items():   # a generated partial must equal its registries (edit the data, run sync)
            tag = "U21" if name == "domain-chips" else "catalog"
            if name not in self.partials: self.bad("*", tag, f"partials/{name}.html missing (run sync-design-system.py)"); continue
            try:
                want = render().rstrip("\n")
            except Exception as e:   # a registry gap is a finding, never a traceback
                self.bad("*", tag, f"partials/{name}.html cannot be rendered: {type(e).__name__}: {e}"); continue
            if self.partials[name] != want: self.bad("*", tag, f"partials/{name}.html differs from its registries (run sync-design-system.py)")
        for f in FILES:
            try:
                self.check_file(f)
            except Exception as e:  # a page that cannot be checked is a finding, never a traceback
                self.bad(f, "parse", f"{type(e).__name__}: {e}")
        # plan I11: the web app's lessons are these pages' exports (sync writes them; a --dir copy carries web-lessons.generated.ts)
        web_lessons = mk.WEB_LESSONS if self.folder.resolve() == mk.HERE else self.folder / "web-lessons.generated.ts"
        try:
            want = mk.render_web_lessons(self.folder).encode("utf-8")
        except (OSError, ValueError) as e:
            self.bad("*", "I11", f"lessons cannot be exported to the web app: {e}")
        else:
            if not web_lessons.exists() or web_lessons.read_bytes() != want:
                self.bad("*", "I11", f"web lessons ({web_lessons.name}) are missing or differ from the lesson mocks (run sync-design-system.py)")
        if len(set(self.shared_blocks.values())) > 1:
            self.bad("*", "shared", "shared design-system block differs between files (run sync-design-system.py)")
        self.check_continuity()
        self.check_cross_links()
        return self.findings

    def check_cross_links(self):
        # a link into another mock (…/artifact/<id>#<anchor>) lands on an id of that page, and the anchor is one the
        # artifact frame passes on (a plain #anchor: letters, digits, . _ ~ -); menu, tool-page and #ask links all go this way
        page_of = {mk.ARTIFACT[f]: f for f in FILES}
        for f, links in self.xlinks.items():
            for line, href in links:
                art, _, frag = href[len("https://claude.ai/artifact/"):].partition("#")
                if art not in page_of: self.bad(f, "links", f"line {line}: {href} is not one of the mocks' artifacts"); continue
                if not frag: continue
                if not re.fullmatch(r"[A-Za-z0-9._~-]+", frag): self.bad(f, "links", f"line {line}: #{frag} is not a plain anchor; the artifact frame drops it")
                elif page_of[art] in self.ids and frag not in self.ids[page_of[art]] and not (page_of[art] in RESULT and frag in mk.RUN_STATES):
                    self.bad(f, "links", f"line {line}: {href} has no target on {page_of[art]}")

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
        for f in FILES:
            for pat in FORBID.get(f, []) + COMMON_FORBID:
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
                     or (re.fullmatch(r"\d+px 1fr", v) is not None and set(sels) <= LABEL_ROWS) \
                     or (re.fullmatch(r"\d+px minmax\(0,1fr\)", v) is not None and set(sels) <= SHELL)
                if not ok: self.bad(f, "U20", f"{prelude} grid-template-columns:{v} (allowed: 1fr; capped 2-col only for {sorted(TWO_COL_ALLOWED)}; '<n>px 1fr' only for label rows; '<n>px minmax(0,1fr)' only for the app shell)")
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
            if name in mk.PER_PAGE:   # rendered for this page (the main menu marks the page's section)
                try:
                    want = mk.PER_PAGE[name](f).rstrip("\n")
                except Exception as e:
                    self.bad(f, "partials", f"fragment {name} cannot be rendered: {type(e).__name__}: {e}"); continue
                if body != want: self.bad(f, "partials", f"fragment {name} differs from its render for this page (run sync-design-system.py)")
            elif name not in self.partials: self.bad(f, "partials", f"fragment {name} has no partials/{name}.html")
            elif body != self.partials[name]: self.bad(f, "partials", f"fragment {name} differs from partials/{name}.html (run sync-design-system.py)")
            if mk.partial_start(name) not in s: self.bad(f, "partials", f"fragment {name}: start marker text drifted (run sync-design-system.py)")
        for name in mk.REQUIRED_PARTIALS.get(f, ()):
            if name not in frags: self.bad(f, "partials", f"required partial {name} is not marked in the page")

    def check_common(self, f, s, root, nodes):
        # every page: one h1, one banner, one crumbs line (linking home unless this is home), one status strip + pill,
        # no <select>, no inline style, svg a11y, tablist a11y, lesson mentions are links, partner links, section cards open with 怎麼讀／你要做的
        views = [n for n in nodes if n.tag == "section" and "data-view" in n.attrs]
        def in_tpage(n):
            a = n.parent
            while a is not None and not (a.tag == "article" and a.has("tpage")): a = a.parent
            return a
        if views:   # an app page shows one view at a time: one h1 per view (per page in a view of pages), none outside
            for v in views:
                pages = [p for p in v.find(tag="article") if p.has("tpage")]
                if pages:
                    if any(len(p.find(tag="h1")) != 1 for p in pages) or len(v.find(tag="h1")) != len(pages):
                        self.bad(f, "skeleton", f"view {v.attrs['data-view']}: exactly one h1 per page, none outside its pages")
                elif len(v.find(tag="h1")) != 1: self.bad(f, "skeleton", f"view {v.attrs['data-view']}: exactly one h1")
            if sum(n.tag == "h1" for n in nodes) != sum(len(v.find(tag="h1")) for v in views): self.bad(f, "skeleton", "an h1 outside the views")
        elif sum(n.tag == "h1" for n in nodes) != 1: self.bad(f, "skeleton", "exactly one h1 per page")
        # the app shell (U1): div.app = nav.side (the main menu) then main.wrap; one aria-current, on this page's section
        app, navs = [n for n in nodes if n.has("app")], [n for n in nodes if n.tag == "nav" and n.has("side")]
        kids = app[0].elements() if len(app) == 1 else []
        if len(navs) != 1 or [k.tag for k in kids] != ["nav", "main"] or not kids[0].has("side") or not kids[1].has("wrap"):
            self.bad(f, "U1", "the page is div.app holding exactly nav.side (main menu) then main.wrap")
        else:
            items = [a for a in navs[0].find(tag="a") if "data-view" in a.attrs]
            cur = [(a.attrs["data-view"], a.attrs["aria-current"]) for a in items if a.attrs.get("aria-current")]
            if [a.attrs["data-view"] for a in items] != [x["id"] for x in mk.NAV] or cur != [(mk.SECTION[f], mk.current_value(f))]:
                self.bad(f, "U1", f"main menu must list {[x['id'] for x in mk.NAV]} with aria-current={mk.current_value(f)} on {mk.SECTION[f]} only")
        if sum(n.has("banner") for n in nodes) != 1: self.bad(f, "skeleton", "exactly one 示意稿 banner")
        # the menu shows where a page sits; crumbs only on pages below a menu item, starting with a link to that item
        crumbs = [n for n in nodes if n.has("crumbs")]
        if f in HOME:   # the menu views carry none; a tool page (a page below 工具) carries exactly one, starting at 工具
            if any(in_tpage(c) is None for c in crumbs): self.bad(f, "links", "the home menu views carry no .crumbs (the main menu shows where you are)")
            for p in [n for n in nodes if n.tag == "article" and n.has("tpage")]:
                cs = p.find("crumbs")
                first = [c for c in cs[0].children if not (isinstance(c, str) and not c.strip())][:1] if len(cs) == 1 else []
                if not first or isinstance(first[0], str) or first[0].tag != "a" or first[0].attrs.get("href") != mk.nav_href(f, "tools"):
                    self.bad(f, "links", f"line {p.line}: a tool page carries exactly one .crumbs line starting with a link to {mk.nav_href(f, 'tools')}")
        else:
            sec = next(x for x in mk.NAV if x["id"] == mk.SECTION[f])
            first = [c for c in crumbs[0].children if not (isinstance(c, str) and not c.strip())][:1] if len(crumbs) == 1 else []   # the very first node, text included
            if not first or isinstance(first[0], str) or first[0].tag != "a" or first[0].text().strip() != sec["label"] or first[0].attrs.get("href") != mk.nav_href(f, sec["id"]):
                self.bad(f, "links", f"exactly one .crumbs line starting with a link {sec['label']} to {mk.nav_href(f, sec['id'])}")
        for n in nodes:
            if n.tag == "select": self.bad(f, "ux", f"line {n.line}: <select>; ops UI uses visible buttons/chips")
            if n.tag == "svg" and n.attrs.get("aria-hidden") != "true" and (n.attrs.get("role") != "img" or not n.attrs.get("aria-label")):
                self.bad(f, "a11y", f"line {n.line}: svg without role=img + aria-label (or aria-hidden=true beside a text label)")
            if "style" in n.attrs: self.bad(f, "theme", f"line {n.line}: inline style on <{n.tag}>; use a class from design-system.css")
            if n.attrs.get("role") == "tablist":   # the domain chips and the lesson tabs alike
                tabs = [c for c in n.elements() if c.has("chip") or c.has("tab")]
                if any(c.attrs.get("role") != "tab" or c.attrs.get("aria-selected") not in ("true", "false") for c in tabs) \
                        or sum(c.attrs.get("aria-selected") == "true" for c in tabs) != 1:
                    self.bad(f, "a11y", f"line {n.line}: tablist chips need role=tab and exactly one aria-selected=true")
            # a chip is a button with a state: a tab (aria-selected, above) or a toggle (aria-pressed); never a styled span
            if n.has("chip") and (n.tag != "button" or (n.attrs.get("role") != "tab" and n.attrs.get("aria-pressed") not in ("true", "false"))):
                self.bad(f, "a11y", f"line {n.line}: chip must be a <button> with role=tab or aria-pressed")
        ids = {}
        for n in nodes:
            if n.attrs.get("id"): ids.setdefault(n.attrs["id"], []).append(n.line)
        for i, lines in ids.items():
            if len(lines) > 1: self.bad(f, "links", f"id {i!r} on lines {lines}: ids are unique (a #link lands on the first one only)")
        self.ids[f] = set(ids)
        # controls (operator 2026-09-25: the tools were "only text"; buttons did nothing): what looks clickable acts.
        # A link has a destination; a .btn is an <a href> or a <button> with a declared behaviour; an action the mock
        # cannot perform is <button data-mock="正式版…"> and says so when clicked (partials/page-actions-script.html).
        for n in nodes:
            if n.tag == "a" and n.attrs.get("href", "").strip() in ("", "#"): self.bad(f, "controls", f"line {n.line}: link without a destination")
            if n.has("btn") and n.tag not in ("a", "button"): self.bad(f, "controls", f"line {n.line}: <{n.tag} class=btn> looks clickable and does nothing; use <a href> or <button data-mock>")
            if n.tag == "button" and not any(k in n.attrs for k in BEHAVIOUR) and n.attrs.get("role") != "tab":
                self.bad(f, "controls", f"line {n.line}: <button> without a behaviour ({', '.join(BEHAVIOUR)} or role=tab)")
            for k in ("data-mock", "data-run"):   # a mock action (and a run, which the mock can only show the demo of) says what the product does
                if k in n.attrs and not (n.attrs[k] or "").startswith("正式版"): self.bad(f, "controls", f"line {n.line}: {k} must say what the product will do (start with 正式版)")
        # lesson mentions must be actionable (U15): a link, or a mock action that says where the lesson will come from
        def lesson_text_ok(n):
            # descend while one child still holds the whole phrase; the element where it stops holding together
            # carries the mention and must be an <a> (a phrase split across <b>/<span> inside a non-link is still not a link)
            if n.tag == "a" or (n.tag == "button" and "data-mock" in n.attrs): return
            kids = [c for c in n.elements() if LESSON_PHRASE.search(c.text())]
            if kids:
                for c in kids: lesson_text_ok(c)
            elif LESSON_PHRASE.search(n.text()):
                self.bad(f, "U15", f"line {n.line}: lesson mention that is not a link: {' '.join(n.text().split())[:40]}")
        lesson_text_ok(root)
        anchors = [n for n in nodes if n.tag == "a"]
        # a link that opens a lesson opens a new tab (operator 2026-09-25): the page behind it keeps a half-filled form
        lessons = {mk.ARTIFACT[x] for x in LESSON}
        for n in anchors:
            h = n.attrs.get("href", "")
            to_lesson = h.startswith("https://claude.ai/artifact/") and h[len("https://claude.ai/artifact/"):].partition("#")[0] in lessons
            if (to_lesson or LESSON_PHRASE.search(n.text())) and (n.attrs.get("target") != "_blank" or "noopener" not in (n.attrs.get("rel") or "").split()):
                self.bad(f, "U15", f"line {n.line}: a link to a lesson opens a new tab (target=_blank rel=noopener)")
        for n in anchors:   # every in-page #link lands on an id of this page
            h = n.attrs.get("href", "")
            if h.startswith("#") and len(h) > 1 and h[1:] not in ids: self.bad(f, "links", f"line {n.line}: in-page link {h} has no target on the page")
        self.xlinks[f] = [(n.line, n.attrs["href"]) for n in anchors if n.attrs.get("href", "").startswith("https://claude.ai/artifact/")]
        # a link to a tool's page shows that tool's registry name first, so one tool is never called two things
        try:
            names = {mid: m["name_zh"] for mid, m in mk._catalog().methods.items()}
        except Exception:
            names = {}   # a broken registry is reported by the catalog rules
        for n in anchors:
            h = n.attrs.get("href", "")
            base, _, frag = h.partition("#")
            if frag.startswith("t-") and base in ("", f"https://claude.ai/artifact/{mk.ARTIFACT[HOME[0]]}") and frag[2:] in names \
                    and not " ".join(n.text().split()).startswith(names[frag[2:]]):
                self.bad(f, "links", f"line {n.line}: a link to {frag[2:]}'s page must show its name {names[frag[2:]]!r}")
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

    def check_result(self, f, root, nodes, web=False, lesson=None):
        cards = [n for n in nodes if n.has("card") and not n.has("layer")]
        if not cards: self.bad(f, "§3.10", "no cards"); return
        top, last = cards[0], cards[-1]
        anchors = [n for n in nodes if n.tag == "a" or (web and n.tag == "button")]
        howto = [n for n in anchors if n.has("howto") and (web or n.attrs.get("href", "").startswith("https://claude.ai/artifact/"))]
        if not howto or not howto[0].parent.has("top") or howto[0].parent.parent is not top: self.bad(f, "U15", "header lesson button (.top > a.howto) missing from the first card")
        if not top.find("status"): self.bad(f, "U14", "first card must carry the status strip")
        # U14 (operator 2026-09-25 「講解塞太多…詳解主要放在五分鐘課程裡」): the reading guide lives in exactly one place —
        # its lesson's read tab when the run page has a lesson, else the page's first card; a page that has a lesson
        # carries no teaching block and short strips only. Same rule for the web (`lesson` = the tool's lesson path, from
        # --lesson) as for the mocks (their lesson mock).
        if not web: lesson = LESSON_OF.get(f)
        if lesson is None:
            self.check_scope(f, top, "first card")
            self.check_reading_guide(f, top, "first card")
        else:
            for n in nodes:
                hit = [c for c in TEACHING if n.has(c)]
                if hit: self.bad(f, "U14", f"line {n.line}: .{hit[0]} is teaching; it lives in {lesson}'s read tab, not on the run page")
            want = f"{lesson}#panel-read" if web else mk.artifact_href(lesson, "panel-read")
            if not any(a.attrs.get("href") == want for a in top.find(tag="a")): self.bad(f, "U14", f"first card must link to the lesson's reading tab {want}")
            for n in nodes:
                k = len(" ".join(unicodedata.normalize("NFKC", n.text()).split())) if n.has("how") else 0
                if k > HOW_MAX: self.bad(f, "U14", f"line {n.line}: 怎麼讀 strip has {k} characters (max {HOW_MAX}); the detail goes in the lesson's read tab")
            if not web: self.check_run_form(f, cards, nodes)   # the web form: components/MethodForm.test.tsx
        # the last card = source strip, what approve/return/delete mean, actions, expert mode folded in a <details><pre>
        if not last.find("meta-bar"): self.bad(f, "§3.10", "last card must carry the .meta-bar source strip")
        if not last.find("btns"): self.bad(f, "§3.10", "last card must carry the approve/return actions")
        if not any(d.find(tag="pre") for d in last.find(tag="details")): self.bad(f, "expert", "last card must fold expert mode into <details> with a <pre>")

    def check_scope(self, f, box, where):
        # what the tool can and cannot answer (.can/.cant): the lesson's 認識 tab, or a run page that has no lesson yet
        if not (box.find("can") and box.find("cant")): self.bad(f, "U14", f"{where} must carry 能回答／不能回答 (.can/.cant)")

    def check_reading_guide(self, f, box, where):
        # how to read the result: three reading steps, the 30-second line, the four terms (the lesson's read tab, or a run
        # page that has no lesson yet)
        missing = [x for x, ok in (("three .todo reading steps", any(len(n.find("todo")) >= 3 for n in box.find("todos"))),
                                   ("the 30-second line", "30 秒" in box.text()), ("the 四個詞 .terms line", bool(box.find("terms")))) if not ok]
        if missing: self.bad(f, "U14", f"{where} lacks the reading guide: {', '.join(missing)}")

    def check_run_form(self, f, cards, nodes):
        # the tool page is the fields you fill, then the result (operator 2026-09-25 「完全沒看到可以填表的空格」): the card
        # after the header holds a form.runform; each form is labelled textareas with an example placeholder and one
        # primary [data-run], one [data-fill], one [data-clear]; every later card shows with a result or before one
        # (data-when, driven by partials/run-form-script.html); #result is where a run lands
        if len(cards) < 2 or not cards[1].find("runform", tag="form"): self.bad(f, "U14", "the card after the header must hold the input form (form.runform)")
        forms = [n for n in nodes if n.tag == "form" and n.has("runform")]
        def states(n):   # where n is visible: every data-when on n or an ancestor must match (nested ones intersect); any
            s = {"result", "empty"}   # other [hidden] ancestor hides it in both, since the script only toggles data-when
            for a in [n, *self._ancestors(n)]:
                if "data-when" in a.attrs: s &= {a.attrs["data-when"]}
                elif "hidden" in a.attrs: return set()
            return s
        shown = set()   # a form counts in a state only when all of its fields show there
        for fm in forms:
            ts = fm.find(tag="textarea")
            shown |= set.intersection(*(states(t) for t in ts)) if ts else set()
        if shown != {"result", "empty"}: self.bad(f, "U14", f"fields must be visible in both states (saved run, no result yet); a run form shows only in {sorted(shown) or 'neither'}")
        for fm in forms:
            labels = {x.attrs.get("for") for x in fm.find(tag="label")}
            ts, kinds = fm.find(tag="textarea"), {k: [b for b in fm.find(tag="button") if k in b.attrs] for k in ("data-run", "data-fill", "data-clear")}
            if not ts or any(t.attrs.get("id") not in labels or not (t.attrs.get("placeholder") or "").strip() for t in ts) \
                    or any(len(v) != 1 for v in kinds.values()) or not kinds["data-run"][0].has("primary"):
                self.bad(f, "U14", f"line {fm.line}: a run form = labelled textareas with an example placeholder + one primary [data-run], one [data-fill], one [data-clear]")
        for c in cards[2:]:
            if c.attrs.get("data-when") not in ("result", "empty"): self.bad(f, "U14", f"line {c.line}: a card after the form shows with a result or before one (data-when=result|empty)")
        for n in nodes:
            w = n.attrs.get("data-when")
            if w is not None and (w not in ("result", "empty") or ("hidden" in n.attrs) != (w == "empty")):
                self.bad(f, "U14", f"line {n.line}: data-when=result starts shown, data-when=empty starts hidden (the saved run is the page's default)")
        if not any(n.attrs.get("id") == "result" and n.attrs.get("data-when") == "result" and n.has("card") for n in nodes):
            self.bad(f, "U14", "one result card carries id=result (a run from the empty state lands there)")

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
        # U15 (operator 2026-09-25 「開始填我的案例…重點中的重點，卻非常不顯眼」「用 Tab 方式安排不同性質的內容，之後其他的工具
        #以這個為範本」): main = header → the start card (.card.cta#start, above everything) → the domain chips (they drive
        # every tab) → the tab row (mockkit.LESSON_TABS) → one panel per tab; every other card sits inside a panel
        run = RUN_OF[f]
        start = [n for n in nodes if n.attrs.get("id") == "start"]
        if len(start) != 1 or not (start[0].has("card") and start[0].has("cta")) or not any(x.tag == "h2" and "開始" in x.text() for x in start[0].walk()):
            self.bad(f, "U15", "id=start must be the .card.cta whose h2 says 開始")
            start = []
        else:  # preparation list + exactly three buttons: your own case (primary, lands on the empty fields) / the demo / is this for me
            st = start[0]
            if not any(len(u.find(tag="li")) >= 3 for u in st.find("check", tag="ul")): self.bad(f, "U15", "start step needs a ul.check with at least three items")
            bs = st.find("btn")   # every button in the card, not one row: a second primary anywhere in it breaks "only"
            if len(bs) != 3: self.bad(f, "U15", "start step needs exactly three buttons")
            elif not (bs[0].tag == "a" and bs[0].has("primary") and bs[0].attrs.get("href") == mk.artifact_href(run, "new") and bs[0].text().strip().startswith("開始")) \
                    or bs[1].attrs.get("href") != mk.artifact_href(run, "demo") or any(b.has("primary") for b in bs[1:]):
                self.bad(f, "U15", f"the start card's only primary button is the first, 開始… linking to {mk.artifact_href(run, 'new')}; the second links to the demo (#demo)")
        main = next((n for n in nodes if n.tag == "main"), None)
        kids = main.elements() if main else []
        want = [t for t, _, _ in mk.LESSON_TABS[mk.LESSON_KIND[f]]]
        row = [k for k in kids if k.has("tabs")]
        chips = [k for k in kids if k.has("chips")]
        panels = [k for k in kids if k.tag == "section" and k.has("tabpanel")]
        if not (start and len(row) == 1 and len(chips) == 1 and start[0] in kids
                and kids.index(start[0]) < kids.index(chips[0]) < kids.index(row[0]) < min((kids.index(p) for p in panels), default=len(kids))):
            self.bad(f, "U15", "main holds the start card, then the domain chips, then the tab row, then the panels (the chips drive every tab)")
        if [p.attrs.get("id") for p in panels] != [f"panel-{t}" for t in want] \
                or any(p.attrs.get("role") != "tabpanel" or p.attrs.get("aria-labelledby") != f"tab-{t}" or ("hidden" in p.attrs) != (i > 0) for i, (p, t) in enumerate(zip(panels, want))):
            self.bad(f, "U15", f"one section.tabpanel#panel-<id> per tab, in order {want}, role=tabpanel, aria-labelledby=tab-<id>, only the first visible")
        loose = [n for n in nodes if n.has("card") and n not in start and not any(p in panels for p in self._ancestors(n))]
        if loose: self.bad(f, "U15", f"line {loose[0].line}: a lesson card outside the tab panels (only the start card sits above the tabs)")
        by = {p.attrs.get("id", "")[len("panel-"):]: p for p in panels}
        def holds(tid, h2):
            return tid in by and any(n.has("card") and any(x.tag == "h2" and h2 in x.text() for x in n.walk()) for n in by[tid].walk())
        if not (holds("teach", "教材版") and holds("sources", "課程來源")): self.bad(f, "U15", "the 教材版 card sits in panel-teach and the 課程來源 card in panel-sources")
        if "learn" in by: self.check_scope(f, by["learn"], "the 認識 tab")
        if "read" in by: self.check_reading_guide(f, by["read"], "the read tab")
        status = [n for n in nodes if n.has("status")]
        if status and "教材版" not in status[0].text(): self.bad(f, "U15", "status strip must point to the 教材版 tab")
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
        # The home page serves people who do NOT know the tool names (operator 2026-09-24, twice): situation first
        # (U16 box + example situations), then plain-language goal questions, a few start-here tools with a picture,
        # the demo projects (U9), the workflows, and only then all tools with the name search. Every list is generated
        # from the registries (partials) and must show exactly what the registries hold.
        def under(n, pred):
            a = n.parent
            while a is not None:
                if pred(a): return True
                a = a.parent
            return False
        by_id = {n.attrs.get("id"): n for n in nodes if n.attrs.get("id")}
        try:
            cat = mk._catalog(); loaded = True   # one parse per run (mockkit caches it)
        except Exception as e:
            self.bad(f, "catalog", f"registries: {type(e).__name__}: {e}"); loaded = False
        if loaded:   # load_catalog guarantees non-empty, fully labelled registries; the page must show exactly them
            methods, recipes, goals = cat.methods, cat.recipes, cat.goals
            n_tools, n_user, n_internal = mk.counts(cat)
            tools, wfs = [n for n in nodes if n.has("tool")], [n for n in nodes if n.has("wf")]
            if len(tools) != n_tools: self.bad(f, "catalog", f"{len(tools)} tool rows on the page, {n_tools} methods in {mk.METHODS_FILE.name}")
            if len(wfs) != len(recipes): self.bad(f, "catalog", f"{len(wfs)} workflow cards on the page, {len(recipes)} ACTIVE recipes in {mk.RECIPES_DIR.name}/")
            internal = by_id.get("wf-internal")
            if n_internal and (internal is None or internal.tag != "details" or "open" in internal.attrs or len(internal.find("wf")) != n_internal):
                self.bad(f, "catalog", f"the {n_internal} platform-internal workflows must sit folded (closed) in details#wf-internal")
            if sum(n.has("goal") and n.has("mcard") for n in nodes) != len(goals["goals"]): self.bad(f, "catalog", f"goal cards != {len(goals['goals'])} goals in {mk.GOALS_FILE.name}")
            if sum(n.tag == "details" and "data-dir" in n.attrs for n in nodes) != len(goals["goals"]): self.bad(f, "catalog", "directory folds (details[data-dir]) != goals")
            # every tool has its own page (section#tool, a sub-view of 工具) and its directory row opens it
            tool_view, pages = by_id.get("tool"), [n for n in nodes if n.tag == "article" and n.has("tpage")]
            if tool_view is None or tool_view.attrs.get("data-under") != "tools" or len(pages) != n_tools \
                    or {p.attrs.get("id") for p in pages} != {f"t-{mid}" for mid in methods} \
                    or any("hidden" not in p.attrs or not under(p, lambda a: a is tool_view) for p in pages):
                self.bad(f, "catalog", f"section#tool[data-under=tools] must hold one hidden article.tpage#t-<id> per tool ({n_tools})")
            for row in tools:
                links = row.find(tag="a")
                if len(links) != 1 or links[0].attrs.get("href") != "#t-" + row.attrs.get("id", "")[2:]:
                    self.bad(f, "catalog", f"line {row.line}: a tool row opens its own page: exactly one link, to #t-<its id>")
            pops = [n for n in nodes if n.has("pop") and n.has("mcard")]
            if len(pops) != len(goals["popular"]) or any(not n.find("shape", tag="svg") for n in pops):
                self.bad(f, "catalog", f"start-here cards != {len(goals['popular'])} popular tools, each with its picture (svg.shape)")
            if sum("data-prompt" in n.attrs for n in nodes) != len(goals["prompts"]): self.bad(f, "U16", f"example situation buttons != {len(goals['prompts'])} prompts in {mk.GOALS_FILE.name}")
            ms = [x.groups() for x in re.finditer(r"(\d+) 個思考工具、(\d+) 條工作流\(另 (\d+) 條平台維運用\)", self.texts.get(f, ""))]
            if [tuple(map(int, g)) for g in ms] != [(n_tools, n_user, n_internal)]:   # exactly one, and it is right
                self.bad(f, "catalog", f"hero sentence must appear once and state {n_tools} 個思考工具、{n_user} 條工作流（另 {n_internal} 條平台維運用）, found {ms}")
        # U16: one box, its example situations and a worked example of the three suggestions, all in the same card
        ask = [n for n in nodes if n.tag == "textarea"]
        if len(ask) != 1 or ask[0].attrs.get("id") != "ask": self.bad(f, "U16", "home carries exactly one 說你卡在哪 textarea (id=ask)")
        else:
            card = ask[0].parent
            while card is not None and not card.has("card"): card = card.parent
            ok = card is not None and any(n.attrs.get("id") == "prompts" for n in card.walk()) \
                and any(len(ms.find("mcard")) >= 3 for ms in card.find("mcards"))
            if not ok: self.bad(f, "U16", "the 說你卡在哪 card must hold the example situations (#prompts) and a worked example of three suggestions (.mcards with 3 .mcard)")
        # U9: the demo projects card
        demo = [n for n in nodes if n.has("card") and any(x.tag == "h2" and "示範專案" in x.text() for x in n.walk())]
        if len(demo) != 1 or len([x for x in demo[0].find("mcard") if x.has("done")]) < 2 or not under(demo[0], lambda a: a.attrs.get("data-view") == "projects"):
            self.bad(f, "U9", "one 示範專案 card with at least two finished (.mcard.done) projects, in the projects view")
        # U1: the four menu destinations are the four views, in menu order; the first shows, the others wait hidden
        views = [n for n in nodes if n.tag == "section" and "data-view" in n.attrs]
        top = [v for v in views if "data-under" not in v.attrs]
        if [v.attrs["data-view"] for v in top] != [x["id"] for x in mk.NAV] or any(v.attrs.get("id") != v.attrs["data-view"] for v in top) \
                or "hidden" in top[0].attrs or not all("hidden" in v.attrs for v in top[1:]):
            self.bad(f, "U1", f"views must be section#<id>[data-view=<id>] in menu order {[x['id'] for x in mk.NAV]}, the first visible, the others hidden")
        # a sub-view (the tool pages) sits after the menu views, hidden, under one menu item (the menu keeps it current)
        if views[:len(top)] != top or any(v.attrs["data-under"] not in {x["id"] for x in mk.NAV} or "hidden" not in v.attrs
                                          or v.attrs.get("id") != v.attrs["data-view"] for v in views[len(top):]):
            self.bad(f, "U1", "a sub-view is section#<id>[data-view=<id>][data-under=<menu item>], hidden, after the menu views")
        def in_view(n, v): return under(n, lambda a: a.attrs.get("data-view") == v)
        for i, v in (("ask", "home"), ("goals", "home"), ("featured", "home"), ("directory", "tools"), ("wf-internal", "workflows")):
            if i in by_id and not in_view(by_id[i], v): self.bad(f, "U1", f"#{i} belongs in the {v} view")
        search = [n for n in nodes if n.tag == "input" and n.attrs.get("type") == "search"]
        if len(search) != 1 or search[0].attrs.get("id") != "q" or not under(search[0], lambda a: a.attrs.get("id") == "directory"):
            self.bad(f, "U1", "exactly one search box (input type=search id=q), inside the #directory card")
        tables = [n for n in nodes if n.tag == "table"]
        if len(tables) != 1 or not in_view(tables[0], "projects"): self.bad(f, "U8", "the project table sits in the projects view")
        # U2: the six-step strip, counted outside the generated workflow cards (each carries its own .journey)
        own_journeys = [n for n in nodes if n.has("journey") and not under(n, lambda a: a.has("wf"))]
        if len(own_journeys) != 1: self.bad(f, "U2", "exactly one six-step .journey strip outside the workflow cards")

RESULT_SECTIONS = [str(n) for n in range(10)] + ["approve"]   # header, ① … ⑨, the approve card (mock order)


def check_web_result(path, lesson=None, parity=False, mock_path=None):
    """Apply the mock's result-page rules (check_result, lesson-aware) and its card order to rendered web HTML; with
    ``parity`` (a full iceberg result), every card's headings, labels, captions and buttons against the mock's."""
    source = pathlib.Path(path)
    try:
        html = source.read_text(encoding="utf-8")
        dom = Dom(); dom.feed(html); dom.close()
    except (OSError, UnicodeError, ValueError) as error:
        return [f"{source}: [parse] {error}"]
    problems = [f"{source}: [parse] {error}" for error in dom.err]
    nodes = list(dom.root.walk())
    checker = Checker(mk.HERE)
    checker.check_result(source.name, dom.root, nodes, web=True, lesson=lesson)
    problems.extend(checker.findings)
    sections = [node for node in nodes if "data-section" in node.attrs]
    got = [node.attrs["data-section"] for node in sections]
    if got != RESULT_SECTIONS: problems.append(f"{source}: [result-sections] expected {RESULT_SECTIONS}, got {got}")
    for node in sections:
        if node.attrs["data-section"] != "approve" and not node.find("how"): problems.append(f"{source}: [result-howto] card {node.attrs['data-section']} needs 怎麼讀／你要做的 (.how)")
    # Codex 2026-09-26: a data-visual anywhere used to count; the picture is card 2's, and it is a drawing (svg/table/dl/pre)
    card2 = next((node for node in sections if node.attrs["data-section"] == "2"), None)
    visuals = [node for node in (card2.walk() if card2 else []) if node.attrs.get("data-visual")]
    if not visuals or not any(node.tag in ("svg", "table", "dl", "pre") for node in [visuals[0], *visuals[0].walk()]): problems.append(f"{source}: [result-visual] card 2 must hold the tool's picture (a data-visual element that draws: svg, table, dl or pre)")
    for visual in (node for node in nodes if node.attrs.get("data-visual") == "layered"):   # a picture, and the iceberg's own for the iceberg
        pictures = [node for node in visual.walk() if node.tag == "svg" and node.attrs.get("role") == "img" and node.attrs.get("aria-label")]
        if not pictures: problems.append(f"{source}: [result-visual] a layered picture needs an svg role=img with aria-label")
        elif visual.attrs.get("data-method") == "systems.iceberg_model" and pictures[0].attrs["aria-label"] != "冰山模型四層圖": problems.append(f"{source}: [result-visual] layered iceberg SVG missing")
    if not any(node.has("next-steps") for node in nodes): problems.append(f"{source}: [result-next] next-step cards container missing")
    for anchor in (node for node in nodes if node.tag == "a" and node.attrs.get("href", "").startswith("#citation-")):
        target = anchor.attrs["href"][1:]
        if not any(node.attrs.get("id") == target and node.attrs.get("data-source") for node in nodes): problems.append(f"{source}: [result-citation] {target} lacks manifest source")
    if parity:
        if card2 is None or not any(node.attrs.get("data-method") == "systems.iceberg_model" for node in card2.walk()):
            problems.append(f"{source}: [parity] not applicable: rendered page is not systems.iceberg_model")
        else:
            problems.extend(f"{source}: [parity] {finding}" for finding in check_parity(mock_path or (mk.HERE / "iceberg-result-mock.html"), dom.root))
    return problems


# ---------------- parity: the mock's result page, card by card, against the rendered one ----------------
# Operator 2026-09-27: hand-written comparisons kept missing things. This reads both pages and compares what does not
# depend on the case: every card's heading, its 怎麼讀 strip, sub-headings, row labels, table headers, figure captions,
# buttons and action links, and the structural pieces a card must carry. Model-written text is the one thing it skips.
# Numbers and Chinese numerals read as N (三條路 = 兩條路). PARITY_ALIASES lists the deliberate differences in words.
_NUMERAL_RE = re.compile(r"[0-9０-９]+|[一兩二三四五六七八九十]+(?=[個條層次張段天週步])")   # 步: 把建議的兩步／一步串成一條工作流 (⑧, count of next steps)
PARITY_ALIASES = {
    # the web schedules a rerun as a reminder (the rerun needs the numbers you bring), so it does not say 自動; without a
    # horizon in days it says 到期
    "N 天後自動重跑本分析並比較": {"N 天後重跑本分析並比較", "到期重跑本分析並比較"},
    # with one next step the web says 下一步 where the mock's case had two
    "把建議的N步串成N條工作流,N次跑完每一步停下來給你確認,順序可以改": {"把建議的下N步串成N條工作流,N次跑完每一步停下來給你確認,順序可以改"},
}
PARITY_CARDS = ["header", "input", "1", "2", "3", "4", "5", "6", "7", "8", "9", "approve"]   # the mock's order; the mock's empty-state card has no web twin with a result
PARITY_MUST_HAVE = {   # class or tag a card must carry, beyond what the mock's text says
    "header": ["status", "how"], "input": ["how", "runform"], "1": ["finding", "judge"], "2": ["thick", "legend"], "3": ["charts", "figure", "read"],
    "4": ["layer", "head", "row"], "5": ["finding"], "6": ["table"], "7": ["table", "finding", "kpis", "kpi"], "8": ["journey", "mcards", "mcard"], "9": ["src"], "approve": ["meta-bar", "details", "pre"],
}


def _norm(text):
    text = " ".join(unicodedata.normalize("NFKC", text).replace("↗", "").split())
    return _NUMERAL_RE.sub("N", text)


def _stem(text, cut="：（("):
    """The text up to its first colon or bracket (a heading without its case-specific part)."""
    text, cut = _norm(text), unicodedata.normalize("NFKC", cut)   # the page and the mock write ： and （ full-width; _norm folds them
    cuts = [text.find(c) for c in cut if c in text]
    stem = text[:min(cuts)].strip() if cuts else text
    return stem or text   # a text that opens with a bracket (（示意）…) keeps its whole self rather than collapsing to ""


def _parity_cards(root, web):
    """The cards to compare, keyed as PARITY_CARDS: the mock's top-level result cards in order; the web's by data-section (input = #input)."""
    if web:
        cards = {n.attrs["data-section"]: n for n in root.walk() if "data-section" in n.attrs}
        cards["header"] = cards.pop("0", None)
        cards["input"] = next((n for n in root.walk() if n.attrs.get("id") == "input"), None)
        return cards
    tops = [n for n in root.walk() if n.has("card") and not n.has("layer") and not any(a.has("card") for a in _ancestors(n))]
    tops = [n for n in tops if n.attrs.get("data-when") != "empty"]
    return dict(zip(PARITY_CARDS, tops))


def _ancestors(n):
    while n.parent is not None:
        n = n.parent
        yield n


def _shown(n):
    return not any("hidden" in a.attrs for a in [n, *_ancestors(n)])


def _card_outline(card, key):
    """What must match: heading, 怎麼讀 strip, h3 stems, row labels, table headers, figure captions, buttons and action links."""
    out = {}
    h = next((n for n in card.walk() if n.tag in ("h1", "h2") and _shown(n)), None)
    heading = h.text() if h is not None else ""
    out["heading"] = _stem(heading, "：") if key in ("header",) else _norm(heading)
    how = next((n for n in card.walk() if n.has("how") and _shown(n)), None)
    out["how"] = _norm(how.text()) if how is not None else ""
    out["h3"] = sorted({m.group(0) for n in card.find(tag="h3") if _shown(n) for m in [re.match(r"^[A-C]\.|^第 N 層/N", _norm(n.text()))] if m})
    out["rows"] = sorted({_norm(b.text()) for r in card.find("row") if _shown(r) for b in r.elements()[:1] if b.tag == "b"})
    out["th"] = sorted({tuple(_norm(th.text()) for th in t.find(tag="th")) for t in card.find(tag="table") if _shown(t)})
    out["figures"] = sorted({_stem(b.text(), "：") for f in card.find(tag="figcaption") if _shown(f) for b in f.find(tag="b")[:1]})
    out["actions"] = sorted({_stem(n.text(), "？") for n in card.walk() if _shown(n) and (n.tag == "button" or (n.tag == "a" and n.has("btn")))})
    return out


def check_parity(mock_path, web_root):
    """-> findings: every way the rendered page's cards differ from the mock's, by card; empty when they agree."""
    try:
        dom = Dom(); dom.feed(pathlib.Path(mock_path).read_text(encoding="utf-8")); dom.close()
    except (OSError, UnicodeError, ValueError) as error:
        return [f"mock unreadable: {error}"]
    mock_cards, web_cards = _parity_cards(dom.root, False), _parity_cards(web_root, True)
    findings = []
    mock_tops = [n for n in dom.root.walk() if n.has("card") and not n.has("layer") and not any(a.has("card") for a in _ancestors(n))]
    mock_tops = [n for n in mock_tops if n.attrs.get("data-when") != "empty"]
    if len(mock_tops) != len(PARITY_CARDS):
        findings.append(f"mock card count {len(mock_tops)} != expected {len(PARITY_CARDS)}")
    for key in PARITY_CARDS:
        mock, web = mock_cards.get(key), web_cards.get(key)
        if mock is None: findings.append(f"card {key}: missing in the mock"); continue
        if web is None: findings.append(f"card {key}: missing on the page"); continue
        a, b = _card_outline(mock, key), _card_outline(web, key)
        if a["heading"] != b["heading"]: findings.append(f"card {key}: heading {b['heading']!r} != mock {a['heading']!r}")
        if a["how"] != b["how"]: findings.append(f"card {key}: 怎麼讀 strip {b['how']} != mock {a['how']}")
        for field, what in (("h3", "sub-heading"), ("rows", "row label"), ("figures", "figure caption")):
            for item in sorted(set(a[field]) - set(b[field])): findings.append(f"card {key}: {what} {item!r} missing on the page")
        for item in sorted(set(a["th"]) - set(b["th"])): findings.append(f"card {key}: table header {list(item)} missing on the page")
        for item in sorted(set(a["actions"]) - set(b["actions"])):
            if not (PARITY_ALIASES.get(item, set()) & set(b["actions"])): findings.append(f"card {key}: button/link {item!r} missing on the page")
        for need in PARITY_MUST_HAVE.get(key, []):
            if not any((n.has(need) or n.tag == need) and _shown(n) for n in web.walk()): findings.append(f"card {key}: .{need} missing on the page")
    return findings


def main(argv):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    parity = "--parity" in argv
    argv = [a for a in argv if a != "--parity"]
    mock_path = None
    if "--mock" in argv:
        index = argv.index("--mock")
        if index + 1 >= len(argv):
            print("usage: check-mocks.py [--dir <folder>] | --page result <html> [--lesson <path>] [--mock <mock.html>] [--parity]"); return 2
        mock_path = argv[index + 1]
        argv = argv[:index] + argv[index + 2:]
    if len(argv) in (3, 5) and argv[:2] == ["--page", "result"] and (len(argv) == 3 or argv[3] == "--lesson"):
        findings = check_web_result(argv[2], argv[4] if len(argv) == 5 else None, parity=parity, mock_path=mock_path)
        if findings:
            print("\n".join(findings)); print(f"{len(findings)} finding(s)"); return 1
        print("check-mocks: rendered result page green"); return 0
    folder = mk.HERE
    if len(argv) == 2 and argv[0] == "--dir": folder = pathlib.Path(argv[1])
    elif argv: print("usage: check-mocks.py [--dir <folder>] | --page result <html> [--lesson <path>] [--mock <mock.html>] [--parity]"); return 2
    findings = Checker(folder).run()
    if findings:
        print("\n".join(findings)); print(f"{len(findings)} finding(s)"); return 1
    print(f"check-mocks: {len(FILES)} pages, shared block identical, all rules green"); return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
