export type ModelVendor = "OpenAI" | "Anthropic" | "Google" | "Perplexity" | "xAI";

export interface TextModelComparison {
  vendor: ModelVendor;
  model: string;
  surface: string;
  bestFor: string;
  style: string;
  cost: string;
  context: string;
  speed: "最快" | "快" | "中" | "慢" | "依搜尋深度";
  speedRank: 1 | 2 | 3 | 4 | 5; // 1=fastest
  costInputPer1M: number; // USD per 1M input tokens (for sort)
  costOutputPer1M: number; // USD per 1M output tokens
  strengths: string;
  tradeoffs: string;
  sourceKeys: string[];
}

export interface CodingToolComparison {
  vendor: ModelVendor;
  tool: string;
  model: string;
  surface: string;
  bestFor: string;
  cost: string;
  speed: "最快" | "快" | "中" | "慢" | "早期測試";
  speedRank: 1 | 2 | 3 | 4 | 5; // 1=fastest
  costInputPer1M: number; // USD per 1M input tokens (0 = free)
  costOutputPer1M: number; // USD per 1M output tokens (0 = free)
  context: string;
  workflowStyle: string;
  strengths: string;
  tradeoffs: string;
  sourceKeys: string[];
}

export const AI_MODEL_SOURCES = {
  openaiPricing: "https://openai.com/api/pricing/",
  openaiGpt55: "https://openai.com/index/gpt-5/",
  codexPricing: "https://openai.com/index/codex/",
  claudeModels: "https://docs.anthropic.com/en/docs/about-claude/models/overview",
  claudePricing: "https://www.anthropic.com/pricing",
  claudeCode: "https://claude.ai/download",
  geminiModels: "https://ai.google.dev/gemini-api/docs/models",
  geminiPricing: "https://ai.google.dev/gemini-api/docs/pricing",
  geminiCodeAssist: "https://developers.google.com/gemini-code-assist/docs/overview",
  perplexityPricing: "https://docs.perplexity.ai/docs/pricing",
  perplexityModels: "https://docs.perplexity.ai/models/model-cards",
  xaiModels: "https://docs.x.ai/docs/models",
  grokBuild: "https://x.ai/blog/grok-3",
} as const;

