# Repo 內「範本／templates」一覽（SSOT）

> **目的**：本庫多處出現 `templates` 字樣，**語意不同**。此檔為 **索引正本**；除非要消除特定混淆，**不必**把每一層目錄都改名（`docs/templates` 等合約範本目錄為業界常見用法，改名成本高、連結多）。

## 快速對照

| 路徑（相對 `agency-os/` 或 monorepo） | 用途 | 誰會複製／執行 |
|----------------------------------------|------|----------------|
| **`tenants/templates/`** | 新 **租戶** `company-*`：tenant/site/core/industry 複製起點 | 營運／導入（見 `tenants/NEW_TENANT_ONBOARDING_SOP.md`） |
| **`platform-templates/`** | **對人輔材**：Woo 範例 JSON、示範 shell、`client-base` 一頁紙；**非**租戶台帳、**非**可執行 manifest SSOT（見目錄內各 `README.md`） | 培訓／簡報／playbook；**機器驗證**用 manifest／shell 見 **`../lobster-factory/packages/manifests/`**、**`../lobster-factory/templates/woocommerce/scripts/`** |
| **`docs/templates/`** | **MSA / SOW / CR** 等中文合約與變更範本 | 法務／商務填寫後交付 |
| **`docs/product/templates/`** | **英文化**提案／SOW／月報等對客範本 | 商務／交付 |
| **`../lobster-factory/templates/woocommerce/scripts/`** | **龍蝦** staging manifest 安裝／rollback 等 **shell**（程式解析路徑） | CI / `installManifestStaging`／bootstrap 驗證 |
| **`../lobster-factory/packages/manifests/`** | **Manifest JSON 權威**（如 `wc-core.json`） | apply-manifest／dryrun／閘道 |

## 是否還要把 `docs/*/templates` 改名？

**預設不要。** 與先前 **`agency-os/templates` vs `tenants/templates`** 的混淆不同：`docs/templates` 已在 **`docs/`** 樹下，路徑一眼可知是「文件範本」，不與租戶目錄平級搶名稱。

若未來要改名，建議 **整包遷移 + 一鍵替換鏈結** 的專案（例如改為 `docs/legal-contract-stubs/`），並跑 `doc-sync`／連結檢查；不必混在一起做小步改名。

## Related

- [`../architecture/decisions/001-wordpress-manifest-and-shell-ssot.md`](../architecture/decisions/001-wordpress-manifest-and-shell-ssot.md)（manifest／shell SSOT）
- [`../architecture/decisions/003-no-automated-manifest-dual-sync.md`](../architecture/decisions/003-no-automated-manifest-dual-sync.md)（否決自動雙邊同步）
- [`LONG_TERM_OPERATING_DISCIPLINE.md`](LONG_TERM_OPERATING_DISCIPLINE.md)
- [`platform-templates/README.md`](../../platform-templates/README.md)；[`platform-templates/SSOT_LINKS.md`](../../platform-templates/SSOT_LINKS.md)、[`platform-templates/SYNC_EXAMPLES_FROM_LOBSTER.md`](../../platform-templates/SYNC_EXAMPLES_FROM_LOBSTER.md)
- [`tenants/README.md`](../../tenants/README.md)
- [`ecommerce-project-playbook.md`](../operations/ecommerce-project-playbook.md)
