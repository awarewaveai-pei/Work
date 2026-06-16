/**
 * Mockup Studio prompt assembly — pure functions, no I/O.
 *
 * Two output modes mirroring the MEGA Mockup Studio blueprint (POD_STUDIO_ROADMAP §B9-S):
 *   flat  — flat-lay garment on a surface with up to 3 corner props
 *   model — a person wearing the garment in a scene
 *
 * Bakes in the three iron rules from the 2026-06-11 P0 realism validation:
 *   1. dark garments need per-element color locking (the model otherwise "adapts"
 *      dark design colors to stay visible on dark fabric)
 *   2. chest-occluding poses hide the design — non-occluding poses get an explicit
 *      "full chest visible" clause, occluding ones are flagged for the UI to warn
 *   3. the design image travels as image_input (handled by the caller, not here)
 */

export type MockupMode = "flat" | "model";
export type GarmentColor = "white" | "black";

export const GARMENTS: Record<string, { label: string; phrase: string }> = {
  tshirt: { label: "T-shirt (Bella 3001)", phrase: "Bella Canvas 3001 unisex crewneck t-shirt" },
  hoodie: { label: "Hoodie", phrase: "unisex pullover hoodie" },
  sweatshirt: { label: "Sweatshirt", phrase: "unisex crewneck sweatshirt" },
  tank: { label: "Tank Top", phrase: "unisex tank top" },
  youth: { label: "Youth Tee", phrase: "youth t-shirt" },
};

export const FLAT_STYLES = [
  { value: "male-relaxed", label: "Male (relaxed)", phrase: "laid out naturally in a relaxed masculine style" },
  { value: "female-scrunched", label: "Female (scrunched)", phrase: "casually scrunched in a soft feminine style" },
];

export const FLAT_LIGHTING = [
  { value: "soft-top", label: "Soft top-down", phrase: "soft even top-down lighting" },
  { value: "side-angle", label: "Strong side-angle", phrase: "strong directional side-angle lighting with gentle shadows" },
];

export const MODEL_POSES = [
  { value: "standing", label: "站姿・輕鬆", phrase: "standing casually with hands relaxed at their sides", occludes: false },
  { value: "hands-hips", label: "雙手叉腰", phrase: "standing confidently with hands on hips", occludes: false },
  { value: "pockets", label: "手插口袋", phrase: "standing with both hands in pockets", occludes: false },
  { value: "pointing", label: "指向鏡頭", phrase: "pointing one hand directly at the camera with a confident smile", occludes: false },
  { value: "chin", label: "托下巴・思考", phrase: "standing with one hand resting lightly on chin, thoughtful expression", occludes: false },
  { value: "stretch", label: "伸展手臂", phrase: "arms stretched loosely upward with a relaxed expression", occludes: false },
  { value: "half-turn", label: "側身半轉", phrase: "in a 45-degree half-turn, glancing back over the shoulder", occludes: false },
  { value: "walking", label: "行走", phrase: "walking naturally toward the camera with a relaxed stride", occludes: false },
  { value: "sitting", label: "坐姿", phrase: "sitting comfortably with good posture", occludes: false },
  { value: "sitting-floor", label: "盤腿坐地", phrase: "sitting cross-legged on the floor in a relaxed pose", occludes: false },
  { value: "crouching", label: "蹲姿", phrase: "crouching down with arms resting loosely on knees", occludes: false },
  { value: "leaning", label: "靠牆", phrase: "leaning casually against a wall with one shoulder", occludes: false },
  { value: "jumping", label: "跳躍", phrase: "captured mid-jump with a joyful expression, arms slightly raised", occludes: false },
  { value: "editorial", label: "Editorial 造型站姿", phrase: "in a dynamic editorial pose with an angled confident stance", occludes: false },
  { value: "arms-crossed", label: "交叉手臂（⚠ 遮設計）", phrase: "with arms crossed confidently", occludes: true },
  { value: "thumbs-up", label: "比讚", phrase: "giving a thumbs up with a warm smile", occludes: false },
];

