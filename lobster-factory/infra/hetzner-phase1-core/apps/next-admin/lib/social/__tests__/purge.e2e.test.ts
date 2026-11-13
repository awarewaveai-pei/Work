// D (2026-11-13) 永久刪除 against a real Postgres + PostgREST (the 0096-0116 schema, its cascades, guards and grants).
// Run only by tests/e2e/social/purge-real-db.sh, which starts both and sets PURGE_REST; skipped otherwise (npm test,
// the deploy gate). Brand a is the one the 0105 verify seeds.
import { createHmac } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const REST = process.env.PURGE_REST;
if (REST && !["127.0.0.1", "localhost"].includes(new URL(REST).hostname)) throw new Error(`PURGE_REST must be local, got ${REST}`);
const A = "00000000-0000-0000-0000-00000000000a";
const ACTOR = "ops:owner:e2e";

function serviceToken(secret: string): string {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const body = `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ role: "service_role", exp: Math.floor(Date.now() / 1000) + 3600 })}`;
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}

describe.skipIf(!REST)("永久刪除 against a real database", () => {
  let proxy: http.Server;
  let store: typeof import("../store");
  let sb: SupabaseClient;

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
    process.env.SUPABASE_SERVICE_ROLE_KEY = serviceToken(process.env.PURGE_JWT_SECRET as string);
    store = await import("../store");
    sb = (await import("@/lib/supabase-server")).getSupabaseWriteClient()!;
  });
  afterAll(() => new Promise<void>((ok) => proxy?.close(() => ok())));

  async function one<T>(q: PromiseLike<{ data: unknown; error: { message: string } | null }>, what: string): Promise<T> {
    const { data, error } = await q;
    if (error) throw new Error(`${what}: ${error.message}`);
    return data as T;
  }
  async function count(table: string, col: string, id: string): Promise<number> {
    const { count: n, error } = await sb.from(table).select(col, { count: "exact", head: true }).eq(col, id);
    if (error) throw new Error(`${table}: ${error.message}`);
    return n ?? 0;
  }
  async function fixtures(tag: string) {
    const account = await one<{ id: string }>(sb.from("social_accounts").insert({ organization_id: A, postiz_integration_id: `int-${tag}-${Date.now()}`, platform: "x", label: tag }).select("id").single(), "account");
    const media = await one<{ id: string }>(sb.from("social_media").insert({ organization_id: A, kind: "image", file_name: `${tag}.png`, storage_path: `a/${tag}.png`, created_by: ACTOR }).select("id").single(), "media");
    const label = await one<{ id: string }>(sb.from("social_tags").insert({ organization_id: A, name: `${tag}-${Date.now()}` }).select("id").single(), "tag");
    return { account: account.id, media: media.id, tag: label.id };
  }
  /** a post with a target, a media link, a comment, a tag and its own auto-reply rule */
  async function seedPost(state: "deleted" | "draft", body: string, f: { account: string; media: string; tag: string }): Promise<string> {
    const post = await one<{ id: string }>(sb.from("social_posts").insert({ organization_id: A, state, body, created_by: ACTOR,
      deleted_at: state === "deleted" ? new Date().toISOString() : null }).select("id").single(), "post");
    await one(sb.from("social_post_targets").insert({ organization_id: A, post_id: post.id, account_id: f.account }).select("id"), "target");
    await one(sb.from("social_post_media").insert({ organization_id: A, post_id: post.id, media_id: f.media }).select("post_id"), "media link");
    await one(sb.from("social_post_comments").insert({ organization_id: A, post_id: post.id, position: 0, body: "留言" }).select("id"), "comment");
    await one(sb.from("social_post_tags").insert({ organization_id: A, post_id: post.id, tag_id: f.tag }).select("post_id"), "post tag");
    await one(sb.from("social_auto_rules").insert({ organization_id: A, post_id: post.id, trigger: "comment", platforms: ["facebook"], action: "reply", reply: "謝謝" }).select("id"), "auto rule");
    return post.id;
  }
  const CHILDREN = ["social_post_targets", "social_post_media", "social_post_comments", "social_post_tags", "social_auto_rules"];

  it("a binned post is erased with all its own rows; the shared media item stays; the log has one purge row", async () => {
    const f = await fixtures("purge");
    const body = "這是一則要永久刪除的貼文，內容超過五十個字，用來確認稽核紀錄只留前五十個字，後面這些字不會出現在紀錄裡面喔。";
    const binned = await seedPost("deleted", body, f);
    const other = await seedPost("draft", "還在用同一張圖的草稿", f);

    await store.purgePost(A, binned, 1, ACTOR);

    expect(await count("social_posts", "id", binned)).toBe(0);
    for (const t of CHILDREN) {
      expect(await count(t, "post_id", binned), t).toBe(0);
      expect(await count(t, "post_id", other), `${t} of the other post`).toBe(1);
    }
    expect(await count("social_media", "id", f.media)).toBe(1);
    const log = await one<Array<{ action: string; actor: string; at: string; detail: { excerpt: string } }>>(
      sb.from("social_audit_log").select("action, actor, at, detail").eq("post_id", binned), "log");
    expect(log.map((r) => r.action)).toEqual(["purge"]);
    expect(log[0].actor).toBe(ACTOR);
    expect(log[0].at).toBeTruthy();
    expect(log[0].detail.excerpt).toBe(Array.from(body).slice(0, 50).join(""));
  });

  it("a post that is not in the bin is not erased (the DELETE's own guard); the log says the purge was aborted", async () => {
    const f = await fixtures("purge2");
    const draft = await seedPost("draft", "不在垃圾桶", f);
    await expect(store.purgePost(A, draft, 1, ACTOR)).rejects.toMatchObject({ status: 409 });
    expect(await count("social_posts", "id", draft)).toBe(1);
    for (const t of CHILDREN) expect(await count(t, "post_id", draft), t).toBe(1);
    const log = await one<Array<{ action: string }>>(sb.from("social_audit_log").select("action").eq("post_id", draft).order("id"), "log");
    expect(log.map((r) => r.action)).toEqual(["purge", "purge_aborted"]);
  });
});
