# Feature: Image Output Pipeline
<!-- drafted by feature-plan skill, 2026-06-12 -->

## 問題與目標

**解決什麼問題？**  
生圖引擎只輸出原始 RGB data URL；現在需要支援：① 色調預覽與匯出、② 塔羅印刷 CMYK PDF 300 DPI、③ 商品圖 72 DPI JPEG ~100KB、④ 送進 Fabric.js Canvas 編輯器。

**成功標準**  
- TarotStudio：可調色調 → 按「印刷用」→ 下載 CMYK PDF 896×1488 @ 300 DPI
- StudioWorkbench：可調色調 → 按「網頁用」→ 下載 JPEG 1000×1000 @ 72 DPI
- 任一工具可「送進 Canvas」→ Fabric.js 編輯器開啟圖片可加文字/貼圖

**MVP 範圍（最小可驗收版本）**  
1. ColorGradePanel + useColorGrade hook（preview CSS filter）  
2. OutputTrackBar（三按鈕）  
3. /api/tools/image/process（後處理統一入口）  
4. 網頁用軌（Sharp resize 1000×1000 JPEG 72 DPI）  
5. 印刷用軌（Sharp CMYK 300 DPI → PDF，塔羅 896×1488）  
6. Canvas 軌（Fabric.js editor，基於現有 tshirt-designer-prototype.html）

**明確不在本次 scope**  
- POD（Printful）印刷軌不動，Printful 自行轉 CMYK
- upscaler.ts 不改（目標 4800px 是 t-shirt 用途）
- 多語言 / 存檔到 R2（MVP 後）

---

## 重要：讀程式碼後的發現（勿重做）

### 已存在，直接用

| 現有 | 位置 | 說明 |
|------|------|------|
| `printQuality: boolean` | `image-gen.ts:264` | Flux 傳 `true` → 直接生成 896×1488 @ 300 DPI，**無需 upscaler** |
| `FLUX_PRINT_DIMS` | `image-gen.ts:64` | `"2:3": [896, 1488]` 塔羅尺寸已寫死 |
| `upscaleToPrintFile()` | `upscaler.ts:130` | 目標 4800px，**POD t-shirt 用**，塔羅不走這條 |
| Fabric.js 原型 | `d:\tmp\tshirt-designer-prototype.html` | Fabric.js 5.3.0，深色主題，三欄佈局 |
| `image-provider.ts` | `lib/studio/image-provider.ts` | 薄 facade，re-export image-gen，**現在沒有 printQuality 傳遞** |

### 塔羅印刷軌真實 px 需求

```
7.6cm × 300 DPI / 2.54 = 897px → 896px（FLUX_PRINT_DIMS["2:3"] 已有）
12.6cm × 300 DPI / 2.54 = 1488px（已有）

Flux + printQuality:true → 直接生成 896×1488，不需 upscale
其他模型（Ideogram 1664×2496, Seedream/NanoBanana 2K）→ 已夠大，resize 到 896×1488
```

---

## 積木設計（Composable Blocks）

```
每個工具選需要的積木組合，不強制全套：

Tarot Studio:
  ✅ useColorGrade() + ColorGradePanel
  ✅ OutputTrackBar
  ❌ AspectRatioSelector（塔羅固定 2:3，不需選）

Studio Workbench:
  ✅ useColorGrade() + ColorGradePanel
  ✅ AspectRatioSelector（已有）
  ✅ OutputTrackBar
```

---

## 技術分解（按 Layer）

### Layer 0 — 引擎小修（S, <1 天）

| 任務 | 檔案 | 說明 |
|------|------|------|
| 0-a | `lib/studio/image-provider.ts` | 把 `printQuality` 從 `TarotGenParams` 透傳到 `StudioGenParams`；現在 facade 沒 expose 這個欄位 |

### Layer 1 — 前端積木（S × 3, 各 <1 天）

| 任務 | 新增檔案 | 說明 |
|------|---------|------|
| 1-a | `lib/studio/color-grade.ts` | `useColorGrade()` hook → `{ hue, sat, bri, filterStyle, colorGradeParams, reset }`；`colorGradeParams` 是傳給 Sharp 的數值物件 |
| 1-b | `components/tools/ColorGradePanel.tsx` | 三個滑桿 UI（色調 ±30°、飽和 0–200%、亮度 0–200%）；接 `useColorGrade()` 回傳值 |
| 1-c | `components/tools/OutputTrackBar.tsx` | 三個按鈕：`[🌐 網頁用]` `[🖨 印刷用]` `[🎨 Canvas 編輯]`；`印刷用` 點擊時 toast「轉換中…」 |

### Layer 2 — 後處理 Server-side（S/M）

