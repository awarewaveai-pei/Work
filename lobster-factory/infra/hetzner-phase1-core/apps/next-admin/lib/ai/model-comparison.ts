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
    model: "Claude Haiku 4.5",
    surface: "Claude / Claude API",
    bestFor: "大量摘要、分類、短文改寫、低成本工作流",
    style: "短、快、直接",
    cost: "$1 input / $5 output per 1M tokens",
    context: "200K context",
    speed: "最快",
    speedRank: 1,
    costInputPer1M: 1.0,
    costOutputPer1M: 5.0,
    strengths: "低成本高吞吐，適合自動化內容前處理",
    tradeoffs: "深度策略、長篇高一致性與複雜程式任務較弱",
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
    strengths: "價格低、context 大、工具調用定位明確",
    tradeoffs: "品牌安全與細膩文案仍需人工審稿；生態成熟度低於 OpenAI/Claude/Gemini",
    sourceKeys: ["xaiModels"],
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
    context: "256K context",
    workflowStyle: "終端機 coding agent，定位專業軟體工程與複雜 coding work",
    strengths: "價格低、專門 coding model、速度定位明確",
    tradeoffs: "早期 beta；工具生態、穩定度、企業流程成熟度仍需驗證",
    sourceKeys: ["grokBuild", "xaiModels"],
  },
];
