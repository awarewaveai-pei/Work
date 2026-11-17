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
