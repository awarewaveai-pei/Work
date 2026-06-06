---
slug: pod-studio-roadmap
created_utc: 2026-06-06T12:26:00Z
hint: "POD Studio roadmap + tarot 收尾；tarot 框線 png 還沒做好"
source_session_summary: "建塔羅印刷工具(多輪部署:3層透明框/自動縮圖/移除Claude翻譯)+ 寫完整 POD Studio 30年路線圖(含 Jon MEGA 完整參考)"
---

# 任務目標
接續 POD Studio 路線圖（設計生成→去背→Printful→上架 WooCommerce 賣），並收尾 tarot 工具的框線。

# 為什麼做
操作者下次再做（純 carry-over，非阻塞）。

# 已試過
- tarot 已部署 SG 多輪：3 層透明框（flood-fill 去背 6 框）、上傳參考圖自動縮圖（修 invalid_json）、移除每張卡的 Claude haiku 翻譯（省錢+不卡頓）、分組/單張生成、模板縮圖選擇器。最新 deploy commit `6bd6f153`。
- **完整計畫已寫成單一 SSOT**：`$WORK_ROOT/lobster-factory/docs/POD_STUDIO_ROADMAP.md`（7 段 R0 計畫 + 附錄 A 操作者完整需求 + 附錄 B Jon MEGA 完整功能/設定/定價/生成器參考）。PIL 已驗證 3 層合成邏輯正確。

# 卡在哪
1. **tarot 框線 PNG 還沒做好**：6 框的「藝術圖區域」用一個共用寬鬆窗（`renderPrintCard.ts` 常數 `ART`），未 per-frame 微調 → gothic 拱形太擠、貓被切；celestial 星月框生成時被內容過濾擋掉（只有 6 框，缺第 7）。
2. POD 後續（P2a R2 儲存 → P3 上架）未開工，等操作者決定 4 件先決事項。

# 下一步指令
1. 先讀 `$WORK_ROOT/lobster-factory/docs/POD_STUDIO_ROADMAP.md`（整份計畫 SSOT，附錄 A/B 為需求與 MEGA 藍本）。
2. **收尾 tarot 框（若操作者要）**：
   a. per-frame 藝術圖區域 → 把 `app/tools/tarot/renderPrintCard.ts` 的共用 `ART` 常數改成每框各自 rect（gothic 縮小+上移、folk 避頂部太陽、矩形框可放大）。用 PIL 在本機合成驗證再部署（canvas 本機跑不了）。
   b. 補生 celestial 框：SG `docker exec lobster-next-admin printenv REPLICATE_API_TOKEN` → flux-dev 生「星月神秘框」→ flood-fill 去背（PIL，seed 中央 thresh 60）→ 存 `public/tarot-frames/celestial.png` → 加進 `CARD_TEMPLATES`。內容過濾擋 occult 時改用較中性措辭。
3. **POD 開工前先問操作者 4 件先決**（見 doc §待決定）：① Hostinger 方案能否加子站 ② 子網域 `shop.soulfulexpression.org` ③ 操作者 Printful 帳號 ④ tarot「好用」標準。
4. 4 件確認後 → 從 **P2a R2 儲存層**開始（`lib/storage/r2.ts` S3 client 用 vault `CF_R2_*`，寫 `media_assets`，新 designs bucket，My Designs 頁）。每階段純新增 + flag 預設 OFF + R0 四動作 + `sg-deploy.sh next-admin`。
5. OpenAI gpt-image 三檔仍待操作者帳號加 billing（FLUX 不受影響）。

# 相關資源
- 計畫 SSOT：`$WORK_ROOT/lobster-factory/docs/POD_STUDIO_ROADMAP.md`
- tarot code：`$WORK_ROOT/lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/tools/tarot/`（`renderPrintCard.ts` 框合成 + `ART` 常數 / `cards.ts` / `TarotStudio.tsx`）+ `lib/tarot/image-gen.ts`
- 框 PNG：`$WORK_ROOT/.../apps/next-admin/public/tarot-frames/*.png`（6 個透明框；URL 有 `?v=2` 快取破壞）
- R2 keys：vault `CF_R2_ACCOUNT_ID/API_TOKEN/BUCKET`；合約 `lobster-factory/docs/operations/MEDIA_STORAGE_BOUNDARY_CONTRACT.md`
- **Landmines**：① canvas 合成本機 Node 跑不了 → 用 PIL 驗證 ② 框 PNG 改了要 bump `?v=N` 否則瀏覽器快取舊框 ③ 上傳參考圖必須縮圖（>10MB body → Next 截斷 → invalid_json）④ 勿重加 Claude 翻譯（操作者明示不花 API 錢）⑤ sg-deploy 前 `git config core.fileMode false` 已設於 SG /root/Work
