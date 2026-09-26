// The three Cognitive OS calls a research collection run makes (RESEARCH_LINES_MASTER_PLAN §12.7 I-d/I-e/I-f):
// exchange the run's grant reference for its token, ingest Sources, complete the run. Lives outside lib/collect
// because lib/collect may not touch the network except through its fetcher (collect-block-hygiene.test.ts);
// sink/cognitive and the execute route both call this module, so the wire format exists once.
//
// The COS address comes from this server's env only, never from a request (plan K5): a caller able to name the
// address could send the grant token anywhere. Default = the internal docker hostname (same as client.ts, which
// retires at P4).

export type ResearchResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

export interface GrantExchange {
  grant_token: string;
  project_id: string;
  run_id: string;
  expires_at: string;
}

/** One Source as COS ingests it (plan §3.4 C1) -- exactly these fifteen keys. */
export interface SourceProjection {
  canonical_url: string;
  source_uri: string;
  content_sha256: string;
  mime: string;
  content_type: string;
  title: string;
  author: string | null;
  published_at: string | null;
  fetched_at: string;
  text: string;
  provenance: { epistemic_type: "EVIDENCE"; authorship_state: "SOURCE_QUOTATION"; locked: null };
  collector: string;
  source_class: string | null;
  relevance: Record<string, unknown>;
  schema_version: "1";
}

export interface IngestOutcome {
  canonical_url: string;
  outcome: "created" | "unchanged" | "superseded";
  source_id: string;
}

export interface RunReportSummary {
  fetched: number;
  written: number;
  unchanged: number;
  refused: number;
  stopped_by: string;
}

const DEFAULT_BASE_URL = "http://cognitive-os-api:8420";
const TIMEOUT_MS = 30_000;

function baseUrl(): string {
  return (process.env.COGNITIVE_OS_API_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

async function postJson<T>(path: string, authorization: string, body: unknown): Promise<ResearchResult<T>> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authorization },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    return { ok: false, status: 0, error: `cognitive_os_unreachable:${String(e).slice(0, 120)}` };
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // a body-less error response still carries its status below
  }
  if (!res.ok) {
    const detail = typeof json === "object" && json !== null && "detail" in json ? (json as { detail: unknown }).detail : null;
    return { ok: false, status: res.status, error: typeof detail === "string" ? detail : `cognitive_os_http_${res.status}` };
  }
  return { ok: true, value: json as T };
}

/** I-d. One-shot on the COS side: a second call for the same reference is refused (409). */
export function exchangeGrant(grantRef: string): Promise<ResearchResult<GrantExchange>> {
  const token = process.env.COLLECT_RESEARCH_RUNS_TOKEN?.trim();
  if (!token) return Promise.resolve({ ok: false, status: 0, error: "COLLECT_RESEARCH_RUNS_TOKEN not configured" });
  return postJson<GrantExchange>(`/collect-grants/${encodeURIComponent(grantRef)}/exchange`, `Bearer ${token}`, undefined);
}

/** I-e. 1-25 Sources per call; COS re-hashes every text and refuses the whole batch on one mismatch. */
export function ingestSources(projectId: string, runId: string, grantToken: string, sources: SourceProjection[]): Promise<ResearchResult<{ results: IngestOutcome[] }>> {
  return postJson(`/projects/${encodeURIComponent(projectId)}/sources/ingest`, `Grant ${grantToken}`, { run_id: runId, sources });
}

/** I-f. After this the grant is void on the COS side. */
export function completeRun(
  projectId: string,
  runId: string,
  grantToken: string,
  status: "completed" | "failed",
  report: RunReportSummary,
  error?: string,
): Promise<ResearchResult<{ run_id: string; status: string }>> {
  const body: Record<string, unknown> = { status, report };
  if (error) body.error = error.slice(0, 200);
  return postJson(`/projects/${encodeURIComponent(projectId)}/collections/${encodeURIComponent(runId)}/complete`, `Grant ${grantToken}`, body);
}
