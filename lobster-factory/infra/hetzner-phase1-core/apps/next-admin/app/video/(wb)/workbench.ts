"use client";
// A page under app/video/(wb) is one of the video workbench's own pages (video-unify-plan-20261116 §4 U1): the workbench
// shell (apps/video-workbench/index.html, same host) frames it, and it runs the workbench's child runtime, so
// VideoWorkbench.* reaches the shell over the vw:v1 channel exactly as pages/*.html do. Opened on its own it goes to
// the shell instead, which frames it again: /?open=<last path segment> (scripts/index-1.js PAGES).
import { useEffect, useState } from "react";
import type { WorkbenchCharacter, WorkbenchShot } from "../../(shell)/tools/video/video-handoff";

// pages/projects.html's order: config.js first (runtime.js reads VW_CONFIG when it loads), purify.js before security.js.
export const RUNTIME_SCRIPTS: readonly string[] = ["/config.js", "/shared/models.js", "/shared/adapters.js", "/shared/purify.js",
  "/shared/episode-spine.js", "/shared/runtime.js", "/shared/security.js", "/shared/theme.js"];

/** The part of shared/runtime.js's window.VideoWorkbench these pages use. */
export interface Workbench {
  ready: Promise<void>;
  /** params: the framed page's query string, without "?" (shared/runtime.js navigate). */
  navigate(target: string, params?: string): Promise<unknown>;
  request(path: string, body?: unknown, method?: string): Promise<unknown>;
  /** mainSystem = the main system this workbench is connected to; null = none. */
  loadCapabilities(): Promise<{ mainSystem?: { organizationId: string } | null }>;
  storage: { getItem(key: string): string | null };
  /** shared/runtime.js spine-create / spine-set-shots (card U3); both end on the projects page with that episode open. */
  spine: {
    create(payload: { title: string; ratio?: string; shots: WorkbenchShot[]; characters: WorkbenchCharacter[]; storyBibleSeries?: string }): Promise<{ projectId: string; episodeId: string }>;
    setShots(payload: { projectId: string; episodeId: string; shots: WorkbenchShot[] }): Promise<unknown>;
  };
}

type Host = { parent: unknown; location: Pick<Location, "pathname" | "search" | "replace">; document: Pick<Document, "createElement" | "body">; VideoWorkbench?: Workbench };

let loading: Promise<Workbench> | null = null;

/** Starts the runtime once per document; null = not inside the shell (already sent there). */
export function enterWorkbench(host: Host = window as unknown as Host): Promise<Workbench> | null {
  if (host.parent === host) {
    // The page's own query goes along: the shell passes it to the frame it opens (review-release names its video that way).
    const rest = host.location.search.replace(/^\?/, "");
    host.location.replace(`/?open=${encodeURIComponent(host.location.pathname.split("/").filter(Boolean).pop() ?? "")}${rest ? `&${rest}` : ""}`);
    return null;
  }
  // All tags at once, async = false: the downloads overlap and the files still run in list order (runtime.js loadScripts).
  return (loading ??= Promise.all(RUNTIME_SCRIPTS.map((src) => new Promise<void>((resolve, reject) => {
    const script = host.document.createElement("script");
    script.async = false;
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`無法載入影音工作台（${src}），請重新整理頁面。`));
    host.document.body.append(script);
  }))).then(async () => {
    const workbench = host.VideoWorkbench;
    if (!workbench) throw new Error("影音工作台沒有啟動，請重新整理頁面。");
    await workbench.ready;
    return workbench;
  }));
}

/** The workbench API once its state has loaded from the shell; null until then. A failed start throws to the error page. */
export function useWorkbench(): Workbench | null {
  const [workbench, setWorkbench] = useState<Workbench | null>(null);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    let live = true;
    enterWorkbench()?.then((w) => live && setWorkbench(w), (e: Error) => live && setError(e));
    return () => { live = false; };
  }, []);
  if (error) throw error;
  return workbench;
}

/** Rendered once by the (wb) layout, so every page there starts the runtime (or goes to the shell). */
export function WorkbenchRuntime(): null {
  useWorkbench();
  return null;
}
