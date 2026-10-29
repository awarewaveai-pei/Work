// /ops/sellers -- the cash registers (收銀台網站) that may send payment events, and who sells through each (ADR 017 #12,
// cards/step-4-seller.md 4c-2). Reads and writes seller_sites only through lib/payments/sites.ts; the seller's name is
// read from organizations. Writes are server actions (./actions.ts), owner/admin only; each answers with ?r=<code>.
import Link from "next/link";
import { listSites, type SellerSite } from "@/lib/payments/sites";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { addSite, changeSiteStatus } from "./actions";
import { SELLER_MESSAGES } from "./messages";

export const dynamic = "force-dynamic";
export const metadata = { title: "賣家 · Ops" };

const card: React.CSSProperties = { background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 12, padding: "14px 16px", marginBottom: 20 };
const th: React.CSSProperties = { textAlign: "left", padding: "8px 10px", fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", borderBottom: "1px solid var(--card-border)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "8px 10px", fontSize: 13, color: "var(--text-primary)", borderBottom: "1px solid var(--card-border)", verticalAlign: "top" };
const muted: React.CSSProperties = { fontSize: 12, color: "var(--text-muted)" };
const input: React.CSSProperties = { width: "100%", fontSize: 13, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--card-border)", background: "var(--form-input-bg)", color: "var(--text-primary)", boxSizing: "border-box" };
const label: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 };

const ALG: Record<SellerSite["verifyAlg"], string> = { ed25519: "Ed25519 公鑰", "hmac-env": "共用密鑰（過渡，只有 aware-wave.com）" };
const STATUS: Record<SellerSite["status"], string> = { active: "運作中", disabled: "已停用", pending: "待啟用" };

async function sellerNames(ids: string[]): Promise<Map<string, string>> {
  const db = getSupabaseWriteClient();
  if (!db || !ids.length) return new Map();
  const { data, error } = await db.from("organizations").select("id, name").in("id", ids);
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((o) => [o.id as string, o.name as string]));
}

export default async function SellersPage({ searchParams }: { searchParams?: Promise<{ r?: string | string[] }> }) {
  const raw = searchParams ? (await searchParams).r : undefined;
  const code = Array.isArray(raw) ? raw[0] : raw;
  const notice = code ? SELLER_MESSAGES[code] : undefined;

  let sites: SellerSite[] = [];
  let names = new Map<string, string>();
  let failure: string | null = null;
  try {
    const db = getSupabaseWriteClient();
    if (!db) throw new Error("entitlements_db_unavailable");
    sites = await listSites(db);
    names = await sellerNames([...new Set(sites.map((s) => s.sellerOrganizationId))]);
  } catch (error) {
    failure = String(error instanceof Error ? error.message : error);
  }

  return (
    <div style={{ background: "var(--bg-canvas)", minHeight: "100vh", padding: "28px 32px" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", margin: "0 0 4px" }}>賣家</h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, maxWidth: 900 }}>
          這裡登記「可以收錢的網站」。每個網站有自己的鑰匙，付款事件用那把鑰匙簽章，系統由鑰匙查出這個網站是誰在賣。
          網站送來的內容不能自己指定賣家。每月各賣家賣了多少，看「帳務」頁最上面的月合計。
        </p>
      </div>

      {notice ? (
        <div style={{ ...card, border: `1px solid ${notice.ok ? "var(--card-border)" : "var(--red)"}`, fontSize: 13, color: "var(--text-primary)" }}>{notice.text}</div>
      ) : null}
      {failure ? <div style={{ ...card, border: "1px solid var(--red)", fontSize: 13, color: "var(--text-primary)" }}>讀不到網站清單：{failure}</div> : null}

      <div style={{ ...card, padding: 0, overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 900 }}>
          <thead>
            <tr><th style={th}>網站</th><th style={th}>鑰匙代號</th><th style={th}>賣家</th><th style={th}>驗章方式</th><th style={th}>狀態</th><th style={th}></th></tr>
          </thead>
          <tbody>
            {sites.length ? sites.map((s) => (
              <tr key={s.id}>
                <td style={td}>{s.host}</td>
                <td style={td}><code>{s.keyId}</code></td>
                <td style={td}>
                  <Link href={`/ops/billing?seller=${s.sellerOrganizationId}`} style={{ color: "var(--accent-text)" }}>{names.get(s.sellerOrganizationId) ?? s.sellerOrganizationId}</Link>
                  <div style={muted}>{s.sellerKind === "internal" ? "自用帳戶" : "客戶帳戶"}</div>
                </td>
                <td style={td}>
                  {ALG[s.verifyAlg]}
                  <div style={muted}>{s.handoffPublicKey || s.handoffEnvVar ? "有進門鑰匙" : "沒有進門鑰匙"}</div>
                </td>
                <td style={td}>{STATUS[s.status]}</td>
                <td style={td}>
                  <form action={changeSiteStatus}>
                    <input type="hidden" name="site" value={s.id} />
                    <input type="hidden" name="status" value={s.status === "active" ? "disabled" : "active"} />
                    <button type="submit" className={s.status === "active" ? "btn-secondary" : "btn-primary"} style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6 }}>
                      {s.status === "active" ? "停用" : "啟用"}
                    </button>
                  </form>
                </td>
              </tr>
            )) : <tr><td style={{ ...td, ...muted }} colSpan={6}>{failure ? "讀不到" : "還沒有登記任何網站。"}</td></tr>}
          </tbody>
        </table>
      </div>

      <form action={addSite} style={card}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)", margin: "0 0 4px" }}>登記新的收銀台網站</h2>
        <p style={{ ...muted, margin: "0 0 12px", maxWidth: 800 }}>
          登記後馬上生效。鑰匙代號和賣家登記後不能改（換鑰匙要換公鑰，換賣家要登記新網站）。公鑰在該網站的外掛設定頁複製。
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginBottom: 12 }}>
          <div><label htmlFor="host" style={label}>網站網址</label><input id="host" name="host" required placeholder="shop.example.com" style={input} /></div>
          <div><label htmlFor="key_id" style={label}>鑰匙代號</label><input id="key_id" name="key_id" required placeholder="shop-example" pattern="[a-z0-9][a-z0-9\-]{1,23}" style={input} /></div>
          <div><label htmlFor="seller" style={label}>賣家帳戶（uuid）</label><input id="seller" name="seller" required placeholder="帳務頁點該帳戶，複製網址 account= 後面那串" style={input} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 12, marginBottom: 12 }}>
          <div>
            <label htmlFor="public_key" style={label}>付款公鑰（PEM）</label>
            <textarea id="public_key" name="public_key" required rows={5} placeholder={"-----BEGIN PUBLIC KEY-----\n…\n-----END PUBLIC KEY-----"} style={{ ...input, fontFamily: "monospace" }} />
          </div>
          <div>
            <label htmlFor="handoff_public_key" style={label}>進門公鑰（PEM，可以留空）</label>
            <textarea id="handoff_public_key" name="handoff_public_key" rows={5} placeholder="買家按「進入」登入用；要和付款公鑰不同一把" style={{ ...input, fontFamily: "monospace" }} />
          </div>
        </div>
        <button type="submit" className="btn-primary" style={{ fontSize: 13, padding: "7px 16px", borderRadius: 6 }}>登記網站</button>
      </form>
    </div>
  );
}
