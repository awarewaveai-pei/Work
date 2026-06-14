# Design Editor 可組裝工具包 — Master Plan (SSOT)

> 願景：每個編輯能力 = 一塊「積木 (tool block)」。不同 host（Tarot / POD Studio / Canvas / 未來客人商品頁）
> 各自宣告要掛哪幾塊，靈活組裝。有些地方只要積木 A、有些只要 B、有的全要。
>
> 狀態日：2026-06-14。本檔是工具包的單一真相源 (SSOT)，新增/移除積木都先更新這裡。

---

## 1. 架構：積木契約 + 註冊表

兩類積木，依「在哪裡渲染」分：

### 1a. Color-grade 積木（影像調整，已成形）
SSOT = `lib/studio/color-grade.ts`。每塊中性可跳過，三個 applier 對應三種渲染目標：
- `toCssFilter` → CSS 預覽（舊，gamma/sharpen/balance 無法表現）
- `applyColorGrade` → Sharp server bake（真實，CMYK/PDF）
- `buildFabricImageFilters`（`app/tools/canvas/fabric-filters.ts`）→ Fabric 即時（WYSIWYG）

任何 host `import` 即得全部影像積木；`ColorGradePanel` 是共用 UI。

### 1b. Canvas 工具積木（編輯器操作）
目標契約（漸進導入；現階段以 CanvasEditor 內聚實作，未來抽 registry）：
```ts
type CanvasTool = {
  id: string;                 // 'lock' | 'shape' | 'removeColor' | ...
  label: string; icon?: string;
  group: 'edit'|'image'|'shape'|'text'|'filter'|'ai';
  available?: (ctx) => boolean;   // 例：需選取圖片才可用
  render: (ctx) => ReactNode;     // 工具列控制項 / 面板
};
// host 宣告 enabledToolIds?: string[]；toolbar 只渲染命中的積木。
```

---

## 2. 積木目錄（catalog）

| 積木 | 群組 | 渲染 | 狀態 | 備註 |
|---|---|---|---|---|
| 色相/亮度/飽和 | color | CSS+Sharp+Fabric | ✅ LIVE | modulate |
| 色階 Levels（黑白點） | color | 同上 | ✅ LIVE | linear |
| Gamma 中間調 | color | Sharp+Fabric | ✅ LIVE | |
| 銳利度 Sharpen | color | Sharp+Fabric | ✅ LIVE | |
| Adobe 色彩平衡（3 軸） | color | Sharp+Fabric | ✅ LIVE | per-channel offset |
| 文字（字型中/英·顏色·字級） | text | Fabric | ✅ LIVE | |
| 上傳圖案 | image | Fabric | ✅ LIVE | |
| WYSIWYG 真實預覽 | infra | Fabric | ✅ LIVE | GradedPreview |
| 🔒 物件鎖定（防誤移底圖） | edit | Fabric | ✅ LIVE | lockMovement/Scaling/Rotation |
| 🔷 形狀（方框/圓/線） | shape | Fabric | ✅ LIVE | Rect/Circle/Line |
| RemoveColor 免費去背（色鍵） | image | Fabric filter | ⏳ | 與 color-grade filter 需合併處理 |
| 一鍵濾鏡預設（Sepia/Vintage/拍立得…） | filter | Fabric filter | ⏳ | 同上 filter 合併 |
| 逐字彩色文字（per-char styles） | text | Fabric | ⏳ | Textbox styles |
| 透明度/傾斜/翻轉/虛線邊框 | edit | Fabric | ⏳ | 物件屬性 |
| 圖層上下移 / 群組 | edit | Fabric | ⏳ | bringForward/group |
| Undo/Redo（toJSON 快照） | infra | Fabric | ⏳ | 狀態歷史 |
| 形狀遮罩 clipPath（裁圓/心形） | image | Fabric | ⏳ | |
| 文字沿路徑（弧形/圓形字） | text | Fabric | ⏳ | |
| 自由繪筆（鉛筆/噴霧） | draw | Fabric | ⏳ | PencilBrush 等 |
| 可再編輯存檔 design.json | infra | Fabric+後端 | ⏳ | 需存 JSON + 載回流程 |
| **AI 去除不要的部分（inpainting）** | ai | Replicate | ⏳⭐ | 使用者最初需求；框選→AI 填補 |
| AI 擴圖 outpainting | ai | Replicate | ⏳ | |
| AI 換背景 / generative fill | ai | Replicate | ⏳ | |
| AI 風格轉換 | ai | Replicate | ⏳ | |
| Web-font 載入（Google/上傳字型） | text | 前端 | ⏳⭐ | 解決中文字型不一致 |
| QR code / 條碼 | util | 前端庫 | ⏳ | |
| clipart / 貼圖庫 | util | 素材 | ⏳ | |
| 設計模板庫 | util | 素材 | ⏳ | |
| 多面設計（衣服正反面） | util | 多畫布 | ⏳ | |
| DPI/出血/安全框驗證 | print | 前端 | ⏳ | |
| 3D 商品預覽 | preview | Three.js | ⏳ | 與 Fabric 並存 |
| 即時價格計算 | preview | 前端 | ⏳ | |
| 對齊吸附線 | edit | Fabric | ⏳ | |

已有但非積木：AI 放大 `upscaler.ts`、AI 去背 `bg-remover.ts`、Printful mockup（做中）。

---

## 3. Host 掛載矩陣（哪個工具掛哪些積木）

