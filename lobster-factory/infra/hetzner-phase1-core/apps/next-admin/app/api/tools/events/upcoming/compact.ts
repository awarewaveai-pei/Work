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
}

const SPORTS_RELATED_MEGA_SUBCATEGORIES = new Set(["world_cup", "olympics", "sports_final"]);
const CULTURAL_HOLIDAY_SUBCATEGORIES = new Set(["holiday_major"]);

export function eventMatchesCategoryFilter(
  row: Pick<UpcomingEventRow, "category" | "subcategory">,
  category: UpcomingEventRow["category"],
): boolean {
  if (row.category === category) return true;
  if (category === "sports") {
    return row.category === "mega" && SPORTS_RELATED_MEGA_SUBCATEGORIES.has(row.subcategory ?? "");
  }
  if (category === "cultural") {
    return row.category === "holiday" && CULTURAL_HOLIDAY_SUBCATEGORIES.has(row.subcategory ?? "");
  }
  return false;
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
