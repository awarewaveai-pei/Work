# CONTENT PIPELINE BLOCKS — MASTER PLAN

> **這份是什麼**：繁中內容生產管線（搜尋熱點 → 文章 → 影片 → 品質 → 發佈）以「積木（block）」架構收斂的**單一藍圖 SSOT**。
> **給 AI 看的開工指南**：任何 session 接到「video generator / 內容管線 / content pipeline / 積木 / Postiz / 自動發佈」相關任務，**先讀這份**，照「§0 開工必讀」就能在 5 分鐘內完全掌握現況、下一步、紅線。
> **狀態**：藍圖已定，**程式碼尚未動工**（等操作者批准 — 見 §11）。
> **最後更新**：2026-06-16 ｜ **負責層級**：架構師 / 工程 / 安全 / QA / PM（R0 全程適用）

---

## §0 開工必讀（按順序，5 分鐘掌握全局）

1. **本檔 §2**（狀態表 SSOT）— 哪些積木活著、哪些是空的、哪個是唯一缺口
2. **本檔 §5**（風險清單 R1–R7）— 動手前必懂的紅線
3. **本檔 §8**（分階段實作 P0–P8）— 從哪一步開始
4. `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/blocks/registry.ts` — 積木合約（real code）
5. `agency-os/reports/decisions/2026-06-15-build-zh-tw-content-pipeline.md` — 已拍板的方向決策（**full AI 影片生成被明確 DEFER**）
6. `docs/wp-kadence-ai-seo-geo-content-engine.md` — 內容引擎產品 SSOT（§3.2 反批量發佈紅線）
7. `agency-os/docs/video_generator/` — Python 原型（reference implementation，**不是要部署的成品**）

**一句話現況**：搜尋積木已上線、文章＋WordPress 發佈已是 production code（但還沒接進 registry）、**影片生成是唯一真正缺的能力**、Postiz 已部署但沒接線、Python `publisher.py` 是重複實作且踩紅線（要刪不要接）。

---

## §1 任務理解（根本問題）

**表面需求**：「video generator 進度？」+「寫一個完整的 plan，每次都知道從哪裡開始」。

**根本問題**：目前存在**三套半成品**，彼此重疊、沒有單一藍圖，導致每個 session 重新摸索：
- (a) `next-admin` 的 **TS 積木系統**（搜尋積木活著，文章/影片/品質/發佈只在 README roadmap，無 stub）
- (b) `next-admin` 的 **production 發佈路徑**（WordPress 發佈 + syndicate 文字生成，已是 real code 但沒包成積木）
- (c) `agency-os/docs/video_generator/` 的 **Python 全自動原型**（能在本機跑，含 10 平台直連發佈 `publisher.py`，但未部署、且發佈邏輯與 (b) 重複並違反紅線）

**真正要解的**：把這三套**收斂成一條積木管線**，明確「誰是 SSOT、誰被刪、誰被包裝」，讓 30 年內任何人接手都從同一張圖開始。**唯一缺的新能力是「影片生成」**，其餘都是「收斂 / 接線」而非「重寫」。

---

## §2 現況狀態表（SSOT — 每次先讀這張）

| 積木 / 能力 | 現況 | 真實位置（file:line） | 收斂動作 |
|---|---|---|---|
| **search**（熱點） | ✅ 上線 | `lib/content/trending-sources.ts:251`(google-news) `:266`(reddit) `:284`(ptt) `:312`(perplexity) `:334`(env feeds) `:364`(runTrending) | 保留，已是 registry block |
| 來源管理 UI | ✅ 已建 | `ContentStudio.tsx:586-639` /api/content/sources CRUD（migration 0042） | 保留 |
| **article**（生成） | 🟡 有 production code，未包積木 | publish/syndicate 路徑內的文章生成 | 包成 `article/generate` block |
| **video**（影片） | 🔴 **唯一缺口** | 僅 `agency-os/docs/video_generator/` Python 原型（未部署） | 新建 `video/pipeline` block + Python 微服務 |
| **quality**（品質） | 🟡 部分（README roadmap） | `registry.ts` README:93-99 roadmap，無 stub | 包成 `quality/check` block |
| **publish-WP** | ✅ production | `app/api/content/publish/route.ts:237-439`（wp-bridge + REST） | 包成 `publish/wordpress` block |
| **publish-social** | 🔴 死面板 + 未接線 | `app/api/content/syndicate/route.ts:22-91`（只生成文字，零 Postiz） | 接 Postiz，成 `publish/social` block |
| Postiz（社群） | 🟡 已部署未接線 | `POSTIZ_SOCIAL_PUBLISHING_PLAN.md`（commit a951190c） | 接 next-admin |
| Python `publisher.py`（10 平台直連） | ❌ 重複 + 踩紅線 | `agency-os/docs/video_generator/` | **刪**（社群走 Postiz、WP 走 wp-bridge） |

