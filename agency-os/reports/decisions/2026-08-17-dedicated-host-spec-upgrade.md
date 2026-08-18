# Decision: Dedicated 主機規格上修（64GB → 128GB ECC）+ 供應商候選擴至 OVH

**Date:** 2026-08-17
**Mode:** spec_revision（**直接決策，非 `/decide` 多代理面板**）
**Supersedes:** `runbooks/HETZNER-SERVER-MIGRATION-AND-DISASTER-RECOVERY-RUNBOOK.md` **§0b 的「選定機型」表格**（CPU / RAM / 價格三列）
**Preserves:** §0b 的其餘全部決策 —— Chatwoot greenfield 先行、單台 + RAID1 + R2 夠用、HA 第二台延後、per-container `mem_limit`
**Confidence:** 0.78 — RAM/核數的負載帳紮實；不確定點是 OVH Eco 線的運維品質（社群評價，非一手經驗）與 EUR/USD 匯率換算

---

## TL;DR

**規格下限改為：128GB ECC / ≥8C16T / ≥1TB NVMe 可 RAID1。**

**首選：OVH KS-6** — Epyc 7351p 16C32T / 128GB DDR4-2400 ECC / 2×1TB NVMe soft RAID / 500Mbit unmetered / **$59.80/月**（≈€51–54）+ $43.20 一次裝機。

**條件性改選 Hetzner**：Server Auction 若出現 **128GB ECC + ≥2TB NVMe ≤ €65/月** → 選它（同商、Robot、RMA 更好、磁碟天花板更高）。

**關鍵數字**：KS-6 比 §0b 已核准的 €48.70 只貴約 **€3–6/月**，換到 **RAM 2×（64→128GB）+ 核數 4×（4C8T→16C32T）**。

**觀望截止 2026-08-31**；等不到就買 KS-6。**硬買機死線 2026-09-30**（沿用既有日曆提醒，不另立新死線）。

---

## Context — 為什麼重開 §0b

§0b（2026-06-27）選 i7-7700 / 64GB / 2×512GB SSD / ~€48.70 / FSN，理由是「**auction 地板價**、4C8T 夠用、64GB 塞 Chatwoot + EU 全服務」。當時的負載模型是「Chatwoot（~8GB）+ EU 現有服務」。

2026-08-17 兩件事觸發重審：

1. **操作者自行找到更好的價格帶** —— OVH KS-6（128GB ECC / 16C32T / $59.80）與三台 Hetzner auction 128GB 機。§0b 的「64GB 是地板價」前提在 128GB 價格帶出現後不再成立。
2. **操作者明確聲明工作負載範圍**：「**我之後會有很多網站和自架工具**」。§0b 的負載模型未含「多站 WP 租戶」與後續自架工具，只算到 EU 現有服務 + Chatwoot。

第 2 點是這份文件存在的真正原因。負載模型換了，規格下限就得換。

---

## 負載帳（RAM，決定性維度）

| 項目 | 合理值 | 依據 |
|---|---|---|
| Supabase 全棧（~10 容器）| 4–6 G | EU 現況 |
| ClickHouse | 8–16 G | **已 OOM 復發 4 次**；2026-08-15 事故 system/app = 345:1（`CLAUDE.md` 代理路由表） |
| Trigger.dev + Postgres | 2–4 G | EU 現況 |
| n8n | 1–2 G | EU 現況 |
| **Chatwoot（Rails + PG + Redis）** | 6–8 G | §0b 實測需求 ~8GB |
| next-admin / MainWP / Uptime Kuma / Postiz | 3–4 G | EU + SG 現況 |
| WP 站 × 10（php-fpm + DB 各 ~0.5–1G）| 5–10 G | 「很多網站」的保守下限 |
| OS + Docker + page cache 餘裕 | 8 G | |
| **合計** | **37–58 G** | |

**64GB 在上界剩 6GB headroom（~91% 使用率）—— 對一台承載 ClickHouse（已知會爆記憶體）的整併主機，這是不可接受的餘裕。** 128GB 落在 30–45% 使用率，三年不必再處理這個問題。

**核數**：整併後同時跑的背景工作 —— n8n cron、Trigger.dev queue、ClickHouse merge、Chatwoot Sidekiq、WP-Cron × N —— 吃的是併發核數。§0b 的 4C8T 是在「Chatwoot + EU 服務」模型下算的，加上多站後不足。

**單核時脈的權重（修正先前判斷）**：WordPress/PHP 是 single-thread bound，但 TTFB 在 2.4GHz Epyc vs 5.1GHz Zen4 的差距約 120ms vs 70ms，Cloudflare 邊緣快取 + object cache 之後使用者無感。**不應排在 RAM 與核數之前** —— 本決策初版排序（ECC > 單核 > 支援 > 價格）在得知「多站 + 自架工具」後即被推翻。

