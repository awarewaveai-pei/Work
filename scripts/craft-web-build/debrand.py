#!/usr/bin/env python3
"""Drop every translation-catalog entry that names ArtCraft or Discord from a patched Craft checkout.

Upstream docs/brand/LICENSE-brand.txt: a modified version must remove the ArtCraft Marks (the name included) and must
not present itself as an ArtCraft product. The UI that shows those strings is removed by each build's
no-artcraft-marks.patch; the catalogs still carry their translations in ~15 languages, and catalogs are compiled into
the wasm. Editing them by hand would break on every upgrade, so this filter runs after the patches, format-aware:

  *.tsv  (FilmCraft, "context <TAB> source <TAB> translation", '#' comments)  -> the line goes
  *.rs   (EffectCraft, rows of string literals: ("src", "tr") or ("key", "src", "tr"), one or several lines) -> the row goes

A matching text outside a recognised row is FATAL: a new kind of entry needs a look, not a silent pass.
Usage: debrand.py <checkout> <catalog file or glob, relative to the checkout>...
"""
import glob, os, re, sys

WORD = re.compile(r"artcraft|discord", re.I)
LIT = r'"(?:[^"\\]|\\.)*"'
ROW = re.compile(r"[ \t]*\(\s*" + LIT + r"(?:\s*,\s*" + LIT + r"){1,3}\s*,?\s*\)\s*,?[ \t]*\n?", re.S)


def filter_tsv(text):
    lines = text.splitlines(keepends=True)
    kept = [l for l in lines if not WORD.search(l)]
    return "".join(kept), len(lines) - len(kept)


def filter_rs(text):
    dropped = 0

    def drop(m):
        nonlocal dropped
        if WORD.search(m.group(0)):
            dropped += 1
            return ""
        return m.group(0)

    return ROW.sub(drop, text), dropped


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    src, patterns = sys.argv[1], sys.argv[2:]
    total, leftovers = 0, []
    for pat in patterns:
        files = sorted(glob.glob(os.path.join(src, pat)))
        if not files:
            sys.exit(f"FATAL: debrand: no catalog matches {pat} — upstream moved its translations? update the build")
        for f in files:
            text = open(f, encoding="utf-8").read()
            new, n = filter_tsv(text) if f.endswith(".tsv") else filter_rs(text)
            total += n
            for i, line in enumerate(new.splitlines(), 1):
                if WORD.search(line) and not line.lstrip().startswith("//"):
                    leftovers.append(f"{os.path.relpath(f, src)}:{i}: {line.strip()[:120]}")
            if n:
                open(f, "w", encoding="utf-8", newline="").write(new)
    if leftovers:
        print("\n".join(leftovers), file=sys.stderr)
        sys.exit("FATAL: debrand: ArtCraft/Discord text outside a recognised catalog row (above) — extend no-artcraft-marks.patch")
    print(f"debrand: {total} catalog entries naming ArtCraft/Discord removed")


main()
