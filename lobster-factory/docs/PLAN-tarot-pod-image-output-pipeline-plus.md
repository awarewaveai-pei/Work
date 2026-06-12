# PLAN: Tarot + POD Image Output Pipeline — Final Locked Spec

## Color Grade → WebP / CMYK PDF / Fabric.js Canvas / Canva POC

> 定案日：2026-06-12  
> Final Locked 修訂：2026-06-12（採納 Final+，並修正 Vercel duration / Sharp metadata 敘述）  
> 狀態：可進 Phase 0 POC  
> 詳細技術分析：`docs/feature-image-output-pipeline.md`

> **Final Locked 關鍵前置問題**：本 feature 的「印刷用 PDF」到底**會不會直送印刷廠**？
> - 會 → CMYK 驗收門檻要拉到 ICC profile 等級（見 14.1a），Phase 0 不只驗「是 CMYK」，還要驗「是印刷廠要的那個 CMYK」。
> - 不會（只是客戶自行下載的高品質檔）→ Sharp naive CMYK 可接受，但此前提**必須寫死**，禁止之後拿去送印。
> **這個問題的答案決定 Phase 0 CMYK 驗收的嚴格度，必須在 [0-a] 開始前確認。**

> **Final Locked 補充**：本版為可交付工程 spec。除非 Phase 0 POC 實測結果推翻假設，後續不再擴充 scope；只允許根據 POC gate 切換 pdf-lib / Ghostscript / 取消 CMYK PDF。

---

# 📋 給 AI Agent 的開工指示（START HERE）

> **Agent 必讀。開始任何 coding 前，先讀完本節，再從 Phase 0 開始。**

## A. 先決定，再開工（人類已填的決策）

以下三項是人類決策，agent 不得自行猜測。發出本 spec 前由負責人填寫；若任何一項仍為「待填」，**agent 必須停下來先問，不得猜一個預設值往下做**。

| # | 決策 | 答案（負責人填寫）| 影響 |
|---|---|---|---|
| **1** | 印刷用 PDF 走 **情境 A（直送印刷廠，需 ICC profile）** 或 **情境 B（客戶自行下載，naive CMYK 可接受）**？若 A，指定 CMYK profile 名稱。 | **A — 直送印刷廠；profile = Japan Color 2001 Coated（台灣標準）** | 決定 14.1a / 14.2 的 CMYK 驗收門檻 |
| **2** | `ALLOWED_IMAGE_HOSTS` 的真實 host 清單（取代 spec 中的範例值）。 | `app.aware-wave.com`, `cdn.aware-wave.com`, `r2.aware-wave.com`（或讀 env `ALLOWED_IMAGE_HOSTS`）| 決定 §8.2 SSRF allowlist |
| **3** | 塔羅（2:3）的「網頁用」輸出要 **正方形補白（1000×1000 contain）** 或 **維持 2:3**？POD 同問。 | **tarot = 維持 2:3（667×1000，fit cover，不補白）；pod = 1000×1000 正方形補白** | 決定 §9 `toProductImage()` 需 preset 化，§5.1 加 `WebTarotPreset` |

> 註（#3）：目前 §9 `toProductImage()` 寫死 1000×1000 `fit:'contain'`+白底，但 §5 定義了 `WebSquarePreset`。若 #3 答案不是「全部正方形補白」，agent 需把 `toProductImage()` 改成吃 preset（width/height/fit/background 由 preset 決定），讓 §9 與 §5 一致。

## B. 待補機制（agent 需先讀 codebase 再實作，不可實作淺版本）

- **imageUrl 授權檢查**（§8.1「驗證使用者有權存取該 imageUrl」）：先找出本專案現有的 auth / ownership 檢查 pattern（session、RLS、R2 key 命名規則等），沿用之；**不要自己發明一個淺的 owner 檢查**。找不到既有 pattern 就停下來問。
- **`putDesignObject()` 簽章**：實作前先讀 `lib/storage/r2.ts` 確認參數與回傳，不要照記憶寫。
- **既有 auth / RLS**（§2「沿用既有機制」）：先讀懂再接，不改動。

## C. 施工紀律

- **嚴格照 Phase 0 → Gate → Phase 1 → Phase 1.5 順序。** Phase 0 三個 POC 全綠燈前，不得寫 Phase 1 主線程式。
- **遇到 POC gate 停下來回報，等人類確認再繼續**（見 D）。
- **不擴 scope。** §3 非目標範圍內的東西一律不碰；§13 既有資產（`image-gen.ts` / `upscaler.ts` / 生圖 API / DB schema / Printful）一律不動。
- 每改一個 `.ts` / `.tsx` 跑 `npx tsc --noEmit`。
- 鎖定並記錄 `fabric`、`sharp`、`pdf-lib` 的實際安裝版本（§10.x / §14 都依賴版本行為）。

## D. 哪些 gate 需要人類在環（agent 跑到這裡交回球）

以下步驟 agent **無法獨立完成**，產出程式碼與機器可驗的結果後，把球交回負責人，附上 `pdfimages -list` / `qpdf` / grep 輸出與待檢視的檔案：

- **§14.1 CMYK 目視驗收**：Adobe Acrobat preflight 顯示 CMYK、膚色/暗部無 inversion、無過暗 → 需人眼 + Acrobat。
- **§14.1a 情境 A 的印刷廠 preflight** → 需送印刷廠或用其 profile 實測。
- **§16.3 REALTEST**：實際生一張塔羅 / POD 圖目視整條流程 → 需人類操作 UI。

> Agent 可以做到的：寫完 pipeline、跑 `pdfimages -list` / `exiftool` / `qpdf --qdf` / `grep DeviceCMYK\|Decode`，把結果貼出來，並指出是否符合機器可驗的驗收項。**目視與印刷廠驗收留給人類。**

