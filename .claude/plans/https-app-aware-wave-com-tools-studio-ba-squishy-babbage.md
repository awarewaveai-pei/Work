# Plan: Banner Studio (`/tools/banner`)

## Context

用戶想在 app.aware-wave.com 加一個 **Banner 設計工具**，用來製作 FB 封面、IG 貼文、YT 縮圖等社群圖。現有工具族（tarot/studio/canvas/mockup）都有成熟 pattern 可以複製，沒有需要新建 API 的地方。

---

## 推薦方案：新獨立工具 `/tools/banner`

**不選「加 tab 到 ContentStudio」** — ContentStudio 已 260KB，Banner 是視覺工具不是文字工具。  
**不選「延伸 CanvasEditor」** — Canvas 是 Fabric.js 泛用編輯器；Banner 需要專用 UX（固定尺寸 preset + AI 背景生成流程）。

### 工作流程

```
選尺寸 preset → 選背景（純色/漸層/上傳/AI生成）→ 打標題+副標 → 調樣式 → 匯出/存圖庫
```

### 尺寸 presets

| 名稱 | 尺寸 | 對應 AI aspect |
|------|------|---------------|
| FB Cover | 1200×630 | 3:2 |
| IG Post | 1080×1080 | 1:1 |
| IG Story | 1080×1920 | 9:16 |
| YT Thumbnail | 1280×720 | 16:9 |
| LinkedIn Banner | 1584×396 | 4:1 |
| Twitter Header | 1500×500 | 3:1 |

### 背景模式

- **純色** — color picker
- **漸層** — from/to 兩個 color picker，方向選擇
- **上傳圖片** — file input → dataURL
- **AI 生成** — prompt 輸入 → 呼叫現有 `/api/tools/tarot/generate`（model: flux-dev，aspect 對應 preset）

### 文字層

- Headline + Subtext 兩層
- 位置：top / center / bottom（三選一，固定 padding）
- 字色、字體（複用 CanvasEditor 的 CJK 字體清單）、字大小
- 背景暗化開關（半透明黑底讓文字更易讀）

### 匯出

- 瀏覽器 Canvas 2D API compositing（background → text）→ `toDataURL('image/png')`
- 存圖庫：`POST /api/tools/designs`，`source: "banner"`（API 無 enum 硬限制）
- 下載 PNG 按鈕

### "在 Canvas Editor 開啟" 按鈕

- 現有 sessionStorage handoff pattern（`CANVAS_SOURCE_KEY` / `CANVAS_NAME_KEY`）
- 寫入後 `router.push('/tools/canvas')` — 複用現有 CanvasEditor 做細修

---

## 要修改 / 新增的檔案

| 動作 | 路徑 |
|------|------|
| **新增** | `app/tools/banner/page.tsx` — thin wrapper（5 行，同 studio/page.tsx pattern）|
| **新增** | `app/tools/banner/BannerStudio.tsx` — 主元件（~450 行）|
| **修改** | `app/SidebarNav.tsx` — 在 Canvas Editor 前加一行 nav item |

### SidebarNav 修改（1 行）

在現有 `canvas` 項前插入：
```typescript
{ type: 'link', href: '/tools/banner', icon: '🖼', label: 'Banner Studio' },
```

### BannerStudio.tsx 狀態 shape

```typescript
type BgMode = "color" | "gradient" | "upload" | "ai";
type TextPos = "top" | "center" | "bottom";

{
  preset: PresetKey;            // "fb-cover" | "ig-post" | ...
  bgMode: BgMode;
  bgColor: string;              // hex
  gradFrom: string; gradTo: string; gradAngle: number;
  bgImage: string | null;       // dataURL (upload or AI result)
  headline: string; subtext: string;
  textColor: string; fontFamily: string; fontSize: number;
  textPos: TextPos;
  dimOverlay: boolean;          // 半透明黑底
  aiPrompt: string; generating: boolean;
  saving: boolean; saved: boolean;
}
```

### 複用的現有工具

| 複用項目 | 來源 |
|---------|------|
| `POST /api/tools/designs` 存圖庫 | TarotStudio.tsx:481 pattern |
| `CANVAS_SOURCE_KEY` / `CANVAS_NAME_KEY` sessionStorage handoff | canvas-handoff.ts |
| CJK 字體清單（黑體/明體/楷書/圓體）| CanvasEditor.tsx |
| `roleHeader()` 認證 header | `@/lib/ops-role` |
| `/api/tools/tarot/generate` AI 背景生成 | 現有 tarot API |

---

## 驗證計畫

1. **實測**：瀏覽器開 `/tools/banner` → 選 IG Post → AI 生成背景 → 加標題 → 存圖庫 → 到 `/tools/designs` 確認出現
2. **Review**：`npx tsc --noEmit` 無型別錯誤；critic pass
3. **抓蟲**：grep `source.*banner` 確認 designs gallery filter 不會靜默丟棄 banner source；grep `CANVAS_SOURCE_KEY` 確認 handoff 常數路徑正確
4. **WORKLOG**：記錄 REALTEST_EVIDENCE + REVIEW_DONE + BUGHUNT_DONE
