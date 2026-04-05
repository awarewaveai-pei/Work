# ADR 003: 否決「manifest 自動雙邊同步」（除非未來專案與新 ADR）

- **狀態**：已接受
- **日期**：2026-04-02

## 脈絡

- ADR 001 已定：**權威 manifest** 在 **`lobster-factory/packages/manifests/`**；**`agency-os/platform-templates/woocommerce/manifests/`** 為 **輔材**。
- 仍可能出現聲音：用腳本 **自動雙向同步** 兩邊 JSON，以免「對客範例」落後。

## 決策

1. **在未有專用「發布管線」與負責人之前**：**不**導入 **`platform-templates` ↔ `packages/manifests` 的雙向自動同步**（含雙向 git hook、排程互寫、IDE 外掛暗寫）。
2. **允許**的唯一低成本路徑：
   - **人為單向**：在 **`packages/manifests/`** 改權威 → 需要時 **手動**更新或刪除 AO 側易漂移副本，並在 `WORKLOG` 留一句。
   - **未來若要做機械化**：僅允許 **單向**（例如 CI 從 packages **生成**只讀副本到 `platform-templates`），且必須 **新 ADR** 定義觸發條件、誰可 merge、失敗時行為。
3. **禁止**：讓 `platform-templates` 的編輯 **回寫** `packages/manifests/` 而無 code review／閘道（會繞過龍蝦驗證心智模型）。

## 後果

### 正面

- 避免「兩邊互寫」造成的 **silent drift**、合併衝突與 **非預期上線 manifest**。
- 維持 **單一編輯慣例**：會跑進閘道的檔只從 **packages** 進。

### 負面／代價

- 對客／對內輔材可能 **暫時落後**權威檔——以 **文件註記 SSOT** 與 **手動更新** 償付，而非自動化複雜度。

### 需跟進文件／腳本

- `docs/architecture/decisions/001-wordpress-manifest-and-shell-ssot.md`
- `docs/overview/repo-template-locations.md`、`platform-templates/README.md`

## Related

- ADR 001