---

# 0. 一句話說明

在 Tarot Studio 和 POD Studio 的生圖結果下方加入：

**① 色調滑桿** → **② 三軌輸出按鈕**：

1. 網頁用 WebP  
2. 印刷用 PDF  
3. 快速編輯 Fabric.js Canvas  

Canva 整合不進 MVP，移到 **Phase 1.5 POC**。

---

# 1. Final 修訂摘要

| 項目 | 最終決策 |
|---|---|
| Canva | 移出 MVP，Phase 1.5 POC，未通過不進主線 |
| CMYK PDF | Phase 0 阻塞 POC，驗證 `/DeviceCMYK` 與 preflight |
| PDF page size | 必做，用 points 設定實體尺寸，不只靠 density metadata |
| API 安全 | 必做 SSRF 防護、allowlist、timeout、size limit、auth |
| POD Studio 印刷用 | `pod-print-pdf`，情境 A（ICC = Japan Color 2001 Coated）；Printful 走現有 sRGB `upscaler.ts` 不動 |
| Canvas → Print | 必須回 Sharp CMYK pipeline，不能直接包 RGB PDF |
| Fabric.js + Next.js | Phase 0 POC，確認 App Router、CORS、export taint |
| Canvas export | 主線使用 `toBlob()` export PNG，不依賴 `toDataURL()` |
| WebP response | MVP 可回 data URL；Future 改 binary response 或 R2 URL |
| CSS preview 差異 | 加 disclaimer 即可，不做 server-side preview |
| `toPrintPdf()` | 必須 preset-driven，不得寫死塔羅尺寸 |
| API body | 使用 discriminated union，避免非法組合 |
| ColorGrade payload | 後端統一吃 `{ hue, saturation, brightness }` multiplier 格式 |
| **CMYK ICC profile** | **Final+：先確認是否直送印刷廠；情境 A 需 ICC，naive CMYK 不夠（14.1a）** |
| **CMYK 反相對策** | **Final+：Adobe APP14 / inverted CMYK → `/Decode` array（14.1）** |
| **Sharp 版本** | **Final+：鎖版本，`withMetadata` v0.33+ deprecated，確認 density** |
| **API rate limit** | **Final+：per-user，避免狂刷轉檔** |
| **maxDuration** | **Final+：確認部署方案支援 60s（Vercel Hobby 只有 10s）** |

---

# 2. 已確認決策

