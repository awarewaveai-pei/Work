// One tool/product card in three densities (blueprint §5): card (grid), row (list), compact (search results, side menu).
// It never decides a right or writes a state sentence: badge, text, button caption and tone all come from rightLabel()
// (lib/entitlements/right-label.ts); icon, category and blurb from the product's `catalog`. Colours are globals classes/tokens only.
import { CATEGORY_NAMES, type CatalogIcon } from "@/lib/portal/catalog-vocab";
import type { CatalogMeta } from "@/lib/portal/products";
import type { RightLabel, RightTone } from "@/lib/entitlements/right-label";

export type ToolDensity = "card" | "row" | "compact";
export interface ToolCardProps {
  name: string;
  catalog: Pick<CatalogMeta, "category" | "icon" | "blurb" | "addedAt">;
  /** What rightLabel() answered for this tool. */
  right: RightLabel;
  /** Where the button goes; null = no link (the button, if any, is shown disabled with the reason beside it). */
  href: string | null;
  /** Caller says the button cannot be used (the reason is right.text, always shown as text, never only a tooltip). */
  disabled?: boolean;
  density?: ToolDensity;
  /** Caption of the main action when rightLabel has none of its own (an allowed tool: its action is the caller's). */
  primaryLabel?: string;
  /** For the 「新」 marker (addedAt within 60 days). */
  now?: Date;
}

// One simple outline per closed icon name; stroke = currentColor, so no colour code anywhere.
const ICON_PATHS: Record<CatalogIcon, string> = {
  article: "M5 4h14v16H5zM8 8h8M8 12h8M8 16h5",
  share: "M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4",
  film: "M3 5h18v14H3zM7 5v14M17 5v14M3 10h4M3 14h4M17 10h4M17 14h4",
  image: "M3 5h18v14H3zM8 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 16l-5-5-8 8",
  cards: "M7 4h10v16H7zM4 7v12M20 7v12",
  palette: "M12 3a9 9 0 1 0 0 18c1.5 0 2-1 1.5-2.2-.5-1.3.3-2.3 1.7-2.3H17a4 4 0 0 0 4-4c0-5-4-9.5-9-9.5z",
  chat: "M4 5h16v11H9l-5 4z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5",
  mail: "M3 6h18v12H3zM3 7l9 7 9-7",
  compass: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15.5 8.5l-2 5-5 2 2-5z",
  pulse: "M3 12h4l3-8 4 16 3-8h4",
};

// badge-blue does not exist in globals yet (blueprint §19.4); the existing --ai tokens carry it until it does.
const TONE_CLASS: Record<Exclude<RightTone, "blue">, string> = { green: "badge-green", gray: "badge-gray", yellow: "badge-yellow", red: "badge-red" };
const BLUE_STYLE = { background: "var(--ai-bg)", color: "var(--ai-text)" } as const;

const NEW_DAYS = 60;
const isNew = (addedAt: string, now: Date): boolean => {
  const t = Date.parse(addedAt);
  return Number.isFinite(t) && now.getTime() - t <= NEW_DAYS * 86_400_000;
};

export function ToolCard({ name, catalog, right, href, disabled = false, density = "card", primaryLabel = "開啟", now = new Date() }: ToolCardProps) {
  const usable = !!href && !disabled;
  const blue = right.tone === "blue";
  const badge = right.label
    ? <span className={blue ? "card-badge" : `card-badge ${TONE_CLASS[right.tone as Exclude<RightTone, "blue">]}`} style={blue ? BLUE_STYLE : undefined} data-tone={right.tone}>{right.label}</span>
    : null;
  const caption = right.action ?? (usable ? primaryLabel : null);   // no link and no label from rightLabel = no button
  const button = caption
    ? (usable
      ? <a className="btn-primary" href={href!}>{caption}</a>
      : <button type="button" className="btn-secondary" disabled>{caption}</button>)
    : null;
  const reason = right.text ? <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }} data-reason>{right.text}</p> : null;
  const note = right.note ? <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>{right.note}</p> : null;
  const size = density === "compact" ? 16 : 24;
  const icon = (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" data-icon={catalog.icon}>
      <path d={ICON_PATHS[catalog.icon]} />
    </svg>
  );
  const fresh = isNew(catalog.addedAt, now) ? <span className="card-badge badge-gray">新</span> : null;
  const title = <strong style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>{name}</strong>;

  if (density === "compact") {
    return (
      <article className="tool-card" data-density="compact" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px" }}>
        <span style={{ color: "var(--text-muted)" }}>{icon}</span>
        <span style={{ flex: 1, minWidth: 0 }}>{title}</span>
        {fresh}{badge}{button}
      </article>
    );
  }
  if (density === "row") {
    return (
      <article className="card tool-card" data-density="row" style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 16px" }}>
        <span style={{ color: "var(--text-muted)" }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{title}{fresh}<span style={{ fontSize: 12, color: "var(--text-muted)" }}>{CATEGORY_NAMES[catalog.category]}</span></div>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>{catalog.blurb}</p>
          {reason}{note}
        </div>
        {badge}{button}
      </article>
    );
  }
  return (
    <article className="card tool-card" data-density="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ color: "var(--text-muted)" }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>{title}{" "}{fresh}</div>
        {badge}
      </div>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>{catalog.blurb}</p>
      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{CATEGORY_NAMES[catalog.category]}</span>
      {reason}{note}
      {button}
    </article>
  );
}