export const TEXT_MODEL_COMPARISONS: readonly TextModelComparison[] = [
  {
    vendor: "OpenAI",
    model: "GPT-5.5",
    surface: "ChatGPT / OpenAI API",
    bestFor: "長篇策略、複雜推理、專業寫作、需要高可靠度的內容產出",
    style: "結構清楚、商務感強、會主動整理成可執行輸出",
    cost: "API $5 input / $30 output per 1M tokens；快取 input $0.50",
    context: "1,050,000 context；128,000 max output",
    speed: "中",
    speedRank: 3,
    costInputPer1M: 5.0,
    costOutputPer1M: 30.0,
    strengths: "推理、規格、長上下文與多步驟任務很強；適合做主稿與決策稿",
    tradeoffs: "輸出價高；長上下文或高推理工作會明顯拉高成本",
    sourceKeys: ["openaiPricing", "openaiGpt55"],
  },
  {
    vendor: "OpenAI",
    model: "GPT-5.4 / 5.4 mini",
    surface: "ChatGPT / OpenAI API",
    bestFor: "日常內容、摘要、改寫、客服草稿、成本敏感的批量文案",
    style: "穩定、好控、格式遵循佳",
    cost: "GPT-5.4 $2.50/$15；5.4 mini $0.75/$4.50 per 1M tokens",
    context: "標準價格反映 <270K context；長上下文依詳細 pricing",
    speed: "快",
    speedRank: 2,
    costInputPer1M: 2.5,
    costOutputPer1M: 15.0,
    strengths: "5.4 是成本/能力平衡；mini 適合大量輕任務與分類",
    tradeoffs: "最難的策略、長篇推理、程式規劃不如 GPT-5.5",
    sourceKeys: ["openaiPricing"],
  },
  {
    vendor: "Anthropic",
    model: "Claude Opus 4.8",
    surface: "Claude / Claude API",
    bestFor: "高難度分析、長文編輯、複雜 agentic task、深度程式規劃",
    style: "語氣自然、審慎、長文組織與細節保持佳",
    cost: "$5 input / $25 output per 1M tokens；Fast mode $10/$50",
    context: "1M context；Opus tier 可高輸出上限",
    speed: "中",
    speedRank: 3,
    costInputPer1M: 5.0,
    costOutputPer1M: 25.0,
    strengths: "深思、長文、程式碼審查與高風險 reasoning 很強",
    tradeoffs: "比 Sonnet/Haiku 貴；Fast mode 更貴但可提速",
    sourceKeys: ["claudeModels", "claudePricing", "claudeCode"],
  },
  {
    vendor: "Anthropic",
    model: "Claude Sonnet 4.6",
    surface: "Claude / Claude API",
    bestFor: "文字產線主力、SEO/GEO 草稿、需求整理、一般 coding 協作",
    style: "清楚、耐心、少浮誇，適合改稿與長對話",
    cost: "$3 input / $15 output per 1M tokens；batch 50% off",
    context: "1M context；64K output tier",
    speed: "快",
    speedRank: 2,
    costInputPer1M: 3.0,
    costOutputPer1M: 15.0,
    strengths: "速度/成本/品質平衡最好之一；長內容很穩",
    tradeoffs: "極限推理與高難 agentic work 不如 Opus",
    sourceKeys: ["claudeModels", "claudePricing"],
  },
  {
    vendor: "Anthropic",
    model: "Claude Haiku 5.5",
    surface: "Claude / Claude API",
    bestFor: "大量摘要、分類、短文改寫、JSON 抽取、低成本工作流（本系統快速任務預設）",
    style: "短、快、直接",
    cost: "$0.10 input / $0.50 output per 1M tokens（prompt ≤100K；更長的 prompt 單價較高）",
    context: "prompt 超過 100K 改用較高單價",
    speed: "最快",
    speedRank: 1,
    costInputPer1M: 0.1,
    costOutputPer1M: 0.5,
    strengths: "比 Haiku 4.5 便宜約 10 倍；本系統預設關閉思考，短任務不會被思考吃掉輸出額度",
    tradeoffs: "深度策略、長篇高一致性與複雜程式任務較弱",
    sourceKeys: ["claudeModels", "claudePricing"],
  },
  {
    vendor: "Anthropic",
    model: "Claude Haiku 4.5（上一代）",
    surface: "Claude / Claude API",
    bestFor: "大量摘要、分類、短文改寫、低成本工作流",
    style: "短、快、直接",
    cost: "$1 input / $5 output per 1M tokens",
    context: "200K context",
    speed: "最快",
    speedRank: 1,
    costInputPer1M: 1.0,
    costOutputPer1M: 5.0,
    strengths: "上一代快速模型；選單仍保留，新工作請用 Haiku 5.5",
    tradeoffs: "比 Haiku 5.5 貴約 10 倍；深度策略與複雜程式任務較弱",
    sourceKeys: ["claudeModels", "claudePricing"],
  },
  {
    vendor: "Google",
    model: "Gemini 2.5 Pro",
    surface: "Gemini / Gemini API",
    bestFor: "複雜研究、推理、程式、Google 生態資料工作流",
    style: "資訊密度高，擅長把大量素材整合成結論",
    cost: "$1.25–$2.50 input / $10–$15 output per 1M tokens（依 ≤200K 或 >200K）",
    context: "長上下文，價格依 200K token 門檻分段",
    speed: "中",
    speedRank: 3,
    costInputPer1M: 1.25,
    costOutputPer1M: 10.0,
    strengths: "複雜任務、長上下文、資料整合、Google grounding 生態",
    tradeoffs: "輸出成本不低；prompt 太鬆時會偏分析而非可交付稿",
    sourceKeys: ["geminiModels", "geminiPricing"],
  },
  {
    vendor: "Google",
    model: "Gemini 2.5 Flash / Flash-Lite",
    surface: "Gemini / Gemini API",
    bestFor: "便宜快速文案、摘要、分類、批量內容輔助",
    style: "快速、實用、偏工具型",
    cost: "Flash ~$0.30 input / $2.50 output；Flash-Lite ~$0.10 / $0.40 per 1M tokens",
    context: "Flash family 長上下文；grounding 另依方案計費",
    speed: "最快",
    speedRank: 1,
    costInputPer1M: 0.3,
    costOutputPer1M: 2.5,
    strengths: "速度快、成本低、適合大量管線與即時功能",
    tradeoffs: "高難推理、品牌文字細膩度不如 Pro/Claude/OpenAI 高階",
    sourceKeys: ["geminiModels", "geminiPricing"],
  },
  {
    vendor: "Perplexity",
    model: "Sonar / Sonar Pro / Agent API",
    surface: "Perplexity API / Comet",
    bestFor: "需要引用來源、即時資料、競品研究、新聞/市場摘要",
    style: "答案導向、引用導向，像研究助理",
    cost: "官方 pricing 依模型與 provider；受 search context / request 影響",
    context: "依 live model table；檢索內容會進入成本與延遲",
    speed: "依搜尋深度",
    speedRank: 3,
    costInputPer1M: 1.0,
    costOutputPer1M: 1.0,
    strengths: "有引用、適合查證與最新資訊",
    tradeoffs: "成本不是只看 token；深度搜尋會變慢且變貴",
    sourceKeys: ["perplexityPricing", "perplexityModels"],
  },
  {
    vendor: "xAI",
    model: "Grok 4.3",
    surface: "Grok / xAI API",
    bestFor: "快速長上下文、工具調用、需要即時感與較直接語氣的內容",
    style: "直接、反應快、語氣較有個性",
    cost: "$1.25 input / $2.50 output per 1M tokens",
    context: "1M context",
    speed: "快",
    speedRank: 2,
    costInputPer1M: 1.25,
    costOutputPer1M: 2.5,
    strengths: "價格低、context 大、工具調用定位明確",
    tradeoffs: "品牌安全與細膩文案仍需人工審稿；生態成熟度低於 OpenAI/Claude/Gemini",
    sourceKeys: ["xaiModels"],
  },
];

