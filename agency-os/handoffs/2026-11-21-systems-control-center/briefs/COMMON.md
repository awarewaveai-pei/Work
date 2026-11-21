# COMMON — 所有工人必讀

回報操作者一律繁體中文。設計正本：`agency-os/handoffs/2026-11-21-systems-control-center/PLAN.md`（先整份讀，尤其 §2、§3、§6）。本檔＝跨卡契約，不得自改；契約不夠用 → RISKS 寫明，監工改。

## 工作規則
- 你在自己的 worktree；只改你卡上「檔案」列的路徑。commit 在 worktree 分支，**不推、不 merge main**，監工 cherry-pick。
- 開工前 `git log --oneline -10`。`.ts/.tsx` 改完 `npx tsc --noEmit`；next-admin 改動跑相關 vitest（不跑全套）。python 用 `python -m unittest`。
- 不做無效益測試：只寫卡面點名的測試；突變只做在授權／可見範圍守衛，一個守衛一次。
- 禁：SSH 主機、碰 prod 資料庫、套 migration、`taskkill /IM node.exe`、改 `.env*`、裸 `codex exec`。
- 讀法：要改的檔整檔讀，其餘 grep。context 變長時把進度寫進你卡上的回報、停手，監工會 clear 後續派。
- 收尾回覆最後三行固定格式，不寫散文報告：
  `FILES: <路徑, …>`
  `TESTS: <指令> → <結果>`
  `RISKS: <每條一句；沒有寫 none>`

## 契約 1：registry.json（`agency-os/systems/registry.json`）
```json
{
  "version": 1,
  "shared_paths": ["<repo 相對路徑前綴>"],
  "ignore_paths": ["agency-os/WORKLOG.md", "agency-os/TASKS.md", "agency-os/memory/", "agency-os/reports/"],
  "systems": [{
    "id": "<uuid v4，建立後不改>", "slug": "<kebab>", "name": "<繁中>", "aliases": [],
    "type": "product|internal|infrastructure|governance|client",
    "purpose": "<一句繁中>", "product_key": "<products.ts key 或 null>",
    "source_paths": ["<repo 相對路徑前綴>"],
    "phases": [{ "id": "<uuid>", "slug": "<kebab>", "name": "<繁中>", "legacy_source_path": "<監工頁資料夾或 null>" }],
    "features": [{ "id": "<uuid>", "slug": "<kebab>", "name": "<繁中>", "phase": "<phase slug>" }]
  }]
}
```
規則：slug／id 全域唯一；路徑以 `/` 結尾＝資料夾前綴；歸屬＝最長前綴，命中 shared／ignore 不歸任何系統。

## 契約 2：ingest（`POST /api/internal/systems/ingest`，`Authorization: Bearer $SYSTEMS_INGEST_TOKEN`）
```json
{
  "registry": { "...": "契約 1 全文（HEAD 版本）" },
  "import_run": { "head": "<sha>", "previous_head": "<sha|null>", "status": "ok|history_diverged|error", "error": null,
                  "gaps": { "unowned_paths": [], "unclassified_trailers": [], "unregistered_products": [], "unclaimed_supervisors": [] } },
  "events": [{
    "event_key": "git:<sha>:<idx> | mig:<feature_id> | run:<head>",
    "system_slug": "<slug|null>", "phase_slug": null, "feature_slug": null,
    "event_type": "activity|handoff|feature_update|revert|migration|import_run",
    "source": "agent|migration|importer",
    "commit_sha": null, "occurred_at": "<ISO8601>", "payload": {}, "evidence": null
  }]
}
```
payload 依 event_type：
- `activity` `{ "subject": "<commit 主旨>", "files": <數量> }`（有歸屬、無 trailer 的 commit）
- `handoff` `{ "subject", "next"?: str, "blocker"?: str, "blocker_cleared"?: true }`
- `feature_update` `{ "status": "todo|in_progress|implemented|verified|blocked|cancelled", "test"?: str }`（importer 只送 ≤ implemented；verified 只能來自 review／CI）
- `revert` `{ "reverted_sha": "<sha>" }`
- `migration` `{ "legacy_status": str, "mapped_status": str, "evidence_level": "none|commit|test", "source_path": str, "source_sha": str }`
- `import_run` 用上面 `import_run` 物件本身
未分類：`system_slug=null`，payload 加 `"unclassified": "<原因>"`。
route 行為：registry 投影 upsert 三張定義表（以 id）；events `insert … on conflict (event_key) do nothing`；回 `{ inserted, skipped }`。頁面另寫 `status_change`／`review` 事件（source=user），不經此 route。