| 積木群組 | Tarot 預覽 | POD Studio | Canvas 編輯器 | 客人商品頁（未來）|
|---|---|---|---|---|
| color-grade（6 塊） | ✅ | ✅ | ✅(選圖時) | 部分 |
| 文字 | — | — | ✅ | ✅ |
| 上傳圖 | — | — | ✅ | ✅ |
| 鎖定/形狀/圖層 | — | — | ✅ | ✅(底圖鎖定) |
| RemoveColor/濾鏡預設 | — | ✅(規劃) | ✅ | ✅ |
| AI inpainting/擴圖 | ✅ | ✅ | ✅ | 部分 |
| 三軌輸出（web/print/canvas） | ✅ | ✅ | — | — |
| 可再編輯存檔 | — | — | ✅ | ✅ |
| 3D/價格 | — | — | — | ✅ |

> 「靈活運用」= 同一塊積木的程式只寫一次（SSOT），host 用 `enabledToolIds` / import 選用。

---

## 4. 建置批次（由乾淨低風險 → 需後端/外部）

- **批次 0（已交付）**：6 色彩積木 + 文字 + WYSIWYG 預覽 + 🔒鎖定 + 🔷形狀。
- **批次 1（filter 合併）**：RemoveColor 免費去背 + 一鍵濾鏡預設 → 需先把「色彩 filter + 預設 filter」在同一 image 上合併（目前 buildFabricImageFilters 會覆寫）。
- **批次 2（物件屬性）**：透明度/傾斜/翻轉/虛線邊框 + 圖層上下移/群組 + 逐字彩色文字。
- **批次 3（AI）⭐**：去除不要的部分 inpainting（使用者原始需求）+ 擴圖 + 換背景。走 Replicate（同 bg-remover 模式）。
- **批次 4（字型/素材）**：Web-font 載入⭐ + clipart/模板庫 + QR code。
- **批次 5（infra）**：Undo/Redo + 可再編輯存檔 design.json（需後端）+ 對齊吸附線 + 鍵盤快捷。
- **批次 6（進階）**：clipPath 遮罩 + 文字沿路徑 + 自由繪筆 + 多面設計。
- **批次 7（客人端）**：3D 預覽（Three.js）+ 即時價格 + DPI 驗證 + 分享協作。

每批：tsc → critic → build → sg-deploy。每塊都對齊本目錄 §2 + host 矩陣 §3。

---

## 4b. Photoshop 功能對照（使用者：全部能做的都加）

| PS 功能 | 對應做法 | 狀態 |
|---|---|---|
| 色階 Levels / 亮度對比 / 色相飽和 / 色彩平衡 / 銳利化 | color-grade 積木 | ✅ |
| 一鍵濾鏡（復古/拍立得…）/ 反相 / 灰階 | Fabric 預設 filter | ✅ |
| 移除背景 / 內容感知填色(物件移除) | bg-remover / inpaint(bria) | ✅ |
| 文字（字型/顏色/大小）| Fabric IText | ✅ |
| 圖層樣式：透明度 / 混合模式 / 陰影 / 描邊 | 物件效果面板 | ✅ |
| 翻轉 H/V / 旋轉 / 縮放 | Fabric transform | ✅(翻轉/旋轉/縮放) |
| 形狀（方/圓/線）| Fabric shapes | ✅ |
| 物件鎖定 | lock props | ✅ |
| 自然飽和 Vibrance / 高斯模糊 Gaussian Blur / 雜訊 | Fabric Vibrance/Blur/Noise filter | ⏳ 下批(加進 color 積木) |
| 色溫 / 照片濾鏡 / 色調分離 Posterize / 臨界值 Threshold / 曝光 | ColorMatrix/gamma 近似 | ⏳ |
| 圖層面板（重排/顯隱/改名/複製/群組）| Fabric layering/group/clone | ⏳ |
| 裁切 Crop / 畫布大小 | canvas/image crop | ⏳ |
| 形狀遮罩 / 剪裁遮罩 clipPath | Fabric clipPath | ⏳ |
| 文字沿路徑 / 逐字樣式 / 變形文字 | Fabric text | ⏳ |
| 自由繪筆 / 橡皮擦 / 漸層工具 / 油漆桶 | Fabric brushes/Gradient | ⏳ |
| 生成填色(prompt) / 擴圖 / 換天空 | Replicate FLUX-Fill/outpaint | ⏳ |
| 風格轉換 / 上色 / 超解析 | Replicate | ⏳(超解析已有 upscaler) |
| Undo/Redo / 可再編輯存檔 | toJSON 快照/設計檔 | ⏳ |
| 透視/扭曲/液化 / 斜角浮雕 / 內外光暈 | 進階(部分 Fabric 做不到，需自繪) | ⏳/部分不可 |

> 註：少數 PS 功能（液化 Liquify、進階濾鏡、智慧物件）瀏覽器+Fabric 無原生支援，需大量自繪或外部服務；會標「部分不可」並用替代方案。

## 5. 待解技術點

- **filter 合併（批次 1 阻塞點）**：`buildFabricImageFilters` 目前 `img.filters = [...]` 覆寫。RemoveColor/預設要與 color-grade 共存 → 需把 filter 來源分層（grade filters + tool filters 合併成一個 list）。
- **可再編輯存檔**：`/api/tools/designs` 目前只存 PNG。需擴成同時存 `design.json`（Fabric toJSON）+ 載回 UI。
- **Web-font**：選用 Google Fonts API 或自架字型 CDN；CJK 字型檔大，需子集化 (subset)。
- **AI 積木**：沿用 Replicate；inpainting 需「遮罩繪製」UI（在 canvas 框選/塗抹要清除的區域）。
