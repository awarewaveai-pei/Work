// senderFor without a pool (2026-11-03, Codex finding): of two connected draft mailboxes the one the pipeline drafts for
// (auto_draft) writes the mail, else the pipeline would never draft it.
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { senderFor } from "../sender";

const draft = (id: string, email: string, auto_draft: boolean) => ({ id, organization_id: "org", email, display_name: null, signature_block: "s",
  is_active: true, health_status: "healthy", send_mode: "draft", warmup_stage: "full", daily_limit: 20, connector_id: `c-${id}`, auto_draft });

function db(senders: unknown[], connectedEmails: string[]): SupabaseClient {
  const from = (table: string) => {
    const data = table === "co_sender_accounts" ? senders : connectedEmails.map((email) => ({ settings: { email } }));
    const q: Record<string, unknown> = {};
    for (const k of ["select", "eq", "is", "not", "order", "in"]) q[k] = () => q;
    q.limit = async () => ({ data, error: null });
    return q;
  };
  return { from } as unknown as SupabaseClient;
}

describe("senderFor picks the auto_draft mailbox among connected draft mailboxes", () => {
  it("the older one without the switch loses to the one with it; without any switch the first connected one", async () => {
    const a = draft("a", "a@x.example", false), b = draft("b", "b@x.example", true);
    expect((await senderFor(db([a, b], ["a@x.example", "b@x.example"]), "org", { agencyFallback: false }))?.id).toBe("b");
    expect((await senderFor(db([a, { ...b, auto_draft: false }], ["a@x.example", "b@x.example"]), "org", { agencyFallback: false }))?.id).toBe("a");
    expect((await senderFor(db([a, b], ["a@x.example"]), "org", { agencyFallback: false }))?.id).toBe("a");  // b not connected
    const pausedFirst = { ...draft("p", "p@x.example", true), health_status: "paused" };
    expect((await senderFor(db([pausedFirst, b], ["p@x.example", "b@x.example"]), "org", { agencyFallback: false }))?.id).toBe("b");
  });
});
