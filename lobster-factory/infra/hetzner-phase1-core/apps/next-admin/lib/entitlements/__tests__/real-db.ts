// Shared by the real-database suites that tests/e2e/entitlements/entitlements-real-db.py runs (ENTITLEMENTS_REST set).
import { createHmac } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";

export function serviceToken(secret: string): string {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const body = `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ role: "service_role", exp: Math.floor(Date.now() / 1000) + 3600 })}`;
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}

/** supabase-js calls <url>/rest/v1/...; bare PostgREST serves at /. Sets SUPABASE_URL and the service-role key. */
export async function startRestProxy(rest: string): Promise<http.Server> {
  const target = new URL(rest);
  const proxy = http.createServer((req, res) => {
    const up = http.request({ host: target.hostname, port: target.port, method: req.method, headers: req.headers,
      path: (req.url ?? "/").replace(/^\/rest\/v1/, "") || "/" }, (r) => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res); });
    up.on("error", () => { res.writeHead(502); res.end(); });
    req.pipe(up);
  });
  await new Promise<void>((ok) => proxy.listen(0, "127.0.0.1", ok));
  Object.assign(process.env, {
    SUPABASE_URL: `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`,
    SUPABASE_SERVICE_ROLE_KEY: serviceToken(process.env.ENTITLEMENTS_JWT_SECRET as string),
  });
  return proxy;
}
