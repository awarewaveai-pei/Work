#!/usr/bin/env python3
"""Sync the shared pieces into every mock, verbatim: design-system.css into each <style> (between the shared markers,
page section left empty), every partials/<name>.html into its marked fragment and, on a tool lesson mock, its lesson
data into <main> (lessonkit); then export the lessons and the tools' unit facts to the web app (mockkit.WEB_LESSONS,
lessonkit.WEB_UNITS). Generated partials
(domain-chips, from SPEC/methods/examples/domains.yaml) are re-rendered first. Idempotent; a CRLF page is rewritten as LF.
Edit the .css / .yaml / partial, run this, run check-mocks.py. Exit 1 with one line on bad input (never a traceback).
Run:  python Projects/internal/cognitive-engineering-os/docs/mockups/sync-design-system.py"""
import re, sys
import lessonkit as lk
import mockkit as mk


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    for name, render in mk.GENERATED.items():              # registries -> partial file
        try:
            body = render()
        except Exception as e:                               # malformed registry, missing PyYAML, …
            print(f"partials/{name}.html cannot be rendered: {type(e).__name__}: {e}"); return 1
        p = mk.PARTIALS / f"{name}.html"
        if not p.exists() or p.read_bytes() != body.encode("utf-8"):
            p.write_bytes(body.encode("utf-8")); print(f"partials/{name}.html: regenerated")
    if not mk.WEB_DESIGN_SYSTEM.exists() or mk.WEB_DESIGN_SYSTEM.read_bytes() != mk.DESIGN_SYSTEM.read_bytes():   # the web app's copy
        mk.WEB_DESIGN_SYSTEM.write_bytes(mk.DESIGN_SYSTEM.read_bytes()); print(f"{mk.WEB_DESIGN_SYSTEM}: synced")
    css = mk.DESIGN_SYSTEM.read_bytes().decode("utf-8").replace("\r\n", "\n").rstrip("\n")
    partials = {p.stem: p.read_bytes().decode("utf-8").replace("\r\n", "\n").rstrip("\n") for p in sorted(mk.PARTIALS.glob("*.html"))}
    for f in mk.FILES:
        p = mk.HERE / f; raw = p.read_bytes(); new = raw.decode("utf-8").replace("\r\n", "\n")
        m = re.search(r"<style>.*?</style>", new, re.S)
        if not m: print(f"{f}: no <style>"); return 1
        block = "<style>\n" + mk.CSS_START + "\n" + css + "\n" + mk.CSS_END + "\n" + mk.CSS_PAGE + "\n</style>"
        new = new[:m.start()] + block + new[m.end():]
        if f in lk.TOOL_MOCKS:                              # a tool lesson's <main> is its lesson data
            try:
                main = lk.mock_main(f)
            except (OSError, ValueError) as e:
                print(f"{f}: lesson cannot be rendered: {e}"); return 1
            new, n = lk.MAIN.subn(lambda x: x.group(1) + main + x.group(3), new, count=1)
            if n != 1: print(f'{f}: no <main class="wrap">'); return 1
        try:
            names = set(mk.fragments(new))
        except ValueError as e:
            print(f"{f}: {e}"); return 1
        page_partials = dict(partials)
        for name, render in mk.PER_PAGE.items():            # per-page partials (the main menu marks this page's section)
            try:
                page_partials[name] = render(f).rstrip("\n")
            except Exception as e:
                print(f"{f}: partial {name} cannot be rendered: {type(e).__name__}: {e}"); return 1
        for name in names:
            if name not in page_partials: print(f"{f}: fragment {name} has no partials/{name}.html"); return 1
        def repl(m):
            name = m.group(1); indent = re.match(r"[ \t]*", m.group(0)).group(0)
            return f"{indent}{mk.partial_start(name)}\n{page_partials[name]}\n{indent}{mk.partial_end(name)}"
        new = mk.FRAG.sub(repl, new)
        for name in mk.REQUIRED_PARTIALS.get(f, ()):
            if name not in names: print(f"{f}: required partial {name} is not marked in the page"); return 1
        out = new.encode("utf-8")
        if out == raw: print(f"{f}: already in sync"); continue
        p.write_bytes(out); print(f"{f}: synced")
    try:                                                     # the web app's lessons (tool lessons from data, workflow lessons from their pages) and unit facts
        exports = {mk.WEB_LESSONS: lk.render_web_lessons().encode("utf-8"), lk.WEB_UNITS: lk.render_web_units().encode("utf-8")}
    except (OSError, ValueError) as e:
        print(f"lessons cannot be exported to the web app: {e}"); return 1
    for path, body in exports.items():
        if not path.exists() or path.read_bytes() != body:
            path.write_bytes(body); print(f"{path}: exported")
    return 0


if __name__ == "__main__":
    sys.exit(main())
