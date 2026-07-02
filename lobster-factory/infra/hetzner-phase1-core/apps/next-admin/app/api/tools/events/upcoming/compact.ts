import { eventMatchesFacetFilter } from "@/lib/events/facets";

export interface UpcomingEventRow {
  id: string;
  title: string;
  title_zh: string | null;
  event_date: string;
  event_end_date: string | null;
  category: "sports" | "holiday" | "cultural" | "mega";
  subcategory: string | null;
  emoji: string | null;
  marketing_window_start: string;
  marketing_lead_days: number;
  country_codes: string[] | null;
  region: string | null;
  synced_at?: string | null;
}

export function eventMatchesCategoryFilter(
  row: Pick<UpcomingEventRow, "category" | "subcategory">,
  category: UpcomingEventRow["category"],
): boolean {
  return eventMatchesFacetFilter(row as UpcomingEventRow, category);
}

export function compactUpcomingEvents(rows: UpcomingEventRow[]): UpcomingEventRow[] {
  const byEvent = new Map<string, UpcomingEventRow>();
  for (const row of rows) {
    const normalizedTitle = (row.title_zh ?? row.title).trim().toLowerCase().replace(/\s+/g, " ");
    const key = [row.category, row.subcategory ?? "", row.event_date, normalizedTitle].join("\u0001");
    const existing = byEvent.get(key);
    if (!existing) {
      byEvent.set(key, { ...row, country_codes: [...(row.country_codes ?? [])] });
      continue;
    }

    const countries = new Set([...(existing.country_codes ?? []), ...(row.country_codes ?? [])]);
    existing.country_codes = [...countries].sort();
  }

  return [...byEvent.values()];
}