// ── Video generation ──────────────────────────────────────────────────────────

export interface VideoModelComparison {
  vendor: string;
  model: string;
  surface: string;
  bestFor: string;
  style: string;
  costPerSecUsd: number;       // USD per second of generated video
  costNote: string;            // human-readable pricing note
  maxDurationSec: number;
  outputRes: string;
  speed: "最快" | "快" | "中等" | "慢";
  speedRank: 1 | 2 | 3 | 4;
  strengths: string;
  tradeoffs: string;
  sourceKeys: string[];
}

export const VIDEO_MODEL_SOURCES = {
  runwayPricing: "https://runwayml.com/pricing",
  ltxReplicate: "https://replicate.com/lightricks/ltx-video",
  lumaReplicate: "https://replicate.com/luma/ray-flash-2-540p",
  pikaPricing: "https://pika.art/pricing",
  soraPricing: "https://openai.com/sora",
} as const;

export const VIDEO_MODEL_COMPARISONS: readonly VideoModelComparison[] = [
  {
    vendor: "Runway",
    model: "Gen-4 Turbo",
    surface: "Runway API / Web",
    bestFor: "廣告級質感、藝術風格控制、電影感場景",
    style: "細節豐富、風格一致性高",
    costPerSecUsd: 0.05,
    costNote: "$0.05/秒；5 秒 = ~NT$8",
    maxDurationSec: 10,
    outputRes: "720p–1080p",
    speed: "慢",
    speedRank: 4,
    strengths: "西方影像質感最頂；motion brush 精準控制",
    tradeoffs: "最貴；無法做 10 秒以上連續敘事",
    sourceKeys: ["runwayPricing"],
  },
  {
    vendor: "Lightricks",
    model: "LTX-Video (Fast)",
    surface: "Replicate",
    bestFor: "快速草稿、批量預覽、低成本測試 prompt",
    style: "輕盈、動感、偏風格化",
    costPerSecUsd: 0.0008,
    costNote: "$0.0008/秒；5 秒 = ~NT$0.13（最便宜）",
    maxDurationSec: 30,
    outputRes: "480p–720p",
    speed: "最快",
    speedRank: 1,
    strengths: "開源基礎、速度最快、成本趨近於零",
    tradeoffs: "質感差 Kling/Runway 一截；複雜動作易失真",
    sourceKeys: ["ltxReplicate"],
  },
  {
    vendor: "Luma",
    model: "Ray Flash 2",
    surface: "Replicate / Luma API",
    bestFor: "快速草稿、社群素材、動漫/插畫動態化",
    style: "流暢、色彩飽和、風格多樣",
    costPerSecUsd: 0.005,
    costNote: "$0.005/秒 via Replicate；5 秒 = ~NT$0.8",
    maxDurationSec: 9,
    outputRes: "540p–720p",
    speed: "快",
    speedRank: 2,
    strengths: "美西團隊、速度快、成本低；支援圖生影片",
    tradeoffs: "解析度偏低；複雜物理場景不如 Gen-4",
    sourceKeys: ["lumaReplicate"],
  },
  {
    vendor: "Pika",
    model: "Pika 2.2",
    surface: "Pika Web / API",
    bestFor: "電商商品動態展示、特效、快速社群內容",
    style: "清爽、特效豐富、適合行銷素材",
    costPerSecUsd: 0.016,
    costNote: "$0.016/秒估算；訂閱 $8–$70/月",
    maxDurationSec: 10,
    outputRes: "720p–4K",
    speed: "快",
    speedRank: 2,
    strengths: "商品展示效果好；特效工具豐富；有 API",
    tradeoffs: "按訂閱定價較不透明；API 仍 beta",
    sourceKeys: ["pikaPricing"],
  },
  {
    vendor: "OpenAI",
    model: "Sora",
    surface: "ChatGPT Pro/Plus",
    bestFor: "長片敘事、複雜物理場景、高品質展示",
    style: "敘事感強、物理真實、鏡頭語言豐富",
    costPerSecUsd: 0, // 0 = 訂閱制，無 per-unit 定價；cost sort 排最前但卡片顯示「訂閱包含」
    costNote: "含 ChatGPT Pro ($200/月) 或 Plus 配額；無獨立 API 定價",
    maxDurationSec: 20,
    outputRes: "1080p",
    speed: "慢",
    speedRank: 4,
    strengths: "最長可做 20 秒連續敘事；物理模擬業界頂端",
    tradeoffs: "無 API；配額制；商業用途需確認授權條款",
    sourceKeys: ["soraPricing"],
  },
];

