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
規則（匯入器與 route 同一套，任一不符＝整份拒收）：id 為 uuid；slug kebab-case 且全域唯一；name 1–200 字；type 屬列舉；feature.phase 必填且存在；phase／feature 的 id 永遠屬於建立時的系統（要搬就給新 id，否則 DB 拒收）；source_paths／shared_paths 裡非 `/` 結尾的路徑必須是 HEAD 中存在的檔案（否則列入 `dead_source_paths` 缺口；ignore_paths 不檢查，可列會出現又消失的營運檔如 `DEPLOY_HOLD`）；監工頁卡對 feature：feature 可帶選填 `legacy_code`＝監工頁卡號原文（如 `ED.1`、`批0`；該頁的卡沒有 code 時填卡片編號 `n` 的文字），遷移只用它精確比對，不靠 slug 慣例；路徑以 `/` 結尾＝資料夾前綴；歸屬＝最長前綴，命中 shared／ignore 不歸任何系統。

## 契約 2：ingest（`POST /api/internal/systems/ingest`，`Authorization: Bearer $SYSTEMS_INGEST_TOKEN`）
```json
{
  "registry": { "...": "契約 1 全文（HEAD 版本）" },
  "events": [{
    "event_key": "git:<sha>:<內容雜湊> | mig:<feature_id> | run:<head>:<occurred_at>",
    "system_slug": "<slug|null>", "phase_slug": null, "feature_slug": null,
    "event_type": "activity|handoff|feature_update|revert|orphaned|migration|import_run",
    "source": "agent|migration|importer",
    "commit_sha": null, "occurred_at": "<ISO8601>", "payload": {}, "evidence": null
  }]
}
```
payload 依 event_type：
- `activity` `{ "subject": "<commit 主旨>", "files": <數量> }`（有歸屬、無 trailer 的 commit；有 trailer 時，沒拿到 handoff 的路徑主人也送這筆）
- `handoff` `{ "subject", "next"?: str, "blocker"?: str, "blocker_cleared"?: true, "explicit"?: true }`：只送給 `System:` 指名的系統（帶 `explicit`），沒寫就送給唯一的路徑主人；路徑主人有多個又沒寫 `System:` 時，送一筆未分類並列入缺口。投影略過同一 commit 落在多個系統、又沒帶 `explicit` 的 handoff，但其中的 `blocker_cleared` 照樣生效
- `feature_update` `{ "status": "todo|in_progress|implemented|verified|blocked|cancelled", "test"?: str }`（importer 只送 ≤ implemented；verified 只能來自 review／CI）
- `revert` `{ "reverted_sha": "<sha>" }`（一個 commit 撤多個 → 多筆；revert 被 revert → 依時間順序來回切換）
- `orphaned` `{ "sha": "<sha>" }`（歷史分叉後不再可達的 commit；投影排除其事件，事件不刪）
- `migration` `{ "legacy_status": str, "mapped_status": str, "evidence_level": "none|commit|test", "source_path": str, "source_sha": str }`
- `import_run` `{ "head", "previous_head", "status": "ok|history_diverged|error", "error", "gaps": { "unowned_paths", "unclassified_trailers", "unregistered_products", "unclaimed_supervisors", "dead_source_paths" } }`；importer 只在**最後一批**送，route 不自建（一輪只在全部批次落地後才算成功）
未分類：`system_slug=null`，payload 加 `"unclassified": "<原因>"`。
route 行為：registry 投影 upsert 三張定義表（以 id）；events `insert … on conflict (event_key) do nothing`；回 `{ inserted, skipped }`。頁面另寫 `status_change`／`review` 事件（source=user），不經此 route。

## 契約 3：頁面寫入的事件（source=user，不經 ingest route）
- `status_change` `{ "status", "priority"? }`、`review` `{ "target_event_key", "decision" }`（既有）
- `refresh_request` `{}`：按「立即更新」；system_id null。待處理＝有一筆 refresh_request 比最新 import_run 新。
- `system_proposed` `{ "name": 1–200 字, "type": 五類之一, "purpose": 1–200 字 }`：按「新增系統」；system_id null。待登記＝名稱（去空白、不分大小寫）不等於任何 registry 系統的 name／slug／aliases。agent 寫進 registry 後自然消失，不另寫完成事件。
- `system_proposal_closed` `{ "proposal_event_key", "reason" }`：撤回或駁回一筆提案（打錯、重複、不做）；被關閉的提案不再算待登記。
- 每次被受理的更新請求恰好回應一次：匯入成功或失敗都送 `import_run`（失敗為 status=error）。
- 主機查詢：`GET /api/internal/systems/pending`（Bearer `SYSTEMS_INGEST_TOKEN`）→ `{ "refresh": bool, "proposals": [{ "event_key", "name", "type", "purpose", "at" }] }`（event_key 供關閉用）。AO-RESUME 的待登記檢查也只走這個 route（主機上 curl），不另寫 SQL。
- store.ts 對外函式名（W9 實作、W10 呼叫）：`requestRefresh(sb, actor)`、`proposeSystem(sb, actor, { name, type, purpose })`、`closeProposal(sb, actor, key, reason)`、`readPending(sb)`（回同上 JSON 結構）。
