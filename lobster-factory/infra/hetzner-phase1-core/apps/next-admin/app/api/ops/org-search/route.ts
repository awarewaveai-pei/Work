// GET /api/ops/org-search — the client pickers' only data source (OrgPicker.tsx).
// Returns PickOrg fields and nothing else: the pickers' tools (collect, outreach, design) must not see what
// GET /api/ops/clients returns (client_config holds SSH host / user / key name and the WordPress path).
// Never the whole table (every WordPress buyer is an organization): no q = the first NAV_FIRST by created_at plus
// `total`; ?q= = name or slug contains q, at most NAV_SEARCH_LIMIT rows; ?include=<uuid> = that client is put first
// when the page would not have it.
// ?category=<ORG_CATEGORIES> (the client rail, U3): the first page of that category, each row with `tags`, plus
// `categories` (the buttons) and `internalOrgId` (「AwareWave 自己」, so a door's rail can draw it without reading the
// database itself). Without ?category= the first page is as before. A search (?q=) never returns TEST organizations
// (own or parent kind test) unless ?category=test.
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { resolveOpsRole, canModifyIncidentStatus } from "@/lib/ops-role";
import { NAV_FIRST, NAV_SEARCH_LIMIT, toPickOrg, type PickOrg } from "@/app/(shell)/ops/clients/nav-orgs";
import { orgNameFilter, orgSearchTerm } from "@/lib/org-search";
import { staffOnly } from "@/lib/tenant-guard";
import { organizationGroupId } from "@/lib/analytics-group";
// billingLedger reads with the service-role client itself (billing_ledger is granted to service_role only, 0148)
import { billingLedger, type BillingLedger } from "@/lib/entitlements/tables";
import { memberRole, memberTags, type MemberTags } from "@/lib/entitlements/member-tags";
import { readExtras, NO_EXTRAS, type Extras } from "@/lib/entitlements/member-tags-reads";

export const dynamic = "force-dynamic";

/** Only these columns leave the table as PickOrg fields: never `metadata` whole (route.test.ts). kind and the parent
 *  decide the tags and the TEST filter; toPickOrg drops them. */
const ORG_SEARCH_COLUMNS = "id,slug,name,kind,parent_organization_id,color:metadata->>color,brandColors:metadata->client_config->brandColors";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The client rail's category buttons, in order: the one vocabulary (route.test.ts refuses any other value). Only what
 *  today's data can tell (blueprint §9.3): 需處理 / 訂閱 / 點數 follow billing_ledger's own filters (the /ops/billing tabs,
 *  0148), TEST is organizations.kind (0175). 訂閱／點數／代操／經銷／贈送／TEST are the member-tags function's answer
 *  (lib/entitlements/member-tags.ts, M3); 代操 and 經銷 buttons are drawn only when some account has that tag. 買斷 is U35.
 *  TEST shows only under 測試. Not exported (a route file exports only handlers): the rail reads the list from the answer. */
const ORG_CATEGORIES = [
  { key: "all", label: "全部" },
  { key: "attention", label: "需處理" },
  { key: "contract", label: "訂閱" },
  { key: "credits", label: "點數" },
  { key: "operated", label: "代操" },
  { key: "resell", label: "經銷" },
  { key: "comp", label: "贈送" },
  { key: "test", label: "測試" },
] as const;
export type OrgCategory = (typeof ORG_CATEGORIES)[number]["key"];
/** A row's tag = a category it belongs to (never "all"). */
export type OrgTag = Exclude<OrgCategory, "all">;
export type TaggedOrg = PickOrg & { tags: OrgTag[] };   // + group, set by grouped()

/** A billing category = billing_ledger 'all' rows that pass the same rule as that RPC filter (0148: attention =
 *  reasons, contract = has_contract, balance = balance > 0), so one cached read answers all three and the tags. */
type BillingTag = "attention" | "contract" | "credits" | "operated" | "resell" | "comp";
/** billing_ledger's page size (0148: least(p_limit, 200)). */
const LEDGER_PAGE = 200;
/** Pages read before giving up on the rest (10 000 accounts); past it the answer says tagsPartial. */
const LEDGER_MAX_PAGES = 50;
/** How long one full ledger read is reused: it aggregates the whole credit ledger per page (0148). */
const LEDGER_TTL_MS = 60_000;
/** Most TEST organizations whose brands the TEST rule can hide (0175 marked two). */
const TEST_ORGS_MAX = 500;

type OrgRow = { id: string; slug: string; name?: string | null; kind?: string | null; parent_organization_id?: string | null; color?: unknown; brandColors?: unknown };
type LedgerRow = BillingLedger["rows"][number];
type Ledger = { rows: LedgerRow[]; partial: boolean };

/** Every row the route answers carries its analytics group id (staffOnly below: a customer never gets this answer). */
const grouped = <T extends { id: string }>(o: T): T & { group: string } => ({ ...o, group: organizationGroupId(o.id) });

const isCategory = (v: string): v is OrgCategory => ORG_CATEGORIES.some((c) => c.key === v);

