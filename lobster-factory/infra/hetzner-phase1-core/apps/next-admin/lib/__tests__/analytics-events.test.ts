// U23: events must be registered before use; platform events carry no personal data; PostHog without a key stays silent.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const capture = vi.fn();
const group = vi.fn();
vi.mock("posthog-js", () => ({ default: { capture: (...a: unknown[]) => capture(...a), group: (...a: unknown[]) => group(...a), register: vi.fn(), identify: vi.fn() } }));

import { EVENT_PROPS, Events, groupOrganization, track } from "../analytics";

const ROOT = path.resolve(__dirname, "../..");
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => {
  if (["node_modules", ".next", "__tests__"].includes(n)) return [];
  const f = path.join(d, n);
  return statSync(f).isDirectory() ? walk(f) : /\.tsx?$/.test(n) ? [f] : [];
});

afterEach(() => { vi.unstubAllEnvs(); capture.mockClear(); group.mockClear(); });

describe("event registry", () => {
  it("the three platform events are registered with their names", () => {
    expect([Events.CLIENT_PICKED, Events.BLOCKED_SHOWN, Events.LOGIN_SUCCEEDED]).toEqual(["client_picked", "blocked_shown", "login_succeeded"]);
    expect(Object.keys(EVENT_PROPS).sort()).toEqual(["blocked_shown", "client_picked", "login_succeeded"]);
  });

  it("no source file captures an unregistered event: posthog.capture only in lib/analytics.ts, track() only with Events.X", () => {
    const bad: string[] = [];
    for (const f of walk(ROOT)) {
      const rel = path.relative(ROOT, f).split(path.sep).join("/");
      const s = readFileSync(f, "utf8");
      if (rel !== "lib/analytics.ts" && /posthog\.capture\(/.test(s)) bad.push(`${rel}: posthog.capture`);
      for (const m of s.matchAll(/\btrack\(\s*([^,)]+)/g)) if (/["'`]/.test(m[1]) || !/^(Events\.[A-Z_]+|[a-z]+ \? Events\.[A-Z_]+ : Events\.[A-Z_]+)$/.test(m[1].trim())) bad.push(`${rel}: track(${m[1].trim()})`);
    }
    expect(bad).toEqual([]);
  });
});

describe("no personal data in event properties", () => {
  it("no property name suggests an email, a name, a url, a query or a token", () => {
    const risky = /email|mail|name|token|url|href|query|search|path|password|phone/i;
    const keys = Object.values(EVENT_PROPS).flat();
    expect(keys.filter((k) => risky.test(k))).toEqual([]);
  });

  it("track() drops a property that is not declared for the event", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    vi.stubGlobal("window", {});
    track(Events.LOGIN_SUCCEEDED, { door: "staff", email: "a@b.c", url: "https://x/?token=1" } as never);
    expect(capture).toHaveBeenCalledWith("login_succeeded", { door: "staff" });
    vi.unstubAllGlobals();
  });

  it("the group is the server-made hash passed through unchanged", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    vi.stubGlobal("window", {});
    groupOrganization("0123456789abcdef");
    expect(group).toHaveBeenCalledWith("organization", "0123456789abcdef");
    vi.unstubAllGlobals();
  });
});

describe("without a PostHog key", () => {
  it("track and groupOrganization do nothing and do not throw", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    vi.stubGlobal("window", {});
    expect(() => { track(Events.CLIENT_PICKED, { ms_since_load: 1, surface: "workspace" }); groupOrganization("o"); }).not.toThrow();
    expect(capture).not.toHaveBeenCalled();
    expect(group).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("trackClientPicked", () => {
  it("sets the group to the picked row's hash, then sends client_picked; it calls no API and holds no /api string", async () => {
    const { trackClientPicked } = await import("../client-context/track-picked");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    vi.stubGlobal("window", {});
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    trackClientPicked("0123456789abcdef", false);
    expect(group).toHaveBeenCalledWith("organization", "0123456789abcdef");
    expect(capture).toHaveBeenCalledWith("client_picked", expect.objectContaining({ surface: "workspace" }));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(readFileSync(path.join(ROOT, "lib/client-context/track-picked.ts"), "utf8")).not.toContain("/api/");
    vi.unstubAllGlobals();
  });
  it("a row without a hash: the event goes, no group", async () => {
    const { trackClientPicked } = await import("../client-context/track-picked");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    vi.stubGlobal("window", {});
    trackClientPicked(undefined, true);
    expect(group).not.toHaveBeenCalled();
    expect(capture).toHaveBeenCalledWith("client_picked", expect.objectContaining({ surface: "door" }));
    vi.unstubAllGlobals();
  });
});
