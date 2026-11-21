// @vitest-environment jsdom
//
// R8 (operator 2026-11-21): 題目, 客戶 and 五步驟 are three pages, each drawing only its own part of the same board.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OverviewData } from "@/lib/content/topics/overview-load";
import type { ClientPickerSlot } from "../AutoContentOverview";
import { TopicsBoard } from "../TopicsBoard";

const row = (siteId: string, orgName: string, failed = 0) => ({
  siteId, organizationId: `o-${siteId}`, orgName, siteName: `${orgName} 網站`, enabled: true, dailyLimit: 3, topicGate: "human", publishGate: "review",
  proposedThisMonth: true, attemptedAt: null, pending: 0, inProgress: 0, failed, notOpened: false, spendUsd: 0, problem: failed > 0, lastError: null,
});
const overview = { rows: [row("s1", "甲", 2), row("s2", "乙")], cells: {}, actual: {}, spendNote: null } as unknown as OverviewData;
/** Stands in for OrgPicker: one button per client, named as the page hands it over. */
const picker: ClientPickerSlot = ({ orgs, onPick, badge }) => <div>{orgs.map((o) => <button key={o.id} type="button" onClick={() => onPick(o)}>{o.name}{badge(o)}</button>)}</div>;

function stubFetch() {
  const site = (id: string) => ({ id, name: id, url: "https://x.example", organization_id: `o-${id}`, org_slug: id, contentDefaults: {} });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(
    url === "/api/content/sites" ? { ok: true, sites: [site("s1"), site("s2")] } : { ok: true, topics: [], folders: [] }))));
}
const clients = () => screen.queryByRole("region", { name: "客戶" });
const steps = () => screen.queryByRole("region", { name: "五個步驟" });
const topicList = () => screen.queryByText("核准所選");

afterEach(() => { cleanup(); vi.unstubAllGlobals(); history.replaceState(null, "", "/"); });

describe("TopicsBoard views", () => {
  it("topics: only the topic list, with the site it is for", async () => {
    stubFetch();
    render(<TopicsBoard overview={overview} />);
    expect(await screen.findByText("核准所選")).toBeTruthy();
    expect(screen.getByText("甲・甲 網站")).toBeTruthy();
    expect(clients()).toBeNull();
    expect(steps()).toBeNull();
  });

  it("clients: a picked client's sites only, the problem one named so, and its link carries ?site=", () => {
    stubFetch();
    render(<TopicsBoard overview={overview} view="clients" pickClient={picker} />);
    expect(clients()).toBeTruthy();
    expect(steps()).toBeNull();
    expect(topicList()).toBeNull();
    expect(screen.getByRole("button", { name: /^甲.*失敗 2$/ })).toBeTruthy();   // the problem is the picker badge
    expect(screen.queryByText("乙 網站")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "乙" }));
    expect(screen.getByRole("link", { name: "看這個網站的題目" }).getAttribute("href")).toBe("/tools/content/topics?site=s2");
  });

  it("clients: ?site= picks that site's client", async () => {
    stubFetch();
    history.replaceState(null, "", "/tools/content/topics/clients?site=s2");
    render(<TopicsBoard overview={overview} view="clients" pickClient={picker} />);
    expect((await screen.findByRole("link", { name: "看這個網站的題目" })).getAttribute("href")).toBe("/tools/content/topics?site=s2");
  });

  it("steps: only the picked site's five steps, with buttons to change site", async () => {
    stubFetch();
    render(<TopicsBoard overview={overview} view="steps" />);
    expect(await screen.findByRole("region", { name: "五個步驟" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "甲・甲 網站" }).getAttribute("aria-pressed")).toBe("true");
    expect(clients()).toBeNull();
    expect(topicList()).toBeNull();
  });
});
