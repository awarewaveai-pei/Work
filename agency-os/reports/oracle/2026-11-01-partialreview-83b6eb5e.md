# codex-oracle review -- 2026-11-01 18:48:17 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/sinks/outreach-research.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/run.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/canonical.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/net/fetcher.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/__tests__/collect-path-scope.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/__tests__/collect-redirect-scope.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/leads, lobster-factory/packages/db/migrations/0150_co_evidence.sql  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Round 3 of Outbound OS card C3, fixes only. From Codex round 2: aside (quality-refused) pages reach the sink with keepAside and give emails only; evidence whose excerpt left its page goes status stale (0150 CHECK adds stale); one entry per address, a later mailto upgrades a plain mention; redirects outside the seed scope refused before the request (fetcher stayWithin); research_started timeline marks interrupted runs (C15 re-picks by state). From critic round 2: siteScope keeps a slashless path as the directory, underPath is a path boundary for every collect source; autoEligible = own domain or a free-mail mailto; autoApproves also needs claimExact (numbers, weekdays, negation). Verify these only; report real defects, none if none.
- exit: 0 | elapsed: 203755ms | answer: 2913B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/canonical.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/net/fetcher.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/run.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/MODULE_MANIFEST.json, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/cold-gate.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/cold-gate.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/contact-guard.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/leads/research/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/leads/research/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/__tests__/collect-path-scope.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/__tests__/collect-redirect-scope.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/sinks/outreach-research.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/research.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/billing.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/research-extract.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/research.ts, lobster-factory/packages/db/migrations/0150_co_evidence.sql
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 品質閘拒收的短頁會把仍有效的證據誤標為 stale
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/sinks/outreach-research.ts:75
  confidence  -> CONFIRMED
  scenario    -> 原頁有已核准證據；重抓時只抽出很短的文字並標記 `meta.aside` → 程式先比對這份不完整文字、將證據改成 `stale`，第 82 行才判斷頁面被拒收；後續寫信失去可用證據。
  why missed  -> 測試分別驗證短頁不抽新事實與舊證據變 stale，沒有把兩種狀態放在同一次重抓。

FINDING 2: 已標 stale 的證據即使重新出現在原頁也無法恢復
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/sinks/outreach-research.ts:107
  confidence  -> CONFIRMED
  scenario    -> 某段 excerpt 暫時離開原頁，該列變成 `stale`；下次重抓時原頁恢復同一 claim 與 excerpt → 唯一鍵仍佔著該列，`ignoreDuplicates: true` 忽略新結果，證據繼續是 `stale`。
  why missed  -> 去重測試只涵蓋重複插入，沒有涵蓋狀態從 stale 恢復。

FINDING 3: 先填入信箱、後做 MX 查核，會讓無效地址卡住有效候選
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/research.ts:99
  confidence  -> CONFIRMED
  scenario    -> 網站同時列出無 MX 的同網域地址與有效的 Gmail `mailto`；排序先選同網域地址並寫入 lead，第 112 行才查核且丟棄結果 → 建草稿時 `contactBlock` 回 `email_invalid`，重跑研究又因 lead 已有 email 而不選有效地址。
  why missed  -> 測試把 `verifyEmails` 模擬成空結果，沒有驗證無效首選與第二候選的流程。

FINDING 4: 否定詞出現在不同子句，錯誤主張仍會自動核准
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/research-extract.ts:82
  confidence  -> CONFIRMED
  scenario    -> 頁面 excerpt 是「提供到府服務不限地區」，模型 claim 是「不提供到府服務」→ 字詞覆蓋率為 5/6，兩邊也都含「不」；`autoApproves` 回 true，將意思相反的主張存為 `approved`。
  why missed  -> 測試只比較有無否定詞，沒有測否定詞修飾的內容是否相同。

FINDING 5: 共用網站的網域信箱被當成該商家的自有信箱
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/research-extract.ts:164
  confidence  -> CONFIRMED
  scenario    -> lead 網站是程式明確支援的 `https://medium.com/@biz`，頁面含平台的 `support@medium.com` → `own` 因網域相同而為 true，第 148 行允許自動填入；系統把平台信箱記成該商家自行公布的聯絡方式。
  why missed  -> 路徑範圍測試涵蓋共用網站，信箱測試則只使用企業自有網域，沒有交叉驗證。

TOTAL: 5 findings
