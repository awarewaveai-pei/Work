// POST /api/internal/systems/ingest
//
// Called once a day by the host importer (scripts/systems-import.py, cron 04:30 台灣) with the registry at HEAD, the run
// summary and the commit events (contract: agency-os/handoffs/2026-11-21-systems-control-center/briefs/COMMON.md 契約 2).
// Own bearer token (SYSTEMS_INGEST_TOKEN), never a shared one (one leaked token must not forge others); unset = 401 for all.
// Writes only migration 0174's tables: registry upsert by id, events insert-or-skip by event_key, so a resent run
// changes nothing. A body that breaks the contract is a 400 and writes nothing; a store failure is a 500 and the next
// run sends the same events again. Status_change / review never come through here (the page writes them, source=user).

import { NextResponse } from "next/server";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { MAX_BODY_BYTES, parseIngest } from "@/lib/systems/contract";
import { verifySystemsToken } from "@/lib/systems/ingest-token";
import { ingest } from "@/lib/systems/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  if (!verifySystemsToken(request)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return NextResponse.json({ ok: false, error: "body_too_large" }, { status: 413 });
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) return NextResponse.json({ ok: false, error: "body_too_large" }, { status: 413 });

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const parsed = parseIngest(raw);
  if ("error" in parsed) return NextResponse.json({ ok: false, error: parsed.error.slice(0, 300) }, { status: 400 });

  const sb = getSupabaseWriteClient();
  if (!sb) return NextResponse.json({ ok: false, error: "no_supabase_client" }, { status: 500 });
  try {
    const r = await ingest(sb, parsed.body);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    const error = String(e instanceof Error ? e.message : e).slice(0, 300);
    console.error(`[systems/ingest] ${error}`);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
