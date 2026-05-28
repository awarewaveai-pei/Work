import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { timingSafeEqual } from "../verifyIngestToken";

describe("timingSafeEqual — correctness", () => {
  it("equal strings → true", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
  });

  it("different content, same length → false", () => {
    expect(timingSafeEqual("abc", "abd")).toBe(false);
  });

  it("different content, different length → false", () => {
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });

  it("a shorter than b → false", () => {
    expect(timingSafeEqual("ab", "abc")).toBe(false);
  });

  it("b shorter than a → false", () => {
    expect(timingSafeEqual("abcd", "abc")).toBe(false);
  });

  it("empty == empty → true", () => {
    expect(timingSafeEqual("", "")).toBe(true);
  });

  it("empty != non-empty → false", () => {
    expect(timingSafeEqual("", "a")).toBe(false);
  });

  it("long identical tokens → true", () => {
    const tok = "x".repeat(128);
    expect(timingSafeEqual(tok, tok)).toBe(true);
  });

  it("long tokens differing only in last char → false", () => {
    const a = "x".repeat(127) + "a";
    const b = "x".repeat(127) + "b";
    expect(timingSafeEqual(a, b)).toBe(false);
  });

  it("realistic bearer token format → true", () => {
    const tok = "sk_live_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef0123456789";
    expect(timingSafeEqual(tok, tok)).toBe(true);
  });

  it("realistic bearer token with one char difference → false", () => {
    const a = "sk_live_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef0123456789";
    const b = "sk_live_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef012345678X";
    expect(timingSafeEqual(a, b)).toBe(false);
  });
});

describe("timingSafeEqual — UTF-8 / multibyte correctness", () => {
  // Buffer.from(x, "utf8") encodes multibyte chars — comparison is byte-exact
  // after encoding, which is the correct policy for secret comparison.
  // NFC vs NFD of the same visual character produce different byte sequences
  // and must compare false (never normalise secrets).

  it("identical CJK strings → true", () => {
    expect(timingSafeEqual("密碼", "密碼")).toBe(true);
  });

  it("NFC vs NFD of same visual char → false (byte-exact, not normalised)", () => {
    // "café" NFC: U+00E9 (precomposed); NFD: e + U+0301 (combining accent)
    const nfc = "café";
    const nfd = "café";
    expect(timingSafeEqual(nfc, nfd)).toBe(false);
  });
});

describe("timingSafeEqual — no length-based early exit (m2 regression guard)", () => {
  // The HMAC approach always runs the same computation regardless of length,
  // so there is no branch an attacker can exploit via timing side-channel.
  //
  // Note: unit tests cannot verify *timing* — they verify *behaviour*.
  // The actual guard against a length-check early-exit is a source-level assertion
  // below, combined with code review. The behaviour tests document intent and
  // catch gross regressions (e.g. reverting to `a === b`).

  it("single char vs two chars → false (not short-circuited)", () => {
    expect(timingSafeEqual("a", "aa")).toBe(false);
  });

  it("zero chars vs one char → false", () => {
    expect(timingSafeEqual("", "a")).toBe(false);
  });

  it("very different lengths → false", () => {
    expect(timingSafeEqual("a", "a".repeat(100))).toBe(false);
  });

  it("source must not contain a length-based early-exit branch", () => {
    // Read the canonical implementation source and assert it contains no
    // `length !==` / `length ===` guard before the HMAC comparison.
    // This is the machine-enforceable part of the m2 regression guard —
    // a future edit that reintroduces the early-exit would fail this test.
    //
    // Strip single-line comments before matching so that documentation of the
    // OLD (buggy) pattern doesn't trigger the guard.
    const src = readFileSync(
      join(__dirname, "../../security/timingSafeEqual.ts"),
      "utf8",
    );
    const codeOnly = src
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("//"))
      .join("\n");
    expect(codeOnly).not.toMatch(/\.length\s*!==\s*.*\.length/);
    expect(codeOnly).not.toMatch(/\.length\s*===\s*.*\.length/);
    // Positive: must use crypto.timingSafeEqual (not plain ===)
    expect(src).toContain("crypto.timingSafeEqual");
  });
});
