// Presentational primitives of the client hub page (/ops/clients/[slug]). Moved verbatim out of
// ClientHubTabs.tsx so cards that live in their own file (SiteWatchCard.tsx) render identically
// without importing back into ClientHubTabs (a cycle) or copying the styles (drift).
import type { ReactNode } from "react";

export function relativeTime(isoStr: string | null | undefined): string {
  if (!isoStr) return "—";
  const ms = Date.now() - new Date(isoStr).getTime();
  if (Number.isNaN(ms)) return "—";
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "剛才";
  if (m < 60) return `${m} 分鐘前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小時前`;
  return `${Math.floor(h / 24)} 天前`;
}

export function Card({ title, badge, children, action }: {
  title: string;
  badge?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div style={{
      background: "var(--bg-card)", border: "1px solid var(--border-subtle)",
      borderRadius: 12, padding: "16px 18px", marginBottom: 14,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{title}</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {badge && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{badge}</span>}
          {action}
        </div>
      </div>
      {children}
    </div>
  );
}

export function NoData({ children }: { children: ReactNode }) {
  return <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, lineHeight: 1.7 }}>{children}</p>;
}

export function SubLabel({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6, marginTop: 12 }}>{children}</div>;
}

// ── Tags and sub-tabs (客服 tab; reusable by any tab that classifies rows) ─────

export type TagTone = "green" | "red" | "gray" | "yellow" | "accent" | "ai";

const TAG_TONES: Record<TagTone, { bg: string; fg: string }> = {
  green:  { bg: "var(--badge-green-bg)",  fg: "var(--badge-green-text)" },
  red:    { bg: "var(--badge-red-bg)",    fg: "var(--badge-red-text)" },
  gray:   { bg: "var(--badge-gray-bg)",   fg: "var(--badge-gray-text)" },
  yellow: { bg: "var(--badge-yellow-bg)", fg: "var(--badge-yellow-text)" },
  accent: { bg: "var(--accent-light)",    fg: "var(--accent)" },
  ai:     { bg: "var(--ai-bg)",           fg: "var(--ai-text)" },
};

/** Small classification label: a status, a category, a count. Pure presentation. */
export function Tag({ tone = "gray", children, title, dot }: {
  tone?: TagTone; children: ReactNode; title?: string;
  /** Leading status dot in the tone's text colour (for on/off states). */
  dot?: boolean;
}) {
  const t = TAG_TONES[tone];
  return (
    <span title={title} style={{
      display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, lineHeight: 1.5,
      padding: "2px 7px", borderRadius: 5, background: t.bg, color: t.fg, whiteSpace: "nowrap",
    }}>
      {dot && <span aria-hidden style={{ fontSize: 7 }}>●</span>}
      {children}
    </span>
  );
}

export type SubTab<K extends string> = {
  key: K;
  label: string;
  /** Item count shown after the label in muted text (never a pill: a pill reads as a button). */
  count?: number | string;
};

/** Second-level tab bar inside a hub tab. Rendered with the app's tab component (`.tab-bar` / `.tab` /
 *  `.tab--active` in globals.css, tokens `--tab-*` on /tools/theme): hover, active underline and focus
 *  ring come from there, so every tab bar in the app looks and behaves the same. */
export function SubTabs<K extends string>({ tabs, active, onChange, label, idPrefix }: {
  tabs: Array<SubTab<K>>; active: K; onChange: (key: K) => void; label: string;
  /** Tabs get id `<prefix>-tab-<key>` and point at panel `<prefix>-panel-<key>`; the caller gives its panels those ids. */
  idPrefix: string;
}) {
  return (
    <div className="tab-bar" role="tablist" aria-label={label} style={{ marginBottom: 18 }}>
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <button key={t.key} type="button" role="tab" id={`${idPrefix}-tab-${t.key}`} aria-controls={`${idPrefix}-panel-${t.key}`}
            aria-selected={on} className={`tab${on ? " tab--active" : ""}`} onClick={() => onChange(t.key)}>
            {t.label}
            {t.count !== undefined && (
              // A real space, so a screen reader says "常見問答 20", not "常見問答20".
              <>{" "}<span className="tab-count">{t.count}</span></>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function ChipBtn({ label, active, onClick, disabled, title }: {
  label: string; active: boolean; onClick: () => void; disabled?: boolean; title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        padding: "3px 10px", borderRadius: 20, fontSize: 11, border: "1px solid",
        cursor: disabled ? "not-allowed" : "pointer", whiteSpace: "nowrap", opacity: disabled ? 0.45 : 1,
        background: active ? "var(--accent)" : "transparent",
        color: active ? "var(--btn-primary-text)" : "var(--text-secondary)",
        borderColor: active ? "var(--accent)" : "var(--card-border)",
        fontWeight: active ? 600 : 400,
        lineHeight: 1.6,
      }}
    >
      {label}
    </button>
  );
}
