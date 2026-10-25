---
name: wp-bridge-release
disable-model-invocation: true
description: Release a new aware-wave-wp-bridge (every site) or aware-wave-store (aware-wave.com only) plugin version — sync Work monorepo to the release repo, tag, and verify the GitHub Release + installable zip published.
---

# /wp-bridge-release

Ship a new plugin version end-to-end: `aware-wave-wp-bridge` (default; every managed site) or, with `--plugin store`, `aware-wave-store` (AwareWave's own payments / member checks; aware-wave.com only, release repo `awarewaveai-pei/aware-wave-store`, Work copy `lobster-factory/packages/aware-wave-store-plugin/`, version `AWSTORE_VERSION`).

## 為什麼需要這個指令

外掛有**兩個 GitHub repo**，曾經害一個 session 繞錯路：

| repo | 角色 |
|------|------|
| `awarewaveai-pei/Work` | monorepo **開發副本**：`lobster-factory/packages/wp-bridge-plugin/`（平常改這裡） |
| `awarewaveai-pei/aware-wave-wp-bridge` | **發佈正本**：push tag `v*` → `.github/workflows/release.yml` 打包 `aware-wave-wp-bridge-vX.Y.Z.zip` 並建 GitHub Release。**操作者安裝的是這顆 zip** |

只改 Work 副本 → 操作者那邊**永遠不會更新**（release 沒動）。本指令自動把 Work → 正本同步、打 tag、並驗證 Release + zip 真的出現。

## 前置（呼叫前先做）

1. 在 Work 副本 `lobster-factory/packages/wp-bridge-plugin/` 改好程式碼，**通過 R0 四動作**（lint / critic / 抓蟲 / WORKLOG）。
2. **bump 版本**：`aware-wave-wp-bridge.php` 的 `Version:` header **和** `AWBRIDGE_VERSION` define 兩處都要改成新版號（SemVer：新功能 minor、修 bug patch、破壞相容 major）。腳本會檢查兩處一致。
3. 把 Work 的改動 commit + push 到 Work main（這是開發紀錄；腳本只負責鏡像到正本）。

## 執行

```bash
# 先 dry-run 看會同步什麼、不 push 不 tag
bash scripts/release-wp-bridge.sh [--plugin store] --dry-run

# 確認無誤後真的發版
bash scripts/release-wp-bridge.sh [--plugin store]
```

腳本流程：版本解析+兩處一致檢查 → `php -l` gate → 防重複發版守門（tag 已存在則拒）→ clone 正本 → 鏡像 `<slug>.php` + `includes/` + `README.md` + `tests/` + `phpunit.xml` + `composer.json`（正本 CI 測真正出貨的那份）→ commit/push main → tag `vX.Y.Z` + push tag → 輪詢驗證 Release + zip asset（~90s 內）。

## 完成後告訴操作者

- Release URL：`https://github.com/awarewaveai-pei/aware-wave-wp-bridge/releases/tag/vX.Y.Z`
- wp-bridge：rollout 到**所有**裝了它的網站：`.\scripts\rollout-wp-bridge.ps1 -DryRun` → `.\scripts\rollout-wp-bridge.ps1`（High；流程與客戶站驗收見 `runbooks/WP-BRIDGE-RELEASE-RUNBOOK.md`「操作者端」）
- store：只有 aware-wave.com。首次：`.\scripts\rollout-wp-bridge.ps1 -Plugin store -Install -Site lobster-wordpress -DryRun`；之後：`-Plugin store -DryRun`；確認後不帶 `-DryRun`（High）。商店外掛要**先**裝好並啟用，wp-bridge 才能升到 0.19.0+（rollout 會擋）。

## 失敗排查

- `version mismatch` → header 與 define 版號不同，改一致再跑。
- `release vX.Y.Z already exists` → 該版號已發過（release immutable），bump 版號重來。
- `did not publish a zip within timeout` → `gh run list -R awarewaveai-pei/aware-wave-wp-bridge --workflow=release.yml` 看 Action 失敗原因。
