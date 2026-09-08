export type TimelineDraftResult =
  | { ok: true; timeline: { timelineId: string; organizationId: string; trackCount: number; outputProfiles: string[] }; pendingChecks: string[] }
  | { ok: false; status?: number; error: string; errors?: unknown };

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type PreflightResponse = {
  ok?: boolean;
  stage?: string;
  readyForRender?: boolean;
  error?: string;
  errors?: unknown;
  timeline?: { timelineId?: string; organizationId?: string; trackCount?: number; outputProfiles?: string[] };
  pendingChecks?: string[];
};

export async function validateTimelineDraft(raw: string, fetcher: FetchLike = fetch): Promise<TimelineDraftResult> {
  try { JSON.parse(raw); }
  catch { return { ok: false, error: "Timeline 必須是有效 JSON；未送出驗證。" }; }

  let response: Response;
  try {
    response = await fetcher("/api/video/timeline/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: `{"timeline":${raw}}`,
    });
  } catch { return { ok: false, error: "無法連線到 Timeline 驗證服務。" }; }

  const body = await response.json().catch(() => null) as PreflightResponse | null;
  if (!response.ok || !body?.ok || !body.timeline) return { ok: false, status: response.status, error: body?.error ?? "Timeline 驗證失敗", errors: body?.errors };
  if (body.stage !== "structural_only" || body.readyForRender !== false) return { ok: false, status: response.status, error: "Timeline 驗證回應不符合 structural-only 契約" };
  return { ok: true, timeline: { timelineId: body.timeline.timelineId ?? "", organizationId: body.timeline.organizationId ?? "", trackCount: body.timeline.trackCount ?? 0, outputProfiles: body.timeline.outputProfiles ?? [] }, pendingChecks: body.pendingChecks ?? [] };
}
