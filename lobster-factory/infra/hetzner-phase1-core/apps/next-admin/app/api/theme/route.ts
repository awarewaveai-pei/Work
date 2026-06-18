/**
 * GET  /api/theme  → { tokens: Record<string, string> }
 *   Returns the default token values baked into globals.css at build time.
 *   Theme overrides are stored client-side in localStorage ('aw-theme-overrides')
 *   and applied before paint via an inline <script> in layout.tsx.
 *
 * POST /api/theme  { tokens: Record<string, string> } → { ok: true }
 *   Validates token names/values and returns ok.
 *   Actual persistence is handled by the theme editor writing to localStorage.
 *   (Next.js standalone mode does not have the source globals.css at runtime,
 *    so server-side CSS file writes are not possible without a volume mount.)
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Default token values — mirrors the :root block in globals.css.
// These are what GET returns so the theme editor starts from the right baseline.
const DEFAULT_TOKENS: Record<string, string> = {
  "--accent":            "#6366f1",
  "--accent-hover":      "#818cf8",
  "--btn-primary-bg":    "#6366f1",
  "--btn-primary-hover": "#4f52e0",
  "--btn-primary-text":  "#ffffff",
  "--body-bg":           "#f2f5fb",
  "--card-bg":           "#ffffff",
  "--bg-subtle":         "#f5f7fd",
  "--bg-hover":          "#eef1f9",
  "--surface-2":         "#f5f7fd",
  "--sidebar-bg":        "#f7f9fc",
  "--sidebar-border":    "#e6eaf4",
  "--sidebar-text":      "#475569",
  "--sidebar-text-hover":  "#0d1526",
  "--sidebar-text-active": "#0d1526",
  "--sidebar-active-bar":  "#6366f1",
  "--text-primary":      "#0d1526",
  "--text-muted":        "#64748b",
  "--text-secondary":    "#64748b",
  "--green":             "#10b981",
  "--red":               "#ef4444",
  "--yellow":            "#f59e0b",
  "--severity-critical": "#dc2626",
  "--severity-high":     "#ea580c",
  "--severity-medium":   "#ca8a04",
  "--severity-low":      "#0284c7",
  "--status-resolved":   "#16a34a",
  "--status-ignored":    "#6b7280",
  "--card-border":       "#e6eaf4",
  "--border":            "#e6eaf4",
  "--border-subtle":     "#e6eaf4",
  "--radius":            "12px",
  "--radius-sm":         "8px",
  "--code-bg":           "#07101f",
  "--ai-bg":             "#e0f2fe",
  "--ai-text":           "#0369a1",
  "--btn-secondary-bg":     "#ffffff",
  "--btn-secondary-border": "#d4d9e8",
  "--btn-secondary-text":   "#0d1526",
  // Typography
  "--font-size-xs":   "11px",
  "--font-size-sm":   "13px",
  "--font-size-base": "14px",
  "--font-size-md":   "15px",
  "--font-size-lg":   "17px",
  "--font-size-xl":   "22px",
  "--font-weight-normal":   "400",
  "--font-weight-medium":   "500",
  "--font-weight-semibold": "600",
  "--font-weight-bold":     "700",
  "--font-weight-heavy":    "800",
  "--line-height-base":     "1.6",
  "--line-height-tight":    "1.3",
  "--letter-spacing-label": "0.07em",
  // Tab component
  "--tab-font-size":     "14px",
  "--tab-font-weight":   "600",
  "--tab-color":         "#64748b",
  "--tab-color-hover":   "#0d1526",
  "--tab-color-active":  "#6366f1",
  "--tab-bg":            "transparent",
  "--tab-bg-hover":      "rgba(99,102,241,0.05)",
  "--tab-bg-active":     "transparent",
  "--tab-border-active": "#6366f1",
  "--tab-bar-border":    "#e6eaf4",
};

// Only accept safe CSS values (no injection vectors).
const SAFE_VALUE_RE =
  /^(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|[0-9]+(\.[0-9]+)?(px|em|rem|%|vh|vw|dvh|dvw|s|ms)?|0|inherit|transparent|[a-z][\w-]*)$/;

export async function GET() {
  return NextResponse.json({ tokens: DEFAULT_TOKENS });
}

export async function POST(req: Request) {
  let body: { tokens?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const incoming = body?.tokens;
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
    return NextResponse.json({ ok: false, error: "tokens_required" }, { status: 400 });
  }

  // Validate names and values.
  for (const [name, value] of Object.entries(incoming)) {
    if (!/^--[\w-]+$/.test(name)) {
      return NextResponse.json({ ok: false, error: `invalid_token_name: ${name}` }, { status: 400 });
    }
    if (typeof value !== "string" || !SAFE_VALUE_RE.test(value.trim())) {
      return NextResponse.json({ ok: false, error: `unsafe_value for ${name}: ${value}` }, { status: 400 });
    }
  }

  // Persistence is handled by the theme editor writing to localStorage.
  // The inline script in layout.tsx applies those values before first paint.
  return NextResponse.json({ ok: true, updated: Object.keys(incoming).length });
}
