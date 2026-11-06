// 「傳回」slots for Studio (R0-PLAN 2026-11-05-photocraft-pro §6 C8.3): which slot an edited image comes back to, and
// whether that slot still exists. Pure (no React) so the slot-alive checks are unit-tested.

export const STUDIO_RETURN_TOOL = "studio";

/** A reference image with an identity that survives removal of the others (an array index would shift). */
export type StudioRefImage = { id: string; url: string };

let refSeq = 0;
export function newRefImage(url: string): StudioRefImage {
  refSeq += 1;
  return { id: `ref${refSeq}-${Math.random().toString(36).slice(2, 8)}`, url };
}

export const resultSlot = (model: string) => `result:${model}`;
export const refSlot = (id: string) => `ref:${id}`;

/** The model's result gets the image (seed kept); null = no result for that model, or it has no image (still busy / failed). */
export function replaceResultImage<R extends { model: string; image: string | null }>(results: R[], model: string, image: string): R[] | null {
  const i = results.findIndex((r) => r.model === model);
  if (i < 0 || !results[i].image) return null;
  return results.map((r, j) => (j === i ? { ...r, image } : r));
}

/** That reference image gets the new url; null = it was removed meanwhile. */
export function replaceRefImage(refs: StudioRefImage[], id: string, url: string): StudioRefImage[] | null {
  if (!refs.some((r) => r.id === id)) return null;
  return refs.map((r) => (r.id === id ? { ...r, url } : r));
}

export function parseStudioSlot(slot: string): { kind: "result"; model: string } | { kind: "ref"; id: string } | null {
  if (slot.startsWith("result:") && slot.length > 7) return { kind: "result", model: slot.slice(7) };
  if (slot.startsWith("ref:") && slot.length > 4) return { kind: "ref", id: slot.slice(4) };
  return null;
}