// ── Voice / TTS ───────────────────────────────────────────────────────────────

export interface TtsModelComparison {
  vendor: string;
  model: string;
  surface: string;
  bestFor: string;
  costPer1kCharsUsd: number;   // 0 = free
  costNote: string;
  languages: string;
  voiceCount: string;
  cloning: boolean;
  speed: "最快" | "快" | "中等" | "慢";
  speedRank: 1 | 2 | 3 | 4;
  quality: "基礎" | "良好" | "優" | "最佳";
  strengths: string;
  tradeoffs: string;
  sourceKeys: string[];
}

export const TTS_MODEL_SOURCES = {
  edgeTts: "https://github.com/rany2/edge-tts",
  openaiTts: "https://platform.openai.com/docs/guides/text-to-speech",
  elevenLabs: "https://elevenlabs.io/pricing",
  googleTts: "https://cloud.google.com/text-to-speech/pricing",
  kokoro: "https://replicate.com/jaaari/kokoro-82m",
} as const;

export const TTS_MODEL_COMPARISONS: readonly TtsModelComparison[] = [
  {
    vendor: "Microsoft",
    model: "Edge TTS",
    surface: "edge-tts CLI / Python（app 現用）",
    bestFor: "影片旁白、批量產線、繁中/英雙語旁白",
    costPer1kCharsUsd: 0,
    costNote: "完全免費；無 API key；已整合進 video-service/pipeline.py",
    languages: "70+ 語言；繁中 zh-TW-HsiaoChenNeural 表現佳",
    voiceCount: "400+ 神經語音",
    cloning: false,
    speed: "最快",
    speedRank: 1,
    quality: "良好",
    strengths: "免費、零設定、現在就在用；繁中自然度在免費中最好",
    tradeoffs: "無音色複製；語氣彈性不如付費方案；需正常網路（Microsoft 後端）",
    sourceKeys: ["edgeTts"],
  },
  {
    vendor: "OpenAI",
    model: "TTS-1 / TTS-1-HD / gpt-4o-mini-tts",
    surface: "OpenAI API",
    bestFor: "高品質英文旁白、品牌語音、需要自訂指令的語氣控制",
    costPer1kCharsUsd: 0.015,
    costNote: "TTS-1 $15/1M chars；HD $30/1M；gpt-4o-mini-tts ~$15/1M；1k字 = NT$0.48",
    languages: "57 語言；繁中表現普通",
    voiceCount: "6 基礎音色（Alloy/Echo/Nova/Shimmer…）",
    cloning: false,
    speed: "快",
    speedRank: 2,
    quality: "優",
    strengths: "英文最自然；gpt-4o-mini-tts 可用自然語言指令控制語氣",
    tradeoffs: "繁中腔調偏大陸；無音色複製；6 種音色選擇有限",
    sourceKeys: ["openaiTts"],
  },
  {
    vendor: "ElevenLabs",
    model: "Turbo v2.5 / Multilingual v2",
    surface: "ElevenLabs API",
    bestFor: "品牌聲音複製、多語言廣告配音、情感豐富的旁白",
    costPer1kCharsUsd: 0.18,
    costNote: "Starter $5/30k chars (~$0.17/1k)；Scale 降至 $0.03/1k；1k字 = NT$0.54–5.8",
    languages: "32 語言；繁中/粵語支援",
    voiceCount: "3000+ 社群音色 + 自訂複製",
    cloning: true,
    speed: "快",
    speedRank: 2,
    quality: "最佳",
    strengths: "情感最豐富；音色複製一鍵搞定；有 Dubbing API 整合影片",
    tradeoffs: "Starter 方案量少很快燒完；繁中質感不如英文",
    sourceKeys: ["elevenLabs"],
  },
  {
    vendor: "Google",
    model: "Chirp 3 / Neural2",
    surface: "Google Cloud TTS API",
    bestFor: "多語言大量產線、Google 生態整合、精確 SSML 控制",
    costPer1kCharsUsd: 0.016,
    costNote: "Neural2 $16/1M chars；WaveNet $4/1M；Chirp 3 ~$16/1M；每月 1M 免費額度",
    languages: "60+ 語言；繁中 cmn-TW 品質佳",
    voiceCount: "380+ Neural2/WaveNet；Chirp 3 多樣化",
    cloning: false,
    speed: "最快",
    speedRank: 1,
    quality: "優",
    strengths: "每月 100 萬字免費；SSML 最完整；GCP 生態整合",
    tradeoffs: "需 GCP 帳號；無音色複製；語氣彈性不如 ElevenLabs",
    sourceKeys: ["googleTts"],
  },
  {
    vendor: "Kokoro / Hugging Face",
    model: "Kokoro-82M",
    surface: "Replicate / 自架",
    bestFor: "低成本英文旁白、開源自架、預算極度有限的產線",
    costPer1kCharsUsd: 0.001,
    costNote: "Replicate 約 $0.001/1k chars；可完全自架免費",
    languages: "英文為主；中文支援有限",
    voiceCount: "54 音色（開源）",
    cloning: false,
    speed: "最快",
    speedRank: 1,
    quality: "良好",
    strengths: "開源可自架；Replicate 上最便宜；英文自然度超出體積",
    tradeoffs: "繁中不支援；需 GPU 才能快速自架",
    sourceKeys: ["kokoro"],
  },
];

