# ADR 009: AI 影片導演 — 雙引擎共存 + 單一 composition 幀段平行渲染

- 狀態：提案（待 B 計畫批准後轉「已接受」）
- 日期：2026-06-28

## 脈絡

`/tools/video` 現況：腳本生成（ScriptForge，已成熟）→ Python ffmpeg 渲染（Ken Burns +
drawtext 字幕 + fade + concat）。能出 1–10 分鐘、最多 20 場景、多比例，但視覺「陽春」
——單圖一場、無文字動畫、無華麗轉場、無開場結尾/圖表/多層合成。另有獨立「Remotion 模板」
分頁（5 個寫死圖數的手選 composition，卡 2 分鐘上限，未接主管道）。

目標：在**不破壞現有可動系統**下，加一條能產出專業級豐富影片的路徑，支援 1–10 分鐘、
1–20+ 張不定圖、AI 自動編排（轉場/文字動畫/字幕/開場結尾/圖表/logo/背景，跨 9 大類）。

關鍵約束（皆實測）：
- 使用者 solo → Remotion 授權**免費含商用**（4+ 人或當 SaaS 轉售才需付費，列為絆線）。
- EU VPS（204.168.175.41）**已飽和**：4 核、RAM 剩 ~1.8G available 且在 swap、Virtio 虛擬
  GPU（無硬體加速）、load ~5（>4 核）。無法在此跑重型 10 分鐘 Remotion 渲染（會慢/OOM/拖垮 prod）。
- 既有腳本本身已是 `scenes[]` 陣列（1 圖:1 場:1 旁白），TTS 時長對齊場景。

## 決策

1. **雙引擎永久共存（Strangler Fig）**：保留 **Quick Engine**（現 Python ffmpeg，預設、fallback、永不移除）；新增 **Director Engine**（Remotion）。使用者每支片自選（無全域預設，picker 軟性停在 Quick）；一次出一支。另保留 **Manual Template Mode**（手選單一版模分頁）給進階一次性需求。
2. **Director Engine 用方案 4：整部影片 = 單一 Remotion composition**（保留 `<TransitionSeries>` 原生轉場 + `<Audio>` 原生配樂 ducking + 跨場景連續性），**非**逐場景切片。長片用 **Frame-Range Sharding**（按幀段平行渲染再無損接合，非按場景切）。
3. **架構 = Centaur**：AI 導演只輸出**經 schema 驗證的 Timeline JSON**（編排決策），Remotion 機械式渲染，零幻覺、可重現、可回滾。
4. **算力分流**：Quick（輕）留 EU；Director（重）短片(≤2–3 分)可在 EU 驗證(4a)，正式 1–10 分鐘待**更大機器**到位後跑 4b（使用者已規劃搬遷）。
5. **版模來源（分層、過濾授權）**：官方 `@remotion/transitions`（轉場）+ reactvideoeditor 81 / remotion-scenes 201（**MIT**，鋪 9 大類）+ 選譯 Creatomate（品牌簽名）。Onda/Bits 未確認授權前不用。

## 後果

- 正面：現有系統零風險（Director 為附加、feature-flag 可關回今日）；專業級成品（同級/優於 Creatomate）；機器自有後零邊際渲染成本；單一 composition = 最高豐富度與無縫感；資料驅動骨架讓「N 張不定圖」自動成立。
- 負面／代價：維護 3 條路（Quick/Director/Manual）；4b 幀段接合需處理邊界對齊；AI 編排約 90–95% 一次到位 → 必須 human-in-the-loop（預覽+一鍵微調）；豐富長片渲染非即時（背景非同步）；Director 正式長片**卡在更大機器到位**。
- 需跟進文件／腳本：
  - `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/tools/video/CONTEXT.md`（術語 SSOT）
  - `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/tools/video/AI_VIDEO_DIRECTOR_PLAN.md`（R0 實作計畫）
  - `agency-os/docs/architecture/decisions/ADR_INDEX.md`（本表）
  - 實作落地時：`remotion-service/`（Timeline composition + 幀段渲染）、next-admin `lib/content/video/`（Director + schema）、`app/tools/video/`（Production Mode UI）
- 絆線：Remotion 授權——團隊長到 4+ 人，或把本功能當 SaaS 賣給他公司用 → 回頭評估 Automators($100/月起)。
