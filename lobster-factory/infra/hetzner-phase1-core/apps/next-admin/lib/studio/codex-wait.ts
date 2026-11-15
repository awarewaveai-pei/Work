/** Typed door to public/editor-shared/codex-wait.js (same file the dock pages load): fetch that waits out a Codex job. */
import * as shared from "../../public/editor-shared/codex-wait.js";

export const CODEX_JOB_HEADER: string = shared.CODEX_JOB_HEADER;
export const CODEX_JOBS_URL: string = shared.CODEX_JOBS_URL;
export const fetchAwaitingCodex = shared.fetchAwaitingCodex as (
  url: string, init?: RequestInit, opts?: { fetch?: (url: string, init?: RequestInit) => Promise<Response>; pollMs?: number },
) => Promise<Response>;
