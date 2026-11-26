// /ops/systems/blocks -- LEGO 積木目錄 (lib/systems/blocks.ts), three tabs (links, ?view=): 系統用了哪些積木 (one card per
// system: status, completion, blocks per layer -- wraps, never scrolls sideways), 積木清單 (numbered, filterable), 圖解.
// Owner / admin only. Catalog = code (always renders); names / progress = the 總控中心 projection (may fail, catalog stays).
import Link from "next/link";
import { headers } from "next/headers";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { systemsAccess } from "@/lib/systems/access";
import { BLOCK_LAYERS, BLOCK_STATUS, LEGO_BLOCKS, NOT_IN_CATALOG, PENDING, SHARED_TOOLS, TIERS, blockHref, blockStats, blocksForSystem, catalogHref, isLive, type BlockLayer, type CatalogGroup, type CatalogView, type LegoBlock, type PendingRow, type ScanRow, type Tier } from "@/lib/systems/blocks";
import { overviewGroup, projectAll, type OverviewGroup, type SystemOverviewRow } from "@/lib/systems/overview";
import { readDefinitions, readProjectionInput } from "@/lib/systems/store";
import { AddSystemForm, HEADER_CSS, Progress, Refused, StatusBadge, SystemsHeader, box, errorBox, muted, page, panel, panelBody, panelHead, smallBtn } from "../parts";

export const dynamic = "force-dynamic";
export const metadata = { title: "LEGO 積木目錄 · Ops" };

const VIEWS: Array<[CatalogView, string]> = [["systems", "系統用了哪些積木"], ["blocks", "積木清單"], ["diagram", "圖解"]];
type View = CatalogView;
type Sp = { view?: string | string[]; grp?: string | string[]; tier?: string | string[]; layer?: string | string[]; sys?: string | string[]; q?: string | string[]; shared?: string | string[] };
type Filters = { view: View; grp: CatalogGroup | null; tier: Tier; layer: BlockLayer | null; sys: string; q: string; shared: boolean };
type Patch = { [K in keyof Filters]?: Filters[K] | null };
type SysRow = { slug: string; sys: SystemOverviewRow | undefined; blocks: LegoBlock[]; modules: LegoBlock[]; grp: OverviewGroup | null };
/** 狀態三類與總控中心統計卡同一套（overviewGroup）；「沒用積木」獨立看，不搶狀態類的數字 */
const inGroup = (r: SysRow, g: CatalogGroup) => (g === "none" ? r.blocks.length + r.modules.length === 0 : r.grp === g);
const GROUPS: Array<[CatalogGroup, string]> = [["active", "開發中"], ["attention", "待確認"], ["wrapped", "維護與已完成"], ["none", "沒用積木"]];
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** URL for the current filters with `patch` applied (null = drop that filter). */
function hrefOf(f: Filters, patch: Patch = {}): string {
  const m = { ...f, ...patch };
  return catalogHref({ view: m.view ?? "systems", grp: m.grp, tier: m.tier ?? "block", layer: m.layer, sys: m.sys || null, q: m.q || null, shared: !!m.shared });
}
/** Filter buttons: the selected one is primary and announced as current. */
const pick = (on: boolean) => ({ className: on ? "btn-primary" : "btn-secondary", "aria-current": on ? ("true" as const) : undefined });

/** Text with catalog numbers (B-021, M-05, C-07) turned into links to that card. */
function Linked({ text }: { text: string }) {
  return <>{text.split(/\b([BMC]-\d{2,3})\b/).map((part, i) => { const h = i % 2 ? blockHref(part) : null; return h ? <Link key={i} href={h}>{part}</Link> : part; })}</>;
}

