// Card C13.2: format inference rules (pure) -- the company's own formats first, ≤ 4 candidates, Latin names only.
import { describe, expect, it } from "vitest";
import { companyFormats, formatOf, guessEmails, splitLatinName } from "../email-guess";

describe("email guess", () => {
  it("splits a Latin name and refuses a Chinese or one-word one", () => {
    expect(splitLatinName("Mary-Jane O'Neil")).toEqual({ first: "maryjane", last: "oneil" });
    expect(splitLatinName("José Álvarez Peña")).toEqual({ first: "jose", last: "pena" });
    expect(splitLatinName("王小明")).toBeNull();
    expect(splitLatinName("Madonna")).toBeNull();
    expect(splitLatinName("Wang 小明")).toBeNull();
  });

  it("with no known format: first.last, first, f.last, firstlast -- four, never last.first", () => {
    expect(guessEmails("Ann Lee", "acme.com")).toEqual(["ann.lee@acme.com", "ann@acme.com", "a.lee@acme.com", "annlee@acme.com"]);
  });

  it("the company's own format comes first, the most used one before the rest", () => {
    const known = [
      { email: "lee.bob@acme.com", name: "Bob Lee" }, { email: "wu.cy@acme.com", name: "Cy Wu" },
      { email: "dan@acme.com", name: "Dan Ray" }, { email: "info@acme.com", name: null },
    ];
    expect(companyFormats(known)).toEqual(["last.first", "first"]);
    expect(guessEmails("Ann Lee", "www.ACME.com", known)).toEqual(["lee.ann@acme.com", "ann@acme.com", "ann.lee@acme.com", "a.lee@acme.com"]);
    expect(formatOf("a.lee@acme.com", { first: "ann", last: "lee" })).toBe("f.last");
    expect(formatOf("sales@acme.com", { first: "ann", last: "lee" })).toBeNull();
  });

  it("no guess for a non-Latin name or a domain that is not a hostname", () => {
    expect(guessEmails("王小明", "acme.com")).toEqual([]);
    expect(guessEmails("Ann Lee", "acme")).toEqual([]);
    expect(guessEmails("Ann Lee", "acme.com/x?y")).toEqual([]);
  });
});
