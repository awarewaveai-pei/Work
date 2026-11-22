// @vitest-environment jsdom
// Card K11 (ADR 020 §2.4): /tools/video registers the org layer (the client rail shows) and opens the workbench on the
// client picked there; no client picked = no org (the workbench keeps its own); a client account carries nothing.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientContext, type ClientContextValue } from "@/lib/client-context/use-client-context";
import OpenWorkbench from "../OpenWorkbench";

const ORG = "39ad4149-5044-4077-8d9a-b6b916de0e21";
function ctx(over: Partial<ClientContextValue>): ClientContextValue {
  return { viewer: "staff", layer: null, status: "unselected", org: null, site: null, sites: null, sitesFailed: false, internalOrgId: null,
    onDoor: false, hosts: {}, setOrg: () => {}, setSite: () => {}, register: vi.fn(() => () => {}), ...over } as ClientContextValue;
}
function openWith(value: ClientContextValue): string {
  const open = vi.fn(() => ({ postMessage: () => {} }) as unknown as Window);
  vi.stubGlobal("open", open);
  render(<ClientContext.Provider value={value}><OpenWorkbench videoHost="video.example.test" open="script-forge" /></ClientContext.Provider>);
  fireEvent.click(screen.getByText("開啟影音工作台"));
  return (open.mock.calls[0] as unknown[])[0] as string;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("OpenWorkbench (K11)", () => {
  it("registers the org layer", () => {
    const value = ctx({});
    render(<ClientContext.Provider value={value}><OpenWorkbench videoHost="video.example.test" open={null} /></ClientContext.Provider>);
    expect(value.register).toHaveBeenCalledWith("org");
  });
  it("staff with a client picked: the handoff link carries org on the server-given host", () => {
    expect(openWith(ctx({ org: ORG, status: "ok" }))).toBe(`https://video.example.test/handoff?open=script-forge&org=${ORG}`);
  });
  it("staff with no client: no org, and the page says the workbench keeps its own", () => {
    expect(openWith(ctx({}))).toBe("https://video.example.test/handoff?open=script-forge");
    expect(screen.getByText(/工作台會用它目前的客戶/)).toBeTruthy();
  });
  it("a client account carries no org", () => {
    expect(openWith(ctx({ viewer: "client", org: ORG, status: "ok" }))).toBe("https://video.example.test/handoff?open=script-forge");
  });
});
