// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const create = vi.hoisted(() => vi.fn(async () => ({ projectId: "p", episodeId: "e" })));
const workbench = vi.hoisted(() => ({ loadCapabilities: async () => ({ mainSystem: { organizationId: "org" } }), spine: { create } }));
vi.mock("../workbench", () => ({ useWorkbench: () => workbench }));
import ScheduleWorkbench, { adoptTopic } from "../schedule/ScheduleWorkbench";
import type { Workbench } from "../workbench";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

it("shows actual queue states and stop reason, settings link and a read failure", async () => {
  const request = vi.fn(async (_url: string) => Response.json({ items: [
    { id: "1", title: "等待", status: "approved" }, { id: "2", title: "製作", status: "waiting_video" },
    { id: "3", title: "公開", status: "published" }, { id: "4", title: "失敗", status: "failed", last_error: "配音失敗" },
  ] }));
  vi.stubGlobal("fetch", request);
  render(<ScheduleWorkbench settingsHref="https://content.example/topics" />);
  await screen.findByText("進行中・製作影片"); expect(screen.getByText("已發布")).toBeTruthy(); expect(screen.getByText("停下原因：配音失敗")).toBeTruthy();
  expect(screen.getByRole("link", { name: "開啟內容排程設定" }).getAttribute("href")).toBe("https://content.example/topics");
  expect(request.mock.calls[0][0]).toContain("organizationId=org");
  request.mockResolvedValueOnce(new Response("", { status: 503 }));
  fireEvent.click(screen.getByText("重新整理")); await screen.findByRole("alert");
});

it("filters by lane (an old October proposal is 過期), and a row's one button sends the content tool's own action with its version", async () => {
  const items = [
    { id: "o", title: "十月舊題", status: "proposed", scheduled_for: "2026-10-12T01:00:00Z", version: 1 },
    { id: "w", title: "等你核准", status: "proposed", scheduled_for: "2999-01-01T01:00:00Z", version: 4 },
    { id: "r", title: "製作中", status: "waiting_video", version: 2 },
    { id: "f", title: "失敗題", status: "failed", last_error: "配音失敗", version: 3 },
  ];
  const request = vi.fn(async (_url: string, init?: RequestInit) => (init?.method === "PATCH" ? Response.json({ ok: true }) : Response.json({ items })));
  vi.stubGlobal("fetch", request);
  render(<ScheduleWorkbench settingsHref={null} />);
  await screen.findByText("十月舊題");
  expect(screen.getByText("全部 4")).toBeTruthy(); expect(screen.getByText("過期 1")).toBeTruthy(); expect(screen.getByText("等你處理 2")).toBeTruthy();
  fireEvent.click(screen.getByText("過期 1"));
  expect(screen.getByText("十月舊題")).toBeTruthy(); expect(screen.queryByText("等你核准")).toBeNull(); expect(screen.queryByText("製作中")).toBeNull();
  fireEvent.click(screen.getByText("等你處理 2"));
  expect(screen.getByText("等你核准")).toBeTruthy(); expect(screen.queryByText("十月舊題")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "核准" }));
  await waitFor(() => expect(request.mock.calls.some(([u, i]) => u === "/api/content/topics/w" && i?.method === "PATCH")).toBe(true));
  const patch = request.mock.calls.find(([, i]) => i?.method === "PATCH")![1]!;
  expect(JSON.parse(String(patch.body))).toEqual({ action: "approve", version: 4 });
});

it("an empty queue names the client it is empty for", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json(url.includes("bootstrap")
    ? { ok: true, orgs: [{ id: "other", name: "別家" }, { id: "org", name: "Soulful Expression Art Therapy" }] } : { items: [] })));
  render(<ScheduleWorkbench settingsHref={null} />);
  expect(await screen.findByText("Soulful Expression Art Therapy 目前沒有題目。要看別的客戶，從左上角「客戶：…」換。")).toBeTruthy();
});

it("發布 opens the content tool on that topic's site, month and topic (the confirmation is there)", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ items: [{ id: "v", title: "待看", status: "reviewed", site_id: "s1", scheduled_for: "2026-11-25T01:00:00Z", version: 2 }] })));
  render(<ScheduleWorkbench settingsHref="https://content.example/topics" />);
  const link = await screen.findByRole("link", { name: "發布" });
  expect(link.getAttribute("href")).toBe("https://content.example/topics?site=s1&month=2026-11&topic=v");
});

it("takes actual scenes into one episode, rejects a foreign movie and preserves old movies without scene data", async () => {
  const item = { organization_id: "org", source: "content_topic", title: "排程影片", formats: ["9x16"], brief_json: { videoScenes: [{ narration: "（旁白）第一場", image_prompt: "海邊" }, { narration: "第二場", image_prompt: "山上" }] } };
  const request = vi.fn(async () => Response.json({ item })); vi.stubGlobal("fetch", request);
  await adoptTopic(workbench as unknown as Workbench, "movie", "org");
  expect(create).toHaveBeenCalledWith({ title: "排程影片", ratio: "9:16", characters: [], sourceProjectId: "movie", shots: [{ text: "海邊", line: "第一場", seconds: 5 }, { text: "山上", line: "第二場", seconds: 5 }] });
  create.mockClear(); request.mockResolvedValueOnce(Response.json({ item: { ...item, organization_id: "foreign" } }));
  await expect(adoptTopic(workbench as unknown as Workbench, "movie", "org")).rejects.toThrow("這不是這個品牌");
  request.mockResolvedValueOnce(Response.json({ item: { ...item, brief_json: { title: "舊資料" } } }));
  await expect(adoptTopic(workbench as unknown as Workbench, "movie", "org")).rejects.toThrow("沒有保存逐場景"); expect(create).not.toHaveBeenCalled();
});
