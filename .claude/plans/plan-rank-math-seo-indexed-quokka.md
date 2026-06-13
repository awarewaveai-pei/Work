# Plan: RankMath SEO 合規工具 + 文章生成符合 Google SEO/GEO

## Context

`soulfulexpression.org` 文章透過 next-admin 的 `/api/content/generate` → `/api/content/publish` 流程發到 WordPress。

**現況缺口：**
- `publish/route.ts` 只送 `rank_math_description`，缺 `rank_math_focus_keyword` 和 `rank_math_title`（WP side 的 PostCreator.php 已支援這 3 個欄位，但 JWT 路徑沒用）
- `generate/route.ts` 的 `SYSTEM_PROMPT` 沒有 RankMath 21 項合規指引（關鍵字位置/密度/段落長度/外連等）
- `generateMeta` block 只輸出 `SEO_TITLE` 和 `META_DESC`，沒有 `FOCUS_KEYWORD`
- 無 RankMath 合規查核工具（只能發文後到 WP 後台手動看分數）

**目標：** 文章生成時即達 RankMath 綠燈（≥81/100），發布時自動寫入所有關鍵 meta 欄位。

---

## 修改範圍（4 個檔案）

### 1. `generate/route.ts` — 強化 prompt + 輸出 FOCUS_KEYWORD
路徑：`lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/generate/route.ts`

**A. `SYSTEM_PROMPT` 末段加 RankMath 合規規則：**
```
RANK MATH COMPLIANCE (mandatory for every article):
- Primary keyword must appear in: H1 title, first paragraph (within first 150 words), at least one H2 or H3 heading
- Keyword density: 1–1.5%; do not repeat exact phrase more than once per 100 words
- Minimum 600 words; target 1200+ for medium, 2500+ for long
- No paragraph longer than 120 words; split into shorter paragraphs
- Include at least 1 external reference link (cite inline with natural anchor text)
- For articles >1500 words: add a Table of Contents (bulleted list) immediately after H1
```

**B. `buildUserPrompt` 的 generateMeta block — 新增 `FOCUS_KEYWORD:` 行：**
```
<!-- CONTENT_META_START -->
SEO_TITLE: [50-60 char, primary keyword in first half of title]
META_DESC: [145-155 char, includes primary keyword]
FOCUS_KEYWORD: [primary keyword exactly as provided]
<!-- CONTENT_META_END -->
```

**C. `buildUserPrompt` 參數新增 `focusKeyword?: string`：**
在 `lines.push(\`Primary keyword: ${params.keyword}\`)` 前加一行，確保 focusKeyword 明確傳遞（若與 keyword 一致直接重用 keyword 值）。實際上 `keyword` 欄位已是 focus keyword，所以只需讓 meta block 輸出它。

---

### 2. `publish/route.ts` — 補 RankMath 欄位
路徑：`lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/publish/route.ts`

**目前（lines 140-148）body 型別：**
```typescript
let body: {
  markdown?: unknown;
  slug?: unknown;
  seoTitle?: unknown;
  metaDescription?: unknown;
  categories?: unknown;
  scheduleDate?: unknown;
  siteId?: unknown;
};
```
新增 `focusKeyword?: unknown;`

**目前（lines 202-207）meta block：**
```typescript
if (typeof body.metaDescription === "string" && body.metaDescription.trim()) {
  payload.meta = {
    _yoast_wpseo_metadesc: body.metaDescription.trim(),
    rank_math_description: body.metaDescription.trim(),
  };
}
```

**改成（無條件組 meta，各欄位按有無決定是否加入）：**
```typescript
const metaPayload: Record<string, string> = {};
if (typeof body.metaDescription === "string" && body.metaDescription.trim()) {
  metaPayload._yoast_wpseo_metadesc = body.metaDescription.trim();
  metaPayload.rank_math_description  = body.metaDescription.trim();
}
if (typeof body.seoTitle === "string" && body.seoTitle.trim()) {
  metaPayload.rank_math_title = body.seoTitle.trim();
}
if (typeof body.focusKeyword === "string" && body.focusKeyword.trim()) {
  metaPayload.rank_math_focus_keyword = body.focusKeyword.trim();
}
if (Object.keys(metaPayload).length > 0) {
  payload.meta = metaPayload;
}
```

