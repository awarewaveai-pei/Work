// GET /api/internal/collect/runs/progress: the engine's bearer, both ids, counts only.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET } from "./route";
import { finishProgress, startProgress, updateProgress } from "@/lib/collect/research-progress";

const PROJECT = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
const OTHER = "11111111-1111-4111-8111-111111111111";
const originalEnv = { ...process.env };

const req = (project: string, run: string, auth = "Bearer runs-token") =>
  new Request(`http://localhost/api/internal/collect/runs/progress?project_id=${project}&run_id=${run}`, { headers: { authorization: auth } });

beforeEach(() => {
  process.env.COLLECT_RESEARCH_RUNS_TOKEN = "runs-token";
});
afterEach(() => {
  process.env = { ...originalEnv };
});

describe("GET /api/internal/collect/runs/progress", () => {
  it("401 on a wrong bearer; 404 for a run this process does not hold or another project's id", async () => {
    startProgress(PROJECT, "run_p1");
    expect((await GET(req(PROJECT, "run_p1", "Bearer nope"))).status).toBe(401);
    expect((await GET(req(PROJECT, "run_unknown"))).status).toBe(404);
    expect((await GET(req(OTHER, "run_p1"))).status).toBe(404);
  });

  it("returns the counts while running, then done", async () => {
    startProgress(PROJECT, "run_p2");
    updateProgress(PROJECT, "run_p2", { pagesFound: 40, pagesChecked: 12, ingested: 10, setAside: 3 });
    const running = await (await GET(req(PROJECT, "run_p2"))).json();
    expect(running).toMatchObject({ ok: true, state: "running", pages_found: 40, pages_checked: 12, ingested: 10, set_aside: 3 });
    finishProgress(PROJECT, "run_p2", { pagesFound: 40, pagesChecked: 40, ingested: 17, setAside: 19 });
    expect(await (await GET(req(PROJECT, "run_p2"))).json()).toMatchObject({ state: "done", pages_checked: 40, ingested: 17, set_aside: 19 });
  });
});
