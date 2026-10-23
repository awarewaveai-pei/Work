// /ops/products — every registered product: its door, whether the door is open, what it sells and where staff use it.
// Renders lib/portal/products.ts and doors.ts directly, so it cannot drift from what middleware serves.
// Who pays and who operates (ADR 017 §0) is per account, not per product, so it is not on this page.
import Link from "next/link";
import { productHost, servedNextAdminProducts } from "@/lib/portal/doors";
import { PRODUCTS } from "@/lib/portal/products";

export const metadata = { title: "產品 · Ops" };

const th: React.CSSProperties = { textAlign: "left", padding: "8px 10px", fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", borderBottom: "1px solid var(--card-border)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "8px 10px", fontSize: 13, color: "var(--text-primary)", borderBottom: "1px solid var(--card-border)", verticalAlign: "top" };
const muted: React.CSSProperties = { fontSize: 12, color: "var(--text-muted)" };

export default function ProductsPage() {
  const served = new Set(servedNextAdminProducts().map((p) => p.key));
  return (
    <div style={{ background: "var(--bg-canvas)", minHeight: "100vh", padding: "28px 32px" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>產品</h1>
          <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>資料來源：lib/portal/products.ts</span>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, maxWidth: 900 }}>
          每個產品有自己的網址（產品門）。門開著，客戶就能從那個網址登入使用；門關著，只有員工能從左邊選單使用。例：社群發文的門開著，客戶開 social 網址就直接進到發文畫面。
        </p>
      </div>
      <div style={{ overflowX: "auto", background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 12 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1000 }}>
          <thead>
            <tr>
              <th style={th}>產品</th>
              <th style={th}>產品門</th>
              <th style={th}>販售</th>
              <th style={th}>收費功能</th>
              <th style={th}>員工使用</th>
              <th style={th}>需要一起安裝</th>
            </tr>
          </thead>
          <tbody>
            {PRODUCTS.map((p) => {
              const open = served.has(p.key);
              const credits = p.features.filter((f) => f.billing === "credits").length;
              return (
                <tr key={p.key}>
                  <td style={td}><div style={{ fontWeight: 700 }}>{p.name}</div><div style={muted}>{p.description}</div></td>
                  <td style={td}>
                    <div>{p.door.app === "external" ? "獨立服務" : open ? "開著" : "還沒開"}</div>
                    <div style={muted}>{productHost(p)}</div>
                  </td>
                  <td style={td}>{p.status === "available" ? "販售中" : "即將推出"}</td>
                  <td style={td}>
                    <div>{p.features.length} 項</div>
                    {p.features.length ? <div style={muted}>{credits ? `其中 ${credits} 項按次扣點` : "全部看合約"}</div> : null}
                  </td>
                  <td style={td}>
                    {p.staffPaths.length ? p.staffPaths.map((s) => <div key={s}><Link href={`/${s}`}>/{s}</Link></div>) : <span style={muted}>不在這個後台</span>}
                  </td>
                  <td style={td}>{p.modules.dependsOn.length ? p.modules.dependsOn.join("、") : <span style={muted}>無</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
