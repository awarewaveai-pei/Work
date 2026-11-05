import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import { VALID_TOKEN_NAMES, isSafeTokenValue } from "@/lib/theme/tokens";
import { loadThemeConfig } from "@/lib/theme/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/internal/theme/css -- the saved app_theme overrides as one `:root{...}` block, for video-workbench
 * (video.aware-wave.com) to append after its bundled globals.css :root, so a theme saved on app applies there too.
 * Bearer = VW_INTERNAL_TOKEN; unset = 401. DB read failure = 503, never an empty 200. Values re-pass the same name/value gate POST /api/theme applies on save.
 */
export async function GET(req: Request): Promise<Response> {
  const expected = process.env.VW_INTERNAL_TOKEN;
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!expected || !bearer || !timingSafeEqual(bearer, expected)) return new Response("unauthorized", { status: 401 });
  let tokens: Record<string, string>;
  try { ({ tokens } = await loadThemeConfig()); } catch { return new Response("theme_read_failed", { status: 503 }); } // caller keeps its last good copy
  const decls = Object.entries(tokens)
    .filter(([name, value]) => VALID_TOKEN_NAMES.has(name) && typeof value === "string" && isSafeTokenValue(name, value))
    .map(([name, value]) => `${name}:${value};`);
  return new Response(`:root{${decls.join("")}}`, {
    headers: { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
