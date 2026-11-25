// /ops/systems/blocks -- LEGO 積木目錄: every block (lib/systems/blocks.ts) with its number, what it does, which systems
// use it, and per system which blocks it uses next to that system's status and completion. Owner / admin only.
// Catalog = code (always renders); system names / progress = the same projection as 總控中心 (may fail, catalog stays).
import Link from "next/link";
import { headers } from "next/headers";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { systemsAccess } from "@/lib/systems/access";
import { BLOCK_LAYERS, BLOCK_STATUS, LEGO_BLOCKS, TIERS, blockStats, isLive, usageMatrix, type BlockLayer, type LegoBlock, type Tier } from "@/lib/systems/blocks";
import { projectAll, type SystemOverviewRow } from "@/lib/systems/overview";
import { readDefinitions, readProjectionInput } from "@/lib/systems/store";
import { AddSystemForm, HEADER_CSS, Progress, Refused, StatusBadge, SystemsHeader, errorBox, muted, page, panel, panelBody, panelHead, smallBtn } from "../parts";

export const dynamic = "force-dynamic";
export const metadata = { title: "LEGO 積木目錄 · Ops" };

type Sp = { tier?: string | string[]; layer?: string | string[]; sys?: string | string[]; q?: string | string[] };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const LAYER_NAME = Object.fromEntries(BLOCK_LAYERS.map((l) => [l.key, l.name])) as Record<BlockLayer, string>;

const CSS = `
.lg-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:20px}
.lg-diagram{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.6fr);gap:16px;margin-bottom:20px;align-items:start}
.lg-band{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:9px 12px;border-radius:8px;border:1px solid var(--card-border);text-decoration:none;color:var(--text-primary);font-size:13px}
.lg-band:hover{border-color:var(--accent)}
.lg-arrow{text-align:center;font-size:11px;color:var(--text-muted);line-height:18px}
.lg-heat{width:100%;border-collapse:separate;border-spacing:2px;font-size:12px}
.lg-heat th{font-size:11px;color:var(--text-muted);font-weight:700;padding:4px;text-align:center;white-space:nowrap}
.lg-heat td{padding:0;text-align:center}
.lg-heat td a{display:block;padding:7px 4px;border-radius:6px;color:var(--text-primary);text-decoration:none;font-weight:700}
.lg-heat td a:hover{outline:2px solid var(--accent)}
.lg-heat .lg-sys{text-align:left;white-space:nowrap;padding-right:8px}
.lg-heat-wrap{overflow-x:auto}
.lg-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.lg-card{padding:14px 16px;border:1px solid var(--card-border);border-radius:var(--radius);background:var(--card-bg);min-width:0}
.lg-no{font-family:var(--font-mono,ui-monospace,monospace);font-size:12px;font-weight:800;color:var(--accent-text);background:var(--accent-light);padding:2px 7px;border-radius:6px}
.lg-chip{display:inline-block;font-size:11px;padding:2px 8px;border-radius:99px;border:1px solid var(--card-border);color:var(--text-secondary);text-decoration:none;margin:0 4px 4px 0}
.lg-chip:hover{border-color:var(--accent);color:var(--accent-text)}
.lg-files code{display:block;font-size:11px;word-break:break-all;color:var(--text-secondary)}
@media (max-width:1400px){.lg-diagram{grid-template-columns:minmax(0,1fr)}}
@media (max-width:760px){.lg-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.lg-grid{grid-template-columns:minmax(0,1fr)}.sys-page{padding:20px 16px!important}}
`;

function Stat({ title, value, hint }: { title: string; value: number; hint: string }) {
  return (
    <div className="card" style={{ padding: "14px 16px" }}>
      <div className="card-label">{title}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: "var(--text-primary)", margin: "4px 0" }}>{value}</div>
      <div style={muted}>{hint}</div>
    </div>
  );
}

/** 圖解 1: who stands on whom -- systems use product modules, modules are built from the block layers (top = what the
 *  user touches, bottom = shared base), the cognitive module draws on its method families. Each band filters the list. */
