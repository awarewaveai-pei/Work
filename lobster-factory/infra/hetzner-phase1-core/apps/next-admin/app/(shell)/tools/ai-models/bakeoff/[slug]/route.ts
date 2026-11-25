// GET /tools/ai-models/bakeoff/<slug>: one full bake-off page (internal test results) for the 實測紀錄 tab's iframe.
// A page path, so middleware signs the caller in and checks the tools/ai-models grant like the tab itself; staffOnly
// refuses a customer here too. The page is served sandboxed (CSP sandbox, no allow-same-origin): its scripts run, but
// it gets an opaque origin, so it reaches neither this app's cookies nor its same-origin APIs.
// The files reach the standalone image via outputFileTracingIncludes in next.config.ts.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { staffOnly } from "@/lib/tenant-guard";
import { isBakeoffSlug } from "../../bakeoff-pages";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const denied = staffOnly(req);
  if (denied) return denied;
  const { slug } = await params;
  if (!isBakeoffSlug(slug)) return new Response("Not found", { status: 404 });
  const html = await readFile(path.join(process.cwd(), "content", "model-bakeoff", slug, "index.html"));
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "sandbox allow-scripts",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-cache",
    },
  });
}
