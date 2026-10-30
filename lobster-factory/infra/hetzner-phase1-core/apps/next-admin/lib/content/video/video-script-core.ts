/**
 * video-script-core.ts — 呼叫 Claude 把主題 / 文章轉為結構化 6 場景腳本。
 *
 * 唯一職責：組提示 → 呼叫 Claude → 解析 JSON → 回傳型別安全結果。
 * 不做 TTS、不做圖片生成、不做 render。
 */
import { loadAnthropic, type Anthropic } from "@/lib/ai/gateway";
import { grantFor } from "@/lib/entitlements/grant";
import { logAiCall } from "@/lib/ai/log-ai-call";
import { CLAUDE_DEFAULT_MODEL, claudeFallback, claudeIncomplete, claudeParams, claudeText } from "../../ai/gateway";

/** 與 Python pipeline.py CLAUDE_MODEL 對齊（影片生成共用同一模型 ID）。 */
const CLAUDE_MODEL = CLAUDE_DEFAULT_MODEL;

/** 單場景資料（Claude 回傳後每個元素的形狀）。 */
export interface VideoScene {
  id: number;
  /** 旁白文字（約 35 字，TTS 用）。 */
  narration: string;
  /** 英文 AI 圖像提示（Flux 用）。 */
  image_prompt: string;
  /** 英文 B-roll 關鍵字（Pexels 搜尋用）。 */
  broll_keyword: string;
  /** 視覺策略：custom = AI 插圖；broll = 真實影片素材。 */
  visual: "custom" | "broll";
  /** Story Bible 角色定裝照 URL（該場景登場角色已有參考照時）→ buildSceneAsset 生圖時改走 reference-conditioned 模型。 */
  reference_image_url?: string;
}

export interface VideoScriptSuccess {
  ok: true;
  scenes: VideoScene[];
  title: string;
  description: string;
}

/**
 * 依「自訂 AI 圖」數量重新指派場景視覺：使 `visual==="custom"`（Flux AI 圖）的場景數恰為 `customScenes`，
 * 其餘為 `broll`（Pexels 素材）。策略：優先保留既有 custom（超量時從尾端降為 broll）；不足時從頭把 broll 補為 custom。
 * 就地 mutate 並回傳同一陣列。`customScenes` 非有限數（NaN/Infinity）= 不動（安全 no-op）。
 * 純函式，無 I/O → 由 __tests__/reassign-scene-visuals.test.ts 守護不變量。
 */
export function reassignSceneVisuals(scenes: VideoScene[], customScenes: number): VideoScene[] {
  if (!Number.isFinite(customScenes)) return scenes;
  const target = Math.max(0, Math.min(scenes.length, Math.round(customScenes)));
  let customCount = scenes.filter((s) => s.visual === "custom").length;
  // 超量 → 從尾端把多餘 custom 降為 broll
  for (let k = scenes.length - 1; k >= 0 && customCount > target; k--) {
    if (scenes[k].visual === "custom") { scenes[k].visual = "broll"; customCount--; }
  }
  // 不足 → 從頭把 broll 補為 custom
  for (let k = 0; k < scenes.length && customCount < target; k++) {
    if (scenes[k].visual === "broll") { scenes[k].visual = "custom"; customCount++; }
  }
  return scenes;
}

export type VideoScriptResult =
  | VideoScriptSuccess
  | { ok: false; status: number; error: string };

/** targetMinutes → { sceneCount, charsPerScene }
 * Chinese Edge TTS ≈ 280 chars/min；各梯次保留 ~10% 餘裕。
 * 5min: 10 × 160 ≈ 1600 chars ÷ 280 ≈ 5.7 min
 * 3min: 8 × 120 ≈ 960 chars ÷ 280 ≈ 3.4 min
 * 1min: 6 × 50 ≈ 300 chars ÷ 280 ≈ 1.1 min（預設，與原行為一致）
 */
