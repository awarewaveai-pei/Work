"use client";
// Staff-only (/tools/content): ContentStudio plus its AI-video calls to the video product. A content door page renders
// ContentStudio without this file, so its import closure names no /api/video route (step-8 card §2 S1). The subscription
// chain buttons are staff-only the same way (they call /api/tools/sub-worker and /api/tools/codex-laptop).
import ContentStudio, { type ContentVideoApi } from "./ContentStudio";
import TextChainButtons from "@/components/tools/TextChainButtons";
import type { ChainControl } from "@/lib/ai/text-model-options";

const postJson = async <T,>(url: string, body: unknown): Promise<T> => {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return res.json() as Promise<T>;
};

const video: ContentVideoApi = {
  generate: (body) => postJson("/api/video/generate", body),
  status: async (jobId) => (await fetch(`/api/video/status?jobId=${encodeURIComponent(jobId)}`, { method: "POST" })).json(),
  embed: (body) => postJson("/api/video/embed-to-wp", body),
};

const chainControl: ChainControl = (value, onChange, disabled) =>
  <TextChainButtons chain={value.chain} claudeModel={value.claudeModel} codexModel={value.codexModel} onChange={onChange} lane="owner" disabled={disabled} />;

export default function ContentStudioStaff() {
  return <ContentStudio video={video} chainControl={chainControl} />;
}
