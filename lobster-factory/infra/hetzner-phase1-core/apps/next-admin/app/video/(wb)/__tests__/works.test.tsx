// @vitest-environment jsdom
// N15: the workbench's 作品 asks for the customer the workbench is switched to, and nothing before it is known.
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
const workbench = vi.hoisted(() => ({ loadCapabilities: async () => ({ mainSystem: { organizationId: "aaaaaaaa-0000-4000-8000-000000000001" } }) }));
vi.mock("../workbench", () => ({ useWorkbench: () => workbench }));
import WorksGallery from "../works/WorksGallery";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("every list request carries the workbench's customer", async () => {
  const request = vi.fn(async (_url: string) => Response.json({ ok: true, assets: [] }));
  vi.stubGlobal("fetch", request);
  render(<WorksGallery />);
  await waitFor(() => expect(request.mock.calls.some(([u]) => String(u).includes("domain=ai_video"))).toBe(true));
  const lists = request.mock.calls.map(([u]) => String(u)).filter((u) => u.startsWith("/api/tools/designs?"));
  expect(lists.length).toBeGreaterThan(0);
  for (const u of lists) expect(new URL(u, "http://x").searchParams.get("organizationId")).toBe("aaaaaaaa-0000-4000-8000-000000000001");
});

it("no main system: no list request, a plain message instead", async () => {
  const request = vi.fn(async () => Response.json({ ok: true, assets: [] }));
  vi.stubGlobal("fetch", request);
  workbench.loadCapabilities = async () => ({ mainSystem: null }) as never;
  render(<WorksGallery />);
  await screen.findByText(/沒有連上主系統/);
  expect(request).not.toHaveBeenCalled();
});
