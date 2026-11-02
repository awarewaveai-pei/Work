import { describe, it, expect } from "vitest";
import { aggregateStats, statsToCsv } from "../stats";

// Three leads of one service, two variants: A (angle price) goes to L1 and L2, B (angle speed) to L3.
describe("aggregateStats (SPEC §5.9)", () => {
  const msg = (id: string, lead_id: string, variant_label: string, angle: string, created_at = "2026-11-01T00:00:00Z") =>
    ({ id, lead_id, output_type: "cold_email", variant_label, angle, created_at });
  const input = {
    messages: [msg("m1", "L1", "A", "price"), msg("m2", "L2", "A", "price"), msg("m3", "L3", "B", "speed"),
      { ...msg("m4", "L1", "A", "price", "2026-11-05T00:00:00Z"), output_type: "followup" }],
    events: [
      { message_id: "m1", lead_id: "L1", event_type: "draft_created" }, { message_id: "m1", lead_id: "L1", event_type: "sent" },
      { message_id: "m2", lead_id: "L2", event_type: "draft_created" }, { message_id: "m2", lead_id: "L2", event_type: "sent" },
      { message_id: "m2", lead_id: "L2", event_type: "hard_bounced" },
      { message_id: "m3", lead_id: "L3", event_type: "draft_created" }, { message_id: "m3", lead_id: "L3", event_type: "sent" },
      { message_id: "m3", lead_id: "L3", event_type: "opened" },
    ],
    replies: [
      { lead_id: "L1", kind: "reply", reply_type: "pricing" }, { lead_id: "L1", kind: "reply", reply_type: "interested" },
      { lead_id: "L2", kind: "bounce", reply_type: "bounce" }, { lead_id: "L3", kind: "reply", reply_type: "no_need" },
    ],
    leads: [{ id: "L1", service_profile_id: "P", status: "customer" }, { id: "L2", service_profile_id: "P", status: "do_not_contact" },
      { id: "L3", service_profile_id: "P", status: "lost" }],
    profileNames: new Map([["P", "網站維護"]]),
  };

  it("counts each stage once per group and derives the two rates from sent", () => {
    const rows = aggregateStats(input);
    const a = rows.find((r) => r.variant_label === "A")!;
    const b = rows.find((r) => r.variant_label === "B")!;
    expect(rows).toHaveLength(2);
    expect(a).toMatchObject({ service_name: "網站維護", angle: "price", generated: 3, drafted: 2, sent: 2, bounced: 1, replied: 1, positive: 1, customer: 1, lost: 0 });
    expect(a.reply_rate).toBe(0.5);
    expect(a.positive_rate).toBe(0.5);
    expect(b).toMatchObject({ generated: 1, sent: 1, replied: 1, positive: 0, lost: 1, meeting_booked: 0 });
    expect(b.reply_rate).toBe(1);
    expect(b.positive_rate).toBe(0);
  });

  it("has no open-rate column in the CSV", () => {
    const csv = statsToCsv(aggregateStats(input));
    expect(csv).toContain("回覆率");
    expect(csv).not.toMatch(/開信|open/i);
  });
});
