# Card 09 — 影片 ⑧ QA：未通過也要看得到原因

回報操作者一律繁體中文、極精簡。不做無效益測試：只寫本卡點名的測試。
背景：`agency-os/docs/video_generator/VIDEO_TOOL_OPERATOR_FINDINGS_2026-10-26.md` S12、m15。路徑縮寫 `NA/` = `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`。

## Decision
1. `NA/app/api/video/qa/reports/route.ts:24` 的 `.in("status", ["passed", "warned"])` 改成 `["passed", "warned", "failed"]`（`superseded` 仍不回）。select 加 `report_json`，但**不回整包**：每列只多一個 `findings: { rule: string; severity: string; message: string; format?: string }[]`，由新純函式 `summarizeQaFindings(reportJson: unknown)` 抽出，最多 20 筆。兩種 report_json 形狀都要處理：
   - 編輯／版權：頂層 `findings[]`，欄位 `code`、`severity`、`message`。
   - 技術：`formats.<fmt>.signalQa.findings[]` 與 `formats.<fmt>.technicalQa.findings[]`（也接受 snake_case `signal_qa`／`technical_qa`），欄位 `ruleId`、`severity`、`message`；`format` 填 `<fmt>`。
   Release 閘不受影響：它在伺服器端自己讀證據（`NA/lib/content/video/release-gate.ts:16-17` 只放行 `passed`），這支 API 只供畫面顯示。
2. `NA/app/(shell)/tools/video/QaStep.tsx`：
   - `byKind`（`:56`）目前 `new Map(qaItems.map(...))` 在新→舊排序下會留下**最舊**那筆；改成每個 kind 取**第一筆**（最新）。
   - 狀態顯示：passed=「✓ 通過」、warned=「⚠ 警告」、failed=「✗ 未通過」、無資料=「尚未檢查」。warned 與 failed 下方逐條列 finding 的中文說明；已知代碼對照（找不到就顯示原 message）：`picture.black_frames`=黑畫面過多、`picture.freeze`=畫面凍結、`audio.loudness`=音量不在標準內、`audio.true_peak`=音量爆音、`caption.timing`=字幕時間軸有誤、`missing_script`=成片沒有記錄腳本、`rights_not_cleared`=素材未標記授權、`missing_license_ref`=缺授權文件、`missing_source_ref`=缺素材來源。
   - 四張卡各加一行說明：技術=檔案能播、無黑畫面／凍結、音量合格；字幕=字幕與聲音對得上（需先在 ⑦ 產生字幕）；編輯=有腳本、沒有禁用詞；版權=每個素材都有授權與來源。
   - 卡片下方一行：「QA 是出片前的檢查報告，不會出現在影片裡；四項都通過才能建立 Release。」
3. `NA/app/(shell)/tools/video/ReleaseDeliveryPanel.tsx:24` 的 `qaItems` 型別容許新的 `findings` 欄位（不改畫面）。

## Constraints
- 不改 DB、不改 migration、不改 `release-gate.ts`／`release-evidence.ts`、不改權限檢查（`route.ts:11-18` 原樣）。
- 不回傳 `report_json` 原文給瀏覽器（只回摘要）。
- 樣式只用既有 CSS 變數（`var(--green)`、`var(--red)`、`var(--badge-*)`…，同檔現有寫法）。

## Files
- `NA/app/api/video/qa/reports/route.ts`
- `NA/lib/content/video/qa-findings-summary.ts`（新：`summarizeQaFindings`）
- `NA/lib/content/video/__tests__/qa-findings-summary.test.ts`（新）
- `NA/app/(shell)/tools/video/QaStep.tsx`
- `NA/app/(shell)/tools/video/ReleaseDeliveryPanel.tsx`

## Acceptance
- `qa-findings-summary.test.ts`：(a) 編輯／版權形狀 → 回 code/severity/message；(b) 技術形狀含兩個 format 各一條 black_frames → 回兩筆且 `format` 正確；(c) snake_case `signal_qa` 也抽得到；(d) 非物件／null → `[]`；(e) 超過 20 筆截到 20。
- `npx tsc --noEmit` 綠。
