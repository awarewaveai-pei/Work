// The container for ToolCards (blueprint §4.7: only this container changes when the catalog outgrows a grid).
import { ToolCard, type ToolCardProps, type ToolDensity } from "./ToolCard";

export interface ToolGridItem extends Omit<ToolCardProps, "density"> { key: string }

export function ToolGrid({ items, density = "card", now }: { items: readonly ToolGridItem[]; density?: ToolDensity; now?: Date }) {
  if (items.length === 0) return <p style={{ color: "var(--text-muted)" }}>沒有符合的工具</p>;
  const layout = density === "card" ? "card-grid" : "tool-list";
  return (
    <ul className={layout} style={{ listStyle: "none", padding: 0, ...(density === "card" ? {} : { display: "flex", flexDirection: "column", gap: 8 }) }}>
      {items.map(({ key, ...card }) => <li key={key}><ToolCard {...card} density={density} now={now} /></li>)}
    </ul>
  );
}
