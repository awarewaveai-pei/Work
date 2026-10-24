// ScriptForge's modules, registered on the server (AUTO_CONTENT plan P5, I6): each module has its own role, and each
// AI call it makes (a task) has its prompt builder and the top-level keys its JSON answer must have. The browser sends
// only { module, task, fields }; the system text and the prompt are built here, so no prompt text lives in the page.
// Server only: the page's names and blurbs are nav.ts; no client file imports this one (prompts stay off the bundle).

/** What every prompt gets besides its fields: the output language and scene split the toolbar set, and the brand. */
export interface ForgeCtx {
  lang: string;
  sceneCount: number;
  customScenes: number;
  /** The selected client's voice (lib/content/brand-voice.ts renderSiteVoice) and forbidden claims; null = no client. */
  brand: { voice: string; forbidden: string } | null;
}

export type ForgeFields = Record<string, unknown>;

export interface ForgeTask {
  build(f: ForgeFields, ctx: ForgeCtx): string;
  /** Top-level keys the page reads from the JSON answer (pinned by fixtures in __tests__/modules.test.ts). */
  shape: readonly string[];
}

export interface ForgeModule {
  id: string;
  label: string;
  icon: string;
  group: "生成" | "工具" | "分析" | "設定" | "規劃" | "紀錄";
  /** One line under the name on the page (requirements §8). */
  blurb: string;
  /** Can its result go to the video tool (requirements §8 送影片). */
  video: boolean;
  /** The module's own role: the first line of the system text. "" = the module makes no AI call (history). */
  role: string;
  tasks: Record<string, ForgeTask>;
  /** false = not a page entry (tasks shared by several modules' result cards). */
  nav?: boolean;
}

/** Field as text (missing or non-text = ""). Builders read every field through this, so a missing one never prints "undefined". */
export const s = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
/** The brand line the modules used to append themselves: "" without a client. */
export const brandLine = (ctx: ForgeCtx): string => (ctx.brand?.voice ? `品牌語氣：${ctx.brand.voice}` : "");
/** Field as a list (missing or non-list = []); builders join it the way the old page templates did. */
export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
/** Manual module: the brand line plus the client's forbidden claims, as the page used to paste them (leading newline). */
const brandForbidden = (ctx: ForgeCtx): string => (ctx.brand?.voice ? `\n品牌語氣：${ctx.brand.voice}${ctx.brand.forbidden ? `\n禁用：${ctx.brand.forbidden}` : ""}` : "");

/** Output rules every module shares (was the single system text of the old route). */
export const OUTPUT_RULES = "輸出必須是純JSON，不加任何markdown包裹或前言後記。台詞口語自然；畫面指令具體；字幕最多12字。";

/** The default-language and scene-split instruction the page used to prepend to every prompt. */
export function languageLine(ctx: ForgeCtx): string {
  const broll = Math.max(0, ctx.sceneCount - ctx.customScenes);
  return `【預設輸出語言：${ctx.lang}】未另行指定語言時，所有文字內容（標題/台詞/字幕/說明等）請用此語言撰寫；JSON 的英文 key 與結構保持不變。若輸出 scenes，請輸出剛好 ${ctx.sceneCount} 個 scene，其中剛好 ${ctx.customScenes} 個 visual_type="custom"（AI 原生生圖）、剛好 ${broll} 個 visual_type="broll"（圖庫/實拍素材），並在每個 scene 額外提供 visual_type（"custom" 或 "broll"）與 broll_keyword（英文 1-3 個字；custom 可留空），供後續影片生產保留素材策略。`;
}

const m = (x: Omit<ForgeModule, "tasks"> & { tasks?: ForgeModule["tasks"] }): ForgeModule => ({ tasks: {}, ...x });

