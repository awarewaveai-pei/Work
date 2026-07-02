# 多租戶隔離 — 稽核清單 + 分階段修復計畫（app.aware-wave.com）

> **建立**：2026-06-29。**狀態**：稽核完成，待批准動工。
> **觸發**：操作者問「很多客戶一起管理，彼此串聯是否有問題」+ 確認「客戶會自助登入」。
> **決定性事實**：客戶本人會登入 → 每個 IDOR 都是真實跨租戶資料外洩，上線前必修。
> **相關**：[`APP_AWARE_WAVE_PROVISIONING_MASTER_PLAN.md`](APP_AWARE_WAVE_PROVISIONING_MASTER_PLAN.md)（總藍圖；本檔 = 其多租戶隔離收尾）。
> **設計姊妹檔**：[`S1_TENANT_IDENTITY_DESIGN.md`](S1_TENANT_IDENTITY_DESIGN.md)。

---

## 0. 一句話結論

現在沒爆是因為 app 實質只有一個預設 org（`defaultOrganizationId()` / `POD_DESIGNS_DEFAULT_ORG_ID`）。**客戶一登入、org 一變多，下列每條都引爆。** 根因是 app 全用 service-role key 連 DB（繞過 RLS），靠每個 route 手寫 `.eq('organization_id')` 過濾，且過濾多為「選填」→ 不帶參數就回全部客戶資料。

---

## 1. 根因（為什麼不能只補 `.eq()`）

- App 連線用 `getSupabaseWriteClient()`（service-role）→ **完全繞過 RLS**（`lib/supabase-server.ts`）。
- 隔離全靠各 route 自己記得加過濾。30 年內必有人漏 → 整庫外洩。
- 身分層只解析全域角色（owner/admin/operator/viewer，`middleware.ts:153`），**請求路徑無「登入者屬於哪個 org」綁定**。`organization_memberships` + RLS 機器存在但 app 沒用。
- **正解**：客戶會碰的 route 改用 user-scoped Supabase client（帶該使用者 JWT）→ 既有 RLS 自動把關；service-role 只留給真正系統/代理管理操作。防線不依賴人類記性。

---

## 2. IDOR / 洩漏清單（實掃 file:line，2026-06-29）

> 嚴重度：🔴 高（可跨租戶讀/改/刪）｜🟠 中｜🟢 已安全（記錄佐證）
> 「修法」欄：**RLS** = 改用 user-scoped client 由 RLS 把關（S2）；**MIG** = 加 org 欄位/RLS（S3）；**FILTER** = 過濾改強制（S3）；**OWN** = 寫入驗 caller 擁有該 org（S2/S3）。

### 2.1 Cold Outreach（客戶會看自己的 leads/客服 → 高敏感）

| Route | file:line | 問題 | 嚴重度 | 修法 |
|---|---|---|---|---|
| leads GET | `app/api/outreach/leads/route.ts:44,48` | org 過濾選填；單筆 `?id=` 無 org 檢查（:38）| 🔴 | RLS |
| leads POST | `outreach/leads/route.ts:138` | 寫入信任 `body.organizationId` | 🔴 | OWN |
| inbox | `outreach/inbox/route.ts:44,47,69,86` | 同上（GET 選填 + 寫入信任 body）| 🔴 | RLS+OWN |
| messages | `outreach/messages/route.ts:169` | 寫入信任 body org | 🔴 | OWN |
| followups | `outreach/followups/route.ts:40` | org 過濾選填 | 🔴 | RLS |
| suppression | `outreach/suppression/route.ts:25,27,61` | 同上 | 🟠 | RLS+OWN |
| service-profiles | `outreach/service-profiles/route.ts:48,50,76` | 同上 | 🟠 | RLS+OWN |
| connectors | `outreach/connectors/route.ts:38,44,93,102` | GET 選填 + 寫入信任 body（可把連接器塞到別客戶）| 🔴 | RLS+OWN |

### 2.2 Content / Sites（客戶看自己的站與草稿）

| Route | file:line | 問題 | 嚴重度 | 修法 |
|---|---|---|---|---|
| content/sites GET | `app/api/content/sites/route.ts` | `wp_sites` **無 `organization_id` 欄位** → 撈全部站 | 🔴 | MIG+RLS |
| content/sites/[id] PATCH/DELETE | `content/sites/[id]/route.ts:37,78` | 只憑 `id`，無 org 邊界 | 🔴 | MIG+RLS |
| content/drafts | `content/drafts/route.ts:149` | 寫入信任 `body.organizationId`；查詢 org 選填 | 🟠 | RLS+OWN |
| social-admin/connections | `content/social-admin/connections/route.ts:108` | `clientId` 從 query，無擁有檢查 | 🟠 | OWN |
| social-channels | `content/social-channels/route.ts:15` | 同上 | 🟠 | OWN |

### 2.3 Media（圖/影片，含破壞性刪除）

