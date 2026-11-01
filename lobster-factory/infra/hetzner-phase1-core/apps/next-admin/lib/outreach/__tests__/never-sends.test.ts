// SPEC I3: while send_mode='draft' the program never calls a Gmail send endpoint. The gmail.compose scope itself
// permits drafts.send, so the scope is not the guard; this scan is. Two rules over every shipped file (app/, lib/,
// components/, root modules such as middleware.ts):
// (1) the Gmail API host appears only in lib/outreach/google-oauth.ts -- one exit for all Gmail HTTP, so a send cannot
// be built elsewhere from parts; (2) no file but the auto-send seam (card C8) names a send call or a send/modify scope.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GMAIL_SCOPES } from "../google-oauth";

const ROOT = path.resolve(__dirname, "../../..");
const GMAIL_EXIT = "lib/outreach/google-oauth.ts";
const SEND_ALLOWED = "lib/outreach/send-adapter.ts";
// REST paths and client-library calls of the two send operations, and the scopes that let a token send or alter mail.
const SEND = /\/(?:drafts|messages)\/send\b|\b(?:drafts|messages)\s*\.\s*send\s*\(|auth\/gmail\.(?:send|modify)\b|["'`]https:\/\/mail\.google\.com\/["'`]/;

/** Shipped source only: a test that asserts a name is absent has to spell it. */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "__tests__" || e.name === "node_modules" ? [] : sources(f);
    return /\.[cm]?[jt]sx?$/.test(e.name) && !/\.test\.[cm]?[jt]sx?$/.test(e.name) ? [f] : [];
  });
}
const ROOT_FILES = readdirSync(ROOT).filter((n) => /^[a-z][\w.-]*\.[cm]?[jt]s$/.test(n) && !/\.(test|config)\./.test(n)).map((n) => path.join(ROOT, n));
const files = [...["app", "lib", "components"].flatMap((d) => sources(path.join(ROOT, d))), ...ROOT_FILES].map((f) => path.relative(ROOT, f).split(path.sep).join("/"));
const lines = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8").split("\n").map((text, i) => ({ text, at: `${rel}:${i + 1}` }));

describe("outreach never sends", () => {
  it("scans the shipped source", () => {
    expect(files).toContain(GMAIL_EXIT);
    expect(files).toContain("app/api/outreach/messages/gmail-draft/route.ts");
  });

  it("only google-oauth.ts talks to the Gmail API host", () => {
    expect(files.filter((f) => f !== GMAIL_EXIT).flatMap(lines).filter((l) => l.text.includes("gmail.googleapis.com")).map((l) => l.at)).toEqual([]);
  });

  it("no file but the send adapter names a send call or a send/modify scope", () => {
    expect(files.filter((f) => f !== SEND_ALLOWED).flatMap(lines).filter((l) => !/^\s*(\/\/|\*)/.test(l.text) && SEND.test(l.text)).map((l) => l.at)).toEqual([]);
  });

  it("the pattern catches each way of naming a send", () => {
    for (const s of ['fetch(`${BASE}/drafts/send`)', "gmail.users.messages.send({", 'scope: "https://www.googleapis.com/auth/gmail.send"', '"https://mail.google.com/"'])
      expect(SEND.test(s), s).toBe(true);
    expect(SEND.test('<a href="https://mail.google.com/mail/u/0/#drafts">')).toBe(false);
  });

  it("requests only the compose and readonly scopes", () => {
    expect([...GMAIL_SCOPES]).toEqual(["https://www.googleapis.com/auth/gmail.compose", "https://www.googleapis.com/auth/gmail.readonly"]);
  });
});
