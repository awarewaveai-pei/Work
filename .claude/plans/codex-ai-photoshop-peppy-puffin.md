# AI 社群內容工作台 — `/tools/photo-editor`

## Context

用戶想做「從照片到可發布社群素材」的一條龍工具，定位是「AI 社群素材工作台」而非修圖軟體。差異化：背景去除 × 版型 × AI 文案 × 一鍵 Postiz 排程發布。MVP 不碰「一句話修圖」AI chat（Phase 2），不碰相機拍照（Phase 2）。使用對象：staff 代操 + client 自助均支援（現有 RBAC 即可處理）。

## Core Flow（6 步驟線性 wizard）

```
上傳照片 → 一鍵美化 → 選版型 → AI 文案 → 多尺寸預覽/下載 → Postiz 發布
```

## 已有零件（不需重建）

| 功能 | 現有路徑 |
|------|---------|
| 背景去除 | `lib/studio/bg-remover.ts` → POST `/api/tools/studio/remove-bg` |
| 社群發布 | `lib/content/postiz.ts` → POST `/api/content/social-publish` |
| 頻道清單 | GET `/api/content/social-channels?clientId=X` |
| 品牌顏色 | `organizations.metadata.client_config.brandColors` |
| R2 Storage | `lib/storage/r2.ts` → `putDesignObject()`, `buildDesignKey()` |
| OpenAI wrapper | `lib/ai/cheap-json.ts` → `generateCheapJsonText()` |
| Role gate pattern | `app/api/tools/studio/remove-bg/route.ts`（複製 `canCreateAiImageJob` + `POD_DESIGNS_ENABLED` guard）|
| 進階編輯跳轉 | `components/tools/canvas-handoff.ts` → `openInCanvas(image, name)` |
| UI primitives | `components/tools/panel-primitives.ts` → `tabStyle`, `chipStyle`, `actionPill`, `ghostBtn` |

## 新建檔案清單（依建立順序）

```
app/tools/photo-editor/
  templates.ts                  純靜態資料，無 React import
  usePhotoEditorState.ts        共用 state hook（useState + useRef，無 Zustand）
  steps/
    Step1Upload.tsx             drag-drop + file picker（FileReader → data URL）
    Step2Enhance.tsx            bg-remove call + 3 CSS filter 滑桿 + 進階編輯跳轉
    Step3Template.tsx           4 Campaign Kit 選擇器 + 品牌色覆蓋預覽
    Step4Caption.tsx            AI 文案生成（呼叫 caption route）
    Step5Preview.tsx            多尺寸 Canvas 渲染 + 下載（JSZip 已在 package.json）
    Step6Publish.tsx            Postiz 發布（clientId input + 頻道選擇）
  PhotoEditor.tsx               步驟 orchestrator + StepProgressBar（inline component）
  page.tsx                      "use client" + dynamic ssr:false wrapper

app/api/tools/photo-editor/
  caption/
    route.ts                    nodejs runtime, maxDuration=30, OpenAI via cheap-json
```

**不修改任何現有檔案**（middleware matcher 自動覆蓋新路徑）。

## templates.ts 設計

5 個平台尺寸（所有 kit 共用）：

| id | 名稱 | 尺寸 |
|----|------|------|
| `ig-feed` | IG 貼文 | 1080×1080 |
| `ig-story` | IG 限動 | 1080×1920 |
| `fb-post` | FB 貼文 | 1200×630 |
| `line-img` | LINE 圖片 | 1040×1040 |
| `whatsapp` | WhatsApp | 800×800 |

4 個 Campaign Kit：

| id | 名稱 | emoji | overlayColor | ctaText |
|----|------|-------|-------------|---------|
| `product-promo` | 商品推廣 | 🛍️ | `#6366f1` | 立即選購 |
| `event-announce` | 活動宣傳 | 📣 | `#ef4444` | 立即報名 |
| `daily-share` | 日常分享 | 💬 | `#10b981` | 了解更多 |
| `sale` | 促銷特賣 | 🔥 | `#f59e0b` | 限時搶購 |

`overlayColor` 在渲染時若有 `brandColors.primary` 則以品牌色覆蓋。

## usePhotoEditorState.ts 結構

