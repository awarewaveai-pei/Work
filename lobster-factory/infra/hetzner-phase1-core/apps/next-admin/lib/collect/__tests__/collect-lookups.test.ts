// Collect lookups v1, next-admin's half. The contract is Projects/internal/cognitive-engineering-os/specs/wire/
// lookup.v1.json (frozen, one copy for both sides): its example requests must get exactly its example answers here,
// and every way a lookup can fail must be a cell that says 無法檢查 or 查不到 and why (R2, R3). No network: the
// registry, the archive, Cofacts, the feed and the mirror are fakes.

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createBudget } from "@/lib/collect/budget";
import { createCollectFetch } from "@/lib/collect/net/fetcher";
import { RateLimiter } from "@/lib/collect/net/rate-limit";
import { parseLookupRequest, type LookupRequest } from "@/lib/collect/lookups/contract";
import { RdapCache, archiveReplayUrl, registrable, type LookupFetch } from "@/lib/collect/lookups/describe";
import { FACTCHECK, RDAP_BASES, RDAP_NOT_LISTED } from "@/lib/collect/lookups/lists";
import {
  lookupClaimReview,
  normalise,
  pieces,
  queryPieces,
  refreshClaimReview,
  reviewsOf,
  scanFeed,
  share,
  type ClaimReviewRow,
  type ClaimReviewStore,
} from "@/lib/collect/lookups/claimreview";
import { answerLookup, refreshClaimReviewIfDue, type LookupDeps } from "@/lib/collect/lookups/answer";
import COMMON_PIECE_LIST from "@/lib/collect/lookups/claimreview-common-pieces.json";

// apps/next-admin/lib/collect/__tests__ -> repo root is eight levels up.
const SPEC_PATH = path.resolve(__dirname, "../../../../../../../..", "Projects/internal/cognitive-engineering-os/specs/wire/lookup.v1.json");
const spec = JSON.parse(fs.readFileSync(SPEC_PATH, "utf8"));
const EX = spec.examples;

type Reply = Response | Error | ((init?: { method?: string; body?: string }) => Response | Error | Promise<Response>);

