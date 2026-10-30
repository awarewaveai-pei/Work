# 第 12 項：工作區→產品門一次性換證（WP 會員沒有 app 密碼也能從 launcher 進門）

**風險** Medium（auth；不改 DB、不改 nginx）　**模型** 設計 Fable 5.1 已定；實作 `fullstack-engineer`；審查 Codex＋critic　**前置** 第 10、11 項（61f9f261c、4632004bb，已上線）　**正本** ADR 018 §1（門各自一個 session；cookie host-only `lib/supabase/auth-cookie-options.ts`）

## Decision（Fable 2026-10-30；操作者「做換證」）
- 不變量：**替一個人鑄造某扇門的 session 只有一條路**＝`mintDoorLink`。證明方式兩種：(a) WP 站簽章＋會員對應（既有 wp-handoff）、(b) 本人已登入的 portal session（本項）。兩者之後的檢查完全相同：帳號是該組織的 `client`、`email_confirmed_at`、`generateLink` 解析到同一 user、落點 `https://<host>/login/wp#token_hash=…&type=recovery`。
- launcher 的「開啟」「我的作品」從 `<a>` 改成 `<form method="post" action="/portal/api/door">`（隱藏欄 `product_key`、`next`）；路由成功 303 到門的 `/login/wp#…&next=/works`；失敗 303 回 `/launcher?door=<code>`，launcher 顯示一行訊息。GET 不提供（link 預抓會燒掉 token）。
- `next` 嚴格白名單：只能是該產品 `door.nav` 的 `/<path>`（含 `/`），否則視為 `/`。`WpSignIn` 只接受以 `/` 開頭、不以 `//` 開頭、`^\/[a-z0-9\-\/]*$` 的 `next`；「繼續」「用目前的帳號繼續」都導到它。
- 不做：不改 cookie domain（跨子網域共用 session＝一處登出全部登出、一扇門被打穿全部門開；ADR 018 §1 選擇門各自 session）；不加 GET；不動 WP 外掛。

## Files（`lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`）
1. 新 `lib/auth/door-link.ts`：`export async function mintDoorLink(db, { userId, organizationId }, host, next?: string): Promise<{ ok: true; url: string } | { ok: false; status: 403 | 503; error: "auth_lookup_failed" | "not_this_account" | "email_unverified" | "link_failed" }>` ＝ 現在 `lib/auth/sources/awarewave-wp.ts:88-105` 那一段原樣搬出（含三段註解）；`next` 有值時 fragment 加 `&next=<encodeURIComponent>`。
2. `awarewave-wp.ts`：`:88-105` 改呼叫 `mintDoorLink(deps.db, account, host)`；`lib/auth/__tests__/awarewave-wp.test.ts` 不動、必須仍綠。
3. 新 `app/portal/api/door/route.ts`（`runtime="nodejs"`，`dynamic="force-dynamic"`）POST：`requireClientOrg(req)`（`PortalAccessError`→303 `/launcher?door=not_a_client`）；`userId = req.headers.get("x-ops-user-id")`（空→303 `?door=not_a_client`）；`formData()` 取 `product_key`、`next`；product = `servedNextAdminProducts().find(key)`（無→`?door=unknown_product`）；`holdsProduct({organizationId, productKey, now})` 假→`?door=product_not_held`；`next` 白名單＝`["/", ...(product.door.nav ?? []).map(n => "/" + n.path)]`，不在內→`"/"`；`mintDoorLink(getSupabaseWriteClient()!, { userId, organizationId: orgId }, productHost(product), next)` → 303 `url`；失敗 303 `/launcher?door=<error>`。deps 可注入（照 `wp-handoff/route.ts` 的 deps 物件寫法）以便測試。
4. `app/login/wp/WpSignIn.tsx`：`export function readWpNext(hash): string`（規則見 Decision，預設 `"/"`）；`useEffect` 讀 hash 時一併存 `next` 進 state（`ready`／`signedIn`／`alreadyIn` 都帶）；兩顆「繼續」`window.location.replace(next)`。
5. `app/portal/launcher/page.tsx`：props 加 `searchParams: Promise<{ door?: string }>`；`DOOR_NOTICE: Record<string,string>`＝`product_not_held:"尚未開通這個產品"`、`email_unverified:"請先完成 email 確認再進入"`、其他→`"暫時無法進入，請稍後再試"`；有 `door` 時在標題下顯示一行紅字。按鈕：已開通→`<form method="post" action="/portal/api/door"><input type="hidden" name="product_key" value={key}/><button className="btn-primary">開啟</button></form>`；有 works 時第二個 form 多 `<input type="hidden" name="next" value={worksPath}/>`，按鈕「我的作品」；「去了解」仍是 `<a>`。
6. 測試：
   - 新 `app/portal/api/door/__tests__/route.test.ts`（mock `@/lib/entitlements/door-holds`、`@/lib/supabase-server`、`@/lib/auth/door-link`）：held＋next=/works→303 且 Location 含 `/login/wp#…&next=%2Fworks`；next=`https://evil`→鑄造時 next 為 `/`；not held→303 `/launcher?door=product_not_held`；staff headers→303 `?door=not_a_client`；mint 回 `email_unverified`→303 `?door=email_unverified`。
   - 新 `lib/auth/__tests__/door-link.test.ts`：四種拒絕＋成功＋`next` 編碼。
   - `app/login/wp/__tests__/` 或既有 `awarewave-wp.test.ts` 內：`readWpNext`：`/works`→`/works`；缺→`/`；`//evil.com`、`https://x`、`/a?b`→`/`。
   - `app/portal/launcher/__tests__/page.test.tsx`：改斷言為 form action＋hidden input；`?door=product_not_held` 顯示訊息；讀取失敗→無 form 無 href。
   - `lib/__tests__/middleware-portal-guards.test.ts` 加列：`https://portal.aware-wave.com/portal/api/door` 未登入 → 401（`isApiPath`）。

## Acceptance
- `npx tsc --noEmit` 0；`npx vitest run lib/auth app/portal app/login lib/__tests__/middleware-portal-guards.test.ts` 綠。
- 突變：① `door-link.ts` 拿掉 `link.user?.id !== account.userId` → door-link 測試紅；② route 拿掉 `holdsProduct` 判斷 → route 測試紅；③ `readWpNext` 拿掉 `//` 檢查 → 測試紅。各還原綠。
- 上線後操作者：用測試客戶帳號登入 portal → 按塔羅「我的作品」→ 落在 `tarot.aware-wave.com/works` 不經密碼。

## Rollback
- revert 本 commit；無 DB／nginx；`/portal/api/door` 消失後 launcher 回 `<a>`。
