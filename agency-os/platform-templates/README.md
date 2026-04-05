# Platform templates（Agency OS 輔材層，非執行權威）

> **速成**：本目錄 **不做**租戶台帳、**不做**可執行 manifest 權威；只做 **人類讀得懂的範例＋一頁紙＋同步說明**。索引連結集中：`SSOT_LINKS.md`；範例 JSON 如何與龍蝦對齊：`SYNC_EXAMPLES_FROM_LOBSTER.md`。

## 現在「功能」是什麼？（三句話）

1. **教學／提案**：Woo 相關 **示例 manifest**，讓非工程也能看懂「工廠在裝什麼」。
2. **起手草稿**：`client-base/` 給 **非 `tenants/company-*`** 的一頁紙＋連回 SOP／閘道；真正租戶仍落在 **`tenants/`**。
3. **邊界聲明**：隨處提醒「執行權威在龍蝦」；避免把這裡當 **dryrun／staging 唯一依據**。

## 理想狀態自查（維運者勾選）

| # | 條件 | 現狀 |
|---|------|------|
| 1 | 根 **README** 說清 AO／龍蝦／本目錄三角關係 | 已有 |
| 2 | **子目錄 README** 重複警語（manifest／腳本非 SSOT） | 已有 |
| 3 | **集中連結** 一頁，新人不用猜路徑 | **補 `SSOT_LINKS.md`** |
| 4 | **手動同步範例** 步驟（符合 ADR 003，不二寫自動） | **補 `SYNC_EXAMPLES_FROM_LOBSTER.md`** |
| 5 | `client-base` 連到 **project-kit** 與 **長期紀律** | **補連結** |
| 6 | 與 **ADR 001／repo-template-locations** 敘述不打架 | 持續對照 |

## 在整個系統裡，這層是做什麼的？

| 平面 | 正本在哪裡 | 和本目錄的關係 |
|------|------------|----------------|
| **Agency OS** | `tenants/*`、SOP、WORKLOG、TASKS、`docs/operations/*` | **客戶邊界、合約節奏、釋出閘道**；新公司等著被抄進 `tenants/company-*` |
| **龍蝦工廠（執行）** | `lobster-factory/packages/manifests/`、`lobster-factory/templates/woocommerce/scripts/`、Trigger／workflow 閘道 | **會被機器跑的 manifest 與 staging install shell**；bootstrap／`verify-build-gates` 依此驗證 |
| **`platform-templates/`（本目錄）** | 補充說明＋範例 JSON＋極簡 `client-base` | **對人說明、培訓、提案附錄、本機草案**；**不**與龍蝦 SSOT 競爭 |

**一句話**：Agency OS 管「哪個客戶、怎麼交付」；龍蝦管「照 manifest 怎麼裝、怎麼驗」；`platform-templates` 管「新人／客戶從哪裡看懂 Woo 堆疊與流程」，**不**當成單一真相目錄。

## 三十年尺度下，為什麼要保留這層？

- **Single Owner**：可執行 manifest／shell 的敘述與路徑只在 **ADR 001** 與 `repo-template-locations.md`；本 README 是 **`platform-templates` 目錄本身的用途說明**，不重複貼滿套規格。
- **Boring / 可交接**：若把「教學用 JSON」塞進龍蝦 packages，會混淆 CI 與對外範例；獨立一層，**權責清楚**。
- **可驗證**：真正會壞在閘道上的是 **龍蝦側**檔案；這裡若跟權威漂移，**以龍蝦為準**，並在子目錄 README 再次警語。

## 子目錄

| 路徑 | 用途 | 禁止誤用 |
|------|------|----------|
| `woocommerce/manifests/` | **示例 JSON**（schema 參考、簡報、對客說明） | **勿**當 production 或 dryrun 唯一依據；修改行為請改 **`../../lobster-factory/packages/manifests/`**（monorepo 根下） |
| `woocommerce/scripts/` | **歷史／示範**入口（可能與龍蝦 `templates/woocommerce/scripts/` 並陳） | **實際 executor 解析路徑** 以 **龍蝦 repo** 與 `installManifestStaging` 為準 |
| `client-base/` | **非** `company-*` 的極簡「專案卡」骨架；連回租戶與 SOP | **勿**把租戶台帳放在這裡取代原 `tenants/company-*` 結構 |

## 必讀 SSOT（不要只讀本目錄）

- `docs/architecture/decisions/001-wordpress-manifest-and-shell-ssot.md`
- `docs/overview/repo-template-locations.md`
- `tenants/NEW_TENANT_ONBOARDING_SOP.md`
- `lobster-factory/docs/WORDPRESS_FACTORY_EXECUTION_SPEC.md`
- `lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`（核准與寫入 SoR）

## 若與龍蝦權威內容不一致

**以 `lobster-factory/packages/manifests/` 與 `lobster-factory/templates/woocommerce/scripts/` 為準**（路徑見 `SSOT_LINKS.md`）；本目錄應更新敘述或依 **`SYNC_EXAMPLES_FROM_LOBSTER.md`** 手動對齊範例檔——**不**開自動雙向同步（ADR 003）。

## Related（本目錄內）

- [`SSOT_LINKS.md`](SSOT_LINKS.md)
- [`SYNC_EXAMPLES_FROM_LOBSTER.md`](SYNC_EXAMPLES_FROM_LOBSTER.md)

## Related（庫內）

- `tenants/templates/`（租戶複製起點，語意不同）
- `project-kit/`（專案階段 Master Checklist，與 `client-base` 搭配閱讀）
- `docs/operations/ecommerce-project-playbook.md`