```typescript
type Step = 1 | 2 | 3 | 4 | 5 | 6;
type CaptionMap = Record<string, { text: string; hashtags: string[]; cta: string }>;
interface PhotoEditorState {
  step: Step;
  originalImage: string | null;     // FileReader data URL
  enhancedImage: string | null;     // bg-remove 結果
  selectedTemplate: CampaignTemplate | null;
  captions: CaptionMap;             // key = PlatformSize.id
  selectedPlatformIds: Set<string>;
  publishMode: "now" | "draft";
  clientId: string;
}
// 計算屬性：activeImage = enhancedImage ?? originalImage
```

## caption/route.ts 設計

- 使用 `generateCheapJsonText()` from `lib/ai/cheap-json.ts`（不直接 fetch OpenAI）
- Feature flag: `POD_DESIGNS_ENABLED !== "true"` → 503
- Role gate: `canCreateAiImageJob(role)` （同 remove-bg）
- System prompt: 台灣社群文案專家，回傳純 JSON `{ captions: CaptionMap }`
- 平台別指示：IG feed=emoji+5 hashtags, IG story=短衝, FB=2-3句, LINE=無 hashtag, WhatsApp=對話式
- JSON parse 防禦：先 `.replace(/^```json\n?/, "").replace(/```$/, "")` 再 match `/\{[\s\S]*\}/`
- maxDuration = 30

## Step5Preview.tsx — 渲染策略

**Option A（採用）**：Client-side native Canvas API

```
for each size:
  const canvas = document.createElement("canvas")
  canvas.width = size.w; canvas.height = size.h
  // 1. drawImage(activeImage, 0, 0, w, h)  // cover math
  // 2. draw brand color strip (15% height, top or bottom)
  // 3. draw CTA text (white bold)
  canvas.toDataURL("image/webp") → <img src> thumbnail
```

**Lazy render**（防手機 OOM）：只在卡片進入 viewport 時才建立 canvas。

**下載全部**：JSZip 已在 `package.json ^3.10.1`，直接 import，不需安裝。

## Step6Publish.tsx — 重要注意

LINE / WhatsApp 不在 Postiz 的 `SocialPlatform` union → 發布步驟過濾掉這兩個，UI 顯示「LINE / WhatsApp 僅支援下載」。

`imageUrl` 傳 data URL → `postiz.ts` 的 `uploadMedia()` 已支援 `data:` 前綴轉 buffer，不需先傳 R2。

## 風險與對策

| 風險 | 對策 |
|------|------|
| `POD_DESIGNS_ENABLED=false` 導致 bg-remove 回 503 | Step2 顯示 error message，提供「略過美化」按鈕 |
| CSS filter 滑桿不烘焙進輸出圖 | MVP 接受；加 `// Phase 2: bake CSS filter` 註解 |
| 5 個 1080p canvas 同時在記憶體 ~30MB | lazy render per card，只在 click 時建立 |
| LINE/WhatsApp 不支援 Postiz | 發布層過濾，顯示說明文字 |
| OpenAI 回 markdown fenced JSON | parse 前先 strip code fences + regex extract `{...}` |
| clientId 從何而來（client 自助） | MVP: URL param `?clientId=` 或 Step6 手動輸入；middleware 的 `orgId` 可供 staff 流程自動填入 |

## Auth 設計（兩種使用模式）

- **Staff 代操**：`resolveOpsRole` 正常工作，`userKind=staff`，手動選 `clientId`
- **Client 自助**：`userKind=client`，middleware 注入 `x-ops-org-id`，PhotoEditor 從 response header 或 API 取 orgId 自動帶入 `clientId`（Phase 2 優化；MVP 先讓 client 自己輸入）

## 驗證計畫

1. **tsc**: `npx tsc --noEmit`（apps/next-admin）→ 0 errors
2. **實測 MVP flow**:
   - 上傳 JPG → 一鍵美化（確認 Replicate bg-remove 返回透明 PNG）
   - 選版型 → 生成文案（確認 JSON 格式正確）
   - 預覽 IG 1:1（確認 canvas 渲染正確）
   - 下載 WebP（確認檔案可開啟）
   - 發布 draft 到測試頻道（確認 Postiz 回 ok）
3. **Critic review**: 完成後跑 `/review` subagent
4. **LINE/WhatsApp**：確認發布步驟過濾正確，不傳到 Postiz

## 不做（Phase 2）

- 「一句話修圖」AI chat 介面
- 相機拍照 `getUserMedia`
- Logo/字體品牌設定（只做顏色）
- ZIP 下載（只做單檔下載，JSZip 保留備用）
- 排程發布（只做 now / draft）
