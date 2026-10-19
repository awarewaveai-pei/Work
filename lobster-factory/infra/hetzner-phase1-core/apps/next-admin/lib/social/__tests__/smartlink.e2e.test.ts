// C26 e2e (SOCIAL_MANAGER_PLAN.md §1b): add a link -> the public page shows it -> a click -> the count is +1, against a
// real Postgres + PostgREST. Run only by tests/e2e/social/smartlink-real-db.sh, which starts both and sets SMARTLINK_REST;
// skipped otherwise (npm test, the deploy gate). Brands a / b are the ones the 0105 verify seeds.
import { createHmac } from "node:crypto";
import { writeFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

const REST = process.env.SMARTLINK_REST;
const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const SLUG = "e2e-soulful";

/** a service_role token PostgREST accepts (HS256 with the secret the script gave it) */
function serviceToken(secret: string): string {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const body = `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ role: "service_role", exp: Math.floor(Date.now() / 1000) + 3600 })}`;
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}

describe.skipIf(!REST)("smart link against a real database", () => {
  let proxy: http.Server;
  let lib: typeof import("../smartlink");
  let Page: (p: { params: Promise<{ slug: string }> }) => Promise<ReactElement>;
  let GET: (req: Request, ctx: { params: Promise<{ slug: string; item: string }> }) => Promise<Response>;

  beforeAll(async () => {
    // supabase-js calls <url>/rest/v1/...; PostgREST serves at its root
    const target = new URL(REST as string);
    proxy = http.createServer((req, res) => {
      const up = http.request({ host: target.hostname, port: target.port, method: req.method, headers: req.headers,
        path: (req.url ?? "/").replace(/^\/rest\/v1/, "") || "/" }, (r) => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res); });
      up.on("error", () => { res.writeHead(502); res.end(); });
      req.pipe(up);
    });
    await new Promise<void>((ok) => proxy.listen(0, "127.0.0.1", ok));
    process.env.SUPABASE_URL = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
    process.env.SUPABASE_SERVICE_ROLE_KEY = serviceToken(process.env.SMARTLINK_JWT_SECRET as string);
    lib = await import("../smartlink");
    Page = (await import("../../../app/(public)/smartlink/[slug]/page")).default;
    GET = (await import("../../../app/(public)/smartlink/[slug]/go/[item]/route")).GET;
  });
  afterAll(() => new Promise<void>((ok) => proxy?.close(() => ok())));

  const visit = (item: string, ip: string) => GET(new Request(`http://social.test/smartlink/${SLUG}/go/${item}`,
    { headers: { "user-agent": "Mozilla/5.0 (e2e)", "x-real-ip": ip } }), { params: Promise.resolve({ slug: SLUG, item }) });

  it("add a link -> the public page shows it -> a click -> the count is +1", async () => {
    const link = { slug: SLUG, title: "Soulful Expression", bio: "用畫畫說出說不出口的事", colour: "c" as const, published: true };
    await lib.saveSmartLink(A, link, [{ title: "官網", url: "https://soulful.example", active: true }], "ops:owner:e2e");
    let { items } = await lib.getSmartLink(A);
    await lib.saveSmartLink(A, link, [...items.map(({ id, title, url, active }) => ({ id, title, url, active })),
      { title: "報名表", url: "https://soulful.example/sat", active: true }], "ops:owner:e2e");   // 加連結
    ({ items } = await lib.getSmartLink(A));
    const sat = items.find((i) => i.title === "報名表");
    expect(sat?.clicks).toBe(0);

    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ slug: SLUG }) }));
    expect(html).toContain("報名表");
    expect(html).toContain(`/smartlink/${SLUG}/go/${sat?.id}`);
    expect(html).not.toContain("soulful.example");   // urls only after the click
    expect(html).not.toContain(A);
    if (process.env.SMARTLINK_DUMP) writeFileSync(process.env.SMARTLINK_DUMP, html);   // to look at it (render-smartlinks)

    const res = await visit(sat!.id, "198.51.100.10");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://soulful.example/sat");
    expect((await lib.getSmartLink(A)).items.find((i) => i.id === sat!.id)?.clicks).toBe(1);

    expect((await visit(sat!.id, "198.51.100.10")).status).toBe(302);   // the same visitor again: sent on, not counted
    expect((await lib.getSmartLink(A)).items.find((i) => i.id === sat!.id)?.clicks).toBe(1);
    await visit(sat!.id, "198.51.100.11");                               // another visitor: the same day's row, n + 1
    expect((await lib.getSmartLink(A)).items.find((i) => i.id === sat!.id)?.clicks).toBe(2);
  });

  it("a slug another brand has is refused; an unpublished page shows nothing and counts nothing", async () => {
    const e = await lib.saveSmartLink(B, { slug: SLUG, title: "", bio: "", colour: "a", published: true }, [], "ops:owner:e2e").catch((x) => x);
    expect(e.status).toBe(409);

    const { link, items } = await lib.getSmartLink(A);
    await lib.saveSmartLink(A, { ...link!, published: false }, items.map(({ id, title, url, active }) => ({ id, title, url, active })), "ops:owner:e2e");
    await expect(Page({ params: Promise.resolve({ slug: SLUG }) })).rejects.toThrow();   // notFound(): 這頁還沒開放
    const before = (await lib.getSmartLink(A)).items[0].clicks;
    expect((await visit(items[0].id, "198.51.100.12")).status).toBe(404);
    expect((await lib.getSmartLink(A)).items[0].clicks).toBe(before);
  });
});
