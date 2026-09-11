// collect/http-api — a JSON endpoint that publishes a list of things.
//
// This is the "官方資料 / REST API" source: a government open-data feed, a company's own content
// API, a status endpoint. The obstacle is that every one of them has a different JSON shape, so
// there is no such thing as a generic parser. What there IS: a generic FETCHER plus a per-source
// field mapping, supplied when the source is configured.
//
// The mapping is deliberately dumb — dotted paths, no expression language. A mini-language here
// would become a place where source configuration silently computes things, and the next question
// would be why a document's title contains a stack trace.

import { createHash } from "node:crypto";
import type { CollectBlock, CollectCtx, RawDoc, Target } from "@/lib/collect/types";
import { registerCollector } from "@/lib/collect/registry";
import { COLLECTED_PROVENANCE } from "@/lib/collect/provenance";

/** `a.b.0.c` — objects, arrays, nothing else. Missing ⇒ undefined, never a throw. */
export function pick(source: unknown, dotted: string | undefined): unknown {
  if (!dotted) return undefined;
  let cursor: unknown = source;
  for (const key of dotted.split(".")) {
    if (cursor === null || cursor === undefined) return undefined;
    if (Array.isArray(cursor)) {
      const index = Number(key);
      cursor = Number.isInteger(index) ? cursor[index] : undefined;
    } else if (typeof cursor === "object") {
      cursor = (cursor as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return cursor;
}

function asText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  // An object where text was expected: rendered rather than dropped, because a mapping pointing at
  // the wrong field should look wrong, not look empty.
  return JSON.stringify(value, null, 2);
}

export const MAX_ITEMS_PER_CALL = 200;

export const httpApiCollector: CollectBlock = {
  id: "collect/http-api",
  title: "官方 API / JSON 端點",
  icon: "🔌",

  describe: {
    kind: "api",
    summary: "從回傳 JSON 清單的端點收資料（政府開放資料、廠商內容 API）。需要指定欄位對應。",
    entry: "url",
    options: [
      {
        key: "itemsPath",
        label: "清單欄位路徑",
        type: "string",
        required: true,
        help: "JSON 裡那個陣列的位置，例如 data.items。整包就是陣列時填 .",
      },
      { key: "titleField", label: "標題欄位", type: "string", required: true, help: "例如 title 或 attributes.name" },
      { key: "textField", label: "內文欄位", type: "string", required: true, help: "例如 content 或 body.text" },
      { key: "urlField", label: "原始連結欄位", type: "string", help: "沒有的話會用端點網址加上識別碼。" },
      { key: "idField", label: "識別碼欄位", type: "string", help: "決定同一筆資料更新時算不算同一份文件。" },
      { key: "dateField", label: "發布日期欄位", type: "string" },
      { key: "authorField", label: "作者欄位", type: "string" },
    ],
  },

  /**
   * 2 — above the HTML tier, which would otherwise fetch the endpoint and extract its JSON as if it
   * were prose. Only for targets explicitly configured as an API source: guessing from a URL would
   * hijack ordinary pages that happen to end in .json.
   */
  match(t: Target): number {
    return t.hint === "http-api" ? 2 : 0;
  },

  async run(t: Target, ctx: CollectCtx): Promise<{ docs: RawDoc[]; discovered: Target[] }> {
    const opts = (t.meta ?? {}) as Record<string, string | undefined>;
    if (!opts.itemsPath || !opts.titleField || !opts.textField) {
      // Configuration error, not a transport error: retrying it forever would be pointless.
      throw Object.assign(new Error("http_api_mapping_incomplete"), { status: 400 });
    }

    const res = await ctx.fetch(t.uri, { headers: { accept: "application/json" } });
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status} ${t.uri}`), { status: res.status });

    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      throw Object.assign(new Error("http_api_response_not_json"), { status: 415 });
    }

    const rawItems = opts.itemsPath === "." ? payload : pick(payload, opts.itemsPath);
    if (!Array.isArray(rawItems)) {
      // The mapping points somewhere that is not a list. Said plainly, because the alternative is a
      // source that reports "0 documents" forever while the endpoint is perfectly healthy.
      throw Object.assign(new Error(`http_api_items_path_not_an_array:${opts.itemsPath}`), { status: 422 });
    }

    const items = rawItems.slice(0, MAX_ITEMS_PER_CALL);
    ctx.log(`http-api ${t.uri}: ${items.length} item(s)`);

    const docs: RawDoc[] = [];
    for (const item of items) {
      const text = asText(pick(item, opts.textField)).trim();
      const title = asText(pick(item, opts.titleField)).trim();
      if (!text) continue; // an item with no body is not a document; the gate would refuse it anyway

      const id = opts.idField ? asText(pick(item, opts.idField)) : "";
      const link = opts.urlField ? asText(pick(item, opts.urlField)) : "";
      // Identity, in order of preference: the item's own URL, then the endpoint plus its id. Without
      // either, every refresh would store the same item as a brand-new document.
      const identity = link || `${t.uri}#${id || createHash("sha256").update(title + text).digest("hex").slice(0, 16)}`;
      const published = opts.dateField ? new Date(asText(pick(item, opts.dateField))) : null;

      docs.push({
        uri: identity,
        canonicalUrl: ctx.canonicalize(identity),
        contentHash: createHash("sha256").update(text, "utf8").digest("hex"),
        mime: "application/json",
        title: (title || identity).slice(0, 300),
        author: opts.authorField ? asText(pick(item, opts.authorField)).slice(0, 200) || null : null,
        contentType: "api_record",
        text,
        raw: null, // structured input: the density check does not apply (quality.ts)
        fetchedAt: new Date().toISOString(),
        publishedAt: published && !Number.isNaN(published.getTime()) ? published.toISOString() : null,
        collector: "collect/http-api",
        tenantRef: ctx.tenantRef,
        provenance: { ...COLLECTED_PROVENANCE },
        meta: { endpoint: t.uri, itemId: id || undefined },
      });
    }

    return { docs, discovered: [] };
  },
};

registerCollector(httpApiCollector);