// ── Search API ────────────────────────────────────────────────────────────────

export interface SearchApiComparison {
  vendor: string;
  product: string;
  surface: string;
  bestFor: string;
  style: string;
  costPer1kQueriesUsd: number; // 0 = free tier
  costNote: string;
  resultsType: string;         // organic / AI answer / hybrid
  latency: "< 200ms" | "< 500ms" | "< 1s" | "1–3s" | "> 3s";
  strengths: string;
  tradeoffs: string;
  sourceKeys: string[];
}

export const SEARCH_API_SOURCES = {
  serper: "https://serper.dev/pricing",
  brave: "https://brave.com/search/api/",
  tavily: "https://tavily.com/#pricing",
  perplexitySonar: "https://docs.perplexity.ai/docs/pricing",
  googlePse: "https://developers.google.com/custom-search/v1/overview",
} as const;

export const SEARCH_API_COMPARISONS: readonly SearchApiComparison[] = [
  {
    vendor: "Serper",
    product: "Serper Dev",
    surface: "Serper API（app 現用於文章生成）",
    bestFor: "Google 搜尋結果抓取、SEO 關鍵字分析、內容生成補充引用",
    style: "Google SERP 精準鏡像；結構化 JSON 方便解析",
    costPer1kQueriesUsd: 1.0,
    costNote: "$50/50k queries = $1/1k；免費 2500 次；現用於 content/article-generate",
    resultsType: "Google SERP organic",
    latency: "< 200ms",
    strengths: "最接近真實 Google 排名；速度快；現已整合",
    tradeoffs: "純搜尋結果，無 AI 摘要；超量費用線性增加",
    sourceKeys: ["serper"],
  },
  {
    vendor: "Brave",
    product: "Brave Search API",
    surface: "Brave Search API",
    bestFor: "獨立索引（非 Google）、隱私導向、去重 AI 摘要",
    style: "自建索引 + AI 摘要，答案較直接",
    costPer1kQueriesUsd: 5.0,
    costNote: "Data for All $5/1k；Free 2k/月；AI summaries 另計",
    resultsType: "organic + AI Summary",
    latency: "< 500ms",
    strengths: "獨立爬蟲不依賴 Google；有 AI 摘要；GDPR 友善",
    tradeoffs: "覆蓋率仍不如 Google；$5/1k 比 Serper 貴 5×",
    sourceKeys: ["brave"],
  },
  {
    vendor: "Tavily",
    product: "Tavily Search",
    surface: "Tavily API",
    bestFor: "LLM/Agent 研究流程、需要乾淨摘要段落的 RAG pipeline",
    style: "專為 AI agent 設計：自動去雜訊、直接返回摘要段落",
    costPer1kQueriesUsd: 1.0,
    costNote: "免費 1k/月；Pro $0.001/query = $1/1k；1000 query = NT$32",
    resultsType: "hybrid organic + AI extract",
    latency: "< 1s",
    strengths: "回傳格式最適合 LLM 消費；自動過濾廣告/無關段落",
    tradeoffs: "免費量少；需 AI 介入的延遲比 Serper 高",
    sourceKeys: ["tavily"],
  },
  {
    vendor: "Perplexity",
    product: "Sonar / Sonar Pro",
    surface: "Perplexity API",
    bestFor: "需要帶引用來源的 AI 摘要、市場調查、即時新聞彙整",
    style: "AI 回答 + 來源標注；像有引用的研究助理",
    costPer1kQueriesUsd: 5.0,
    costNote: "Sonar $5/1k requests；Sonar Pro $8/1k；含 token 費用",
    resultsType: "AI answer + citations",
    latency: "1–3s",
    strengths: "引用最清楚；適合品牌/競品研究與即時資訊",
    tradeoffs: "最貴（含 LLM 費用）；延遲高；深度搜尋更慢",
    sourceKeys: ["perplexitySonar"],
  },
  {
    vendor: "Google",
    product: "Custom Search JSON API",
    surface: "Google PSE API",
    bestFor: "真實 Google 排名確認、特定網域搜尋、輔助 SEO 監測",
    style: "真實 Google 結果；可限制網域/語言",
    costPer1kQueriesUsd: 5.0,
    costNote: "前 100 次/天免費；$5/1k；上限 10k/天",
    resultsType: "Google SERP organic",
    latency: "< 500ms",
    strengths: "真正的 Google 結果；可搜尋特定網站",
    tradeoffs: "每日 10k 硬上限；無法拿 SERP snippet 完整結構；不如 Serper 方便",
    sourceKeys: ["googlePse"],
  },
];