| 任務 | 新增檔案 | Size | 說明 |
|------|---------|------|------|
| 2-a | `lib/studio/to-product-image.ts` | S | Sharp: `resize(1000,1000,{fit:'contain'})` + `jpeg({quality:80})` + `withMetadata({density:72})`；回傳 base64 data URL |
| 2-b | `lib/studio/to-print-pdf.ts` | M | Sharp: resize to 896×1488 + `toColorspace('cmyk')` + `withMetadata({density:300})` → TIFF buffer → `pdf-lib` 嵌入 → 回傳 PDF Buffer；需新增 `pdf-lib` 依賴 |
| 2-c | `app/api/tools/image/process/route.ts` | M | 統一入口；body: `{ imageUrl, track: 'web'\|'print'\|'canvas', colorGrade?: { hue, sat, bri } }`；web/print 呼叫 2-a/2-b；canvas 直接回原圖 URL |

### Layer 3 — Canvas 編輯器（M, 1–2 天）

| 任務 | 新增檔案 | 說明 |
|------|---------|------|
| 3-a | `app/tools/canvas/CanvasEditor.tsx` | Fabric.js 5.x client component；移植自 `d:\tmp\tshirt-designer-prototype.html`；功能：載入圖片、加文字、貼圖、位置調整、完成後可再走 OutputTrackBar |
| 3-b | `app/tools/canvas/page.tsx` | `/tools/canvas` 路由，接收 `?imageUrl=` param |

### Layer 4 — 接線到現有工具（S × 2）

| 任務 | 改動檔案 | 說明 |
|------|---------|------|
| 4-a | `app/tools/tarot/TarotStudio.tsx` | 生成結果下方插入 `ColorGradePanel` + `OutputTrackBar`；不加 AspectRatioSelector |
| 4-b | `app/tools/studio/StudioWorkbench.tsx` | 生成結果下方插入 `ColorGradePanel` + `OutputTrackBar`（AspectRatioSelector 已有） |

---

## 依賴新增

```jsonc
// package.json 新增（需評估是否已有）
"pdf-lib": "^1.17.1"  // PDF 生成，MIT
"fabric": "^5.3.1"    // Canvas editor（原型用 CDN，正式需 npm）
// Sharp 已在專案中（upscaler.ts），不需新增
```

---

## 影響評估

| 系統 | 影響程度 | 說明 |
|------|---------|------|
| `image-gen.ts` | **無** | 不動引擎 |
| `upscaler.ts` | **無** | 不動 POD 軌 |
| `image-provider.ts` | 最小 | 只加 `printQuality` 透傳 |
| `TarotStudio.tsx` | 低 | 插入積木，不改生成邏輯 |
| `StudioWorkbench.tsx` | 低 | 插入積木，不改生成邏輯 |
| 新 API route | 中 | 新增，不影響既有 route |
| DB schema | **無** | 不涉及 |
| Auth / RLS | **無** | 不涉及 |

**不可逆變更**：`pdf-lib` / `fabric` 依賴加入 package.json（低風險，MIT）。

---

## 任務清單

```markdown
### 🎨 Image Output Pipeline

- [ ] **[0-a S]** `image-provider.ts` 透傳 `printQuality` 欄位
- [ ] **[1-a S]** `lib/studio/color-grade.ts` — useColorGrade hook + Sharp bake util
- [ ] **[1-b S]** `components/tools/ColorGradePanel.tsx` — 色調/飽和/亮度三滑桿
- [ ] **[1-c S]** `components/tools/OutputTrackBar.tsx` — 網頁用/印刷用/Canvas 三按鈕
- [ ] **[2-a S]** `lib/studio/to-product-image.ts` — Sharp 1000px JPEG 72 DPI
- [ ] **[2-b M]** `lib/studio/to-print-pdf.ts` — Sharp CMYK 300 DPI + pdf-lib (塔羅)
- [ ] **[2-c M]** `app/api/tools/image/process/route.ts` — 統一後處理入口
- [ ] **[3-a M]** `app/tools/canvas/CanvasEditor.tsx` — Fabric.js editor（移植原型）
- [ ] **[3-b S]** `app/tools/canvas/page.tsx` — Canvas 路由
- [ ] **[4-a S]** `TarotStudio.tsx` 接線 ColorGradePanel + OutputTrackBar
- [ ] **[4-b S]** `StudioWorkbench.tsx` 接線 ColorGradePanel + OutputTrackBar
```

**總估時**：S×8 + M×3 ≈ 8 天（含 tsc + critic 驗收）

---

## 施工順序

```
Day 1–2:  0-a + 1-a + 1-b + 1-c（積木層，無後端依賴）
Day 3:    2-a（toProductImage，驗收最簡單）
Day 4–5:  2-b + 2-c（toPrintPDF + API route）
Day 6–7:  3-a + 3-b（Canvas editor）
Day 8:    4-a + 4-b（接線 + tsc --noEmit + critic + real test）
```

---

_SSOT 引擎_：[`lib/tarot/image-gen.ts`](../infra/hetzner-phase1-core/apps/next-admin/lib/tarot/image-gen.ts)  
_印刷尺寸_：塔羅 7.6×12.6cm @ 300 DPI = 896×1488 px（`FLUX_PRINT_DIMS["2:3"]`，image-gen.ts:64）  
_upscaler_：POD t-shirt 用（4800px 目標），塔羅印刷**不走**此路
