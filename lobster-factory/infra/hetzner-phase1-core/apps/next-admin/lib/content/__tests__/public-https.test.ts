// isSafePublicHttps guards operator-entered feed URLs (content sources, env feeds): every spelling of a local or
// private host is refused, a public https host passes. Literal check only; see public-https.ts for what it cannot stop.
import { describe, expect, it } from "vitest";
import { isSafePublicHttps } from "../public-https";

describe("isSafePublicHttps", () => {
  it.each([
    "http://news.example.com/rss", "https://localhost/", "https://localhost./", "https://lobster-nginx/", "https://printer.local/",
    "https://127.0.0.1/", "https://10.0.0.5/", "https://169.254.169.254/", "https://224.0.0.1/", "https://255.255.255.255/",
    "https://[::1]/", "https://[::]/", "https://[64:ff9b::7f00:1]/", "https://[::ffff:127.0.0.1]/", "https://[ff02::1]/",
    "https://[fd00::1]/", "https://[fe80::1]/", "https://[2::1]/", "not a url",
  ])("refuses %s", (url) => expect(isSafePublicHttps(url)).toBe(false));

  it.each(["https://news.example.com/rss", "https://news.example.com./rss", "https://8.8.8.8/feed", "https://[2001:4860::8888]/",
    "https://fdic.gov/rss", "https://ffmpeg.org/feed"])("accepts %s", (url) => expect(isSafePublicHttps(url)).toBe(true));
});
