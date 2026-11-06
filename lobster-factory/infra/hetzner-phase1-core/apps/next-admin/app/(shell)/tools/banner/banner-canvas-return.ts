// 「傳回」slots for Banner (R0-PLAN 2026-11-05-photocraft-pro §6 C8.3). Pure so the slot-alive checks are unit-tested.

export const BANNER_RETURN_TOOL = "banner";

type BannerImageFields = { productOrig: string | null; productImage: string | null; bgImage: string | null; saved: boolean };

/**
 * The state with the edited image in its slot, or null when the slot is empty now (removed / undone) -> the editor saves to
 * My Designs. "product": both productImage and productOrig (the edit is the new original; 去背 starts from it).
 * "bg": bgImage only; bgMode and bgImageHasProduct stay as they were.
 */
export function applyBannerCanvasReturn<S extends BannerImageFields>(s: S, slot: string, image: string): S | null {
  if (slot === "product") return s.productImage ? { ...s, productOrig: image, productImage: image, saved: false } : null;
  if (slot === "bg") return s.bgImage ? { ...s, bgImage: image, saved: false } : null;
  return null;
}
