// Pasted reference URLs (content/generate, the article block): the page goes through collect's address gate, so an
// internal host never reaches the prompt and the article (SSRF, WORKLOG 2026-10-25).
import { describe, expect, it } from "vitest";
import { referenceContext } from "@/lib/content/article/generate-core";

const publicDns = async () => ["93.184.216.34"];

describe("referenceContext", () => {
  it("a URL that resolves to an internal address is skipped before any request", async () => {
    let asked = 0;
    const transport = (async () => { asked++; return new Response("secret", { headers: { "content-type": "text/html" } }); }) as unknown as typeof fetch;
    expect(await referenceContext(["https://rebind.example/", "https://127.0.0.1:8030/"], { resolver: async () => ["127.0.0.1"], transport })).toBe("");
    expect(asked).toBe(0);
  });

  it("a public page comes back as plain text under its source line", async () => {
    const transport = (async () => new Response("<html><script>x()</script><p>Hello   world</p></html>", { headers: { "content-type": "text/html; charset=utf-8" } })) as unknown as typeof fetch;
    expect(await referenceContext(["https://news.example/a"], { resolver: publicDns, transport })).toBe("--- Source: https://news.example/a ---\nHello world");
  });
});
