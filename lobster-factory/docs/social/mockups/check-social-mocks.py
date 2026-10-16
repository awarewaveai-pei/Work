#!/usr/bin/env python3
"""Design gate for the social-manager mockups (lobster-factory/docs/social/mockups/*-mock.html).
Run:  python lobster-factory/docs/social/mockups/check-social-mocks.py            # exit 0 = every page obeys the rules
      python lobster-factory/docs/social/mockups/check-social-mocks.py --selftest # each mutation must raise ITS rule's code
Rules (operator, 2026-09-24 .. 2026-10-14), each finding starts with its [code]:
  [select] no dropdowns, in markup or created by script   [tab] no tab roles: one picture, detail beside it
  [style] the page has CSS   [markers]/[theme-drift] the app block is there once and equals next-admin globals.css now
  [palette] no second palette (dark block / data-theme): the app's theme editor owns colours
  [token-name]/[token-scope] the mock may declare only LOCAL_TOKENS, only on :root; app tokens are never redefined
  [fs-unit]/[fs-min]/[font-size]/[font] type sizes are --fs-* tokens in px; body and headings >= 14px, labels >= 12px
  [colour]/[inline-colour]/[svg-colour] no colour of the mock's own (hex, functions, named); platform marks are app tokens
    (--p-* in globals.css since 2026-10-15, so the product page and the mock read the same ones)
  [inline-font] no font sizes in style="" attributes    [sample] the page says it is a 樣稿
  [action] the four post actions are real buttons        [tags]/[unclosed]/[self-close] markup balances
  rendered (measure-mock.mjs, Playwright at 1280x660; C13 / GAP_REPORT U1, U3):
  [chips] at most CHIP_MAX pill-shaped boxes on any one screen (opening screen + every [data-view])
  [card-thumb] every week card has a thumbnail element (.cthumb), and the opening week shows cards at all
  [render] the page could not be measured or threw a script error (not a pass)
Notes (printed, not findings): font sizes under 14px inside the copied app block — the app's own values, changed in globals.css.
CSS is parsed by sync-app-theme.py (rules/declarations); markup by html.parser. A page that cannot be read is a finding."""
import html.parser, importlib.util, json, pathlib, re, subprocess, sys, tempfile

sys.dont_write_bytecode = True   # the sync module is loaded by path; a stale .pyc from a same-second edit would be reused
HERE = pathlib.Path(__file__).resolve().parent
PAGES = sorted(HERE.glob("*-mock.html"))
_spec = importlib.util.spec_from_file_location("sync_app_theme", HERE / "sync-app-theme.py")
sync = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(sync)
_pspec = importlib.util.spec_from_file_location("preview_server", HERE / "preview-server.py")
preview = importlib.util.module_from_spec(_pspec); _pspec.loader.exec_module(preview)   # the skeleton the publisher adds

VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}
SVG_SELF = {"path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "use", "stop"}
ACTIONS = ["存草稿", "送審", "排程", "立即發佈"]
TYPE_TOKENS = {"--fs-h1": 14, "--fs-h2": 14, "--fs-body": 14, "--fs-tag": 12}       # name -> minimum px
LAYOUT_TOKENS = {"--ed-w", "--av", "--thumb-h"}   # editor width, account avatar, week-card thumbnail height
CHIP_MAX = 20   # pills on one screen (U1: before v14 there were ~60)
LOCAL_TOKENS = set(TYPE_TOKENS) | LAYOUT_TOKENS
COLOUR_FN = re.compile(r"\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix|color)\s*\(", re.I)
HEX = re.compile(r"#[0-9a-fA-F]{3,8}\b")
NAMED = set("""aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood
cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen
darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray
darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia
gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender
lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink
lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon
mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise
mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid
palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red
rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow
springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen""".split())
PX = re.compile(r"^\s*(\d+(?:\.\d+)?)px\s*$")


def colour_in(value: str) -> str | None:
    """The first colour literal in a CSS value (var(...) references and quoted strings ignored), else None."""
    v = re.sub(r"var\([^()]*\)", " ", re.sub(r"\"[^\"]*\"|'[^']*'", " ", value))
    m = HEX.search(v) or COLOUR_FN.search(v)
    if m:
        return m.group(0)
    for w in re.findall(r"[A-Za-z]+", v):
        if w.lower() in NAMED:
            return w
    return None


def check_decls(where: str, decls, out: list, inline: bool, tokens: dict) -> None:
    for prop, val in decls:
        p = prop.lower()
        if prop.startswith("--"):
            if inline:
                out.append(f"[token-scope] {where}: custom property {prop} in a style attribute")
            continue  # declared tokens are checked in token_findings
        c = colour_in(val)
        if c:
            out.append(f"[{'inline-colour' if inline else 'colour'}] {where}: {prop}:{val[:40]} uses colour {c}; take an app token")
        if p == "font-size":
            m = re.fullmatch(r"\s*var\(\s*(--fs-[A-Za-z0-9-]+)\s*\)\s*", val)
            if inline:
                out.append(f"[inline-font] {where}: font-size in a style attribute")
            elif val.strip() != "inherit" and not m:
                out.append(f"[font-size] {where}: font-size '{val}' is not a --fs-* token")
            elif m and m.group(1) not in tokens:
                out.append(f"[font-size] {where}: {m.group(1)} is not declared")
        elif p == "font":
            if inline:
                out.append(f"[inline-font] {where}: font shorthand in a style attribute")
            elif val.strip() != "inherit" and "var(--fs-" not in val:
                out.append(f"[font] {where}: font shorthand '{val[:40]}' sets its own size; use font-size:var(--fs-*)")


def token_findings(rules_: list, out: list) -> dict:
    """Validate every custom-property declaration in the mock's own CSS; return the --fs-* tokens as {name: px}."""
    fs = {}
    for sel, body, _, _ in rules_:
        root = sel == ":root" or (sel.startswith("@media") and sel.endswith("» :root"))  # a breakpoint may resize layout/type
        for prop, val in sync.declarations(body):
            if not prop.startswith("--"):
                continue
            if prop not in LOCAL_TOKENS:
                out.append(f"[token-name] {sel}: {prop} is not a mock-local token (layout, type); app tokens live in globals.css")
                continue
            if not root:
                out.append(f"[token-scope] {sel}: {prop} redefined outside :root")
                continue
            if prop in TYPE_TOKENS:
                m = PX.match(val)
                if not m:
                    out.append(f"[fs-unit] {prop}:{val} — type tokens are px")
                    continue
                px = float(m.group(1))
                if sel == ":root":
                    fs[prop] = px
                if px < TYPE_TOKENS[prop]:
                    out.append(f"[fs-min] {prop} is {val}; the minimum is {TYPE_TOKENS[prop]}px")
            elif prop in LAYOUT_TOKENS and colour_in(val):
                out.append(f"[colour] {prop} holds a colour")
    for t in TYPE_TOKENS:
        if t not in fs:
            out.append(f"[fs-unit] {t} is not declared on :root")
    return fs


class Markup(html.parser.HTMLParser):
    def __init__(self, out: list):
        super().__init__(convert_charrefs=True)
        self.out, self.stack, self.buttons, self.btn, self.depth_btn = out, [], [], [], 0
        self.text, self.scripts, self.styles, self.mode = [], [], [], None

    def _attrs(self, tag, attrs):
        a = {k.lower(): (v or "") for k, v in attrs}
        if tag == "select":
            self.out.append("[select] <select> in markup; use visible buttons")
        if a.get("role", "").strip().lower() in ("tab", "tablist", "tabpanel"):
            self.out.append(f"[tab] role=\"{a['role']}\" on <{tag}>; show the whole picture, detail beside it")
        if "style" in a:
            check_decls(f"<{tag} style>", sync.declarations(a["style"]), self.out, True, {})
        for k in ("fill", "stroke", "color", "stop-color", "flood-color", "bgcolor"):
            if k in a and colour_in(a[k]):
                self.out.append(f"[svg-colour] <{tag} {k}=\"{a[k]}\">; take an app token")

    def handle_starttag(self, tag, attrs):
        self._attrs(tag, attrs)
        if tag in ("script", "style"):
            self.mode = tag; (self.scripts if tag == "script" else self.styles).append("")
        if tag == "button":
            self.depth_btn += 1
            if self.depth_btn == 1:
                self.btn = []
        if tag not in VOID:
            self.stack.append((tag, self.getpos()[0]))

    def handle_startendtag(self, tag, attrs):
        self._attrs(tag, attrs)
        if tag not in VOID and tag not in SVG_SELF:
            self.out.append(f"[self-close] <{tag}/> at line {self.getpos()[0]}: the browser keeps it open")

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.mode = None
        if tag == "button" and self.depth_btn:
            self.depth_btn -= 1
            if not self.depth_btn:
                self.buttons.append(" ".join("".join(self.btn).split()))
        if tag in VOID:
            return
        if not self.stack or self.stack[-1][0] != tag:
            open_ = self.stack[-1] if self.stack else ("none", 0)
            self.out.append(f"[tags] </{tag}> at line {self.getpos()[0]} but the open tag is <{open_[0]}> from line {open_[1]}")
            if any(t == tag for t, _ in self.stack):
                while self.stack and self.stack[-1][0] != tag:
                    self.stack.pop()
                self.stack.pop()
            return
        self.stack.pop()

    def handle_data(self, data):
        if self.mode == "script":
            self.scripts[-1] += data
        elif self.mode == "style":
            self.styles[-1] += data
        else:
            self.text.append(data)
            if self.depth_btn:
                self.btn.append(data)


def findings(name: str, page: str, want: str | None = None) -> list[str]:
    out: list[str] = []
    mk = Markup(out)
    mk.feed(page); mk.close()
    for t, line in mk.stack:
        out.append(f"[unclosed] <{t}> from line {line} is never closed")
    script = "\n".join(mk.scripts)
    if re.search(r"createElement\(\s*['\"`]select['\"`]", script) or re.search(r"<select\b", script, re.I):
        out.append("[select] the script builds a <select>; use visible buttons")
    if re.search(r"role\s*=\s*['\"]tab(list|panel)?['\"]", script, re.I):
        out.append("[tab] the script renders a tab role")
    style = "\n".join(mk.styles)
    if not style.strip():
        out.append("[style] no <style> block"); return [f"{name}: {f}" for f in out]
    loc = sync.locate(page)
    want = want if want is not None else sync.render()
    if isinstance(loc, str):
        out.append(f"[markers] {loc}; the colours must come from the app (sync-app-theme.py)")
        rest = style
    else:
        have = page[loc[0]:loc[1]]
        if have != want:
            out.append("[theme-drift] app-theme block differs from next-admin globals.css; run sync-app-theme.py")
        rest = style.replace(have, "")
    if re.search(r"prefers-color-scheme|data-theme", sync.strip_comments(rest)):
        out.append("[palette] a second palette (dark block / data-theme); the app's theme editor owns colours")
    rs = sync.rules(rest)
    tokens = token_findings(rs, out)
    for sel, body, _, _ in rs:
        if sel == ":root" or sel.endswith("» :root"):
            continue  # token blocks: token_findings
        check_decls(sel, sync.declarations(body), out, False, tokens)
    if "樣稿" not in "".join(mk.text):
        out.append("[sample] the page must say, in visible text, that it is a 樣稿 (sample data, nothing is sent)")
    for a in ACTIONS:
        if a not in mk.buttons:
            out.append(f"[action] no <button> labelled '{a}'")
    return [f"{name}: {f}" for f in out]


def app_notes(want: str) -> list[str]:
    notes = []
    for sel, body, _, _ in sync.rules(want):
        for prop, val in sync.declarations(body):
            m = PX.match(val) if prop.lower() == "font-size" else None
            if m and float(m.group(1)) < 14:
                notes.append(f"note: app {sel} font-size {val} is under 14px — the app's own value; change it in globals.css (TASKS)")
    return notes


def render_findings(pages: dict[str, str]) -> dict[str, list[str]]:
    """{name: page source} -> {name: findings} from measure-mock.mjs; one browser for all pages. No result = a finding."""
    out = {n: [] for n in pages}
    with tempfile.TemporaryDirectory() as tmp:
        files = {}
        for i, (n, src) in enumerate(pages.items()):
            f = pathlib.Path(tmp) / f"p{i}.html"
            f.write_bytes((preview.SKELETON_HEAD + src + "</body></html>").encode("utf-8"))
            files[str(f)] = n
        try:
            r = subprocess.run(["node", str(HERE / "measure-mock.mjs"), *files], capture_output=True, timeout=300,
                               encoding="utf-8", errors="replace")
            rows = []
            for x in r.stdout.splitlines():
                if x.startswith("{"):
                    try:
                        rows.append(json.loads(x))
                    except ValueError:
                        for n in out:
                            out[n].append(f"[render] unreadable measurement line: {x[:80]}")
        except Exception as e:
            rows, r = [], None
            for n in out:
                out[n].append(f"[render] cannot run measure-mock.mjs: {e!r}")
        got = set()
        for row in rows:
            n = files.get(row.get("file", ""))
            if n is None:
                continue
            got.add(n)
            if "error" in row:
                out[n].append(f"[render] {row['error'][:120]}"); continue
            for e in row.get("errors", []):
                out[n].append(f"[render] script error: {e[:120]}")
            if len(row["views"]) < 2:
                out[n].append("[render] no [data-view] control found, so only the opening screen was measured")
            for v, c in row["views"].items():
                if not isinstance(c, int):
                    out[n].append(f"[render] view '{v}': {c}")
                elif c > CHIP_MAX:
                    out[n].append(f"[chips] view '{v}': {c} pills on one screen (max {CHIP_MAX}); pills are values, actions are buttons")
            if not row["cards"]:
                out[n].append("[card-thumb] the opening week shows no cards, so the thumbnail rule proved nothing")
            elif row["noThumb"]:
                out[n].append(f"[card-thumb] {row['noThumb']} of {row['cards']} week cards have no thumbnail (.cthumb)")
        for n in out:
            if n not in got and not out[n]:
                out[n].append(f"[render] no measurement came back{(': ' + r.stderr.strip()[-160:]) if r and r.stderr.strip() else ''}")
    return {n: [f"{n}: {f}" for f in fs] for n, fs in out.items()}


def run(pages) -> int:
    allf, want, srcs = [], sync.render(), {}
    for p in pages:
        try:
            srcs[p.name] = p.read_text(encoding="utf-8")
            allf += findings(p.name, srcs[p.name], want)
        except Exception as e:  # a page that cannot be read is a finding
            allf.append(f"{p.name}: cannot read: {e!r}")
    for fs in render_findings(srcs).values():
        allf += fs
    for f in allf:
        print(f)
    for n in app_notes(want):
        print(n)
    print(f"{len(pages)} page(s), {len(allf)} finding(s)")
    return 1 if allf else 0


def selftest() -> int:
    src, want = PAGES[0].read_text(encoding="utf-8"), sync.render()
    base = findings("base", src, want)
    if base:
        print("self-test needs a green page first:"); print("\n".join(base)); return 1
    acc = re.search(r"--accent:\s*([^;]+);", want).group(1)   # from the app now, so a new accent colour does not break the case
    style_end = src.index("</style>")
    last_div = src.rindex("</div>", 0, src.index("<script>"))   # markup's last </div>; the script's template strings hold more
    muts = {  # name: (mutated page, the code that must be raised)
        "select": (src.replace("<main>", "<main><select><option>a</option></select>", 1), "[select]"),
        "select-js": (src.replace("<script>", "<script>document.createElement('select');", 1), "[select]"),
        "tab": (src.replace("<main>", '<main><div role="tablist"></div>', 1), "[tab]"),
        "tab-single-quote": (src.replace("<main>", "<main><div role='tab'></div>", 1), "[tab]"),
        "no-style": (re.sub(r"<style>.*?</style>", "", src, count=1, flags=re.S), "[style]"),
        "hex": (src.replace("button:hover{", "button:hover{color:#123456;", 1), "[colour]"),
        "rgb": (src.replace("button:hover{", "button:hover{color:rgb(255 0 0);", 1), "[colour]"),
        "named": (src.replace("button:hover{", "button:hover{color:red;", 1), "[colour]"),
        "white-outside-badge": (src.replace(".pill{", ".pill{color:#fff;", 1), "[colour]"),
        "inline-hex": (src.replace("<main>", '<main><div style="color:#abc"></div>', 1), "[inline-colour]"),
        "inline-single-quote": (src.replace("<main>", "<main><div style='color:#abc'></div>", 1), "[inline-colour]"),
        "inline-font": (src.replace("<main>", '<main><span style="font-size:10px">x</span>', 1), "[inline-font]"),
        "svg-fill": (src.replace("<main>", '<main><svg><rect fill="#123456"></rect></svg>', 1), "[svg-colour]"),
        "small-body": (src.replace("--fs-body:14px", "--fs-body:13px", 1), "[fs-min]"),
        "small-tag": (src.replace("--fs-tag:12px", "--fs-tag:11px", 1), "[fs-min]"),
        "fs-rem": (src.replace("--fs-tag:12px", "--fs-tag:.75rem", 1), "[fs-unit]"),
        "fs-hyphen": (src.replace("--fs-tag:12px;", "--fs-tag:12px; --fs-tag-sm:10px;", 1), "[token-name]"),
        "fs-outside-root": (src.replace("button:hover{", "button:hover{--fs-body:10px;", 1), "[token-scope]"),
        "fs-small-at-breakpoint": (src.replace("--av:30px", "--av:30px;--fs-body:11px", 1), "[fs-min]"),
        "platform-at-breakpoint": (src.replace("--av:30px", "--av:30px;--p-fb:#000000", 1), "[token-name]"),
        "px-font-size": (src.replace("button:hover{", "button:hover{font-size:11px;", 1), "[font-size]"),
        "undeclared-fs": (src.replace("button:hover{", "button:hover{font-size:var(--fs-xs);", 1), "[font-size]"),
        "px-font-shorthand": (src.replace("button:hover{", "button:hover{font:600 11px x;", 1), "[font]"),
        "rem-font-shorthand": (src.replace("button:hover{", "button:hover{font:600 .6rem Inter;", 1), "[font]"),
        "own-token": (src.replace("--ed-w:580px;", "--ed-w:580px; --brand:#123456;", 1), "[token-name]"),
        "p-palette": (src.replace("--ed-w:580px;", "--ed-w:580px; --p-page-bg:#fdf2f8;", 1), "[token-name]"),
        "platform-redefined": (src.replace("--ed-w:580px;", "--ed-w:580px; --p-fb:#000000;", 1), "[token-name]"),
        "repoint-app-token": (src.replace(".app{", ".app{--accent:var(--p-ig);", 1), "[token-name]"),
        "upper-token": (src[:style_end] + ":root{--Brand:#123456}\n" + src[style_end:], "[token-name]"),
        "second-palette": (src.replace("html,body{height:100%}", "@media (prefers-color-scheme: dark){html{opacity:1}}\nhtml,body{height:100%}", 1), "[palette]"),
        "theme-drift": (src.replace(f"--accent: {acc};", "--accent: #ff0000;", 1), "[theme-drift]"),
        "no-markers": (src.replace(sync.START, "/* gone */", 1), "[markers]"),
        "two-markers": (src[:style_end] + sync.START + sync.END + "\n" + src[style_end:], "[markers]"),
        "no-sample": (src.replace("樣稿", "示範"), "[sample]"),
        "no-action": (src.replace(">立即發佈<", ">馬上發<", 1), "[action]"),
        "commented-action": (src.replace(">立即發佈</button>", ">馬上發</button><!-- <button>立即發佈</button> -->", 1), "[action]"),
        "mismatch": (src.replace("</header>", "", 1), "[tags]"),
        "unclosed-tail": (src[:last_div] + src[last_div + len("</div>"):], "[unclosed]"),
        "self-close": (src.replace("<main>", "<main><span/>", 1), "[self-close]"),
    }
    missed = []
    for k, (v, code) in muts.items():
        got = findings(k, v, want)
        if v == src or not any(code in f for f in got):
            missed.append(f"{k} (wanted {code}; got {[f.split(': ', 1)[1][:40] for f in got][:3]})")
    rmuts = {  # rendered rules: one browser run for the base page and these
        "chips-21": (src.replace("<main>", "<main><div>" + '<span class="chip">x</span>' * (CHIP_MAX + 1) + "</div>", 1), "[chips] view 'opening'"),
        "card-no-thumb": (src.replace('class="cthumb ', 'class="cthumx ', 1), "week cards have no thumbnail"),
        "no-week-cards": (src.replace('class="week" id="weekView"', 'class="wk" id="weekView"', 1), "shows no cards"),
        "page-throws": (src.replace("<script>", "<script>throw new Error('selftest');", 1), "[render] script error"),
        "no-views": (src.replace("data-view=", "data-vw=").replace('[data-view]', '[data-vw]'), "[render] no [data-view]"),
    }
    rendered = render_findings({"base": src, **{k: v for k, (v, _) in rmuts.items()}})
    if rendered["base"]:
        print("self-test needs a green rendered page first:"); print("\n".join(rendered["base"])); return 1
    for k, (v, code) in rmuts.items():
        if v == src or not any(code in f for f in rendered[k]):
            missed.append(f"{k} (wanted {code}; got {[f.split(': ', 1)[1][:60] for f in rendered[k]][:3]})")
    muts.update(rmuts)
    print(f"self-test: {len(muts) - len(missed)}/{len(muts)} mutations raised their own rule" + ("; MISSED: " + "; ".join(missed) if missed else ""))
    return 1 if missed else 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if not PAGES:
        print("no *-mock.html pages here"); sys.exit(1)
    sys.exit(selftest() if "--selftest" in sys.argv else run(PAGES))
