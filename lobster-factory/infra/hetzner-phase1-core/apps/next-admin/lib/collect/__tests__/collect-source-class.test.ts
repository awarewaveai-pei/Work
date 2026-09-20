// The third admission axis, pinned to the exact documents that got through without it.
//
// Every URL below was really collected for a person's background dossier on 2026-09-20. The
// bookshop listing was worthless and is refused from its URL. The round-up and the third party's
// staff page were NOT worthless — each carried a fact found nowhere else — so they are kept and
// labelled `peripheral` instead. That correction is the point of this file.

import { describe, expect, it } from "vitest";
import { DOSSIER_EXCLUDED_BY_DEFAULT, classifySource } from "@/lib/collect/source-class";
import { assessRelevance } from "@/lib/collect/relevance";
import type { EntityRef } from "@/lib/collect/entity";

const ref: EntityRef = { name: "Theo Farrell", kind: "person", anchors: [], aliases: [], strictAnchors: true };

describe("classifySource", () => {
  it("calls a storefront a storefront, by host or by path shape", () => {
    expect(classifySource("https://www.amazon.com/-/zh_TW/Theo-Farrell/dp/1555879756")).toBe("retail");
    expect(classifySource("https://www.penguin.com.au/authors/theo-farrell")).toBe("retail");
    // A shop nobody listed: the path still gives it away.
    expect(classifySource("https://some-indie-shop.example/product/unwinnable")).toBe("retail");
  });

  it("classes self-authored profile pages as social", () => {
    expect(classifySource("https://www.instagram.com/theo_farrell/")).toBe("social");
    expect(classifySource("https://au.linkedin.com/in/theo-farrell-35698b1b3")).toBe("social");
  });

  it("classes list pages as aggregators — they mention everybody and are about nobody", () => {
    expect(classifySource("https://news.example/tag/afghanistan/")).toBe("aggregator");
    expect(classifySource("https://news.example/archive/page/3")).toBe("aggregator");
  });

  it("keeps encyclopaedias admissible, labelled rather than refused", () => {
    expect(classifySource("https://en.wikipedia.org/wiki/Theo_Farrell")).toBe("reference");
    expect(DOSSIER_EXCLUDED_BY_DEFAULT).not.toContain("reference");
  });

  it("FAILS OPEN: an unknown host is admitted, never gatekept by allowlist", () => {
    expect(classifySource("https://www.latrobe.edu.au/news/articles/2023/release/x")).toBe("unknown");
    expect(classifySource("https://a-local-newspaper-nobody-listed.example/story/1")).toBe("unknown");
    expect(classifySource("not a url at all")).toBe("unknown");
  });
});

describe("relevance — being named vs being the subject", () => {
  const doc = (text: string, title: string | null = null) => ({ text, title });
  const meta = { entity: ref };

  it("KEEPS a daily news round-up, labelled peripheral", () => {
    // Real: sbs.com.au 今日大事 (12月18日). Dropping this one lost the Ramsay Centre "Western
    // Civilisation degree" controversy — the only record of it in the whole corpus (prod dossier,
    // 2026-09-20). In due diligence a passing mention is often the finding.
    const roundup = `${"Other news item. ".repeat(300)} Theo Farrell said something. ${"More items. ".repeat(300)}`;
    const v = assessRelevance(doc(roundup, "今日大事 (12月18日)"), meta);
    expect(v.ok).toBe(true);
    expect(v.confidence).toBe("peripheral");
  });

  it("KEEPS another person's staff profile, labelled peripheral", () => {
    // Real: sdu.dk staff page for Sten Rynning — the only source for a co-authored book.
    const other = `Sten Rynning is professor of political science. ${"Research interests and publications. ".repeat(200)} Co-authored with Theo Farrell.`;
    const v = assessRelevance(doc(other, "Sten Rynning"), meta);
    expect(v.ok).toBe(true);
    expect(v.confidence).toBe("peripheral");
  });

  it("tells a peripheral mention apart from a document that is actually about him", () => {
    const profile = `Theo Farrell joined in 2023. ${"Career detail. ".repeat(200)}`;
    expect(assessRelevance(doc(profile, "About"), meta).confidence).toBe("name_only");
  });

  it("labels a long article whose TITLE names him as being about him, not peripheral", () => {
    const article = `The university announced the appointment today. ${"Background on the institution. ".repeat(300)}`;
    const v = assessRelevance(doc(article, "Professor Theo Farrell appointed Vice-Chancellor"), meta);
    expect(v.ok).toBe(true);
  });

  it("admits a short notice where one mention is the whole document", () => {
    const v = assessRelevance(doc("Theo Farrell will give a lecture on Afghanistan at 4pm."), meta);
    expect(v.ok).toBe(true);
  });

  it("admits a long profile that names him repeatedly", () => {
    const profile = `Theo Farrell joined in 2023. ${"Career detail. ".repeat(200)} Farrell, Theo has written widely.`;
    const v = assessRelevance(doc(profile, "About"), meta);
    expect(v.ok).toBe(true);
  });
});
