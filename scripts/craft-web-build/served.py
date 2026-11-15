"""What a Craft site actually hands the browser, for the brand checks in lib.sh (craft_brand_scan, craft_name_scan).

A byte search over the files on disk is blind to compressed content: FilmCraft/EffectCraft/VectorCraft ship .gz copies,
and PhotoCraft ships its app wasm as one gzip stream cut into app/*.part-* files that the page joins and inflates itself.
So: any file that starts with the gzip magic is inflated, and every <name>.part-<suffix> group is joined in suffix order
and inflated as one file. A gzip stream that does not inflate is an error, never "nothing found".
"""
import gzip
import os
import re

PART = re.compile(r"^(.*)\.part-([a-z]+)$")


def _inflate(data, name):
    if data[:2] != b"\x1f\x8b":
        return data
    try:
        return gzip.decompress(data)
    except Exception as e:  # truncated or corrupt: the scan must not pass on bytes it cannot read
        raise SystemExit(f"brand check: {name} looks gzip-compressed but does not inflate ({e})")


def served(root):
    """Yield (relative name, content as served) for every file under root; part groups come back joined."""
    groups = {}
    for d, _, names in os.walk(root):
        for n in sorted(names):
            path = os.path.join(d, n)
            rel = os.path.relpath(path, root).replace(os.sep, "/")
            m = PART.match(rel)
            if m:
                groups.setdefault(m.group(1), []).append((m.group(2), path))
                continue
            yield rel, _inflate(open(path, "rb").read(), rel)
    for base, parts in sorted(groups.items()):
        parts.sort(key=lambda p: (len(p[0]), p[0]))
        name = base + ".part-*"
        yield name, _inflate(b"".join(open(p, "rb").read() for _, p in parts), name)


def read_one(path):
    return _inflate(open(path, "rb").read(), path)