/** Every page entry in the old order (ScriptForge.tsx NAVS); each module's tasks are its AI calls (plan P5.3-P5.25). */
export const FORGE_MODULES: ForgeModule[] = [
  m({ id: "story_bible", label: "短劇 Story Bible", icon: "📖", group: "生成", video: false, blurb: "短劇的角色、世界觀設定集，讓每集人物長相一致",
    role: "你是短劇的連續性編審，負責角色、世界觀設定與每集是否違反設定。",
    tasks: {
      check: {
        shape: ["ok", "violations"],
        build: (f) => `你是短劇連續性審核員。請檢查以下腳本是否違反任何一條「不可違反的設定」。\n不可違反的設定：${arr(f.forbid).join("；")}\n已知角色：${arr(f.characters).join("、") || "（無）"}\n已知場景：${arr(f.locations).join("、") || "（無）"}\n腳本內容：\n${arr(f.lines).map((t, i) => `場景${i + 1}：${s(t)}`).join("\n")}\n純JSON：{"ok":true或false,"violations":[{"rule":"違反了哪條規則","sceneIndex":0,"reason":"為什麼違反，30字內"}]}\n沒有違反就回 {"ok":true,"violations":[]}，不要無中生有。`,
      },
    } }),
  m({ id: "manual", label: "手動生成", icon: "✏️", group: "生成", video: true, blurb: "填入需求，AI 完成策略、分鏡、評分",
    role: "你是短影音內容策略師兼分鏡編劇，從零規劃角度、寫出可拍攝的分鏡腳本並評分。",
    tasks: {
      script: {
        shape: ["title", "hook", "scenes", "cta"],
        build: (f, ctx) => `生成完整影片腳本。主題：${s(f.topic)}|平台：${s(f.plat)}|長度：${s(f.duration) || "60秒"}|受眾：${s(f.audience) || "一般觀眾"}|目的：${s(f.goal) || "吸粉"}|語氣：${s(f.tone) || "專業"}|CTA：${s(f.cta) || "追蹤"}|角度：${s(f.angleName)}|鉤子：${s(f.angleHook)}${brandForbidden(ctx)}${s(f.sbBlock)}${s(f.characterIdHint)}\ndialogue 欄位會直接送進 TTS 唸出來，只能寫真的要被唸出的口語文字；不可寫舞台指示或標籤（如「(旁白/字幕)」「(無台詞，輕嘆氣聲)」），這類文字會被逐字唸出變成怪聲音。純視覺無台詞的場景直接把 dialogue 設為空字串 ""；旁白/字幕型場景 dialogue 只放要唸的內容本身，不要加「(旁白)」這種前綴標籤。\n純JSON：{"title":"","hook":"","core_idea":"","scenes":[{"time":"","visual":"","dialogue":"","subtitle":"(≤12字)","shoot_tip":"","edit_tip":""${s(f.sceneCharacterField)}}],"cta":"","alt_hooks":["","",""],"titles":["","","","",""],"hashtags":["","","","",""],"shoot_checklist":["","",""],"edit_notes":""}\nscenes安排${ctx.sceneCount}個場景。`,
      },
      angles: {
        shape: ["angles"],
        build: (f, ctx) => `根據brief產生4個腳本角度。主題：${s(f.topic)}|平台：${s(f.plat)}|長度：${s(f.duration) || "60秒"}|受眾：${s(f.audience) || "一般觀眾"}|目的：${s(f.goal) || "吸粉"}|語氣：${s(f.tone) || "專業"}|CTA：${s(f.cta) || "追蹤"}${brandForbidden(ctx)}${s(f.sbBlock)}\n純JSON：{"angles":[{"id":1,"name":"","type":"反常識/故事/教學/爭議/情緒/銷售其一","hook":"","core":"","why":"(25字內)","risk":"(15字內)","score":8}]}`,
      },
    } }),
  m({ id: "article", label: "文章轉腳本", icon: "📄", group: "生成", video: true, blurb: "貼入文章，AI 萃取精華轉成可拍攝腳本",
    role: "你是把長文改編成短影音的改編編劇，只留最有畫面感與記憶點的內容。",
    tasks: {
      gen: {
        shape: ["title", "hook", "scenes", "cta"],
        build: (f, ctx) => `分析文章並生成${s(f.plat)}腳本。${brandLine(ctx)}\n文章：${s(f.article).slice(0, 3000)}\n純JSON：{"title":"","hook":"","core_idea":"","scenes":[{"time":"","visual":"","dialogue":"","subtitle":"","shoot_tip":"","edit_tip":""}],"cta":"","alt_hooks":["","",""],"titles":["","","","",""],"hashtags":["","","","",""],"shoot_checklist":["",""],"edit_notes":""}\n台詞口語化，${ctx.sceneCount}個場景。`,
      },
    } }),
  m({ id: "industry", label: "產業模板", icon: "🏭", group: "生成", video: true, blurb: "選產業，自動套入語氣、結構、禁用詞",
    role: "你是熟悉各產業法規與行話的影片腳本顧問，照產業慣用結構寫腳本並避開禁用說法。",
    tasks: {
      gen: {
        shape: ["title", "hook", "scenes"],
        build: (f, ctx) => `為${s(f.industry)}產業生成${s(f.plat)}腳本。主題：${s(f.topic)}\n語氣：${s(f.voice)}\n禁用詞：${s(f.forbidden)}\n偏好詞：${s(f.preferred)}\n建議結構：${s(f.structure)}\n純JSON：{"title":"","hook":"","core_idea":"","scenes":[{"time":"","visual":"","dialogue":"","subtitle":"(≤12字)","shoot_tip":"","edit_tip":""}],"cta":"","alt_hooks":["","",""],"titles":["","","","",""],"hashtags":["","","","",""],"shoot_checklist":["",""],"edit_notes":""}\n${ctx.sceneCount}個場景。`,
      },
    } }),
  m({ id: "ab", label: "廣告A/B/C", icon: "🎯", group: "生成", video: true, blurb: "同一產品，三個不同角度廣告腳本",
    role: "你是效果廣告創意總監，為同一產品寫三個訴求明顯不同、可拿來 A/B 測試的廣告腳本。",
    tasks: {
      gen: {
        shape: ["versions", "recommendation"],
        build: (f, ctx) => `為產品生成3個不同角度的${s(f.plat)}廣告腳本（各${s(f.duration)}）。${brandLine(ctx)}\n產品：${s(f.product)}\n版本A-痛點型、版本B-故事型、版本C-社會證明型\n純JSON：{"versions":[{"version":"A","type":"痛點型","title":"","hook":"","strength":"","scenes":[{"time":"","visual":"","dialogue":"","subtitle":"","shoot_tip":""}],"cta":""},{"version":"B","type":"故事型","title":"","hook":"","strength":"","scenes":[...],"cta":""},{"version":"C","type":"社會證明型","title":"","hook":"","strength":"","scenes":[...],"cta":""}],"recommendation":""}`,
      },
    } }),
  m({ id: "host", label: "AI主持人稿", icon: "🤖", group: "生成", video: true, blurb: "含停頓、語氣、換氣、肢體動作標記",
    role: "你是主持人與口播教練，寫給真人照念的稿，標好停頓、語氣、換氣與動作。",
    tasks: {
      gen: {
        shape: ["title", "segments"],
        build: (f) => `生成適合真人說話的AI主持人稿，主題：${s(f.topic)}，風格：${s(f.style) || "親切朋友型"}，長度：${s(f.duration)}。\n要求：完全口語化；含【停】【換氣】標記；含【升調】【降調】【加重】【放慢】【快說】語氣標記；含（微笑）（眼神直視鏡頭）（手勢）表情提示；分段清楚每段15-20秒。\n純JSON：{"title":"","segments":[{"id":1,"duration":"0-15秒","marked_text":"含所有標記的台詞","action_notes":"表情肢體提示","breathing_notes":"換氣節奏說明"}],"delivery_tips":["","",""],"common_mistakes":["",""]}`,
      },
    } }),
  m({ id: "brand_story", label: "品牌故事", icon: "📰", group: "生成", video: true, blurb: "把品牌或創辦人的真實故事轉成影片腳本",
    role: "你是品牌紀錄片編劇，把真實的品牌或創辦人故事寫成有情感弧線的影片腳本，不虛構事實。",
    tasks: {
      gen: {
        shape: ["title", "hook", "story_arc", "scenes"],
        build: (f, ctx) => `生成一個能打動人心的${s(f.kind)}腳本，用於短影音/廣告。${brandLine(ctx)}\n品牌/人物名稱：${s(f.name)}\n創辦人：${s(f.founder)}\n成立背景：${s(f.founded)}\n解決的問題：${s(f.problem)}\n品牌使命：${s(f.mission)}\n轉捩點/關鍵事件：${s(f.turning_point)}\n影響力/成果：${s(f.impact)}\n語氣：${s(f.tone)}\n\n純JSON：{"title":"","hook":"","story_arc":{"opening":"開場情境","conflict":"遇到的困難","turning_point":"轉捩點","resolution":"解決與成長","invitation":"邀請觀眾"},"scenes":[{"time":"","visual":"","dialogue":"","subtitle":"(≤12字)","shoot_tip":"","edit_tip":""}],"cta":"","alt_hooks":["","",""],"titles":["","","","",""],"hashtags":["","","","",""],"emotional_notes":"情感張力備注","key_message":"核心訊息"}\n${ctx.sceneCount}個場景，情感真實，不要誇大，要有具體細節。`,
      },
    } }),
  m({ id: "sales", label: "銷售對話", icon: "💰", group: "生成", video: false, blurb: "開場白、探索問題、處理異議、成交語",
    role: "你是 B2B／B2C 銷售教練，寫出開場、探索問題、處理異議到成交的完整對話稿。",
    tasks: {
      gen: {
        shape: ["title", "opening", "pain_discovery", "objection_handlers", "close_lines", "full_script"],
        build: (f) => `生成一份專業的${s(f.kind)}腳本，針對以下產品/服務。\n產品：${s(f.product)}\n常見異議：${s(f.objections) || "價格太貴、需要考慮、沒有時間"}\n\n純JSON：{"title":"","opening":"開場白（30秒內建立好感）","pain_discovery":["探索痛點問題1","問題2","問題3"],"pitch":"核心賣點介紹（簡短有力）","social_proof":"社會證明說法","objection_handlers":[{"objection":"常見異議","response":"處理方式","follow_up":"追問"}],"close_lines":["成交語1","成交語2","成交語3"],"follow_up_sequence":["第一次跟進","第二次跟進","第三次跟進"],"dos":["應該做的事1","應該做的事2"],"donts":["不要做的事1","不要做的事2"],"full_script":"完整腳本示範（自然口語）"}\n腳本要真實、不油滑、有同理心。`,
      },
    } }),
  m({ id: "speech", label: "演講腳本", icon: "🎤", group: "生成", video: false, blurb: "TED、企業、激勵演講，含結構與技巧",
    role: "你是演講撰稿人與上台教練，寫出結構清楚、有講者技巧標記的演講稿。",
    tasks: {
      gen: {
        shape: ["title", "tagline", "hook", "structure", "full_script"],
        build: (f) => `生成一份${s(f.style)}演講腳本。主題：${s(f.topic)}\n時長：${s(f.duration)}\n受眾：${s(f.audience) || "一般大眾"}\n\n純JSON：{"title":"","tagline":"演講副標題一句話","hook":"開場震撼句","structure":{"opening":"開場（引起共鳴）","thesis":"核心論點","point1":{"title":"","content":"","story":"支撐故事"},"point2":{"title":"","content":"","story":""},"point3":{"title":"","content":"","story":""},"call_to_action":"行動呼籲","closing":"結尾"},"full_script":"完整演講稿（含停頓和語氣標記）","delivery_notes":["演講技巧1","技巧2","技巧3"],"estimated_time":"預估時長","impact_lines":["最有力的5句話中的1","2","3"]}`,
      },
    } }),
  m({ id: "pitch", label: "Pitch Deck", icon: "📊", group: "生成", video: false, blurb: "投資人簡報演說稿、電梯簡報、Q&A",
    role: "你是新創募資顧問，寫投資人簡報演說稿、電梯簡報與預判 Q&A。",
    tasks: {
      gen: {
        shape: ["company", "elevator_pitch", "slides", "full_script"],
        build: (f) => `生成一份投資人Pitch Deck的演說腳本，適合3-5分鐘的簡短pitch。\n公司名：${s(f.company)}\n產品/服務：${s(f.product)}\n解決的問題：${s(f.problem)}\n解法：${s(f.solution)}\n市場規模：${s(f.market)}\n目前進展/Traction：${s(f.traction)}\n募資需求：${s(f.ask)}\n\n純JSON：{"company":"${s(f.company)}","pitch_title":"","elevator_pitch":"30秒版電梯簡報","slides":[{"slide_number":1,"title":"","speaking_notes":"演說稿（第幾張投影片說什麼）","key_message":"這張的核心訊息","timing":"預估秒數"}],"full_script":"完整演說稿","hooks":["吸引投資人的3個開場方式1","2","3"],"qa_prep":[{"question":"投資人常問問題","answer":"建議回答方式"}],"closing":"結尾呼籲"}\n slides包含：封面、問題、解法、市場、商業模式、Traction、團隊、資金用途、結尾，共9張。`,
      },
    } }),
  m({ id: "seo", label: "SEO轉腳本", icon: "🔍", group: "生成", video: true, blurb: "排名好的 SEO 文章轉短影音",
    role: "你是 SEO 內容策略師兼短影音腳本師，萃取搜尋意圖最高的內容轉成短影音。",
    tasks: {
      gen: {
        shape: ["seo_analysis", "title", "hook", "scenes"],
        build: (f, ctx) => `你是SEO內容策略師兼短影音腳本師。分析以下SEO文章，萃取最高搜尋意圖的內容，轉化為${s(f.plat)}腳本。${brandLine(ctx)}\n目標關鍵字：${s(f.keyword)}\n文章內容：${s(f.article).slice(0, 3000)}\n\n純JSON：{"seo_analysis":{"primary_keyword":"","search_intent":"","top_insights":["","",""],"most_shareable_point":""},"title":"","hook":"","core_idea":"","scenes":[{"time":"","visual":"","dialogue":"","subtitle":"(≤12字)","shoot_tip":"","edit_tip":""}],"cta":"","alt_hooks":["","",""],"titles":["","","","",""],"hashtags":["","","","",""],"seo_hashtags":["相關搜尋詞1","搜尋詞2"],"edit_notes":""}\n台詞口語化，不要照搬文章文字，${ctx.sceneCount}個場景。`,
      },
    } }),
  m({ id: "hook", label: "Hook生成器", icon: "🪝", group: "工具", video: false, blurb: "一次 10 種風格的開頭鉤子",
    role: "你是短影音開頭鉤子專家，專寫讓人前 3 秒停下來的開場句。",
    tasks: {
      hooks: {
        shape: ["hooks"],
        build: (f) => `針對「${s(f.topic)}」生成10種不同類型的影片開頭鉤子。\n純JSON：{"hooks":[{"type":"反常識型/痛點型/故事型/數據型/挑戰型/問題型/情緒型/對比型/利益承諾型/懸念型其一","hook":"鉤子文字(2句話內口語自然)","why":"為何有效15字內","score":0}]}\n10個鉤子依序對應全部10種類型。`,
      },
    } }),
  m({ id: "pain", label: "受眾痛點", icon: "💬", group: "工具", video: false, blurb: "輸入產業，列 50 個受眾痛點",
    role: "你是消費者洞察研究員，從受眾角度列出具體、可拿來做題目的痛點。",
    tasks: {
      gen: {
        shape: ["pain_points"],
        build: (f) => `針對「${s(f.target)}」列出50個受眾痛點、恐懼、渴望和問題。\n純JSON：{"industry":"${s(f.target)}","pain_points":[{"id":1,"pain":"痛點","category":"恐懼/渴望/問題/誤區/障礙其一","hook_potential":"轉成鉤子方向（一句話）","urgency":"高/中/低"}]}\n50個痛點平均分配五個類別。`,
      },
    } }),
  m({ id: "viral", label: "爆款拆解", icon: "🔁", group: "工具", video: false, blurb: "分析爆款為何紅，抽可複製公式",
    role: "你是爆款內容分析師，拆解一支內容為何紅，抽出可複製的結構公式。",
    tasks: {
      analyze: {
        shape: ["hook_analysis", "viral_factors", "template_extracted", "rating"],
        build: (f) => `深度拆解以下${s(f.plat)}爆款影片腳本，分析為何能爆。\n影片內容：${s(f.text).slice(0, 3000)}\n純JSON：{"hook_analysis":{"hook_text":"","hook_type":"","why_works":"","psychological_trigger":""},"viral_factors":["","","","",""],"audience_psychology":{"emotion":"","identity_trigger":"","share_reason":""},"copyable_elements":["","",""],"template_extracted":{"structure":"","hook_formula":"","can_apply_to":""},"rating":{"virality":0,"hook_strength":0,"retention":0}}`,
      },
    } }),
  m({ id: "thumbnail", label: "縮圖文案", icon: "🎬", group: "工具", video: false, blurb: "5 種封面標題、構圖、配色",
    role: "你是影片封面設計師與標題文案，給出可點擊的封面標題、構圖與配色。",
    tasks: {
      gen: {
        shape: ["options"],
        build: (f) => `為「${s(f.topic)}」的${s(f.plat)}影片生成5種不同風格的縮圖文案方案。\n純JSON：{"options":[{"id":1,"style":"縮圖風格類型","main_text":"主標題(最多8字)","sub_text":"副標題(可選最多10字)","visual_suggestion":"畫面構圖","color_scheme":"建議配色","font_suggestion":"字體風格","why_works":"吸引點擊原因20字內","click_rate_estimate":"高/中/低"}]}`,
      },
    } }),
  m({ id: "repurpose", label: "腳本轉文案", icon: "📧", group: "工具", video: false, blurb: "轉成 Email、Landing Page、社群貼文、廣告文案",
    role: "你是全通路文案，把一支腳本改寫成指定通路的文案，守該通路的格式。",
    tasks: {
      gen: {
        shape: ["type", "main_output"],
        build: (f) => `將以下影片腳本改寫為「${s(f.label)}」格式，保留核心訊息和情感張力。\n原始腳本：${s(f.script).slice(0, 3000)}\n純JSON：{"type":"${s(f.label)}","main_output":"完整內容","subject_lines":${s(f.target) === "email" ? '["","",""]' : "null"},"variations":["變體版本1"],"usage_tips":"使用建議","key_differences":"主要調整說明"}`,
      },
    } }),
  m({ id: "translate", label: "多語言版本", icon: "🌍", group: "工具", video: false, blurb: "轉多語言，符合當地文化非直譯",
    role: "你是在地化譯者，按當地文化與口語改寫，不逐字直譯。",
    tasks: {
      translate: {
        shape: ["translations"],
        build: (f) => `將以下影片腳本翻譯成${arr(f.langs).join("、")}，符合當地文化語境、口語習慣，適合短影音使用，不要直譯。\n原始（繁體中文）：${s(f.script).slice(0, 2500)}\n純JSON：{"translations":[{"language":"語言名稱","flag":"國旗emoji","translated_text":"完整翻譯","localization_notes":"本地化說明","hook_translated":"鉤子翻譯","cta_translated":"CTA翻譯"}]}`,
      },
    } }),
  m({ id: "preview", label: "動態預覽", icon: "▶️", group: "工具", video: false, blurb: "字幕動畫與場景切換效果",
    role: "你是影片剪輯指導，為腳本規劃字幕動畫與場景切換效果。" }),
  m({ id: "predict", label: "績效預測", icon: "📊", group: "分析", video: false, blurb: "預測完播率、轉換率、病毒係數（AI 估計，僅供參考）",
    role: "你是短影音數據分析師，依腳本結構估計完播率、轉換率與分享潛力，並說明估計依據與不確定性。",
    tasks: {
      predict: {
        shape: ["predicted_retention", "conversion_estimate", "viral_coefficient"],
        build: (f) => `評估以下${s(f.plat)}腳本的預期表現。\n腳本：${s(f.script).slice(0, 2000)}\n純JSON：{"predicted_retention":{"3s_hook_rate":"","30s_rate":"","full_watch_rate":""},"predicted_engagement":{"like_rate":"","comment_rate":"","share_rate":""},"conversion_estimate":{"cta_click_rate":"","conversion_rate":""},"viral_coefficient":{"score":0,"label":"低/中/高/極高","reason":""},"algorithm_score":{"score":0,"factors":["",""],"risks":["",""]},"benchmark_comparison":"","top3_improvements":[{"issue":"","fix":"","impact":""}],"best_post_time":""}`,
      },
    } }),
  m({ id: "brand_build", label: "品牌速建", icon: "🧠", group: "設定", video: false, blurb: "問 5 個問題建立品牌語氣",
    role: "你是品牌策略顧問，從客戶訪談答案整理出可直接使用的品牌語氣設定。",
    tasks: {
      gen: {
        shape: ["name", "voice", "audience", "forbidden", "brand_summary"],
        build: (f) => `根據客戶訪談生成品牌語氣設定。品牌：${s(f.name)}\n產品：${s(f.product)}\n受眾：${s(f.audience)}\n感覺：${s(f.personality)}\n排斥：${s(f.dislike)}\n純JSON：{"name":"","voice":"","audience":"","forbidden":"","preferred":"","cta_style":"","sample_hooks":["","",""],"brand_summary":""}`,
      },
    } }),
  m({ id: "brand", label: "品牌語氣", icon: "📋", group: "設定", video: false, blurb: "設定一次，所有模組自動套用（存在客戶網站設定）",
    role: "你是品牌語氣顧問，依產業與品牌寫出品牌語氣設定。" }),
  m({ id: "calendar", label: "30天計畫", icon: "📅", group: "規劃", video: false, blurb: "一次生成整個月的腳本主題",
    role: "你是內容企劃，排出一個月主題多元、節奏合理的影片題目表。",
    tasks: {
      plan: {
        shape: ["overview", "weeks"],
        build: (f, ctx) => `為「${s(f.theme)}」生成30天${s(f.plat)}內容計畫，目的：${s(f.goal) || "吸粉增長"}。${brandLine(ctx)}\n純JSON：{"overview":"整體策略","weeks":[{"week":1,"theme":"週主題","days":[{"day":1,"title":"","hook":"","type":"教學/故事/爭議/娛樂/銷售/分享","angle":""}]}]}\n4週共28天，type要多樣化。`,
      },
    } }),
  m({ id: "proposal", label: "客戶提案包", icon: "📦", group: "規劃", video: false, blurb: "輸入客戶資訊，生成完整策略提案",
    role: "你是代理商提案總監，為新客戶寫出完整的內容策略提案。",
    tasks: {
      gen: {
        shape: ["proposal_title", "client_name", "executive_summary", "content_strategy", "execution_plan"],
        build: (f) => `為客戶「${s(f.name)}」生成影音內容策略提案書。產業：${s(f.industry) || "未指定"}|產品：${s(f.product)}|目標：${s(f.goal) || "品牌曝光"}|預算：${s(f.budget) || "中等"}\n純JSON：{"client_name":"${s(f.name)}","proposal_title":"","executive_summary":"","market_analysis":"","content_strategy":{"core_message":"","target_audience":"","content_pillars":["","",""]},"recommended_platforms":[{"platform":"","reason":"","content_type":"","frequency":""}],"sample_scripts":[{"title":"","hook":"","angle":""},{"title":"","hook":"","angle":""},{"title":"","hook":"","angle":""}],"execution_plan":{"month1":"","month2":"","month3":""},"expected_results":["","",""],"next_steps":["","",""],"closing":""}`,
      },
    } }),
  m({ id: "history", label: "腳本歷史", icon: "📝", group: "紀錄", video: false, blurb: "儲存最近 50 筆（只存在這台電腦）", role: "" }),
  // Banner Studio's two AI calls (tools/banner): same route and bill, its own role; not a ScriptForge page entry.
  m({ id: "banner", label: "Banner 文案與設計", icon: "🖼", group: "工具", video: false, nav: false, blurb: "",
    role: "你是國際級轉換導向的廣告 banner 設計師與文案，產出能直接套用的 banner 內容。",
    tasks: {
      design: {
        shape: ["headline"],
        build: (f) =>
          `【AI Banner 一鍵設計】\n` +
          `產品/活動：${s(f.brief)}\n` +
          `平台尺寸：${s(f.label)} ${s(f.w)}×${s(f.h)}\n\n` +
          `扮演國際級轉換廣告設計師，設計一張「會讓訪客點擊下單」的 banner。輸出純 JSON（無 markdown 包裹），欄位全部選填、能填則填：\n` +
          `{"headline":"主標，可用 **字** 包住要強調的重點字（例：省 **50%** 起）",` +
          `"subtext":"副標或行動說明",` +
          `"ctaText":"按鈕文字，例 立即選購","ctaBg":"#rrggbb","ctaTextColor":"#rrggbb",` +
          `"badgeText":"促銷徽章（不需要可空字串）","badgeStyle":"ribbon|pill|burst","badgeColor":"#rrggbb","badgePos":"tl|tr",` +
          `"showPrice":true,"priceNow":"NT$590","priceWas":"NT$890",` +
          `"trustType":"none|stars|reviews|guarantee","trustStars":5,"trustText":"12,000+ 則好評",` +
          `"textColor":"#rrggbb","accentColor":"#rrggbb","accentHighlight":false,` +
          `"textPos":"top|center|bottom","textAlignH":"left|center|right","textScrim":true,"textOutline":true,` +
          `"bgMode":"gradient","gradFrom":"#rrggbb","gradTo":"#rrggbb",` +
          `"aiBgSubject":"英文場景描述(供 AI 生背景)","aiBgVibe":"英文氛圍"}\n\n` +
          `配色和諧、對比足夠、CTA 醒目；文字用繁體中文；只輸出 JSON。`,
      },
      copy: {
        shape: ["variants"],
        build: (f) =>
          `【Banner 文案生成】\n` +
          `用途：${s(f.platform)} · ${s(f.label)} (${s(f.w)}×${s(f.h)})\n` +
          `語氣風格：${s(f.tone)}\n` +
          `產品/服務描述：${s(f.brief)}\n\n` +
          `請生成 5 組 banner 文案，每組包含：\n` +
          `- headline：主標題，簡潔有力，8-15 字\n` +
          `- subtext：副標題或行動呼籲（CTA），10-25 字\n\n` +
          `輸出純 JSON，不含任何 markdown 包裹：\n` +
          `{"variants":[{"headline":"...","subtext":"..."},{"headline":"...","subtext":"..."},{"headline":"...","subtext":"..."},{"headline":"...","subtext":"..."},{"headline":"...","subtext":"..."}]}`,
      },
    } }),
  // Tasks of the result card several modules share (platform versions, scoring): not a page entry.
  m({ id: "result", label: "腳本結果", icon: "🧾", group: "工具", video: false, nav: false, blurb: "",
    role: "你是短影音腳本編輯，依指示改寫或評估一支已寫好的腳本。",
    tasks: {
      score_short: {
        shape: ["scores", "overall"],
        build: (f) => `評估腳本。鉤子：${s(f.hook)}|場景：${s(f.scenes)}\n純JSON：{"scores":{"hook":0,"rhythm":0,"clarity":0,"emotion":0,"shootability":0,"conversion":0},"overall":0,"optimized_hook":"","optimized_cta":""}`,
      },
      score: {
        shape: ["scores", "overall"],
        build: (f) => `評估腳本。鉤子：${s(f.hook)}|場景：${s(f.scenes)}|CTA：${s(f.cta)}\n純JSON：{"scores":{"hook":0,"rhythm":0,"clarity":0,"emotion":0,"shootability":0,"conversion":0},"overall":0,"optimized_hook":"","optimized_cta":""}`,
      },
      platform: {
        shape: ["title", "hook", "scenes"],
        build: (f) => `將以下腳本改寫成「${s(f.plat)}」版本。原版：標題:${s(f.title)} 鉤子:${s(f.hook)} 台詞:${arr(f.dialogues).join("；")} CTA:${s(f.cta)}\n純JSON：{"platform":"${s(f.plat)}","title":"","hook":"","scenes":[{"time":"","visual":"","dialogue":"","subtitle":"","shoot_tip":"","edit_tip":""}],"cta":"","key_changes":"3個主要差異"}`,
      },
    } }),
];

/** The page entries, from nav.ts (one list: the registry must have a module for each, and the same metadata). */
export { FORGE_NAV } from "./nav";

export function forgeModule(id: string): ForgeModule | undefined {
  return FORGE_MODULES.find((x) => x.id === id);
}

/** The system text and prompt of one task; null = no such module or task (the route answers 400). */
export function forgePrompt(moduleId: string, taskId: string, fields: ForgeFields, ctx: ForgeCtx): { system: string; prompt: string } | null {
  const mod = forgeModule(moduleId);
  const task = mod && Object.hasOwn(mod.tasks, taskId) ? mod.tasks[taskId] : undefined;
  if (!mod || !task) return null;
  const forbidden = ctx.brand?.forbidden?.trim();
  const system = [mod.role, OUTPUT_RULES, forbidden ? `絕對不要使用這些說法：${forbidden}` : ""].filter(Boolean).join("\n");
  return { system, prompt: `${languageLine(ctx)}\n\n${task.build(fields, ctx)}` };
}
