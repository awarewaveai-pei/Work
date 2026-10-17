// Where each screen of the social manager lives (SOCIAL_MANAGER_PLAN.md C19; ADR 016 §5 decisions 2, 3, 5).
// The keys are the mock's data-view values; __tests__/mock-parity.test.ts fails when the mock and these drift apart.
// Sections and the composer are routes; the six plan tabs, the log (bell) and settings (gear) are views of the plan page.

/** The top bar, in the mock's order; "plan" is the app's root, every other section is `<root>/<key>`. */
export const SECTIONS = [
  { key: "analytics", label: "數據分析", icon: "chart" },
  { key: "reporting", label: "報表管理", icon: "report" },
  { key: "inbox", label: "訊息收件匣", icon: "inbox" },
  { key: "plan", label: "貼文排程", icon: "calendar" },
  { key: "smartlinks", label: "智慧連結", icon: "link" },
  { key: "ads", label: "廣告管理", icon: "megaphone" },
] as const;
export type Section = (typeof SECTIONS)[number]["key"];
export type OtherSection = Exclude<Section, "plan">;

/** 貼文排程's six tabs; the calendar tab holds week and month (its .seg). */
export const PLAN_TABS = [
  { key: "week", label: "排程日曆" },
  { key: "list", label: "貼文清單" },
  { key: "library", label: "貼文素材庫" },
  { key: "lists", label: "自動發布清單" },
  { key: "trash", label: "已刪除貼文" },
  { key: "flows", label: "自動化流程" },
] as const;
export const VIEWS = ["week", "month", "list", "library", "lists", "trash", "flows", "log", "settings"] as const;
export type View = (typeof VIEWS)[number];
export const isView = (v: string | null): v is View => !!v && (VIEWS as readonly string[]).includes(v);
/** the tab a view lights up (month is the calendar tab; log and settings light none) */
export const tabOf = (v: View): string | null => (v === "month" ? "week" : PLAN_TABS.some((t) => t.key === v) ? v : null);

/** The composer's own page (decision 5): `<root>/compose/new` or `<root>/compose/<post id>`. */
export const COMPOSE = "compose";

export type SocialRoute = { kind: "plan" } | { kind: "section"; section: OtherSection } | { kind: "compose"; postId: string | null };

/** The app's root on the URL in the address bar: staff /tools/social, the door's /social, or the door host itself,
 *  where middleware rewrites /x to /social/x without changing the address (lib/portal/doors.ts routeOnProductDoor). */
export function socialBase(pathname: string): string {
  for (const b of ["/tools/social", "/social"]) if (pathname === b || pathname.startsWith(`${b}/`)) return b;
  return "";
}

export function routeHref(base: string, route: SocialRoute, params: Record<string, string | null | undefined> = {}): string {
  const seg = route.kind === "plan" ? "" : route.kind === "section" ? `/${route.section}` : `/${COMPOSE}/${route.postId ?? "new"}`;
  const q = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1])).toString();
  return (`${base}${seg}` || "/") + (q ? `?${q}` : "");
}