function StackDiagram({ systems }: { systems: number }) {
  const live = LEGO_BLOCKS.filter((b) => b.tier === "block" && isLive(b));
  const count = (k: BlockLayer) => live.filter((b) => b.layer === k).length;
  const modules = LEGO_BLOCKS.filter((b) => b.tier === "module").length;
  const methods = LEGO_BLOCKS.filter((b) => b.tier === "method");
  const band = (href: string, label: string, n: string, strong = false) => (
    <Link href={href} className="lg-band" style={strong ? { background: "var(--accent-light)" } : { background: "var(--bg-subtle)" }}>
      <span style={{ fontWeight: 700 }}>{label}</span><span style={muted}>{n}</span>
    </Link>
  );
  return (
    <section style={panel}>
      <div style={panelHead}><h2 style={{ margin: 0, fontSize: 16 }}>圖解：積木怎麼疊起來</h2><div style={muted}>上層用下層；點任一層看那一層的積木</div></div>
      <div style={panelBody}>
        {band("/ops/systems", "系統", `${systems} 個`, true)}
        <div className="lg-arrow">↓ 由產品模組組成</div>
        {band("/ops/systems/blocks?tier=module", "產品模組", `${modules} 個 M-xx`, true)}
        <div className="lg-arrow">↓ 用功能積木拼成（上＝使用者摸得到，下＝共用底座）</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {[...BLOCK_LAYERS].reverse().map((l) => <div key={l.key}>{band(`/ops/systems/blocks?layer=${l.key}`, l.name, `${count(l.key)} 顆`)}</div>)}
        </div>
        <div className="lg-arrow">認知工程模組另外取用 ↓</div>
        {band("/ops/systems/blocks?tier=method", "認知方法族", `${methods.length} 族・${methods.reduce((a, b) => a + (b.count ?? 0), 0)} 個方法`)}
      </div>
    </section>
  );
}