| Route | file:line | 問題 | 嚴重度 | 修法 |
|---|---|---|---|---|
| tools/designs GET/POST | `app/api/tools/designs/route.ts:165,349` | `body.organizationId ?? defaultOrganizationId()`（信任 body）| 🟠 | RLS+OWN |
| tools/designs DELETE | `tools/designs/route.ts:~288` | DELETE 只憑 `id`，無 org → 可刪別客戶圖 | 🔴 | OWN |
| tools/presets | `tools/presets/route.ts:50,132,234` | 信任 body/query org + default fallback | 🟠 | RLS+OWN |
| video/[id] DELETE | `app/api/video/[id]/route.ts:30,52` | fetch org 選填（:30）；實際 delete 只 `.eq("id")`（:52）| 🔴 | OWN |
| video/history | `video/history/route.ts:53` | org 過濾選填 | 🟠 | RLS |

### 2.4 Ops / Build（執行紀錄、審批、憑證）

| Route | file:line | 問題 | 嚴重度 | 修法 |
|---|---|---|---|---|
| build/runs/[id] | `app/api/build/runs/[id]/route.ts:21` | 只憑 `id` 讀 run，無 org | 🟠 | RLS |
| ops/approvals/[id]/approve\|reject | `app/api/ops/approvals/[id]/approve/route.ts:46` | 只憑 `id` 取 command_request，無 org | 🟠 | OWN |
| ops/repairs/[id]/* (archive/escalate/…) | `app/api/ops/repairs/[id]/*` | mutation 只憑 id（list view 已安全）| 🟠 | OWN |
| ops/clients/credentials | `app/api/ops/clients/credentials/route.ts:42,76` | `clientId` 從 query/body，無擁有檢查（**憑證 = 最敏感**）| 🔴 | OWN |

### 2.5 已安全（佐證，勿重工）

| Route | 為何安全 |
|---|---|
| ops/clients/[slug]/* (cs-config/cis/cs-intents…) | 用 URL slug → 先解析 org_id 再過濾，slug 不在 body |
| onboarding/intake-public | 明確強制 `organization_id: null`，不信任 body org（:65 註解）|
| webhooks/* (sentry/github/netdata/…) | server-to-server 自帶 token，非客戶可碰；middleware 已排除 |
| ops/repairs list (route.ts:46-71) | 有 role guard + 欄位白名單（Errata EMaj-3）|
| ops/summary, ops/inbox/*, ops/probe | PUBLIC_API_PATHS，自帶 Bearer，非 session |

---

## 3. 基礎設施隔離（「一站垮全垮」）

| 事實 | 證據 | 影響 |
|---|---|---|
| 目前 staging 所有客戶站擠同一台 SG `5.223.93.113`，共用 1 個 PHP-FPM + 1 個 MariaDB 容器 | `app/api/internal/hosting/provision-staging/route.ts:23`；`docker-compose.yml` | 一站被駭 → `www-data` → 讀全部客戶 wp-config |
| DB 各自分庫 `wp_s_<siteId>`（無碰撞）| `provision-staging/route.ts:34` | DB 層隔離 OK，檔案層不 OK |
| 正解：Hetzner 每客戶獨立 VPS（真機驗過 cpx12@sin）| `HetznerHostingAdapter.ts` | **未接進 app 按鈕** |
| 每客戶 SSH 金鑰持久化未接 | `secretStore.ts:70`（預設 sink throw）| Phase 4 blocker，切 dedicated 前必補 |
| 單一 Cloudflare / Hetzner / Supabase token | 多檔 | 任一外洩 = 全客戶爆炸半徑 |

---

## 4. 分階段路線（每階段獨立、可驗證、可回滾）

| Stage | 內容 | 風險 | 回滾 | Gate |
|---|---|---|---|---|
| **S1 身分地基** | middleware 帶 `org_id`+`user_kind`(staff/client)；建 `lib/tenant-guard.ts`；**不改現有行為**（staff 仍全域）| Medium | ✅ 純新增 | 一般 |
| **S2 RLS 切換** | §2 客戶會碰的 route 改 user-scoped client → RLS 把關；逐 route 切逐 route 驗 | High(auth) | ✅ 每 route 獨立 | 一般 |
| **S3 補洞** | `wp_sites` 加 org+RLS；list 過濾強制；destructive DELETE 加 org（縱深防禦）| Medium | ✅ migration 可降 | 一般 |
| **S4 基礎設施隔離** | Hetzner 每客戶獨立機接 onboarding + 補 Phase4 金鑰持久化 | **High(花錢/金流)** | ⚠️ | **單獨 go** |
| **S5 token 收斂** | CF/Hetzner/Supabase token 縮範圍 + 輪替 | Medium | ✅ | 一般 |

S1–S3 解決「客戶彼此看到/改到資料」。S4 解決「一站垮全垮」（照金流紅線單獨批准）。

---

## 5. 每階段驗證（R0 四動作）

- **實測**：建 2 個測試 org，以「客戶 A」身分帶 B 的 id 讀/改/刪 → 應 403/404 非 200（curl + REALTEST_EVIDENCE）。`.ts` 改動先 `npx tsc --noEmit`。
- **Review**：`/review` critic 過每個改的 route。
- **抓蟲**：grep `app/api` 找剩餘「取 body/param id 直接進 query 無 org」。
- **WORKLOG**：四動作結果 + file:line。

---

## 6. 待辦對應（TASKS）

- [ ] S1 身分地基（見設計檔）
- [ ] S2 §2.1–2.4 route 逐一 RLS 化
- [ ] S3 `wp_sites` migration + list 強制 + DELETE 補 org
- [ ] S4（單獨 gate）Hetzner dedicated + Phase4 金鑰
- [ ] S5 token 收斂
