import { loadAnthropic, type Anthropic, providerUrl } from "@/lib/ai/gateway";
import { grantFor } from "@/lib/entitlements/grant";
import {
  DEFAULT_AI_TEXT_MODEL,
  isOpenAiTextModel,
  normalizeAiTextModel,
  textModelOption,
  type AiTextModel,
} from "../ai/text-model-options";
import { logAiCall } from "../ai/log-ai-call";
import { claudeFallback, claudeIncomplete, claudeParams, claudeText } from "../ai/gateway";
import { isStudioModel, type StudioModel } from "./model-options";
import type { StyleAnchor } from "./style-design-workbench";

export interface ImageEditPromptInput {
  aiModel?: unknown;
  editInstruction?: unknown;
  currentPrompt?: unknown;
  sourceImage?: unknown;
  imageModel?: unknown;
  target?: unknown;
  styleAnchor?: unknown;
  actorRole?: string | null;
}

export interface ImageEditPlan {
  aiModel: AiTextModel;
  aiModelLabel: string;
  aiModelGroup: string;
  editPrompt: string;
  editInstruction: string;
  currentPrompt: string;
  sourceImage?: string;
  target: string;
  nextAction: {
    route: "/api/tools/studio/generate";
    body: {
      model?: StudioModel;
      prompt: string;
      referenceImages: string[];
      seed: null;
    };
  };
}

export type ImageEditPromptResult =
  | { ok: true; editPlan: ImageEditPlan }
  | { ok: false; status: number; error: string };

type RawPromptResult =
  | { ok: true; prompt: string }
  | { ok: false; status: number; error: string };

const SYSTEM_PROMPT = `You are an expert image-editing art director.

Write a single concise English prompt for an image editing model. The prompt will be used with the current generated image as a reference image.

Rules:
- Output ONLY the final edit prompt, no preamble, no quotes, no bullets
- Preserve identity, composition, camera angle, lighting, and art style unless the requested change explicitly says otherwise
- Describe the desired change in positive terms
- Do not mention "do not", "no", "without", or other negative prompt phrasing
- 35-90 words
- Make the prompt usable for image-to-image, inpaint, generative fill, or OpenAI image edit tools`;

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function styleAnchorSummary(v: unknown): string {
  if (!v || typeof v !== "object") return "";
  const a = v as Partial<StyleAnchor>;
  const lines = [
    a.model ? `Image model: ${a.model}` : "",
    a.mode ? `Generation mode: ${a.mode}` : "",
    a.stylePrompt ? `Style prompt: ${a.stylePrompt}` : "",
    a.subject ? `Subject: ${a.subject}` : "",
    a.target ? `Target: ${a.target}` : "",
  ].filter(Boolean);
  return lines.join("\n").slice(0, 4000);
}

export function buildImageEditUserMessage(input: Required<Pick<ImageEditPromptInput, "styleAnchor">> & ImageEditPromptInput): string {
  const currentPrompt = str(input.currentPrompt);
  const sourceImage = str(input.sourceImage);
  const target = str(input.target) || "generic";
  const anchor = styleAnchorSummary(input.styleAnchor);

  return [
    `Requested edit: ${str(input.editInstruction)}`,
    currentPrompt ? `Current generation prompt:\n${currentPrompt}` : "",
    anchor ? `Reusable style anchor:\n${anchor}` : "",
    `Current image attached to downstream edit model: ${sourceImage ? "yes" : "no"}`,
    `Output target: ${target}`,
    "Write the final image edit prompt now.",
  ].filter(Boolean).join("\n\n");
}

function cleanPrompt(text: string): string {
  return text
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^(prompt|edit prompt)\s*:\s*/i, "")
    .trim()
    .slice(0, 2000);
}

async function generateWithAnthropic(model: AiTextModel, userMessage: string, actorRole?: string | null): Promise<RawPromptResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, status: 503, error: "missing_anthropic_api_key" };

  try {
    const grant = await grantFor("studio.edit-prompt");
    const Anthropic = await loadAnthropic(grant);
    const client = new Anthropic({ apiKey });
    const msg = await client.beta.messages.create({
      ...claudeParams(model, 350, "low"),
      ...claudeFallback(model),
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });
    void logAiCall({ route: "/api/tools/studio/edit-prompt", response: msg, actorRole, grant });

    const incomplete = claudeIncomplete(msg);
    if (incomplete) return { ok: false, status: 502, error: incomplete };
    const prompt = cleanPrompt(claudeText(msg));
    if (!prompt) return { ok: false, status: 502, error: "empty_response" };
    return { ok: true, prompt };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 502, error: msg };
  }
}

async function generateWithOpenAi(model: AiTextModel, userMessage: string, actorRole?: string | null): Promise<RawPromptResult> {
  const grant = await grantFor("studio.edit-prompt");
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, status: 503, error: "missing_openai_api_key" };

  try {
    const res = await fetch(providerUrl(grant, "openai", "/v1/chat/completions"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_completion_tokens: 350,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
      }),
    });
    if (!res.ok) return { ok: false, status: 502, error: `openai_${res.status}` };
    const json = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const prompt = cleanPrompt(json.choices?.[0]?.message?.content ?? "");
    if (!prompt) return { ok: false, status: 502, error: "empty_response" };

    void logAiCall({
      route: "/api/tools/studio/edit-prompt",
      model,
      inputTokens: json.usage?.prompt_tokens ?? 0,
      outputTokens: json.usage?.completion_tokens ?? 0,
      actorRole,
      grant,
    });
    return { ok: true, prompt };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 502, error: msg };
  }
}

function finishPlan(input: ImageEditPromptInput, aiModel: AiTextModel, editPrompt: string): ImageEditPlan {
  const option = textModelOption(aiModel);
  const sourceImage = str(input.sourceImage);
  const imageModel = isStudioModel(input.imageModel) ? input.imageModel : undefined;
  return {
    aiModel,
    aiModelLabel: option.label,
    aiModelGroup: option.group,
    editPrompt,
    editInstruction: str(input.editInstruction),
    currentPrompt: str(input.currentPrompt),
    sourceImage: sourceImage || undefined,
    target: str(input.target) || "generic",
    nextAction: {
      route: "/api/tools/studio/generate",
      body: {
        model: imageModel,
        prompt: editPrompt,
        referenceImages: sourceImage ? [sourceImage] : [],
        seed: null,
      },
    },
  };
}

export async function generateImageEditPrompt(input: ImageEditPromptInput): Promise<ImageEditPromptResult> {
  const editInstruction = str(input.editInstruction);
  if (!editInstruction) return { ok: false, status: 400, error: "editInstruction is required" };

  const aiModel = normalizeAiTextModel(input.aiModel ?? DEFAULT_AI_TEXT_MODEL);
  const userMessage = buildImageEditUserMessage({ ...input, styleAnchor: input.styleAnchor ?? {} });
  const raw = isOpenAiTextModel(aiModel)
    ? await generateWithOpenAi(aiModel, userMessage, input.actorRole)
    : await generateWithAnthropic(aiModel, userMessage, input.actorRole);

  if ("error" in raw) return raw;
  return { ok: true, editPlan: finishPlan(input, aiModel, raw.prompt) };
}
