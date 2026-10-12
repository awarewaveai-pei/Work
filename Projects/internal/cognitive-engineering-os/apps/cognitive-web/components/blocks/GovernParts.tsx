"use client";

// Pieces GOVERN's pages share: the notice that this is not therapy, the lines of help for a place, the export links, and
// the button that has the AI explain a setting in plain words (from the system's own description; it reads nothing you wrote).
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { AUTHOR, ai, docs, type Doc } from "../../lib/blocks";
import { humanError } from "../../lib/errors";
import { exportHref, helpFor, type Help, type HelpLine, type Topic } from "../../lib/govern";

/** 非治療聲明: the system's own sentence (GET /govern/help carries it, so there is one copy), for the places a person starts. */
export function NotTherapyNotice({ link = true }: { link?: boolean }) {
  const [help, setHelp] = useState<Help | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    helpFor().then((found) => { if (active) setHelp(found); }).catch((reason) => { if (active) setError(humanError(reason)); });
    return () => { active = false; };
  }, []);
  if (error) return <div className="card accent" role="note"><p className="mt0">讀不到平台的說明：{error}</p>{link && <p className="sub mb0"><Link href="/help">需要協助：看求助電話和你的權利</Link></p>}</div>;
  if (!help) return null;
  return (
    <div className="card accent" role="note">
      <p className="mt0">{help.notice}</p>
      {link && <p className="sub mb0"><Link href="/help">需要協助：看求助電話和你的權利</Link></p>}
    </div>
  );
}

/** The lines of help for a place; a web address is a link, a phone number is text. */
export function HelpLines({ lines }: { lines: HelpLine[] }) {
  return (
    <ul>
      {lines.map((line) => (
        <li key={line.name}>
          <b>{line.name}</b>：{/^https?:\/\//.test(line.contact) ? <a href={line.contact} target="_blank" rel="noreferrer noopener">{line.contact}</a> : line.contact}
        </li>
      ))}
    </ul>
  );
}

/** One case, or the whole account, as a file: plain links, so the browser downloads with your own session. */
export function ExportLinks({ projectId }: { projectId: string | null }) {
  return (
    <div className="btns">
      <a className="btn primary" href={exportHref(projectId, "md")} download>下載給人讀的（Markdown）</a>
      <a className="btn" href={exportHref(projectId, "json")} download>下載給程式讀的（JSON）</a>
    </div>
  );
}

type Explanation = { explanation: string };

/** 請 AI 解釋這一項設定. Asking again writes the next version of the same explanation; you can drop it. */
export function Explain({ topic }: { topic: Topic }) {
  const [saved, setSaved] = useState<Doc<Explanation> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ask = async () => {
    setBusy(true); setError("");
    try {
      const turn = await ai<Explanation>(null, "GOVERN", "explain", { topic }, saved);
      if (turn.saved) setSaved(turn.saved);
    } catch (reason) {
      setError(humanError(reason));
    } finally {
      setBusy(false);
    }
  };
  const drop = async () => {
    if (!saved) return;
    setError("");
    try {
      await docs.remove(null, "govern.explanation", saved.doc_id);
      setSaved(null);
    } catch (reason) {
      setError(humanError(reason));
    }
  };
  return (
    <div className="my6">
      <button className="btn ghost" type="button" disabled={busy} onClick={ask}>{busy ? "AI 在寫…" : saved ? "再說一次" : "請 AI 用白話說明這一項"}</button>
      {saved && (
        <div className="judge">
          <span className="tags"><span>{AUTHOR[saved.author]}</span></span>
          <p>{saved.content.explanation}</p>
          <p className="sub mb0">這是 AI 照系統自己的說明改寫的，不是你的紀錄。<button className="btn ghost" type="button" onClick={drop}>刪掉這段說明</button></p>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
