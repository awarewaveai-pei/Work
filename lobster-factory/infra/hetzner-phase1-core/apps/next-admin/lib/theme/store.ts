// Server-side persistence for the global app theme (single shared row in Supabase).
// Read by app/layout.tsx (to render the saved look on every device, server-side,
// before paint) and app/api/theme route. Service-role client → bypasses RLS; the
// app_theme table is RLS-locked so only this server path can touch it. Requires
// SUPABASE_SERVICE_ROLE_KEY: without it the client degrades to anon (RLS-denied) → reads
// fail-open to globals.css defaults, writes fail-closed (500). The key is set in this stack.
import { unstable_cache, revalidateTag } from "next/cache";
import { getSupabaseServerClient, getSupabaseWriteClient } from "@/lib/supabase-server";
import type { SavedLayout } from "@/lib/theme/tokens";

export interface ThemeConfig {
  tokens: Record<string, string>;
  layout: SavedLayout | null;
}

const ROW_ID = "default";
const READ_TIMEOUT_MS = 3000;
const CACHE_TAG = "theme-config";

const EMPTY: ThemeConfig = { tokens: {}, layout: null };

// Throws on a failed read (no client, timeout, DB error) so the cache below never stores a
// failure as "no theme"; getThemeConfig turns the throw into fail-open defaults, uncached.
async function fetchThemeConfig(): Promise<ThemeConfig> {
  const sb = getSupabaseServerClient();
  if (!sb) throw new Error("supabase_unavailable");
  const query = sb.from("app_theme").select("tokens, layout").eq("id", ROW_ID).maybeSingle();
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), READ_TIMEOUT_MS));
  const res = (await Promise.race([query, timeout])) as
    | { data: { tokens?: unknown; layout?: unknown } | null; error?: unknown }
    | null;
  if (!res) throw new Error("theme_read_timeout");
  if (res.error) throw new Error("theme_read_failed");
  if (!res.data) return EMPTY; // no row saved yet: a real answer, safe to cache
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
}

// Cached version: results live in Next.js Data Cache until invalidated by revalidateThemeCache().
// This prevents every navigation from hitting Supabase — layout stays stable across page transitions.
const getCachedThemeConfig = unstable_cache(fetchThemeConfig, [CACHE_TAG], {
  tags: [CACHE_TAG],
  revalidate: 300, // 5-min background refresh as a safety net
});

/**
 * Read saved theme overrides + sidebar layout for the single global row.
 * FAIL-OPEN: any missing config / DB error / timeout returns empty overrides.
 * Result is cached in Next.js Data Cache; call revalidateThemeCache() after writes.
 */
export async function getThemeConfig(): Promise<ThemeConfig> {
  try {
    return await getCachedThemeConfig();
  } catch {
    return EMPTY;
  }
}

/** Invalidate the server-side cache after a successful save. */
export function revalidateThemeCache(): void {
  revalidateTag(CACHE_TAG);
}

/** Upsert the single global theme row. Throws on failure so the API returns 5xx. */
export async function saveThemeConfig(
  tokens: Record<string, string>,
  layout: SavedLayout | null,
): Promise<void> {
  const sb = getSupabaseWriteClient();
  if (!sb) throw new Error("supabase_unavailable");
  const { error } = await sb.from("app_theme").upsert({
    id: ROW_ID,
    tokens,
    layout,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}