const CSS = `
.lg-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:18px}
.lg-stat{display:block;padding:14px 16px;text-decoration:none;color:inherit}
.lg-stat:hover{border-color:var(--accent)}
.lg-stat-v{font-size:26px;font-weight:800;color:var(--text-primary);margin:4px 0}
.lg-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px}
.lg-sys{display:grid;grid-template-columns:minmax(0,1fr) 170px;gap:6px 20px;padding:14px 18px;border-bottom:1px solid var(--card-border)}
.lg-sys:last-child{border-bottom:none}
.lg-sys-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
.lg-layers{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.lg-layer{display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:3px 10px;border-radius:99px;color:var(--text-primary);text-decoration:none;border:1px solid var(--card-border)}
.lg-layer b{font-weight:800}
.lg-layer:hover{border-color:var(--accent)}
.lg-band{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:9px 12px;border-radius:8px;border:1px solid var(--card-border);text-decoration:none;color:var(--text-primary);font-size:13px}
.lg-band:hover{border-color:var(--accent)}
.lg-arrow{text-align:center;font-size:11px;color:var(--text-muted);line-height:18px}
.lg-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.lg-card{padding:14px 16px;border:1px solid var(--card-border);border-radius:var(--radius);background:var(--card-bg);min-width:0}
.lg-no{font-family:var(--font-mono,ui-monospace,monospace);font-size:12px;font-weight:800;color:var(--accent-text);background:var(--accent-light);padding:2px 7px;border-radius:6px}
.lg-chip{display:inline-block;font-size:11px;padding:2px 8px;border-radius:99px;border:1px solid var(--card-border);color:var(--text-secondary);text-decoration:none;margin:0 4px 4px 0}
.lg-chip:hover{border-color:var(--accent);color:var(--accent-text)}
.lg-files code{display:block;font-size:11px;word-break:break-all;color:var(--text-secondary)}
@media (max-width:760px){.lg-stats{gap:8px}.lg-stat{padding:10px 12px}.lg-stat-v{font-size:20px;margin:2px 0 0}.lg-stat-h{display:none}.lg-grid{grid-template-columns:minmax(0,1fr)}.lg-sys{grid-template-columns:minmax(0,1fr)}.sys-page{padding:20px 16px!important}}
`;

/** A stat card that opens the blocks it counts. On a phone: title + number only, three in a row, so the tabs stay on the first screen. */
function Stat({ title, value, hint, href }: { title: string; value: number; hint: string; href: string }) {
  return (
    <Link href={href} className="card lg-stat">
      <div className="card-label">{title}</div>
      <div className="lg-stat-v">{value}</div>
      <div className="lg-stat-h" style={muted}>{hint}</div>
    </Link>
  );
}

/** One card per system: name, status, completion, then its blocks per layer as wrapping chips (stronger = more blocks). */
function SystemsView({ rows, f, nameOf }: { rows: SysRow[]; f: Filters; nameOf: (s: string) => string }) {
  const max = Math.max(1, ...rows.flatMap((r) => BLOCK_LAYERS.map((l) => r.blocks.filter((b) => b.layer === l.key).length)));
  const shown = f.grp ? rows.filter((r) => inGroup(r, f.grp as CatalogGroup)) : rows;
  return (
    <section style={panel}>
      <div style={panelHead}><div style={muted}>每個系統的狀態、完成度、用到的積木與產品模組；點標籤看是哪幾顆</div></div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "12px 18px", borderBottom: "1px solid var(--card-border)" }}>
        <Link href={hrefOf(f, { grp: null })} {...pick(!f.grp)} style={smallBtn}>全部 {rows.length}</Link>
        {GROUPS.map(([g, label]) => (
          <Link key={g} href={hrefOf(f, { grp: g })} {...pick(f.grp === g)} style={smallBtn}>{label} {rows.filter((r) => inGroup(r, g)).length}</Link>
        ))}
      </div>
      {shown.length === 0 && <div style={{ ...muted, padding: "24px 18px", textAlign: "center" }}>這一類沒有系統</div>}
      {shown.map(({ slug, sys, blocks, modules }) => (
        <div key={slug} className="lg-sys">
          <div style={{ minWidth: 0 }}>
            <div className="lg-sys-head">
              {sys ? <Link href={`/ops/systems/${slug}`} style={{ color: "var(--text-primary)", fontWeight: 800, fontSize: 14, textDecoration: "none" }}>{nameOf(slug)}</Link> : <strong style={{ fontSize: 14 }}>{slug}</strong>}
              {sys && <StatusBadge eff={sys.eff} />}
              <span style={muted}>用 {blocks.length} 顆積木{modules.length ? `・${modules.length} 個產品模組` : ""}</span>
            </div>
            {blocks.length + modules.length === 0 && <div style={{ ...muted, marginTop: 8 }}>{NOT_IN_CATALOG}</div>}
            {blocks.length > 0 && (
              <>
                <div className="lg-layers">
                  {BLOCK_LAYERS.map((l) => {
                    const n = blocks.filter((b) => b.layer === l.key).length;
                    if (!n) return null;
                    return (
                      <Link key={l.key} href={hrefOf(f, { view: "blocks", tier: null, sys: slug, layer: l.key, q: null })} className="lg-layer"
                        style={{ background: `color-mix(in srgb, var(--accent) ${Math.round(8 + (n / max) * 30)}%, transparent)` }} title={`${nameOf(slug)} 用 ${n} 顆${l.name}積木`}>
                        {l.name}<b>{n}</b>
                      </Link>
                    );
                  })}
                </div>
                <details style={{ marginTop: 8 }}>
                  <summary style={{ ...muted, cursor: "pointer" }}>看全部 {blocks.length} 顆</summary>
                  <div style={{ marginTop: 6 }}>{blocks.map((b) => <Link key={b.no} href={blockHref(b.no) ?? "#"} className="lg-chip">{b.no} {b.name}</Link>)}</div>
                </details>
              </>
            )}
            {modules.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <span style={{ ...muted, marginRight: 6 }}>產品模組</span>
                {modules.map((m) => <Link key={m.no} href={blockHref(m.no) ?? "#"} className="lg-chip">{m.no} {m.name}</Link>)}
              </div>
            )}
          </div>
          <div style={{ alignSelf: "center" }}>{sys ? <Progress p={sys.p} /> : <span style={muted}>沒有進度資料</span>}</div>
        </div>
      ))}
    </section>
  );
}

