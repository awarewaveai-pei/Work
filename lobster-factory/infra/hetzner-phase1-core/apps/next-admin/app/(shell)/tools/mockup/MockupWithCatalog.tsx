"use client";
// MockupStudio plus the public Printful catalog (/api/tools/printful/catalog, a design door API; printful/sync stays staff-only).
// /tools/mockup and the design door's mockup page both render this; MockupStudio itself names no catalog route.
import MockupStudio, { type CatalogProduct } from "./MockupStudio";

async function loadCatalog(): Promise<CatalogProduct[] | null> {
  const res = await fetch("/api/tools/printful/catalog", { cache: "no-store" });
  const json = (await res.json()) as { ok: boolean; products?: CatalogProduct[] };
  return json.ok && json.products ? json.products : null;
}

export default function MockupWithCatalog() {
  return <MockupStudio loadCatalog={loadCatalog} />;
}
