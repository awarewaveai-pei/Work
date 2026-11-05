# Upstream PR draft — storytold/vectorcraft（操作者決定後才開，不要自動開）

開法（在 WSL 的 src checkout 上）：

```bash
wsl -d Ubuntu -e bash -lc 'cd ~/awarewave/vectorcraft-src && git checkout -b feat/web-api-addfont $(python3 -c "import json;print(json.load(open(\"/mnt/d/Work/scripts/vectorcraft-pro/PIN.json\"))[\"rev\"])") && git apply /mnt/d/Work/scripts/vectorcraft-pro/api-addfont.patch && git commit -am "Web API: addFont() registers a font from bytes"'
# 然後 fork + push + gh pr create --repo storytold/vectorcraft
```

## Title

Web API: `addFont()` registers a font from bytes

## Body

`window.vectorcraft.addFont(bytes: Uint8Array) → Promise<number>` adds a font to the
document font database from the page, the way `fonts.rs` registers the faces fetched
from `fonts/` — `FontDb::global().add_font(bytes)` — resolving with the number of faces
added (0 = not a font, or already loaded) and requesting a repaint so font menus and
the canvas pick the face up.

Why: an embedder hosting VectorCraft in an `<iframe>` can serve its own font catalogue
(say, fonts its users upload, or fetched from Google Fonts) without rebuilding the wasm
or extending `web-fonts.txt` — the page fetches the bytes and hands them over. The
desktop control server needs nothing: desktop builds read installed system fonts.

The promise resolves immediately (the call is synchronous under the hood) — a promise
only to match every other `window.vectorcraft` method.

合併後：PIN.json `rev` 升到含該 commit 的版本，刪 `api-addfont.patch`，build.sh 的 patch 迴圈移除該檔。
