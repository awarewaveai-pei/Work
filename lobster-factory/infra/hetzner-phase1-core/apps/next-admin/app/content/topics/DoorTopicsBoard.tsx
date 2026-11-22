"use client";
// content.<base domain>/topics (and its steps/ sub-page): the same board as staff, its numbers read through
// /api/content/topics/overview for the client rail's current client only (ADR 020); no client = nothing is read.
import { useEffect, useState } from "react";
import type { OverviewData } from "@/lib/content/topics/overview-load";
import { useClientContext } from "@/lib/client-context/use-client-context";
import { TopicsBoard, type TopicsView } from "../../(shell)/tools/content/topics/TopicsBoard";

const NONE: OverviewData = { organizationId: null, month: "", rows: [], cells: {}, spendNote: null, actual: {} };

export function DoorTopicsBoard({ view }: { view: TopicsView }) {
  const { org } = useClientContext("site");
  const [got, setGot] = useState<{ org: string; overview: OverviewData | null; error: string } | null>(null);
  useEffect(() => {
    if (!org) return;
    let live = true;
    fetch(`/api/content/topics/overview?organizationId=${encodeURIComponent(org)}`).then(async (r) => {
      const j = await r.json().catch(() => null) as { ok?: boolean; overview?: OverviewData; error?: string } | null;
      if (live) setGot(j?.ok && j.overview ? { org, overview: j.overview, error: "" } : { org, overview: null, error: j?.error ?? `讀取失敗（${r.status}）` });
    }).catch(() => { if (live) setGot({ org, overview: null, error: "連線失敗" }); });
    return () => { live = false; };
  }, [org]);
  const mine = org && got?.org === org ? got : null;
  if (mine?.error) return <p style={{ color: "var(--red)" }}>{mine.error}</p>;
  // before a client is picked (or while its numbers load) the board asks for a site or waits; it never sees another client's
  return <TopicsBoard overview={mine?.overview ?? NONE} view={view} />;
}