**記憶體頻寬**：Epyc 7351p 為 8-channel DDR4（~150 GB/s）。ClickHouse 是 memory-bandwidth bound（吞吐由記憶體頻寬決定，非時脈），對本案負載正向。

**ECC（Error-Correcting Code，記憶體位元翻轉自動修正）：改列為硬門檻。** 這台要跑 Supabase（客戶主資料）+ Chatwoot（對話唯一真相源）+ ClickHouse。非 ECC 的 128GB 桌機平台不該承載多站 production DB。

---

## 候選比較

| | **KS-6（首選）** | HZ auction 3700X | HZ auction 3600 ×2 | §0b 原案 i7-7700 | HZ AX42（新機）|
|---|---|---|---|---|---|
| CPU | Epyc 7351p 16C/32T @2.4/2.9G | Ryzen 7 3700X 8C/16T @3.6/4.4G | Ryzen 5 3600 6C/12T | i7-7700 4C/8T | R7 PRO 8700GE 8C/16T |
| RAM | 128G DDR4 **ECC** | 128G DDR4 **ECC** | 128G DDR4（**無 ECC**）| 64G | 64G DDR5 ECC |
| 可用碟(RAID1) | 1 TB | 1 TB | 1 TB / 2.5 TB | 512 GB | **512 GB** |
| 網路 | 500 Mbit | 1 Gbit | 1 Gbit | 1 Gbit | 1 Gbit |
| 月費 | **$59.80**（≈€51–54）| €130.70（≈$144–153）| $84.90 / $97.90 | €48.70 | €46–57（未證實）|
| 3 年總額 | **~$2,240** | ~$5,300 | ~$3,060 / $3,520 | ~$1,900 | ~$1,900–2,300 |

> ⚠️ **匯率未證實**：EUR/USD 以 1.10–1.17 區間換算。下單前以實際刷卡匯率為準。
> ⚠️ AX42 官方價未取得（Hetzner 2026-06-15 全線改名 -1/-2/-3 重新定價），€46–57 來自第三方列表，**下單前必須開官網確認**。

### 為什麼不選其他

| 候選 | 淘汰理由 | 什麼情況下會勝 |
|---|---|---|
| HZ auction 3700X €130.70 | 多付 ~$3,000/3年，換到單核 1.6× 與更好支援，但 **RAM 與可用磁碟完全相同、核數少一半**。不划算 | auction 降價至 ≤€65（該價格帶有倒數計時降價機制，見下）|
| HZ auction 3600 (128G) | **無 ECC**（硬門檻）+ 僅 6C12T + 比 KS-6 貴 $25–38/月 | 永不 —— ECC 是門檻，不是偏好 |
| §0b 原案 i7-7700 64G | 負載模型已變（+多站 +自架工具）；4C8T 與 64GB 皆不足；512GB 可用碟太小 | 若後續縮編為「只放 soulful + Chatwoot」則仍成立 |
| AX42 64G DDR5 ECC | 單核最快、ECC、新機、最佳支援，但 **64GB 天花板 + 僅 512GB 可用碟** —— 兩者都是本案硬約束 | 決定分兩台（一台跑 DB 重負載、一台跑站）時的站層機器 |

---

## 決策規則（2026-08-18 已被時機層決策取代 —— 見下方通知）

> 🔴 **本段第 2–3 條已於 2026-08-18 取代。** 正本：[`2026-08-18-dedicated-host-purchase-timing.md`](2026-08-18-dedicated-host-purchase-timing.md)（decision-intelligence 19-stage 面板，信心值 0.79）。
> **新規則**：不觀望到 8/31，**今天立刻下單 KS-6，選月租**（不要 12 個月承諾）。觀望期改由 OVH 月租的隨時可退條款承載，不再由日曆餘裕承載——同一個「換更好機器」的選擇權，用 $43.20 就能買到且有效 36 個月，不必用死線前的 13 天不可再生資源去買。KS-6 已查證常缺貨，「等不到才買」的退路本身沒有保證。
> 下方原規則保留為歷史紀錄，**勿依此執行**。

<details>
<summary>已取代的原規則（2026-08-17，歷史紀錄）</summary>

1. Hetzner Server Auction 篩選：**ECC ✓ + RAM ≥128GB + NVMe ≥2TB**，按價排序，每 2–3 天看一次
2. 出現 **≤ €65/月** → **立刻下單 Hetzner**（勝 KS-6：同商、Robot 面板、RMA 較好、磁碟天花板 2TB+）
3. **2026-08-31 仍未出現 → 下單 KS-6**，停止觀望
4. **2026-09-30 = 絕對死線**（既有 Google 日曆提醒，`TASKS.md:228`）—— 不得逾越，後面要留搬站 + 觀察期至 11-12

