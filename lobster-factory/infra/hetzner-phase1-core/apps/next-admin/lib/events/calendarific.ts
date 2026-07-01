import { type GlobalEvent, calcLeadDays } from "./types";
import { EVENT_SOURCE_COUNTRIES } from "./countries";

const BASE = "https://calendarific.com/api/v2";

export const CALENDARIFIC_COUNTRIES = EVENT_SOURCE_COUNTRIES;

/** Holiday types worth syncing. Generic observances are only included by keyword below. */
const INCLUDE_TYPES = new Set(["National holiday", "Local holiday", "Religious holiday"]);

/** Keywords that mark a holiday as "major" → longer marketing lead. */
const MAJOR_HOLIDAY_KEYWORDS = [
  "christmas", "new year", "春節", "lunar", "halloween", "valentine",
  "thanksgiving", "diwali", "carnival", "eid",
];

const OBSERVANCE_KEYWORDS = [
  ...MAJOR_HOLIDAY_KEYWORDS,
  "mother", "father", "pride", "black friday", "cyber monday", "singles",
  "dragon boat", "mid-autumn", "lantern", "day of the dead", "dia de muertos",
  "día de muertos", "songkran",
];

const FAMILY_KEYWORDS = ["mother", "father"];
const COMMERCIAL_KEYWORDS = ["valentine", "black friday", "cyber monday", "singles"];
const CULTURAL_KEYWORDS = [
  "diwali", "deepavali", "lunar", "halloween", "carnival", "eid", "pride",
  "dragon boat", "mid-autumn", "lantern", "day of the dead", "dia de muertos",
  "día de muertos", "songkran",
];
const NATIONAL_KEYWORDS = ["independence", "national day", "constitution", "republic", "liberation"];

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
    .filter(h => {
      const nameLower = h.name.toLowerCase();
      if (h.type.some(t => INCLUDE_TYPES.has(t))) return true;
      return h.type.includes("Observance") && OBSERVANCE_KEYWORDS.some(kw => nameLower.includes(kw));
    })
    .map(h => {
      const nameLower = h.name.toLowerCase();
      const isFamily = FAMILY_KEYWORDS.some(kw => nameLower.includes(kw));
      const isCommercial = COMMERCIAL_KEYWORDS.some(kw => nameLower.includes(kw));
      const isCultural = CULTURAL_KEYWORDS.some(kw => nameLower.includes(kw));
      const isNational = NATIONAL_KEYWORDS.some(kw => nameLower.includes(kw));
      const isMajor = MAJOR_HOLIDAY_KEYWORDS.some(kw => nameLower.includes(kw));
      const category = isCultural ? "cultural" as const : "holiday" as const;
      const subcategory = isFamily ? "family"
        : isCommercial ? "commercial"
        : isCultural ? "cultural"
        : isNational ? "national"
        : isMajor ? "holiday_major"
        : "holiday";
      return {
        title: h.name,
        event_date: h.date.iso.slice(0, 10),
        category,
        subcategory,
        country_codes: [countryCode],
        region,
        marketing_lead_days: calcLeadDays(category, subcategory),
        source: "calendarific" as const,
        external_id: `cal:${countryCode}:${h.date.iso.slice(0, 10)}:${h.name.replace(/\s+/g, "_").slice(0, 40)}`,
        emoji: isFamily ? "🌷" : isCommercial ? "🛍️" : isCultural ? "🎊" : "🎉",
      };
    });
}

/** Fetch curated tourism/POD countries for a given year. Rate-limit safe: sequential with 200ms gap. */
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
