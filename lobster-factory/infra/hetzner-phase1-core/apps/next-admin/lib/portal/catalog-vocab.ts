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
  // Feature layer (U25, blueprint §4.4): tasks a single feature does that its product's own tasks do not name.
  "humanize-text": { name: "人性化文字", synonyms: ["去 AI 味", "潤稿"] },
  "fix-seo": { name: "修 SEO", synonyms: ["SEO 檢查", "SEO 修正"] },
  "extract-brand-voice": { name: "擷取品牌語氣", synonyms: ["品牌語調", "語氣"] },
  "outline-article": { name: "排文章大綱", synonyms: ["大綱", "架構"] },
  "suggest-titles": { name: "想標題", synonyms: ["下標", "標題"] },
  "find-keywords": { name: "找關鍵字", synonyms: ["關鍵字研究", "SEO 關鍵字"] },
  "write-hook": { name: "寫開頭", synonyms: ["Hook", "開場"] },
  "analyze-competitors": { name: "分析競爭對手", synonyms: ["市場分析", "競品"] },
  "find-trending-topics": { name: "找熱門題目", synonyms: ["趨勢", "熱門話題"] },
  "make-article-images": { name: "做文章配圖", synonyms: ["配圖", "封面圖"] },
  "manage-ads": { name: "管廣告", synonyms: ["Meta 廣告", "投廣告"] },
  "connect-social-accounts": { name: "連接社群帳號", synonyms: ["粉專連線", "Meta 設定"] },
  "make-scene-images": { name: "做場景圖", synonyms: ["分鏡圖", "畫面"] },
  "animate-video": { name: "做影片動態", synonyms: ["圖轉影片", "動態"] },
  "make-subtitles": { name: "做字幕", synonyms: ["語音轉字幕", "逐字稿"] },
  "make-3d-model": { name: "圖片轉 3D", synonyms: ["3D 模型", "立體"] },
  "enhance-quality": { name: "提升畫質", synonyms: ["畫質增強", "放大"] },
  "make-music": { name: "做配樂", synonyms: ["音樂", "背景音樂"] },
  "edit-audio": { name: "處理音軌", synonyms: ["音軌分離", "音效"] },
  "write-image-prompts": { name: "寫提示詞", synonyms: ["Prompt", "咒語"] },
  "classify-messages": { name: "分類訊息", synonyms: ["意圖分類", "分流"] },
  "evaluate-answers": { name: "評測回答", synonyms: ["品質檢查", "回答評分"] },
  "practice-support": { name: "練習客服對答", synonyms: ["模擬考", "客服訓練"] },
  "translate-messages": { name: "翻譯訊息", synonyms: ["翻譯", "多語"] },
  "fact-check": { name: "核對事實", synonyms: ["事實查核", "校對"] },
  "research-prospects": { name: "研究客戶", synonyms: ["客戶研究", "背景調查"] },
  "verify-emails": { name: "驗證信箱", synonyms: ["信箱驗證", "退信"] },
  // Cognitive method groups (COGNITIVE_GROUPS below).
  "generate-ideas": { name: "發想點子", synonyms: ["腦力激盪", "創意"] },
  "plan-strategy": { name: "擬定策略", synonyms: ["策略", "未來情境"] },
  "do-research": { name: "做研究", synonyms: ["文獻", "訪談", "實驗"] },
  "review-architecture-risk": { name: "審查架構與風險", synonyms: ["資安", "法規", "維運"] },
  "make-charts-and-reports": { name: "做圖表與報告", synonyms: ["視覺化", "提案"] },
  "reflect-on-self": { name: "自我覺察", synonyms: ["藝術治療", "反思"] },
};

// Cognitive platform (300 methods in cognitive-features.json): a method's tasks come from its group, never typed per
// method. Group of a method = COGNITIVE_PREFIXES[cognitivePrefix(id)]; products.test.ts fails on an unlisted prefix.
export const COGNITIVE_GROUPS = {
  decide: ["decide-with-methods"],
  diagnose: ["find-root-cause"],
  ideate: ["generate-ideas"],
  strategize: ["plan-strategy", "decide-with-methods"],
  research: ["do-research"],
  deliver: ["plan-projects"],
  engineer: ["review-architecture-risk"],
  present: ["make-charts-and-reports"],
  reflect: ["reflect-on-self"],
} as const satisfies Readonly<Record<string, readonly string[]>>;
export type CognitiveGroup = keyof typeof COGNITIVE_GROUPS;
export const COGNITIVE_PREFIXES: Readonly<Record<string, CognitiveGroup>> = {
  decision: "decide", feasibility: "decide", finance: "decide", computation: "decide", stakeholders: "decide",
  root_cause: "diagnose", causal: "diagnose", systems: "diagnose",
  divergent: "ideate", association: "ideate", framing: "ideate", decomposition: "ideate",
  strategy: "strategize", foresight: "strategize", challenge: "strategize",
  research: "research", literature_search: "research", source: "research", evidence: "research", epistemic: "research",
  insight: "research", experiment: "research", run_statistics: "research", transcribe: "research", synthesis: "research",
  interpret: "research", ai: "research",
  delivery: "deliver", project: "deliver", learning: "deliver",
  architecture: "engineer", devops_sre: "engineer", database_data: "engineer", security: "engineer", jurisdiction: "engineer",
  representation: "present", artifact: "present",
  art_therapy: "reflect",
};
// "decision.ahp" -> "decision"; an id with no "." (e.g. "transcribe") is its own prefix.
export const cognitivePrefix = (id: string): string => id.split(".")[0];

// Closed list of icon names (the renderer maps each to one glyph). Add a name here before a row uses it.
export const ICONS = ["article", "share", "film", "image", "cards", "palette", "chat", "search", "mail", "compass", "pulse"] as const;
export type CatalogIcon = (typeof ICONS)[number];
