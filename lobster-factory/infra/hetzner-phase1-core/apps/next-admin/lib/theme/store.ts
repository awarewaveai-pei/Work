// Server-side persistence for the global app theme (single shared row in Supabase).
// Read by app/layout.tsx (to render the saved look on every device, server-side,
// before paint) and app/api/theme route. Service-role client → bypasses RLS; the
// app_theme table is RLS-locked so only this server path can touch it.
import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { SavedLayout } from "@/lib/theme/tokens";

export interface ThemeConfig {
  tokens: Record<string, string>;
  layout: SavedLayout | null;
}

const ROW_ID = "default";
const READ_TIMEOUT_MS = 1500;

const EMPTY: ThemeConfig = { tokens: {}, layout: null };

/**
 * Read saved theme overrides + sidebar layout for the single global row.
 * FAIL-OPEN: any missing config / DB error / timeout returns empty overrides, so
 * the app falls back to the globals.css defaults and rendering is NEVER blocked
 * or broken by a DB hiccup.
 */
export async function getThemeConfig(): Promise<ThemeConfig> {
  try {
    const sb = getSupabaseServerClient();
    if (!sb) return EMPTY;
    const query = sb.from("app_theme").select("tokens, layout").eq("id", ROW_ID).maybeSingle();
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), READ_TIMEOUT_MS));
    const res = (await Promise.race([query, timeout])) as
      | { data: { tokens?: unknown; layout?: unknown } | null; error?: unknown }
      | null;
    if (!res || res.error || !res.data) return EMPTY;
    const rawTokens = res.data.tokens;
    const rawLayout = res.data.layout;
    const tokens =
      rawTokens && typeof rawTokens === "object" && !Array.isArray(rawTokens)
        ? (rawTokens as Record<string, string>)
        : {};
    const layout =
      rawLayout && typeof rawLayout === "object" && !Array.isArray(rawLayout)
        ? (rawLayout as SavedLayout)
        : null;
    return { tokens, layout };
  } catch {
    return EMPTY;
  }
}

/** Upsert the single global theme row. Throws on failure so the API returns 5xx. */
export async function saveThemeConfig(
  tokens: Record<string, string>,
  layout: SavedLayout | null,
): Promise<void> {
  const sb = getSupabaseServerClient();
  if (!sb) throw new Error("supabase_unavailable");
  const { error } = await sb.from("app_theme").upsert({
    id: ROW_ID,
    tokens,
    layout,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}
