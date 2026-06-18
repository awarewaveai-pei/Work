import { NextResponse } from "next/server";
import { fetchCatalogProducts } from "@/lib/studio/printful-catalog";

/** GET /api/tools/printful/catalog
 *  Returns Printful product catalog with images — cached 1h server-side.
 */
export async function GET() {
  const products = await fetchCatalogProducts();
  if (products.length === 0) {
    return NextResponse.json({ ok: false, error: "catalog_unavailable" }, { status: 503 });
  }
  return NextResponse.json({ ok: true, products });
}