export const MODEL_ETHNICITIES = [
  { value: "", label: "任意族裔" },
  { value: "East Asian", label: "東亞（黃皙）" },
  { value: "Southeast Asian", label: "東南亞（暖棕）" },
  { value: "South Asian", label: "南亞（中棕）" },
  { value: "Black", label: "黑人（深棕）" },
  { value: "White", label: "白人（白皙）" },
  { value: "Latina", label: "拉丁裔（橄欖）" },
  { value: "Middle Eastern", label: "中東（暖橄欖）" },
  { value: "Indigenous", label: "原住民族" },
  { value: "Mixed race", label: "混血" },
];

export const MODEL_GENDERS = [
  { value: "", label: "任意性別" },
  { value: "woman", label: "女性" },
  { value: "man", label: "男性" },
  { value: "androgynous person", label: "中性／非二元" },
];

export const MODEL_AGES = [
  { value: "", label: "任意年齡" },
  { value: "teenager", label: "青少年（13–17）" },
  { value: "in their 20s", label: "20 多歲" },
  { value: "in their 30s", label: "30 多歲" },
  { value: "in their 40s", label: "40 多歲" },
  { value: "in their 50s", label: "50 多歲" },
  { value: "60s or older", label: "60 歲以上" },
];

export const MODEL_BODY_TYPES = [
  { value: "", label: "任意體型" },
  { value: "slim build", label: "纖細" },
  { value: "petite frame", label: "嬌小" },
  { value: "athletic build", label: "運動型" },
  { value: "average build", label: "一般" },
  { value: "curvy hourglass figure", label: "曲線／沙漏" },
  { value: "plus-size", label: "豐滿 Plus-size" },
  { value: "tall and lean", label: "高挑纖長" },
];

export const MODEL_MAKEUP = [
  { value: "", label: "任意妝造" },
  { value: "bare skin with no makeup", label: "素顏" },
  { value: "very light natural makeup", label: "輕自然妝" },
  { value: "everyday dewy glow makeup", label: "日常光澤妝" },
  { value: "bold full-glam makeup", label: "重磅全妝" },
  { value: "monochrome editorial makeup", label: "單色創意妝" },
  { value: "Y2K colorful graphic makeup", label: "Y2K 彩色妝" },
  { value: "dark gothic makeup", label: "暗黑哥德妝" },
];

export const MODEL_ACCESSORIES = [
  { value: "", label: "無飾品" },
  { value: "wearing minimal delicate jewelry", label: "極簡細飾品" },
  { value: "wearing gold statement earrings", label: "金色大耳環" },
  { value: "wearing layered silver necklaces", label: "多層銀項鍊" },
  { value: "wearing clear-frame glasses", label: "透明框眼鏡" },
  { value: "wearing sleek sunglasses", label: "墨鏡" },
  { value: "wearing a baseball cap", label: "棒球帽" },
  { value: "wearing a cozy beanie", label: "毛帽" },
  { value: "wearing a headband", label: "髮帶" },
  { value: "wearing chunky retro jewelry", label: "復古大件首飾" },
];

export const MODEL_LIGHTING = [
  { value: "daylight", label: "Soft daylight", phrase: "soft natural daylight" },
  { value: "editorial", label: "Editorial studio", phrase: "clean editorial studio lighting" },
  { value: "window", label: "Soft window light", phrase: "soft window light" },
];

export interface FlatMockupParams {
  garment: string; // key of GARMENTS
  color: GarmentColor;
  surface: string; // e.g. "light wooden table"
  style: string; // value of FLAT_STYLES
  lighting: string; // value of FLAT_LIGHTING
  propBottomLeft?: string;
  propTopRight?: string;
  propBottomRight?: string;
}

