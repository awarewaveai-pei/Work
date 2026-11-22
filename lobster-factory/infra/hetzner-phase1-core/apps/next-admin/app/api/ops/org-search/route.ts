// GET /api/ops/org-search — the client pickers' only data source (OrgPicker.tsx, the banner studio's brand picker).
// Returns PickOrg fields and nothing else: the pickers' tools (collect, outreach, design) must not see what
// GET /api/ops/clients returns (client_config holds SSH host / user / key name and the WordPress path).
// Never the whole table (every WordPress buyer is an organization): no q = the first NAV_FIRST by created_at plus
// `total`; ?q= = name or slug contains q, at most NAV_SEARCH_LIMIT rows; ?brandColors=1 = only clients with at least
// one valid hex brand colour; ?include=<uuid> = that client is put first when the page would not have it.
// ?category=<ORG_CATEGORIES> (the client rail, U3): the first page of that category, each row with `tags`, plus
// `categories` (the buttons) and `internalOrgId` (「AwareWave 自己」, so a door's rail can draw it without reading the
// database itself). Without ?category= the answer is as before. Not combined with ?q=: a search covers every client.
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { resolveOpsRole, canModifyIncidentStatus } from "@/lib/ops-role";
import { NAV_FIRST, NAV_SEARCH_LIMIT, toPickOrg, type PickOrg } from "@/app/(shell)/ops/clients/nav-orgs";
import { orgNameFilter, orgSearchTerm } from "@/lib/org-search";
import { staffOnly } from "@/lib/tenant-guard";
// billingLedger reads with the service-role client itself (billing_ledger is granted to service_role only, 0148)
import { billingLedger, type BillingLedger, type LedgerFilter } from "@/lib/entitlements/tables";

export const dynamic = "force-dynamic";

/** Only these columns leave the table as PickOrg fields: never `metadata` whole (route.test.ts). kind and the parent
 *  decide the tags and the TEST filter; toPickOrg drops them. */
const ORG_SEARCH_COLUMNS = "id,slug,name,kind,parent_organization_id,color:metadata->>color,brandColors:metadata->client_config->brandColors";

const BRAND = "metadata->client_config->brandColors";
const HEX = `"^#[0-9a-fA-F]{6}$"`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HAS_BRAND = ["primary", "secondary", "accent"].map((k) => `${BRAND}->>${k}.match.${HEX}`).join(",");

/** The client rail's category buttons, in order: the one vocabulary (route.test.ts refuses any other value). Only what
 *  today's data can tell (blueprint §9.3): 需處理 / 訂閱 / 點數 are billing_ledger's own filters (the /ops/billing tabs,
 *  0148), TEST is organizations.kind (0175). 代操、經銷、買斷 wait for member tags (M3). TEST shows only under 測試.
 *  Not exported (a route file exports only handlers): the rail reads the list from the answer. */
const ORG_CATEGORIES = [
  { key: "all", label: "全部" },
  { key: "attention", label: "需處理" },
  { key: "contract", label: "訂閱" },
  { key: "credits", label: "點數" },
  { key: "test", label: "測試" },
] as const;
export type OrgCategory = (typeof ORG_CATEGORIES)[number]["key"];
/** A row's tag = a category it belongs to (never "all"). */
export type OrgTag = Exclude<OrgCategory, "all">;
export type TaggedOrg = PickOrg & { tags: OrgTag[] };

const LEDGER_FILTER: Readonly<Record<"attention" | "contract" | "credits", LedgerFilter>> = {
  attention: "attention", contract: "contract", credits: "balance",
};
/** billing_ledger's row limit (0148: least(p_limit, 200)): the billing accounts whose tags one answer can carry. */
const LEDGER_TAG_ROWS = 200;

type OrgRow = { id: string; slug: string; name?: string | null; kind?: string | null; parent_organization_id?: string | null; color?: unknown; brandColors?: unknown };
type LedgerRow = BillingLedger["rows"][number];

const isCategory = (v: string): v is OrgCategory => ORG_CATEGORIES.some((c) => c.key === v);

/** One billing account's tags, by the same rules as its /ops/billing row (reasons / contracts / balance). */
function ledgerTags(r: LedgerRow): OrgTag[] {
  const tags: OrgTag[] = [];
  if (r.reasons.length > 0) tags.push("attention");
  if (r.contracts.length > 0) tags.push("contract");
  if (r.balance > 0) tags.push("credits");
  return tags;
}

/** A row's tags: its billing account's (a brand bills to its root) plus TEST from its own kind. */
function tagsOf(row: OrgRow, byAccount: ReadonlyMap<string, OrgTag[]>): OrgTag[] {
  const tags = [...(byAccount.get(row.parent_organization_id ?? row.id) ?? [])];
  if (row.kind === "test") tags.push("test");
  return tags;
}

/** 全部 (every kind but TEST) or 測試 (TEST only): the first NAV_FIRST by age, with the count. */
function kindPage(supabase: SupabaseClient, test: boolean) {
  const query = supabase.from("organizations").select(ORG_SEARCH_COLUMNS, { count: "exact" })
    .neq("status", "inactive").order("created_at", { ascending: true }).limit(NAV_FIRST);
  return test ? query.eq("kind", "test") : query.neq("kind", "test");
}

