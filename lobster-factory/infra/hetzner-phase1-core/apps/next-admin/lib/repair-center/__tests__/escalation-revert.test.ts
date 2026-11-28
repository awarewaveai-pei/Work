import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// Invariant (2026-11-28): a run is policy=auto_repair only once GitHub got the comment that re-runs
// .github/workflows/auto-repair-claude.yml. A failed comment puts the policy back to analysis_only,
// so /ops/repairs keeps the escalate button and the operator can retry instead of waiting on a PR
// that will never come.

const postEscalationComment = vi.hoisted(() => vi.fn());
vi.mock("../github", async (orig) => ({ ...(await orig<typeof import("../github")>()), postEscalationComment }));

/** One repair_runs row; an update applies only when every .eq() filter matches, like a conditional UPDATE. */
function buildFakeSupabase(initial: Record<string, unknown>) {
  const state = { row: { ...initial } as Record<string, unknown> };
  function query(patch?: Record<string, unknown>) {
    const filters: Array<[string, unknown]> = [];
    const q = {
      select: () => q,
      eq: (col: string, val: unknown) => (filters.push([col, val]), q),
      not: () => q,
      maybeSingle: async () => {
        const match = filters.every(([c, v]) => state.row[c] === v);
        if (!match) return { data: null, error: null };
        if (patch) state.row = { ...state.row, ...patch };
        return { data: state.row, error: null };
      },
    };
    return q;
  }
  const client = {
    from: (table: string) => {
      if (table === "ops_incidents") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "inc-1", tags: {} }, error: null }) }) }) };
      if (table === "repair_runs") return { select: () => query(), update: (patch: Record<string, unknown>) => query(patch) };
      throw new Error(`unexpected table: ${table}`);
    },
  } as unknown as SupabaseClient;
  return { client, state };
}

const sb = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServerClient: () => sb.current, getSupabaseWriteClient: () => sb.current }));

import { escalateAnalysisOnlyRun } from "../service";

const RUN = {
  id: "run-1",
  incident_id: "inc-1",
  source: "uptime_kuma",
  policy: "analysis_only",
  state: "repairing",
  github_owner: "o",
  github_repo: "r",
  github_issue_number: 7,
  audit_log: [],
};

describe("escalateAnalysisOnlyRun — GitHub comment is part of the escalation", () => {
  let fake: ReturnType<typeof buildFakeSupabase>;
  beforeEach(() => {
    fake = buildFakeSupabase(RUN);
    sb.current = fake.client;
    postEscalationComment.mockReset();
  });

  it("comment posted → policy stays auto_repair", async () => {
    postEscalationComment.mockResolvedValue({ ok: true });
    const res = await escalateAnalysisOnlyRun("run-1", "admin");
    expect(res.ok).toBe(true);
    expect(fake.state.row.policy).toBe("auto_repair");
  });

  it("comment failed → policy back to analysis_only, error returned, audit records why", async () => {
    postEscalationComment.mockResolvedValue({ ok: false, error: "github_comment_502" });
    const res = await escalateAnalysisOnlyRun("run-1", "admin");
    expect(res).toMatchObject({ ok: false, error: "escalation_comment_failed" });
    expect(fake.state.row.policy).toBe("analysis_only");
    const actions = (fake.state.row.audit_log as Array<{ action: string }>).map((e) => e.action);
    expect(actions).toEqual(["escalated_to_auto_repair", "escalation_reverted"]);
  });

  it("comment threw → same revert (no swallowed exception)", async () => {
    postEscalationComment.mockRejectedValue(new Error("fetch failed"));
    const res = await escalateAnalysisOnlyRun("run-1", "admin");
    expect(res.error).toBe("escalation_comment_failed");
    expect(fake.state.row.policy).toBe("analysis_only");
  });

  it("run without a GitHub issue → refused before any write", async () => {
    fake = buildFakeSupabase({ ...RUN, github_issue_number: null });
    sb.current = fake.client;
    const res = await escalateAnalysisOnlyRun("run-1", "admin");
    expect(res).toMatchObject({ ok: false, error: "no_github_issue" });
    expect(fake.state.row.policy).toBe("analysis_only");
    expect(postEscalationComment).not.toHaveBeenCalled();
  });
});
