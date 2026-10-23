import { describe, expect, it } from "vitest";
import type { Event } from "@sentry/nextjs";
import { scrubDataOf, scrubEvent } from "../sentry-scrub";

describe("scrubEvent", () => {
  it("keeps only the allowlisted request fields and headers", () => {
    const event: Event = {
      request: {
        url: "https://app.aware-wave.com/api/webhooks/chatwoot?token=s3cret",
        method: "POST",
        query_string: "token=s3cret",
        cookies: { "sb-access-token": "jwt" },
        data: { token: "s3cret" },
        headers: {
          cookie: "sb-access-token=jwt",
          authorization: "Bearer jwt",
          "x-ops-sync-key": "k",
          "x-telegram-bot-api-secret-token": "t",
          "stripe-signature": "sig",
          referer: "https://app.aware-wave.com/callback?token=s3cret",
          "content-type": "application/json",
        },
      },
      contexts: { trace: { trace_id: "a", span_id: "b", data: { "http.target": "/x?token=s3cret" } } },
      breadcrumbs: [{ category: "navigation", data: { from: "/login/set-password#token_hash=t", to: "/" } }],
    };
    scrubEvent(event);
    expect(event.request).toStrictEqual({
      url: "https://app.aware-wave.com/api/webhooks/chatwoot",
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    expect(event.contexts?.trace?.data).toEqual({ "http.target": "/x" });
    expect(event.breadcrumbs?.[0].data).toStrictEqual({ from: "/login/set-password", to: "/" });
  });

  it("strips the query from span and breadcrumb data", () => {
    const data = { url: "https://h/p?key=s", from: "/a#access_token=t", to: "/b?x=1#y", "http.url": "https://h/p?key=s", "url.query": "key=s", "http.query": "?key=s", "http.fragment": "#t", "http.method": "GET" };
    expect(scrubDataOf({ data }).data).toStrictEqual({ url: "https://h/p", from: "/a", to: "/b", "http.url": "https://h/p", "http.method": "GET" });
  });
});
