import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "../lib/api";
import { LazyFill } from "./LazyFill";

vi.mock("../lib/api", async (original) => ({ ...(await original<typeof import("../lib/api")>()), apiFetch: vi.fn() }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { vi.mocked(apiFetch).mockReset(); });

async function paste(text: string) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const fields = [{ name: "event", label: "事件", kind: "text", required: true }, { name: "pattern", label: "模式", kind: "text", required: true }] as never;
  await act(async () => { root.render(<LazyFill methodId="systems.iceberg_model" fields={fields} state={{}} onState={() => undefined} />); });
  const area = host.querySelector("textarea")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(area, text); area.dispatchEvent(new Event("input", { bubbles: true })); });
  await act(async () => { host.querySelector<HTMLButtonElement>("button.btn")!.click(); });
  const said = host.querySelector('[role="status"]')?.textContent ?? "";
  await act(async () => { root.unmount(); });
  host.remove();
  return said;
}

describe("LazyFill (I-15)", () => {
  it("says what the AI drafted and why a draft failed in words, never a code", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({ draft: { event: "x", pattern: "y" } });
    expect(await paste("一段描述")).toBe("AI 幫你起草了 2 格；請逐格核對後再送出。");
    vi.mocked(apiFetch).mockRejectedValueOnce(new ApiError(429, "AI_DAILY_TOKEN_BUDGET_EXCEEDED: over"));
    const failed = await paste("一段描述");
    expect(failed).toContain("AI 起草沒有完成：");
    expect(failed).not.toMatch(/[A-Z0-9]+_[A-Z0-9_]+|API \d/);
  });
});
