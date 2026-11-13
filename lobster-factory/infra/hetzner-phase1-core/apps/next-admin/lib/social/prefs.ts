// A person's own choices on the social page (2026-11-13: the display time zone). Stored on their public.profiles row
// under metadata.social (0161: every auth user has one; nothing else reads or writes profiles.metadata), so a choice
// follows the person to every device -- the database, never browser storage. Keyed by the auth user id middleware
// injects (x-ops-user-id), never by anything the caller sends.
import { db, SocialStoreError } from "./store";
import { isDisplayZone, type DisplayZone } from "./time";

export interface SocialPrefs { displayTz: DisplayZone }
export const DEFAULT_PREFS: SocialPrefs = { displayTz: "org" };

type Metadata = Record<string, unknown> & { social?: Record<string, unknown> };

async function readMetadata(userId: string): Promise<Metadata | null> {
  const { data, error } = await db().from("profiles").select("metadata").eq("id", userId).maybeSingle();
  if (error) throw new SocialStoreError(500, `prefs read failed: ${error.message}`);
  if (!data) return null;
  const m = (data as { metadata: unknown }).metadata;
  return m && typeof m === "object" && !Array.isArray(m) ? (m as Metadata) : {};
}

/** A stored value that is no longer a choice reads as the default. */
export async function loadPrefs(userId: string): Promise<SocialPrefs> {
  const tz = (await readMetadata(userId))?.social?.display_tz;
  return { displayTz: isDisplayZone(tz) ? tz : DEFAULT_PREFS.displayTz };
}

/** Read-merge-write of the one key: the rest of metadata (and of metadata.social) is kept as it was. */
export async function savePrefs(userId: string, prefs: SocialPrefs): Promise<SocialPrefs> {
  const before = await readMetadata(userId);
  if (!before) throw new SocialStoreError(404, "no profile for this user");
  const metadata = { ...before, social: { ...(before.social ?? {}), display_tz: prefs.displayTz } };
  const { error } = await db().from("profiles").update({ metadata, updated_at: new Date().toISOString() }).eq("id", userId);
  if (error) throw new SocialStoreError(500, `prefs write failed: ${error.message}`);
  return prefs;
}