/** 圖解 2: system × layer heat map (single hue: more blocks = stronger accent) plus each system's status and completion. */
function HeatMap({ rows, nameOf }: { rows: Array<{ slug: string; sys: SystemOverviewRow | undefined }>; nameOf: (s: string) => string }) {
  const m = usageMatrix();
  const max = Math.max(1, ...[...m.values()].flatMap((r) => Object.values(r).map((n) => n ?? 0)));
  const shade = (n: number) => (n ? `color-mix(in srgb, var(--accent) ${Math.round(12 + (n / max) * 38)}%, transparent)` : "var(--bg-subtle)");
  return (
    <section style={panel}>
      <div style={panelHead}><h2 style={{ margin: 0, fontSize: 16 }}>系統用了哪些積木・進度</h2><div style={muted}>格子數字＝該系統用到這一層幾顆，顏色越深越多；點格子看是哪幾顆</div></div>
      <div style={{ ...panelBody }} className="lg-heat-wrap">
        <table className="lg-heat">
          <thead><tr><th style={{ textAlign: "left" }}>系統</th>{BLOCK_LAYERS.map((l) => <th key={l.key} title={l.hint}>{l.name}</th>)}<th>合計</th><th>狀態</th><th style={{ textAlign: "left" }}>完成度</th></tr></thead>
          <tbody>
            {rows.map(({ slug, sys }) => {
              const r = m.get(slug) ?? {};
              const total = Object.values(r).reduce((a, n) => a + (n ?? 0), 0);
              return (
                <tr key={slug}>
                  <td className="lg-sys">{sys ? <Link href={`/ops/systems/${slug}`} style={{ color: "var(--text-primary)", fontWeight: 700, textDecoration: "none" }}>{nameOf(slug)}</Link> : <span title="registry 尚未匯入這個系統">{slug}</span>}</td>
                  {BLOCK_LAYERS.map((l) => {
                    const n = r[l.key] ?? 0;
                    return <td key={l.key}>{n ? <a href={`/ops/systems/blocks?sys=${slug}&layer=${l.key}`} style={{ background: shade(n) }} title={`${nameOf(slug)} 用 ${n} 顆${l.name}積木`}>{n}</a> : <span style={{ display: "block", padding: "7px 4px", borderRadius: 6, background: shade(0), color: "var(--text-muted)" }}>·</span>}</td>;
                  })}
                  <td><a href={`/ops/systems/blocks?sys=${slug}`} style={{ background: "transparent" }} title={`看 ${nameOf(slug)} 用到的全部積木`}>{total}</a></td>
                  <td style={{ padding: "0 6px" }}>{sys ? <StatusBadge eff={sys.eff} /> : <span style={muted}>—</span>}</td>
                  <td style={{ textAlign: "left", minWidth: 130 }}>{sys ? <Progress p={sys.p} /> : <span style={muted}>—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
      <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>{b.purpose}</div>
      {b.overlaps && <div className="card-badge badge-yellow" style={{ display: "inline-flex", marginTop: 6 }}>與 <a href={`#${b.overlaps}`} style={{ color: "inherit", margin: "0 3px" }}>{b.overlaps}</a> 功能重複，待合併</div>}
      {b.note && <div style={{ ...muted, marginTop: 6 }}>{b.note}</div>}
      <div style={{ marginTop: 8 }}>
        <span style={{ ...muted, marginRight: 6 }}>用在 {b.usedBy.length} 個系統</span>
        <div>{b.usedBy.map((s) => <Link key={s} href={`/ops/systems/${s}`} className="lg-chip">{nameOf(s)}</Link>)}</div>
      </div>
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

function Section({ title, hint, blocks, nameOf, open = true }: { title: string; hint: string; blocks: LegoBlock[]; nameOf: (s: string) => string; open?: boolean }) {
  if (blocks.length === 0) return null;
  return (
    <details open={open} style={{ marginBottom: 18 }}>
      <summary style={{ cursor: "pointer", listStyle: "none", marginBottom: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>{title}</span>
        <span style={{ ...muted, marginLeft: 8 }}>{blocks.length} 顆・{hint}</span>
      </summary>
      <div className="lg-grid">{blocks.map((b) => <BlockCard key={b.no} b={b} nameOf={nameOf} />)}</div>
    </details>
  );
}

export default async function BlocksPage({ searchParams }: { searchParams?: Promise<Sp> }) {
  const access = systemsAccess(await headers());
  if (!access.allowed) return <Refused />;
  const sp = searchParams ? await searchParams : {};
  const tier = (TIERS.some((t) => t.key === first(sp.tier)) ? first(sp.tier) : "block") as Tier;
  const layer = BLOCK_LAYERS.some((l) => l.key === first(sp.layer)) ? (first(sp.layer) as BlockLayer) : null;
  const sys = (first(sp.sys) ?? "").slice(0, 100);
  const q = (first(sp.q) ?? "").trim().slice(0, 100).toLowerCase();

  const sb = getSupabaseWriteClient();
  let failure: string | null = sb ? null : "Supabase 未設定。";
  let systems: SystemOverviewRow[] = [];
  let capped = false;
  if (sb) {
    try {
      const [defs, state] = await Promise.all([readDefinitions(sb), readProjectionInput(sb)]);
      systems = projectAll(defs, state, Date.now());
      capped = state.capped;
    } catch (e) {
      failure = String(e instanceof Error ? e.message : e);
    }
  }
  const bySlug = new Map(systems.map((r) => [r.system.slug, r]));
  const nameOf = (s: string) => bySlug.get(s)?.system.name ?? s;
  const stats = blockStats();
  const matrix = usageMatrix();
  // every registered system is a row (one with no block still shows its status and completion); catalog-only slugs too
  const heatRows = [...new Set([...systems.map((r) => r.system.slug), ...matrix.keys()])]
    .map((slug) => ({ slug, sys: bySlug.get(slug), total: Object.values(matrix.get(slug) ?? {}).reduce((a, n) => a + (n ?? 0), 0) }))
    .sort((a, b) => b.total - a.total || a.slug.localeCompare(b.slug));

  const filtered = LEGO_BLOCKS.filter((b) => b.tier === tier && (!layer || b.layer === layer) && (!sys || b.usedBy.includes(sys))
    && (!q || [b.no, b.name, b.purpose, ...b.entry, ...(b.covers ?? [])].some((s) => s.toLowerCase().includes(q))));
  const live = filtered.filter(isLive);
  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string | null> = { tier: tier === "block" ? null : tier, layer, sys: sys || null, q: q || null, ...patch };
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
    const s = p.toString();
    return `/ops/systems/blocks${s ? `?${s}` : ""}#list`;
  };

  return (
    <div style={page} className="sys-page">
      <style>{CSS + HEADER_CSS}</style>
      <SystemsHeader current="blocks" title="LEGO 積木目錄"><AddSystemForm /></SystemsHeader>
      <p style={{ ...muted, fontSize: 14, marginBottom: 20 }}>每顆積木有固定編號（B＝功能積木、M＝產品模組、C＝認知方法族），編號永不重用。前端面板和後端 API 算同一顆；同一個功能有兩套的標「功能重複」。</p>
      {failure && <div style={errorBox}>讀不到系統進度：{failure}（積木清單照常顯示）</div>}
      {capped && <div style={errorBox}>事件超過讀取上限，最舊的一段沒有算進來，狀態與完成度可能不準。</div>}
      <div className="lg-stats">
        <Stat title="功能積木" value={stats.live} hint={`另有產品模組 ${stats.modules}、認知方法族 ${stats.methods}`} />
        <Stat title="共用積木" value={stats.shared} hint="用在 2 個以上系統" />
        <Stat title="功能重複" value={stats.overlaps} hint="兩顆做同一件事，待合併成一顆" />
        <Stat title="規劃中／已退場" value={stats.planned + stats.retired} hint={`規劃 ${stats.planned}・退場 ${stats.retired}（保留編號）`} />
      </div>
      <div className="lg-diagram">
        <StackDiagram systems={heatRows.length} />
        <HeatMap rows={heatRows} nameOf={nameOf} />
      </div>

      <section style={panel} id="list">
        <div style={panelHead}><h2 style={{ margin: 0, fontSize: 16 }}>積木清單</h2><div style={muted}>{TIERS.find((t) => t.key === tier)?.hint}</div></div>
        <div style={panelBody}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            {TIERS.map((t) => <Link key={t.key} href={href({ tier: t.key === "block" ? null : t.key, layer: null })} className={tier === t.key ? "btn-primary" : "btn-secondary"} style={smallBtn}>{t.prefix}・{t.name}</Link>)}
          </div>
          {tier === "block" && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              <Link href={href({ layer: null })} className={!layer ? "btn-primary" : "btn-secondary"} style={smallBtn}>全部層</Link>
              {BLOCK_LAYERS.map((l) => <Link key={l.key} href={href({ layer: l.key })} className={layer === l.key ? "btn-primary" : "btn-secondary"} style={smallBtn}>{l.name}</Link>)}
            </div>
          )}
          <form method="get" action="/ops/systems/blocks" style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {tier !== "block" && <input type="hidden" name="tier" value={tier} />}
            {layer && <input type="hidden" name="layer" value={layer} />}
            {sys && <input type="hidden" name="sys" value={sys} />}
            <input name="q" defaultValue={q} placeholder="搜尋編號、名稱、用途或檔名" aria-label="搜尋積木" style={{ flex: 1, minWidth: 0, fontSize: 13, padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-subtle)", color: "var(--text-primary)" }} />
            <button type="submit" className="btn-secondary" style={{ fontSize: 13, padding: "6px 14px" }}>搜尋</button>
          </form>
          {(sys || q) && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
              {sys && <span className="card-badge badge-gray" style={{ display: "inline-flex" }}>系統：{nameOf(sys)}</span>}
              {q && <span className="card-badge badge-gray" style={{ display: "inline-flex" }}>搜尋：{q}</span>}
              <Link href={href({ sys: null, q: null })} className="btn-secondary" style={smallBtn}>清除</Link>
            </div>
          )}
          {filtered.length === 0 ? <div style={{ ...muted, padding: "24px 0", textAlign: "center" }}>找不到符合條件的積木</div>
            : tier === "block" ? (
              <>
                {BLOCK_LAYERS.map((l) => <Section key={l.key} title={l.name} hint={l.hint} blocks={live.filter((b) => b.layer === l.key)} nameOf={nameOf} />)}
                <Section title="規劃中" hint="已預留編號，還沒做" blocks={filtered.filter((b) => b.status.includes("planned"))} nameOf={nameOf} open={false} />
                <Section title="已退場" hint="已刪除，編號保留不再使用" blocks={filtered.filter((b) => b.status.includes("retired"))} nameOf={nameOf} open={false} />
              </>
            ) : <Section title={TIERS.find((t) => t.key === tier)?.name ?? ""} hint="" blocks={filtered} nameOf={nameOf} />}
        </div>
      </section>
    </div>
  );
}
