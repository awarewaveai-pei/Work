// robots.txt evaluation. Had no direct test until 2026-09-21, which is how a crawler that states it
// respects robots.txt fetched a path a real site had disallowed: the parser used only the FIRST group
// naming "*", and the site put its Disallow in the second one.

import { describe, expect, it } from "vitest";
import { groupFor, isAllowed, parseRobots } from "@/lib/collect/net/robots";

const UA = "AwareWaveCollector/1.0 (+https://aware-wave.com/bot)";

/** Verbatim shape of https://scholars.latrobe.edu.au/robots.txt as served on 2026-09-21. */
const LATROBE = `Sitemap: https://scholars.latrobe.edu.au/sitemap.xml

User-agent: *
Disallow:

User-agent: *
Disallow: */publications$

User-agent: googlebot
User-agent: bingbot
Allow: */publications$`;

describe("groups naming the same agent are merged (RFC 9309 §2.2.1)", () => {
  it("honours a Disallow that sits in the SECOND `*` group", () => {
    const rules = parseRobots(LATROBE);
    expect(isAllowed(rules, UA, "/tgfarrell/publications")).toBe(false);
    // ...while everything the first group allows stays allowed.
    expect(isAllowed(rules, UA, "/tgfarrell")).toBe(true);
    expect(isAllowed(rules, UA, "/tgfarrell/publications/extra")).toBe(true); // `$` anchors the end
  });

  it("lets the crawlers a site names get what it granted them, and nobody else", () => {
    const rules = parseRobots(LATROBE);
    expect(isAllowed(rules, "Mozilla/5.0 (compatible; Googlebot/2.1)", "/tgfarrell/publications")).toBe(true);
    expect(isAllowed(rules, UA, "/tgfarrell/publications")).toBe(false);
  });

  it("merges specific groups too, and ignores `*` once a specific group matches", () => {
    const rules = parseRobots(`User-agent: *
Disallow: /

User-agent: AwareWaveCollector
Disallow: /private

User-agent: AwareWaveCollector
Disallow: /drafts`);
    expect(isAllowed(rules, UA, "/public")).toBe(true); // `*`'s blanket Disallow does not apply
    expect(isAllowed(rules, UA, "/private/x")).toBe(false);
    expect(isAllowed(rules, UA, "/drafts/y")).toBe(false); // second specific group was not dropped
  });

  it("takes the most conservative crawl-delay across merged groups", () => {
    const rules = parseRobots(`User-agent: *
Crawl-delay: 2

User-agent: *
Crawl-delay: 10`);
    expect(groupFor(rules, UA)?.crawlDelay).toBe(10);
  });
});

describe("single-group behaviour is unchanged", () => {
  it("longest match wins, and ties go to Allow", () => {
    const rules = parseRobots(`User-agent: *
Disallow: /docs
Allow: /docs/public`);
    expect(isAllowed(rules, UA, "/docs/private")).toBe(false);
    expect(isAllowed(rules, UA, "/docs/public/a")).toBe(true);
  });

  it("an empty Disallow allows everything; no matching group allows everything", () => {
    expect(isAllowed(parseRobots("User-agent: *\nDisallow:"), UA, "/anything")).toBe(true);
    expect(isAllowed(parseRobots("User-agent: SomeoneElse\nDisallow: /"), UA, "/anything")).toBe(true);
  });

  it("supports `*` inside a pattern and `$` at its end", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /*.pdf$");
    expect(isAllowed(rules, UA, "/files/cv.pdf")).toBe(false);
    expect(isAllowed(rules, UA, "/files/cv.pdf.html")).toBe(true);
  });
});
