# Department coverage matrix (Enterprise-scale)

> **Owner (tenant SSOT):** this file maps **「企業多部門」關注點**到 `tenants/company-*/` 內**應填哪裡**，避免在多份文件重複貼同一段長文。  
> **規則：** 細部政策以 `agency-os/docs/operations/*` 為準；此處只做 **路由與必填欄位提醒**。

## 客戶「選部門」放哪裡

- **選型（ChatGPT 式 17+ 模組、可開案子集、可日後擴充）**：**`DEPARTMENT_CLUSTER_CATALOG.md`** + 每租戶 **`core/DEPARTMENT_SELECTION.json`**（範本：`DEPARTMENT_SELECTION.example.json`）。  
- **本檔（矩陣）**：維持 **15 列交付歸桶**；列 **Notes** 與 `N/A` 與選型檔 **同步**，避免口頭與檔案不一致。

## 模板優先，再套到客戶（既有站或全新皆同）

**建議順序：** 先把 `**tenants/templates/*`**（含 `core/`、`tenant-template/`、`site-template/`、`industry/*`）當 **唯一成熟版本** → 開案時 **複製到** `tenants/company-<slug>/` → 再依「代操／加功能／擴充」只多寫 **專案與站點層**（`projects/`、`sites/`），不要從某一家客戶反向長出第二套模板。

- **既有網站代操、加強、擴充**：同一套 tenant 骨架；差別在 `ENVIRONMENT_REGISTRY`（prod 已存在）、`BACKUP/RELEASE`、`WORDPRESS_CLIENT_DELIVERY_MODELS` 的 staging-first。
- **全新公司**：同一套骨架；差別多在時程與 provision，矩陣仍可用「N/A + 原因」精簡。

## 產業怎麼分

- **橫向（全客戶共用）**：`templates/core/`、`tenant-template/`、交付／資安 SSOT（`docs/operations/`*）。
- **縱向（產業加掛）**：`templates/industry/<產業>/`，複製到租戶的 `industry/`（目前示例：travel、therapy）。新產業 = **新增 overlay 檔**，不要複製整份 tenant 再改到分叉。

## 「17」還是「20」個部門？可以選嗎？與計價

- **沒有預設「客戶一定有 17」或「一定有 20」**。表頭「17–20」只是描述 **中大型組織常見「功能部門」數量級**；實務上已 **歸桶** 成下列 **固定列數的「部門簇」**（列數 = 计價／範圍討論的單位，而非客戶 org chart 線條數）。
- **每一列（部門簇）都可以對客戶標成不適用**：在 **Notes** 寫 `N/A — <原因>`；合規上仍須保留的（例如資安底線）留在 `必` 欄對應的 **repo 政策／合約**，不在此檔討價豁免。
- **作為計價維度（建議做法）**：用 **「啟用幾個部門簇」** 或 **「必欄 only vs 必+建議深度（含跨境索引）」** 當 **加價模組**，比硬算「17 vs 20」穩定——因為真實公司部門數本来就不等於治理範圍。

## 怎麼用

1. 新 tenant：`NEW_TENANT_ONBOARDING_SOP.md` 會一併複製本檔到 `core/`。
2. 依客戶規模與**合約啟用範圍**勾選：**SMB** 通常只落實「必」欄；**跨國／企業／加價治理包** 再補「建議」欄與 `CROSS_BORDER_GOVERNANCE` 深度。
3. 若某部門簇不適用，在該列 **Notes** 寫 `N/A — <原因>`（並在報價單／SOW 對應同一敘述，避免口頭與檔案不一致）。

## 矩陣（部門簇 → 主檔 → 必／建議）


