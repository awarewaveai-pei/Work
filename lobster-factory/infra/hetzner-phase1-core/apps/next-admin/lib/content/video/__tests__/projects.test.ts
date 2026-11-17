import { beforeEach, describe, expect, it, vi } from "vitest";

const getSupabaseWriteClient = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient }));

import { projectBelongsTo, ensureWorkbenchProject } from "../projects";
import { fakeDb } from "./fake-db";
import type { SupabaseClient } from "@supabase/supabase-js";

const ORG = "123e4567-e89b-42d3-a456-426614174001";
const OTHER = "123e4567-e89b-42d3-a456-426614174009";
const PROJECT = "123e4567-e89b-42d3-a456-426614174002";
const dbWith = (row: unknown) => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }) });

beforeEach(() => vi.clearAllMocks());

describe("projectBelongsTo", () => {
  it("a script budget retry keeps the generated project's title", async () => {
    const db = fakeDb(() => ({ media_production_projects: [{ id: PROJECT, organization_id: ORG, source: "video_workbench", source_ref: "project-run", title: "已生成的片名" }] }));
    const result = await ensureWorkbenchProject(db as unknown as SupabaseClient, ORG, "project-run", "一鍵腳本", {}, { retitle: false });
    expect(result.ok && result.item.title).toBe("已生成的片名"); expect(db.log.updates).toEqual([]);
  });
  it("is true only for the project's own organization", async () => {
    getSupabaseWriteClient.mockReturnValue(dbWith({ organization_id: ORG }));
    expect(await projectBelongsTo(PROJECT, ORG)).toBe(true);
    expect(await projectBelongsTo(PROJECT, OTHER)).toBe(false);
  });

  it("fails closed on a missing project, a bad id or no database", async () => {
    getSupabaseWriteClient.mockReturnValue(dbWith(null));
    expect(await projectBelongsTo(PROJECT, ORG)).toBe(false);
    expect(await projectBelongsTo("not-a-uuid", ORG)).toBe(false);
    getSupabaseWriteClient.mockReturnValue(null);
    expect(await projectBelongsTo(PROJECT, ORG)).toBe(false);
  });
});
