// @vitest-environment jsdom
//
// SF-P old-data test for the two tabs moved off the retired /onboard wizard: a client's stored department selection and
// its existing service bindings show on the client page as stored, and saving sends them back unchanged.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DepartmentsTab } from "../DepartmentsTab";
import { ExternalServicesTab } from "../ExternalServicesTab";
import { ClientHubTabs, type ClientHubTabsProps } from "../ClientHubTabs";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.unstubAllGlobals();
});
function mount(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(node));
  return host;
}
const box = (el: HTMLElement, text: string) =>
  [...el.querySelectorAll("label")].find((l) => l.textContent?.includes(text))!.querySelector("input") as HTMLInputElement;
const button = (el: HTMLElement, text: string) => [...el.querySelectorAll("button")].find((b) => b.textContent?.includes(text))!;

describe("部門選型 tab", () => {
  const STORED = ["CLU_FINANCE", "CLU_RETIRED_OLD"];

  it("opens on the stored selection, shows an id the catalog dropped, and saves the same array back", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      new Response(JSON.stringify({ ok: true, selection: JSON.parse(String(init?.body)).selection, reviewedAt: "2026-11-23" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const el = mount(<DepartmentsTab slug="soulful" stored={STORED} reviewedAt="2026-05-13" />);
    expect(el.textContent).toContain("上次儲存 2026-05-13");
    const checked = [...el.querySelectorAll<HTMLInputElement>("input[type=checkbox]")].filter((c) => c.checked);
    expect(checked).toHaveLength(2);
    expect(box(el, "CLU_RETIRED_OLD").checked).toBe(true);

    await act(async () => { button(el, "儲存").click(); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/ops/clients/soulful/departments");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({ selection: STORED });
    expect(el.textContent).toContain("上次儲存 2026-11-23");
  });
});

describe("部門選型 tab inside the client page (critic M1)", () => {
  it("a save survives switching tabs: the remounted tab starts from the saved value, so the next save keeps it", async () => {
    const sent: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      const selection = JSON.parse(String(init?.body)).selection;
      sent.push(selection);
      return new Response(JSON.stringify({ ok: true, selection, reviewedAt: "2026-11-23" }), { status: 200 });
    }));
    const props = {
      org: { id: "org-1", slug: "soulful", name: "Soulful", type: "client", status: "active" },
      cfg: { department_selection: ["CLU_FINANCE"], department_selection_reviewed_at: "2026-05-13" },
      health: null, wp: null, runs: [], installRuns: [], integrations: [], wpSites: [], sites: [], researchBridgesEnabled: false,
      deptSummary: { slug: "soulful", activeCount: 1, totalCount: 20, enterpriseTier: "smb", byGroup: [] },
      billing: {}, initialTab: "部門選型",
    } as unknown as ClientHubTabsProps;
    const el = mount(<ClientHubTabs {...props} />);
    act(() => { box(el, "資安／身分／存取").click(); });
    await act(async () => { button(el, "儲存").click(); });
    act(() => { [...el.querySelectorAll("button")].find((b) => b.textContent === "佈建")!.click(); });
    act(() => { [...el.querySelectorAll("button")].find((b) => b.textContent === "部門選型")!.click(); });
    expect(box(el, "資安／身分／存取").checked).toBe(true);
    expect(el.textContent).toContain("上次儲存 2026-11-23");
    await act(async () => { button(el, "儲存").click(); });
    expect(sent[1]).toEqual(["CLU_FINANCE", "CLU_SECURITY_IT"]);
  });
});

describe("外部服務 tab", () => {
  const org = { id: "11111111-1111-4111-8111-111111111111", slug: "soulful", name: "Soulful" };
  const bindings = [
    { provider: "sentry", status: "active", last_tested_at: null, last_error: null },
    { provider: "posthog", status: "failed", last_tested_at: null, last_error: "quota" },
  ];

  it("shows each service's stored status and sends the ticked ones for this organization", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, runId: "run_1", providers: ["uptime_kuma"] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const el = mount(<ExternalServicesTab org={org} siteUrl="https://soulful.example" bindings={bindings} />);
    const status = (id: string) => el.querySelector(`[data-service="${id}"]`)!.textContent!;
    expect(status("sentry")).toContain("已開通");
    expect(status("posthog")).toContain("失敗");
    expect(status("posthog")).toContain("quota");
    expect(status("github")).toContain("未開通");

    act(() => { box(el, "Uptime Kuma").click(); });
    const email = el.querySelector<HTMLInputElement>("input[type=email]")!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(email, "owner@soulful.example");
      email.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { button(el, "開通選取的 1 個服務").click(); });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/build/provision-services");
    // empty hints send the defaults shown in the fields: the monitor watches this client's site, not the task's default URL
    expect(JSON.parse(String(init.body))).toEqual({ organizationId: org.id, customerEmail: "owner@soulful.example", providers: ["uptime_kuma"],
      hints: { uptimeMonitorUrl: "https://soulful.example", uptimeMonitorName: "Soulful" } });
    expect(el.textContent).toContain("run_1");
  });
});
