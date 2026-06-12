# ⚠️ DEPRECATED — 請改用 SSOT

> **此文件已被取代。** 新版完整 spec 在 [`PLAN-tarot-pod-image-output-pipeline-plus.md`](./PLAN-tarot-pod-image-output-pipeline-plus.md)
> 
> 主要差異：Phase 0 POC gates / CMYK ICC profile / SSRF 安全 / discriminated union API / Canva → Phase 1.5 / Tarot WebP = 667×1000 / POD PDF = 情境 A（直送本地印刷廠）

---

# PLAN: Tarot + POD Image Output Pipeline
## Color Grade → Web (WebP) / Print (CMYK PDF) / Canvas (Fabric.js) / Canva

> 定案日：2026-06-12｜詳細技術分析：`docs/feature-image-output-pipeline.md`

---

## 一句話說明

在 Tarot Studio 和 POD Studio 的生圖結果下方加入：
**① 色調滑桿** → **② 四軌輸出按鈕**（網頁用 / 印刷用 / 快速編輯 / Canva）

---

## 已確認決策

| 決策 | 結論 |
|------|------|
| 快速 Canvas 編輯器 | Fabric.js in-app（移植現有原型 `d:\tmp\tshirt-designer-prototype.html`） |
| 進階 Canvas 編輯器 | Canva API via MCP（`import-design-from-url` → 使用者編輯 → `export-design` 拉回）|
| CMYK 輸出方案 | Sharp `toColorspace('cmyk')` → CMYK JPEG → pdf-lib `embedJpg()` → `/DeviceCMYK` PDF ✅ |
| SVG / AI 格式 | **跳過**：AI 生圖是點陣，raster 包 SVG 無意義，印刷廠 PDF 足夠 |
| 色調匯出 | 一律 bake 進去（CSS filter 只是 preview） |
| POD 印刷（Printful）| 不動，Printful 自行轉 CMYK，不走本流程 |
| upscaler.ts | 不動，目標 4800px 是 t-shirt 用途，塔羅不需要 |

---

## 輸出軌規格（最終版）

| 按鍵 | 像素 | DPI | 色空間 | 格式 | 預估大小 |
|------|------|-----|--------|------|---------|
| 🌐 **網頁用** | 1000 × 1000 | 72 | RGB | WebP `quality:80` | ~60 KB |
| 🖨 **印刷用** | 896 × 1488 | 300 | CMYK | PDF（CMYK JPEG 內嵌）| ~2–3 MB |
| ✏️ **快速編輯** | 原圖 | — | RGB/CMYK | 原圖送入 Fabric.js | — |
| 🎨 **Canva** | 原圖 | — | RGB/CMYK | Canva API import → export | — |

**Canvas 兩軌定位**：
- `✏️ 快速編輯`（Fabric.js）：文字疊加、貼圖、構圖微調，留在 app 內，無外部帳號需求
- `🎨 Canva`：複雜排版、品牌模板、進階設計，跳出至 Canva，完成後 export 拉回 app

**兩軌共同流程**：
```
編輯完成
  → putDesignObject(key, buffer)   ← lib/storage/r2.ts 已有
  → 出現於 https://app.aware-wave.com/tools/designs
  → OutputTrackBar 選「網頁用」或「印刷用」匯出
```

**兩個 Canvas 場景（共用 Fabric.js 核心）**：

| | Phase 1（本次）| Phase 2（獨立 task）|
|--|---------------|-------------------|
| 對象 | 內部（admin）| 客戶端（customer-facing）|
| 位置 | `/tools/canvas`（next-admin）| 商品頁（WooCommerce）|
| 存設計 | R2 → `/tools/designs` | R2 or WC order meta |
| 匯出 | WebP / CMYK PDF | Printful print file |
| 購物車 | 無 | 接 WooCommerce + Printful |

**塔羅尺寸根據**：7.6 × 12.6 cm @ 300 DPI = 896 × 1488 px（含出血，`FLUX_PRINT_DIMS["2:3"]` 已寫死於 `image-gen.ts:64`）

---

## 積木設計

```
每個工具自選需要的積木，不強制全套：

Tarot Studio          POD Studio (StudioWorkbench)
─────────────────     ──────────────────────────────
✅ ColorGradePanel    ✅ ColorGradePanel
✅ OutputTrackBar     ✅ OutputTrackBar
❌ AspectRatioSelector ✅ AspectRatioSelector（已有）
```

---

## 現有資產（禁止重做）

| 資產 | 位置 | 用途 |
|------|------|------|
| `printQuality: boolean` | `image-gen.ts:264` | Flux 直接生成 896×1488，不需 upscale |
| `FLUX_PRINT_DIMS` | `image-gen.ts:64` | 塔羅 px 尺寸 SSOT |
| Sharp（已安裝） | `node_modules/sharp` | 所有後處理：resize / CMYK / WebP |
| `putDesignObject()` | `lib/storage/r2.ts` | 存圖到 Cloudflare R2 |
| `/tools/designs` | `app/tools/designs/DesignsGallery.tsx` | 設計存檔展示頁（已上線）|
| Fabric.js 原型 | `d:\tmp\tshirt-designer-prototype.html` | Canvas editor 起點 |
| `upscaler.ts` | `lib/studio/upscaler.ts` | POD t-shirt 用，**本 feature 不碰** |

---

## 全部任務（排序施工）

### Day 1–2：前端積木層（無後端依賴，可並行）

