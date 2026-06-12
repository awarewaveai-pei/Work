---
slug: to-print-file-pdfx
created_utc: 2026-06-12T10:59:00Z
hint: "[1-d] to-print-file.ts + ghostscript-pdfx.ts — 印刷軌核心。pdf-lib install, sharp 0.34.3 no withDensity, CMYK omit density, PrintDestination matrix, Ghostscript OutputIntent deploy-gated."
source_session_summary: "Image Output Pipeline: Phase 0 POC 全退技術風險 + 交付 Phase 1 [1-a]/[1-b]/[1-c]，下一步 [1-d] 印刷軌核心。"
---

# 任務目標
實作 `lib/studio/to-print-file.ts`（印刷軌核心，PrintDestination 積木矩陣）+ `lib/studio/ghostscript-pdfx.ts`（OutputIntent 介面）。依目的地 colorSpace/format/needsOutputIntent 三積木分支：cmyk→pdf-lib embedJpg+TrimBox；srgb→png 直出（TGC）。

# 為什麼做
Phase 1 印刷軌核心，Tarot 送印（本地 70×120 + 國際 70×121）唯一輸出路徑。[1-b]/[1-c] 已交付為其依賴。

# 已試過
[0-a] POC 完整驗過 sharp CMYK→pdf-lib embed+TrimBox 鏈（`$WORK_ROOT`/../d:\tmp\cmyk-poc\poc3.mjs，本機 PASS）。[1-c] 已實作同款 sharp resize+分支模式。pdf-lib **尚未**裝進 app（只在 d:\tmp POC）。

# 卡在哪
未開始。開工先決兩步：① `npm install pdf-lib`（app 未裝）② sharp pin 直接依賴（現 Next transitive @0.34.3）。

# 下一步指令
1. `cd $WORK_ROOT/lobster-factory/infra/hetzner-phase1-core/apps/next-admin && npm install pdf-lib`（sharp pin 可同時 `npm install sharp@0.34.3` 固定，或留到 Dockerfile COPY 一起處理 — 看 plan §18.1）。
2. 讀 plan `$WORK_ROOT/lobster-factory/docs/PLAN-tarot-pod-image-output-pipeline-plus.md` §10.0–§10.4（PrintDestination type + PRINT_DESTINATIONS SSOT + toPrintFile 積木組裝 + getPrintGeometry）+ §15.1 [1-d]。
3. 建 `lib/studio/to-print-file.ts`：`PrintDestination` type + `PRINT_DESTINATIONS`（tw-local/mpc/tgc/printninja）+ `getPrintGeometry()`（mm→px/pt，trim/bleed/MediaBox/TrimBox）+ `toPrintFile(input, dest, colorGrade?)`：resize→(cmyk: `.toColorspace('cmyk').jpeg({quality:100})` **不設 density** / srgb: `.png()`)→(pdf: pdf-lib embedJpg/embedPng + setMediaBox/setBleedBox/setTrimBox / png: 直出 buffer)→(needsOutputIntent: `applyOutputIntent()`)。套 colorGrade 用 `toSharpModulate`（from `./color-grade`，已實作）。
4. 建 `lib/studio/ghostscript-pdfx.ts`：`applyOutputIntent(pdf, iccProfile)` 介面 + ICC_PATHS map。**實作可先 stub/throw 'deploy-gated'**（gs 部署期才裝，見 landmines）— 介面隔離讓 [1-d] 純程式碼可完成不被 gs 阻塞。
5. 建 `lib/studio/__tests__/to-print-file.test.ts`：真 sharp+pdf-lib bake，驗 cmyk 分支 `/DeviceCMYK`+`/Decode`+三框（用 `pdf.save({useObjectStreams:false})` 才能 plaintext grep boxes — 見 poc3.mjs）、srgb 分支 PNG 3ch、garbage colorGrade 防禦。
6. Gate：`npx vitest run lib/studio/__tests__/to-print-file.test.ts` + `npx tsc --noEmit`（須 0）+ `/review` critic（外部 oracle）+ WORKLOG R0 四動作。
7. 更新 plan §15.1 [1-d] + `$WORK_ROOT/agency-os/TASKS.md` 標 ✅ + commit。

# 相關資源
- **Files**: `$WORK_ROOT/lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/`（color-grade.ts + to-product-image.ts 已交付為樣板）；plan §10.0–10.4 有 toPrintFile 完整 code spec；參考 `d:\tmp\cmyk-poc\poc3.mjs`（CMYK+TrimBox 完整鏈，**但改成不設 density** 以相容 0.34.3）。
- **Commits**: d5034fa3 [1-c] / f1a57ebc [1-b] / 80e18db9 [0-c] SSRF。
- **Known landmines**:
  - CMYK **絕不** `.withMetadata({density})`（附 sRGB ICC 破壞 CMYK，轉回 3ch）；`.withDensity()` 需 sharp≥0.35，**app=0.34.3 無此 method**（tsc 會擋）→ CMYK/web **一律不設 density**（實體尺寸靠 PDF MediaBox/TrimBox points）。
  - pdf-lib embedJpg 對 4ch CMYK **自動**加 `/Decode[1 0 1 0 1 0 1 0]`（正確，非雙重反相，因 libvips 寫 APP14 t=0）— 勿手動再加。
  - pdf-lib **無 OutputIntent**（PR#1512 closed）→ ICC 走 Ghostscript（`applyOutputIntent` stub 即可，部署期 Alpine `apk add ghostscript` + ICC 採購才實裝；不阻塞純程式碼）。
  - **TGC 目的地 colorSpace='srgb' format='png'**（CMYK 退件！）— 別讓所有目的地都走 CMYK 分支。
  - 驗 PDF box 要 `pdf.save({useObjectStreams:false})`，否則 boxes 在壓縮 object stream，grep 不到。
