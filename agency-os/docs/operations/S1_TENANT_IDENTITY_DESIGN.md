# S1 — 租戶身分地基設計（純新增、可回滾、不改現有行為）

> **建立**：2026-06-29。**屬於**：[`MULTI_TENANT_ISOLATION_AUDIT_AND_PLAN.md`](MULTI_TENANT_ISOLATION_AUDIT_AND_PLAN.md) Stage 1。
> **目標**：給請求路徑加上「登入者屬於哪個 org + 是員工還是客戶」，作為 S2/S3 隔離的前提。
> **核心保證**：**現有 staff 行為完全不變**（無 `user_kind` 的舊使用者一律視為 staff=全域）。今天 deploy 不改變任何畫面或權限。

---

## 1. 既有結構（不重工，接上去）

| 既有檔 | 角色 | S1 怎麼用 |
|---|---|---|
| `middleware.ts` | session gate；解析 `ops_role` → 注 `x-ops-claims-role`（先 strip client 偽造）| **加** 解析 `user_kind`+`org_id` → 注兩個新 header（同樣先 strip）|
| `lib/supabase/ssr.ts` | auth session client（anon+cookie）| **加** route-handler user-scoped client helper（給 S2 用，讓 RLS 生效）|
| `lib/ops-role.ts` | 從 header 讀全域角色 | 不動；新身分讀取放新檔 |
| `lib/supabase-server.ts` | anon / service-role data client | 不動（service-role 留給系統/admin 操作）|

---

## 2. 身分模型（用 Supabase `app_metadata`，伺服器控制、使用者無法竄改）

每個 Supabase user 的 `app_metadata` 新增兩欄（與既有 `ops_role` 同層）：

```jsonc
{
  "ops_role": "operator",        // 既有，不動
  "user_kind": "staff" | "client", // 新增；缺省 = staff（向後相容）
  "org_id": "<uuid>"             // 新增；user_kind=client 時必填；staff 可空（全域）
}
```

- **staff**（你/員工）：`user_kind` 缺省或 "staff" → 全域，看所有 org（= 今天的行為）。
- **client**（客戶自助）：`user_kind="client"` + `org_id` 綁定單一 org。

> 為何放 `app_metadata` 而非 `user_metadata`：`app_metadata` 只能由 service-role 後端寫，使用者改不了；`user_metadata` 使用者可自改 → 不可信。

---

## 3. 新增檔 1：`lib/tenant-guard.ts`

```ts
// 從 middleware 注入的 header 讀租戶身分。Header 已在 middleware strip 過 client 偽造值。
export type UserKind = "staff" | "client";
export interface TenantContext { userKind: UserKind; orgId: string | null; }

export function resolveTenant(req: Request): TenantContext;
//   讀 x-ops-user-kind / x-ops-org-id；缺 user_kind → "staff"（向後相容）

// 核心守門：呼叫端要存取 targetOrgId 的資料時必過此關。
//   staff → 永遠 allow
//   client → targetOrgId 必須 === ctx.orgId，否則 throw OrgAccessError(403)
export function assertOrgAccess(req: Request, targetOrgId: string | null): void;

// 給 list / 寫入用：算出「這個 caller 實際該用的 org」
//   client → 強制回 ctx.orgId（忽略 body/query 帶的值 → 杜絕 IDOR）
//   staff  → 回 caller 指定值（可選特定 org）或 null（全域）
export function effectiveOrgId(req: Request, requestedOrgId: string | null): string | null;
```

S2 各 route 的改法就變成兩種小手術：
- 寫入：`organization_id: effectiveOrgId(req, body.organizationId)`（client 不能塞別人 org）。
- 讀取單筆：查到 row 後 `assertOrgAccess(req, row.organization_id)`。

---

## 4. 新增檔 2：`lib/supabase/route-client.ts`（給 S2，S1 先建空殼+測試）

route handler 內以「登入者身分」連線（anon key + 該 user 的 session cookie）→ **RLS 自動生效**：

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
export function createSupabaseUserClient(): SupabaseClient;
//   讀 request 的 sb-*-auth-token cookie → 查詢以該 user JWT 執行 → RLS 把關
```

> 這是把「靠記得加 .eq()」換成「DB 層強制隔離」的關鍵。S1 只建立 + 單元測試它能正確帶 session；實際切換在 S2 逐 route 做。

---

## 5. `middleware.ts` 改動（最小，僅加注 header）

在現有 `resolveRoleFromUser` 之後加：

```ts
// 既有：role = resolveRoleFromUser(data.user.app_metadata)
const meta = data.user.app_metadata as Record<string, unknown> | undefined;
const userKind = String(meta?.user_kind ?? "staff").toLowerCase() === "client" ? "client" : "staff";
const orgId = typeof meta?.org_id === "string" ? meta.org_id : "";
// 注入（CLAIM stripping 清單同步加這兩個 header 名，防偽造）
baseHeaders.set("x-ops-user-kind", userKind);
if (orgId) baseHeaders.set("x-ops-org-id", orgId);
```

並把 `x-ops-user-kind` / `x-ops-org-id` 加進 middleware 開頭的 strip 清單（`CLAIM_HEADERS` 同級），確保只有 middleware 能設、client 無法偽造。

---

## 6. 風險與回滾

| 風險 | 緩解 |
|---|---|
| 改 middleware 弄壞登入 | 只「新增」header，不動既有 role 邏輯與 fail-closed；`npx tsc --noEmit` + 實測登入 |
| 舊 staff 帳號無 user_kind 被誤判 client | 缺省一律 staff（明確 fallback），舊帳號零影響 |
| header 偽造 | 與既有 role header 同一套 strip-first 防護 |
| 回滾 | S1 全是新增檔 + middleware 三行；`git revert` 單一 commit 即復原 |

**S1 不碰**：任何 route 的查詢邏輯（那是 S2）、任何 migration（那是 S3）、任何基礎設施/金流（S4）。

---

## 7. S1 驗證計畫（R0 四動作）

1. **實測**：① 用現有 staff 帳號登入 app.aware-wave.com → 一切如常（行為不變）。② 造一個 `user_kind=client, org_id=A` 測試帳號 → curl 帶其 session 打受保護 route，確認 header 正確注入；`resolveTenant` 回 `{client, A}`。`npx tsc --noEmit` 通過。
2. **Review**：`/review` critic 過 middleware + tenant-guard + route-client。
3. **抓蟲**：grep 確認沒有別處已用同名 header / 同名函式（避免衝突）。
4. **WORKLOG**：四動作結果 + file:line + REALTEST_EVIDENCE。
