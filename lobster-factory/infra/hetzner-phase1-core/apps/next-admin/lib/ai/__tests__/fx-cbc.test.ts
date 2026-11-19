import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ops-inbox/ingest", () => ({ ingestIncident: vi.fn(async () => ({ id: "i1", error: null })) }));
const { parseCbcBp01, runFxFetch } = await import("../fx-cbc");
const { MIN_AUTO_DAYS } = await import("../fx-rates");
const { ingestIncident } = await import("@/lib/ops-inbox/ingest");

// Shape of https://cpx.cbc.gov.tw/API/DataAPI/Get?FileName=BP01D01 as fetched 2026-11-19 (rows cut to 3, cols to 3).
const fixture = {
  meta: { filename: "BP01D01.px", last_updated: "2026-11-02" },
  data: {
    structure: { Table1: [{ data: "新台幣NTD/USD" }, { data: "日圓JPY/USD" }] },
    dataSets: [
      ["20261029", "32.492", "157.83"],
      ["20261030", "32.478", "157.55"],
      ["20261031", "-", "157.40"],
    ],
  },
};

describe("CBC BP01 parse", () => {
  it("takes the NTD/USD column by its header, skips '-' days, keeps the source row", () => {
    expect(parseCbcBp01(fixture)).toEqual([
      { day: "2026-10-29", rate: 32.492, raw: '["20261029","32.492","157.83"]' },
      { day: "2026-10-30", rate: 32.478, raw: '["20261030","32.478","157.55"]' },
    ]);
  });

  it("a changed shape throws instead of yielding a rate", () => {
    expect(() => parseCbcBp01({ data: { structure: { Table1: [{ data: "JPY/USD" }] }, dataSets: [] } })).toThrow(/no NTD\/USD column/);
    expect(() => parseCbcBp01({ meta: {} })).toThrow(/cbc_shape/);
    // columns swapped: a "rate" of 157 is not NT$/USD
    expect(() => parseCbcBp01({ data: { structure: fixture.data.structure, dataSets: [["20261029", "157.83", "32.4"]] } })).toThrow(/NTD\/USD 157.83/);
  });

  it("a last closed month with fewer than MIN_AUTO_DAYS rows is stale: error + incident, nothing written; an empty running month is fine", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    const sb = { from: () => ({ upsert }) } as never;
    // a complete October (MIN_AUTO_DAYS rows, the last on the 28th) and one November day, as the CBC file looks before it finishes a month
    const rows = [
      ...Array.from({ length: MIN_AUTO_DAYS - 1 }, (_, i) => [`202610${String(i + 1).padStart(2, "0")}`, "32.4", "157.8"]),
      ["20261028", "32.4", "157.8"],
      ["20261103", "31.9", "157.0"],
    ];
    const json = (async () => new Response(JSON.stringify({ ...fixture, data: { ...fixture.data, dataSets: rows } }), { status: 200 })) as typeof fetch;
    // 2026-12-01: November has closed and the file has one November day — one day is not a month
    const stale = await runFxFetch(sb, new Date("2026-12-01T09:00:00Z"), json);
    expect(stale).toMatchObject({ error: expect.stringContaining("cbc_stale: 2026-11 has 1 rows") });
    expect(upsert).not.toHaveBeenCalled();
    expect(ingestIncident).toHaveBeenCalledWith(sb, expect.objectContaining({ fingerprint: "schedule:fx_fetch_cbc:2026-12" }));
    // 2026-11-19: October (closed) is complete, November (running) barely started — normal
    expect(await runFxFetch(sb, new Date("2026-11-19T09:00:00Z"), json)).toEqual({ upserted: MIN_AUTO_DAYS + 1, latestDay: "2026-11-03" });
  });

  it("a failed fetch opens an incident and returns the error, writing no rate", async () => {
    const upsert = vi.fn();
    const sb = { from: () => ({ upsert }) } as never;
    const page = new Response("<!DOCTYPE html><title>Challenge Validation</title>", { status: 200 });
    const r = await runFxFetch(sb, new Date("2026-11-19T09:00:00Z"), (async () => page) as typeof fetch);
    expect(r).toMatchObject({ error: expect.stringContaining("cbc_not_json") });
    expect(upsert).not.toHaveBeenCalled();
    expect(ingestIncident).toHaveBeenCalledWith(sb, expect.objectContaining({ fingerprint: "schedule:fx_fetch_cbc:2026-11", source: "schedule" }));
  });
});