/** The outside world: answers by exact URL; anything not listed is a test failure, never a silent 404. */
function world(replies: Record<string, Reply>, calls: string[] = []): LookupFetch {
  return async (url, init) => {
    calls.push(url);
    const reply = replies[url];
    if (reply === undefined) throw new Error(`unexpected outside call ${url}`);
    const answered = typeof reply === "function" ? await reply(init) : reply;
    if (answered instanceof Error) throw answered;
    return answered;
  };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const archiveUrl = archiveReplayUrl;
const noCapture = () => new Response(null, { status: 404 });
const captured = (stamp: string) => new Response(null, { status: 302, headers: { location: `https://web.archive.org/web/${stamp}/http://x.example/` } });
const rdapRecord = (date: string, cc?: string) => ({
  events: [{ eventAction: "registration", eventDate: date }],
  entities: [{ roles: ["registrant"], vcardArray: ["vcard", [["adr", { cc: cc ?? "REDACTED FOR PRIVACY" }, "text", ["", "", "", "", "", "", ""]]]] }],
});

function deps(fetch: LookupFetch, extra: Partial<LookupDeps> = {}): LookupDeps {
  return { fetch, claimreview: null, cache: new RdapCache(), ...extra };
}

function parsed(body: unknown): LookupRequest {
  const p = parseLookupRequest(body);
  if (p.ok === false) throw new Error(p.error);
  return p.value;
}

/** A mirror held in memory with the store contract (migration 0095): finish = exact count + pointer, fail records,
 *  prune deletes other generations a batch at a time. It holds no feed-size policy: that is refreshClaimReview's. */
function memoryStore(): ClaimReviewStore & { rows: Map<number, ClaimReviewRow[]>; current: number | null; errors: string[]; batches: number[]; pruned: number } {
  const rows = new Map<number, ClaimReviewRow[]>();
  const store = {
    rows,
    current: null as number | null,
    errors: [] as string[],
    batches: [] as number[],
    pruned: 0,
    async candidates(wanted: string[]) {
      if (store.current === null) return { kind: "no_mirror" as const };
      const set = new Set(wanted);
      return { kind: "rows" as const, rows: (rows.get(store.current) ?? []).filter((r) => [...pieces(r.norm)].some((p) => set.has(p))) };
    },
    async beginRefresh() {
      return true;
    },
    async currentReviews() {
      return store.current === null ? null : (rows.get(store.current) ?? []).length;
    },
    async prune(batch: number) {
      let left = batch;
      for (const g of [...rows.keys()]) {
        if (g === store.current || left === 0) continue;
        const kept = rows.get(g)!;
        const cut = Math.min(left, kept.length);
        left -= cut;
        if (cut === kept.length) rows.delete(g);
        else rows.set(g, kept.slice(cut));
      }
      store.pruned += batch - left;
      return batch - left;
    },
    async insert(generation: number, batch: ClaimReviewRow[]) {
      store.batches.push(batch.length);
      rows.set(generation, [...(rows.get(generation) ?? []), ...batch]);
    },
    async finish(generation: number, info: { reviews: number }) {
      if ((rows.get(generation) ?? []).length !== info.reviews) throw new Error("incomplete generation");
      store.current = generation;
    },
    async fail(error: string) {
      store.errors.push(error);
    },
  };
  return store;
}

describe("one term for the service on every page", () => {
  it("no lookup says 蒐集器: the person-facing word is 找資料的服務", () => {
    const dir = path.resolve(__dirname, "..", "lookups");
    const said = fs.readdirSync(dir).filter((file) => file.endsWith(".ts") && fs.readFileSync(path.join(dir, file), "utf8").includes("蒐集器"));
    expect(said).toEqual([]);
  });
});

describe("the contract file", () => {
  it("resolves and is the frozen v1 (a broken relative path would silently test nothing)", () => {
    expect(fs.existsSync(SPEC_PATH), SPEC_PATH).toBe(true);
    expect(spec.schema_version).toBe("1");
    expect(spec.kinds.describe.max_items).toBe(25);
  });
});

describe("the contract's example requests get exactly its example answers", () => {
  it("describe", async () => {
    const [first, second] = EX.describe.request.items.map((i: { url: string }) => i.url);
    const calls: string[] = [];
    const fetch = world(
      {
        "https://rdap.example.test/tw/domain/example.com.tw": json(rdapRecord("2004-03-18T08:00:00Z")),
        [archiveUrl(first)]: (captured("20050102031415")),
        [archiveUrl(second)]: noCapture(),
      },
      calls,
    );
    // The example has a .tw registry answering; collect's own list cannot reach .tw (lists.ts), so the test
    // supplies a list that can — the answer's shape is what is being held to the contract.
    const answer = await answerLookup(parsed(EX.describe.request), deps(fetch, { registries: { bases: { ...RDAP_BASES, tw: "https://rdap.example.test/tw/" }, notListed: {} } }));
    expect(answer).toEqual(EX.describe.answer);
    expect(calls.some((u) => u.includes("unlisted.zz/") && !u.startsWith("https://web.archive.org/"))).toBe(false); // the item URL itself is never fetched
  });

  it("factcheck", async () => {
    const text = EX.factcheck.request.items[0].text;
    const hit = EX.factcheck.answer.items[0].dbs[0].hits[0];
    const store = memoryStore();
    store.current = 1;
    store.rows.set(1, [{ ...hit, norm: normalise(hit.claim) }]);
    const fetch = world({ [FACTCHECK.cofacts.apiUrl]: new Error("ECONNRESET") });
    expect(await answerLookup(parsed(EX.factcheck.request), deps(fetch, { claimreview: store }))).toEqual(EX.factcheck.answer);
  });

  it("factcheck with dbs: only ClaimReview is asked and answered (Cofacts never sees the words), the hit's own licence kept", async () => {
    const example = EX.factcheck_claimreview_only;
    const hit = example.answer.items[0].dbs[0].hits[0];
    const store = memoryStore();
    store.current = 1;
    store.rows.set(1, [{ ...hit, norm: normalise(hit.claim) }]);
    const calls: string[] = [];
    expect(await answerLookup(parsed(example.request), deps(world({}, calls), { claimreview: store }))).toEqual(example.answer);
    expect(calls).toEqual([]);
  });

  it("the example's ClaimReview hit passes R5 by the ported matching (9 of its 11 pieces are in the text)", () => {
    const text = EX.factcheck.request.items[0].text;
    const claim = EX.factcheck.answer.items[0].dbs[0].hits[0].claim;
    expect(share(normalise(claim), pieces(normalise(text)))).toBeCloseTo(9 / 11);
  });
});

describe("describe: a lookup that failed is a cell, never a failed request (R2, R3)", () => {
  const url = "https://news.example.com/a";
  const site = "example.com";
  const rdap = `${RDAP_BASES.com}domain/${site}`;

  async function one(replies: Record<string, Reply>, extra: Partial<LookupDeps> = {}, target = url) {
    const answer = await answerLookup({ kind: "describe", projectId: "p", urls: [target] }, deps(world(replies), extra));
    return answer.items[0] as unknown as Record<string, unknown>;
  }

  it("a registry that failed is 無法檢查 with what happened; 404 is 查不到", async () => {
    const truncated = new Response(JSON.stringify(rdapRecord("2001-02-03")), { status: 200, headers: { "x-collect-truncated": "1" } });
    const cases: Array<[Reply, string]> = [
      [new Error("ETIMEDOUT"), "網域註冊資料庫這次沒有回應"],
      [Object.assign(new Error("network_x"), { kind: "network" }), "網域註冊資料庫這次沒有回應"],
      [json({}, 503), "網域註冊資料庫回了錯誤（HTTP 503）"],
      [Object.assign(new Error("too_many_redirects_5"), { kind: "http", status: 308 }), "網域註冊資料庫回了錯誤（HTTP 308）"],
      [Object.assign(new Error("ssrf_blocked_private_address"), { kind: "blocked" }), "找資料的服務的安全規則不讓它連到網域註冊資料庫"],
      [new Error("rate_limit_wait_too_long_rdap.verisign.com_31000ms"), "這次要問網域註冊資料庫的太多，排不到"],
      [truncated, "網域註冊資料庫的回答太大，找資料的服務沒有讀完"],
      [new Response("<html>", { status: 200 }), "網域註冊資料庫的回答格式不對"],
    ];
    for (const [reply, why] of cases) {
      const item = await one({ [rdap]: reply, [archiveUrl(url)]: noCapture() });
      expect(item.registered).toEqual({ state: "無法檢查", why });
      expect(item.country).toEqual({ state: "無法檢查", why });
    }
    const missing = await one({ [rdap]: json({ errorCode: 404 }, 404), [archiveUrl(url)]: noCapture() });
    expect(missing.registered).toEqual({ state: "查不到", why: "網域註冊資料庫查不到 example.com" });
  });

  it("a registry not on collect's list is 無法檢查 and says so; .tw says why it is not reachable", async () => {
    const zz = await one({ [archiveUrl("https://a.zz/x")]: noCapture() }, {}, "https://a.zz/x");
    expect(zz.registered).toEqual({ state: "無法檢查", why: "「.zz」的網域註冊資料庫不在找資料的服務的名單上" });
    const tw = await one({ [archiveUrl("https://www.cna.com.tw/n")]: noCapture() }, {}, "https://www.cna.com.tw/n");
    expect([tw.site, tw.registered]).toEqual(["cna.com.tw", { state: "無法檢查", why: RDAP_NOT_LISTED.tw }]);
  });

  it("never asks Nominet for ac.uk or gov.uk (its answers there are a false 404 and a 1970 placeholder)", async () => {
    for (const [target, suffix] of [["https://www.ox.ac.uk/research", "ac.uk"], ["https://www.ons.gov.uk/x", "gov.uk"]] as const) {
      const calls: string[] = [];
      const answer = await answerLookup({ kind: "describe", projectId: "p", urls: [target] }, deps(world({ [archiveUrl(target)]: noCapture() }, calls)));
      const item = answer.items[0] as unknown as Record<string, unknown>;
      expect([item.site, item.registered, item.country]).toEqual([registrable(new URL(target).hostname), { state: "無法檢查", why: RDAP_NOT_LISTED[suffix] }, { state: "無法檢查", why: RDAP_NOT_LISTED[suffix] }]);
      expect(calls.filter((c) => c.includes("rdap"))).toEqual([]);
    }
    const bbc = await one({ [`${RDAP_BASES.uk}domain/bbc.co.uk`]: json(rdapRecord("1994-12-13")), [archiveUrl("https://www.bbc.co.uk/")]: noCapture() }, {}, "https://www.bbc.co.uk/");
    expect(bbc.registered).toMatchObject({ state: "查到", value: "1994-12-13" }); // the rest of .uk is still Nominet's
  });

  it("a registration date before 1985 is a placeholder, not a date: 查不到", async () => {
    for (const date of ["1970-01-01T00:00:00Z", "1984-12-31"]) {
      const item = await one({ [rdap]: json(rdapRecord(date)), [archiveUrl(url)]: noCapture() });
      expect(item.registered).toEqual({ state: "查不到", why: "註冊資料寫的註冊日早於 1985 年，不是真的註冊日" });
    }
    expect((await one({ [rdap]: json(rdapRecord("1985-03-15")), [archiveUrl(url)]: noCapture() })).registered).toMatchObject({ state: "查到", value: "1985-03-15" });
  });

  it("states the registrant's country when the record has it, by name when collect's list has it", async () => {
    const item = await one({ [rdap]: json(rdapRecord("1995-08-14T04:00:00Z", "tw")), [archiveUrl(url)]: (captured("19961120000000")) });
    expect(item).toMatchObject({
      site,
      registered: { state: "查到", value: "1995-08-14", why: "example.com 在網域註冊資料庫的註冊日" },
      country: { state: "查到", value: "台灣", why: "網域註冊資料寫的" },
      first_archived: { state: "查到", value: "1996-11-20" },
    });
  });

  it("an archive that is down or answers out of shape is 無法檢查; no capture is 查不到", async () => {
    const cases: Array<[Reply, string]> = [
      [new Error("socket hang up"), "網頁封存館這次沒有回應"],
      [new Response(null, { status: 503 }), "網頁封存館回了錯誤（HTTP 503）"],
      [new Response(null, { status: 200 }), "網頁封存館的回答格式不對"],
      [new Response(null, { status: 302, headers: { location: "https://web.archive.org/static/x" } }), "網頁封存館的回答格式不對"],
    ];
    for (const [reply, why] of cases) {
      const down = await one({ [rdap]: json(rdapRecord("2000-01-01")), [archiveUrl(url)]: reply });
      expect(down.first_archived).toEqual({ state: "無法檢查", why });
    }
    const none = await one({ [rdap]: json(rdapRecord("2000-01-01")), [archiveUrl(url)]: noCapture() });
    expect(none.first_archived).toEqual({ state: "查不到", why: "網頁封存館沒有存過這一頁" });
  });

  it("a record without a registration date is 查不到, not a made-up date", async () => {
    const item = await one({ [rdap]: json({ events: [{ eventAction: "expiration", eventDate: "2030-01-01" }] }), [archiveUrl(url)]: noCapture() });
    expect(item.registered).toEqual({ state: "查不到", why: "註冊資料沒有寫註冊日期" });
  });

  it("an IP address has no registry record", async () => {
    const item = await one({ [archiveUrl("http://93.184.216.34/x")]: noCapture() }, {}, "http://93.184.216.34/x");
    expect(item.registered).toEqual({ state: "無法檢查", why: "這個網址用的是 IP 位址，沒有網域註冊資料" });
  });

  it("what is not done before the deadline is 無法檢查, the rest is answered", async () => {
    const slow = () => new Promise<Response>(() => {});
    const item = await one({ [rdap]: slow, [archiveUrl(url)]: noCapture() }, { deadlineMs: 30 });
    expect(item.registered).toEqual({ state: "無法檢查", why: "這一項這次查太久，沒有查完" });
    expect(item.first_archived).toEqual({ state: "查不到", why: "網頁封存館沒有存過這一頁" });
  });

  it("answers one item per URL in order, asking each site's registry once, and keeps an answered site for 24 h", async () => {
    const calls: string[] = [];
    let now = 0;
    const cache = new RdapCache(24 * 3600_000, 10, () => now);
    const urls = ["https://a.example.com/1", "https://b.example.com/2", "https://a.example.com/1"];
    const replies = { [rdap]: json(rdapRecord("2001-02-03")), ...Object.fromEntries(urls.map((u) => [archiveUrl(u), () => noCapture()])) };
    const fetch: LookupFetch = async (u, init) => world({ ...replies, [rdap]: () => json(rdapRecord("2001-02-03")) }, calls)(u, init);
    const first = await answerLookup({ kind: "describe", projectId: "p", urls }, deps(fetch, { cache }));
    expect(first.items.map((i) => (i as { url: string }).url)).toEqual(urls);
    expect(calls.filter((c) => c === rdap)).toHaveLength(1);
    await answerLookup({ kind: "describe", projectId: "p", urls: [urls[0]] }, deps(fetch, { cache }));
    expect(calls.filter((c) => c === rdap)).toHaveLength(1);
    now = 24 * 3600_000;
    await answerLookup({ kind: "describe", projectId: "p", urls: [urls[0]] }, deps(fetch, { cache }));
    expect(calls.filter((c) => c === rdap)).toHaveLength(2);
  });

  it("never keeps a 無法檢查 answer: the next request asks again", async () => {
    const calls: string[] = [];
    const cache = new RdapCache();
    const fetch = world({ [rdap]: () => new Error("down"), [archiveUrl(url)]: () => noCapture() }, calls);
    await answerLookup({ kind: "describe", projectId: "p", urls: [url] }, deps(fetch, { cache }));
    await answerLookup({ kind: "describe", projectId: "p", urls: [url] }, deps(fetch, { cache }));
    expect(calls.filter((c) => c === rdap)).toHaveLength(2);
  });

  it("names the site the registry holds", () => {
    expect(["www.bbc.co.uk", "news.cna.com.tw", "a.b.example.com", "Example.COM.", "www.example.com.tw"].map(registrable)).toEqual([
      "bbc.co.uk", "cna.com.tw", "example.com", "example.com", "example.com.tw",
    ]);
  });
});

describe("factcheck: each database answers for itself (R2, R3)", () => {
  const text = "疫苗含有晶片可以追蹤位置";
  const ask = async (fetch: LookupFetch, store: ClaimReviewStore | null) =>
    (await answerLookup({ kind: "factcheck", projectId: "p", texts: [text], dbs: ["claimreview", "cofacts"] }, deps(fetch, { claimreview: store }))).items[0] as {
      text: string;
      dbs: Array<Record<string, unknown>>;
    };
  const cofactsWith = (body: unknown, status = 200) => world({ [FACTCHECK.cofacts.apiUrl]: () => json(body, status) });
  const noArticles = { data: { ListArticles: { edges: [] } } };

  it("no mirror yet is 無法檢查 「還沒有下載查核資料」; an unreadable or unconnected mirror says which", async () => {
    expect((await ask(cofactsWith(noArticles), memoryStore())).dbs[0]).toMatchObject({ db: "claimreview", state: "無法檢查", why: "還沒有下載查核資料" });
    const broken: ClaimReviewStore = { ...memoryStore(), candidates: async () => ({ kind: "error", error: "PGRST202" }) };
    expect((await ask(cofactsWith(noArticles), broken)).dbs[0]).toMatchObject({ state: "無法檢查", why: "找資料的服務這次讀不到查核資料" });
    expect((await ask(cofactsWith(noArticles), null)).dbs[0]).toMatchObject({ state: "無法檢查", why: "找資料的服務沒有接上查核資料庫" });
  });

  it("a text with no 3-character piece cannot be compared: 無法檢查, and the mirror is not asked", async () => {
    let asked = 0;
    const store: ClaimReviewStore = { ...memoryStore(), candidates: async () => (asked++, { kind: "rows", rows: [] }) };
    const answer = await answerLookup({ kind: "factcheck", projectId: "p", texts: ["假"], dbs: ["claimreview", "cofacts"] }, deps(cofactsWith(noArticles), { claimreview: store }));
    expect((answer.items[0] as { dbs: unknown[] }).dbs[0]).toMatchObject({ state: "無法檢查", why: "這段文字太短，沒辦法跟查核資料比對" });
    expect(asked).toBe(0);
  });

  it("a database not answered by the deadline is 無法檢查; the other one is answered", async () => {
    const slow = world({ [FACTCHECK.cofacts.apiUrl]: () => new Promise<Response>(() => {}) });
    const answer = await answerLookup({ kind: "factcheck", projectId: "p", texts: [text], dbs: ["claimreview", "cofacts"] }, deps(slow, { claimreview: memoryStore(), deadlineMs: 30 }));
    const dbs = (answer.items[0] as { dbs: Array<Record<string, unknown>> }).dbs;
    expect(dbs[1]).toMatchObject({ db: "cofacts", state: "無法檢查", why: "這一項這次查太久，沒有查完" });
    expect(dbs[0]).toMatchObject({ db: "claimreview", why: "還沒有下載查核資料" });
  });

  it("Cofacts down, refusing or answering with errors is 無法檢查; no similar article is 查不到", async () => {
    const cases: Array<[LookupFetch, string]> = [
      [world({ [FACTCHECK.cofacts.apiUrl]: new Error("ECONNREFUSED") }), "Cofacts 這次沒有回應"],
      [cofactsWith({}, 502), "Cofacts 回了錯誤（HTTP 502）"],
      [cofactsWith({ errors: [{ message: "x" }] }), "Cofacts 回了錯誤"],
      [cofactsWith({ data: {} }), "Cofacts 的回答格式不對"],
    ];
    for (const [fetch, why] of cases) {
      expect((await ask(fetch, null)).dbs[1]).toEqual({ db: "cofacts", state: "無法檢查", why, attribution: FACTCHECK.cofacts.attribution, hits: [] });
    }
    expect((await ask(cofactsWith(noArticles), null)).dbs[1]).toEqual({ db: "cofacts", state: "查不到", why: "資料庫裡沒有相近的查核", attribution: FACTCHECK.cofacts.attribution, hits: [] });
  });

  it("asks Cofacts with collect's thresholds and words its replies the way Cofacts' site does", async () => {
    let sent: { variables?: Record<string, unknown> } = {};
    const fetch = world({
      [FACTCHECK.cofacts.apiUrl]: (init) => {
        sent = JSON.parse(init?.body ?? "{}");
        return json({
          data: { ListArticles: { edges: [
            { node: { id: "a1", createdAt: "2021-05-01T10:00:00Z", articleReplies: [
              { replyType: "RUMOR", createdAt: "2021-05-02T00:00:00Z", reply: { id: "r1", text: " 這是謠言 ", reference: "https://who.int" } },
              { replyType: "NOT_RUMOR", createdAt: "2021-05-03", reply: { id: "r2", text: "" } },
            ] } },
            { node: { id: "a2", createdAt: "bad date", articleReplies: [] } },
          ] } },
        });
      },
    });
    const db = (await ask(fetch, null)).dbs[1];
    expect(sent.variables).toEqual({ text, match: "50%", first: 5 });
    expect(db).toEqual({
      db: "cofacts", state: "查到", attribution: FACTCHECK.cofacts.attribution,
      hits: [
        { article_id: "a1", url: "https://cofacts.tw/article/a1", date: "2021-05-01", replies: [{ judged_as: "含有不實訊息", text: "這是謠言", reference: "https://who.int", date: "2021-05-02" }] },
        { article_id: "a2", url: "https://cofacts.tw/article/a2", date: "", replies: [] },
      ],
    });
  });

  it("keeps a review only when 0.6 of its claim's pieces are in the text; closest first; at most 5", async () => {
    const store = memoryStore();
    store.current = 7;
    const row = (claim: string, n: number): ClaimReviewRow => ({ claim, url: `https://fc.example/${n}`, publisher: "p", publisher_url: "", judged_as: "錯誤", date: "", claimant: "", license: "", norm: normalise(claim) });
    store.rows.set(7, [
      row("疫苗含有晶片", 1), // every piece in the text
      row("疫苗含有晶片可以追蹤", 2),
      row("疫苗含有毒素會致命", 3), // shares 疫苗含, 苗含有 of 7
      ...[4, 5, 6, 7, 8].map((n) => row(`含有晶片可以追蹤位置${"甲乙丙".slice(0, n % 3)}`, n)),
    ]);
    const db = (await ask(cofactsWith(noArticles), store)).dbs[0] as { state: string; hits: Array<{ url: string }> };
    expect(db.state).toBe("查到");
    expect(db.hits).toHaveLength(5);
    expect(db.hits.map((h) => h.url)).not.toContain("https://fc.example/3");
    expect(db.hits[0].url).toBe("https://fc.example/1");
  });

  it("the threshold is 0.6 of the claim's pieces, inclusive: 3 of 5 is kept, 4 of 7 is not", async () => {
    const store = memoryStore();
    store.current = 1;
    const row = (claim: string): ClaimReviewRow => ({ claim, url: `https://fc.example/${claim}`, publisher: "", publisher_url: "", judged_as: "", date: "", claimant: "", license: "", norm: normalise(claim) });
    store.rows.set(1, [row("疫苗含有晶甲乙"), row("疫苗含有晶片甲乙丙")]);
    expect([share(normalise("疫苗含有晶甲乙"), pieces(normalise(text))), share(normalise("疫苗含有晶片甲乙丙"), pieces(normalise(text)))]).toEqual([0.6, 4 / 7]);
    const db = (await ask(cofactsWith(noArticles), store)).dbs[0] as { hits: Array<{ claim: string }> };
    expect(db.hits.map((h) => h.claim)).toEqual(["疫苗含有晶甲乙"]);
  });

  it("answers 查不到 when the mirror has nothing close", async () => {
    const store = memoryStore();
    store.current = 1;
    store.rows.set(1, [{ claim: "完全無關的說法", url: "https://fc.example/x", publisher: "", publisher_url: "", judged_as: "", date: "", claimant: "", license: "", norm: normalise("完全無關的說法") }]);
    expect((await ask(cofactsWith(noArticles), store)).dbs[0]).toEqual({ db: "claimreview", state: "查不到", why: "資料庫裡沒有相近的查核", attribution: FACTCHECK.claimreview.attribution, hits: [] });
  });
});

describe("the request: the whole request fails only on R2's 400s", () => {
  it("refuses an unknown kind, too many items, a URL that is not http(s), text too long", () => {
    const urls = (n: number) => Array.from({ length: n }, (_, i) => ({ url: `https://s${i}.example/` }));
    const bad = [
      { kind: "whois", items: [] },
      { kind: "describe", items: urls(26) },
      { kind: "describe", items: [{ url: "ftp://example.com/x" }] },
      { kind: "describe", items: [{ url: "not a url" }] },
      { kind: "factcheck", items: [{ text: "a" }, { text: "b" }] },
      { kind: "factcheck", items: [{ text: "字".repeat(4001) }] },
      { kind: "factcheck", dbs: [], items: [{ text: "a" }] },
      { kind: "factcheck", dbs: ["google"], items: [{ text: "a" }] },
      { kind: "factcheck", dbs: ["cofacts", "cofacts"], items: [{ text: "a" }] },
      { kind: "factcheck", dbs: "cofacts", items: [{ text: "a" }] },
      "not an object",
    ];
    for (const body of bad) expect(parseLookupRequest(body).ok, JSON.stringify(body).slice(0, 60)).toBe(false);
  });

  it("answers the databases asked for in DBS order whatever order they were asked in; absent = both", () => {
    expect(parsed({ kind: "factcheck", dbs: ["cofacts", "claimreview"], items: [{ text: "a" }] })).toMatchObject({ dbs: ["claimreview", "cofacts"] });
    expect(parsed({ kind: "factcheck", items: [{ text: "a" }] })).toMatchObject({ dbs: ["claimreview", "cofacts"] });
    expect(parsed({ kind: "factcheck", dbs: ["cofacts"], items: [{ text: "a" }] })).toMatchObject({ dbs: ["cofacts"] });
  });

  it("accepts the limits themselves, counting characters the way the engine does", () => {
    expect(parseLookupRequest({ project_id: "p", kind: "describe", items: Array.from({ length: 25 }, (_, i) => ({ url: `http://s${i}.example/` })) }).ok).toBe(true);
    expect(parseLookupRequest({ project_id: "p", kind: "factcheck", items: [{ text: "😀".repeat(4000) }] }).ok).toBe(true); // 8000 UTF-16 units
  });
});

describe("the ClaimReview mirror (ported matching, streamed refresh)", () => {
  it("normalises like the engine: NFKC, no space between two CJK characters, collapsed whitespace, lower case", () => {
    expect(normalise("  ＡＢＣ  台 北\n市  Hello\tWORLD ")).toBe("abc 台北市 hello world");
  });

  it("leaves the common pieces (in >= 1% of claims) out of the index query, keeping the rest", () => {
    expect(COMMON_PIECE_LIST).toEqual(expect.arrayContaining(["the", " th", "ion"]));
    const wanted = pieces(normalise("The government says the vaccination programme ends tomorrow"));
    const asked = queryPieces(wanted);
    expect(asked.filter((p) => COMMON_PIECE_LIST.includes(p))).toEqual([]);
    expect(asked.length).toBe([...wanted].filter((p) => !COMMON_PIECE_LIST.includes(p)).length);
    expect(COMMON_PIECE_LIST).toContain("vac"); // vaccine claims are everywhere in fact-checks
    expect(asked).toEqual(["amm", "ogr", "rog", "row", "tom"]);
  });

  it("cuts pieces by character, not UTF-16 unit, and samples at most 96 for the index", () => {
    expect([...pieces("a😀bc")]).toEqual(["a😀b", "😀bc"]);
    const many = pieces(normalise("abcdefghijklmnopqrstuvwxyz0123456789".repeat(10) + "台灣事實查核中心是查核組織的一員"));
    expect(queryPieces(many).length).toBeLessThanOrEqual(96);
  });

  it("reads each usable ClaimReview of a feed element the way the engine did, dates as YYYY-MM-DD or empty", () => {
    const lone = String.fromCharCode(0xd800);
    const rows = reviewsOf({
      dateCreated: "2026-03-04T00:00:00Z",
      item: [
        { "@type": "ClaimReview", claimReviewed: ` 說法${lone} `, url: "https://fc.example/1", author: { url: "https://fc.example" }, reviewRating: { alternateName: "錯誤" }, itemReviewed: { author: { name: "網傳" } }, sdLicense: "https://creativecommons.org/licenses/by/4.0/" },
        { "@type": "ClaimReview", claimReviewed: "沒有網址", url: "javascript:alert(1)" },
        { "@type": "Article", claimReviewed: "不是查核", url: "https://x.example" },
        { "@type": "ClaimReview", claimReviewed: "日期亂寫", url: "https://fc.example/2", datePublished: "May 1, 2020", sdLicense: { "@type": "CreativeWork", url: "https://example.org/terms" } },
      ],
    });
    expect(rows).toEqual([
      { claim: "說法�", url: "https://fc.example/1", publisher: "fc.example", publisher_url: "https://fc.example", judged_as: "錯誤", date: "2026-03-04", claimant: "網傳", license: "https://creativecommons.org/licenses/by/4.0/" },
      { claim: "日期亂寫", url: "https://fc.example/2", publisher: "fc.example", publisher_url: "", judged_as: "", date: "", claimant: "", license: "https://example.org/terms" },
    ]);
  });

  function feedText(n: number, dateFirst = true): string {
    const elements = Array.from({ length: n }, (_, i) => ({
      "@type": "DataFeedItem",
      dateCreated: "2026-01-02T00:00:00Z",
      item: [{ "@type": "ClaimReview", claimReviewed: `說法 ${i}：這是「測試」的一句話 \\ "quoted"`, url: `https://fc.example/${i}`, author: { name: "查核中心", url: "https://fc.example" } }],
    }));
    const head = { "@context": "https://schema.org", "@type": "DataFeed" };
    return JSON.stringify(dateFirst ? { ...head, dateModified: "2026-10-01T00:00:00Z", dataFeedElement: elements } : { ...head, dataFeedElement: elements, dateModified: "2026-10-01T00:00:00Z" });
  }

  function streamOf(text: string, chunk: number): ReadableStream<Uint8Array> {
    const bytes = new TextEncoder().encode(text);
    let at = 0;
    return new ReadableStream({
      pull(controller) {
        if (at >= bytes.length) return controller.close();
        controller.enqueue(bytes.slice(at, at + chunk));
        at += chunk;
      },
    });
  }

  it("streams the feed one element at a time, whatever the chunk boundaries cut (multi-byte characters, escapes)", async () => {
    for (const [chunk, dateFirst] of [[7, true], [1, false], [65536, true]] as const) {
      const seen: unknown[] = [];
      const { dateModified } = await scanFeed(streamOf(feedText(30, dateFirst), chunk), (e) => void seen.push(e));
      expect([seen.length, dateModified]).toEqual([30, "2026-10-01T00:00:00Z"]);
      expect(reviewsOf(seen[29])[0].claim).toBe('說法 29：這是「測試」的一句話 \\ "quoted"');
    }
  });

  it("refuses a feed that ends early: a cut feed is not a smaller feed", async () => {
    const text = feedText(5);
    await expect(scanFeed(streamOf(text.slice(0, text.length - 40), 64), () => {})).rejects.toThrow(/claimreview_feed_truncated/);
  });

  it("refreshes in batches and switches to the new generation only when it is complete", async () => {
    const store = memoryStore();
    const fetch = world({ [FACTCHECK.claimreview.feedUrl]: () => new Response(streamOf(feedText(1203), 4096)) });
    const result = await refreshClaimReview({ fetch, store, log: () => {}, now: () => 42 });
    expect(result).toEqual({ ok: true, reviews: 1203, publishers: 1 });
    expect(store.batches).toEqual([500, 500, 203]);
    expect(store.current).toBe(42);
    expect(store.rows.get(42)![0].norm).toBe(normalise(store.rows.get(42)![0].claim));
  });

  it("refuses a feed below 80% of the mirror answering now, and an empty one (the fake store holds no such rule)", async () => {
    const store = memoryStore();
    store.current = 1;
    store.rows.set(1, Array.from({ length: 1000 }, (_, i) => ({ claim: `舊${i}`, url: `https://fc.example/o${i}`, publisher: "", publisher_url: "", judged_as: "", date: "", claimant: "", license: "", norm: `舊${i}` })));
    const refresh = (n: number, gen: number) =>
      refreshClaimReview({ fetch: world({ [FACTCHECK.claimreview.feedUrl]: () => new Response(streamOf(feedText(n), 4096)) }), store, log: () => {}, now: () => gen });
    expect(await refresh(799, 2)).toMatchObject({ ok: false, error: expect.stringContaining("claimreview_feed_too_small") });
    expect([store.current, [...store.rows.keys()]]).toEqual([1, [1]]);
    expect((await refresh(800, 3)).ok).toBe(true);
    expect([store.current, [...store.rows.keys()]]).toEqual([3, [3]]);
    const empty = memoryStore();
    const none = await refreshClaimReview({ fetch: world({ [FACTCHECK.claimreview.feedUrl]: () => new Response(streamOf(JSON.stringify({ dataFeedElement: [] }), 64)) }), store: empty, log: () => {} });
    expect(none).toMatchObject({ ok: false, error: expect.stringContaining("claimreview_feed_too_small") });
    expect(empty.current).toBeNull();
  });

  it("prunes what an earlier refresh left before writing, and the old generation after switching", async () => {
    const store = memoryStore();
    store.current = 1;
    const row = (n: number): ClaimReviewRow => ({ claim: `c${n}`, url: `https://fc.example/${n}`, publisher: "", publisher_url: "", judged_as: "", date: "", claimant: "", license: "", norm: `c${n}` });
    store.rows.set(1, [row(1), row(2)]);
    store.rows.set(7, [row(3)]); // a refresh that died mid-download
    const order: string[] = [];
    const watched: ClaimReviewStore = {
      ...store,
      prune: async (n) => { const done = await store.prune(n); order.push(`prune:${done}`); return done; },
      insert: async (g, rows) => { order.push("insert"); await store.insert(g, rows); },
      finish: async (g, info) => { order.push("finish"); await store.finish(g, info); },
      currentReviews: () => store.currentReviews(),
    };
    const fetch = world({ [FACTCHECK.claimreview.feedUrl]: () => new Response(streamOf(feedText(3), 64)) });
    expect((await refreshClaimReview({ fetch, store: watched, log: () => {}, now: () => 9 })).ok).toBe(true);
    expect(order).toEqual(["prune:1", "prune:0", "insert", "finish", "prune:2", "prune:0"]);
    expect([...store.rows.keys()]).toEqual([9]);
  });

  it("a failed refresh keeps the old mirror answering and drops only what it wrote", async () => {
    const store = memoryStore();
    store.current = 1;
    store.rows.set(1, [{ claim: "舊的", url: "https://fc.example/old", publisher: "", publisher_url: "", judged_as: "", date: "", claimant: "", license: "", norm: "舊的" }]);
    const text = feedText(800);
    for (const fetch of [
      world({ [FACTCHECK.claimreview.feedUrl]: () => new Response(streamOf(text.slice(0, -100), 4096)) }), // cut
      world({ [FACTCHECK.claimreview.feedUrl]: () => new Response("", { status: 503 }) }),
      world({ [FACTCHECK.claimreview.feedUrl]: () => new Response(streamOf(JSON.stringify({ dataFeedElement: [] }), 64)) }), // empty
    ]) {
      const result = await refreshClaimReview({ fetch, store, log: () => {}, now: () => 2 });
      expect(result.ok).toBe(false);
      expect([store.current, [...store.rows.keys()]]).toEqual([1, [1]]);
    }
    expect(store.errors).toHaveLength(3);
  });

  it("is started from the heartbeat at most when the store says so, and never throws", async () => {
    const fetch = vi.fn(world({ [FACTCHECK.claimreview.feedUrl]: () => new Response(streamOf(feedText(2), 64)) }));
    const notDue = { ...memoryStore(), beginRefresh: async () => false };
    await refreshClaimReviewIfDue({ log: () => {}, store: notDue, fetch });
    expect(fetch).not.toHaveBeenCalled();
    const due = memoryStore();
    await refreshClaimReviewIfDue({ log: () => {}, store: due, fetch });
    expect(due.current).not.toBeNull();
    const logs: string[] = [];
    await expect(refreshClaimReviewIfDue({ log: (m) => logs.push(m), store: { ...memoryStore(), beginRefresh: async () => { throw new Error("db down"); } }, fetch })).resolves.toBeUndefined();
    await refreshClaimReviewIfDue({ log: (m) => logs.push(m), store: null, fetch });
    expect(logs).toEqual([expect.stringContaining("db down"), "claimreview refresh skipped: no Supabase client"]);
  });

  it("looks up through the store and returns contract hits (no norm)", async () => {
    const store = memoryStore();
    store.current = 3;
    store.rows.set(3, [{ claim: "疫苗含有晶片", url: "https://fc.example/1", publisher: "p", publisher_url: "https://p.example", judged_as: "錯誤", date: "2026-01-01", claimant: "c", license: "", norm: normalise("疫苗含有晶片") }]);
    expect(await lookupClaimReview("網傳疫苗含有晶片！", store)).toEqual({
      kind: "hits",
      hits: [{ claim: "疫苗含有晶片", url: "https://fc.example/1", publisher: "p", publisher_url: "https://p.example", judged_as: "錯誤", date: "2026-01-01", claimant: "c", license: "" }],
    });
  });
});

describe("collect's fetcher: the two capabilities lookups need, and nothing wider (R6)", () => {
  const base = { budget: createBudget(), resolver: async () => ["93.184.216.34"], rateLimiter: new RateLimiter({ ratePerSecond: 1000, burst: 1000 }), robots: null };

  it("POSTs only to a host this fetch lists, sending the body, and follows no redirect on a POST", async () => {
    const seen: Array<{ url: string; method?: string; body?: unknown }> = [];
    const transport = (async (url: string, init?: RequestInit) => {
      seen.push({ url, method: init?.method, body: init?.body });
      return url.endsWith("/moved") ? new Response(null, { status: 307, headers: { location: "https://api.cofacts.tw/x" } }) : json({ ok: 1 });
    }) as unknown as typeof fetch;
    const f = createCollectFetch({ ...base, transport, postHosts: ["api.cofacts.tw"] });
    expect((await f("https://api.cofacts.tw/graphql", { method: "POST", body: '{"q":1}' })).status).toBe(200);
    expect(seen[0]).toEqual({ url: "https://api.cofacts.tw/graphql", method: "POST", body: '{"q":1}' });
    await expect(f("https://evil.example/graphql", { method: "POST", body: "{}" })).rejects.toThrow(/method_not_allowed_POST/);
    await expect(f("https://api.cofacts.tw/moved", { method: "POST", body: "{}" })).rejects.toThrow(/redirect_on_post_307/);
    expect(seen).toHaveLength(2);
    const crawler = createCollectFetch({ ...base, transport });
    await expect(crawler("https://api.cofacts.tw/graphql", { method: "POST" })).rejects.toThrow(/method_not_allowed_POST/);
    expect((await f("https://other.example/doc", { body: "ignored" })).status).toBe(200);
    expect(seen.at(-1)?.body).toBeUndefined(); // a GET never carries a body
  });

  it("hands a redirect back unfollowed only when asked, after the address guard; otherwise follows it as before", async () => {
    const seen: string[] = [];
    const transport = (async (url: string) => {
      seen.push(url);
      return url.includes("/web/1996/") ? new Response(null, { status: 302, headers: { location: "https://web.archive.org/web/19990427022125/http://a.example/" } }) : new Response("page");
    }) as unknown as typeof fetch;
    const f = createCollectFetch({ ...base, transport });
    const pointer = await f("https://web.archive.org/web/1996/http://a.example/", { method: "HEAD", redirect: "manual" });
    expect([pointer.status, pointer.headers.get("location"), seen.length]).toEqual([302, "https://web.archive.org/web/19990427022125/http://a.example/", 1]);
    expect((await f("https://web.archive.org/web/1996/http://a.example/")).status).toBe(200);
    expect(seen).toHaveLength(3);
    const guarded = createCollectFetch({ ...base, transport, resolver: async () => ["10.0.0.5"] });
    await expect(guarded("https://web.archive.org/web/1996/http://a.example/", { method: "HEAD", redirect: "manual" })).rejects.toThrow(/ssrf_blocked/);
  });

  it("hands a streamed body back unread, and fails it once it passes maxBytes instead of cutting it", async () => {
    const big = "x".repeat(10_000);
    const transport = (async () => new Response(big)) as unknown as typeof fetch;
    const ok = await createCollectFetch({ ...base, transport, maxBytes: 20_000 })("https://feed.example/data.json", { stream: true });
    expect(await ok.text()).toHaveLength(10_000);
    const over = await createCollectFetch({ ...base, transport, maxBytes: 4_000 })("https://feed.example/data.json", { stream: true });
    await expect(over.text()).rejects.toThrow(/stream_over_4000_bytes/);
  });
});
