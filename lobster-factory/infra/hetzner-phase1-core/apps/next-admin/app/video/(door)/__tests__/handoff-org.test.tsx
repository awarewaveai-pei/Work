// @vitest-environment jsdom
// Card K11 (ADR 020 §2.4): the handoff page passes org on to the workbench shell (/?open=X&org=Y); a malformed org is dropped.
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/portal/hosts", () => ({ staffHosts: () => ["app.example.test"] }));
import VideoHandoffPage from "../handoff/page";

const ORG = "39ad4149-5044-4077-8d9a-b6b916de0e21";
async function landAt(params: Record<string, string>): Promise<string> {
  const replace = vi.fn();
  vi.stubGlobal("location", { ...window.location, replace });   // no opener: the page goes on at once
  render(await VideoHandoffPage({ searchParams: Promise.resolve(params) }));
  return replace.mock.calls[0][0] as string;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("video handoff org (K11)", () => {
  it("forwards org to the shell with open", async () => {
    expect(await landAt({ open: "script-forge", org: ORG })).toBe(`/?open=script-forge&org=${ORG}`);
  });
  it("drops a malformed org", async () => {
    expect(await landAt({ open: "script-forge", org: "not-a-uuid" })).toBe("/?open=script-forge");
  });
  it("without org: as before", async () => {
    expect(await landAt({})).toBe("/");
  });
});