export interface ModelMockupParams {
  garment: string;
  color: GarmentColor;
  ageGroup: "adult" | "youth";
  modelDescription: string; // e.g. "blonde Asian woman, 20s, slim"
  pose: string; // value of MODEL_POSES
  environment: string; // e.g. "cafe interior with coffee cups"
  lighting: string; // value of MODEL_LIGHTING
  propTopRight?: string;
  propBottomLeft?: string;
}

/** Shared print-fidelity block. The dark-fabric lock is iron rule #1. */
function fidelityBlock(color: GarmentColor): string {
  const base =
    "The exact design from the reference image is printed large on the center chest of the garment. " +
    "Reproduce the reference design EXACTLY: same colors, same shapes, same proportions, no redesign, " +
    "no added text or elements. The print follows the fabric's natural wrinkles, folds and drape " +
    "realistically, with accurate lighting, shadows and subtle cotton fabric texture.";
  if (color === "black") {
    return (
      base +
      " CRITICAL COLOR FIDELITY: keep every color of the reference design exactly as-is even on the " +
      "black fabric — do NOT lighten, darken, invert or recolor any element to make it more visible."
    );
  }
  return base;
}

export function isChestOccludingPose(pose: string): boolean {
  return MODEL_POSES.find((p) => p.value === pose)?.occludes ?? false;
}

function find<T extends { value: string; phrase: string }>(list: T[], value: string): T {
  return list.find((x) => x.value === value) ?? list[0];
}

export function buildFlatMockupPrompt(p: FlatMockupParams): string {
  const garment = GARMENTS[p.garment] ?? GARMENTS.tshirt;
  const style = find(FLAT_STYLES, p.style);
  const lighting = find(FLAT_LIGHTING, p.lighting);
  const props: string[] = [];
  if (p.propBottomLeft?.trim()) props.push(`${p.propBottomLeft.trim()} in the bottom-left corner`);
  if (p.propTopRight?.trim()) props.push(`${p.propTopRight.trim()} in the top-right corner, partially cropped`);
  if (p.propBottomRight?.trim()) props.push(`${p.propBottomRight.trim()} in the bottom-right corner`);
  const propClause = props.length > 0 ? ` Around the garment: ${props.join("; ")}.` : "";
  return (
    `Photorealistic e-commerce flat-lay product photo. A plain ${p.color} ${garment.phrase}, ` +
    `${style.phrase}, on ${p.surface.trim() || "a clean neutral surface"}, ${lighting.phrase}. ` +
    fidelityBlock(p.color) +
    propClause +
    " Shot from directly above, editorial product photography."
  );
}

export function buildModelMockupPrompt(p: ModelMockupParams): string {
  const garment = GARMENTS[p.garment] ?? GARMENTS.tshirt;
  const pose = find(MODEL_POSES, p.pose);
  const lighting = find(MODEL_LIGHTING, p.lighting);
  const who = p.ageGroup === "youth" ? "A young person" : "An adult";
  const desc = p.modelDescription.trim() ? ` (${p.modelDescription.trim()})` : "";
  // Iron rule #2: when the pose doesn't inherently occlude, demand an unobstructed chest.
  const chestClause = pose.occludes ? "" : " The full chest area is visible and unobstructed.";
  const props: string[] = [];
  if (p.propTopRight?.trim()) props.push(`${p.propTopRight.trim()} in the top-right of the frame, mostly cropped`);
  if (p.propBottomLeft?.trim()) props.push(`${p.propBottomLeft.trim()} in the bottom-left of the frame, partially cropped`);
  const propClause = props.length > 0 ? ` In the scene: ${props.join("; ")}.` : "";
  return (
    `Photorealistic e-commerce lifestyle photo. ${who}${desc}, ${pose.phrase}, ` +
    `in ${p.environment.trim() || "a bright minimal interior"}, ${lighting.phrase}. ` +
    `They wear a plain ${p.color} ${garment.phrase}. ` +
    fidelityBlock(p.color) +
    chestClause +
    propClause +
    " Editorial product photography, shallow depth of field, 85mm lens."
  );
}
