# codex-oracle review -- 2026-11-16 08:41:30 +08:00

- mode: `review`
- scope: -Path .github/workflows/video-workbench-ci.yml, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/awarewave-files.cjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: video-workbench CI gate red 25x since 263a16450: in the CI checkout ../next-admin exists, so resolveSource() (backend/appearance.cjs:3-9) loads next-admin/lib/ai/to-traditional.ts from there and its 'opencc-js' import resolves from next-admin/node_modules, which CI never installs. In the image there is no ../next-admin; the bundled .awarewave/ is read and packages resolve from video-workbench/node_modules (opencc-js 1.3.1 is a dependency and in the lock). Invariant: CI runs the gate in the image's layout. Fix: Gate step sets AWAREWAVE_APP_DIR=.awarewave (bundle step already produces it); the 4 bundled next-admin files missing from the push/pull_request path filters are added; tests/awarewave-files.cjs now fails when a bundled file is not in both path lists. Focus: does any gate test rely on reading next-admin files that are NOT bundled through resolveSource (would now break in CI), and is the path-filter check correct.
- exit: 0 | elapsed: 126427ms | answer: 1065B
- files-reviewed: .github/workflows/video-workbench-ci.yml, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/awarewave-files.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: CI 現在會略過 next-admin 的路由契約檢查
  file:line   -> `.github/workflows/video-workbench-ci.yml:102`；`lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/p6-main-system.cjs:610`
  confidence  -> CONFIRMED
  scenario    -> PR 改壞 next-admin 的 jobs route 欄位；CI 指向只含 bundled files 的 `.awarewave`，`fullSource` 為 false，路由契約斷言不執行，gate 仍可通過。
  why missed  -> 作者對齊了 image 的檔案布局，但這項測試原本利用 CI 的完整 checkout 做額外檢查。

FINDING 2: 路徑檢查的兩次命中不保證分屬 push 與 pull_request
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/awarewave-files.cjs:43`
  confidence  -> CONFIRMED
  scenario    -> 某 bundled file 在 push paths 同時被精確路徑與 glob 命中，卻從 pull_request paths 移除；`hits >= 2` 仍通過，但該檔的 PR 不會觸發 gate。
  why missed  -> 檢查把兩個事件的 paths 合併計數，沒有分別驗證。

TOTAL: 2 findings