import { describe, expect, it } from "vitest";
import { readWpNext, readWpUid, sameAccount } from "../WpSignIn";

describe("readWpNext (where the door lands after the one-time exchange)", () => {
  it.each([
    ["#token_hash=t&type=recovery&next=%2Fworks", "/works"],
    ["#token_hash=t&type=recovery&next=%2Fa%2Fb-c", "/a/b-c"],
    ["#token_hash=t&type=recovery&next=%2F", "/"],
    ["#token_hash=t&type=recovery", "/"],
    ["", "/"],
    ["#next=%2F%2Fevil.com", "/"],
    ["#next=%2F%2Fevil", "/"],
    ["#next=%2F%2Fevil%2Fworks", "/"],
    ["#next=https%3A%2F%2Fx", "/"],
    ["#next=%2Fa%3Fb", "/"],
    ["#next=%2FWorks", "/"],
    ["#next=works", "/"],
    ["#next=%2Fa%5Cb", "/"],
  ])("%s -> %s", (hash, expected) => {
    expect(readWpNext(hash)).toBe(expected);
  });
});

describe("a door already signed in (screenshot 2026-10-30: the same member was asked to sign out)", () => {
  const U = "ee33a23c-4f7d-4846-98b0-0543cdbe0dd2";
  it("continues without a question only when the open session is the account the link is for", () => {
    expect(sameAccount(U, readWpUid(`#token_hash=t&type=recovery&uid=${U}`))).toBe(true);
    expect(sameAccount("11111111-1111-4111-8111-111111111111", readWpUid(`#token_hash=t&type=recovery&uid=${U}`))).toBe(false);
    expect(sameAccount(U, readWpUid("#token_hash=t&type=recovery"))).toBe(false);   // a link naming no account asks
    expect(readWpUid("#uid=not-an-id")).toBe("");
  });
});
