# 將「龍蝦權威 manifest」手動同步到本目錄範例（單向）

> **為什麼要這份文件**：`woocommerce/manifests/*.json` 僅供 **說明／培訓**；與 **`lobster-factory/packages/manifests/`** 難免漂移。  
> **為什麼不自動**：**ADR 003** 否決隱性雙寫；同步必須是 **明確、可審計** 的人類步驟（或將來獨立 ADR + CI job）。

## 何時做

- 龍蝦側 **`wc-*.json` 釋出或大改**後，要更新對外簡報／內訓範例。
- 發現本目錄範例與 dryrun／staging **敘述明顯不符**時。

## 建議步驟（Windows／PowerShell）

在 **monorepo 根**（含 `agency-os/` 與 `lobster-factory/` 的那層）開終端：

```powershell
$Root = git rev-parse --show-toplevel
$Lobster = Join-Path $Root "lobster-factory\packages\manifests"
$Examples = Join-Path $Root "agency-os\platform-templates\woocommerce\manifests"
# 將龍蝦目錄內所有 wc-*.json 單向覆寫到範例目錄（檔名須一一對應）
Get-ChildItem -Path $Lobster -Filter "wc-*.json" -File | ForEach-Object {
  Copy-Item -Path $_.FullName -Destination (Join-Path $Examples $_.Name) -Force
}
```

**截至實作當下**，權威目錄通常僅 **`wc-core.json`**；若日後新增多檔，上列迴圈會一併複製。

## 做完後必做

1. **目視 diff**：`git diff agency-os/platform-templates/woocommerce/manifests`
2. **跑閘道**：monorepo 根 `.\scripts\verify-build-gates.ps1`
3. **提交說明** 寫清楚：`chore(platform-templates): refresh example manifests from lobster SSOT`

## 不要做的事

- **不要**反過來從 `platform-templates` 覆寫 **`lobster-factory/packages/manifests/`**。
- **不要**在未跑閘道、未審視 diff 的情況下大批次改 JSON。
- **不要**在本目錄保留 **龍蝦不存在的 `wc-*.json`** 卻宣稱「已與 SSOT 對齊」——易誤導 schema；組合暱稱請留在 playbook 敘述層。
