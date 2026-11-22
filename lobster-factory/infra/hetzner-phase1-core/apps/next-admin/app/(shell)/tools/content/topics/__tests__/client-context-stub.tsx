// Test-only stand-in for the frame's ClientContextProvider: a fixed current client and site, and a record of the layers
// the page registered.
import type { ReactNode } from "react";
import { vi } from "vitest";
import { ClientContext, type ClientContextValue, type ContextSite } from "@/lib/client-context/use-client-context";

export function stubContext(over: Partial<ClientContextValue> & { sites?: readonly ContextSite[] | null } = {}) {
  const register = vi.fn(() => () => {});
  const value: ClientContextValue = {
    viewer: "staff", layer: "site", status: "ok", org: "o1", site: "s1", sites: [], sitesFailed: false, internalOrgId: null,
    onDoor: false, hosts: {}, setOrg: vi.fn(), setSite: vi.fn(), register, ...over,
  };
  const wrap = ({ children }: { children: ReactNode }) => <ClientContext.Provider value={value}>{children}</ClientContext.Provider>;
  return { value, register, wrap };
}