</details>

**現行規則**：① 今天下單 KS-6，月租 ② auction 觀望不停，但只在 soulful 生產資料**落地新機前**命中才換機，落地後命中記入下次換機評估 ③ 死線前範圍閘：11/12 前只做 Chatwoot + soulful，EU/SG 整併排 11/20 之後（六個具名任務，兩週一台）

**為什麼給兩週觀望**：Hetzner auction 的 `HH:MM:SS left` 倒數是**降價計時器**，未成交機器價格隨掛牌時間遞減。€130.70 是新掛牌價非底價。同商的運維價值值得等兩週，但不值得壓縮搬站觀察期。

---

## 下單前必須驗證的事（KS-6 路線）

**2026-08-17 補充查證**（WebSearch + WebFetch，非一手操作經驗，來源見各項）：

- [x] **OS 安裝自由度 — 已查，疑慮解除**：OVH 官方安裝流程有「Customise the partition configuration」勾選項，可在硬體/OS 限制內自訂分割與 RAID；Rescue mode 確認存在（SSH 進臨時系統救援/修 boot/清碟重裝）。此為 Kimsufi/OVH dedicated 產品線通用能力，非 KS-6 專屬不確定項。**原「選項 A/C 最大單點未知」不成立。**（來源：[OVHcloud getting-started guide](https://docs.ovhcloud.com/en/guides/bare-metal-cloud/dedicated-servers/getting-started-with-dedicated-server-eco)、[rescue mode 官方文件](https://help.ovhcloud.com/csm/en-dedicated-servers-ovhcloud-rescue)）
- [x] **匯率 — 已查**：2026-08-17 即時 EUR/USD ≈ 1.1589。$59.80 ≈ **€51.60**；首月 $103（含裝機費）≈ **€88.9**。與原估 €51–54 區間吻合，比 §0b 核准的 €48.70 只貴約 **€3/月**，判斷不變
- [x] **"Backup Agent — Free licence" 實際容量 — 依賴已移除（2026-08-18）**：不再追查此項。備份一律走既有 R2（$0.015/GB-月、零 egress、已跑通、異商異地）。同商同地的 OVH Backup Agent 在 2021-03-10 SBG2 機房火災中已被證明不算真備份——已驗異地備份嚴格優於未驗同商備份，追查其容量的工程時間反而超過三年 R2 費用。詳見 [`2026-08-18-dedicated-host-purchase-timing.md`](2026-08-18-dedicated-host-purchase-timing.md) FinOps 段
- [x] **OVH Eco 運維品質 — 已查，方向正向但有具體警訊**：硬體故障自動偵測、人工更換（非全自動）；社群評價「excellent, quick and effective」，但亦有具體反例「HDD/零件故障最長等過 20 天」、一般回報「1–2 天回應，非最快」；**無 IPMI/KVM 遠端主控台**（自助服務型，故障時只能靠 rescue mode + ticket）。RAID1 + R2 異地備份是此風險唯一緩解，非消除（來源：LowEndTalk 社群討論，非一手經驗，方向性參考）
- [ ] **Rescue mode 是否可用**（無 IPMI/KVM 時的唯一救援路徑；上一項已確認產品線通用存在，仍需在實際 KS-6 控制台按一次驗證）
- [ ] **SMART 健康值**（二手碟，開機後立即查；§7 已有此項）
- [ ] **mdadm 降級告警**接上通知（§7 已有此項）

---

## 剩餘風險

| 風險 | 嚴重度 | 緩解 |
|---|---|---|
| **1TB 可用碟是真天花板** —— 3年估：10 站 ~100G + ClickHouse 50–200G + Supabase 20–50G + Chatwoot PG/uploads + Docker 50G + 本機備份保留 200–500G = **400G–1T** | 中高 | 備份**必須**外放（R2 已在用；§7 尚缺「第二異地」項可一併解決）。本機不留長期備份保留 |
| **OVH Eco 運維品質 < Hetzner Robot** —— 無 IPMI/KVM；社群回報硬體更換 1–2 天到最長 20 天不等，變異區間大 | 中 | 官方載明 99.9% SLA + 自動偵測（人工更換非全自動）。RAID1 + R2 + §0b「整機死從 R2 還原數小時」已涵蓋最壞情況；無 KVM 意味卡死時只能靠 rescue mode，非零風險（2026-08-17 補查證，來源 LowEndTalk 社群，非一手經驗）|
| **舊硬體**（Epyc Naples，2017）剩餘壽命 | 中 | ECC + RAID1 + SMART 監控 + R2。同風險亦存在於所有 auction 二手機（含 §0b 原案 i7-7700，2017 同期）|
| **Naples NUMA 分區**（4 die／可能 4 NUMA node）未 pin CPU 時 DB 效能可能掉 | 低 | 裝機時量測；必要時 docker `cpuset-cpus` pin |
| **供應商分裂** —— 現有 EU 機在 Hetzner (hel1)，新機在 OVH → 多一套 provider 流程 | 低 | `provisionClient.ts` 本就設計為 adapter seam（`memory/project_multi_provider_provisioning.md`）；且整併完成後 EU 雲端要退掉，分裂是暫時的 |
| **500Mbit vs 1Gbit** | 極低 | 本案無大流量出站需求 |
| 機房位置：Limburg (DE) vs FSN (DE) —— §0.5 ① 的「origin 從亞洲移到歐洲」取捨不變 | 低 | 與 §0b 選 FSN 的判斷同級，皆為德國 |

---

## §0b 未變動的部分（不要重新討論）

- **執行順序**：買機 → 裝 OS + RAID1 + SMART → R2 備份就緒 + 還原演練 → **Chatwoot greenfield 先上** → EU 服務照 §5 一台台搬 → 驗證 24–48h → 退 EU + SG 雲端
- **單台 + RAID1 + R2 = 開始夠用**，HA 第二台延後
- **per-container `mem_limit` 必設**（EU 現況痛點；ClickHouse 復發史直接相關）
- **絕不 HDD**

---

## Switch conditions（何時重開本決策）

- [ ] 「很多網站和自架工具」的計畫縮編為「只放 soulful + Chatwoot」→ §0b 原案 64GB 重新成立
- [ ] 實際使用率 12 個月後仍 < 40GB → 下次換機回到 64GB 級
- [ ] ClickHouse 的產生源設定被永久修好（`lobster-factory/infra/trigger/clickhouse/override.xml`）→ RAM 需求下修 8–16G
- [ ] 決定分兩台（DB 層 / 站層）→ 規格重算，AX42 回到候選
- [ ] OVH Eco 實際 RMA 體驗差到影響營運 → 下次換機回 Hetzner

## Review cadence

| 時點 | 檢查 |
|---|---|
| 買機 + 30 天 | 實際 RAM/磁碟使用率 vs 本文件估算；SMART；mdadm 告警是否真的會響 |
| 2026-11-12 後 30 天 | 搬站完成後總帳：是否已退掉 EU + SG 雲端（§0b 的省錢前提）|
| 買機 + 12 個月 | 使用率 vs 128GB；switch conditions 逐項評估 |

---

## ADR 升級路徑

本記錄尚未升為 ADR。若整併完成且此機成為唯一 production 主機（EU/SG 雲端退役後），應升級為 ADR 並註冊 `docs/architecture/decisions/ADR_INDEX.md` —— 屆時它就是整個 stack 的單點架構前提，值得綁定記載。

---

## 驗證（R0 四動作）

- **REALTEST_WAIVED: DOC_ONLY** — 純文件決策記錄，無 code 改動
- **REVIEW_DONE**: 讀回 §0b / §7 / `SITE_MIGRATION_RUNBOOK.md §0.5` 全文對齊，確認本文件的 supersede 範圍只涵蓋機型表三列、未與 §0b 其餘決策衝突
- **BUGHUNT_DONE**: `scope=agency-os,scripts,runbooks | grep=64\s?GB|64G\b|二手 Hetzner` — 命中 30+ 處，其中**規範性**（會導致買錯機）3 處已同 commit 修正：DR runbook §0b 表格 + §7「機型已選」項、`SITE_MIGRATION_RUNBOOK.md:42` RAM 下限。**歷史性**紀錄（weekly/monthly/ao-resume/daily/handoff 各檔的 €48.70 記載）**刻意不改** —— 那些是當時事實的存檔，改了等於偽造歷史
- **WORKLOG**: 2026-08-17 entry

---

## Document metadata

- **Generated by:** 主代理直接決策（**非** `/decide` 多代理面板 —— 無 debate transcript、無 Skeptic/Judge 交叉檢驗）
- **前提假設（本決策的支點）**：workload = 多站 WP + 多個自架工具 + Chatwoot + EU 整併。**若此假設不成立，結論即失效** → 見 Switch conditions 第 1 項
- **本決策曾翻轉一次**：初判「AX42 64GB，ECC > 單核速度 > 支援 > 價格」→ 操作者指出「之後會有很多網站和自架工具」→ 改判「128GB ECC，RAM/核數 > 單核速度」。記錄此翻轉是為了讓將來的人知道**排序依據是負載模型，不是品牌偏好**
- **Next review:** 買機後 30 天
