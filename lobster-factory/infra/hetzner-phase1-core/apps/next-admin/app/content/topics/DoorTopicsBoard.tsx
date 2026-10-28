"use client";
// content.<base domain>/topics: the same board as staff, its numbers read through /api/content/topics/overview.
import { useEffect, useState } from "react";
import type { OverviewData } from "@/lib/content/topics/overview-load";
import { TopicsBoard } from "../../(shell)/tools/content/topics/TopicsBoard";

export function DoorTopicsBoard() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/content/topics/overview").then(async (r) => {
      const j = await r.json().catch(() => null) as { ok?: boolean; overview?: OverviewData; error?: string } | null;
      if (j?.ok && j.overview) setOverview(j.overview); else setError(j?.error ?? `讀取失敗（${r.status}）`);
    }).catch(() => setError("連線失敗"));
  }, []);
  if (error) return <p style={{ color: "var(--red)" }}>{error}</p>;
  if (!overview) return <p style={{ color: "var(--text-muted)" }}>…</p>;
  return <TopicsBoard overview={overview} />;
}
