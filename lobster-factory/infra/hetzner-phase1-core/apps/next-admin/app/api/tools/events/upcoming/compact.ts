export interface UpcomingEventRow {
  id: string;
  title: string;
  title_zh: string | null;
  event_date: string;
  event_end_date: string | null;
  category: "sports" | "holiday" | "cultural" | "mega";
  emoji: string | null;
  marketing_window_start: string;
  marketing_lead_days: number;
  country_codes: string[] | null;
  region: string | null;
}

export function compactUpcomingEvents(rows: UpcomingEventRow[]): UpcomingEventRow[] {
  const byEvent = new Map<string, UpcomingEventRow>();
  for (const row of rows) {
    const key = [row.category, row.event_date, row.title_zh ?? row.title].join("\u0001");
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