**圖例**：✅ 可用 ｜ 🟡 部分/未接線 ｜ 🔴 缺口/死碼 ｜ ❌ 要刪

---

## §3 積木收斂地圖（目標架構）

```
ContentBlock<TOut>  (registry.ts:26-34)
  byKind() 編排
        │
  ┌─────┴──────┬───────────┬──────────┬────────────┐
search        article      video      quality      publish
(✅活)        (🟡包裝)     (🔴新建)   (🟡包裝)     (拆兩個)
                                                    ├─ publish/wordpress ✅(包裝 route.ts)
                                                    └─ publish/social    🔴(接 Postiz)
```

**設計原則**：
- **行為保留重構**：article/quality/publish 已有 production 邏輯 → 只「包成積木」不重寫，行為不變。
- **video = reference + 微服務**：Python 原型當參考實作；影片核心抽成 Python 微服務，由 TS `video/pipeline` block 呼叫（理由見 §6 A2）。
- **發佈只有兩條合法路徑**：社群 = Postiz；WordPress = wp-bridge 簽章。**禁止第三條**（Python publisher.py 直連 = 刪）。

---

## §4 video_generator 現狀（reference implementation）

- **位置**：`agency-os/docs/video_generator/`（README.md + video_generator_plan.md，~2225 行規格，9 個 Python 檔）
- **能力**：article→video（Pixabay/DALL-E 圖 + Edge TTS 配音 + ffmpeg 合成 4 尺寸）→ 10 平台發佈 + Supabase 佇列/費用 + Telegram 通知 + 品質控制（Copyscape/FAQ/Alt/AB）
- **依賴鎖定**：moviepy **1.0.3**（程式用 1.x API，2.x 會炸）、ffmpeg、fonts-noto-cjk
- **現實**：能在本機跑，**未部署**；`publisher.py` 的社群/WP 直連與 next-admin production 路徑重複且違反「禁兩套發佈」紅線。
- **取用方式**：**影片合成核心**（圖→TTS→ffmpeg）是它的獨特價值 → 抽出來當微服務；發佈/品質/佇列部分由 next-admin 既有能力取代。

---

## §5 風險清單（動手前必懂）

| # | 風險 | 來源 | 緩解 |
|---|---|---|---|
| **R1** | **兩套社群發佈並存** | Python publisher.py vs Postiz | 紅線：社群只走 Postiz；publisher.py 社群直連刪除 |
| **R2** | **批量自動發佈 → Google 懲罰** | content-engine §3.2 | 影片管線預設 draft-first；不開 bulk auto-publish |
| **R3** | **繞過 wp-bridge 簽章** | publisher.py 直連 WP REST | WordPress 只走 wp-bridge（Ed25519 簽章 + read-back） |
| **R4** | moviepy 2.x 破壞性 | 依賴鎖 | 微服務 pin moviepy==1.0.3，容器化隔離 |
| **R5** | 影片生成吃 CPU/記憶體（ffmpeg） | VPS 資源 | 微服務獨立容器 + healthcheck + 資源上限；不跑在 next-admin 程序內 |
| **R6** | 重寫既有 production 發佈邏輯 = 重工 | route.ts 已驗 | 行為保留：只包裝不重寫 |
| **R7** | 操作者跨國 → 地理 WAF 誤擋 | 既有 feedback | 任何保護走 server-side（LLAR），不用 CF 國家規則 |

---

## §6 方案比較

### 影片生成的實作形式
| | A1：TS 全重寫 | A2：Python 微服務（**建議**） |
|---|---|---|
| 做法 | 把 moviepy/ffmpeg 邏輯用 TS/Node 重寫進 next-admin | 影片核心保留 Python，包成獨立微服務，TS block 用 HTTP 呼叫 |
| 優點 | 單一語言、單一部署 | 重用已驗證 Python 邏輯、moviepy 鎖版隔離、ffmpeg 重負載不拖垮 next-admin |
| 缺點 | 重寫 moviepy 等於重做整個影片引擎（高重工 + 高風險） | 多一個服務要部署/監控 |
| 風險 | 高（R6 重工 + ffmpeg in-process R5） | 中（部署複雜度，可控） |
| rollback | 難（混進 next-admin） | 易（停容器即回退，主站不受影響） |

→ **建議 A2**：最小重工、爆炸半徑最小、可獨立 rollback。

### 上線順序
| | B1：先影片後社群 | B2：先把現有 production 包成積木，再做影片 |
|---|---|---|
| 邏輯 | 先補最缺的能力 | 先收斂已驗證的（article/WP publish），快速拿到「可用管線」，影片當增量 |
| 風險 | 影片是最重最未知，先做拖長無產出期 | 低風險先行，每階段都有可驗收產物 |

