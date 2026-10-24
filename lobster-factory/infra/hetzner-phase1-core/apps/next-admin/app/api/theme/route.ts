/**
 * GET  /api/theme  → { tokens: Record<string,string>, layout: SavedLayout | null }
 *   tokens = globals.css defaults merged with the saved global overrides (server-side).
 *
 * POST /api/theme  { tokens, layout } → { ok: true, updated }
 *   owner/admin only. Validates token names+values, stores ONLY overrides (diffs vs default)
 *   + the sidebar layout in the single global app_theme row. layout.tsx reads it back so the
 *   look applies on every device before paint. (Single source of truth — no localStorage.)
 */
import { NextResponse } from "next/server";
import { resolveOpsRole, canWriteTenantConfig } from "../../../lib/ops-role";
import { DEFAULT_TOKENS, VALID_TOKEN_NAMES, isSafeTokenValue, type SavedLayout } from "../../../lib/theme/tokens";
import { getThemeConfig, saveThemeConfig, revalidateThemeCache } from "../../../lib/theme/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const saved = await getThemeConfig();
  return NextResponse.json({
    tokens: { ...DEFAULT_TOKENS, ...saved.tokens },
    layout: saved.layout,
  });
}

function validateLayout(input: unknown): SavedLayout | null {
  if (input == null || typeof input !== "object" || Array.isArray(input)) return null;
  const obj = input as Record<string, unknown>;
  const out: SavedLayout = {};
  if (Array.isArray(obj.sectionOrder) && obj.sectionOrder.every((s) => typeof s === "string")) {
    out.sectionOrder = obj.sectionOrder as string[];
  }
  if (obj.itemOrders && typeof obj.itemOrders === "object" && !Array.isArray(obj.itemOrders)) {
    const io: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(obj.itemOrders as Record<string, unknown>)) {
      if (Array.isArray(v) && v.every((x) => typeof x === "string")) io[k] = v as string[];
    }
    out.itemOrders = io;
  }
  return Object.keys(out).length ? out : null;
}

export async function POST(req: Request) {
  const { role } = resolveOpsRole(req);
  if (!canWriteTenantConfig(role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role }, { status: 403 });
  }

  let body: { tokens?: Record<string, unknown>; layout?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const incoming = body?.tokens ?? {};
  if (typeof incoming !== "object" || Array.isArray(incoming)) {
    return NextResponse.json({ ok: false, error: "tokens_required" }, { status: 400 });
  }

  // Defence-in-depth: only known token names, only safe values, store only true overrides.
  const tokens: Record<string, string> = {};
  for (const [name, value] of Object.entries(incoming)) {
    if (!VALID_TOKEN_NAMES.has(name)) {
      return NextResponse.json({ ok: false, error: `unknown_token: ${name}` }, { status: 400 });
    }
    if (typeof value !== "string" || !isSafeTokenValue(name, value.trim())) {
      return NextResponse.json({ ok: false, error: `unsafe_value for ${name}` }, { status: 400 });
    }
    if (value.trim() !== DEFAULT_TOKENS[name]) tokens[name] = value.trim();
  }

  const layout = validateLayout(body?.layout);

  try {
    await saveThemeConfig(tokens, layout);
    revalidateThemeCache();
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "save_failed" },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, updated: Object.keys(tokens).length });
}