- [ ] **[0-a]** `lib/studio/image-provider.ts` — 透傳 `printQuality` 欄位（facade 現在沒 expose）
- [ ] **[1-a]** `lib/studio/color-grade.ts` — `useColorGrade()` hook
  - 回傳：`{ hue, sat, bri, filterStyle, colorGradeParams, reset }`
  - `filterStyle`：CSS string（`hue-rotate(Xdeg) saturate(X%) brightness(X%)`）
  - `colorGradeParams`：Sharp `modulate({ hue, saturation, brightness })` 數值物件
  - 對應關係：hue deg 一致；sat/bri：CSS `150%` = Sharp `1.5`
- [ ] **[1-b]** `components/tools/ColorGradePanel.tsx` — 三滑桿
  - 色調：±30°（中間 = 0，不改）
  - 飽和：50–200%（中間 = 100%）
  - 亮度：50–200%（中間 = 100%）
- [ ] **[1-c]** `components/tools/OutputTrackBar.tsx` — 三按鈕
  - `[🌐 網頁用]`：呼叫 `/api/tools/image/process` track=web
  - `[🖨 印刷用]`：呼叫 `/api/tools/image/process` track=print，點擊時 toast「轉換中…」
  - `[🎨 Canvas 編輯]`：router.push `/tools/canvas?imageUrl=…`

### Day 3：網頁用軌後端

- [ ] **[2-a]** `lib/studio/to-product-image.ts`
  ```ts
  sharp(buf)
    .resize(1000, 1000, { fit: 'contain' })
    .webp({ quality: 80 })
    .withMetadata({ density: 72 })
  // 回傳 data:image/webp;base64,...
  ```

### Day 4–5：印刷用軌後端

- [ ] **[2-b]** `lib/studio/to-print-pdf.ts`
  ```ts
  // 1. resize 到塔羅完稿尺寸
  sharp(buf).resize(896, 1488, { fit: 'cover' })
  // 2. CMYK 轉換（Sharp → CMYK JPEG）
    .toColorspace('cmyk').jpeg({ quality: 100 })
    .withMetadata({ density: 300 })
  // 3. pdf-lib 嵌入（自動偵測 4 channels → /DeviceCMYK）
  const pdf = await PDFDocument.create()
  const img = await pdf.embedJpg(cmykJpegBuffer)
  // 回傳 PDF Buffer
  ```
  **依賴**：`npm install pdf-lib`（MIT，尚未安裝）

- [ ] **[2-c]** `app/api/tools/image/process/route.ts`
  ```ts
  // export const runtime = "nodejs"
  // export const maxDuration = 60
  // body: { imageUrl, track: 'web'|'print'|'canvas', colorGrade?: { hue, sat, bri } }
  // web   → toProductImage()
  // print → toPrintPdf()
  // canvas → 直接回 imageUrl（前端處理）
  ```

### Day 6–7：Canvas 編輯器

- [ ] **[3-a]** `app/tools/canvas/CanvasEditor.tsx`
  - `dynamic(() => import('fabric'), { ssr: false })`（解決 Next.js SSR 問題）
  - 載入 `?imageUrl=` 參數圖片到 Fabric.js canvas
  - 功能：加文字、貼圖、位置調整
  - 完成後底部顯示 `OutputTrackBar`（可再選網頁用 / 印刷用）
  - **依賴**：`npm install fabric`（尚未安裝）

- [ ] **[3-b]** `app/tools/canvas/page.tsx` — `/tools/canvas` 路由

### Day 7（同天）：Canva 整合（S）

- [ ] **[3-c]** `lib/studio/canva-export.ts`
  - `sendToCanva(imageUrl)` → Canva MCP `import-design-from-url` → 回傳 Canva design URL
  - `fetchFromCanva(designId)` → Canva MCP `export-design` → 回傳 image URL
- [ ] **[3-d]** OutputTrackBar `[🎨 Canva]` 按鈕接線
  - 點擊 → 呼叫 `sendToCanva()` → 新分頁開 Canva 編輯
  - 使用者完成後回 app → 觸發 `fetchFromCanva()` 拉回圖片 → 再選輸出軌

### Day 8：接線到現有工具

- [ ] **[4-a]** `app/tools/tarot/TarotStudio.tsx`
  - 生成結果下方插入 `<ColorGradePanel>` + `<OutputTrackBar>`
  - **不加** `AspectRatioSelector`（塔羅固定 2:3）

- [ ] **[4-b]** `app/tools/studio/StudioWorkbench.tsx`
  - 生成結果下方插入 `<ColorGradePanel>` + `<OutputTrackBar>`
  - `AspectRatioSelector` 已有，不動

### Day 8（同天）：驗收

- [ ] `npx tsc --noEmit`（每個 .ts/.tsx 改動後必跑）
- [ ] `/review` critic 驗收
- [ ] REALTEST：生一張圖 → 網頁用下載 WebP 確認 ~60KB / 印刷用下載 PDF 確認 CMYK 4ch / Canvas 確認 Fabric.js 開啟

---

## 新增依賴

```bash
npm install pdf-lib   # PDF 生成（MIT）
npm install fabric    # Canvas editor（MIT）
# Sharp 已在專案中，不需新增
```

---

## 不碰的邊界

- `lib/tarot/image-gen.ts`：引擎不動
- `lib/studio/upscaler.ts`：POD t-shirt 流程不動
- `app/api/tools/tarot/generate/route.ts`：生圖 API 不動
- `app/api/tools/studio/generate/route.ts`：生圖 API 不動
- DB schema：無異動
- Auth / RLS：無異動

---

## Rollback

- 前端積木：刪 import 即可，不影響生圖功能
- `image-provider.ts` 修改：只加一個欄位透傳，移除即可
- `pdf-lib` / `fabric`：`npm uninstall` 即可
- API route：新增 route，刪除不影響既有功能

---

*詳細技術分析 → [`feature-image-output-pipeline.md`](./feature-image-output-pipeline.md)*