/** Who stands on whom: systems ← product modules ← block layers (top = what the user touches, bottom = shared base). */
function DiagramView({ systems, f }: { systems: number; f: Filters }) {
  const live = LEGO_BLOCKS.filter((b) => b.tier === "block" && isLive(b));
  const methods = LEGO_BLOCKS.filter((b) => b.tier === "method");
  const band = (href: string, label: string, n: string, hint: string, strong = false) => (
    <Link href={href} className="lg-band" style={{ background: strong ? "var(--accent-light)" : "var(--bg-subtle)" }}>
      <span><span style={{ fontWeight: 700 }}>{label}</span><span style={{ ...muted, marginLeft: 8 }}>{hint}</span></span><span style={muted}>{n}</span>
    </Link>
  );
  const blocksHref = (patch: Patch) => hrefOf(f, { view: "blocks", sys: null, q: null, layer: null, tier: null, shared: null, ...patch });
  return (
    <section style={{ ...panel, maxWidth: 720 }}>
      <div style={panelHead}><div style={muted}>積木怎麼疊起來：上層用下層；點任一層看那一層的積木</div></div>
      <div style={panelBody}>
        {band("/ops/systems", "系統", `${systems} 個`, "總控中心裡的每個系統", true)}
        <div className="lg-arrow">↓ 由產品模組組成</div>
        {band(blocksHref({ tier: "module" }), "產品模組", `${LEGO_BLOCKS.filter((b) => b.tier === "module").length} 個`, "M-xx", true)}
        <div className="lg-arrow">↓ 用功能積木拼成（上＝使用者摸得到，下＝共用底座）</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {[...BLOCK_LAYERS].reverse().map((l) => <div key={l.key}>{band(blocksHref({ layer: l.key }), l.name, `${live.filter((b) => b.layer === l.key).length} 顆`, l.hint)}</div>)}
        </div>
        <div className="lg-arrow">↓ 認知工程模組另外取用</div>
        {band(blocksHref({ tier: "method" }), "認知方法族", `${methods.length} 族・${methods.reduce((a, b) => a + (b.count ?? 0), 0)} 個方法`, "C-xx")}
      </div>
    </section>
  );
}

