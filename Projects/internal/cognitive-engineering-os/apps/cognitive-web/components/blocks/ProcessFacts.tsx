"use client";

// The process indicators of a case or a group (card 70; ai_lego/platform/indicators.py, routes in
// ai_lego/apps/api/blocks/govern_group.py): one sentence each on whether a way of judging shows in the records. A presence
// fact, never a grade, so nothing here is counted up, marked good or bad, or put in an order. Folded, and read only while
// open: most visits do not need it, and the server reads several kinds to answer. An open list is read again when the
// page's own records change (`stamp`), so a save on the page shows here without a reload.
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";
import { blockHref, blockOf } from "../../lib/blocks";
import { humanError } from "../../lib/errors";

type Pointer = { kind: string; doc_id: string; owner: string };
export type Indicator = { id: string; sentence: string; present: boolean; evidence: Pointer[] };

/** Where a case's record is shown: its block's page (the kind's first word is the block), 開案資料 for the intake. A
 *  proposal and its answer have no page once answered (the proposals list shows only open ones), so they get no link. */
export function recordPage(projectId: string, kind: string): { href: string; name: string } | null {
  const head = kind.split(".")[0];
  if (kind === "assembler.intake") return { href: `/projects/${encodeURIComponent(projectId)}/start`, name: "開案資料" };
  if (head === "assembler") return null;
  const block = blockOf(head.toUpperCase());
  return block ? { href: blockHref(projectId, block), name: block.name } : null;
}

/** `projectId` for a case (each sentence links to the pages holding its records); without it, a group, whose records are all on its own page. */
export function ProcessFacts({ path, projectId, stamp }: { path: string; projectId?: string; stamp?: unknown }) {
  const [open, setOpen] = useState(false);
  const [facts, setFacts] = useState<Indicator[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    let active = true;
    setError("");
    apiFetch<{ indicators: Indicator[] }>(`${path}/indicators`).then((found) => { if (active) setFacts(found.indicators); }, (reason) => { if (active) setError(humanError(reason)); });
    return () => { active = false; };
  }, [open, path, stamp]);
  return (
    <div className="card">
      <details className="dir" onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary>過程紀錄：這次是怎麼想、怎麼決定的</summary>
        <p className="how">只看紀錄裡有沒有這一步，不評好壞，也不看你相信什麼。</p>
        {error && <p className="error" role="alert">讀不到：{error}</p>}
        {!facts && !error && <p className="sub">載入中…</p>}
        {facts && <ul>{facts.map((fact) => {
          const pages = projectId ? [...new Map(fact.evidence.map((item) => recordPage(projectId, item.kind)).filter((page) => page !== null).map((page) => [page.href, page])).values()] : [];
          return <li key={fact.id}>{fact.sentence}{pages.map((page) => <React.Fragment key={page.href}>　<Link href={page.href}>到「{page.name}」看 →</Link></React.Fragment>)}</li>;
        })}</ul>}
      </details>
    </div>
  );
}