// Module memory, per server process. Only a complete read is kept (a failure throws before the set); tests start a
// fresh module (vi.resetModules) -- a route file may export nothing but its handlers.
const ledgerCache = new Map<string, { at: number; ledger: Ledger }>();

/** Every billing account billing_ledger lists (mode 'all'), paged, reused for LEDGER_TTL_MS. */
async function allLedger(): Promise<Ledger> {
  const key = "all";
  const hit = ledgerCache.get(key);
  if (hit && Date.now() - hit.at < LEDGER_TTL_MS) return hit.ledger;
  const rows: LedgerRow[] = [];
  let partial = false;
  for (let page = 0; ; page++) {
    if (page === LEDGER_MAX_PAGES) { partial = true; break; }
    const got = await billingLedger({ filter: "all", query: "", limit: LEDGER_PAGE, offset: page * LEDGER_PAGE });
    rows.push(...got.rows);
    if (got.rows.length < LEDGER_PAGE || rows.length >= got.matching) break;
  }
  const ledger = { rows, partial };
  ledgerCache.set(key, { at: Date.now(), ledger });
  return ledger;
}

/** One billing account's member tags (M3): contracts and balance from its ledger row, operations and resell rights from the extra reads. */
function accountMemberTags(r: LedgerRow, extras: Extras): MemberTags {
  return memberTags({
    kind: r.kind, contracts: r.contracts, balance: r.balance,
    operations: extras.operations.get(r.organization_id) ?? [],
    entitlements: [...(extras.held.get(r.organization_id) ?? []), ...(extras.resell.get(r.organization_id) ?? [])],
  });
}
/** One billing account's tags: attention from its reasons (the /ops/billing rule), the rest from the member tags. */
function ledgerTags(r: LedgerRow, extras: Extras): BillingTag[] {
  const t = accountMemberTags(r, extras);
  const out: BillingTag[] = [];
  if (r.reasons.length > 0) out.push("attention");
  if (t.ways.includes("subscription")) out.push("contract");
  if (t.ways.includes("credits")) out.push("credits");
  if (t.ways.includes("operated")) out.push("operated");
  if (t.ways.includes("reseller")) out.push("resell");
  if (t.ways.includes("comp")) out.push("comp");
  return out;
}

/** TEST = an organization whose own kind is test or whose parent's is (a test unit's brands). One bounded read. */
async function testOrgIds(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase.from("organizations").select("id").eq("kind", "test").limit(TEST_ORGS_MAX);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
}

type Scoped<B> = { neq(column: string, value: string): B; eq(column: string, value: string): B; or(filters: string): B };
/** The one TEST rule, on any organizations query: "hide" = neither it nor its parent is test; "only" = one of them is.
 *  The list, its count and a search all go through it. */
function testScope<B extends Scoped<B>>(query: B, mode: "hide" | "only", testIds: readonly string[]): B {
  const ids = `(${testIds.join(",")})`;
  if (mode === "only") return testIds.length ? query.or(`kind.eq.test,parent_organization_id.in.${ids}`) : query.eq("kind", "test");
  const own = query.neq("kind", "test");
  // `not in` alone would drop every root: NULL NOT IN (...) is null, not true
  return testIds.length ? own.or(`parent_organization_id.is.null,parent_organization_id.not.in.${ids}`) : own;
}

const isTest = (r: OrgRow, testIds: readonly string[]) =>
  memberRole(r.kind === "internal" ? "internal" : r.kind === "test" ? "test" : "customer", r.parent_organization_id != null && testIds.includes(r.parent_organization_id) ? "test" : null) === "TEST";

/** 全部 or 測試: the first NAV_FIRST by age, and the count of the same query. */
function kindPage(supabase: SupabaseClient, test: boolean, testIds: readonly string[]) {
  const query = supabase.from("organizations").select(ORG_SEARCH_COLUMNS, { count: "exact" })
    .neq("status", "inactive").order("created_at", { ascending: true }).limit(NAV_FIRST);
  return testScope(query, test ? "only" : "hide", testIds);
}

/** The organizations rows of these billing accounts that the list shows (active, not TEST), in the given order. */
async function ledgerOrgs(supabase: SupabaseClient, ids: string[], testIds: readonly string[]): Promise<OrgRow[]> {
  const byId = new Map<string, OrgRow>();
  for (let i = 0; i < ids.length; i += LEDGER_PAGE) {
    const chunk = supabase.from("organizations").select(ORG_SEARCH_COLUMNS).neq("status", "inactive").in("id", ids.slice(i, i + LEDGER_PAGE));
    const { data, error } = await testScope(chunk, "hide", testIds);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as unknown as OrgRow[]) byId.set(r.id, r);
  }
  return ids.flatMap((id) => byId.get(id) ?? []);
}

