// The top-bar search index (U18), built on the server by app/PlatformFrame.tsx and handed to app/SearchBox.tsx.
// Products and features come only from buildCatalogIndex() (U26: what a customer can use); pages from each listed
// product's door.nav. Links are https://productHost(...) -- no domain in code (ADR 018).
import { TASKS } from "./catalog-vocab";
import { buildCatalogIndex } from "./catalog-index";
import { productHost } from "./hosts";
import { PRODUCTS } from "./products";
import type { SearchIndex, SearchItem } from "./search";

type Env = Record<string, string | undefined>;

export function buildSearchIndex(env: Env = process.env): SearchIndex {
  const catalog = buildCatalogIndex();
  const listed = new Map(catalog.products.map((p) => [p.key, p]));
  const origin = new Map<string, string>(PRODUCTS.filter((p) => listed.has(p.key)).map((p) => [p.key, `https://${productHost(p, env)}`]));
  const used = new Set<string>();
  const taskKeys = (tasks: readonly { key: string }[]) => tasks.map((t) => (used.add(t.key), t.key));

  const items: SearchItem[] = [];
  for (const p of catalog.products) {
    items.push({ group: "product", key: p.key, name: p.name, crumb: [p.name], tasks: taskKeys(p.tasks), keywords: p.keywords,
      blurb: p.blurb, category: p.categoryName, href: `${origin.get(p.key)}/` });
  }
  for (const f of catalog.features) {
    const p = listed.get(f.product)!;
    items.push({ group: "feature", key: f.key, name: f.name, crumb: [p.name, f.name], tasks: taskKeys(f.tasks), keywords: f.keywords,
      // a feature that inherits its product's line adds nothing to search but bytes
      blurb: f.blurb === p.blurb ? "" : f.blurb, category: f.categoryName, href: `${origin.get(p.key)}/` });
  }
  for (const p of PRODUCTS) {
    const entry = listed.get(p.key);
    if (!entry || p.door.app !== "next-admin" || p.door.enabled === false) continue;
    for (const n of p.door.nav ?? []) {
      items.push({ group: "page", key: `${p.key}:${n.path}`, name: n.name, crumb: [entry.name, n.name], tasks: [], keywords: [],
        blurb: "", category: entry.categoryName, href: `${origin.get(p.key)}/${n.path}` });
    }
  }
  const tasks = Object.fromEntries([...used].sort().map((k) => [k, TASKS[k]]));
  return { tasks, items };
}
