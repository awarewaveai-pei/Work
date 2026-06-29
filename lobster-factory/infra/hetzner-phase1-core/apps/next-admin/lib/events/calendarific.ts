import { type GlobalEvent, calcLeadDays } from "./types";

const BASE = "https://calendarific.com/api/v2";

/** 20 countries with commercially interesting / visually distinct holidays for POD. */
export const CALENDARIFIC_COUNTRIES = [
  // Americas
  { code: "US", region: "americas" },
  { code: "MX", region: "americas" },
  { code: "BR", region: "americas" },
  { code: "AR", region: "americas" },
  // Europe
  { code: "GB", region: "europe" },
  { code: "DE", region: "europe" },
  { code: "FR", region: "europe" },
  { code: "IE", region: "europe" },
  { code: "ES", region: "europe" },
  { code: "IT", region: "europe" },
  // Asia
  { code: "JP", region: "asia" },
  { code: "KR", region: "asia" },
  { code: "TW", region: "asia" },
  { code: "CN", region: "asia" },
  { code: "IN", region: "asia" },
  { code: "TH", region: "asia" },
  // Africa / Middle East / Oceania
  { code: "NG", region: "africa" },
  { code: "ZA", region: "africa" },
  { code: "AU", region: "oceania" },
  { code: "SA", region: "mideast" },
] as const;

/** Holiday types worth syncing (skip generic "observance" noise). */
const INCLUDE_TYPES = new Set(["National holiday", "Local holiday", "Religious holiday"]);

/** Keywords that mark a holiday as "major" → longer marketing lead. */
const MAJOR_HOLIDAY_KEYWORDS = [
  "christmas", "new year", "春節", "lunar", "halloween", "valentine",
  "thanksgiving", "diwali", "carnival", "eid",
];

interface CalendarificHoliday {
  name: string;
  description?: string;
  date: { iso: string };
  type: string[];
  countries?: string[];
}

interface CalendarificResponse {
  response: { holidays: CalendarificHoliday[] };
  meta: { code: number };
}

export async function fetchCountryHolidays(
  apiKey: string,
  countryCode: string,
  year: number
): Promise<GlobalEvent[]> {
  const url = `${BASE}/holidays?api_key=${apiKey}&country=${countryCode}&year=${year}`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`Calendarific ${countryCode}/${year}: HTTP ${res.status}`);
  const data = (await res.json()) as CalendarificResponse;
  if (data.meta.code !== 200) throw new Error(`Calendarific API error code ${data.meta.code}`);

  const country = CALENDARIFIC_COUNTRIES.find(c => c.code === countryCode);
  const region = country?.region ?? "global";

  return data.response.holidays
    .filter(h => h.type.some(t => INCLUDE_TYPES.has(t)))
    .map(h => {
      const nameLower = h.name.toLowerCase();
      const isMajor = MAJOR_HOLIDAY_KEYWORDS.some(kw => nameLower.includes(kw));
      const subcategory = isMajor ? "holiday_major" : "holiday";
      return {
        title: h.name,
        event_date: h.date.iso.slice(0, 10),
        category: "holiday" as const,
        subcategory,
        country_codes: [countryCode],
        region,
        marketing_lead_days: calcLeadDays("holiday", subcategory),
        source: "calendarific" as const,
        external_id: `cal:${countryCode}:${h.date.iso.slice(0, 10)}:${h.name.replace(/\s+/g, "_").slice(0, 40)}`,
        emoji: "🎉",
      };
    });
}

/** Fetch all 20 countries for a given year. Rate-limit safe: sequential with 200ms gap. */
export async function fetchAllCountries(
  apiKey: string,
  year: number,
  onProgress?: (msg: string) => void
): Promise<GlobalEvent[]> {
  const all: GlobalEvent[] = [];
  for (const c of CALENDARIFIC_COUNTRIES) {
    try {
      const holidays = await fetchCountryHolidays(apiKey, c.code, year);
      all.push(...holidays);
      onProgress?.(`✓ ${c.code}: ${holidays.length} holidays`);
    } catch (err) {
      onProgress?.(`✗ ${c.code}: ${String(err)}`);
    }
    await new Promise(r => setTimeout(r, 200));
  }
  return all;
}
