/** Provider SDK boundary (ADR 017). Lazy loads preserve server-only construction at each call site.
 * Client model pickers import claude-params directly, so their graph contains no provider SDK.
 * Authorization is wired to callers in ADR 017 step 3; this module owns vendor dependencies now.
 */
export * from "./claude-params";
export type { default as Anthropic } from "@anthropic-ai/sdk";

export async function loadAnthropic() {
  return (await import("@anthropic-ai/sdk")).default;
}

export async function loadGoogleGenerativeAI() {
  return (await import("@google/generative-ai")).GoogleGenerativeAI;
}
