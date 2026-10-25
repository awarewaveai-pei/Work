// GET /api/ops/org-search — the client pickers' only data source (OrgPicker.tsx, the banner studio's brand picker).
// Returns PickOrg fields and nothing else: the pickers' tools (collect, outreach, design) must not see what
// GET /api/ops/clients returns (client_config holds SSH host / user / key name and the WordPress path).
// Never the whole table (every WordPress buyer is an organization): no q = the first NAV_FIRST by created_at plus
// `total`; ?q= = name or slug contains q, at most NAV_SEARCH_LIMIT rows; ?brandColors=1 = only clients with at least
// one valid hex brand colour.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { resolveOpsRole, canModifyIncidentStatus } from "@/lib/ops-role";
import { NAV_FIRST, NAV_SEARCH_LIMIT, toPickOrg } from "@/app/(shell)/ops/clients/nav-orgs";

export const dynamic = "force-dynamic";

/** Only these columns leave the table: never `metadata` whole (org-search.test.ts). */
export const ORG_SEARCH_COLUMNS = "id,slug,name,color:metadata->>color,brandColors:metadata->client_config->brandColors";

const BRAND = "metadata->client_config->brandColors";
const HEX = `"^#[0-9a-fA-F]{6}$"`;
const HAS_BRAND = ["primary", "secondary", "accent"].map((k) => `${BRAND}->>${k}.match.${HEX}`).join(",");

/** q as a PostgREST or() value: characters that end or wildcard a filter are dropped, then the value is quoted. */
const searchTerm = (q: string | null) => (q ?? "").replace(/[",()*%\\]/g, " ").trim().slice(0, 80);

export async function GET(request: Request) {
  const resolved = resolveOpsRole(request);
  if (!canModifyIncidentStatus(resolved.role) || resolved.source === "default_viewer") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });
  }

  const params = new URL(request.url).searchParams;
  const rawQ = params.get("q");
  const q = searchTerm(rawQ);
  // A search never returns the whole table: a q of only stripped characters matches nothing.
  if (rawQ !== null && !q) return NextResponse.json({ ok: true, orgs: [], total: 0 });

  let query = supabase
    .from("organizations")
    .select(ORG_SEARCH_COLUMNS, q ? undefined : { count: "exact" })
    .order("created_at", { ascending: true });
  if (params.get("brandColors") === "1") query = query.or(HAS_BRAND);
  // a second or() is ANDed with the first (postgrest-js appends the param)
  query = q ? query.or(`name.ilike."*${q}*",slug.ilike."*${q}*"`).limit(NAV_SEARCH_LIMIT) : query.limit(NAV_FIRST);
  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ ok: false, error: "org_search_failed", details: error.message }, { status: 500 });
  }
  const orgs = (data ?? []).map(toPickOrg);
  // total: every matching client (no q only; a search reports what it returned)
  return NextResponse.json({ ok: true, orgs, total: count ?? orgs.length });
}
