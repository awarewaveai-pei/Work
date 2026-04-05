# ADR 001: WordPress manifest 與 staging install shell 的單一真相（SSOT）

- **狀態**：已接受
- **日期**：2026-04-02

## 脈絡

- Monorepo 同時存在：
  - **龍蝦工廠**內 **`packages/manifests/*.json`**（bootstrap／dryrun／apply-manifest 驗證鏈依此為準）。
  - **龍蝦工廠**內 **`templates/woocommerce/scripts/*.sh`**（`installManifestStaging` 以 **lobster-factory repo root** 解析路徑）。
  - **Agency OS** 內 **`platform-templates/woocommerce/manifests/`**（範例／對客說明用 JSON，schema 與權威檔不必 1:1 同步）。
- 風險：若團隊誤以 AO 下路徑為「可執行權威」，會與閘道、executor 實際行為 **分叉**，造成「文件寫一套、機器跑一套」。

## 決策

1. **Manifest JSON（可驗證、可進 bootstrap／routing 者）** 以 **`lobster-factory/packages/manifests/`** 為 **SSOT**。
2. **Staging install／rollback shell** 以 **`lobster-factory/templates/woocommerce/scripts/`** 為 **SSOT**（與 `resolveInstallScriptPath` 一致）。
3. **`agency-os/platform-templates/woocommerce/manifests/`** 定位為 **草案／示例／對外說明輔材**；若與 SSOT 內容分歧，**以龍蝦 packages 為準**，並在 playbook／`repo-template-locations` 維持敘述一致。
4. **若要「單一檔案雙邊共用」**：須另開 ADR 與遷移（複製、 symlink、或建置時 sync），**預設不做**隱性雙寫。

## 後果

### 正面

- 執行路徑與 `verify-build-gates`／bootstrap 一致，降低三十年維運中的「路徑考古」成本。
- 新同仁只需記：**改會被機器跑的 manifest → 改 `lobster-factory/packages/manifests/`**。

### 負面／代價

- 對客簡報若引用 AO 下 JSON，可能與上線 manifest **版本漂移**——須在文件註明 SSOT 或在發版流中更新輔材（人類流程責任）。

### 需跟進文件／腳本

- `docs/overview/repo-template-locations.md`
- `agency-os/platform-templates/README.md`
- `agency-os/docs/operations/ecommerce-project-playbook.md`
- `lobster-factory/README.md`、`lobster-factory/docs/WORDPRESS_FACTORY_EXECUTION_SPEC.md`（若敘述與本 ADR 衝突時以本 ADR 更新龍蝦側 docs）

## Related

- ADR 003（否決自動雙邊同步）
- `docs/overview/repo-template-locations.md`
- `lobster-factory/packages/workflows/src/executor/installManifestStaging.ts`
- `lobster-factory/scripts/bootstrap-validate.mjs`
