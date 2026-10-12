"use client";

// 我的群組 (card 22): the groups I am in, a new group (a name and what it is for), and, for a convener, invitations -- a
// one-time link shown once, to copy and send yourself (the platform sends nothing), and the open ones to take back.
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { humanError } from "../../lib/errors";
import { groups, PURPOSES, type Group, type Invite, type Purpose } from "../../lib/groups";
import { Cell, Chips } from "./JudgmentParts";
import { Missing, Refused, firstMissing, type Failed } from "./PageParts";

export const ONCE = "這個連結只出現這一次";
const purposeLabel = (purpose: Purpose) => PURPOSES.find((item) => item.value === purpose)?.label ?? purpose;

export function GroupsPage() {
  const [list, setList] = useState<Group[] | null>(null);
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState<Purpose | "">("");
  const [link, setLink] = useState<{ group: string; url: string } | null>(null);
  const [invites, setInvites] = useState<Record<string, Invite[]>>({});
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [failed, setFailed] = useState<Failed>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const mine = await groups.list();
    setList(mine);
    const open = await Promise.all(mine.filter((group) => group.my_role === "convener").map(async (group) => [group.group_id, await groups.invites(group.group_id)] as const));
    setInvites(Object.fromEntries(open));
  };
  useEffect(() => { load().catch((reason) => setError(humanError(reason))); }, []);
  // `at`: the button group that sent it; its refusal is shown there (PageParts.Refused)
  const run = (at: string, work: () => Promise<unknown>) => async () => {
    setFailed(null); setBusy(true);
    try { await work(); await load(); } catch (reason) { setFailed({ at, text: humanError(reason) }); } finally { setBusy(false); }
  };
  const create = run("create", async () => { await groups.create(name.trim(), purpose as Purpose); setName(""); setPurpose(""); });
  const invite = (group: Group) => run(`group-${group.group_id}`, async () => {
    const made = await groups.invite(group.group_id);
    setCopied(false);
    setLink({ group: group.group_id, url: `${window.location.origin}/invite#${made.token}` });
  });
  const copy = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link.url); setCopied(true); } catch { setFailed({ at: `group-${link.group}`, text: "沒辦法自動複製，請自己選取連結複製。" }); }
  };

  if (!list) return <><div className="crumbs">我的群組</div><div className="card"><p>{error || "載入中…"}</p></div></>;
  return (
    <>
      <div className="crumbs">我的群組</div>
      <h1>我的群組</h1>
      <p className="sub">跟別人一起決定、一起上課的地方。只有受邀的人進得來。</p>
      {error && <div className="card accent" role="alert"><p className="mt0">{error}</p></div>}

      <div className="card">
        {list.length === 0 && <p className="mt0">你還沒有加入任何群組。</p>}
        {list.map((group) => (
          <div key={group.group_id} className="mt8">
            <p className="mt0"><Link href={`/groups/${encodeURIComponent(group.group_id)}`}><b>{group.name}</b></Link>
              <span className="sub">（{purposeLabel(group.purpose)}{group.status === "closed" ? "，已經結束" : ""}{group.my_role === "convener" ? "，你是召集人" : ""}）</span></p>
            {group.my_role === "convener" && group.status === "open" && (
              <div className="btns"><button className="btn" type="button" disabled={busy} onClick={invite(group)}>做一個邀請連結</button></div>
            )}
            {link?.group === group.group_id && (
              <div className="card accent">
                <p className="mt0"><b>{ONCE}</b>。複製後自己傳給要邀請的人。七天內有效，只能用一次。</p>
                <div className="field"><input aria-label="邀請連結" readOnly value={link.url} /></div>
                <div className="btns"><button className="btn primary" type="button" onClick={copy}>{copied ? "複製好了" : "複製連結"}</button></div>
              </div>
            )}
            {(invites[group.group_id] ?? []).map((item) => (
              <p key={item.invite_id} className="sub mt0">一個還沒用的邀請（到 {item.expires_at.slice(0, 10)}）
                <button className="btn ghost" type="button" disabled={busy} onClick={run(`group-${group.group_id}`, () => groups.revoke(group.group_id, item.invite_id))}>收回</button></p>
            ))}
            <Refused failed={failed} at={`group-${group.group_id}`} />
          </div>
        ))}
      </div>

      <div className="card">
        <h2>開一個新的群組</h2>
        <Cell id="group-name" label="群組的名字"><input id="group-name" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} /></Cell>
        <div className="field"><b>這個群組要做什麼</b>
          <Chips options={PURPOSES.map((item) => item.label)} value={purpose ? purposeLabel(purpose) : ""} label="這個群組要做什麼"
            onPick={(label) => setPurpose(PURPOSES.find((item) => item.label === label)?.value ?? "")} />
        </div>
        <div className="btns"><button className="btn primary" type="button" disabled={busy || !name.trim() || !purpose} onClick={create}>開這個群組</button></div>
        <Missing why={(name.trim() || purpose) && firstMissing([!name.trim(), "寫群組的名字。"], [!purpose, "先選這個群組要做什麼。"])} />
        <Refused failed={failed} at="create" />
      </div>
    </>
  );
}
