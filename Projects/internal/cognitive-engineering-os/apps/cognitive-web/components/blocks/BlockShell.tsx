"use client";

// The frame every block page sits in: where you are (我的專案 › 案子 › 這一塊), the case's 14 slots (one per block; a
// block not built yet shows the step it opens in), the blocks' unanswered proposals to add a block (they stay until
// you answer: 你同意才加), and the crisis help a save can bring back (help for where you are).
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";
import { BLOCKS, blockOf, docs, isOpen, type BlockCode, type Notice } from "../../lib/blocks";
import { humanError } from "../../lib/errors";
import type { Project } from "../../lib/projects";

export function useProject(projectId: string) {
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    apiFetch<Project>(`/projects/${encodeURIComponent(projectId)}`).then((found) => { if (active) setProject(found); }).catch((reason) => { if (active) setError(humanError(reason)); });
    return () => { active = false; };
  }, [projectId]);
  return { project, error };
}

/** The 14 slots, one per block; with no ``projectId`` (the case list) they are names only, not links. */
export function Slots({ projectId, current }: { projectId?: string; current?: BlockCode }) {
  return (
    <nav className="journey" aria-label={`${projectId ? "這個案子的" : "每個案子的"} ${BLOCKS.length} 格`}>
      {BLOCKS.map((block) => {
        const label = `${block.n} ${block.name}`;
        if (block.code === current) return <span key={block.code} className="now" aria-current="page">{label}</span>;
        if (!isOpen(block)) return <i key={block.code} title={`第 ${block.step} 步才開放`}>{label}</i>;
        if (!projectId) return <span key={block.code}>{label}</span>;
        return <Link key={block.code} href={`/projects/${encodeURIComponent(projectId)}/${block.path}`}>{label}</Link>;
      })}
    </nav>
  );
}

type Proposal = Extract<Notice, { type: "proposal" }>;

/** The crisis help a save brought back (transient: it belongs to what was just written). */
export function Notices({ notices }: { notices: Notice[] }) {
  return (
    <>
      {notices.filter((notice): notice is Extract<Notice, { type: "crisis" }> => notice.type === "crisis").slice(0, 1).map((notice) => (
        <div key="crisis" className="card accent" role="alert">
          <h2>先照顧你自己</h2>
          <p>{notice.notice}</p>
          <ul>{notice.resources.map((item) => <li key={item.name}><b>{item.name}</b>：{item.contact}</li>)}</ul>
        </div>
      ))}
    </>
  );
}

/** Every unanswered proposal of the case (GET /projects/{id}/proposals), reloaded when ``refresh`` changes. */
function Proposals({ projectId, refresh }: { projectId: string; refresh: number }) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [error, setError] = useState("");
  const load = () => apiFetch<Proposal[]>(`/projects/${encodeURIComponent(projectId)}/proposals`).then(setProposals);
  useEffect(() => { load().catch((reason) => setError(humanError(reason))); }, [projectId, refresh]);   // eslint-disable-line react-hooks/exhaustive-deps
  // The answer is the person's own record pointing at the proposal; the proposal's words stay the system's.
  const answer = async (proposal: Proposal, value: "accepted" | "declined") => {
    setError("");
    try {
      await docs.create(projectId, "assembler.answer", { proposal: proposal.doc_id, answer: value });
      await load();
    } catch (reason) {
      setError(humanError(reason));
    }
  };
  return (
    <>
      {proposals.map((proposal) => (
        <div key={proposal.doc_id} className="card">
          <p className="mt0"><b>{blockOf(proposal.by)?.name ?? proposal.by}</b> 提議加「{blockOf(proposal.propose)?.name ?? proposal.propose}」：{proposal.why}</p>
          {proposal.open
            ? <div className="btns"><button className="btn primary" onClick={() => answer(proposal, "accepted")}>加</button><button className="btn" onClick={() => answer(proposal, "declined")}>不用</button></div>
            : <div className="btns"><span className="sub">這一塊還沒開放（第 {blockOf(proposal.propose)?.step} 步才蓋），提議先記著。</span><button className="btn ghost" onClick={() => answer(proposal, "declined")}>不用了</button></div>}
        </div>
      ))}
      {error && <p className="error">{error}</p>}
    </>
  );
}

/** A block's page (``code``) or one of the always-on parts' pages (``title``, e.g. 開案). */
export function BlockShell({ projectId, code, title, refresh = 0, children }: { projectId: string; code?: BlockCode; title?: string; refresh?: number; children: React.ReactNode }) {
  const { project, error } = useProject(projectId);
  const block = code ? blockOf(code) : undefined;
  const name = block?.name ?? title ?? "";
  if (error) return <><div className="crumbs"><Link href="/projects">我的專案</Link></div><div className="card"><p className="error">{error}</p></div></>;
  return (
    <>
      <div className="crumbs"><Link href="/projects">我的專案</Link> › <Link href={`/projects/${encodeURIComponent(projectId)}`}>{project?.name ?? "…"}</Link> › {name}</div>
      <h1>{block ? `${block.n} ${block.name}` : name}</h1>
      {block && <p className="sub">{block.does}。你隨時可以停，也可以跳過這一塊。</p>}
      <Slots projectId={projectId} current={code} />
      <Proposals projectId={projectId} refresh={refresh} />
      {children}
    </>
  );
}
