"use client";

// The frame every block page sits in: where you are (我的案子 › 案子 › 這一塊), the case's 14 slots (one per block; a
// block not built yet shows the step it opens in; 做過 marked), 現在在哪一塊、為什麼在這一塊、下一塊做什麼 (the case's route), the blocks' unanswered proposals to add a block (they stay until
// you answer: 你同意才加), and the crisis help a save can bring back (help for where you are).
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";
import { BLOCKS, blockHref, blockOf, docs, isOpen, route, type BlockCode, type Notice, type Route, type RouteStop } from "../../lib/blocks";
import { humanError } from "../../lib/errors";
import { AiWaiting } from "./AiWaiting";
import { CaseContract } from "./CollabPermissions";
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

/** The case's route, reloaded when ``refresh`` changes (a save can make a slot 做過). */
export function useRoute(projectId: string, refresh = 0) {
  const [found, setFound] = useState<Route | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    route(projectId).then((loaded) => { if (active) { setFound(loaded); setError(""); } }).catch((reason) => { if (active) setError(humanError(reason)); });
    return () => { active = false; };
  }, [projectId, refresh]);
  return { route: found, error };
}

/** The 14 slots, one per block; with no ``projectId`` (the case list) they are names only, not links (never prefetched:
 *  14 prefetches on every block page counted against the site's 50-per-10-seconds limit, A1). With the case's
 *  ``route``: a slot with something written is marked 做過 (✓, not by colour alone) and the next block of the route is lit. */
export function Slots({ projectId, current, route: path }: { projectId?: string; current?: BlockCode; route?: Route | null }) {
  const done = new Set(Array.isArray(path?.done) ? path.done : []);
  const next = path && current ? nextStop(path, current)?.code : undefined;
  return (
    <nav className="journey" aria-label={`${projectId ? "這個案子的" : "每個案子的"} ${BLOCKS.length} 格`}>
      {BLOCKS.map((block) => {
        const label = `${done.has(block.code) ? "✓ " : ""}${block.n} ${block.name}`;
        const state = [done.has(block.code) && "done", block.code === next && "next"].filter(Boolean).join(" ") || undefined;
        const title = done.has(block.code) ? "做過" : undefined;
        if (block.code === current) return <span key={block.code} className="now" aria-current="page" title={title}>{label}</span>;
        if (!isOpen(block)) return <i key={block.code} title={`第 ${block.step} 步才開放`}>{label}</i>;
        if (!projectId) return <span key={block.code}>{label}</span>;
        return <Link key={block.code} prefetch={false} className={state} title={title} href={blockHref(projectId, block)}>{label}</Link>;
      })}
    </nav>
  );
}

/** The case page's slots: the 14 with 做過 marked from the case's route. */
export function CaseSlots({ projectId }: { projectId: string }) {
  const { route: path, error } = useRoute(projectId);
  return <><Slots projectId={projectId} route={path} />{error && <p className="sub">讀不到做過哪幾格：{error}</p>}</>;
}

// The first open block after ``current`` in the route; when ``current`` is not in it, the first open one not done yet.
function nextStop(path: Route, current: BlockCode): RouteStop | undefined {
  const stops = Array.isArray(path.blocks) ? path.blocks : [];
  const at = stops.findIndex((stop) => stop.code === current);
  return at >= 0 ? stops.slice(at + 1).find((stop) => stop.open) : stops.find((stop) => stop.open && !stop.done && stop.code !== current);
}

/** The bottom of every block page: the case's next block (the only place a page links 「下一塊」: one route, one answer). */
function GoOn({ projectId, code, path }: { projectId: string; code: BlockCode; path: Route }) {
  const next = nextStop(path, code);
  const block = next && blockOf(next.code);
  return (
    <div className="tabnext">
      {block
        ? <Link className="btn primary" href={blockHref(projectId, block)}>下一塊：{block.name} →</Link>
        : <Link className="btn" href={`/projects/${encodeURIComponent(projectId)}`}>回到案子</Link>}
      <span className="sub">不想寫了也可以直接往下走；這一塊隨時可以回來。</span>
    </div>
  );
}

