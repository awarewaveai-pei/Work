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
| **Sharp 版本** | **[0-a]/[1-c] 實證：`.withMetadata({density})` 破壞 CMYK；`.withDensity()` 需 sharp≥0.35 但 app=0.34.3 無此 method → CMYK/web 一律「不設 density」（PDF 幾何/pixel box 載重）；sharp 須 pin 直接依賴** |
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
    .webp({ quality: 80 })  // 不設 density：web 螢幕忽略，sizing 由 pixel box 決定（見 §10.2 ⚠️）
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

## 10.0 印刷目的地積木（Composable Print Destinations）— SSOT

> **2026-06-12 重大修訂**：印刷輸出改為**目的地驅動積木**。原因見下方兩個 ground-truth（已用 web-researcher 查證）。
>
> **Ground-truth 1（阻塞）**：[pdf-lib PR #1512](https://github.com/Hopding/pdf-lib/issues/1512)「加 OutputIntent」2024-04 被關閉未 merge，library 已停止維護。→ **pdf-lib 無法產生帶 ICC OutputIntent 的 PDF/X**。情境 A（直送印刷廠）必須 **Ghostscript** 後處理套 profile。pdf-lib 仍負責 embed CMYK JPEG + `setTrimBox()`/`setBleedBox()`（已確認支援）+ 自動 `/Decode` 反相修正。
>
> **Ground-truth 2（尺寸/色彩多樣性）**：國際塔羅 POD 各服務規格不一，**不全是 CMYK**。The Game Crafter **只收 RGB（CMYK 退件）**。國際標準成品 = **70×121mm**（≠ 台灣本地 70×120mm）。

每個印刷目的地 = 一塊可組裝積木，欄位自選組合：

```ts
export type ColorSpaceTarget = 'cmyk' | 'srgb'
export type IccProfileName =
  | 'JapanColor2001Coated'   // 台灣 / 日 / 亞洲
  | 'USWebCoatedSWOP'        // 美國
  | 'CoatedFOGRA39'          // 歐洲
export type PrintFileFormat = 'pdf' | 'png'

export type PrintDestination = {
  id: 'tw-local' | 'mpc' | 'tgc' | 'printninja'
  label: string              // UI 顯示，例：「🇹🇼 本地印刷廠」
  trimMm: [number, number]   // 成品尺寸 [w,h]，例 [70,120] / [70,121]
  bleedMm: number            // 每邊出血，3 或 3.175
  safeMm: number             // 安全框，3 或 5
  dpi: 300
  colorSpace: ColorSpaceTarget
  iccProfile?: IccProfileName // 僅 colorSpace='cmyk' 且情境 A 時
  format: PrintFileFormat
  needsOutputIntent: boolean // cmyk+ICC → true → 走 Ghostscript pass
}
```

### 已查證目的地清單（DESTINATIONS SSOT）

```ts
export const PRINT_DESTINATIONS: Record<string, PrintDestination> = {
  'tw-local': {
    id: 'tw-local', label: '🇹🇼 本地印刷廠',
    trimMm: [70, 120], bleedMm: 3, safeMm: 3, dpi: 300,
    colorSpace: 'cmyk', iccProfile: 'JapanColor2001Coated',
    format: 'pdf', needsOutputIntent: true,
  },
  'mpc': {
    id: 'mpc', label: 'MakePlayingCards (US)',
    trimMm: [70, 121], bleedMm: 3.175, safeMm: 3, dpi: 300,
    colorSpace: 'cmyk', iccProfile: 'USWebCoatedSWOP',  // MPC 收 RGB 或 CMYK；要送 CMYK 則需此 profile
    format: 'pdf', needsOutputIntent: true,
  },
  'tgc': {
    id: 'tgc', label: 'The Game Crafter (US)',
    trimMm: [70, 121], bleedMm: 3, safeMm: 3, dpi: 300,
    colorSpace: 'srgb',           // ⚠️ TGC 只收 RGB，CMYK 退件
    format: 'png', needsOutputIntent: false,
  },
  'printninja': {
    id: 'printninja', label: 'PrintNinja offset (大量)',
    trimMm: [70, 121], bleedMm: 3, safeMm: 5, dpi: 300,
    colorSpace: 'cmyk', iccProfile: 'USWebCoatedSWOP',
    format: 'pdf', needsOutputIntent: true,  // 多頁 PDF（整副牌），本 MVP 先做單張
  },
}
```

> **各服務真實規格佐證**（web-researcher，2026-06-12）：
> - MPC tarot 70×121mm，bleed 1/8"(3.175mm)，min 897×1497px，收 RGB/CMYK，JPG/PNG/PDF/TIFF — [來源](https://www.makeplayingcards.com/design/custom-front-animated-tarot-size-playing-cards.html)
> - TGC tarot 70×121mm，bleed 3mm，**RGB only（CMYK 退件）**，PNG — [來源](https://help.thegamecrafter.com/article/399-how-to-make-a-card-game-tarot-deck)
> - PrintNinja tarot 70×121mm，bleed 3mm，safe 5mm，**CMYK 多頁 PDF** — [來源](https://printninja.com/printing-resource-center/printing-options/custom-game-printing/card-dimensions/tarot-style-playing-cards/)
> - 國際 de-facto 標準 = 2.75×4.75"(70×121mm)，四家一致。

### 積木組裝矩陣（pipeline 依欄位分支）

```txt
resize 到 (trim+bleed) px
  ↓
colorSpace 積木：
  'cmyk' → Sharp .toColorspace('cmyk') .jpeg(q100)
  'srgb' → 保留 sRGB（不轉）
  ↓
format 積木：
  'pdf'  → pdf-lib embedJpg/embedPng + setMediaBox(bleed) + setTrimBox(trim) + setBleedBox(bleed)
  'png'  → Sharp .png() 直出（TGC 路徑）
  ↓
needsOutputIntent 積木：
  true   → Ghostscript pass：套 ICP profile → PDF/X-1a（情境 A 必須）
  false  → 直接輸出（RGB POD 服務 / 情境 B）
```

每個工具掛載的目的地清單也是積木：Tarot 掛 `['tw-local','mpc','tgc','printninja']`；POD Studio 另定。

---

## 10.1 尺寸換算 helper（trim + bleed）

```ts
const MM_PER_INCH = 25.4

function mmToPx(mm: number, dpi: number): number {
  return Math.round((mm / MM_PER_INCH) * dpi)
}
function mmToPt(mm: number): number {
  return (mm / MM_PER_INCH) * 72
}

/** 回傳 artwork(含出血) 與 trim 的 px / pt 幾何 */
function getPrintGeometry(d: PrintDestination) {
  const [tw, th] = d.trimMm
  const bleedW = tw + d.bleedMm * 2
  const bleedH = th + d.bleedMm * 2
  return {
    // 含出血 = MediaBox / BleedBox
    bleedPx: [mmToPx(bleedW, d.dpi), mmToPx(bleedH, d.dpi)] as [number, number],
    bleedPt: [mmToPt(bleedW), mmToPt(bleedH)] as [number, number],
    // 成品 = TrimBox
    trimPt: [mmToPt(tw), mmToPt(th)] as [number, number],
    // TrimBox 在 MediaBox 內的偏移 = bleed
    bleedOffsetPt: mmToPt(d.bleedMm),
  }
}
```

> 例（tw-local 70×120mm + 3mm bleed）：bleedPx ≈ [898, 1512]、bleedPt ≈ [215.4, 357.2]、trimPt ≈ [198.4, 340.2]、offset 8.5pt。
> 註：現有 `FLUX_PRINT_DIMS["2:3"]=[896,1488]` 對應舊 76×126mm；新積木以 mm 為 SSOT 重算，生圖輸出 resize 到 destination 的 bleedPx（差 ~1% 可忽略，fit:cover）。

---

## 10.2 toPrintFile()（積木組裝主函式）

```ts
import sharp from 'sharp'
import { PDFDocument } from 'pdf-lib'
import type { ColorGradeParams } from './color-grade'
import { applyOutputIntent } from './ghostscript-pdfx' // 見 10.3

export async function toPrintFile(
  input: Buffer,
  dest: PrintDestination,
  colorGrade?: ColorGradeParams
): Promise<{ buffer: Buffer; mime: string }> {
  const g = getPrintGeometry(dest)

  let img = sharp(input, { limitInputPixels: 50_000_000 })
    .resize(g.bleedPx[0], g.bleedPx[1], { fit: 'cover' })
  if (colorGrade) img = img.modulate(colorGrade)

  // ── colorSpace 積木 ──
  // ⚠️ density 處理（兩個 POC 實證 2026-06-12，d:\tmp\cmyk-poc\poc2.mjs）：
  //   ① .withMetadata({density}) 附 sRGB ICC → CMYK 轉回 3ch sRGB（SOF=3）= 壞掉，禁用。
  //   ② .withDensity() 乾淨但需 sharp ≥0.35；本 app sharp=0.34.3（Next transitive）無此 method。
  //   ③ → CMYK 一律「不設 density」（poc2 變體 B：無 withMetadata → SOF=4 CMYK ✓）。
  //   density 非載重：實體尺寸由 PDF MediaBox/TrimBox(points) 決定，effective DPI = px ÷ 實體尺寸。
  let imgBuf: Buffer
  if (dest.colorSpace === 'cmyk') {
    imgBuf = await img.toColorspace('cmyk').jpeg({ quality: 100 }).toBuffer()  // 不設 density
  } else {
    imgBuf = await img.png().toBuffer()
  }

  // ── format 積木 ──
  if (dest.format === 'png') {
    return { buffer: imgBuf, mime: 'image/png' } // TGC sRGB PNG 直出
  }

  const pdf = await PDFDocument.create()
  const embedded = dest.colorSpace === 'cmyk'
    ? await pdf.embedJpg(imgBuf)
    : await pdf.embedPng(imgBuf)
  const page = pdf.addPage(g.bleedPt)
  page.drawImage(embedded, { x: 0, y: 0, width: g.bleedPt[0], height: g.bleedPt[1] })
  page.setMediaBox(0, 0, g.bleedPt[0], g.bleedPt[1])
  page.setBleedBox(0, 0, g.bleedPt[0], g.bleedPt[1])
  page.setTrimBox(g.bleedOffsetPt, g.bleedOffsetPt, g.trimPt[0], g.trimPt[1])
  let pdfBuf = Buffer.from(await pdf.save())

  // ── needsOutputIntent 積木 ──
  if (dest.needsOutputIntent && dest.iccProfile) {
    pdfBuf = await applyOutputIntent(pdfBuf, dest.iccProfile) // Ghostscript
  }
  return { buffer: pdfBuf, mime: 'application/pdf' }
}
```

> **效能備註**：`modulate()` 已移到 `resize()` 之後（省全解析度運算）。

---

## 10.3 Ghostscript OutputIntent（情境 A 必須）

pdf-lib 無法加 ICC OutputIntent（PR #1512 closed）。用 Ghostscript 後處理：

```ts
// lib/studio/ghostscript-pdfx.ts
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const execFileP = promisify(execFile)

const ICC_PATHS: Record<IccProfileName, string> = {
  JapanColor2001Coated: '/usr/share/color/icc/JapanColor2001Coated.icc',
  USWebCoatedSWOP:       '/usr/share/color/icc/USWebCoatedSWOP.icc',
  CoatedFOGRA39:         '/usr/share/color/icc/CoatedFOGRA39.icc',
}

export async function applyOutputIntent(pdf: Buffer, icc: IccProfileName): Promise<Buffer> {
  // 寫暫存 → gs → 讀回（暫存路徑用 os.tmpdir()，非 repo）
  // gs -dPDFX -dBATCH -dNOPAUSE -dPDFXCompatibilityPolicy=1
  //    -sColorConversionStrategy=CMYK -sDEVICE=pdfwrite
  //    -sOutputICCProfile=<ICC_PATHS[icc]> -sOutputFile=out.pdf in.pdf
  // 實作見 Phase 0 [0-a-gs] POC
  ...
}
```

> ⚠️ **部署影響（基建，已查證 base image）**：next-admin Dockerfile base = **`node:20-alpine`**（不是 Debian）。裝 gs 用 **`apk add --no-cache ghostscript`**（**不是 apt-get**）。Alpine **無 `icc-profiles-free` 套件** → 三個 ICC 檔（Japan Color 2001 / US SWOP / FOGRA39）全部手動 COPY 進 image 或啟動時從 R2 拉。Adobe profile（Japan Color / SWOP）需確認授權。**deploy 前必處理，列入 [0-a-gs] gate。**

> **Sharp 版本備註**：app sharp=**0.34.3**（Next transitive，須 pin）。`withMetadata({density})` 破壞 CMYK（禁）；`withDensity()` 需 ≥0.35（app 無）→ **CMYK/web 不設 density**。若日後 pin 到 ≥0.35 且需印實體 density，可改 `withDensity()`，但 PDF 幾何已是實體尺寸載重，density 屬冗餘。

---

## 10.4 重要警告

此 pipeline 只有 Phase 0 POC 全通過才能進 Phase 1。必須驗證：

```txt
① CMYK 路徑：Sharp CMYK JPEG → pdf-lib embedJpg → /DeviceCMYK（未轉回 RGB）+ /Decode 未雙重反相
② TrimBox：qpdf 驗 MediaBox/TrimBox/BleedBox 三框正確
③ OutputIntent：Ghostscript 後 PDF/X-1a 帶 ICC，印刷廠 preflight 過
④ sRGB 路徑（TGC）：PNG sRGB，無 CMYK 污染
```

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
| Sharp | `node_modules/sharp@0.34.3`（**Next.js transitive，非直接 dep**）| resize / CMYK / WebP / color grade；**須 pin 為直接依賴**（見 §18.1）|
| `putDesignObject()` | `lib/storage/r2.ts` | 存圖到 Cloudflare R2 |
| `/tools/designs` | `app/tools/designs/DesignsGallery.tsx` | 設計存檔展示頁 |
| Fabric.js 原型 | `d:\tmp\tshirt-designer-prototype.html` | Canvas editor 起點 |
| `upscaler.ts` | `lib/studio/upscaler.ts` | POD t-shirt 用，本 feature 不碰 |

---

# 14. Phase 0：技術 POC / 風險消除

Phase 0 是阻塞階段。未通過不得進 Phase 1 主線。

---

## 14.1 [0-a] CMYK PDF + TrimBox POC — ✅ 本機 PASS（2026-06-12）

> **本機已驗證**（win32 node 24, sharp 0.35.1/libvips 8.18.3, pdf-lib 1.17.1；證據 `d:\tmp\cmyk-poc\poc3.mjs`）：
> - SOF components=4, sharp.space=cmyk, channels=4, density=300 ✓
> - `/DeviceCMYK true` / `/DeviceRGB false` ✓
> - `/Decode [1 0 1 0 1 0 1 0]`（pdf-lib 自動加，已實證）✓
> - `/MediaBox [0 0 215.43 357.17]`(76×126mm) / `/TrimBox [8.5 8.5 206.93 348.66]`(offset 3mm+70×120mm) / `/BleedBox`=MediaBox ✓
> - **關鍵修正**：CMYK **不設 density**（`.withMetadata({density})` 附 sRGB ICC 破壞 CMYK；`.withDensity()` 需 sharp≥0.35，app=0.34.3 無）。POC 在 0.35.1 用 withDensity 驗過，但 app 走「省略 density」路徑（poc2 變體 B 證 SOF=4）。
> - libvips 寫 APP14 Adobe marker(transform=0) → pdf-lib `/Decode` 應正確（非雙重反相）。
>
> **仍待**（本機做不到，需 [0-a-gs] Alpine/Docker + 人類）：① gs 實際 render 確認非反相 ② Alpine musl sharp CMYK 行為 ③ Acrobat preflight。

目標：

```txt
驗證 Sharp CMYK JPEG + pdf-lib embedJpg → /DeviceCMYK PDF，且 MediaBox/TrimBox/BleedBox 三框正確。
```

測試指令：

```bash
pdfimages -list output.pdf
exiftool output.pdf
qpdf --qdf --object-streams=disable output.pdf inspect.pdf
grep -n "DeviceCMYK\|DeviceRGB\|ColorSpace\|Decode\|MediaBox\|TrimBox\|BleedBox" inspect.pdf
```

驗收條件：

```txt
☐ MediaBox = 含出血尺寸 (例 tw-local 76×126mm → 215.4×357.2pt)
☐ TrimBox  = 成品尺寸 (70×120mm → 198.4×340.2pt)，offset 8.5pt(=3mm)
☐ BleedBox = MediaBox
☐ image object /ColorSpace = /DeviceCMYK
☐ pdfimages -list 顯示 CMYK / 4-channel
☐ 未被轉回 /DeviceRGB
☐ /Decode [1 0 1 0 1 0 1 0] 存在（pdf-lib 自動加，已確認 source code）
☐ Adobe Acrobat preflight 顯示 CMYK，膚色/暗部無 inversion、無過暗
```

> **已查證（web-researcher 2026-06-12）**：
> - pdf-lib `setTrimBox()/setBleedBox()` 公開 API 存在 → TrimBox 可解。
> - `embedJpg()` 對 4-channel JPEG **無條件** 加 `/Decode [1 0 1 0 1 0 1 0]`（[source](https://github.com/Hopding/pdf-lib/blob/master/src/core/embedders/JpegEmbedder.ts)）→ Photoshop/Sharp CMYK JPEG 反相自動修正。
> - **但** pdf-lib **無 OutputIntent**（PR #1512 closed）→ 情境 A 的 ICP profile 必須走 [0-a-gs] Ghostscript，見下。

已知失敗模式與對策：

```txt
反相（negative）：embedJpg 已自動加 /Decode，但若 Sharp CMYK JPEG transform=0（非 YCCK）
  可能被雙重反相。POC 必須目視抽出圖確認沒反白。若雙重反相 → 改 Ghostscript pipeline。
```

---

## 14.1-gs [0-a-gs] Ghostscript ICC OutputIntent（情境 A 必須）

> **架構決策（2026-06-12，R0）**：gs `-dPDFX` OutputIntent 是 20 年成熟功能、web-researcher 已給確切指令 = **文件化 ground-truth，非真未知**。**不本機 re-prove**（本機裝 gs 無法驗下列任一真未知，徒增系統改動）。此項拆兩段：
>
> **[0-a-gs] 機制 = ✓ 文件化**（pdf-lib 無 OutputIntent→PR#1512 closed；gs 指令見下）。**不需本機 POC。**
>
> **真正待驗的未知（綁定在部署期，需 Docker/Alpine 或外部方）**：
> 1. `apk add ghostscript` 在 node:20-alpine 裝得起 + gs 含 PDF/X 支援？（→ Dockerfile 改動時驗）
> 2. sharp-on-musl 的 CMYK 行為與 win32 一致？（→ 同上，容器內重跑 [0-a] poc3.mjs）
> 3. ICC 採購：Adobe Japan Color 2001 / SWOP 授權檔（→ 外部，使用者；FOGRA39 有免費等效）
> 4. Dockerfile standalone COPY sharp 原生 binary 成功？（→ Dockerfile 改動時驗）
> 5. 真印刷廠 preflight 過？（→ 外部，人類在環）
>
> → 結論：[0-a-gs] **不阻塞 Phase 1 純程式碼**（toPrintFile 積木可先寫，gs pass 用 `applyOutputIntent()` 介面隔離）；只阻塞「情境 A 印刷檔正式輸出」。降級路徑見 §14.2。

目標（部署期驗證）：

```txt
在 node:20-alpine 容器內驗證 gs 把 pdf-lib CMYK PDF 加 ICC OutputIntent → PDF/X-1a。
```

指令（Japan Color 2001 Coated 範例）：

```bash
gs -dPDFX -dBATCH -dNOPAUSE -dPDFXCompatibilityPolicy=1 \
   -sColorConversionStrategy=CMYK -sDEVICE=pdfwrite \
   -sOutputICCProfile=/usr/share/color/icc/JapanColor2001Coated.icc \
   -sOutputFile=out_pdfx.pdf in.pdf
qpdf --qdf out_pdfx.pdf chk.pdf
grep -n "OutputIntent\|GTS_PDFX\|DestOutputProfile" chk.pdf
```

驗收條件：

```txt
☐ Docker image 裝得起 ghostscript（Alpine：`apk add --no-cache ghostscript`）
☐ ICC profile 檔存在於 image（Japan Color 2001 / SWOP / FOGRA39）
☐ 輸出 PDF 含 /OutputIntent + /GTS_PDFX + 嵌入 /DestOutputProfile
☐ TrimBox 經 gs 後仍保留
☐ 印刷廠 preflight 過（人類在環，見 §D）
☐ 三個 profile 各跑一次（tw=Japan / us=SWOP / eu=FOGRA39）
```

> ⚠️ 部署門檻：Dockerfile 改動（裝 gs + profiles）必須在此 POC 一起驗，否則 Phase 1 寫好也 deploy 不了。

---

## 14.1-srgb [0-a-srgb] sRGB PNG POC（TGC 路徑）— ✅ 本機 PASS（2026-06-12）

> **本機已驗證**（sharp 0.35.1）：898×1500px, space=srgb, channels=3, density=300, format=png。無 CMYK 污染。

```txt
☑ TGC 目的地 colorSpace='srgb' format='png' → Sharp 直出 sRGB PNG（不設 density；禁 withMetadata）
☑ 無 CMYK 污染（sharp metadata: srgb / 3-channel）
☑ 70×121mm + 3mm bleed = 76×127mm @ 300 = 898×1500px 尺寸正確
☐ TrimBox 不適用（PNG 無 box；safe zone 由設計時保留）— 設計階段守 5mm 安全框
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

**本案已定 = 情境 A（直送印刷廠）。** profile：台灣 Japan Color 2001 Coated / 美國 US Web Coated SWOP / 歐洲 FOGRA39（依目的地 destination.iccProfile）。

```txt
情境 A（已採用）：印刷用 PDF 直送印刷廠
  ☑ profile 已定（見 §10.0 PRINT_DESTINATIONS）
  ☑ pdf-lib 無 OutputIntent → 走 [0-a-gs] Ghostscript 套 profile（已查證決定）
  ☐ POC 必須拿「真的有 OutputIntent 的 PDF/X」過印刷廠 preflight，不能只看 Acrobat 顯示 CMYK
  ☐ naive CMYK（無 OutputIntent）視為「不通過」

例外：TGC 目的地不適用（colorSpace='srgb'，走 [0-a-srgb]）。
```

---

## 14.2 [0-a-gate] CMYK PDF decision gate（已定情境 A）

```txt
前置已定：情境 A 直送印刷廠。架構 = pdf-lib(embed+TrimBox) + Ghostscript(OutputIntent)。

通過條件（更新 2026-06-12）：
  ① [0-a]    ✅ 本機 PASS — /DeviceCMYK + /Decode + TrimBox 三框（CMYK 不設 density）
  ② [0-a-srgb] ✅ 本機 PASS — TGC sRGB PNG 乾淨
  ③ [0-c]    ✅ 本機 PASS — SSRF guard 12/12 + DNS-rebinding
  ④ [0-a-gs] ⏳ 機制文件化 ✓；Alpine apk+musl sharp+Dockerfile COPY+ICC+印刷廠 preflight = 部署期/外部（不阻塞 Phase 1 code）
  ⑤ [0-b]    ⏳ dynamic import 文件化 ✓；R2 CORS taint 併入 [1-i] integration test
  → Phase 1 純程式碼可開始（gs/CORS 用介面隔離，各自閘在 deploy/[1-i]）

若 [0-a] 雙重反相無法修：
  改全 Ghostscript pipeline（Sharp RGB → gs 一次轉 CMYK+OutputIntent）。

若 Docker 裝不起 gs / profile 取不到授權：
  情境 A 暫時 degrade 為情境 B（naive CMYK + UI 警示「送印前確認色彩」），
  Ghostscript 另開 infra task；不阻塞 WebP/Canvas/sRGB-POD 三軌上線。
```

禁止狀態：

```txt
「再研究一下」但繼續做 Phase 1。
```

---

## 14.3 [0-b] Fabric.js + Next.js App Router POC — 併入 [1-i]（R0 決策 2026-06-12）

> **架構決策**：`dynamic(()=>import('fabric'),{ssr:false})` 是文件化 Next.js App Router pattern（非真未知，不另做 throwaway POC）。唯一真未知 = **R2 CORS → canvas taint**，需「實 R2 image + browser 跑 toBlob」= integration test，本機 throwaway 驗不了。→ **併入 [1-i] CanvasEditor**，用真 R2 + Playwright 驗 taint。鎖 fabric 版本（v6）在 [1-i] 安裝時。下列為 [1-i] 驗收清單：

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

## 14.4 [0-c] image process API security POC — ✅ 核心邏輯本機 PASS（2026-06-12）

> **本機已驗證**（`d:\tmp\cmyk-poc\ssrf-poc.mjs`，純 node built-in，12/12 + rebinding）：
> `assertSafeImageUrl()` guard — protocol→allowlist→DNS-resolve→IP 分類 四階段。
> 重點：**DNS-rebinding 防禦已實證**（allowlisted host `cdn.aware-wave.com` 解析到 `10.1.2.3` 被 DNS 階段擋，非 allowlist）。
> IP 分類涵蓋 IPv4（10/172.16/192.168/127/169.254/0/100.64 CGN/TEST-NET/reserved）+ IPv6（::1/fc/fd/fe80/::ffff: mapped）。
> userinfo trick（`https://app.aware-wave.com@evil.com`）+ suffix trick（`app.aware-wave.com.evil.com`）皆擋。

```txt
☑ allowlist host 生效（Set.has，非 endsWith — 防 suffix trick）
☑ localhost / 127.0.0.1 / ::1 被擋
☑ private IP 被擋（v4+v6 完整範圍）
☑ 169.254.169.254（cloud metadata）被擋
☑ DNS rebinding（allowlisted→私有 IP）被擋 ← 核心防禦
☑ 非法 protocol（ftp/userinfo trick）被擋
☐ redirect 到非 allowlist domain 被擋（real impl: redirect:'manual' 逐 hop 重驗）— 待 [1-e] 接 fetch
☐ 非 image content-type 被擋（HEAD/response header）— 待 [1-e]
☐ 超過 max content-length 被擋 / fetch timeout / Sharp limitInputPixels — 待 [1-e]（標準）
☐ 未授權 imageUrl 被擋（沿用既有 auth/ownership pattern，見 §B）— 待 [1-e]
```

> **[1-e] 落地注意**：real impl 必須 `dns.promises.lookup(host,{all:true})` 解所有 A/AAAA + 對解析到的 IP fetch（帶 Host header）或 `redirect:'manual'` 逐 hop 重驗，杜絕 TOCTOU/redirect SSRF。POC 已證分類+rebinding 邏輯正確。

---

# 15. Phase 1：MVP 主線

Phase 1 只能在 Phase 0 通過後開始。

---

## 15.1 後端核心

### [1-a] `lib/studio/image-provider.ts` — ✅ 已滿足，零工作量（VBC 2026-06-12）

> **讀 code 推翻聲稱**：原稱「facade 沒 expose printQuality，需補上」= **錯**。
> - `printQuality?: boolean` 在 `TarotGenParams`（`image-gen.ts:266`）
> - `StudioGenParams = TarotGenParams`（`image-provider.ts:22`，純 type alias 無 Omit/Pick）
> - `generateImage(params)` → `generateTarotImage(params)` 整包透傳（`image-provider.ts:30-32`）
> → printQuality **已完整透過 facade 透傳**，無需改動。Studio caller 直接 `{...params, printQuality:true}` 即生效。
> 「Studio 是否實際送 printQuality」屬 [1-d]/[1-j/k] 接線，非 facade 問題。

---

### [1-b] `lib/studio/color-grade.ts` — ✅ 已實作（2026-06-12）

> **已交付**（REALTEST vitest 10/10 + tsc 0 + critic 修 Critical/High/Med）。實際 export 比原 spec 豐富：

```ts
// 兩種 shape：ColorGradeState(UI, percent) ↔ ColorGradeParams(API, multiplier)
export type ColorGradeState = { hue: number; sat: number; bri: number }   // sat/bri PERCENT
export type ColorGradeParams = { hue: number; saturation: number; brightness: number } // MULTIPLIER
export const GRADE_LIMITS    // SSOT 滑桿邊界 hue -30..30 / sat,bri 50..200 / neutral 0/100/100
export const NEUTRAL_STATE
export function clampState(s): ColorGradeState     // 非有限/非數字 → neutral（runtime 防禦）
export function clampParams(p): ColorGradeParams
export function stateToParams(s): ColorGradeParams // percent→multiplier（先 clamp）
export function isNeutralState(s) / isNeutralParams(p)
export function toSharpModulate(p): {...} | undefined  // neutral 時回 undefined（pipeline 跳過 op）
export function toCssFilter(s): string             // 預覽 hue-rotate/saturate/brightness
```

> **架構決策**：此檔**純函式無 React**（server 的 [1-c]/[1-d] 要 import）。`useColorGrade()` hook **不在此**，移 component 層（[1-f] ColorGradePanel），避免 React 進 server bundle。
> **安全（critic Critical）**：TS 型別執行期抹除 → `clamp` 用 `typeof+Number.isFinite` 守，wire payload 的 undefined/null/string/缺欄位/±Infinity **一律 → neutral**，杜絕 NaN 進 `sharp.modulate()`。[1-e] API 邊界另做 schema 驗證（defense-in-depth）。

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

## 18.1 npm 套件

```bash
npm install pdf-lib   # embed + TrimBox/BleedBox（MIT）
npm install fabric    # Canvas editor（MIT）
npm install sharp     # ⚠️ 見下方說明：現為 Next.js transitive，必須 pin 為直接依賴
```

> ⚠️ **sharp 真實狀態（已查證 package.json，2026-06-12）**：sharp **不在** next-admin `dependencies`，是 **Next.js 的 transitive dep**（`node_modules/sharp@0.34.3` 存在）。plan 原稱「已安裝不需新增」**錯誤**。風險：Next 改 optional dep → sharp 消失。**處置**：① `npm install sharp` pin 為直接依賴（鎖版本）② standalone build tracer 常漏原生模組（Dockerfile 已手動 COPY `@anthropic-ai`/`ssh2`）→ sharp 原生 binary 八成也要顯式 `COPY node_modules/sharp`，[0-a-gs] Docker build 一起驗。

條件：

```txt
pdf-lib：Phase 0 [0-a] 通過後正式採用（[0-a] 本機已 PASS）。
fabric ：Phase 0 [0-b] App Router POC 通過後鎖版本。
sharp  ：pin 直接依賴；Alpine musl prebuilt CMYK 行為待 [0-a-gs] 容器驗。
```

## 18.2 系統二進位 + ICC（情境 A 阻塞）

> pdf-lib 無 OutputIntent（PR #1512 closed），情境 A 必須 Ghostscript。**基建改動，非 npm。base = node:20-alpine。**

```dockerfile
# next-admin Dockerfile 新增（Alpine — apk 不是 apt-get）
RUN apk add --no-cache ghostscript
# ⚠️ Alpine 無 icc-profiles-free 套件 → 三個 ICC 全手動：
COPY icc/JapanColor2001Coated.icc icc/USWebCoatedSWOP.icc icc/CoatedFOGRA39.icc /usr/share/color/icc/
# Japan Color / SWOP = Adobe ICC，需確認授權；FOGRA39 有免費等效（Coated FOGRA39 / openicc）
# sharp 原生模組（standalone tracer 可能漏）：
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/sharp ./node_modules/sharp
```

條件：

```txt
ghostscript：[0-a-gs] POC 通過 + Docker build 驗證後採用。
ICC profiles：確認授權（Adobe Japan Color/SWOP）或改用免費等效 profile。
```

> ⚠️ 此 Dockerfile 改動屬基建，deploy 走 `sg-deploy.sh`，需 healthcheck + smoke。改 Dockerfile → 召喚 devops 流程（safe-infra-patch 規則）。

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
| CMYK PDF | 阻塞風險 | Phase 0 [0-a]，驗 `/DeviceCMYK` + TrimBox + preflight |
| **pdf-lib 無 OutputIntent** | **阻塞風險（已查證）** | **PR #1512 closed → 情境 A 必須 Ghostscript 後處理 [0-a-gs]** |
| **Ghostscript Docker 部署** | **阻塞風險（基建）** | **Dockerfile 裝 gs+ICC；[0-a-gs] gate 一起驗** |
| CMYK 色彩正確性 (ICC) | 阻塞風險 (情境 A) | 已定情境 A；profile 依目的地，Ghostscript 套 |
| CMYK JPEG 反相 | 已解（已查證） | embedJpg 自動加 `/Decode`；POC 驗無雙重反相 |
| TrimBox/BleedBox | 必做 | pdf-lib `setTrimBox/setBleedBox`（已確認支援）|
| 國際 POD 多色彩空間 | 必做 | TGC=sRGB PNG，不可寫死 CMYK；積木 colorSpace 欄位 |
| **Sharp withMetadata 破壞 CMYK** | **已實證並修正** | **`.withMetadata({density})` 附 sRGB ICC → CMYK 轉回 RGB；app=0.34.3 無 withDensity → CMYK/web 一律不設 density（[0-a]/[1-c] 實證）** |
| Sharp 非直接依賴 | 必做 | transitive via Next.js；pin 直接 dep + Dockerfile COPY sharp |
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
Phase 0（阻塞，全綠才進 Phase 1）:
  0-a      CMYK PDF + TrimBox POC（pdf-lib）
  0-a-gs   Ghostscript ICC OutputIntent POC + Docker build（情境 A 必須）
  0-a-srgb sRGB PNG POC（TGC 路徑）
  0-b      Fabric.js App Router POC
  0-c      API security POC

Phase 1:
  1-a image-provider printQuality
  1-b color-grade types + hook
  1-c toProductImage（preset-driven：web-tarot 667×1000 / web-square 1000×1000）
  1-d toPrintFile（積木：PrintDestination 矩陣，pdf-lib + Ghostscript）
  1-e image process API（discriminated union + SSRF + rate limit）
  1-f ColorGradePanel
  1-g OutputTrackBar（含印刷目的地下拉：tw-local/mpc/tgc/printninja）
  1-h canvas page
  1-i CanvasEditor（三資產存 R2）
  1-j TarotStudio 接線
  1-k StudioWorkbench 接線
  1-l REALTEST

Phase 1.5:
  Canva POC（5-a~d）

Phase 2:
  customer-facing Canvas + WooCommerce + Printful
  整副牌多頁 PDF（PrintNinja offset）
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