export const CODING_TOOL_COMPARISONS: readonly CodingToolComparison[] = [
  {
    vendor: "OpenAI",
    tool: "Codex",
    model: "GPT-5.5 / GPT-5.4 family",
    surface: "ChatGPT Codex / API",
    bestFor: "大型 repo 變更、PR 修復、測試驅動、規格到實作",
    cost: "Codex 含 ChatGPT 各方案；API 另按 GPT token 價格",
    speed: "中",
    speedRank: 3,
    costInputPer1M: 5.0,
    costOutputPer1M: 30.0,
    context: "GPT-5.5 1,050,000 context；適合大上下文 coding",
    workflowStyle: "任務代理：讀 repo、改檔、跑測試、整理結果",
    strengths: "工程流程完整，適合真正落地變更與 CI/PR 工作",
    tradeoffs: "高階模型 token 貴；需要良好 repo 權限與測試環境",
    sourceKeys: ["codexPricing", "openaiPricing", "openaiGpt55"],
  },
  {
    vendor: "Anthropic",
    tool: "Claude Code",
    model: "Sonnet 4.6 / Opus 4.8",
    surface: "Terminal / IDE",
    bestFor: "長時間重構、複雜 bug hunt、架構理解、審慎 code review",
    cost: "訂閱 usage credits 或 API；Sonnet $3/$15，Opus $5/$25 per 1M tokens",
    speed: "快",
    speedRank: 2,
    costInputPer1M: 3.0,
    costOutputPer1M: 15.0,
    context: "Sonnet/Opus 1M context；Opus fast mode 2.5x faster 但更貴",
    workflowStyle: "對話式 pair programmer，擅長保持需求脈絡與風險判斷",
    strengths: "讀碼、推理、重構說明與安全感很好",
    tradeoffs: "長 session 容易燒 token；Opus fast mode 成本高",
    sourceKeys: ["claudeCode", "claudeModels", "claudePricing"],
  },
  {
    vendor: "Google",
    tool: "Gemini Code Assist / CLI",
    model: "Gemini 2.5 Pro / Flash",
    surface: "IDE / CLI / Google Cloud",
    bestFor: "Google Cloud 專案、快速 code assist、免費/低成本個人工作流",
    cost: "Code Assist individuals 免費；API 依 Gemini Pro/Flash token pricing",
    speed: "快",
    speedRank: 2,
    costInputPer1M: 0,
    costOutputPer1M: 0,
    context: "Gemini Pro 長上下文；Flash 適合快修與批量輔助",
    workflowStyle: "IDE 輔助 + CLI agent；與 Google Cloud 開發生命週期整合",
    strengths: "免費入口強、速度快、Cloud/devops 任務方便",
    tradeoffs: "非 Google 生態大型 repo 的端到端代理成熟度需實測",
    sourceKeys: ["geminiCodeAssist", "geminiModels", "geminiPricing"],
  },
  {
    vendor: "Perplexity",
    tool: "Perplexity / Comet",
    model: "Sonar + third-party Agent API",
    surface: "Browser / API",
    bestFor: "文件查證、套件/框架最新用法、方案比較、issue 背景研究",
    cost: "依 Agent API live table；搜尋深度與 context 影響成本",
    speed: "中",
    speedRank: 3,
    costInputPer1M: 1.0,
    costOutputPer1M: 1.0,
    context: "依模型；搜尋檢索會增加延遲與成本",
    workflowStyle: "研究型 coding assistant：先找資料、引用來源，再給建議",
    strengths: "查最新 docs、引用、比較工具選型很強",
    tradeoffs: "不適合直接改 repo；實作建議交給 Codex/Claude Code/Gemini CLI",
    sourceKeys: ["perplexityPricing", "perplexityModels"],
  },
  {
    vendor: "xAI",
    tool: "Grok Build",
    model: "Grok Build 0.1",
    surface: "Terminal CLI",
    bestFor: "早期試用 agentic coding、快速修小功能、想測 xAI coding stack",
    cost: "grok-build-0.1 $1 input / $2 output per 1M tokens；CLI beta 給 SuperGrok/X Premium Plus",
    speed: "早期測試",
    speedRank: 3,
    costInputPer1M: 1.0,
    costOutputPer1M: 2.0,
    context: "256K context",
    workflowStyle: "終端機 coding agent，定位專業軟體工程與複雜 coding work",
    strengths: "價格低、專門 coding model、速度定位明確",
    tradeoffs: "早期 beta；工具生態、穩定度、企業流程成熟度仍需驗證",
    sourceKeys: ["grokBuild", "xaiModels"],
  },
];
