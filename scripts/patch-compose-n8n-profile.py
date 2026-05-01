#!/usr/bin/env python3
"""Insert Compose profiles under `n8n:` once (idempotent). Usage: python patch-compose-n8n-profile.py path/to/docker-compose.yml"""
import pathlib
import sys

def main() -> int:
    if len(sys.argv) != 2:
        print("usage: patch-compose-n8n-profile.py <docker-compose.yml>", file=sys.stderr)
        return 2
    path = pathlib.Path(sys.argv[1])
    text = path.read_text(encoding="utf-8")
    needle = "  n8n:\n    profiles:\n      - local-n8n\n"
    if needle in text:
        print("already patched")
        return 0
    old = "  n8n:\n    image:"
    new = "  n8n:\n    profiles:\n      - local-n8n\n    image:"
    if old not in text:
        print("pattern not found", file=sys.stderr)
        return 1
    path.write_text(text.replace(old, new, 1), encoding="utf-8")
    print("patched", path)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
