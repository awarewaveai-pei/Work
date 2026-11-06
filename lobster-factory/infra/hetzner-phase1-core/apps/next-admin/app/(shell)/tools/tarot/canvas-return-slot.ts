// 「傳回」slots for tarot (R0-PLAN 2026-11-05-photocraft-pro C8.2). A deck card's slot names the deck it was sent from
// (deckGenRef value) and its index: a regenerated / relocked deck has another id, so its return lands in My Designs.

export const PREVIEW_SLOT = "preview";

export function deckSlot(deck: number, index: number): string {
  return `deck:${deck}:${index}`;
}

/** Index of the deck card a returned image still belongs to, or null (deck replaced, card not done, bad slot). */
export function deckReturnIndex(slot: string, currentDeck: number, batch: ReadonlyArray<{ status: string }>): number | null {
  const m = /^deck:(\d+):(\d+)$/.exec(slot);
  if (!m || Number(m[1]) !== currentDeck) return null;
  const index = Number(m[2]);
  return batch[index]?.status === "done" ? index : null;
}
