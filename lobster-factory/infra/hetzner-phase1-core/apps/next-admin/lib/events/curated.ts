import { type GlobalEvent, calcLeadDays } from "./types";

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number): Date {
  const first = utcDate(year, month, 1);
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return utcDate(year, month, 1 + offset + (nth - 1) * 7);
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
  const last = utcDate(year, month + 1, 0);
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  return utcDate(year, month, last.getUTCDate() - offset);
}

function fixedEvent(args: {
  title: string;
  title_zh?: string;
  event_date: string;
  event_end_date?: string;
  category: GlobalEvent["category"];
  subcategory: string;
  country_codes: string[];
  region: string;
  emoji: string;
}): GlobalEvent {
  return {
    ...args,
    marketing_lead_days: calcLeadDays(args.category, args.subcategory),
    source: "curated",
    external_id: `curated:${args.subcategory}:${args.event_date}:${args.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
  };
}

export function buildCuratedEventsForYear(year: number): GlobalEvent[] {
  const mothersDay = nthWeekdayOfMonth(year, 5, 0, 2);
  const fathersDay = nthWeekdayOfMonth(year, 6, 0, 3);
  const thanksgiving = nthWeekdayOfMonth(year, 11, 4, 4);
  const blackFriday = addDays(thanksgiving, 1);
  const cyberMonday = addDays(thanksgiving, 4);
  const nflKickoff = addDays(nthWeekdayOfMonth(year, 9, 1, 1), 3);
  const mlbOpening = lastWeekdayOfMonth(year, 3, 4);
  const nbaTipoff = nthWeekdayOfMonth(year, 10, 2, 3);

  return [
    fixedEvent({
      title: "Valentine's Day",
      title_zh: "情人節",
      event_date: `${year}-02-14`,
      category: "holiday",
      subcategory: "commercial",
      country_codes: ["global"],
      region: "global",
      emoji: "💘",
    }),
    fixedEvent({
      title: "Mother's Day",
      title_zh: "母親節",
      event_date: iso(mothersDay),
      category: "holiday",
      subcategory: "family",
      country_codes: ["US", "CA", "AU", "JP", "TW"],
      region: "global",
      emoji: "🌷",
    }),
    fixedEvent({
      title: "Father's Day",
      title_zh: "父親節",
      event_date: iso(fathersDay),
      category: "holiday",
      subcategory: "family",
      country_codes: ["US", "CA", "GB", "JP"],
      region: "global",
      emoji: "👔",
    }),
    fixedEvent({
      title: "Taiwan Father's Day",
      title_zh: "台灣父親節",
      event_date: `${year}-08-08`,
      category: "holiday",
      subcategory: "family",
      country_codes: ["TW"],
      region: "asia",
      emoji: "👔",
    }),
    fixedEvent({
      title: "Pride Month",
      title_zh: "Pride Month",
      event_date: `${year}-06-01`,
      event_end_date: `${year}-06-30`,
      category: "cultural",
      subcategory: "cultural",
      country_codes: ["global"],
      region: "global",
      emoji: "🌈",
    }),
    fixedEvent({
      title: "Halloween",
      title_zh: "萬聖節",
      event_date: `${year}-10-31`,
      category: "cultural",
      subcategory: "cultural",
      country_codes: ["global"],
      region: "global",
      emoji: "🎃",
    }),
    fixedEvent({
      title: "Dia de Muertos",
      title_zh: "亡靈節",
      event_date: `${year}-11-01`,
      event_end_date: `${year}-11-02`,
      category: "cultural",
      subcategory: "cultural",
      country_codes: ["MX"],
      region: "americas",
      emoji: "💀",
    }),
    fixedEvent({
      title: "Singles' Day",
      title_zh: "雙十一",
      event_date: `${year}-11-11`,
      category: "holiday",
      subcategory: "commercial",
      country_codes: ["CN", "global"],
      region: "global",
      emoji: "🛍️",
    }),
    fixedEvent({
      title: "Black Friday",
      title_zh: "黑色星期五",
      event_date: iso(blackFriday),
      category: "holiday",
      subcategory: "commercial",
      country_codes: ["US", "CA", "GB", "AU", "global"],
      region: "global",
      emoji: "🛒",
    }),
    fixedEvent({
      title: "Cyber Monday",
      title_zh: "網購星期一",
      event_date: iso(cyberMonday),
      category: "holiday",
      subcategory: "commercial",
      country_codes: ["US", "CA", "GB", "AU", "global"],
      region: "global",
      emoji: "💻",
    }),
    fixedEvent({
      title: "MLB Opening Day",
      title_zh: "MLB 開幕週",
      event_date: iso(mlbOpening),
      category: "sports",
      subcategory: "sports_season",
      country_codes: ["US", "CA"],
      region: "americas",
      emoji: "⚾",
    }),
    fixedEvent({
      title: "NFL Season Kickoff",
      title_zh: "NFL 賽季開幕",
      event_date: iso(nflKickoff),
      category: "sports",
      subcategory: "sports_season",
      country_codes: ["US"],
      region: "americas",
      emoji: "🏈",
    }),
    fixedEvent({
      title: "NBA Season Tip-Off",
      title_zh: "NBA 賽季開幕",
      event_date: iso(nbaTipoff),
      category: "sports",
      subcategory: "sports_season",
      country_codes: ["US", "CA", "global"],
      region: "global",
      emoji: "🏀",
    }),
  ];
}

export function buildCuratedEvents(years: readonly number[]): GlobalEvent[] {
  return years.flatMap((year) => buildCuratedEventsForYear(year));
}
