# Runbook — aware-wave-wp-bridge／aware-wave-store 外掛發版

> 症狀觸發：「發 wp-bridge 新版」「外掛更新」「release 到 github」「第 N 版在哪」/ 操作者看 Releases 找不到剛改的版本。

## 核心事實（曾踩過的坑）

我們有兩個 WordPress 外掛，各有**兩個 repo**，發版正本不是 Work：

| 外掛 | 裝在哪 | Work 開發副本 | 發佈正本 |
|------|--------|---------------|----------|
| `aware-wave-wp-bridge`（讓 AI 管 WordPress 的通道） | **每個**代管網站 | `lobster-factory/packages/wp-bridge-plugin/` | `awarewaveai-pei/aware-wave-wp-bridge`（公開） |
| `aware-wave-store`（AW 自己的付款事件、會員驗證、進入按鈕） | **只有 aware-wave.com** | `lobster-factory/packages/aware-wave-store-plugin/` | `awarewaveai-pei/aware-wave-store`（私有） |

push tag `v*` 到發佈正本 → Action 出 zip + Release。0.19.0 前收費程式在 wp-bridge 裡（`includes/Billing/`），2026-10-25 拆出（WORKLOG 當日）。

**只 push Work ≠ 發版。** 操作者從 `aware-wave-wp-bridge` 的 **Releases** 下載 zip 安裝；Work 動了但沒打 tag，操作者那邊不會更新 → 會問「第 N 版在哪？」

發佈機制：正本的 `.github/workflows/release.yml`，trigger = `push tags: ['v*']`，build = 複製 `<slug>.php` + `includes/` + `README.md` 進 `build/<slug>/`，zip 成 `<slug>-vX.Y.Z.zip`，用 `softprops/action-gh-release` 建 Release。約 15s 完成。正本另有 `ci.yml` 跑 phpunit；發版腳本連 `tests/`、`phpunit.xml`、`composer.json` 一起鏡像，CI 才是在測要出貨的那份。

## 標準流程

```bash
# 1. 在 Work 副本改好 code + bump 版本（header Version: 與 AWBRIDGE_VERSION／AWSTORE_VERSION define 兩處）
#    通過 R0 四動作（php -l / critic / 抓蟲 / WORKLOG），commit + push Work main

# 2. 一鍵發版（同步正本 + tag + 驗證 Release）；--plugin 預設 bridge
bash scripts/release-wp-bridge.sh [--plugin store] --dry-run    # 先看會同步什麼
bash scripts/release-wp-bridge.sh [--plugin store]              # 真發版
```

腳本守門：版本兩處一致、`php -l`、tag 已存在則拒（release immutable）、發版後輪詢確認 zip asset 真的掛上。

## 操作者端

1. 先看：`powershell -ExecutionPolicy Bypass -File .\scripts\rollout-wp-bridge.ps1 -DryRun`（列出主機上每個裝了 wp-bridge 的網站與版本；自動探索，不靠名單）。
2. 升級全部：`powershell -ExecutionPolicy Bypass -File .\scripts\rollout-wp-bridge.ps1`（High：每站 DB 備份 → 舊外掛資料夾備份 → `wp plugin install --force` → 檢查版本／`/health`／首頁；失敗自動還原舊版、exit 1；備份在 `/root/backups/wordpress/`）。
3. 客戶站（soulful 等）另跑 `/client-status` 與 `/playwright client <slug>`（AGENTS.md §7 Client site DoD）。
4. wp-bridge 是**所有網站共用**：發版後必 rollout，不能只升 aware-wave.com。只有本機主機以外的網站才用後台「上傳外掛」覆蓋。
5. AwareWave 收費功能在 `aware-wave-store` 外掛，**只裝 aware-wave.com**。順序：**先**裝 store（wp-bridge 0.18.x 還在時它待命），**再**升 wp-bridge 0.19.0+；反過來的話 bridge rollout 會拒升該站（有 `aware_wave_payments_enabled` 但沒有 store）。首次 `rollout-wp-bridge.ps1 -Plugin store -Install -Site lobster-wordpress`；之後升級 `-Plugin store`（只升已裝的網站，永遠不會裝到客戶站；`-Install` 沒有 `-Site` 會被拒）。設定頁在 WooCommerce → AwareWave 付款與會員。wp-bridge 0.18.x 還在時商店外掛自動待命（防同一筆付款送兩次），升到 0.19.0 即接手。

## 排查

| 症狀 | 處置 |
|------|------|
| Releases 看不到新版 | 沒打 tag 或 tag 推到了 Work（錯 repo）。跑 `scripts/release-wp-bridge.sh` 重發 |
| `version mismatch` | `aware-wave-wp-bridge.php` header 與 define 版號不同，改一致 |
| `release vX.Y.Z already exists` | 版號發過了（immutable），bump 版號重來 |
| Action 失敗 | `gh run list -R awarewaveai-pei/<slug> --workflow=release.yml` 看 log |
| aware-wave.com 後台「AwareWave 商店外掛待命中」 | wp-bridge 還是 0.18.x：跑 bridge rollout 升到 0.19.0 |
| zip 裝上但功能沒出現 | 確認 zip 內含新 `includes/` 檔；清外掛快取/重新啟用外掛 |

## 相關

- 指令：`.claude/commands/wp-bridge-release.md`
- 腳本：`scripts/release-wp-bridge.sh`（發版，`--plugin bridge|store`）、`scripts/rollout-wp-bridge.ps1`（裝到網站，`-Plugin bridge|store`）
- 端點現況：`POST /post` `/option/{name}` `/product`（v0.7.0+）、`GET /health` `/blocks`
