// Top-bar search (U18, blueprint §4.5 / §3.6): matching runs in the browser over an index the frame builds on the server
// (lib/portal/search-index.ts). Pure, no registry import, so the browser bundle does not carry products.ts.
// Text is compared normalised: lower case, no whitespace. Chinese also matches by bigrams (every 2-character piece of the
// query found somewhere in the item) so word order and an extra character do not lose the hit.

export type SearchGroup = "product" | "feature" | "page";
export interface SearchItem {
  group: SearchGroup;
  key: string;
  name: string;
  crumb: readonly string[];   // 內容行銷 › 文章人性化 (the item itself is last)
  tasks: readonly string[];   // keys of SearchIndex.tasks
  keywords: readonly string[];
  blurb: string;
  category: string;           // shown category name
  href: string;
}
export interface SearchIndex {
  tasks: Readonly<Record<string, { name: string; synonyms: readonly string[] }>>;
  items: readonly SearchItem[];
}
export interface SearchResult { group: SearchGroup; items: SearchItem[] }

export const GROUP_NAMES: Readonly<Record<SearchGroup, string>> = { product: "產品", feature: "功能", page: "頁面" };
const GROUP_ORDER: readonly SearchGroup[] = ["product", "feature", "page"];

export const normalize = (s: string): string => s.toLowerCase().replace(/\s+/g, "");
const bigrams = (s: string): string[] => {
  const out: string[] = [];
  for (let i = 0; i + 1 < s.length; i++) out.push(s.slice(i, i + 2));
  return out;
};
const hit = (q: string, texts: readonly string[]) => texts.some((t) => normalize(t).includes(q));

// Rank tiers (blueprint §4.5): exact name > name contains > task (name or synonym) > keyword > blurb/category > bigrams.
function score(item: SearchItem, q: string, index: SearchIndex): number {
  const name = normalize(item.name);
  if (name === q) return 6;
  if (name.includes(q)) return 5;
  const tasks = item.tasks.flatMap((k) => { const t = index.tasks[k]; return t ? [t.name, ...t.synonyms] : []; });
  if (hit(q, tasks)) return 4;
  if (hit(q, item.keywords)) return 3;
  if (hit(q, [item.blurb, item.category])) return 2;
  const grams = bigrams(q);
  if (grams.length < 2) return 0;
  const all = normalize([item.name, ...tasks, ...item.keywords, item.blurb, item.category].join("|"));
  return grams.every((g) => all.includes(g)) ? 1 : 0;
}

/** Ranked hits; a tie goes to the shorter name, then to product > feature > page. */
export function rankItems(index: SearchIndex, query: string): SearchItem[] {
  const q = normalize(query);
  if (!q) return [];
  return index.items
    .map((item) => ({ item, s: score(item, q, index) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || [...a.item.name].length - [...b.item.name].length
      || GROUP_ORDER.indexOf(a.item.group) - GROUP_ORDER.indexOf(b.item.group) || (a.item.key < b.item.key ? -1 : 1))
    .map((r) => r.item);
}

/** Hits grouped 產品／功能／頁面; a group comes where its best hit ranks, so the first item shown is the best one. */
export function searchCatalog(index: SearchIndex, query: string, perGroup = 6): SearchResult[] {
  const groups = new Map<SearchGroup, SearchItem[]>();
  for (const item of rankItems(index, query)) {
    const list = groups.get(item.group) ?? [];
    if (!groups.has(item.group)) groups.set(item.group, list);
    if (list.length < perGroup) list.push(item);
  }
  return [...groups].map(([group, items]) => ({ group, items }));
}

/** No-result paths (blueprint §3.6 ① ② ③): close task names, task entry points, every category. */
export function noResultHelp(index: SearchIndex, query: string): { near: string[]; tasks: string[]; categories: string[] } {
  const grams = new Set(bigrams(normalize(query)));
  const q = normalize(query);
  const near = Object.values(index.tasks)
    .filter((t) => [t.name, ...t.synonyms].some((s) => { const n = normalize(s); return bigrams(n).some((g) => grams.has(g)) || (q.length === 1 && n.includes(q)); }))
    .map((t) => t.name);
  const tasks: string[] = [];
  for (const item of index.items) {
    const first = item.group === "product" ? index.tasks[item.tasks[0]] : undefined;
    if (first && !tasks.includes(first.name)) tasks.push(first.name);
  }
  const categories = [...new Set(index.items.filter((i) => i.group === "product").map((i) => i.category))];
  return { near: [...new Set(near)].slice(0, 6), tasks: tasks.slice(0, 6), categories };
}
