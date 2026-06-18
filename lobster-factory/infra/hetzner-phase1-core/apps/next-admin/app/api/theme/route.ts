/**
 * GET  /api/theme  → { tokens: Record<string, string> }
 *   Parse the :root block in app/globals.css, return all CSS variable values.
 *
 * POST /api/theme  { tokens: Record<string, string> } → { ok: true }
 *   Update the values of existing tokens in :root; will not add new tokens or
 *   inject arbitrary CSS. Only accepts safe value formats (hex, rgb, rgba,
 *   number+unit, 0, or CSS named colors).
 *
 * Auth: Bearer OPS_INBOX_INGEST_TOKEN (same as other ops APIs).
 */

import { NextResponse } from "next/server";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GLOBALS_PATH = join(process.cwd(), "app", "globals.css");

// Only allow values that look like CSS colour / spacing values (no quotes, no
// arbitrary expressions that could be used for injection).
const SAFE_VALUE_RE =
  /^(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|[0-9]+(\.[0-9]+)?(px|em|rem|%|vh|vw|dvh|dvw)?|0|inherit|transparent)$/;

function verifyBearer(req: Request): boolean {
  const expected = process.env.OPS_INBOX_INGEST_TOKEN;
  if (!expected) return false;
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] === expected : false;
}

function parseRootTokens(css: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  // Match the :root { ... } block (non-greedy, handles nested content)
  const rootMatch = css.match(/:root\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/s);
  if (!rootMatch) return tokens;
  const body = rootMatch[1];
  // Match lines like:  --token-name: value;
  const lineRe = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(body)) !== null) {
    tokens[m[1].trim()] = m[2].trim();
  }
  return tokens;
}

export async function GET() {
  try {
    const css = readFileSync(GLOBALS_PATH, "utf-8");
    const tokens = parseRootTokens(css);
    return NextResponse.json({ tokens });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!verifyBearer(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

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

  // Validate all incoming tokens before touching the file.
  for (const [name, value] of Object.entries(incoming)) {
    if (!/^--[\w-]+$/.test(name)) {
      return NextResponse.json({ ok: false, error: `invalid_token_name: ${name}` }, { status: 400 });
    }
    if (typeof value !== "string" || !SAFE_VALUE_RE.test(value.trim())) {
      return NextResponse.json({ ok: false, error: `unsafe_value for ${name}: ${value}` }, { status: 400 });
    }
  }

  // Read current CSS, parse existing tokens, reject unknown names.
  let css: string;
  try {
    css = readFileSync(GLOBALS_PATH, "utf-8");
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }

  const existingTokens = parseRootTokens(css);
  const unknownNames = Object.keys(incoming).filter(k => !(k in existingTokens));
  if (unknownNames.length > 0) {
    return NextResponse.json(
      { ok: false, error: `unknown_tokens: ${unknownNames.join(", ")}` },
      { status: 400 },
    );
  }

  // Apply updates: replace each `--token-name: old-value;` line precisely.
  let updated = css;
  for (const [name, value] of Object.entries(incoming)) {
    const safeValue = (value as string).trim();
    // Replace `name: anything;` within the CSS — safe because name is validated above.
    const re = new RegExp(`(${name.replace(/[-]/g, "\\-")}\\s*:\\s*)[^;]+(;)`, "g");
    updated = updated.replace(re, `$1${safeValue}$2`);
  }

  try {
    writeFileSync(GLOBALS_PATH, updated, "utf-8");
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated: Object.keys(incoming).length });
}
