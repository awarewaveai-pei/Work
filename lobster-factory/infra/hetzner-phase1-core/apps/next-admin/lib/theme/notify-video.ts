/**
 * Card P6.16: after a theme save, tell video-workbench (POST /api/internal/theme/invalidate, Bearer VW_INTERNAL_TOKEN)
 * so the next theme.css it serves is the new one. Never throws and never fails the save: a missed notice is covered
 * by the workbench re-reading when a tab comes back (shared/theme.js) and its long cache ceiling.
 * VW_SERVICE_URL or VW_INTERNAL_TOKEN unset = no call (local dev). A workbench without the route answers 404: ignored.
 */
export async function notifyVideoThemeSaved(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const base = process.env.VW_SERVICE_URL?.trim().replace(/\/+$/, "");
  const token = process.env.VW_INTERNAL_TOKEN?.trim();
  if (!base || !token) return false;
  try {
    const res = await fetchImpl(`${base}/api/internal/theme/invalidate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) console.warn("[theme] video invalidate:", res.status);
    return res.ok;
  } catch (err) {
    console.warn("[theme] video invalidate:", err instanceof Error ? err.message : err);
    return false;
  }
}
