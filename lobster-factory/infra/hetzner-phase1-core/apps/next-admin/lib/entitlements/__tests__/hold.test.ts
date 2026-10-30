// ADR 017 4b-12: a priced call holds its credits before it starts. Before this, calls already running on one grant when
// the wallet ran dry (a video's three scenes side by side) finished unpaid.
import { describe, expect, it } from "vitest";
import { can } from "../can";
import { CUSTOMER, gateFixture } from "./gate-fixtures";

const ACTOR = `client:${CUSTOMER.orgId}:user-1`;

/** A wallet that really moves, like 0148: hold refuses past 0 and records the hold; settle gives back held - kept once. */
function wallet(start: number) {
  const f = gateFixture({ credits: true, balance: start });
  let balance = start;
  const holds = new Map<string, number>();
  const take = async ({ units, idempotencyKey }: { units: number; idempotencyKey: string }) => {
    if (balance < units) return { ok: false, balance };
    balance -= units;
    holds.set(idempotencyKey, units);
    return { ok: true, balance };
  };
  f.debit.mockImplementation(take);
  f.hold.mockImplementation(take);
  f.settleHold.mockImplementation(async ({ idempotencyKey, kept }) => {
    const held = holds.get(idempotencyKey);
    if (held === undefined || kept > held) throw new Error("hold_invalid_kept");
    balance += held - kept;
    holds.delete(idempotencyKey);
    return held - kept;
  });
  return { ...f, balance: () => balance };
}

describe("Grant.hold -- credits are taken before a priced call starts", () => {
  it("three scenes side by side on a wallet that covers two: the third is not started, nothing runs unpaid", async () => {
    const w = wallet(20);
    const grant = await can(CUSTOMER, "video.motion", ACTOR, w.deps);
    const holds = await Promise.all([grant.hold(10), grant.hold(10), grant.hold(10)]);
    expect(holds.filter((h) => h !== null)).toHaveLength(2);
    for (const h of holds) if (h) expect(await h.settle(10)).toEqual({ charged: 10, shortfall: 0 });
    expect(w.balance()).toBe(0);
  });

  it("a price above what the wallet held at permit time is refused, not shrunk to fit (critic 2026-10-30 H3)", async () => {
    const w = wallet(1);
    const grant = await can(CUSTOMER, "video.motion", ACTOR, w.deps);
    expect(await grant.hold(154)).toBeNull();
    expect(w.hold).not.toHaveBeenCalled();
    expect(w.balance()).toBe(1);
  });

  it("settle keeps what the delivered call cost and gives back the rest; nothing delivered gives back all of it", async () => {
    const w = wallet(50);
    const grant = await can(CUSTOMER, "studio.upscale", ACTOR, w.deps);
    const used = (await grant.hold(10))!;
    expect(await used.settle(4)).toEqual({ charged: 4, shortfall: 0 });
    const failed = (await grant.hold(10))!;
    expect(await failed.settle(0)).toEqual({ charged: 0, shortfall: 0 });
    expect(w.balance()).toBe(46);
    expect(w.settleHold.mock.calls.map(([r]) => r)).toEqual([
      { idempotencyKey: `ai-call:${used.id}`, kept: 4 },
      { idempotencyKey: `ai-call:${failed.id}`, kept: 0 },
    ]);
  });

  it("a call that cost more than its hold is charged the rest; a hold settles once", async () => {
    const w = wallet(50);
    const grant = await can(CUSTOMER, "video.transcribe", ACTOR, w.deps);
    const h = (await grant.hold(5))!;
    expect(await h.settle(8)).toEqual({ charged: 8, shortfall: 0 });
    expect(w.balance()).toBe(42);
    await expect(h.settle(8)).rejects.toThrow("hold_already_settled");
  });

  it("shadow holds nothing and never debits", async () => {
    const f = gateFixture({ credits: true, balance: 50, mode: "shadow" });
    const grant = await can(CUSTOMER, "studio.image", "ops:operator:staff-1", f.deps);
    const h = (await grant.hold(10))!;
    expect(h.units).toBe(0);
    await h.settle(10);
    expect(f.debit).not.toHaveBeenCalled();
    expect(f.hold).not.toHaveBeenCalled();
  });
});
