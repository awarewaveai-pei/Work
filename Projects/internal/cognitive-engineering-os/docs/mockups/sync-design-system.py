#!/usr/bin/env python3
"""Copy design-system.css (the one stylesheet) into the <style> of the four mocks, verbatim, between the shared
markers, and leave the page-specific section empty. Edit the .css, run this, run check-mocks.py.
Run:  python Projects/internal/cognitive-engineering-os/docs/mockups/sync-design-system.py"""
import pathlib, re, sys

HERE = pathlib.Path(__file__).resolve().parent
FILES = ["iceberg-result-mock.html", "iceberg-lesson-mock.html", "workflow-result-mock.html", "workflow-lesson-mock.html"]
START = "  /* == shared design system: start (byte-identical in all four mocks; check-mocks.py enforces) == */"
END = "  /* == shared design system: end == */"
PAGE = "  /* == page-specific == */"


def main():
    css = (HERE / "design-system.css").read_text(encoding="utf-8").rstrip("\n")
    if "\r" in css: print("design-system.css must be LF"); return 1
    for f in FILES:
        p = HERE / f; s = p.read_text(encoding="utf-8")
        m = re.search(r"<style>.*?</style>", s, re.S)
        if not m: print(f"{f}: no <style>"); return 1
        block = "<style>\n" + START + "\n" + css + "\n" + END + "\n" + PAGE + "\n</style>"
        if m.group(0) == block: print(f"{f}: already in sync"); continue
        p.write_bytes((s[:m.start()] + block + s[m.end():]).encode("utf-8")); print(f"{f}: synced")
    return 0


if __name__ == "__main__":
    sys.exit(main())
