// @vitest-environment jsdom
//
// R8 + K8 (ADR 020): 題目 and 五步驟 are two pages of the same board; the site is the client rail's, never a picker drawn
// by the page, and nothing is read before a site is picked.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OverviewData } from "@/lib/content/topics/overview-load";
import { PICK_SITE_FIRST, TopicsBoard } from "../TopicsBoard";
import { DoorTopicsBoard } from "@/app/content/topics/DoorTopicsBoard";
import { stubContext } from "./client-context-stub";

const row = (siteId: string, orgName: string) => ({
  siteId, organizationId: `o-${siteId}`, orgName, siteName: `${orgName} 網站`, enabled: true, dailyLimit: 3, topicGate: "human", publishGate: "review",
  proposedThisMonth: true, attemptedAt: null, pending: 0, inProgress: 0, failed: 0, notOpened: false, spendUsd: 0, problem: false, lastError: null,
});
// the server reads one client at a time; these tests reuse one overview for either picked client
const overviewFor = (org: string) => ({ organizationId: org, rows: [row("s1", "甲"), row("s2", "乙")], cells: {}, actual: {}, spendNote: null }) as unknown as OverviewData;
const site = (id: string) => ({ id, name: id, url: "https://x.example", organization_id: `o-${id}`, org_slug: id, contentDefaults: {} });
const topic = { id: "t9", organization_id: "o-s2", site_id: "s2", title: "十月的題", keyword: "k", angle: null, status: "proposed", formats: ["article"],
  scheduled_for: "2026-10-05T01:00:00Z", source: "manual", source_ref: {}, artifacts: {}, review: null, last_error: null, version: 1 };

function stubFetch() {
  const f = vi.fn(async (url: string) => new Response(JSON.stringify({ ok: true, topics: url.includes("siteId=s2") ? [topic] : [], folders: [] })));
  vi.stubGlobal("fetch", f);
  return f;
}
const picked = (id: string) => stubContext({ org: `o-${id}`, site: id, sites: [site("s1"), site("s2")] });

afterEach(() => { cleanup(); vi.unstubAllGlobals(); history.replaceState(null, "", "/"); });

describe("TopicsBoard views", () => {
  it("topics: registers the site layer and shows the rail's site, with no site buttons of its own", async () => {
    stubFetch();
    const { wrap, register } = picked("s1");
    render(<TopicsBoard overview={overviewFor("o-s1")} />, { wrapper: wrap });
    expect(await screen.findByText("核准所選")).toBeTruthy();
    expect(register).toHaveBeenCalledWith("site");
    expect(screen.getByText("甲・甲 網站")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /網站$/ })).toBeNull();
    expect(screen.queryByRole("region", { name: "五個步驟" })).toBeNull();
  });

  it("no site picked: asks for one and reads nothing (no first-site fallback)", () => {
    const f = stubFetch();
    const { wrap } = stubContext({ status: "unselected", org: null, site: null, sites: null });
    render(<TopicsBoard overview={overviewFor("o-s1")} view="steps" />, { wrapper: wrap });
    expect(screen.getByText(PICK_SITE_FIRST)).toBeTruthy();
    expect(f).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "五個步驟" })).toBeNull();
  });

  it("steps: only the rail's site's five steps, with no site buttons of its own", async () => {
    stubFetch();
    const { wrap } = picked("s1");
    render(<TopicsBoard overview={overviewFor("o-s1")} view="steps" />, { wrapper: wrap });
    expect(await screen.findByRole("region", { name: "五個步驟" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /網站$/ })).toBeNull();
    expect(screen.queryByText("核准所選")).toBeNull();
  });

  it("?site=&month=&topic= (the workbench's link) opens that month and topic on that site", async () => {
    const f = stubFetch();
    history.replaceState(null, "", "/tools/content/topics?site=s2&month=2026-10&topic=t9");
    const { wrap } = picked("s2");
    render(<TopicsBoard overview={overviewFor("o-s2")} />, { wrapper: wrap });
    expect(await screen.findByText("k · 5日 09:00 ·", { exact: false })).toBeTruthy();   // the detail panel of t9
    expect(f.mock.calls.some(([u]) => String(u).includes("siteId=s2&month=2026-10"))).toBe(true);
  });

  it("numbers read for another client than the rail's are not shown (waits for the server's re-read)", () => {
    stubFetch();
    const { wrap } = picked("s1");
    render(<TopicsBoard overview={overviewFor("o-s2")} />, { wrapper: wrap });
    expect(screen.getByText("…")).toBeTruthy();
    expect(screen.queryByText("甲・甲 網站")).toBeNull();
  });

  it("content door: no client picked = the overview is not read; a picked one is read for that client only", async () => {
    const f = stubFetch();
    const none = stubContext({ status: "unselected", org: null, site: null, sites: null });
    render(<DoorTopicsBoard view="topics" />, { wrapper: none.wrap });
    expect(screen.getByText(PICK_SITE_FIRST)).toBeTruthy();
    expect(f).not.toHaveBeenCalled();
    cleanup();
    render(<DoorTopicsBoard view="topics" />, { wrapper: picked("s1").wrap });
    await screen.findByText("…");
    expect(f.mock.calls.map(([u]) => String(u))).toContain("/api/content/topics/overview?organizationId=o-s1");
  });
});
