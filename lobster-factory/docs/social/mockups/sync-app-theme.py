#!/usr/bin/env python3
"""Copy the app's theme into the social-manager mockups, so the mock and app.aware-wave.com share one stylesheet.
Source: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/globals.css — the factory defaults. The theme editor
(/tools/theme, THEME_ARCHITECTURE_APPEARANCE.md) overrides tokens at runtime on every page the same way, so the mock shows
a fresh install. Copied rules: :root (tokens), body (font), .btn-primary and .btn-secondary with :hover / :disabled.
Run:  python lobster-factory/docs/social/mockups/sync-app-theme.py          # rewrites the block between the markers in every *-mock.html
      python lobster-factory/docs/social/mockups/sync-app-theme.py --check  # exit 1 when a mock's block differs from globals.css now
check-social-mocks.py imports this file (render, locate, rules, declarations), so the gate and the generator parse CSS one way."""
import os, pathlib, re, sys

HERE = pathlib.Path(__file__).resolve().parent
APP_CSS = HERE.parents[2] / "infra" / "hetzner-phase1-core" / "apps" / "next-admin" / "app" / "globals.css"
SELECTORS = [":root", "body", ".btn-primary", ".btn-primary:hover", ".btn-primary:disabled", ".btn-secondary", ".btn-secondary:hover"]
START, END = "/* app-theme:start */", "/* app-theme:end */"
STYLE_RE = re.compile(r"<style[^>]*>(.*?)</style>", re.S | re.I)


def _skip(css: str, i: int) -> int:
    """Index past a comment or quoted string that starts at i; i itself when neither starts there."""
    if css.startswith("/*", i):
        j = css.find("*/", i + 2)
        return len(css) if j < 0 else j + 2
    if css[i] in "\"'":
        q, j = css[i], i + 1
        while j < len(css) and css[j] != q:
            j += 2 if css[j] == "\\" else 1
        return j + 1
    return i


def strip_comments(css: str) -> str:
    out, i = [], 0
    while i < len(css):
        j = _skip(css, i)
        if j != i and css.startswith("/*", i):
            out.append(" "); i = j
        elif j != i:
            out.append(css[i:j]); i = j
        else:
            out.append(css[i]); i += 1
    return "".join(out)


def rules(css: str, at: str = "") -> list[tuple[str, str, int, int]]:
    """Every style rule as (selector, body, start, end): braces counted by depth, comments and strings skipped, so a
    one-line rule never swallows the next one. Rules inside @media / @supports come back with at='@media …'
    prefixed to the selector ('@media … » sel'); start/end are offsets in css (start = first char of the selector)."""
    out, i, sel_start, n = [], 0, None, len(css)
    while i < n:
        j = _skip(css, i)
        if j != i:
            i = j; continue
        c = css[i]
        if c == "{":
            sel = " ".join(strip_comments(css[sel_start if sel_start is not None else i:i]).split())
            depth, k = 1, i + 1
            while k < n and depth:
                m = _skip(css, k)
                if m != k:
                    k = m; continue
                depth += {"{": 1, "}": -1}.get(css[k], 0); k += 1
            body = css[i + 1:k - 1]
            if sel.startswith("@"):
                for s, b, a, z in rules(body):
                    out.append((f"{sel} » {s}", b, a + i + 1, z + i + 1))
            else:
                out.append((at + sel, body, sel_start if sel_start is not None else i, k))
            i, sel_start = k, None
        elif c in "};":
            i, sel_start = i + 1, None
        else:
            if sel_start is None and not c.isspace():
                sel_start = i
            i += 1
    return out


def declarations(body: str) -> list[tuple[str, str]]:
    """(property, value) pairs; the property keeps its case (custom properties are case-sensitive)."""
    out, depth, cur, parts = [], 0, [], []
    text, i = strip_comments(body), 0
    while i < len(text):
        j = _skip(text, i)
        if j != i:
            cur.append(text[i:j]); i = j; continue
        c = text[i]
        depth += {"(": 1, ")": -1}.get(c, 0)
        if c == ";" and depth == 0:
            parts.append("".join(cur)); cur = []
        else:
            cur.append(c)
        i += 1
    parts.append("".join(cur))
    for p in parts:
        if ":" in p:
            k, v = p.split(":", 1)
            if k.strip():
                out.append((k.strip(), v.strip()))
    return out


def render(css: str | None = None) -> str:
    css = css if css is not None else APP_CSS.read_text(encoding="utf-8")
    top = [r for r in rules(css) if "»" not in r[0]]
    picked = []
    for s in SELECTORS:
        hits = [r for r in top if r[0] == s]
        if len(hits) != 1:
            raise SystemExit(f"{APP_CSS}: {len(hits)} top-level rules for {s}; the sync copies exactly one (merge them in globals.css)")
        _, _, a, z = hits[0]
        picked.append(css[a:z])
    return (START + "\n/* copied from next-admin app/globals.css by sync-app-theme.py; change the app, then re-run */\n"
            + "\n".join(picked) + "\n" + END)


def locate(html: str) -> tuple[int, int] | str:
    """Absolute (start, end) of the marked block inside a <style> element, or why it cannot be used: the markers must
    each appear exactly once in the page's CSS and in the same <style>. Text outside <style> (an HTML comment
    quoting the markers) is never matched."""
    found = []
    for m in STYLE_RE.finditer(html):
        body, base = m.group(1), m.start(1)
        for mk in (START, END):
            for x in re.finditer(re.escape(mk), body):
                found.append((mk, base + x.start(), m.start(1)))
    starts = [f for f in found if f[0] == START]
    ends = [f for f in found if f[0] == END]
    if len(starts) != 1 or len(ends) != 1:
        return f"app-theme markers: {len(starts)} start / {len(ends)} end inside <style>; need exactly one each"
    (_, s, sa), (_, e, ea) = starts[0], ends[0]
    if sa != ea or e < s:
        return "app-theme markers: start and end must be in the same <style>, start first"
    return s, e + len(END)


def embedded(html: str) -> str | None:
    loc = locate(html)
    return None if isinstance(loc, str) else html[loc[0]:loc[1]]


def _write_atomic(path: pathlib.Path, text: str) -> None:
    tmp = path.with_name(path.name + ".tmp")
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    os.replace(tmp, path)


def main(argv: list[str]) -> int:
    want, rc = render(), 0
    for page in sorted(HERE.glob("*-mock.html")):
        html = page.read_text(encoding="utf-8")
        loc = locate(html)
        if isinstance(loc, str):
            print(f"{page.name}: {loc}"); rc = 1; continue
        have = html[loc[0]:loc[1]]
        if have == want:
            print(f"{page.name}: up to date")
        elif "--check" in argv:
            print(f"{page.name}: app-theme block differs from globals.css; run sync-app-theme.py"); rc = 1
        else:
            _write_atomic(page, html[:loc[0]] + want + html[loc[1]:]); print(f"{page.name}: app-theme block updated")
    return rc


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.exit(main(sys.argv[1:]))
