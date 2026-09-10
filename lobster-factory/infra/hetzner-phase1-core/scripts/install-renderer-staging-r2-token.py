#!/usr/bin/env python3
"""Install the Cloudflare API token from an exported staging credential note.

Prints metadata only. Secret values are never written to stdout/stderr.
"""
from __future__ import annotations

import hashlib
import os
import shutil
import sys
import tempfile
from pathlib import Path


def value_after(lines: list[str], label: str) -> str:
    for index, line in enumerate(lines):
        if label not in line:
            continue
        for candidate in lines[index + 1 :]:
            value = candidate.strip().replace("\\", "")
            if value:
                return value
    raise ValueError(f"credential section not found: {label}")


def credentials_from_note(path: Path) -> dict[str, str]:
    lines = path.read_text(encoding="utf-8-sig").splitlines()
    values = {
        "R2_API_TOKEN": value_after(lines, "權杖值"),
        "R2_S3_ACCESS_KEY_ID": value_after(lines, "存取金鑰識別碼"),
        "R2_S3_SECRET_ACCESS_KEY": value_after(lines, "秘密存取金鑰"),
        "R2_S3_ENDPOINT": value_after(lines, "預設"),
    }
    # Cloudflare issues API tokens with both cfut (user token) and cfat
    # (account/API token) prefixes. Both are opaque bearer values here; the
    # proxy only uses this value for renderer-to-proxy authentication.
    if not values["R2_API_TOKEN"].startswith(("cfut", "cfat")):
        raise ValueError("Cloudflare API token has unexpected prefix")
    if not values["R2_S3_ENDPOINT"].startswith("https://") or ".r2.cloudflarestorage.com" not in values["R2_S3_ENDPOINT"]:
        raise ValueError("R2 S3 endpoint is invalid")
    return values


def install(note: Path, env_path: Path) -> None:
    values = credentials_from_note(note)
    original = env_path.read_text(encoding="utf-8").splitlines()
    updated: list[str] = []
    pending = dict(values)
    for line in original:
        name = line.split("=", 1)[0]
        if name in pending:
            updated.append(f"{name}={pending.pop(name)}")
        else:
            updated.append(line)
    updated.extend(f"{name}={value}" for name, value in pending.items())

    backup = env_path.with_name(f"{env_path.name}.bak-r2-token")
    shutil.copy2(env_path, backup)
    fd, temp_name = tempfile.mkstemp(prefix=f".{env_path.name}.", dir=env_path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            handle.write("\n".join(updated) + "\n")
        os.chmod(temp_name, 0o600)
        os.replace(temp_name, env_path)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)
    digest = hashlib.sha256(values["R2_API_TOKEN"].encode()).hexdigest()[:12]
    print(f"installed=true fields={len(values)} token_sha256_prefix={digest} backup={backup.name}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: install-renderer-staging-r2-token.py NOTE ENV")
    install(Path(sys.argv[1]), Path(sys.argv[2]))
