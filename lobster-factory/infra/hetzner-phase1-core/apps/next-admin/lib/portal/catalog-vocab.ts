// Catalog vocabulary: the one list of categories, contexts, tasks and icons (blueprint §4.3). products.ts rows may use
// only these keys; lib/portal/__tests__/products.test.ts rejects anything else. Pure data: no React, no server imports
// (scripts/new-product.mjs loads it too). No emoji, no colour codes in icons.
export const CATEGORIES = ["content", "design", "video", "social", "service", "sales", "research", "insight"] as const;
export type CatalogCategory = (typeof CATEGORIES)[number];
// Shown name of each category (ToolCard, scripts/new-product.mjs); Record<> makes tsc fail when a category has none.
export const CATEGORY_NAMES: Readonly<Record<CatalogCategory, string>> = {
  content: "內容", design: "設計", video: "影片", social: "社群", service: "客服", sales: "開發", research: "研究", insight: "洞察",
};

export const CONTEXTS = ["ecommerce", "studio", "consulting", "education", "creator", "general"] as const;
export type CatalogContext = (typeof CONTEXTS)[number];

// key -> shown name (verb + object) and synonyms searched alongside it. Task keys are stable; names may be reworded.
export const TASKS: Readonly<Record<string, { name: string; synonyms: readonly string[] }>> = {
  "write-seo-article": { name: "寫 SEO 文章", synonyms: ["寫文章", "部落格", "SEO"] },
  "plan-monthly-topics": { name: "排每月題目", synonyms: ["內容行事曆", "選題"] },
  "publish-to-site": { name: "發布到網站", synonyms: ["發文", "上架文章", "WordPress"] },
  "schedule-social-posts": { name: "排社群貼文", synonyms: ["排程發文", "FB", "IG"] },
  "rewrite-per-platform": { name: "改寫成各平台", synonyms: ["改寫貼文", "多平台"] },
  "auto-reply": { name: "自動回覆", synonyms: ["留言回覆", "私訊回覆"] },
  "make-short-video": { name: "做短影片", synonyms: ["短影音", "Reels"] },
  "write-script": { name: "寫腳本", synonyms: ["分鏡", "劇本"] },
  "add-voiceover": { name: "配旁白", synonyms: ["配音", "語音"] },
  "make-product-images": { name: "做商品圖", synonyms: ["商品照", "產品圖"] },
  "write-product-copy": { name: "寫商品文案", synonyms: ["商品描述", "文案"] },
  "retouch-images": { name: "修圖", synonyms: ["去背", "放大", "局部重繪"] },
  "make-tarot-cards": { name: "做塔羅牌", synonyms: ["塔羅", "牌卡"] },
  "edit-design": { name: "編輯設計", synonyms: ["畫布", "向量"] },
  "make-banner": { name: "做橫幅", synonyms: ["廣告圖", "Banner"] },
  "make-mockup": { name: "做擬真圖", synonyms: ["模型圖", "Mockup"] },
  "answer-customer-questions": { name: "回答客人問題", synonyms: ["客服", "知識庫"] },
  "hand-off-to-human": { name: "轉交真人", synonyms: ["客服交接", "轉人工"] },
  "collect-web-data": { name: "蒐集網站資料", synonyms: ["爬蟲", "研究資料"] },
  "write-outreach-emails": { name: "寫開發信", synonyms: ["陌生開發", "寄信"] },
  "find-leads": { name: "找潛在客戶", synonyms: ["名單", "開發名單"] },
  "track-replies": { name: "追蹤回信", synonyms: ["回信分類", "跟進"] },
  "decide-with-methods": { name: "用方法做決策", synonyms: ["決策", "分析方法"] },
  "find-root-cause": { name: "找根本原因", synonyms: ["問題分析", "根因"] },
  "plan-projects": { name: "規劃專案", synonyms: ["專案計畫", "路線圖"] },
  "continuous-monitoring": { name: "持續監測", synonyms: ["監控", "人機互動"] },
};

// Closed list of icon names (the renderer maps each to one glyph). Add a name here before a row uses it.
export const ICONS = ["article", "share", "film", "image", "cards", "palette", "chat", "search", "mail", "compass", "pulse"] as const;
export type CatalogIcon = (typeof ICONS)[number];
