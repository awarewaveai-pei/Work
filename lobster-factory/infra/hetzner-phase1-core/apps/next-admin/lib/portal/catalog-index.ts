// Public catalog index (U26, blueprint §3.0 / §4.5): the registry turned into what a public page or the search box may
// show. Pure: no React, no server imports (scripts/export-catalog.mjs loads it through tsx). Written to catalog.json beside
// this file; lib/portal/__tests__/catalog-index.test.ts fails when that file differs from a fresh export.
// Allow-list on purpose: price, billing, limitKind, buyout, login sources and staff paths never leave the registry.
import { CATEGORY_NAMES, TASKS, type CatalogCategory, type CatalogIcon } from "./catalog-vocab";
import { PRODUCTS, featureCatalog, type FeatureCatalog, type PortalProduct } from "./products";

export interface CatalogTask { key: string; name: string; synonyms: readonly string[] }
export interface CatalogProductEntry {
  key: string;
  name: string;
  category: CatalogCategory;
  categoryName: string;
  tasks: readonly CatalogTask[];
  blurb: string;
  icon: CatalogIcon;
  keywords: readonly string[];
  addedAt: string;
  // The door's subdomain only: the host is productHost(subdomain) at the reader (ADR 018, no domain in data).
  door: { subdomain: string };
}
export interface CatalogFeatureEntry extends CatalogProductEntry { product: string }
export interface CatalogIndex {
  schemaVersion: 1;
  source: "lib/portal/products.ts";
  products: readonly CatalogProductEntry[];
  features: readonly CatalogFeatureEntry[];
}

// A cognitive method's blurb is the Chinese part of its name. Some names are still the method contract's English title
// ("ai.draft_record -- Plain-language brief ..."): no Han segment there, so the product's blurb stands in.
// A Chinese name carrying an acronym ("SWOT 分析", "ICE 評分法") is Chinese and kept whole.
export function chineseBlurb(name: string, fallback: string): string {
  const zh = name.split(" -- ").map((s) => s.trim()).find((s) => /\p{Script=Han}/u.test(s));
  return zh ?? fallback;
}

const byKey = <T extends { key: string }>(a: T, b: T) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
const tasksOf = (keys: readonly string[]): CatalogTask[] =>
  keys.map((key) => {
    const t = TASKS[key];
    if (!t) throw new Error(`unknown task key: ${key}`);
    return { key, name: t.name, synonyms: [...t.synonyms] };
  });
const entry = (key: string, name: string, c: FeatureCatalog, p: PortalProduct): CatalogProductEntry => ({
  key, name, category: c.category, categoryName: CATEGORY_NAMES[c.category], tasks: tasksOf(c.tasks), blurb: c.blurb,
  icon: c.icon, keywords: [...(c.keywords ?? [])], addedAt: c.addedAt, door: { subdomain: p.subdomain },
});

export function buildCatalogIndex(products: readonly PortalProduct[] = PRODUCTS): CatalogIndex {
  const productEntries = products.map((p) => entry(p.key, p.name, p.catalog, p));
  const featureEntries = products.flatMap((p) => p.features.map((f): CatalogFeatureEntry => {
    const c = featureCatalog(p, f);
    const blurb = p.key === "cognitive" && !f.catalog?.blurb ? chineseBlurb(f.name, c.blurb) : c.blurb;
    return { ...entry(f.feature_key, f.name, { ...c, blurb }, p), product: p.key };
  }));
  return {
    schemaVersion: 1, source: "lib/portal/products.ts",
    products: productEntries.sort(byKey), features: featureEntries.sort(byKey),
  };
}

// The exact bytes of catalog.json; the export script and the diff test both use this, so they cannot disagree.
export const encodeCatalogIndex = (index: CatalogIndex): string => JSON.stringify(index, null, 2) + "\n";