---

### 3. `lib/seo/rankmath-checker.ts` — 新建合規查核工具
路徑：`lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/seo/rankmath-checker.ts`

**純 TypeScript 函式，不需 API call，可在 server/client 兩端跑。**

輸入：
```typescript
interface RankMathInput {
  markdown: string;       // 文章 Markdown 內容
  focusKeyword: string;   // 主要關鍵字
  seoTitle: string;       // SEO title
  metaDescription: string;
  slug: string;
}
```

輸出：
```typescript
interface RankMathCheck {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
}
interface RankMathReport {
  score: number;         // 0-100 近似分（每個 check 權重均等）
  grade: "green" | "orange" | "red";  // ≥81 green, 51-80 orange, <51 red
  checks: RankMathCheck[];
  passed: number;
  total: number;
}
```

**13 個查核項目（涵蓋 RankMath 21 tests 中最重要的）：**

| id | 查核邏輯 |
|---|---|
| kw-in-title | `seoTitle.toLowerCase().includes(kw)` |
| kw-in-meta | `metaDescription.toLowerCase().includes(kw)` |
| kw-in-slug | `slug.toLowerCase().includes(kw.replace(/\s+/g, "-"))` |
| kw-in-intro | 找 Markdown 前 150 words，是否含 kw |
| kw-in-h2h3 | 正則掃 `## ` / `### ` 行，任一含 kw |
| word-count | 計 words ≥ 600 |
| kw-density | kw 出現次數 / 總 word count = 0.5%–2.5% |
| external-links | Markdown 含 `[...](https://` 且不含自己 slug domain |
| internal-links | 含 `[...](/` 或 `[...](https://soulfulexpression` |
| para-length | 每個段落 ≤ 120 words（全部通過才 pass）|
| title-length | `seoTitle.length` 在 30–60 |
| meta-length | `metaDescription.length` 在 120–160 |
| slug-length | `slug.length` ≤ 75 |

Score = `(passed / total) * 100`（整數）

---

### 4. `app/api/content/seo-check/route.ts` — 新建 API endpoint
路徑：`lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/seo-check/route.ts`

- `POST` 接收 `{ markdown, focusKeyword, seoTitle, metaDescription, slug }`
- 呼叫 `checkRankMath()` → 回傳 JSON report
- 用 `canCreateAiImageJob` 同樣的 role check 保護

---

## 不修改的範圍

- `PostCreator.php` — 已支援 3 個 RankMath 欄位，不動
- `wp-kadence-ai-seo-geo-content-engine.md` spec — 不動（另一 AI 並行編輯中）
- WP Bridge 認證流程、n8n workflows — 不動
- 資料庫 schema — 不動

---

## 驗證計畫

1. **tsc 型別檢查：** `npx tsc --noEmit`（改了 publish/route.ts 的 body 型別 + 新 ts 檔）
2. **checker 單元測試：** 用一篇現有文章（`docs/seo-content/articles/what-is-art-based-healing.md`）跑 `checkRankMath()`，確認 13 項正確計算
3. **generate 端到端：** POST `/api/content/generate` 帶 `generateMeta: true`，確認回傳的 `<!-- CONTENT_META_START -->` block 含 `FOCUS_KEYWORD:` 行
4. **seo-check endpoint：** `curl -X POST /api/content/seo-check -d '{...}'` 回傳有效 JSON report
5. **publish 欄位驗證：** POST `/api/content/publish` 帶 `focusKeyword`，在 WP 後台確認該文章 `rank_math_focus_keyword` meta 已寫入（WP → Posts → 選文章 → Rank Math → Focus Keyword 顯示正確）

---

## 執行順序

```
Step 1  rankmath-checker.ts      (新建，純函式，最安全)
Step 2  seo-check/route.ts       (新建，依賴 Step 1)
Step 3  generate/route.ts        (修 SYSTEM_PROMPT + meta block)
Step 4  publish/route.ts         (修 meta payload)
Step 5  npx tsc --noEmit
Step 6  checker 單元驗證
Step 7  curl seo-check endpoint
Step 8  publish 欄位 WP 後台確認
```