function scriptParams(targetMinutes?: number, sceneCountOverride?: number): { sceneCount: number; charsPerScene: number } {
  const base =
    targetMinutes && targetMinutes >= 4 ? { sceneCount: 10, charsPerScene: 160 } :
    targetMinutes && targetMinutes >= 2 ? { sceneCount: 8,  charsPerScene: 120 } :
    { sceneCount: 6, charsPerScene: 50 };
  // 明確指定場景數（前端「場景總數」滑桿）→ 覆蓋 targetMinutes 推導的張數；charsPerScene 仍沿用梯次值。
  // clamp 1–20 與前端滑桿上限一致（防呆：非法值落回 base）。
  if (typeof sceneCountOverride === "number" && sceneCountOverride >= 1) {
    return { sceneCount: Math.min(20, Math.round(sceneCountOverride)), charsPerScene: base.charsPerScene };
  }
  return base;
}

/** 要求 Claude 回傳的 JSON 架構（供提示使用）。 */
function schemaExample(sceneCount: number) {
  return `{
  "title": "...",
  "description": "...",
  "scenes": [
    { "id": 1, "narration": "旁白文字", "image_prompt": "English prompt for AI illustration", "broll_keyword": "english search term", "visual": "custom" | "broll" },
    ...${sceneCount} scenes total...
  ]
}`;
}

/** 解析 Claude 回傳字串（容錯：剝 markdown fence、fallback regex）。 */
function parseScriptJson(raw: string): VideoScriptSuccess | null {
  // 剝 ```json ... ``` fence
  let text = raw.trim();
  const fenceMatch = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  if (fenceMatch) text = fenceMatch[1].trim();

  // 嘗試直接 JSON.parse
  try {
    const obj = JSON.parse(text) as {
      title?: unknown;
      description?: unknown;
      scenes?: unknown[];
    };
    return validate(obj);
  } catch {
    // fallback：用 regex 抓出最外層 { ... }
    const bracketMatch = /\{[\s\S]*\}/.exec(text);
    if (!bracketMatch) return null;
    try {
      const obj = JSON.parse(bracketMatch[0]) as {
        title?: unknown;
        description?: unknown;
        scenes?: unknown[];
      };
      return validate(obj);
    } catch {
      return null;
    }
  }
}

/** 型別驗證：確認必填欄位存在且形狀正確。 */
function validate(obj: {
  title?: unknown;
  description?: unknown;
  scenes?: unknown[];
}): VideoScriptSuccess | null {
  if (typeof obj.title !== "string" || typeof obj.description !== "string") return null;
  if (!Array.isArray(obj.scenes) || obj.scenes.length === 0) return null;

  const scenes: VideoScene[] = [];
  for (const s of obj.scenes) {
    const sc = s as Record<string, unknown>;
    if (
      typeof sc.id !== "number" ||
      typeof sc.narration !== "string" ||
      typeof sc.image_prompt !== "string" ||
      typeof sc.broll_keyword !== "string" ||
      (sc.visual !== "custom" && sc.visual !== "broll")
    ) {
      return null;
    }
    scenes.push({
      id: sc.id,
      narration: sc.narration,
      image_prompt: sc.image_prompt,
      broll_keyword: sc.broll_keyword,
      visual: sc.visual,
    });
  }
  return { ok: true, scenes, title: obj.title, description: obj.description };
}

/**
 * 呼叫 Claude 生成影片腳本。
 * 輸入可為 topic 字串 或 已存在的文章（title + content）。
 * language 預設繁體中文旁白（視覺 prompt 永遠英文）。
 */
