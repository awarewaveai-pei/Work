"use client";

// Pieces GOVERN's pages share: the notice that this is not therapy, the lines of help for a place, the export links, and
// the plain-words explanation of a setting (the system's own fixed sentence from the spec; no AI, nothing you wrote is read).
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { AUTHOR, docs, type Doc } from "../../lib/blocks";
import { humanError } from "../../lib/errors";
import { exportHref, governSpec, helpFor, type Help, type HelpLine, type Topic } from "../../lib/govern";
import { SystemMade } from "./PageParts";

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

/** 這一項設定的白話說明: one fixed explanation per setting, the system's own sentences from the spec (no AI, no credits). */
export function Explain({ topic }: { topic: Topic }) {
  const [setting, setSetting] = useState<{ name: string; explanation: string } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    governSpec().then((spec) => { if (active) setSetting(spec.settings[topic] ?? null); }).catch((reason) => { if (active) setError(humanError(reason)); });
    return () => { active = false; };
  }, [topic]);
  return (
    <div className="my6">
      {setting && (
        <div className="judge">
          <SystemMade />
          <p><b>{setting.name}</b>：{setting.explanation}</p>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

/** Explanations the AI wrote before 2026-10-12 (the AI turn is gone): the person's own records, kept and shown, and theirs to drop as before. */
export function OldExplanations() {
  const [found, setFound] = useState<Array<Doc<{ explanation: string }>>>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    docs.list<{ explanation: string }>(null, "govern.explanation").then((list) => { if (active) setFound(list); }).catch((reason) => { if (active) setError(humanError(reason)); });
    return () => { active = false; };
  }, []);
  const drop = async (doc: Doc<{ explanation: string }>) => {
    setError("");
    try {
      await docs.remove(null, "govern.explanation", doc.doc_id);
      setFound((held) => held.filter((item) => item.doc_id !== doc.doc_id));
    } catch (reason) {
      setError(humanError(reason));
    }
  };
  if (found.length === 0 && !error) return null;
  return (
    <div className="card">
      <h2>以前 AI 寫的設定說明（舊的紀錄，留著）</h2>
      {found.map((doc) => (
        <div key={doc.doc_id} className="judge">
          <span className="tags"><span>{AUTHOR[doc.author]}</span></span>
          <p>{doc.content.explanation}</p>
          <p className="sub mb0">這是 AI 照系統的說明改寫過的，不是你的紀錄。<button className="btn ghost" type="button" onClick={() => drop(doc)}>刪掉這段說明</button></p>
        </div>
      ))}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
