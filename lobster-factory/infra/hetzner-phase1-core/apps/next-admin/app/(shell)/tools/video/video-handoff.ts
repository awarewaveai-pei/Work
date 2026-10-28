// What a script hands to video production (V1.3/V1.4): one shape, built once, stored on the project (brief_json) so
// the production mode can change at step ② without losing either engine's input. Every sender and reader imports it.

export type ProductionScene = { narration: string; imagePrompt: string; visual?: "custom" | "broll"; brollKeyword?: string; referenceImageUrl?: string };

/** Quick video / short drama input (VideoStudio `initial`). */
export interface ProductionInput {
  topic?: string;
  articleTitle?: string;
  articleContent?: string;
  scenes?: ProductionScene[];
  mediaMode?: string;
  duration?: number;
  customScenes?: number;
}

/** Remotion template input (VideoStudio `remotionInitial`). */
export interface RemotionInput {
  topic: string;
  headline?: string;
  tagline?: string;
  cta?: string;
  imageHint?: string;
  scenes?: { visual: string; dialogue: string }[];
  mediaMode?: string;
  duration?: number;
  customScenes?: number;
}

/** brief_json of a project: the source script plus both engines' inputs. */
export interface VideoHandoff {
  title: string;
  script?: unknown;
  production?: ProductionInput;
  remotion?: RemotionInput;
}

export function clampCustomScenes(n: number, sceneCount: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(sceneCount, Math.round(n)));
}

// dialogue goes straight to TTS: a stage direction the model left in it (「(旁白/字幕)」) would be read aloud
// (operator 2026-09-12). The prompt forbids it; this strips any bracketed text regardless.
function stripStageDirections(text: string): string {
  return text.replace(/[（(][^）)]*[）)]/g, "").replace(/\s+/g, " ").trim();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function productionSceneFromScriptScene(s: any, characterRefs?: Record<string, string>): ProductionScene | null {
  const narration = stripStageDirections(String(s?.dialogue ?? s?.narration ?? s?.marked_text ?? ""));
  if (!narration) return null;
  const imagePrompt = String(s?.visual ?? s?.imagePrompt ?? s?.image_prompt ?? "").trim();
  const brollKeyword = String(s?.broll_keyword ?? s?.brollKeyword ?? "").trim();
  const rawVisual = String(s?.visual_type ?? s?.asset_type ?? s?.visualMode ?? "").toLowerCase();
  const visual: "custom" | "broll" = rawVisual === "broll" || brollKeyword ? "broll" : "custom";
  const characterId = typeof s?.character_id === "string" ? s.character_id : "";
  const referenceImageUrl = characterId ? characterRefs?.[characterId] : undefined;
  return { narration, imagePrompt, visual, brollKeyword, referenceImageUrl };
}

function enforceProductionVisualSplit(scenes: ProductionScene[], customScenes: number): ProductionScene[] {
  const target = clampCustomScenes(customScenes, scenes.length);
  let customCount = scenes.filter((s) => s.visual !== "broll").length;
  const next = scenes.map((s) => ({ ...s, visual: s.visual ?? "custom" }));
  for (let i = next.length - 1; i >= 0 && customCount > target; i--) {
    if (next[i].visual !== "broll") { next[i].visual = "broll"; customCount--; }
  }
  for (let i = 0; i < next.length && customCount < target; i++) {
    if (next[i].visual === "broll") { next[i].visual = "custom"; customCount++; }
  }
  return next;
}

/** A ScriptForge script (title/hook/scenes/cta) → both engines' inputs. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handoffFromScript(script: any, opts: { customScenes: number; characterRefs?: Record<string, string> }): VideoHandoff {
  const scenesIn = Array.isArray(script?.scenes) ? script.scenes : [];
  const title = String(script?.title ?? "");
  const dialogue = scenesIn.map((s: { dialogue?: string }) => s?.dialogue).filter(Boolean).join("\n");
  const raw = scenesIn.map((s: unknown) => productionSceneFromScriptScene(s, opts.characterRefs)).filter(Boolean) as ProductionScene[];
  const scenes = enforceProductionVisualSplit(raw, opts.customScenes);
  return {
    title,
    script,
    production: {
      topic: title, articleTitle: title,
      articleContent: `${script?.hook ? `開場鉤子：${script.hook}\n\n` : ""}${dialogue}${script?.cta ? `\n\n結尾 CTA：${script.cta}` : ""}`,
      scenes: scenes.length ? scenes : undefined,
      customScenes: scenes.length ? clampCustomScenes(opts.customScenes, scenes.length) : undefined,
    },
    remotion: {
      topic: title, headline: title, tagline: String(script?.hook ?? ""), cta: String(script?.cta ?? ""),
      imageHint: String(scenesIn[0]?.visual ?? ""),
      scenes: scenesIn.map((s: { visual?: string; dialogue?: string }) => ({ visual: s?.visual || "", dialogue: s?.dialogue || "" })),
      customScenes: clampCustomScenes(opts.customScenes, scenesIn.length),
    },
  };
}
