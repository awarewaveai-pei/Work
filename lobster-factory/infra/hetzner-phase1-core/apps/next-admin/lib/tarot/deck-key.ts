// Which deck a background batch belongs to (migration 0162): SHA-256 of exactly what the batch generates. The server
// stores it at creation (app/api/tools/tarot/batch/route.ts); the deck panel asks for the jobs whose key equals the deck
// locked now, so a batch from another style is never offered for this one. Runs in the browser and in Node (Web Crypto).
export type DeckKeyInput = { model: string; aspectRatio: string; seed: number | null; prompts: readonly string[] };

export async function tarotDeckKey(d: DeckKeyInput): Promise<string> {
  const source = JSON.stringify([d.model, d.aspectRatio, d.seed, d.prompts]);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const DECK_KEY_RE = /^[0-9a-f]{64}$/;
