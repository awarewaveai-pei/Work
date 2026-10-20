續接語：續做 ADR 017 第 3 項：讀 agency-os/handoffs/2026-10-19-adr017-step3-resume.md，從「Codex 第 3 輪 4 項」開始；完成 = 4 項處理＋COS affected 綠＋commit＋WORKLOG。建議模型：Opus 5.5

# ADR 017 第 3 項：暫停點（2026-10-19 20:12，操作者筆電沒電）

**狀態**：全部改動在 D:\Work 工作樹，**未 commit**。WORKLOG 草稿在 session scratchpad（會遺失）→ 內容要點在本檔。

## 已完成（已驗）
- next-admin：`can()`／`withFeature`／`grantFor`／影子模式；issuer `app/api/internal/entitlements/permit/[product]/route.ts`＋`lib/entitlements/issuer.ts`；能用功能清單 `app/api/entitlements/features/route.ts`＋`lib/entitlements/features.ts`＋`use-paid-features.ts`；按鈕灰掉（ContentStudio 8、SeoCheckPanel、BannerStudio 2、TarotStudio、VideoStudio 自動檢查、ScriptForge 頁首）；22 處直打 provider HTTP 改走 `lib/ai/gateway.ts` `providerUrl`＋boundary test。`npx vitest run lib app` 2698 passed，tsc 0。
- COS：`check.py` can() 薄接頭（header 或 issuer 取許可、本地驗、驗過才快取）、`net/entitlement_issuer.py`、`main.py` 9 處→`require_entitlement`、`AIGateway(grant=)`；`.env.example` 加 `ENTITLEMENT_*`。
- 真 DB e2e：`python lobster-factory/infra/hetzner-phase1-core/tests/e2e/entitlements/entitlements-real-db.py` → PASS ×4（production_touched=false）。
- Oracle：`agency-os/reports/oracle/2026-10-19-partialreview-{56ebcd13,cc8242fa,f80ff6a5}.md`；前兩輪 9 項已修。

## 待做
1. **Codex 第 3 輪 4 項（`f80ff6a5`，未驗未修）**：
   - F1 沒有路由呼叫 `grant.report()` → 扣點＝定價，**操作者決定**每功能幾點（`ledger.ts` `DEFAULT_CREDIT_POLICY` 佔位）。
   - F2 `app/api/outreach/messages/route.ts:174-178` grantFor 只給 `{ req }`，員工替客戶 C 的 lead 產生草稿會算 internal → 應以 lead 的 `organization_id` 經 `actorFor` 傳 `acting`。
   - F3 collect 搜尋／抽取 provider（`lib/collect/net/providers.ts:154-176`，Serper/Perplexity 等）沒 grant → `collect.fetch` 接 grant。
   - F4 boundary test 擋不到 `"https://api." + "openai.com"` 拆字串 → 加二元 `+` 串接後再比對，或改掃 `fetch(` 的 URL 來源。
2. COS：完整第 3 輪（15194 tests）只 1 失敗、已修；之後 COS 只改 issuer 搬 `net/entitlement_issuer.py`＋兩份網路縫清單＋`check.py`。2026-10-20 針對這些跑 9 個測試模組 → 357 passed（3 分 46 秒）。F2–F4 只動 next-admin，**COS 不必重跑**，除非再改 COS。
3. commit（共享檔走 `scripts/git-partial-worktree-commit.py stage`；只收本任務檔：next-admin lib/entitlements、lib/ai、lib/social/authz、各呼叫端與 UI 檔、tests/e2e/entitlements、COS 上列檔＋test_*；不含 social smartlink/metrics/store 等別 session 檔）＋WORKLOG（四動作證據行）＋TASKS＋監工台 `data.mjs` 第 3 步 done＋重發。
