export type EventCategory = "sports" | "holiday" | "cultural" | "mega";

export type EventSource = "calendarific" | "thesportsdb" | "hardcoded";

export interface GlobalEvent {
  title: string;
  title_zh?: string;
  event_date: string;          // ISO date YYYY-MM-DD
  event_end_date?: string;
  category: EventCategory;
  subcategory?: string;        // "nfl" | "halloween" | "diwali" ...
  country_codes: string[];
  region?: string;
  marketing_lead_days: number; // how many days before event the window opens
  source: EventSource;
  external_id: string;         // unique dedup key
  emoji?: string;
}

/** Marketing window = derived from event_date - marketing_lead_days */
export interface EventRow extends GlobalEvent {
  id: string;
  marketing_window_start: string;
  marketing_window_end: string;
  is_active: boolean;
  synced_at: string;
  created_at: string;
}

/** Lead-time rules by category/subcategory */
export const LEAD_DAYS: Record<string, number> = {
  mega: 90,
  holiday_major: 90,   // Christmas, CNY, Halloween, Valentine's
  sports_final: 60,    // Super Bowl, NBA/MLB/NHL Finals
  sports_season: 45,
  commercial: 60,
  family: 60,
  national: 45,
  religious: 60,
  holiday: 45,
  sports: 30,
  cultural: 45,
};

export function calcLeadDays(category: EventCategory, subcategory?: string): number {
  if (category === "mega") return LEAD_DAYS.mega;
  if (subcategory && LEAD_DAYS[subcategory]) return LEAD_DAYS[subcategory];
  return LEAD_DAYS[category] ?? 45;
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
