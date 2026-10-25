# Runbook — aware-wave-wp-bridge 外掛發版

> 症狀觸發：「發 wp-bridge 新版」「外掛更新」「release 到 github」「第 N 版在哪」/ 操作者看 Releases 找不到剛改的版本。

## 核心事實（曾踩過的坑）

外掛有**兩個 repo**，發版正本不是 Work：

| repo | 角色 | 平常動作 |
|------|------|---------|
| `awarewaveai-pei/Work` | monorepo **開發副本** `lobster-factory/packages/wp-bridge-plugin/` | 改 code、跑 R0 |
| `awarewaveai-pei/aware-wave-wp-bridge` | **發佈正本**，13+ releases 都在這 | push tag `v*` → Action 出 zip + Release |

**只 push Work ≠ 發版。** 操作者從 `aware-wave-wp-bridge` 的 **Releases** 下載 zip 安裝；Work 動了但沒打 tag，操作者那邊不會更新 → 會問「第 N 版在哪？」

發佈機制：`aware-wave-wp-bridge/.github/workflows/release.yml`，trigger = `push tags: ['v*']`，build = 複製 `aware-wave-wp-bridge.php` + `includes/` + `README.md` 進 `build/aware-wave-wp-bridge/`，zip 成 `aware-wave-wp-bridge-vX.Y.Z.zip`，用 `softprops/action-gh-release` 建 Release。約 15s 完成。

## 標準流程

```bash
# 1. 在 Work 副本改好 code + bump 版本（header Version: 與 AWBRIDGE_VERSION define 兩處）
#    通過 R0 四動作（php -l / critic / 抓蟲 / WORKLOG），commit + push Work main

# 2. 一鍵發版（同步正本 + tag + 驗證 Release）
bash scripts/release-wp-bridge.sh --dry-run    # 先看會同步什麼
bash scripts/release-wp-bridge.sh              # 真發版
```

腳本守門：版本兩處一致、`php -l`、tag 已存在則拒（release immutable）、發版後輪詢確認 zip asset 真的掛上。

## 操作者端

1. 先看：`powershell -ExecutionPolicy Bypass -File .\scripts\rollout-wp-bridge.ps1 -DryRun`（列出主機上每個裝了 wp-bridge 的網站與版本；自動探索，不靠名單）。
2. 升級全部：`powershell -ExecutionPolicy Bypass -File .\scripts\rollout-wp-bridge.ps1`（High：每站 DB 備份 → 舊外掛資料夾備份 → `wp plugin install --force` → 檢查版本／`/health`／首頁；失敗自動還原舊版、exit 1；備份在 `/root/backups/wordpress/`）。
3. 客戶站（soulful 等）另跑 `/client-status` 與 `/playwright client <slug>`（AGENTS.md §7 Client site DoD）。
4. wp-bridge 是**所有網站共用**：發版後必 rollout，不能只升 aware-wave.com。只有本機主機以外的網站才用後台「上傳外掛」覆蓋。
5. AwareWave 收費功能（付款與會員設定頁、商品欄位、驗證信、結帳閘）只出現在**啟用過**的網站：`wp option add aware_wave_payments_enabled ''`（aware-wave.com 已啟用；客戶站不要加）。0.18.2 起。

## 排查

| 症狀 | 處置 |
|------|------|
| Releases 看不到新版 | 沒打 tag 或 tag 推到了 Work（錯 repo）。跑 `scripts/release-wp-bridge.sh` 重發 |
| `version mismatch` | `aware-wave-wp-bridge.php` header 與 define 版號不同，改一致 |
| `release vX.Y.Z already exists` | 版號發過了（immutable），bump 版號重來 |
| Action 失敗 | `gh run list -R awarewaveai-pei/aware-wave-wp-bridge --workflow=release.yml` 看 log |
| zip 裝上但功能沒出現 | 確認 zip 內含新 `includes/` 檔；清外掛快取/重新啟用外掛 |

## 相關

- 指令：`.claude/commands/wp-bridge-release.md`
- 腳本：`scripts/release-wp-bridge.sh`（發版）、`scripts/rollout-wp-bridge.ps1`（裝到所有網站）
- 端點現況：`POST /post` `/option/{name}` `/product`（v0.7.0+）、`GET /health` `/blocks`
