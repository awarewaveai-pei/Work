# W1 主機匯入器（Opus 5.5）

先讀 `COMMON.md`、PLAN §5–§7。

做：`lobster-factory/infra/hetzner-phase1-core/scripts/systems-import.py`（純標準庫 python3，非 `.sh`）。
- 參數／env：`--mirror <bare repo 路徑>`、`--state <last_head 檔>`、`--dry-run`（印 JSON 不 POST）；`SYSTEMS_IMPORT_ENABLED` 非 `true` → 印一行直接 exit 0；`SYSTEMS_INGEST_TOKEN`、`SYSTEMS_INGEST_URL`。token 讀法照同目錄 `poke.sh`。
- 流程：`git fetch` mirror → 讀 HEAD 的 registry.json → `merge-base --is-ancestor` 檢查 → 走 `previous_head..HEAD`（首次：近 90 天）→ 每 commit `git interpret-trailers --parse` ＋ `--name-only` → 依契約產事件＋gaps → POST（成功才寫 state 檔）。歸屬＝最長前綴；revert 由主旨 `This reverts commit <sha>` 判。
- 分批 POST（每批 ≤ 500 事件），任一批失敗 → 不寫 state，下輪重來（event_key 去重）。
- `cron.d/systems-import`：`30 20 * * *`，經 `cron-run.sh systems_import '…'`，命令含 `flock -n /tmp/systems-import.lock timeout 300 nice -n 19 ionice -c3 python3 …`。照同目錄既有 cron.d 檔格式。
- 測試 `scripts/tests/test_systems_import.py`（`python -m unittest`）：用 tmp 建小 repo，驗：最長前綴／shared／ignore、trailer 多 System、未知 slug→未分類、revert、歷史分叉→history_diverged 且不送事件、重跑同範圍事件 key 相同、ENABLED 關閉不動作。

檔案：上述三個路徑（若 `scripts/tests/` 不存在則建）。不碰 next-admin、registry.json。