function BlockCard({ b, nameOf }: { b: LegoBlock; nameOf: (s: string) => string }) {
  return (
    <article className="lg-card" id={b.no}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <span className="lg-no">{b.no}</span>
        <strong style={{ fontSize: 14, color: "var(--text-primary)" }}>{b.name}</strong>
        {b.status.map((s) => <span key={s} className={`card-badge ${BLOCK_STATUS[s].badge}`} style={{ display: "inline-flex" }}>{BLOCK_STATUS[s].label}</span>)}
        {b.count !== undefined && <span style={muted}>{b.count} 個方法</span>}
      </div>
      <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}><Linked text={b.purpose} /></div>
      {b.note && <div style={{ ...muted, marginTop: 6 }}><Linked text={b.note} /></div>}
      {b.usedBy.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ ...muted, marginBottom: 4 }}>用在 {b.usedBy.length} 個系統</div>
          <div>{b.usedBy.map((s) => <Link key={s} href={`/ops/systems/${s}`} className="lg-chip">{nameOf(s)}</Link>)}</div>
        </div>
      )}
      {(b.entry.length > 0 || b.deps?.length) && (
        <details style={{ marginTop: 6 }}>
          <summary style={{ ...muted, cursor: "pointer" }}>檔案與依賴</summary>
          <div className="lg-files" style={{ marginTop: 6 }}>{b.entry.map((e) => <code key={e}>{e}</code>)}</div>
          {b.deps?.length ? <div style={{ ...muted, marginTop: 6 }}>需要：{b.deps.join("、")}</div> : null}
        </details>
      )}
    </article>
  );
}

