import { describe, expect, it } from "vitest";
import { readWpNext } from "../WpSignIn";

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