async function categoryPage(supabase: SupabaseClient, category: OrgCategory, include: string | null) {
  // 「AwareWave 自己」: one bounded read, here rather than on a door's page (a door never reads with the service role).
  const internal = await supabase.from("organizations").select("id").eq("kind", "internal").is("parent_organization_id", null).limit(1).maybeSingle();
  const internalOrgId = (internal.data as { id: string } | null)?.id ?? null;
  const internalOrgFailed = Boolean(internal.error);

  let testIds: string[];
  try { testIds = await testOrgIds(supabase); } catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }

  let rows: OrgRow[];
  let total: number;
  let ledger: Ledger;
  let extras: Extras = NO_EXTRAS;
  let tagsFailed = false;
  if (category === "all" || category === "test") {
    const { data, error, count } = await kindPage(supabase, category === "test", testIds);
    if (error) return { error: error.message };
    rows = (data ?? []) as unknown as OrgRow[];
    total = count ?? rows.length;
    try { ledger = await allLedger(); } catch { ledger = { rows: [], partial: false }; tagsFailed = true; }
    if (!tagsFailed) { const x = await readExtras(supabase); extras = x.extras; tagsFailed = x.failed; }
  } else {
    try {
      ledger = await allLedger();
      const x = await readExtras(supabase);
      extras = x.extras; tagsFailed = x.failed;
      // the internal account is the rail's own row; TEST shows only under 測試 (ledger rows are root accounts)
      const ids = ledger.rows.filter((r) => r.kind === "customer" && ledgerTags(r, extras).includes(category)).map((r) => r.organization_id);
      const all = await ledgerOrgs(supabase, ids, testIds);
      rows = all.slice(0, NAV_FIRST);
      total = all.length;   // the same rows the list is cut from
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }

  if (include && UUID.test(include) && !rows.some((r) => r.id === include)) {
    const one = await supabase.from("organizations").select(ORG_SEARCH_COLUMNS).neq("status", "inactive").eq("id", include).maybeSingle();
    if (one.data) rows.unshift(one.data as unknown as OrgRow);
  }
  const byAccount = new Map(ledger.rows.map((r) => [r.organization_id, ledgerTags(r, extras)]));
  const orgs: TaggedOrg[] = rows.map((r) => ({
    ...grouped(toPickOrg(r)),
    tags: [...(byAccount.get(r.parent_organization_id ?? r.id) ?? []), ...(isTest(r, testIds) ? ["test" as const] : [])],
  }));
  // a button is drawn only when the data can fill it (代操 / 經銷 start empty); the others are always there
  const present = new Set<string>(ledger.rows.filter((r) => r.kind === "customer").flatMap((r) => ledgerTags(r, extras)));
  const categories = ORG_CATEGORIES.filter((c) => (c.key !== "operated" && c.key !== "resell" && c.key !== "comp") || present.has(c.key));
  // tagsPartial: accounts past LEDGER_MAX_PAGES have no billing tags and are missing from 需處理／訂閱／點數
  // internalGroup: the internal org's own hash, so 「AwareWave 自己」 has a group even when the first page lacks its row
  const internalGroup = internalOrgId ? organizationGroupId(internalOrgId) : null;
  return { orgs, total, internalOrgId, internalGroup, internalOrgFailed, tagsFailed, tagsPartial: ledger.partial || extras.partial, categories };
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
    return NextResponse.json({ ok: true, ...page });
  }

  const q = orgSearchTerm(rawQ);
  // A search never returns the whole table: a q of only stripped characters matches nothing.
  if (rawQ !== null && !q) return NextResponse.json({ ok: true, orgs: [], total: 0 });

  // A search hides TEST like the rail's list does; it finds TEST only with ?category=test.
  let testIds: string[] = [];
  if (q) {
    try { testIds = await testOrgIds(supabase); } catch (e) {
      return NextResponse.json({ ok: false, error: "org_search_failed", details: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
  }

  let query = supabase
    .from("organizations")
    .select(ORG_SEARCH_COLUMNS, q ? undefined : { count: "exact" })
    .neq("status", "inactive")
    .order("created_at", { ascending: true });
  query = q ? query.or(orgNameFilter(q)).limit(NAV_SEARCH_LIMIT) : query.limit(NAV_FIRST);
  if (q) query = testScope(query, category === "test" ? "only" : "hide", testIds);
  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ ok: false, error: "org_search_failed", details: error.message }, { status: 500 });
  }
  const orgs = ((data ?? []) as unknown as OrgRow[]).map((r) => grouped(toPickOrg(r)));
  // ?include=<uuid>: the client named in the URL shows even when it is not in this page (same columns, first row).
  const include = params.get("include");
  if (include && UUID.test(include) && !orgs.some((o) => o.id === include)) {
    const one = await supabase.from("organizations").select(ORG_SEARCH_COLUMNS).neq("status", "inactive").eq("id", include).maybeSingle();
    if (one.data) orgs.unshift(grouped(toPickOrg(one.data as unknown as OrgRow)));
  }
  // total: every matching client (no q only; a search reports what it returned)
  return NextResponse.json({ ok: true, orgs, total: count ?? orgs.length });
}
