"use client";
// Staff-only (/tools/mockup): MockupStudio plus the Printful catalog, which no door serves yet. A door page renders
// MockupStudio without this file, so its import closure names no /api/tools/printful route (step-8 card §2 S1).
import MockupStudio, { type CatalogProduct } from "./MockupStudio";

async function loadCatalog(): Promise<CatalogProduct[] | null> {
  const res = await fetch("/api/tools/printful/catalog", { cache: "no-store" });
  const json = (await res.json()) as { ok: boolean; products?: CatalogProduct[] };
  return json.ok && json.products ? json.products : null;
}

export default function MockupStudioStaff() {
  return <MockupStudio loadCatalog={loadCatalog} />;
}
