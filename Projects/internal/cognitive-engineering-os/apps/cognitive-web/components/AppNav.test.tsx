import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../lib/api";
import { AppNav } from "./AppNav";

let current = "/";
vi.mock("next/navigation", () => ({ usePathname: () => current }));
vi.mock("../lib/api", async (original) => ({ ...(await original<typeof import("../lib/api")>()), apiFetch: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.resetAllMocks());

async function hrefsAt(path: string, facilitator: boolean): Promise<string[]> {
  current = path;
  vi.mocked(apiFetch).mockResolvedValue({ facilitator, supervisor: false } as never);
  const host = document.createElement("div"); document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(<AppNav />); });
  const hrefs = [...host.querySelectorAll("a.navi")].map((link) => link.getAttribute("href") ?? "");
  await act(async () => { root.unmount(); }); host.remove();
  return hrefs;
}

describe("main menu (ENTRY_SLICE1_CHECKLIST.md items 11-12)", () => {
  it("five things a person does, then the account; 帶領 only for a facilitator", async () => {
    expect(await hrefsAt("/", false)).toEqual(["/", "/projects", "/analyze", "/me/teach", "/me/data", "/settings", "/help"]);
    expect(await hrefsAt("/", true)).toContain("/lead");
  });

  it("every page the old menu had is still one click away from its own section", async () => {
    for (const page of ["/", "/projects", "/projects/new", "/groups", "/me/teach", "/me/learn", "/methods", "/workflows", "/me/data", "/settings", "/help"]) {
      expect(await hrefsAt(page, false), page).toContain(page);
    }
    expect(await hrefsAt("/lead", true)).toContain("/lead");
    expect(await hrefsAt("/lead", false)).not.toContain("/lead");   // typing the address does not make you a facilitator
  });
});
