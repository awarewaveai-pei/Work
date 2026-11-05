# 上游 PR 草稿（未送出）

> 狀態：**草稿，不開 PR、不在 GitHub 留言**——對外發布要操作者同意（BRIEF §1）。送出時把下方「---」以下整段貼成 PR 內文；補丁＝同資料夾 `web-host-api.patch`（另加 `Cargo.lock` 兩個新套件，`cargo` 會自己補）。
> 目標 repo：`storytold/photocraft`，base `main`；對應 issue #9345／#7470（`window.photocraft`）、#3101（`?host=parent`）、#2263。上游合併後：刪 `web-host-api.patch`、PIN `rev` 移到含它的 commit（README「升級」第 1 步）。

---

## web: `window.photocraft` and `?host=parent` through craft-web-api and craft-web-host

The browser build had no control channel and no way for a hosting page to hand it files or take its saves (#9345, #7470, #3101, #2263). craft-libs now has the family's shared bridges for both — `craft-web-api` (`window.<app>`, craft-libs#413) and `craft-web-host` (`<app>:open` / `<app>:save` / `<app>:dirty` / `<app>:ready`, craft-libs#358) — so this PR only wires them into `apps/photocraft-web`, the same shape the other Craft web builds expose. No new API surface of PhotoCraft's own.

### What changes (2 files)

`apps/photocraft-web/Cargo.toml`: wasm32 dependencies `craft-web-api`, `craft-web-host` (craft-libs git rev) and `serde_json`.

`apps/photocraft-web/src/web.rs`:

- **`window.photocraft`** — `PageApi::new("photocraft", Methods { doc_inspect: None, ..Methods::default() }, request)`; `request` sends a `ControlRequest` into the channel handed to `PhotocraftApp::with_control`, the one the desktop control server feeds, so every method in `docs/control-protocol.md` works from the page (`request`, `execute`, `commands`, `uiInspect`, `screenshot`). Replies are read between frames: `WebShell::after_frame` (end of `logic` and of `ui`) settles the waiting promises and keeps requesting repaints while any wait. At `control::REPLY_DEADLINE` the request gives up through its `Dispatch` exactly as `control_server.rs` does (#3662): a request still queued (a hidden tab draws no frames) never runs later, so a page that re-sends after the error can't apply an edit twice; the page API's own timeout is set 5 s later as a backstop. `docInspect` is left out of the table because `document.inspect` is an engine command in PhotoCraft (reach it with `execute`), so the default entry could only fail.
- **Host messages** — `Host::connect("photocraft", &canvas)`; when hosted:
  - `photocraft:open {name, bytes|file}` goes into the same `inbox` a dropped file uses (File › Open behaviour; a read failure answers `photocraft:failed`);
  - `Services::write` posts `photocraft:save {name, bytes}` instead of starting a download (Save, Save As, Save a Copy, Export As, Quick Export); with a host, `write_unconfirmed` is `false`, because the host has the file once it is posted (no `id`, so no `saved` to wait for);
  - `photocraft:dirty` follows `has_unsaved_work()` (repeats are not sent, by the crate);
  - `photocraft:ready` once `window.photocraft` is installed and the app is built;
  - `photocraft:failed` when the app can't start (no WebGPU/WebGL2), so a host doesn't wait for `ready` forever.
  Unhosted (no `?host=parent`, a cross-origin parent, no `data-host="page"`) nothing changes: downloads as before.

### Not in this PR

- `saveAs` in `photocraft:save` is always `false`: `Services::write` gets a path, not whether the user chose Save As. A follow-up could pass it through `WriteFn`.
- `post_ready(.., false)`: a `file` Blob is accepted and read whole (not in slices).
- `main.rs`'s module doc still says "no TCP control server"; true, and the page channel is now documented in `web.rs`.

### Testing

- `cargo clippy --no-deps -p photocraft-web --target wasm32-unknown-unknown --features heif -- -D warnings`: no finding in `web.rs` (the run stops on a pre-existing `wildcard_imports` in `preset_bridge.rs` with clippy 1.99, untouched here).
- `packaging/web/package.sh` builds and packages unchanged.
- `packaging/web/package.sh` at this rev also needs #10248 (app/snippets) to start at all; tested with that copy applied.
- Headless Chromium (SwiftShader WebGL2), a same-origin page framing `index.html?host=parent`: `photocraft:ready` ~2.5 s after load; `request('ui.inspect')` answers; `execute('prefs.set', {path: 'interface.language', value: 'zh-hant'})` switches the UI; `photocraft:open` opens PNG/SVG/PSD as new documents; `ui.menu.invoke` of Quick Export As PNG, Export As (WebP), Save As and Save a Copy each arrive as one `photocraft:save` with the encoded bytes and no download; `photocraft:dirty` follows edits.
- Noticed while testing, not changed here: on the web Save As suggests `.psd` for every document without a path (`app/files.rs:236-245`), and a web document never has one, so `.pcraft` can't be saved from the browser build.