→ **順序待操作者選**（§11 決策 2）。架構師建議 **B2**（先收斂 → 早驗收 → 影片增量），但尊重操作者若想先看到影片。

---

## §7 建議方案（一句話）

**B2 順序 + A2 影片形式**：先把已驗證的 article/quality/publish-WP **包成積木**（行為保留、零重寫），社群接 **Postiz**，刪除 Python `publisher.py` 直連；影片能力以 **Python 微服務**新建，由 TS `video/pipeline` block 呼叫，全程 **draft-first 不開 bulk**。理由：最小爆炸半徑、重用已驗證碼、可逐階段驗收與 rollback、不踩任何紅線。

---

## §8 分階段實作（P0–P8，每階段獨立可驗收/可回滾）

| Phase | 內容 | 風險級別 | 需 go-ahead |
|---|---|---|---|
| **P0** | 本檔（藍圖）+ 註冊到 governance index | Low | 否（doc） |
| **P1** | `publish/wordpress` block — 包裝 `route.ts:237-439`（行為保留） | Low-Med | 是（碰 production 路徑） |
| **P2** | `article/generate` block — 包裝既有文章生成 | Low-Med | 是 |
| **P3** | `quality/check` block — 包裝品質檢查 | Low | 否（新增，非破壞） |
| **P4** | registry `byKind()` 串 P1–P3，端到端跑通「文章→品質→WP draft」 | Med | 是 |
| **P5** | `publish/social` block 接 Postiz；**刪** Python publisher.py 社群直連 | **Med-High** | 是（憑證 + 刪碼） |
| **P6** | `video/pipeline` block 介面 + Python 微服務骨架（圖→TTS→ffmpeg，本機驗證） | Med | 是 |
| **P7** | 微服務容器化 + 部署 + healthcheck + smoke（SG/EU） | **Med-High** | 是（deploy） |
| **P8** | 全管線端到端 + draft-first 驗收 + Telegram 通知 + WORKLOG | Med | 是 |

每階段完成才進下一階段；**每階段都跑 R0 四動作驗證**（§9）。

---

## §9 驗證計畫（R0 四動作，每階段強制）

1. **實測（REALTEST_EVIDENCE）**：`.ts/.tsx` 改動先 `npx tsc --noEmit`；block 端到端真跑（curl /api/content/* 或 node 直呼 block.run）；微服務用 docker exec / curl 真實調用。格式：`REALTEST_EVIDENCE: tool=... | cmd=... | exit=... | ms=...`
2. **Review（REVIEW_DONE）**：critic subagent 外部 oracle 審改後產物（不可自評替代）。格式：`REVIEW_DONE: critic=... | verdict=... | findings=...`
3. **抓蟲（BUGHUNT_DONE）**：grep 跨檔搜新 block symbol 的 callsites（scope 含 `agency-os` + `scripts`，碰 lobster-factory 程式碼加該路徑）。格式：`BUGHUNT_DONE: scope=... | grep=... | hits=...`
4. **WORKLOG**：file:line 引用實際指令與輸出 + 四動作摘要。

---

## §10 Rollback

| Phase | rollback |
|---|---|
| P1–P4 block 包裝 | block 只是 registry 新增的 thin wrapper，呼叫既有 route 邏輯；`enabled:false` 或 git revert 該 block 檔即回退，production 路徑不受影響 |
| P5 Postiz 接線 + 刪 publisher.py | 接線在獨立 block；revert commit 即停。publisher.py 刪除前先確認無其他 caller（grep）；保留 git history 可復原 |
| P6–P7 微服務 | 獨立容器 — 停容器即回退；`video/pipeline` block `enabled:false`；next-admin 主站完全不受影響 |

---

## §11 待操作者決策（動工前需明確批准）

1. **方向批准**：同意 §7 建議方案（B2 + A2 微服務 + Postiz 唯一社群路徑 + 刪 publisher.py 直連）？
2. **上線順序**：B2（先收斂後影片，架構師建議）還是 B1（先影片）？
3. **社群來源 / 帳號授權**：Postiz 接哪些平台？哪些帳號需 OAuth？（P5 前需要）
4. **逐階段 go-ahead**：P1/P2/P4/P5/P6/P7/P8 屬 Med 以上，需逐階段明示 go-ahead（P0/P3 Low 直接做）。

---

## 變更紀錄

| 日期 | 變更 | 來源 |
|---|---|---|
| 2026-06-16 | 初版藍圖建立（R0 全分析；程式碼未動，等批准） | 操作者要求「寫完整 plan」 |