| 決策 | 結論 |
|---|---|
| 快速 Canvas 編輯器 | Fabric.js in-app，移植現有原型 `d:\tmp\tshirt-designer-prototype.html` |
| 進階 Canvas 編輯器 | Canva，Phase 1.5 POC，未驗證前不進 MVP |
| CMYK 輸出方案 | 待驗證假設：Sharp `toColorspace('cmyk')` → CMYK JPEG → pdf-lib `embedJpg()` → `/DeviceCMYK` PDF |
| SVG / AI 格式 | 跳過。AI 生圖是 raster，raster 包 SVG 無意義，印刷廠 PDF 足夠 |
| 色調匯出 | 一律 bake 進輸出檔。CSS filter 只做 preview |
| POD 印刷 Printful | **不動**。Printful 官方要求 sRGB（PNG/JPEG）；他們自己轉 CMYK，禁止送 CMYK 給 Printful。Printful path 走現有 `upscaler.ts`，不走本流程。([官方來源](https://www.printful.com/blog/everything-you-need-to-know-to-prepare-the-perfect-printfile)) |
| POD 本地印刷廠 | 新增 `pod-print-pdf` preset。情境 A，需 Japan Color 2001 Coated ICC。與塔羅 PDF 同一 pipeline，preset 驅動不同尺寸 |
| `upscaler.ts` | 不動。4800px 是 t-shirt 用途，塔羅不需要 |
| DB schema | MVP 不異動 |
| Auth / RLS | MVP 不異動，沿用既有機制 |

---

# 3. 非目標範圍

本 feature 不處理：

- Printful print file 生成
- WooCommerce checkout / cart integration
- 客戶端商品頁 Canvas
- SVG / AI / vector export
- 生圖 API 重構
- `lib/tarot/image-gen.ts` 引擎邏輯
- `lib/studio/upscaler.ts`
- DB schema migration
- Canva 正式整合

---

# 4. 輸出軌規格

## 4.1 MVP 三軌

| 按鍵 | Tarot 用途 | POD 用途 | 像素 | DPI | 色空間 | 格式 | 狀態 |
|---|---|---|---:|---:|---|---|---|
| 🌐 網頁用 | 社群 / preview | 合成商品圖（網站展示）| Tarot:667×1000 / POD:1000×1000 | 72 | RGB | WebP `quality:80` | MVP |
| 🖨 印刷用 | 送本地印刷廠 | 送本地印刷廠 | preset 決定 | 300 | CMYK | PDF + Japan Color 2001 Coated | MVP，需 Phase 0 POC |
| ✏️ 快速編輯 | in-app 文字、貼圖、構圖微調 | 同左 | 原圖 | — | RGB | Fabric.js Canvas | MVP |
| 🎨 Canva | 複雜排版、品牌模板 | 同左 | 原圖 | — | RGB | Canva API | Future / Phase 1.5 |
| 📦 Printful | — | sRGB PNG → Printful API | upscaler.ts 輸出 | 300 | sRGB | PNG | 現有流程，不動 |

---

# 5. Preset 設計

## 5.1 OutputPreset

```ts
export type OutputPreset =
  | WebSquarePreset
  | WebTarotPreset
  | TarotPrintPdfPreset
  | PodPrintPdfPreset
  | CanvasEditPreset

/** POD Studio 網頁用 — 1000×1000 正方形補白 */
export type WebSquarePreset = {
  kind: 'web-square'
  widthPx: 1000
  heightPx: 1000
  dpi: 72
  fit: 'contain'
}

/** Tarot Studio 網頁用 — 維持 2:3（667×1000，不補白） */
export type WebTarotPreset = {
  kind: 'web-tarot'
  widthPx: 667
  heightPx: 1000
  dpi: 72
  fit: 'cover'
}

export type TarotPrintPdfPreset = {
  kind: 'tarot-print-pdf'
  widthPx: 896
  heightPx: 1488
  widthCm: 7.6
  heightCm: 12.6
  dpi: 300
  fit: 'cover'
}

export type PodPrintPdfPreset = {
  kind: 'pod-print-pdf'
  widthPx: number
  heightPx: number
  dpi: 300
  fit: 'contain' | 'cover'

  /**
   * Optional physical output size.
   * If absent, PDF page size is derived from widthPx / dpi and heightPx / dpi.
   */
  widthCm?: number
  heightCm?: number
}

export type CanvasEditPreset = {
  kind: 'canvas-edit'
}
```

---

## 5.2 各工具掛載 preset

```txt
Tarot Studio:
  ✅ web-tarot (667×1000, 2:3, no padding)
  ✅ tarot-print-pdf
  ✅ canvas-edit
  ⏳ Canva Future

POD Studio:
  ✅ web-square (1000×1000, contain, white bg)
  ✅ pod-print-pdf
  ✅ canvas-edit
  ⏳ Canva Future
```

---

## 5.3 POD print PDF page size 規則

POD Studio 的「印刷用」= 本地印刷廠 CMYK PDF（Printful 另走 sRGB `upscaler.ts`，不動）。

UI 文案：

```txt
本地印刷 PDF（Japan Color 2001 Coated）
```

不是：

```txt
Printful 印刷檔
```

`pod-print-pdf` page size 規則：

```txt
1. 若來源有明確商品尺寸：
   使用商品尺寸換算 PDF points。

2. 若來源沒有明確商品尺寸：
   使用 pixel / 300dpi 換算 inch，再換算 points。

3. 不接 Printful API，不進 WooCommerce checkout，不替代 upscaler.ts。

4. ICC：Japan Color 2001 Coated（同 tarot-print-pdf）。
```

換算公式：

```ts
const pageWidthPt = widthPx / dpi * 72
const pageHeightPt = heightPx / dpi * 72
```

若有 cm 實體尺寸：

```ts
const pageWidthPt = widthCm / 2.54 * 72
const pageHeightPt = heightCm / 2.54 * 72
```

---

# 6. Color Grade 設計

## 6.1 UI slider

| 參數 | UI 範圍 | 中立值 |
|---|---:|---:|
| Hue | -30° 到 +30° | 0 |
| Saturation | 50% 到 200% | 100% |
| Brightness | 50% 到 200% | 100% |

---

## 6.2 前端 state

前端可以用短名：

```ts
type ColorGradeState = {
  hue: number // -30..30 degrees
  sat: number // 50..200 percent
  bri: number // 50..200 percent
}
```

---

## 6.3 API payload

送到後端時必須統一成 Sharp-friendly multiplier：

```ts
export type ColorGradeParams = {
  hue: number // degrees, -30..30
  saturation: number // multiplier, 0.5..2
  brightness: number // multiplier, 0.5..2
}
```

轉換：

```ts
const colorGradeParams: ColorGradeParams = {
  hue,
  saturation: sat / 100,
  brightness: bri / 100,
}
```

---

## 6.4 CSS preview

```ts
const filterStyle = `
  hue-rotate(${hue}deg)
  saturate(${sat}%)
  brightness(${bri}%)
`
```

注意：

```txt
CSS hue-rotate 是 RGB matrix，不是真正 HSL 轉換。
Sharp modulate() 與 CSS preview 不會 100% 一致。
```

UI 小字：

```txt
預覽色彩可能與最終輸出略有差異，下載檔案以實際輸出為準。
```

---

# 7. API 設計

## 7.1 Request type

不要使用鬆散型別：

```ts
{ imageUrl, track, preset?, colorGrade? }
```

改用 discriminated union：

```ts
export type ImageProcessRequest =
  | WebImageProcessRequest
  | PrintImageProcessRequest
  | CanvasImageProcessRequest

export type WebImageProcessRequest = {
  track: 'web'
  imageUrl: string
  preset: 'web-square'
  colorGrade?: ColorGradeParams
}

export type PrintImageProcessRequest = {
  track: 'print'
  imageUrl: string
  preset: 'tarot-print-pdf' | 'pod-print-pdf'
  colorGrade?: ColorGradeParams

  /**
   * Required only for pod-print-pdf if dimensions cannot be inferred server-side.
   */
  podPreset?: {
    widthPx: number
    heightPx: number
    dpi: 300
    fit: 'contain' | 'cover'
    widthCm?: number
    heightCm?: number
  }
}

export type CanvasImageProcessRequest = {
  track: 'canvas'
  imageUrl: string
  preset: 'canvas-edit'
}
```

---

## 7.2 API route

檔案：

```txt
app/api/tools/image/process/route.ts
```

設定：

```ts
export const runtime = 'nodejs'
export const maxDuration = 60
```

> ⚠️ 確認部署方案是否支援 `maxDuration: 60`。Vercel 不同 plan / runtime / Fluid Compute 設定下限制不同，不要假設所有環境都可用。部署前需實測 `app/api/tools/image/process/route.ts`，並確認目前專案的 Vercel plan、Fluid Compute 狀態與 function duration 設定。CMYK + PDF 對 896×1488 通常不應太慢，但未來若放大尺寸或併發提高，需重新評估。

流程：

```txt
1. parse body
2. validate discriminated union
3. verify auth
4. validate imageUrl
5. fetch image with security guard
6. apply colorGrade if provided
7. branch by track:
   - web   → toProductImage()
   - print → toPrintPdf()
   - canvas → return imageUrl
8. return file response or data URL
```

---

# 8. API 安全需求

`/api/tools/image/process` 不可直接 fetch 任意 URL。必須做 SSRF 防護。

## 8.1 必做項目

```txt
☐ 只允許 R2/CDN allowlist domain
☐ 禁 localhost
☐ 禁 private IP ranges
☐ 禁 link-local / metadata IP，例如 169.254.169.254
☐ HEAD 檢查 content-type: image/*
☐ 檢查 content-length，不得超過 max input size，例如 20MB
☐ fetch timeout，例如 10s
☐ Sharp limitInputPixels
☐ 驗證使用者有權存取該 imageUrl
☐ 不 follow redirect 到非 allowlist domain
☐ per-user rate limit（避免單一使用者狂刷轉檔耗資源）
```

---

## 8.2 建議常數

```ts
const ALLOWED_IMAGE_HOSTS = [
  'app.aware-wave.com',
  'cdn.aware-wave.com',
  'r2.aware-wave.com',
]

const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const FETCH_TIMEOUT_MS = 10_000
const SHARP_LIMIT_INPUT_PIXELS = 50_000_000
```

---

# 9. WebP 輸出

檔案：

```txt
lib/studio/to-product-image.ts
```

規格：

```ts
import sharp from 'sharp'
import type { ColorGradeParams } from './color-grade'

export async function toProductImage(
  input: Buffer,
  preset: WebSquarePreset | WebTarotPreset,
  colorGrade?: ColorGradeParams
): Promise<Buffer> {
  let img = sharp(input, {
    limitInputPixels: 50_000_000,
  })

  if (colorGrade) {
    img = img.modulate({
      hue: colorGrade.hue,
      saturation: colorGrade.saturation,
      brightness: colorGrade.brightness,
    })
  }

  const background = preset.fit === 'contain'
    ? { r: 255, g: 255, b: 255, alpha: 1 }
    : undefined

  return img
    .resize(preset.widthPx, preset.heightPx, {
      fit: preset.fit,
      ...(background ? { background } : {}),
    })
    .webp({ quality: 80 })
    .withMetadata({ density: preset.dpi })
    .toBuffer()
}

// Canonical preset instances
export const WEB_TAROT_PRESET: WebTarotPreset = {
  kind: 'web-tarot', widthPx: 667, heightPx: 1000, dpi: 72, fit: 'cover',
}
export const WEB_SQUARE_PRESET: WebSquarePreset = {
  kind: 'web-square', widthPx: 1000, heightPx: 1000, dpi: 72, fit: 'contain',
}
```

MVP response：

```txt
可回傳 data:image/webp;base64,...
```

Future：

```txt
改成 binary response 或存 R2 回 signed/public URL。
```

---

# 10. Print PDF 輸出

檔案：

```txt
lib/studio/to-print-pdf.ts
```

## 10.1 PrintPreset

```ts
export type PrintPreset =
  | {
      kind: 'tarot-print-pdf'
      widthPx: 896
      heightPx: 1488
      widthCm: 7.6
      heightCm: 12.6
      dpi: 300
      fit: 'cover'
    }
  | {
      kind: 'pod-print-pdf'
      widthPx: number
      heightPx: number
      dpi: 300
      fit: 'contain' | 'cover'
      widthCm?: number
      heightCm?: number
    }
```

---

## 10.2 PDF page size helper

```ts
function cmToPt(cm: number): number {
  return (cm / 2.54) * 72
}

function pxToPt(px: number, dpi: number): number {
  return (px / dpi) * 72
}

function getPdfPageSizePt(preset: PrintPreset): {
  widthPt: number
  heightPt: number
} {
  if (preset.widthCm && preset.heightCm) {
    return {
      widthPt: cmToPt(preset.widthCm),
      heightPt: cmToPt(preset.heightCm),
    }
  }

  return {
    widthPt: pxToPt(preset.widthPx, preset.dpi),
    heightPt: pxToPt(preset.heightPx, preset.dpi),
  }
}
```

---

## 10.3 toPrintPdf()

```ts
import sharp from 'sharp'
import { PDFDocument } from 'pdf-lib'
import type { ColorGradeParams } from './color-grade'

export async function toPrintPdf(
  input: Buffer,
  preset: PrintPreset,
  colorGrade?: ColorGradeParams
): Promise<Buffer> {
  let img = sharp(input, {
    limitInputPixels: 50_000_000,
  })

  if (colorGrade) {
    img = img.modulate({
      hue: colorGrade.hue,
      saturation: colorGrade.saturation,
      brightness: colorGrade.brightness,
    })
  }

  const cmykJpegBuffer = await img
    .resize(preset.widthPx, preset.heightPx, {
      fit: preset.fit,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .toColorspace('cmyk')
    .jpeg({ quality: 100 })
    .withMetadata({ density: preset.dpi })
    .toBuffer()

  const { widthPt, heightPt } = getPdfPageSizePt(preset)

  const pdf = await PDFDocument.create()
  const embedded = await pdf.embedJpg(cmykJpegBuffer)

  const page = pdf.addPage([widthPt, heightPt])
  page.drawImage(embedded, {
    x: 0,
    y: 0,
    width: widthPt,
    height: heightPt,
  })

  const pdfBytes = await pdf.save()
  return Buffer.from(pdfBytes)
}
```

> **效能備註**：上面 `modulate()` 在 `resize()` 之前，等於在全解析度上跑色調調整。正確性沒問題，但若要省一點，可改成先 `resize` 再 `modulate`。非阻塞。

> **Sharp 版本備註**：
> - 鎖定 Sharp 版本，並在 Phase 0 驗證 DPI / density 是否真的寫入輸出檔。
> - 若採用的 Sharp 版本支援 `withDensity(dpi)`，優先使用 `withDensity()` 設定 DPI。
> - 若沿用 `withMetadata({ density })`，需用 `exiftool` / `identify` / PDF preflight 驗證 density 是否成功寫入，不可只相信程式碼。
> - ICC 處理應使用 `withIccProfile()` / `keepIccProfile()` 或替代 pipeline 驗證；不要只靠 `toColorspace('cmyk')` 判定為印刷廠級色彩。
> - `toColorspace('cmyk')` 可產生 4-channel DeviceCMYK，但不等於已滿足印刷廠指定 ICC profile（見 14.1a）。

---

## 10.4 重要警告

這條 pipeline 只有在 Phase 0 POC 通過後才能進 Phase 1。

必須驗證：

```txt
Sharp CMYK JPEG → pdf-lib embedJpg → PDF image object 仍然是 /DeviceCMYK
```

若 pdf-lib 會轉回 RGB，不能使用此 pipeline 進 MVP。

---

# 11. Canvas 編輯器

## 11.1 Canvas 定位

`✏️ 快速編輯`：

```txt
Fabric.js in-app editor
用途：
- 加文字
- 加貼圖
- 移動 / 縮放 / 旋轉
- 構圖微調
- 存成可再次編輯的 design
```

位置：

```txt
/tools/canvas
```

Phase 1 對象：

```txt
內部 admin
```

Phase 2 才考慮：

```txt
customer-facing 商品頁 Canvas + WooCommerce + Printful
```

---

## 11.2 Fabric.js + Next.js 注意事項

必須 Phase 0 POC 驗證：

```txt
☐ App Router client component 正常
☐ Fabric 版本鎖定，v5 / v6 API 不混用
☐ dynamic import 成功
☐ 不在 server component 觸碰 window / document
☐ R2 image CORS 正確
☐ crossOrigin: 'anonymous'
☐ export 不 taint
```

---

## 11.3 Canvas export 主線

不要把 `toDataURL()` 當主線。

主線使用：

```txt
canvas.toBlob()
```

canonical browser export 格式：

```txt
PNG Blob
```

流程：

```txt
Fabric Canvas
  → canvas.toBlob('image/png')
  → upload PNG Blob to R2
  → putDesignObject()
  → /tools/designs 顯示
  → 後續 WebP / Print PDF 都交給 server-side Sharp pipeline
```

理由：

```txt
- 避免 base64 大字串
- 避免 browser WebP 支援差異
- 避免 data URL 記憶體膨脹
- server-side Sharp 才是輸出 SSOT
```

---

## 11.4 Canvas → Print 流程

Canvas 編輯後輸出的 PNG 是 RGB。若使用者選「印刷用」，必須重新走 Sharp CMYK pipeline。

```txt
Fabric Canvas
  → export PNG Blob
  → upload to R2
  → OutputTrackBar 選「印刷用」
  → /api/tools/image/process track=print
  → Sharp resize
  → Sharp CMYK conversion
  → CMYK JPEG
  → PDF page size points
  → pdf-lib embedJpg
  → preflight
```

禁止：

```txt
Fabric Canvas RGB PNG
  → 直接包 PDF
```

因為這會產生 RGB PDF。

---

## 11.5 Canvas 存檔策略

每個 design 至少存三種資產：

```txt
design.json          // Fabric canvas state，可重新編輯
preview.webp         // gallery preview
source-export.png    // canonical flattened export，用於後續 Sharp pipeline
```

輸出後可另外存：

```txt
web.webp
print.pdf
```

---

# 12. R2 / CDN CORS

Fabric.js 從外部 URL 載入圖片時，CORS 不正確會導致 canvas taint，進而讓 export 失敗。

R2 / CDN 需要：

```http
Access-Control-Allow-Origin: https://app.aware-wave.com
Access-Control-Allow-Methods: GET, HEAD
Access-Control-Allow-Headers: Content-Type
```

Fabric 載圖必須帶：

```ts
crossOrigin: 'anonymous'
```

---

# 13. 現有資產

| 資產 | 位置 | 用途 |
|---|---|---|
| `printQuality: boolean` | `image-gen.ts:264` | Flux 直接生成 896×1488，不需 upscale |
| `FLUX_PRINT_DIMS` | `image-gen.ts:64` | 塔羅 px 尺寸 SSOT |
| Sharp | `node_modules/sharp` | resize / CMYK / WebP / color grade |
| `putDesignObject()` | `lib/storage/r2.ts` | 存圖到 Cloudflare R2 |
| `/tools/designs` | `app/tools/designs/DesignsGallery.tsx` | 設計存檔展示頁 |
| Fabric.js 原型 | `d:\tmp\tshirt-designer-prototype.html` | Canvas editor 起點 |
| `upscaler.ts` | `lib/studio/upscaler.ts` | POD t-shirt 用，本 feature 不碰 |

---

# 14. Phase 0：技術 POC / 風險消除

Phase 0 是阻塞階段。未通過不得進 Phase 1 主線。

---

## 14.1 [0-a] CMYK PDF POC

目標：

```txt
驗證 Sharp CMYK JPEG + pdf-lib embedJpg 是否能產生真正 /DeviceCMYK PDF。
```

測試指令：

```bash
pdfimages -list output.pdf
exiftool output.pdf
qpdf --qdf --object-streams=disable output.pdf inspect.pdf
grep -n "DeviceCMYK\|DeviceRGB\|ColorSpace\|Decode" inspect.pdf
```

驗收條件：

```txt
☐ PDF page size = 7.6 × 12.6 cm 對應 point size
☐ 不是只有 300 DPI metadata
☐ image object /ColorSpace = /DeviceCMYK
☐ pdfimages -list 顯示 CMYK / 4-channel
☐ 未被轉回 /DeviceRGB
☐ Adobe Acrobat preflight 顯示 CMYK
☐ 黑色、膚色、暗部沒有 inversion
☐ 黑色、膚色、暗部沒有明顯過暗
```

已知失敗模式與對策：

```txt
反相（negative / 負片）：
  成因：CMYK JPEG 常帶 Adobe APP14 marker，存的是 inverted CMYK (YCCK)。
        pdf-lib embedJpg 若未正確處理 APP14 transform flag，embed 後變負片。
  徵兆：pdfimages 抽出來的圖整張反白 / 顏色相反。
  對策：在 PDF image dict 加 /Decode [1 0 1 0 1 0 1 0] 反轉回來。
        （這就是上面 grep 要抓 Decode 的原因。）
  若 pdf-lib 無法手動加 Decode array → 列為 pdf-lib 失敗，走 14.2 gate。
```

---

## 14.1a [0-a-icc] CMYK 色彩正確性（印刷廠級）

> **這是 final 版驗收的關鍵補強。**

上面的驗收只能證明「PDF *是* CMYK」「沒有反相 / 沒有壞掉」，**證明不了「色彩是印刷廠要的那個 CMYK」**。

```txt
Sharp toColorspace('cmyk') 是 naive 數學轉換，不帶 ICC profile。
→ 技術上是 4-channel DeviceCMYK，Acrobat 也顯示 CMYK，前面驗收全過。
→ 但印刷廠 preflight 可能因「no output intent / unknown CMYK」退件，
   或印出來顏色偏掉（尤其膚色、企業色）。
```

依「是否直送印刷廠」分流：

```txt
情境 A：印刷用 PDF 會直送印刷廠
  ☐ 先向印刷廠確認要哪個 CMYK profile
     （台灣常見：Japan Color 2001 Coated；歐美：US Web Coated SWOP / FOGRA）
  ☐ 評估用 sharp().withIccProfile(profilePath) 或在 pdf-lib 加 OutputIntent
  ☐ POC 必須拿「真的有 profile 的 PDF」過印刷廠 preflight，不能只看 Acrobat 顯示 CMYK
  ☐ 上面 14.1 的 naive CMYK 視為「不通過」

情境 B：印刷用 PDF 只是客戶自行下載的高品質檔，不直送印刷廠
  ☐ Sharp naive CMYK 可接受
  ☐ 但此前提必須寫死在文件與 UI 文案（例：「高品質下載 PDF，送印前請與印刷廠確認色彩」）
  ☐ 禁止之後把這條輸出直接拿去送印而不重做色彩管理
```

**[0-a] 開始前，必須先決定本案是 A 還是 B。** 答案決定 CMYK 驗收門檻。

---

## 14.2 [0-a-gate] CMYK PDF decision gate

```txt
前置：先確定情境 A（直送印刷廠）或 B（客戶自行下載）。見 14.1a。

若 pdf-lib POC 通過，且色彩達到情境所需門檻（A 需 ICC / B 接受 naive）：
  Phase 1 使用 pdf-lib pipeline。

若 pdf-lib embed 正確但情境 A 的 ICC 色彩不達標：
  評估 pdf-lib 加 OutputIntent，或改 Ghostscript pipeline 套 profile。

若 pdf-lib POC 失敗（反相無法用 Decode 修正 / 無法產 DeviceCMYK），
但 Ghostscript pipeline 通過：
  Phase 1 改用 Ghostscript pipeline。

若 pdf-lib 與 Ghostscript 都失敗：
  MVP 取消 CMYK PDF。
  本次只做 WebP + Fabric Canvas。
  印刷 PDF 另開獨立 task。
```

禁止狀態：

```txt
「再研究一下」但繼續做 Phase 1。
```

---

## 14.3 [0-b] Fabric.js + Next.js App Router POC

POC 路由：

```txt
/tools/canvas-poc
```

驗收條件：

```txt
☐ client component 正常
☐ dynamic import fabric 正常
☐ Fabric 版本鎖定
☐ 載入 R2 圖片
☐ crossOrigin: 'anonymous'
☐ 加文字
☐ 移動 / 縮放 / 旋轉
☐ canvas.toBlob('image/png') 成功
☐ upload PNG Blob to R2 成功
☐ export 後再接 /api/tools/image/process track=print 成功
☐ canvas 未 taint
```

---

## 14.4 [0-c] image process API security POC

驗收條件：

```txt
☐ allowlist host 生效
☐ localhost 被擋
☐ private IP 被擋
☐ 169.254.169.254 被擋
☐ redirect 到非 allowlist domain 被擋
☐ 非 image content-type 被擋
☐ 超過 max content-length 被擋
☐ fetch timeout 生效
☐ Sharp limitInputPixels 生效
☐ 未授權 imageUrl 被擋
```

---

# 15. Phase 1：MVP 主線

Phase 1 只能在 Phase 0 通過後開始。

---

## 15.1 後端核心

### [1-a] `lib/studio/image-provider.ts`

目標：

```txt
透傳 printQuality 欄位。
facade 現在沒有 expose，需補上。
```

限制：

```txt
只加欄位透傳，不重構 image provider。
```

---

### [1-b] `lib/studio/color-grade.ts`

輸出：

```ts
export type ColorGradeParams = {
  hue: number
  saturation: number
  brightness: number
}

export function toSharpModulateParams(params: ColorGradeParams) {
  return {
    hue: params.hue,
    saturation: params.saturation,
    brightness: params.brightness,
  }
}
```

若同檔也放 hook：

```ts
export function useColorGrade() {
  // returns:
  // hue, sat, bri
  // filterStyle
  // colorGradeParams
  // reset()
}
```

---

### [1-c] `lib/studio/to-product-image.ts`

實作 WebP 輸出。

需求：

```txt
☐ resize 1000×1000
☐ fit contain
☐ background white or transparent，依產品需求決定
☐ WebP quality 80
☐ density 72
☐ 可套 colorGrade
☐ MVP 可回 data URL
```

---

### [1-d] `lib/studio/to-print-pdf.ts`

實作 print PDF 輸出。

需求：

```txt
☐ preset-driven
☐ 不寫死 896×1488
☐ tarot-print-pdf 使用 7.6×12.6cm points
☐ pod-print-pdf 使用 cm 或 px/dpi 換算 points
☐ 可套 colorGrade
☐ Sharp resize
☐ Sharp toColorspace('cmyk')
☐ JPEG quality 100
☐ pdf-lib embedJpg
☐ Phase 0 POC 通過後才能 merge
```

---

### [1-e] `app/api/tools/image/process/route.ts`

需求：

```txt
☐ runtime nodejs
☐ maxDuration 60
☐ discriminated union request validation
☐ auth
☐ imageUrl security guard
☐ fetch image
☐ web → toProductImage()
☐ print → toPrintPdf()
☐ canvas → return imageUrl
☐ 錯誤訊息清楚
```

---

## 15.2 前端積木

### [1-f] `components/tools/ColorGradePanel.tsx`

需求：

```txt
☐ Hue slider -30..30
☐ Saturation slider 50..200
☐ Brightness slider 50..200
☐ Reset button
☐ CSS filter preview
☐ disclaimer 小字
```

Disclaimer：

```txt
預覽色彩可能與最終輸出略有差異，下載檔案以實際輸出為準。
```

---

### [1-g] `components/tools/OutputTrackBar.tsx`

MVP 三按鈕：

```txt
[🌐 網頁用]
  → /api/tools/image/process track=web preset=web-square

[🖨 印刷用]
  → /api/tools/image/process track=print preset=tarot-print-pdf 或 pod-print-pdf
  → toast: 轉換中…

[✏️ 快速編輯]
  → router.push('/tools/canvas?imageUrl=...')
```

Canva：

```txt
[🎨 Canva]
  → Future
  → 先 feature flag 隱藏，或顯示「即將推出」
```

Props 建議：

```ts
type OutputTrackBarProps = {
  imageUrl: string
  source: 'tarot' | 'pod' | 'canvas'
  availablePresets: OutputPreset[]
  colorGrade?: ColorGradeParams
}
```

---

## 15.3 Canvas 編輯器

### [1-h] `app/tools/canvas/page.tsx`

需求：

```txt
☐ App Router page
☐ 讀取 searchParams.imageUrl
☐ render CanvasEditor client component
```

---

### [1-i] `app/tools/canvas/CanvasEditor.tsx`

需求：

```txt
☐ client component
☐ 沿用 Phase 0 Fabric 版本與 import 方式
☐ 載入 imageUrl
☐ crossOrigin anonymous
☐ 加文字
☐ 加貼圖
☐ 移動 / 縮放 / 旋轉
☐ save design.json
☐ export preview.webp
☐ export source-export.png via toBlob()
☐ upload to R2 via putDesignObject()
☐ 完成後出現 OutputTrackBar
☐ 印刷用走 Sharp CMYK pipeline
```

---

## 15.4 接線到現有工具

### [1-j] `app/tools/tarot/TarotStudio.tsx`

需求：

```txt
生成結果下方加入：
☐ ColorGradePanel
☐ OutputTrackBar

preset：
☐ web-square
☐ tarot-print-pdf
☐ canvas-edit

限制：
☐ 不加 AspectRatioSelector
☐ 塔羅固定 2:3
```

---

### [1-k] `app/tools/studio/StudioWorkbench.tsx`

需求：

```txt
生成結果下方加入：
☐ ColorGradePanel
☐ OutputTrackBar

preset：
☐ web-square
☐ pod-print-pdf
☐ canvas-edit

限制：
☐ AspectRatioSelector 已有，不動
☐ 印刷用文案寫「高品質下載 PDF」
☐ 不套 tarot 896×1488
☐ 不接 Printful
```

---

# 16. Phase 1 驗收

## 16.1 Typecheck

每個 `.ts` / `.tsx` 修改後必跑：

```bash
npx tsc --noEmit
```

---

## 16.2 Critic review

```txt
/review critic 驗收
```

---

## 16.3 REALTEST

### Tarot Studio

```txt
☐ 生一張塔羅圖
☐ 調色 preview 正常
☐ 網頁用下載 WebP
☐ WebP 約 1000×1000
☐ 印刷用下載 PDF
☐ PDF page size = 7.6×12.6cm
☐ PDF 通過 Phase 0 CMYK 驗收
☐ 快速編輯可開 Canvas
☐ Canvas 加文字
☐ Canvas 存檔
☐ Canvas export 後再印刷仍是 CMYK PDF
```

---

### POD Studio

```txt
☐ 生一張 POD 圖
☐ 調色 preview 正常
☐ 網頁用下載 WebP
☐ 高品質下載 PDF
☐ PDF page size 符合 pod-print-pdf 規則
☐ 不套 tarot 896×1488
☐ 不接 Printful
☐ 快速編輯可開 Canvas
☐ Canvas export 後可再 WebP / PDF
```

---

### API Security

```txt
☐ allowlist imageUrl 成功
☐ 非 allowlist imageUrl 失敗
☐ localhost imageUrl 失敗
☐ private IP imageUrl 失敗
☐ metadata IP 失敗
☐ oversized image 失敗
☐ non-image response 失敗
☐ timeout 生效
```

---

# 17. Phase 1.5：Canva POC

Canva 不進 MVP。只有 POC 通過後，才回頭接 OutputTrackBar。

---

## 17.1 POC 目標

```txt
A. 上傳圖片到 Canva Assets
B. 是否能建立含該圖片的新 design
C. 是否能取得 edit_url
D. 使用者在 Canva 編輯
E. export jpg/png/pdf
F. export job polling
G. 下載 URL 24h 過期處理
H. 回存 R2
```

---

## 17.2 注意事項

```txt
Canva Design Import API 主要吃設計檔，不是一般圖片匯入主路徑。
圖片應走 Canva Assets API。
Canva export 是 async job，不可寫成同步 fetchFromCanva()。
下載 URL 有效期有限，需處理過期與重新 export。
```

---

## 17.3 任務

### [5-a] Canva Assets upload POC

```txt
☐ 上傳 JPEG
☐ 上傳 PNG
☐ 上傳 WebP
☐ 回傳 asset id
☐ 錯誤狀態處理
```

### [5-b] Canva design creation / edit URL POC

```txt
☐ 建立含圖片的新 design
☐ 取得 edit_url
☐ 使用者可開 Canva 編輯
```

### [5-c] Canva export POC

```txt
☐ create export job
☐ polling
☐ success 狀態
☐ failed 狀態
☐ timeout 狀態
☐ 下載 export file
☐ 回存 R2
```

### [5-d] 通過後接線

```txt
☐ OutputTrackBar 顯示 Canva button
☐ feature flag 控制
☐ sendToCanva()
☐ returnFromCanva()
☐ export 後回 Sharp pipeline
```

---

# 18. 新增依賴

```bash
npm install pdf-lib
npm install fabric
```

條件：

```txt
pdf-lib：
  Phase 0 CMYK POC 通過後才正式採用。

fabric：
  Phase 0 App Router POC 通過後鎖版本。
```

Sharp 已安裝，不需新增。

---

# 19. Rollback

| 項目 | Rollback |
|---|---|
| 前端積木 | 移除 import，不影響生圖 |
| `image-provider.ts` | 移除 `printQuality` 透傳 |
| `pdf-lib` | `npm uninstall pdf-lib` |
| `fabric` | `npm uninstall fabric` |
| API route | 刪除 `app/api/tools/image/process/route.ts` |
| Canvas route | 刪除 `/tools/canvas` |
| Canva | feature flag 關閉即可 |
| POD PDF | 移除 `pod-print-pdf` preset |
| Tarot PDF | 移除 `tarot-print-pdf` preset |

---

# 20. 風險判斷總表

| 項目 | 性質 | 處置 |
|---|---|---|
| CMYK PDF | 阻塞風險 | Phase 0 POC，驗 `/DeviceCMYK` + preflight |
| CMYK 色彩正確性 (ICC) | 阻塞風險 (情境 A) | 先確認直送印刷廠與否；A 需 ICC profile，見 14.1a |
| CMYK JPEG 反相 | 阻塞風險 | `/Decode [1 0 1 0 1 0 1 0]` 對策，見 14.1 |
| pdf-lib embed CMYK | 阻塞風險 | POC 通過才採用 |
| Sharp 版本 / withMetadata | 必做 | 鎖版本，確認 density 寫入；v0.33+ 已 deprecated |
| PDF page size | 必做 | 用 points，不靠 density metadata |
| SSRF / API 安全 | 必做 | allowlist / size / timeout / auth |
| API rate limit | 必做 | per-user，避免狂刷轉檔 |
| Canvas → Print | 必做 | 回 Sharp CMYK pipeline |
| Fabric.js + Next.js | 必做 | Phase 0 POC，鎖版本 |
| R2 CORS | 必做 | 避免 canvas taint |
| Canva | 阻塞風險 | 移出 MVP，Phase 1.5 POC |
| POD Studio PDF | 工程取捨 | 可接，但用 `pod-print-pdf` |
| CSS preview 差異 | 工程取捨 | 加 disclaimer |
| WebP data URL | 工程取捨 | MVP 可接受 |
| Canvas `toDataURL()` | 避免主線使用 | 改 `toBlob()` PNG |
| ColorGrade naming | 必做 | API 統一 `hue/saturation/brightness` |

---

# 21. 最終施工順序

```txt
Phase 0:
  0-a CMYK PDF POC
  0-b Fabric.js App Router POC
  0-c API security POC

Gate:
  Phase 0 全部通過才進 Phase 1

Phase 1:
  1-a image-provider printQuality
  1-b color-grade types + hook
  1-c toProductImage
  1-d toPrintPdf
  1-e image process API
  1-f ColorGradePanel
  1-g OutputTrackBar
  1-h canvas page
  1-i CanvasEditor
  1-j TarotStudio 接線
  1-k StudioWorkbench 接線
  1-l REALTEST

Phase 1.5:
  Canva POC

Phase 2:
  customer-facing Canvas
  WooCommerce / Printful integration
```

---

# 22. 一句話結論

本 feature 的 MVP 是：

```txt
Tarot / POD 生圖
  → 色調調整
  → WebP
  → 印刷 PDF
  → Fabric.js 快速編輯
```

其中：

```txt
CMYK PDF、Fabric.js App Router、API 安全是 Phase 0 阻塞 POC。
Canva 不進 MVP。
POD PDF 是高品質下載 PDF，不是 Printful print file。
Canvas 編輯後的印刷輸出必須回 Sharp CMYK pipeline。
```