async function categoryPage(supabase: SupabaseClient, category: OrgCategory, include: string | null) {
  // 「AwareWave 自己」: one bounded read, here rather than on a door's page (a door never reads with the service role).
  const internal = await supabase.from("organizations").select("id").eq("kind", "internal").is("parent_organization_id", null).limit(1).maybeSingle();
  const internalOrgId = (internal.data as { id: string } | null)?.id ?? null;

  let rows: OrgRow[];
  let total: number;
  let ledgerRows: LedgerRow[];
  let tagsFailed = false;
  if (category === "all" || category === "test") {
    const { data, error, count } = await kindPage(supabase, category === "test");
    if (error) return { error: error.message };
    rows = (data ?? []) as unknown as OrgRow[];
    total = count ?? rows.length;
    // Tags for this page from one ledger read: the first LEDGER_TAG_ROWS billing accounts by name (route.test.ts).
    try {
      ledgerRows = (await billingLedger({ filter: "all", query: "", limit: LEDGER_TAG_ROWS, offset: 0 })).rows;
    } catch {
      ledgerRows = [];
      tagsFailed = true;
    }
  } else {
    let ledger: BillingLedger;
    try {
      ledger = await billingLedger({ filter: LEDGER_FILTER[category], query: "", limit: NAV_FIRST, offset: 0 });
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
    // TEST shows only under 測試; the internal account is the rail's own row.
    ledgerRows = ledger.rows.filter((r) => r.kind === "customer");
    const ids = ledgerRows.map((r) => r.organization_id);
    const found = ids.length
      ? await supabase.from("organizations").select(ORG_SEARCH_COLUMNS).neq("status", "inactive").in("id", ids)
      : { data: [], error: null };
    if (found.error) return { error: found.error.message };
    const byId = new Map(((found.data ?? []) as unknown as OrgRow[]).map((r) => [r.id, r]));
    rows = ids.flatMap((id) => byId.get(id) ?? []);   // the ledger's order (by name)
    // exact when the whole category fits one page; otherwise the ledger's count less what this page dropped
    total = Math.max(rows.length, ledger.matching - (ledger.rows.length - rows.length));
  }

  if (include && UUID.test(include) && !rows.some((r) => r.id === include)) {
    const one = await supabase.from("organizations").select(ORG_SEARCH_COLUMNS).neq("status", "inactive").eq("id", include).maybeSingle();
    if (one.data) rows.unshift(one.data as unknown as OrgRow);
  }
  const byAccount = new Map(ledgerRows.map((r) => [r.organization_id, ledgerTags(r)]));
  const orgs: TaggedOrg[] = rows.map((r) => ({ ...toPickOrg(r), tags: tagsOf(r, byAccount) }));
  return { orgs, total, internalOrgId, tagsFailed };
}

export async function GET(request: Request) {
  // Every product door serves this route (doors.ts STAFF_DOOR_APIS); a customer's identity resolves to operator
  // (ops-role.ts), so the role check below alone would let one list every client: staff only, here as well as in middleware.
  const notStaff = staffOnly(request);
  if (notStaff) return notStaff;
  const resolved = resolveOpsRole(request);
  if (!canModifyIncidentStatus(resolved.role) || resolved.source === "default_viewer") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const rawCategory = params.get("category");
  const category = rawCategory !== null && isCategory(rawCategory) ? rawCategory : null;
  if (rawCategory !== null && category === null) {
    return NextResponse.json({ ok: false, error: "invalid_category" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });
  }

  const rawQ = params.get("q");
  if (category !== null && rawQ === null) {
    const page = await categoryPage(supabase, category, params.get("include"));
    if ("error" in page) {
      return NextResponse.json({ ok: false, error: "org_search_failed", details: page.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true, ...page, categories: ORG_CATEGORIES });
  }

  const q = orgSearchTerm(rawQ);
  // A search never returns the whole table: a q of only stripped characters matches nothing.
  if (rawQ !== null && !q) return NextResponse.json({ ok: true, orgs: [], total: 0 });

  let query = supabase
    .from("organizations")
    .select(ORG_SEARCH_COLUMNS, q ? undefined : { count: "exact" })
    .neq("status", "inactive")
    .order("created_at", { ascending: true });
  if (params.get("brandColors") === "1") query = query.or(HAS_BRAND);
  // a second or() is ANDed with the first (postgrest-js appends the param)
  query = q ? query.or(orgNameFilter(q)).limit(NAV_SEARCH_LIMIT) : query.limit(NAV_FIRST);
  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ ok: false, error: "org_search_failed", details: error.message }, { status: 500 });
  }
  const orgs = ((data ?? []) as unknown as OrgRow[]).map(toPickOrg);
  // ?include=<uuid>: the client named in the URL shows even when it is not in this page (same columns, first row).
  const include = params.get("include");
  if (include && UUID.test(include) && !orgs.some((o) => o.id === include)) {
    const one = await supabase.from("organizations").select(ORG_SEARCH_COLUMNS).neq("status", "inactive").eq("id", include).maybeSingle();
    if (one.data) orgs.unshift(toPickOrg(one.data as unknown as OrgRow));
  }
  // total: every matching client (no q only; a search reports what it returned)
  return NextResponse.json({ ok: true, orgs, total: count ?? orgs.length });
}