| 部門簇（常見多部門組織 **歸桶**；非字面上的 17 或 20 格） | 主檔（tenant 內）                                                          | 必（所有付費客戶）              | 建議（跨國／多法人／強合規）          | Notes                                               |
| ----------------------------------- | --------------------------------------------------------------------- | ---------------------- | ----------------------- | --------------------------------------------------- |
| 董事／策略／治理                            | `PROFILE.md`                                                          | 商業目標、Out of Scope、風險標記 | 決策窗口、升級路徑               |                                                     |
| 財務／管理會計                             | `FINANCIAL_LEDGER.md`                                                 | 收入列、成本類別、毛利            | 多幣別、付款條件、發票抬頭（不含稅務法律意見） |                                                     |
| 稅務／關務（資訊橋）                          | `core/CROSS_BORDER_GOVERNANCE.md`                                     | —                      | 課稅地、申報責任、外部顧問狀態         | **不**在此檔給稅務結論                                       |
| 法務／合規                               | `core/CROSS_BORDER_GOVERNANCE.md`                                     | —                      | 適用法域、DPA 狀態、外部審閱        | 細節政策見 `docs/operations/`*                           |
| 資安／IT／身分                            | `ACCESS_REGISTER.md`、`core/ENVIRONMENT_REGISTRY.md`                   | MFA、密鑰位置、輪替、環境 URL     | 身分供應商、稽核證據路徑            |                                                     |
| 採購／供應商／外包                           | `core/CROSS_BORDER_GOVERNANCE.md`、`FINANCIAL_LEDGER.md`               | 外包成本列帳                 | 子處理者清單、主約與附件索引          | 見 `docs/operations/outsourcing-vendor-scorecard.md` |
| 人資（交付觸及時）                           | `PROFILE.md`、專案 `10_DISCOVERY.md`                                     | 利害關係人                  | 培訓／權限交接責任               | 不存個資原文                                              |
| 營運／客服／交付                            | `04_OPERATIONS_AUTOMATION_GUIDE.md`、`core/RELEASE_GATES_CHECKLIST.md` | 排程、放行 gate             | SLO、值班與升級               |                                                     |
| 行銷／成長                               | `site-template/OPS_GROWTH_PLAN.md`                                    | 量測與目標                  | 法遵（追蹤、同意）與 `industry/*` |                                                     |
| 產品／數位通路                             | `site-template/SYSTEM_REQUIREMENTS.md`、專案 brief                       | 關鍵流程                   | 整合清單、API 責任邊界           |                                                     |
| 工程／開發／基礎建設                          | `03_TOOLS_CONFIGURATION_GUIDE.md`、Step 7 Lobster                      | 工具與環境                  | Staging 為真相、變更證據        | 見 `WORDPRESS_CLIENT_DELIVERY_MODELS.md`             |
| 資料／隱私／留存                            | `core/CROSS_BORDER_GOVERNANCE.md`、`ACCESS_REGISTER.md`                | —                      | 個資角色、留存、跨境傳輸機制          |                                                     |
| 風險／資安事件                             | `PROFILE.md`、`ACCESS_REGISTER.md`                                     | 風險標記                   | 事件通報鏈、證據保存              | 見安全政策與 runbook                                      |
| 對外溝通／品牌                             | `SITE_PROFILE.md`、`PROFILE.md`                                        | 品牌與語系                  | 多市場訊息責任                 |                                                     |
| 投資人關係／IR                            | `PROFILE.md`                                                          | —                      | `N/A` 或窗口索引             | 多數 SMB 不適用                                          |


## 與 Next-Gen 藍圖的對齊

- **M1**：環境與交付標準化 → 本矩陣 + `ENVIRONMENT_REGISTRY` + `RELEASE_GATES`。  
- **M2**：放行／回滾證據化 → `BACKUP_RESTORE_PROOF` + 專案 execution plan。  
- **M3**：控制台化 → 本矩陣欄位應可在狀態報表機械汇总（未來腳本對照此檔欄位語意）。

## Related (repo SSOT, do not duplicate body here)

- `DEPARTMENT_CLUSTER_CATALOG.md`（**cluster_id** 選型與對照本矩陣列鍵）
- `DEPARTMENT_SELECTION.example.json`
- `docs/operations/NEXT_GEN_DELIVERY_BLUEPRINT_V1.md`
- `docs/operations/WORDPRESS_CLIENT_DELIVERY_MODELS.md`
- `docs/operations/outsourcing-vendor-scorecard.md`
- `docs/operations/security-secrets-policy.md`