/** 畫面上顯示：現在在哪一塊、為什麼在這一塊、下一塊做什麼 (組裝器). */
function Where({ projectId, code, path, error }: { projectId: string; code: BlockCode; path: Route | null; error: string }) {
  if (error) return <p className="sub">讀不到這個案子的組合：{error}</p>;
  if (!path) return null;
  const stops = Array.isArray(path.blocks) ? path.blocks : [];
  const intake = <Link href={`/projects/${encodeURIComponent(projectId)}/start`}>開案資料</Link>;
  if (!stops.length) return <div className="card"><p className="mt0 mb0">{path.purpose
    ? <>你在{intake}把這個案子的積木都跳過了。想加回來，回{intake}重排。</>
    : <>這個案子還沒有選組合。先填{intake}，系統會照你的目的排好積木。</>}</p></div>;
  const at = stops.findIndex((stop) => stop.code === code);
  const why = at < 0 ? null : stops[at].why;
  const next = nextStop(path, code);
  // the route's blocks not built yet that come before the next one (or, with no next one, all the rest)
  const skipped = stops.slice(at + 1, next ? stops.indexOf(next) : undefined).filter((stop) => !stop.open);
  const closed = skipped.map((stop) => `「${blockOf(stop.code)?.name}」第 ${blockOf(stop.code)?.step} 步才開放`).join("、");
  const none = closed ? `後面的${closed}，現在沒有可以接著走的積木。` : at >= 0 ? "這是這個案子的最後一塊。" : "這個案子排的積木都做過了。";
  return (
    <div className="card">
      <p className="mt0"><b>現在：</b>{at >= 0 ? `這個案子的第 ${at + 1} 塊，共 ${stops.length} 塊。` : "這一塊不在這個案子的組合裡，是你自己打開的。"}</p>
      {why && <p><b>為什麼在這一塊：</b>{why.from === "package"
        ? <>你在{intake}選的「{why.package}」套件排了這一塊。</>
        : <>「{blockOf(why.by)?.name ?? why.by}」提議加，你同意了：{why.text}</>}</p>}
      <p className="mb0"><b>下一塊：</b>{next
        ? <><Link href={blockHref(projectId, blockOf(next.code)!)}>{blockOf(next.code)?.n} {blockOf(next.code)?.name}</Link>：{blockOf(next.code)?.does}。{closed && <span className="sub">（{closed}，先跳過。）</span>}</>
        : none}</p>
    </div>
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
function Proposals({ projectId, refresh, onAnswered }: { projectId: string; refresh: number; onAnswered: () => void }) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [error, setError] = useState("");
  const load = () => apiFetch<Proposal[]>(`/projects/${encodeURIComponent(projectId)}/proposals`).then(setProposals);
  useEffect(() => { load().catch((reason) => setError(humanError(reason))); }, [projectId, refresh]);   // eslint-disable-line react-hooks/exhaustive-deps
  // The answer is the person's own record pointing at the proposal; the proposal's words stay the system's.
  const answer = async (proposal: Proposal, value: "accepted" | "declined") => {
    setError("");
    try {
      await docs.create(projectId, "assembler.answer", { proposal: proposal.doc_id, answer: value });
      onAnswered();
      await load();
    } catch (reason) {
      setError(humanError(reason));
    }
  };
  return (
    <>
      {proposals.map((proposal) => (
        <div key={proposal.doc_id} className="card">
          <p className="mt0">{proposal.guardrail && <span className="tag">護欄</span>} <b>{blockOf(proposal.by)?.name ?? proposal.by}</b> 提議加「{blockOf(proposal.propose)?.name ?? proposal.propose}」：{proposal.why}</p>
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
  const [answered, setAnswered] = useState(0);   // both only grow, so their sum changes whenever either does
  const { route: path, error: routeError } = useRoute(projectId, refresh + answered);
  const block = code ? blockOf(code) : undefined;
  const name = block?.name ?? title ?? "";
  if (error) return <><div className="crumbs"><Link href="/projects">我的案子</Link></div><div className="card"><p className="error">{error}</p></div></>;
  return (
    <>
      <div className="crumbs"><Link href="/projects">我的案子</Link> › <Link href={`/projects/${encodeURIComponent(projectId)}`}>{project?.name ?? "…"}</Link> › {name}</div>
      <h1>{block ? `${block.n} ${block.name}` : name}</h1>
      {block && <p className="sub">{block.does}。你隨時可以停，也可以跳過這一塊。</p>}
      <Slots projectId={projectId} current={code} route={path} />
      {code && <Where projectId={projectId} code={code} path={path} error={routeError} />}
      {code && <CaseContract projectId={projectId} block={code} />}
      <Proposals projectId={projectId} refresh={refresh} onAnswered={() => setAnswered((count) => count + 1)} />
      {children}
      <AiWaiting projectId={projectId} block={code} />
      {code && path && <GoOn projectId={projectId} code={code} path={path} />}
    </>
  );
}
