// 給／收產品 on the 帳務 tab (ADR 017 4b-10): staff tick a product to give it (comp rows, migration 0143) and untick to
// take it back; the seller licence (<product>.resell) is its own list, because it decides who may sell, not who may use.
// Writes go through saveStaffGrants -> lib/entitlements/staff-grants.ts; this file only renders.
import type { StaffGrantProduct } from "@/lib/entitlements/staff-grants";
import { saveStaffGrants } from "./entitlement-actions";
import { Card, NoData, SubLabel, Tag } from "./hub-ui";

export type StaffGrantsData = { products: StaffGrantProduct[] | null; error: string | null; canEdit: boolean };
export type StaffGrantNotice = { r: string; g: number; t: number; s: number; p: string | null };

// The redirect's ?r= -> what staff read (staff-grant-outcome.ts codes plus 0143's staff_grant:<code>).
export const STAFF_GRANT_MESSAGES: Record<string, { ok: boolean; text: string }> = {
  saved: { ok: true, text: "已存。" },
  nothing_changed: { ok: true, text: "沒有勾選變動，什麼都沒改。" },
  forbidden: { ok: false, text: "只有擁有者或管理員能給或收產品。" },
  note_required: { ok: false, text: "請填原因（200 字內），會記在稽核紀錄。沒有改動。" },
  account_not_found: { ok: false, text: "找不到這個客戶的帳戶，沒有改動。" },
  internal_account: { ok: false, text: "自用帳戶本來就全部能用、全部能賣，不需要設定。" },
  not_a_customer_account: { ok: false, text: "只能給最上層的客戶帳戶，沒有改動。" },
  all_features_account: { ok: false, text: "這個帳戶本來就全部功能都開，不需要再送。" },
  no_features: { ok: false, text: "這個產品還沒有可以送的功能。" },
  invalid_source_refs: { ok: false, text: "頁面資料過期，請重新整理後再改。" },
  invalid_note: { ok: false, text: "原因要填，而且在 200 字內。" },
  db_error: { ok: false, text: "資料庫寫入失敗。" },
};

const muted: React.CSSProperties = { fontSize: 11, color: "var(--text-muted)" };
const row: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, padding: "5px 0", fontSize: 13, color: "var(--text-primary)" };

function Box({ kind, product, gifts, disabled, children }: {
  kind: "use" | "resell"; product: string; gifts: string[]; disabled: boolean; children: React.ReactNode;
}) {
  const checked = gifts.length > 0;
  return (
    <label style={{ ...row, opacity: disabled ? 0.6 : 1, cursor: disabled ? "default" : "pointer" }}>
      {/* was: the gifts shown ("0" = none), so the action writes only boxes that changed and an untick ends only these
          gifts, never one made since by someone else; a disabled box sends neither field. */}
      {disabled ? null : <input type="hidden" name={`was:${kind}:${product}`} value={checked ? gifts.join(",") : "0"} />}
      <input type="checkbox" name={`${kind}:${product}`} defaultChecked={checked} disabled={disabled} />
      {children}
    </label>
  );
}

export function StaffGrantsCard({ slug, data, notice, allFeatures }: {
  slug: string; data: StaffGrantsData; notice: StaffGrantNotice | null; allFeatures: boolean;
}) {
  if (data.error) return <Card title="給／收產品"><NoData>讀不到目前送了哪些產品：{data.error}</NoData></Card>;
  if (!data.products) return null;
  const message = notice ? STAFF_GRANT_MESSAGES[notice.r] ?? { ok: false, text: `沒有存成功（${notice.r}）。` } : null;
  const counts = (notice && (notice.g || notice.t) ? `送出 ${notice.g} 項、收回 ${notice.t} 項。` : "")
    + (notice?.s ? `${notice.s} 項別人已先改過，這次沒動。` : "");
  const failedAt = notice && notice.p && !message?.ok ? `停在「${data.products.find((p) => p.key === notice.p)?.name ?? notice.p}」，後面的沒有改。` : "";
  const locked = !data.canEdit;
  return (
    <Card title="給／收產品" badge={locked ? "只有擁有者或管理員能改" : "改完按最下面的「儲存變更」"}>
      {message ? (
        <div style={{ marginBottom: 10 }}>
          <Tag tone={message.ok ? "green" : "red"}>{message.text}</Tag> <span style={muted}>{counts}{failedAt}</span>
        </div>
      ) : null}
      <form action={saveStaffGrants}>
        <input type="hidden" name="slug" value={slug} />

        <SubLabel>能用哪些產品（送給這個客戶，免費使用）</SubLabel>
        <div style={muted}>勾選＝送整個產品（每項功能都開）；取消勾選＝收回。只會收回這裡送的，合約或付款開的不受影響。</div>
        {allFeatures ? <NoData>這個帳戶本來就全部功能都開，不需要送。</NoData> : data.products.map((p) => (
          <Box key={p.key} kind="use" product={p.key} gifts={p.use.gifts} disabled={locked || p.features === 0}>
            {p.name} <span style={muted}>{p.features} 項功能</span>
            {p.features === 0 ? <span style={muted}>還沒有可以送的功能</span> : null}
            {p.use.staff > 0 ? <Tag tone="green">已送 {p.use.staff} 項</Tag> : null}
            {p.use.other > 0 ? <Tag tone="accent">合約或付款已開 {p.use.other} 項</Tag> : null}
          </Box>
        ))}

        <SubLabel>能賣哪些產品（代理權）</SubLabel>
        <div style={muted}>勾選＝這個帳戶可以在自己的收銀台網站賣這個產品給別人。跟上面的「能用」是兩件事，互不影響。</div>
        {data.products.map((p) => (
          <Box key={p.key} kind="resell" product={p.key} gifts={p.resell.gifts} disabled={locked}>
            {p.name}
            {p.resell.staff ? <Tag tone="green">可以賣</Tag> : null}
            {p.resell.other ? <Tag tone="accent">另有合約給的代理權</Tag> : null}
          </Box>
        ))}

        {locked ? null : (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            <input name="note" maxLength={200} placeholder="原因（必填，會記在稽核紀錄）" style={{ flex: "1 1 260px", fontSize: 13, padding: "6px 8px", border: "1px solid var(--border-subtle)", borderRadius: 6, background: "var(--bg-card)", color: "var(--text-primary)" }} />
            <button type="submit" style={{ fontSize: 13, padding: "6px 14px", borderRadius: 6, border: "none", background: "var(--accent)", color: "var(--btn-primary-text)", cursor: "pointer" }}>儲存變更</button>
          </div>
        )}
      </form>
    </Card>
  );
}
