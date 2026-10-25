// A pasted media URL (lib/content/postiz.ts uploadMedia/uploadVideo): collect's address gate on every redirect hop,
// the byte cap, and nothing internal in the error (review 2026-10-15 M2).
import { describe, expect, it } from "vitest";
import { fetchRemoteFile, fetchRemotePageText, pageText, RemoteFileError } from "@/lib/collect/net/remote-file";

const IMAGE = { maxBytes: 10, timeoutMs: 5_000, accept: (ct: string) => ct.startsWith("image/") };
const publicDns = async () => ["93.184.216.34"];

function transport(...answers: Response[]): typeof fetch {
  return (async () => answers.shift() ?? new Response(null, { status: 500 })) as unknown as typeof fetch;
}
const reason = (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof RemoteFileError ? e.reason : String(e)));

describe("fetchRemoteFile", () => {
  it("a host that resolves to a private address is refused before any request", async () => {
    let asked = 0;
    const t = (async () => { asked++; return new Response("x"); }) as unknown as typeof fetch;
    expect(await reason(fetchRemoteFile("https://rebind.example/a.png", IMAGE, { resolver: async () => ["10.0.0.5"], transport: t }))).toBe("refused");
    expect(asked).toBe(0);
  });

  it("a redirect to an internal address is refused at that hop", async () => {
    const hop = new Response(null, { status: 302, headers: { location: "https://169.254.169.254/latest/meta-data" } });
    expect(await reason(fetchRemoteFile("https://cdn.example/a.png", IMAGE, { resolver: publicDns, transport: transport(hop) }))).toBe("refused");
  });

  it("over the byte cap, the wrong type, or not https: refused with a reason safe to show", async () => {
    const big = new Response("12345678901", { headers: { "content-type": "image/png" } });
    expect(await reason(fetchRemoteFile("https://cdn.example/a.png", IMAGE, { resolver: publicDns, transport: transport(big) }))).toBe("too_large");
    const html = new Response("<html>", { headers: { "content-type": "text/html" } });
    expect(await reason(fetchRemoteFile("https://cdn.example/a.png", IMAGE, { resolver: publicDns, transport: transport(html) }))).toBe("wrong_type");
    expect(await reason(fetchRemoteFile("http://cdn.example/a.png", IMAGE, { resolver: publicDns }))).toBe("refused");
  });

  it("a page's text drops scripts, styles and tags, and a hostile body of unclosed tags takes linear time", () => {
    expect(pageText('<p>a</p><SCRIPT>x<b></b></script><style>.c{}</style>b <img src="i"> c<script>never closed')).toBe("a b c");
    expect(pageText('<p>hi</p><img src="data:image/png;base64,AAAA')).toBe("hi");   // a prefix cut inside a tag
    const started = Date.now();
    for (const body of ["<".repeat(200_000), "<script".repeat(30_000), "<script></script>".repeat(15_000), "a<style".repeat(30_000)]) pageText(body);
    expect(Date.now() - started).toBeLessThan(1_000);   // the old regexes: ~11 s for the first body alone
  });

  it("a page longer than the cap is read from its first bytes; a file longer than the cap is still refused", async () => {
    const page = () => new Response(`<p>${"a".repeat(20)}</p>`, { headers: { "content-type": "text/html" } });
    expect(await fetchRemotePageText("https://news.example/a", { maxBytes: 10, timeoutMs: 5_000, maxChars: 100 }, { resolver: publicDns, transport: transport(page()) })).toBe("aaaaaaa");
    expect(await reason(fetchRemoteFile("https://news.example/a", { ...IMAGE, accept: () => true }, { resolver: publicDns, transport: transport(page()) }))).toBe("too_large");
  });

  it("a public image within the cap comes back with its type", async () => {
    const ok = new Response("1234567890", { headers: { "content-type": "image/png; charset=binary" } });
    const file = await fetchRemoteFile("https://cdn.example/a.png", IMAGE, { resolver: publicDns, transport: transport(ok) });
    expect([file.contentType, file.bytes.byteLength]).toEqual(["image/png", 10]);
  });
});