export async function generateVideoScript(
  input: {
    topic?: string;
    articleTitle?: string;
    articleContent?: string;
    language?: string;
    /** 目標影片長度（分鐘）→ 控制場景數與旁白字數。預設 1 分鐘（6 場景 × 50 字）。 */
    targetMinutes?: number;
    /** 明確場景數（前端「場景總數」滑桿）→ 覆蓋 targetMinutes 推導的場景數。 */
    sceneCount?: number;
    /** The site's stored voice (lib/content/brand-voice.ts renderSiteVoice); empty = no brand block. */
    brandVoice?: string;
  },
  apiKey: string
): Promise<VideoScriptResult> {
  const lang = input.language ?? "繁體中文";
  const { sceneCount, charsPerScene } = scriptParams(input.targetMinutes, input.sceneCount);

  // 組成使用者訊息：優先使用文章，其次用主題
  let userContent: string;
  if (input.articleTitle && input.articleContent) {
    userContent =
      `根據以下文章，生成一個 ${lang} 旁白的 ${sceneCount} 場景影片腳本。\n\n` +
      `文章標題：${input.articleTitle}\n\n${input.articleContent}`;
  } else {
    const topic = input.topic ?? "台灣旅遊精選";
    userContent = `根據主題「${topic}」，生成一個 ${lang} 旁白的 ${sceneCount} 場景影片腳本。`;
  }

  const systemPrompt =
    `你是專業影片腳本作家。請嚴格以下方 JSON 格式回傳腳本，不要加任何說明文字。\n\n` +
    `規則：\n` +
    `- scenes 恰好 ${sceneCount} 個，id 從 1 到 ${sceneCount}\n` +
    `- narration：${lang}，${charsPerScene} 字左右，口語短句、主動語態，像真人對著鏡頭說話，避免「此外」「在此」「作為」等書面語，句尾要有自然停頓感\n` +
    `- image_prompt：英文，cinematic 攝影風格的 16:9 場景描述，格式：[主體動作] + [環境背景] + [光線/色調]，30 字以內，禁用抽象詞，只寫可見的具體畫面\n` +
    `- broll_keyword：英文，1–3 個單字，適合 Pexels 搜尋的真實影片素材關鍵字\n` +
    `- visual：「custom」= 此場景適合 AI 插畫；「broll」= 此場景適合真實影片素材\n` +
    `- title：影片標題（${lang}）\n` +
    `- description：SEO 影片描述（${lang}，50–120 字）\n\n` +
    `JSON 架構：\n${schemaExample(sceneCount)}` +
    (input.brandVoice?.trim() ? `\n\n品牌語氣（旁白、標題、描述都要遵守；不得使用禁用聲明）：\n${input.brandVoice.trim()}` : "");

  let response: Anthropic.Beta.Messages.BetaMessage;
  try {
    const grant = await grantFor("video.script");
    const Anthropic = await loadAnthropic(grant);
    const client = new Anthropic({ apiKey });
    // max_tokens 隨場景數放大：6 場 ≈ 4096（沿用原值，無回歸）；場景數可達 20（場景總數滑桿上限）
    // → ~550 tokens/場（narration+image_prompt+broll+JSON 結構，含 160 字長旁白梯次的餘裕），上限 8192。
    // 固定 4096 在多場景時會截斷 JSON → parseScriptJson 失敗 502（2026-06-23 場景總數滑桿修復連帶處理）。
    const maxTokens = Math.min(8192, Math.max(4096, sceneCount * 550));
    response = await client.beta.messages.create({
      ...claudeParams(CLAUDE_MODEL, maxTokens),
      ...claudeFallback(CLAUDE_MODEL),
      messages: [{ role: "user", content: `${systemPrompt}\n\n${userContent}` }],
    });
    void logAiCall({ route: "video/script", response, grant, tool: "video" });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 502, error: `Claude API 呼叫失敗：${msg}` };
  }

  // 取出文字回應（Opus 5.5 開頭是 thinking block，依 type 取，不可用 content[0]）
  const incomplete = claudeIncomplete(response);
  if (incomplete) return { ok: false, status: 502, error: `Claude 未完成回答（${incomplete}）` };
  const text = claudeText(response);
  if (!text) {
    return { ok: false, status: 502, error: "Claude 回傳非文字內容" };
  }

  const parsed = parseScriptJson(text);
  if (!parsed) {
    return {
      ok: false,
      status: 502,
      error: `Claude 回傳 JSON 解析失敗（前 300 字：${text.slice(0, 300)}）`,
    };
  }

  return parsed;
}
