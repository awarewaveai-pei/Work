# 示例 manifest（非 SSOT）

## 本目錄與龍蝦權威的對齊現況

- **`lobster-factory/packages/manifests/`** 目前（以 repo 為準）僅含 **`wc-core.json`**。
- 此處 **`wc-core.json`** 應與該檔 **內容一致**（依 [`../../SYNC_EXAMPLES_FROM_LOBSTER.md`](../../SYNC_EXAMPLES_FROM_LOBSTER.md) 單向覆寫）。
- **`ecommerce-project-playbook.md`** 等文件中的 `wc-crm`、`wc-loyalty` 等為 **組合／暱稱敘述**，**不一定**對應本目錄已存在的 JSON；若未來龍蝦新增同名權威檔，再納入同步。

## 用途

- 對客簡報、團隊 onboarding、對照 **manifest schema**（steps／guardrails／verification）。

**若要改「會被龍蝦執行／閘道驗證」的內容**，請編輯 **`lobster-factory/packages/manifests/`**，並跑 monorepo 根 **`verify-build-gates.ps1`**。

**勿**只在這裡改 JSON 就以為 staging／production 行為已更新。
