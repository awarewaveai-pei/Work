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

/** A workbench project character (VW scripts/projects-0.js project.assets.character): refs = reference image urls;
 *  key = its Story Bible character id, which a shot's `character` names. */
export interface WorkbenchCharacter { key: string; name: string; role: string; refs: string[] }

/** brief_json of a project: the source script plus both engines' inputs. storyBible: the approved Story Bible the script
 *  was written with (card U3: the workbench episode takes its series and cast). */
export interface VideoHandoff {
  title: string;
  script?: unknown;
  production?: ProductionInput;
  remotion?: RemotionInput;
  storyBible?: { seriesId: string; characters: WorkbenchCharacter[] };
  /** the platform the script was written for (ScriptForge PLATFORMS id): the workbench project's ratio (ratioForPlatform) */
  platform?: string;
}

/** One shot of a workbench episode (VW shared/episode-spine.js newShot): text = what is shown, line = what is said;
 *  character = the Story Bible character id the scene names (the workbench binds the shot to that character). */
export interface WorkbenchShot { text: string; seconds: number; line: string; character?: string }

export function clampCustomScenes(n: number, sceneCount: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(sceneCount, Math.round(n)));
}

// dialogue goes straight to TTS: a stage direction the model left in it (「(旁白/字幕)」) would be read aloud
// (operator 2026-09-12). The prompt forbids it; this strips any bracketed text regardless, and the host script's
// 【停】【加重】 delivery marks (lib/script-forge/modules.ts host task).
function stripStageDirections(text: string): string {
  return text.replace(/[（(][^）)]*[）)]/g, "").replace(/【[^】]*】/g, "").replace(/\s+/g, " ").trim();
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

// A scene's time span, as the script prompts ask for it: "0-3秒" (scenes[].time) or "0-15秒" (host segments[].duration).
function spanSeconds(span: unknown): number | undefined {
  const m = String(span ?? "").match(/(\d+(?:\.\d+)?)\s*[-~～–—]\s*(\d+(?:\.\d+)?)/);
  const n = m ? Number(m[2]) - Number(m[1]) : NaN;
  return n > 0 ? n : undefined;
}

/** Card U3: a ScriptForge script -> the shots of a workbench episode, one per scene (scenes[], or the host script's
 *  segments[]). The picture description and every spoken line stay; stage directions leave the spoken line. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function shotsFromScript(script: any): WorkbenchShot[] {
  const rows: unknown[] = Array.isArray(script?.scenes) ? script.scenes : Array.isArray(script?.segments) ? script.segments : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((s: any) => ({
    text: String(s?.visual ?? s?.imagePrompt ?? s?.image_prompt ?? "").trim(),
    seconds: spanSeconds(s?.time ?? s?.duration) ?? 5,
    line: stripStageDirections(String(s?.dialogue ?? s?.narration ?? s?.marked_text ?? "")),
    ...(typeof s?.character_id === "string" && s.character_id ? { character: s.character_id } : {}),
  })).filter((s) => s.text || s.line);
}

/** Card U3: an approved Story Bible's characters -> workbench project characters; refMap = character id -> reference
 *  image url (ScriptForge buildCharacterRefMap). */
export function charactersFromStoryBible(doc: { characters?: { id: string; name: string; role?: string }[] } | undefined,
  refMap: Record<string, string> = {}): WorkbenchCharacter[] {
  return (doc?.characters ?? []).filter((c) => c?.name?.trim()).map((c) => ({ key: c.id, name: c.name.trim(), role: c.role ?? "", refs: refMap[c.id] ? [refMap[c.id]] : [] }));
}

/** Card U3: a ScriptForge platform -> the workbench project ratio; undefined = the project's default. */
export function ratioForPlatform(platform: string | undefined): "9:16" | "16:9" | undefined {
  return platform === "reels" || platform === "tiktok" || platform === "shorts" ? "9:16" : platform === "youtube" ? "16:9" : undefined;
}

/** Card U9 (U3 leftover): a platform version keeps the original's character mapping. A version scene's character_id
 *  stays when the original names that id; an id the original never had (or none) takes the original scene's at the same
 *  place when both have the same number of scenes, else none. The version's other fields are untouched. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function keepCharacterIds(original: any, version: any): any {
  const from: unknown[] = Array.isArray(original?.scenes) ? original.scenes : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const idOf = (s: any) => (typeof s?.character_id === "string" ? s.character_id : "");
  const known = new Set(from.map(idOf).filter(Boolean));
  if (!known.size || !Array.isArray(version?.scenes)) return version;
  const same = version.scenes.length === from.length;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { ...version, scenes: version.scenes.map((s: any, i: number) => ({ ...s, character_id: known.has(idOf(s)) ? idOf(s) : same ? idOf(from[i]) : "" })) };
}
