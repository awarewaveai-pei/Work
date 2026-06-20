/**
 * Batch mockup specs — the 4 商品圖 generated automatically from ONE design for the one-click flow:
 *   1. white-background flat-lay   (the main / featured image)
 *   2. model A                     (studio, hands-on-hips, warm smile)
 *   3. model B                     (urban street, walking, confident)
 *   4. decor flat-lay              (corner props, lifestyle)
 *
 * All shot on a WHITE garment. Sleeve length flows through `garmentPhrase` (taken from the model's
 * displayName, which carries "Long Sleeve" / "Tee" / "T-Shirt"), so the model prompt renders the
 * correct sleeves without a separate flag. Pure function — the route/UI feeds each `prompt` to
 * /api/tools/studio/generate with the design as the reference image, then saves the result to
 * My Designs (source="mockup"). Quality tuning = swap the scene/pose/surface values below.
 */
import { buildFlatMockupPrompt, buildModelMockupPrompt, type GarmentColor } from "./mockup-prompt";
import type { PodProductModel } from "./pod-catalog-config";

export interface BatchMockupSpec {
  kind: "flat-white" | "model-a" | "model-b" | "flat-decor";
  label: string;
  prompt: string;
}

/** Build the 4 mockup prompts for a model. Caller generates + saves each in order (flat-white first
 *  → it becomes the gallery's main image). */
export function buildBatchMockupSpecs(model: PodProductModel): BatchMockupSpec[] {
  // "Unisex Long Sleeve Shirt | Gildan 2400" → "unisex long sleeve shirt"; "Unisex Classic Tee" → tee.
  const garmentPhrase = model.displayName.split("|")[0].trim().toLowerCase();
  const color: GarmentColor = "white"; // mockups are shot on a white garment regardless of the SKU colours
  return [
    {
      kind: "flat-white",
      label: "白背平拍（主圖）",
      prompt: buildFlatMockupPrompt({
        garmentPhrase,
        color,
        surface: "white-marble",
        arrangement: "centered-hero",
        lighting: "overhead-softbox",
        productCategory: "apparel",
      }),
    },
    {
      kind: "model-a",
      label: "模特 A",
      prompt: buildModelMockupPrompt({
        garmentPhrase,
        color,
        ageGroup: "adult",
        modelDescription: "",
        pose: "hands-hips",
        scene: "studio-white",
        lighting: "editorial",
        framing: "three-quarter",
        emotion: "warm-smile",
      }),
    },
    {
      kind: "model-b",
      label: "模特 B",
      prompt: buildModelMockupPrompt({
        garmentPhrase,
        color,
        ageGroup: "adult",
        modelDescription: "",
        pose: "walking",
        scene: "urban-street",
        lighting: "golden-hour",
        framing: "three-quarter",
        emotion: "confident",
      }),
    },
    {
      kind: "flat-decor",
      label: "帶道具平拍",
      prompt: buildFlatMockupPrompt({
        garmentPhrase,
        color,
        surface: "light-oak",
        arrangement: "centered-hero",
        lighting: "north-window",
        cornerDecor: true,
        props: ["dried wildflowers", "eucalyptus sprigs"],
        productCategory: "apparel",
      }),
    },
  ];
}
