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

---

# Upstream PR draft 2 — setTheme（分支疊在 addFont 分支上；patch 以 addFont 已套用為前提）

分支：`feat/web-api-settheme`（base = `feat/web-api-addfont`；`git apply api-settheme.patch` 前先套 addFont）。

## Title

Web API: `setTheme()` lets an embedding page supply the UI's theme tokens

## Body

An embedder hosting VectorCraft in an `<iframe>` usually has its own palette; four
brightness levels can sit close to it but never match it. `window.vectorcraft.setTheme(obj)`
builds a token set — a light or dark base chosen by the given panel colour's luma, each
given field (`theme::Tokens`' colour fields, `"#rrggbb"`, plus `radius`) overriding it —
and installs it as a host override in `ui-egui`'s theme:

- `theme::apply_with` now records the app's chosen brightness/accent/scheme and prefers
  a host override when one is set, so the app's own re-applies (prefs, brightness menu)
  keep the host's look; `theme::apply_tokens` is the extracted apply step.
- `theme::set_host_tokens(ctx, Some(t))` applies at once; `None` clears the override and
  restores the recorded app choice. The override lives in the egui context's data, so a
  graphics restart (a new context) drops it and the page simply sets it again.
- `setTheme` resolves with the field names applied; unknown fields or malformed values
  reject listing every offence, so an embedder's mapping bugs surface at once.
  `setTheme(null)` restores the app's own theme.

合併後：同 addFont — PIN `rev` 升版、刪 `api-settheme.patch`、build.sh patch 迴圈移除（`awarewave-theme-receiver.js` 是我們自己的注入，不隨 PR 走、保留）。
