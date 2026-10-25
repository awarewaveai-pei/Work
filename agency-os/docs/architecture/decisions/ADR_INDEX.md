# Architecture decisions（輕量 ADR）

> **何時寫**：跨系統邊界、**不可逆**或 **高成本迴轉** 的選擇（例如 manifest SSOT、主機遷移、身分方案、資料主庫）。  
> **何時不寫**：單檔 typo、小重構、明顯 bugfix——`WORKLOG` 一句即可。

## 格式（複製新建 `NNN-short-title.md`）

```markdown
# ADR NNN: 標題

- 狀態：提案 / 已接受 / 廢止（取代者：連結）
- 日期：YYYY-MM-DD

## 脈絡
（問題是什麼、約束是什麼）

## 決策
（選了什麼，一句話）

## 後果
- 正面：
- 負面／代價：
- 需跟進文件／腳本：（路徑列表）
```

## 已定案索引

| ADR | 標題 | 日期 |
|-----|------|------|
| [001-wordpress-manifest-and-shell-ssot.md](001-wordpress-manifest-and-shell-ssot.md) | WordPress manifest 與 staging install shell 的 SSOT | 2026-04-02 |
| [002-clerk-identity-boundary.md](002-clerk-identity-boundary.md) | 應用層身分預設 Clerk（邊界與非目標） | 2026-04-02 |
| [003-no-automated-manifest-dual-sync.md](003-no-automated-manifest-dual-sync.md) | 否決 manifest 自動雙邊同步（預設） | 2026-04-02 |
| [004-trigger-vs-n8n-orchestration-boundary.md](004-trigger-vs-n8n-orchestration-boundary.md) | 耐久編排 Trigger；n8n 僅黏著層 | 2026-04-02 |
| [005-supabase-sor-vs-wordpress-runtime-db.md](005-supabase-sor-vs-wordpress-runtime-db.md) | SoR 在 Supabase；WP DB 為執行期 | 2026-04-02 |
| [006-supabase-tenant-isolation-and-clerk-mapping.md](006-supabase-tenant-isolation-and-clerk-mapping.md) | 多租戶 RLS + Clerk 對照原則 | 2026-04-02 |
| [007-wp-bridge-ed25519-and-reversibility-gating.md](007-wp-bridge-ed25519-and-reversibility-gating.md) | wp-bridge Ed25519 簽章 + 可逆性分類門控 | 2026-06-05 |
| [008-pod-fulfillment-native-store-over-plugin.md](008-pod-fulfillment-native-store-over-plugin.md) | POD 履約走 Native store（不走 Printful 外掛）；新客戶 native、soulful 不遷移 | 2026-06-16 |
| [009-ai-video-director-dual-engine.md](009-ai-video-director-dual-engine.md) | AI 影片導演：雙引擎共存 + 單一 composition 幀段平行渲染 | 2026-06-28 |
| [010-wp-site-contract-provisioning-architecture.md](010-wp-site-contract-provisioning-architecture.md) | WP 站台 Site Contract 佈建架構（五層 registry/contract/reconciler/installer/drift-watcher） | 2026-06-29 |
| [011-collection-ingestion-boundary.md](011-collection-ingestion-boundary.md) | 蒐集分 Signal/Corpus/Evidence 三類；KB 先模組化後服務化；collect/sink 積木 + 編排器（提案） | 2026-09-10 |
| [012-shared-platform-layer.md](012-shared-platform-layer.md) | 共用平台層：QUOTA/RATE_LIMIT/SAFETY_GATE 三類上限、帳本泛化、上架機械閘、跨產品版本相容（已接受） | 2026-09-10 |
| [013-open-web-discovery-into-corpus.md](013-open-web-discovery-into-corpus.md) | 開放式 discovery 可進 Corpus，但只產生「候選來源」，經人核准才成為 seed；核准單位是來源不是文件（已接受） | 2026-09-11 |
| [014-entity-dossier-relevance-axis.md](014-entity-dossier-relevance-axis.md) | 背景調查的單位是實體不是查詢；相關性是與抽取品質並列的第二條軸，由 orchestrator 擁有；`off_entity` 獨立 bucket（已接受） | 2026-09-20 |
| [015-awarewave-account-and-shared-wallet.md](015-awarewave-account-and-shared-wallet.md) | AwareWave 一個帳號一個錢包：WordPress 管會員和收費（WooCommerce＝012 的金流），點數記在 012 的共用帳本，照用量扣、不退；認知平台第一個接（已接受，未實作） | 2026-10-12 |
| [016-social-manager-third-product.md](016-social-manager-third-product.md) | 社群管理是第三個產品：排程資料在我們的資料庫、Postiz 只負責送出、所有品牌共用一台 Postiz 但 key 不出伺服器；先自己管多品牌再開放訂閱；樣稿＝規格、樣式只來自 app globals.css；收件匣＝Chatwoot（提案，等樣稿定案） | 2026-10-14 |
| [017-entitlements-and-self-hosted-modules.md](017-entitlements-and-self-hosted-modules.md) | 客戶怎麼買：線上用權利表（訂閱／試用／贈送＋點數，功能級簽章許可，方案是資料、價格在 Woo）；買斷＝一鍵架站到客戶主機、用客戶自己的 API、模組選購、離線授權檔；客戶既有網站是接進來的來源（已接受） | 2026-10-14 |
| [018-product-doors-and-buyout-delivery.md](018-product-doors-and-buyout-delivery.md) | 產品交付三扇門：aware-wave.com（WordPress）收錢與會員、`<產品>.aware-wave.com` 給付費客戶只見該產品與自己的品牌、app.aware-wave.com 給員工；網址與登入來源由 `products.ts`＋環境變數決定，買斷同一份程式換設定裝到客戶網域；測試擋漏填（已接受） | 2026-10-15 |
| [019-staff-tool-grants.md](019-staff-tool-grants.md) | 員工逐工具權限：擁有者替每位員工勾選工具（一產品一格、一後台頁一格），存 `app_metadata.staff_tools`；側欄、網址、API 同一個判斷；擁有者永遠全部；先 shadow 只記錄，操作者同意才擋（已接受） | 2026-10-24 |

## 本機檢查（可選）

在 **`agency-os/`** 根目錄：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-adr-index.ps1
```

若新增 ADR 檔却未更新上表，腳本會 **FAIL**。**`verify-build-gates`**（monorepo 根）已內建此步驟，與 `system-health-check` 銜接。

## 與其他檔的關係

- **摘要與證據**：仍寫入 `WORKLOG.md`（含 PR／ticket／日期）。
- **長期憲章級原則**：`docs/overview/LONG_TERM_OPERATING_DISCIPLINE.md`
- **連動檢查**：新 ADR 若影響治理／健康閘道，照 `docs/CHANGE_IMPACT_MATRIX.md` 更新關聯檔。

## Related

- `docs/overview/LONG_TERM_OPERATING_DISCIPLINE.md`
- `docs/releases/upgrade-path.md`

## Related Documents (Auto-Synced)
- `docs/operations/GOVERNED_SYSTEM_BUILD_SOP.md`

_Last synced: 2026-10-24 20:49:09 UTC_

