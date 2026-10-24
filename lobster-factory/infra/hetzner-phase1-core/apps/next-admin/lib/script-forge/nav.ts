// ScriptForge's page entries (names, icons, one-line blurbs, requirements §8): the only part of the module registry the
// browser loads. Roles and prompts live in modules.ts, which no client file may import
// (lib/script-forge/__tests__/modules.test.ts checks it), so prompt text never ships in the page bundle.

export interface ForgeNavEntry {
  id: string;
  label: string;
  icon: string;
  group: "生成" | "工具" | "分析" | "設定" | "規劃" | "紀錄";
  /** Can its result go to the video tool (requirements §8 送影片). */
  video: boolean;
  /** One line under the name on the page. */
  blurb: string;
}

/** Every page entry in the old order (ScriptForge.tsx NAVS). */
export const FORGE_NAV: readonly ForgeNavEntry[] = [
  { id: "story_bible", label: "短劇 Story Bible", icon: "📖", group: "生成", video: false, blurb: "短劇的角色、世界觀設定集，讓每集人物長相一致" },
  { id: "manual", label: "手動生成", icon: "✏️", group: "生成", video: true, blurb: "填入需求，AI 完成策略、分鏡、評分" },
  { id: "article", label: "文章轉腳本", icon: "📄", group: "生成", video: true, blurb: "貼入文章，AI 萃取精華轉成可拍攝腳本" },
  { id: "industry", label: "產業模板", icon: "🏭", group: "生成", video: true, blurb: "選產業，自動套入語氣、結構、禁用詞" },
  { id: "ab", label: "廣告A/B/C", icon: "🎯", group: "生成", video: true, blurb: "同一產品，三個不同角度廣告腳本" },
  { id: "host", label: "AI主持人稿", icon: "🤖", group: "生成", video: true, blurb: "含停頓、語氣、換氣、肢體動作標記" },
  { id: "brand_story", label: "品牌故事", icon: "📰", group: "生成", video: true, blurb: "把品牌或創辦人的真實故事轉成影片腳本" },
  { id: "sales", label: "銷售對話", icon: "💰", group: "生成", video: false, blurb: "開場白、探索問題、處理異議、成交語" },
  { id: "speech", label: "演講腳本", icon: "🎤", group: "生成", video: false, blurb: "TED、企業、激勵演講，含結構與技巧" },
  { id: "pitch", label: "Pitch Deck", icon: "📊", group: "生成", video: false, blurb: "投資人簡報演說稿、電梯簡報、Q&A" },
  { id: "seo", label: "SEO轉腳本", icon: "🔍", group: "生成", video: true, blurb: "排名好的 SEO 文章轉短影音" },
  { id: "hook", label: "Hook生成器", icon: "🪝", group: "工具", video: false, blurb: "一次 10 種風格的開頭鉤子" },
  { id: "pain", label: "受眾痛點", icon: "💬", group: "工具", video: false, blurb: "輸入產業，列 50 個受眾痛點" },
  { id: "viral", label: "爆款拆解", icon: "🔁", group: "工具", video: false, blurb: "分析爆款為何紅，抽可複製公式" },
  { id: "thumbnail", label: "縮圖文案", icon: "🎬", group: "工具", video: false, blurb: "5 種封面標題、構圖、配色" },
  { id: "repurpose", label: "腳本轉文案", icon: "📧", group: "工具", video: false, blurb: "轉成 Email、Landing Page、社群貼文、廣告文案" },
  { id: "translate", label: "多語言版本", icon: "🌍", group: "工具", video: false, blurb: "轉多語言，符合當地文化非直譯" },
  { id: "preview", label: "動態預覽", icon: "▶️", group: "工具", video: false, blurb: "字幕動畫與場景切換效果" },
  { id: "predict", label: "績效預測", icon: "📊", group: "分析", video: false, blurb: "預測完播率、轉換率、病毒係數（AI 估計，僅供參考）" },
  { id: "brand_build", label: "品牌速建", icon: "🧠", group: "設定", video: false, blurb: "問 5 個問題建立品牌語氣" },
  { id: "brand", label: "品牌語氣", icon: "📋", group: "設定", video: false, blurb: "設定一次，所有模組自動套用（存在客戶網站設定）" },
  { id: "calendar", label: "30天計畫", icon: "📅", group: "規劃", video: false, blurb: "一次生成整個月的腳本主題" },
  { id: "proposal", label: "客戶提案包", icon: "📦", group: "規劃", video: false, blurb: "輸入客戶資訊，生成完整策略提案" },
  { id: "history", label: "腳本歷史", icon: "📝", group: "紀錄", video: false, blurb: "儲存最近 50 筆（只存在這台電腦）" },
];