function Section({ title, hint, blocks, nameOf, id }: { title: string; hint: string; blocks: LegoBlock[]; nameOf: (s: string) => string; id?: string }) {
  if (blocks.length === 0) return null;
  return (
    <details open id={id} style={{ marginBottom: 18 }}>
      <summary style={{ cursor: "pointer", marginBottom: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>{title}</span>
        <span style={{ ...muted, marginLeft: 8 }}>{blocks.length} 顆{hint ? `・${hint}` : ""}</span>
      </summary>
      <div className="lg-grid">{blocks.map((b) => <BlockCard key={b.no} b={b} nameOf={nameOf} />)}</div>
    </details>
  );
}

const PENDING_LABEL: Record<PendingRow["kind"], string> = { shared: "共用檔待歸類", uncovered: "新功能還沒編號", dead: "積木指向的檔案不見了" };

/** 待處理 / 共用小工具, from the GitHub-refreshed scan (lib/systems/block-usage.ts). */
function FileList({ id, title, hint, rows, nameOf, open }: { id: string; title: string; hint: string; rows: Array<ScanRow & { kind?: PendingRow["kind"] }>; nameOf: (s: string) => string; open: boolean }) {
  if (rows.length === 0) return null;
  return (
    <details open={open} id={id} style={{ marginBottom: 18 }}>
      <summary style={{ cursor: "pointer", marginBottom: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>{title}</span>
        <span style={{ ...muted, marginLeft: 8 }}>{rows.length} 個・{hint}</span>
      </summary>
      {rows.map((r) => (
        <div key={r.path} className="lg-card" style={{ marginBottom: 8 }}>
          {r.kind && <span className="card-badge badge-yellow" style={{ display: "inline-flex", marginRight: 8 }}>{PENDING_LABEL[r.kind]}</span>}
          <code style={{ fontSize: 12, wordBreak: "break-all" }}>{r.path}</code>
          {r.systems.length > 0 && <div style={{ marginTop: 6 }}>{r.systems.map((s) => <Link key={s} href={`/ops/systems/${s}`} className="lg-chip">{nameOf(s)}</Link>)}</div>}
        </div>
      ))}
    </details>
  );
}

function BlocksView({ f, nameOf }: { f: Filters; nameOf: (s: string) => string }) {
  const filtered = LEGO_BLOCKS.filter((b) => b.tier === f.tier && (!f.layer || b.layer === f.layer) && (!f.sys || b.usedBy.includes(f.sys))
    && (!f.shared || (isLive(b) && b.usedBy.length >= 2))
    && (!f.q || [b.no, b.name, b.purpose, ...b.entry, ...(b.covers ?? [])].some((s) => s.toLowerCase().includes(f.q))));
  const live = filtered.filter(isLive);
  return (
    <section style={panel}>
      <div style={panelHead}><div style={muted}>{TIERS.find((t) => t.key === f.tier)?.hint}</div></div>
      <div style={panelBody}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          {TIERS.map((t) => <Link key={t.key} href={hrefOf(f, { tier: t.key, layer: null })} {...pick(f.tier === t.key)} style={smallBtn}>{t.prefix}・{t.name}</Link>)}
        </div>
        {f.tier === "block" && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            <Link href={hrefOf(f, { layer: null })} {...pick(!f.layer)} style={smallBtn}>全部層</Link>
            {BLOCK_LAYERS.map((l) => <Link key={l.key} href={hrefOf(f, { layer: l.key })} {...pick(f.layer === l.key)} style={smallBtn}>{l.name}</Link>)}
          </div>
        )}
        <form method="get" action="/ops/systems/blocks" style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <input type="hidden" name="view" value="blocks" />
          {f.tier !== "block" && <input type="hidden" name="tier" value={f.tier} />}
          {f.layer && <input type="hidden" name="layer" value={f.layer} />}
          {f.sys && <input type="hidden" name="sys" value={f.sys} />}
          {f.shared && <input type="hidden" name="shared" value="1" />}
          <input name="q" defaultValue={f.q} placeholder="搜尋編號、名稱、用途或檔名" aria-label="搜尋積木" style={{ flex: 1, minWidth: 0, fontSize: 13, padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-subtle)", color: "var(--text-primary)" }} />
          <button type="submit" className="btn-secondary" style={{ fontSize: 13, padding: "6px 14px" }}>搜尋</button>
        </form>
        {(f.sys || f.q || f.shared) && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
            {f.sys && <span className="card-badge badge-gray" style={{ display: "inline-flex" }}>系統：{nameOf(f.sys)}</span>}
            {f.q && <span className="card-badge badge-gray" style={{ display: "inline-flex" }}>搜尋：{f.q}</span>}
            {f.shared && <span className="card-badge badge-gray" style={{ display: "inline-flex" }}>只看共用（2 個以上系統）</span>}
            <Link href={hrefOf(f, { sys: null, q: null, shared: null })} className="btn-secondary" style={smallBtn}>清除</Link>
          </div>
        )}
        {filtered.length === 0 ? <div style={{ ...muted, padding: "24px 0", textAlign: "center" }}>找不到符合條件的積木</div>
          : f.tier === "block" ? (
            <>
              {BLOCK_LAYERS.map((l) => <Section key={l.key} title={l.name} hint={l.hint} blocks={live.filter((b) => b.layer === l.key)} nameOf={nameOf} />)}
              <Section id="lg-planned" title="規劃中" hint="已預留編號，還沒做" blocks={filtered.filter((b) => b.status.includes("planned"))} nameOf={nameOf} />
              <Section title="已退場" hint="已刪除、改為系統自己的頁面或共用小工具，不再列為積木；編號保留不再使用" blocks={filtered.filter((b) => b.status.includes("retired"))} nameOf={nameOf} />
              {!f.layer && !f.sys && !f.q && !f.shared && (
                <>
                  <FileList id="lg-pending" title="待處理" hint="程式變了、目錄還沒跟上的地方；不擋開發，有空再整理" rows={PENDING} nameOf={nameOf} open />
                  <FileList id="lg-tools" title="共用小工具" hint="每個系統都會用到的底層零件，不算積木" rows={SHARED_TOOLS} nameOf={nameOf} open={false} />
                </>
              )}
            </>
          ) : <Section title={TIERS.find((t) => t.key === f.tier)?.name ?? ""} hint="" blocks={filtered} nameOf={nameOf} />}
      </div>
    </section>
  );
}

export default async function BlocksPage({ searchParams }: { searchParams?: Promise<Sp> }) {
  const access = systemsAccess(await headers());
  if (!access.allowed) return <Refused />;
  const sp = searchParams ? await searchParams : {};
  const f: Filters = {
    view: (VIEWS.some(([k]) => k === first(sp.view)) ? first(sp.view) : "systems") as View,
    grp: GROUPS.some(([g]) => g === first(sp.grp)) ? (first(sp.grp) as CatalogGroup) : null,
    tier: (TIERS.some((t) => t.key === first(sp.tier)) ? first(sp.tier) : "block") as Tier,
    layer: BLOCK_LAYERS.some((l) => l.key === first(sp.layer)) ? (first(sp.layer) as BlockLayer) : null,
    sys: (first(sp.sys) ?? "").slice(0, 100),
    q: (first(sp.q) ?? "").trim().slice(0, 100).toLowerCase(),
    shared: first(sp.shared) === "1",
  };
  const now = Date.now();

  const sb = getSupabaseWriteClient();
  let failure: string | null = sb ? null : "Supabase 未設定。";
  let systems: SystemOverviewRow[] = [];
  let capped = false;
  if (sb) {
    try {
      const [defs, state] = await Promise.all([readDefinitions(sb), readProjectionInput(sb)]);
      systems = projectAll(defs, state, now);
      capped = state.capped;
    } catch (e) {
      failure = String(e instanceof Error ? e.message : e);
    }
  }
  const bySlug = new Map(systems.map((r) => [r.system.slug, r]));
  const nameOf = (s: string) => bySlug.get(s)?.system.name ?? s;
  const stats = blockStats();
  // every registered system is a row (one with no block still shows its status and completion); catalog-only slugs too
  const catalogSlugs = LEGO_BLOCKS.filter((b) => b.tier === "block" && isLive(b)).flatMap((b) => b.usedBy);
  const rows = [...new Set([...systems.map((r) => r.system.slug), ...catalogSlugs])]
    .map((slug): SysRow => {
      const sys = bySlug.get(slug);
      const grp = sys
        ? overviewGroup({ status: sys.eff.status, inferred: sys.eff.inferred, featureCount: sys.p.features.length, blocker: sys.p.handoff.blocker, lastCommitAt: sys.p.lastCommitAt }, now)
        : null;
      return { slug, sys, blocks: blocksForSystem(slug), modules: blocksForSystem(slug, "module"), grp };
    })
    .sort((a, b) => b.blocks.length - a.blocks.length || a.slug.localeCompare(b.slug));

  return (
    <div style={page} className="sys-page">
      <style>{CSS + HEADER_CSS}</style>
      <SystemsHeader current="blocks" title="LEGO 積木目錄"><AddSystemForm /></SystemsHeader>
      <p style={{ ...muted, fontSize: 14, marginBottom: 18 }}>積木＝可以拿去組裝成不同系統的零件，就像樂高。每顆有固定編號（B＝功能積木、M＝產品模組、C＝認知方法族），編號永不重用。每個系統都會用到的小工具（例如分頁讀取、自動重整）不算積木，收在清單最下面的「共用小工具」；誰用了哪顆積木由 GitHub 在每次推送後自動更新。</p>
      {PENDING.length > 0 && <div style={box}>目錄有 {PENDING.length} 項待處理（新共用檔、新功能還沒編號或檔案搬走）；不擋開發。<Link href={`${catalogHref({ view: "blocks" })}#lg-pending`}>看待處理清單</Link></div>}
      {failure && <div style={errorBox}>讀不到系統進度：{failure}（積木清單照常顯示）</div>}
      {capped && <div style={errorBox}>事件超過讀取上限，最舊的一段沒有算進來，狀態與完成度可能不準。</div>}
      <div className="lg-stats">
        <Stat title="功能積木" value={stats.live} hint={`另有產品模組 ${stats.modules}、認知方法族 ${stats.methods}`} href={catalogHref({ view: "blocks" })} />
        <Stat title="共用積木" value={stats.shared} hint="用在 2 個以上系統" href={catalogHref({ view: "blocks", shared: true })} />
        <Stat title="規劃中／已退場" value={stats.planned + stats.retired} hint={`規劃 ${stats.planned}・退場 ${stats.retired}（保留編號）`} href={`${catalogHref({ view: "blocks" })}#lg-planned`} />
      </div>
      <nav className="lg-tabs" aria-label="積木目錄分頁">
        {VIEWS.map(([k, label]) => (
          <Link key={k} href={k === "blocks" ? hrefOf(f, { view: "blocks" }) : hrefOf(f, { view: k, grp: null, sys: null, q: null, layer: null, tier: null, shared: null })}
            aria-current={f.view === k ? "page" : undefined} className={f.view === k ? "btn-primary" : "btn-secondary"} style={{ fontSize: 13, padding: "7px 16px", textDecoration: "none" }}>{label}</Link>
        ))}
      </nav>
      {f.view === "systems" && <SystemsView rows={rows} f={f} nameOf={nameOf} />}
      {f.view === "blocks" && <BlocksView f={f} nameOf={nameOf} />}
      {f.view === "diagram" && <DiagramView systems={rows.length} f={f} />}
    </div>
  );
}
