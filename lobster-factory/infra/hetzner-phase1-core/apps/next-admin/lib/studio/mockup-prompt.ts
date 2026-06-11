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
  { value: "standing", label: "Standing casually", phrase: "standing casually with hands relaxed at their sides", occludes: false },
  { value: "walking", label: "Walking", phrase: "walking naturally toward the camera", occludes: false },
  { value: "sitting", label: "Sitting", phrase: "sitting comfortably", occludes: false },
  { value: "leaning", label: "Leaning against a wall", phrase: "leaning against a wall", occludes: false },
  { value: "arms-crossed", label: "Arms crossed (會遮設計)", phrase: "with arms crossed confidently", occludes: true },
  { value: "thumbs-up", label: "Giving a thumbs up", phrase: "giving a thumbs up", occludes: false },
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
