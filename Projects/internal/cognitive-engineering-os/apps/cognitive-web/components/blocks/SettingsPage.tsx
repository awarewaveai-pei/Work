"use client";

// 設定 (GOVERN contract card): the notice that this is not therapy; where you are (optional: only used to give you help
// for that place); export everything you own; delete the account, confirmed twice. GOVERN moves and removes data and never
// reads it; the AI only explains what a setting means.
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { ApiError } from "../../lib/api";
import { docs, type Doc, type Notice } from "../../lib/blocks";
import { humanError } from "../../lib/errors";
import { accountSummary, eraseAccount, helpFor, type AccountSummary, type Help } from "../../lib/govern";
import { Notices } from "./BlockShell";
import { Explain, ExportLinks, HelpLines } from "./GovernParts";

type Where = { where: string };

export function SettingsPage() {
  const [help, setHelp] = useState<Help | null>(null);
  const [location, setLocation] = useState<Doc<Where> | null | undefined>(undefined);
  const [where, setWhere] = useState("");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // account deletion: nothing happens at the first button; the second needs the exact phrase
  const [asking, setAsking] = useState(false);
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [typed, setTyped] = useState("");
  const [eraseError, setEraseError] = useState("");
  const [erasing, setErasing] = useState(false);

  const load = async () => {
    const [found, places] = await Promise.all([helpFor(), docs.list<Where>(null, "govern.location")]);
    setHelp(found);
    setLocation(places.at(-1) ?? null);
    return places.at(-1) ?? null;
  };
  useEffect(() => { load().then((place) => setWhere(place?.content.where ?? "")).catch((reason) => setError(humanError(reason))); }, []);

  const saveWhere = async () => {
    setError(""); setBusy(true);
    try {
      const content = { where: where.trim() };
      const saved = location ? await docs.update(null, "govern.location", location, content) : await docs.create(null, "govern.location", content);
      setNotices(saved.notices);
      await load();
    } catch (reason) {
      setError(humanError(reason));
    } finally {
      setBusy(false);
    }
  };
  const clearWhere = async () => {
    if (!location) return;
    setError(""); setBusy(true);
    try { await docs.remove(null, "govern.location", location.doc_id); setWhere(""); setNotices([]); await load(); } catch (reason) { setError(humanError(reason)); } finally { setBusy(false); }
  };

  const askToErase = async () => {
    setAsking(true); setEraseError("");
    try { setSummary(await accountSummary()); } catch (reason) { setEraseError(humanError(reason)); }
  };
  const cancelErase = () => { setAsking(false); setTyped(""); setEraseError(""); };
  const erase = async () => {
    if (!summary || typed.trim() !== summary.phrase) return;
    setErasing(true); setEraseError("");
    try {
      await eraseAccount(typed.trim());
      window.location.assign("/login");
    } catch (reason) {
      setEraseError(reason instanceof ApiError && reason.status === 409
        ? "還有東西在跑（分析、整理或工作流）。等它跑完，再刪一次。已經刪掉的不會回來；還沒刪的還在。"
        : humanError(reason));
    } finally {
      setErasing(false);
    }
  };

  if (location === undefined) return <><div className="crumbs"><Link href="/">首頁</Link> › 設定</div><h1>設定</h1><div className="card"><p>{error || "載入中…"}</p></div></>;
  const typedRight = !!summary && typed.trim() === summary.phrase;

  return (
    <>
      <div className="crumbs"><Link href="/">首頁</Link> › 設定</div>
      <h1>設定</h1>
      {help && <div className="card accent" role="note"><p className="mt0">{help.notice}</p><p className="sub mb0"><Link href="/help">需要協助：看求助電話和你的權利</Link></p></div>}
      <Notices notices={notices} />

      <div className="card">
        <h2>你在哪裡</h2>
        <p className="how">選填。寫了，出現危急的時候，系統給你那個地方的求助電話；不寫，就給世界各地都能用的。沒有案子的時候，只有這一項會被讀到，也只用在這裡。</p>
        <label htmlFor="settings-where">你在哪個城市或國家</label>
        <input id="settings-where" className="search" value={where} maxLength={200} onChange={(event) => setWhere(event.target.value)} />
        <div className="btns mt8">
          <button className="btn primary" type="button" disabled={!where.trim() || where.trim() === location?.content.where || busy} onClick={saveWhere}>存起來</button>
          {location && <button className="btn ghost" type="button" disabled={busy} onClick={clearWhere}>刪掉，不留這一項</button>}
        </div>
        {help && (
          <>
            <p className="sub mt8">{help.where ? `現在給你的是「${help.where}」的求助電話。` : "現在給你的是世界各地都能用的求助電話。"}{help.where && !help.covered ? "這個地方系統還沒有專屬的電話。" : ""}</p>
            <HelpLines lines={help.resources} />
          </>
        )}
        <Explain topic="where" />
      </div>

      <div className="card">
        <h2>匯出你的資料</h2>
        <p className="how">你的帳號、每個案子（每一版的卡和紀錄，都寫著是你寫的、AI 寫的、共同或系統，和哪一塊寫的）、你個人的紀錄、自訂工作流。匯出只是把資料搬出來，不經過 AI。</p>
        <ExportLinks projectId={null} />
        <Explain topic="export" />
      </div>

      <div className="card">
        <h2>刪除你的帳號</h2>
        <p className="how">會先刪掉你所有的案子和個人紀錄，再刪掉帳號。刪掉就回不來；要留的，先匯出。</p>
        {!asking && <div className="btns"><button className="btn" type="button" onClick={askToErase}>我要刪除我的帳號</button></div>}
        {asking && (
          <div className="judge">
            {!summary && !eraseError && <p>載入中…</p>}
            {summary && (
              <>
                <b>會刪掉</b>
                <ul>
                  <li>{summary.cases.length} 個案子{summary.cases.length > 0 ? `：${summary.cases.map((item) => item.name).join("、")}` : ""}</li>
                  <li>{summary.personal_records} 筆你個人的紀錄、{summary.workflows} 個自訂工作流、{summary.runs} 次工作流執行</li>
                  <li>你的帳號：信箱、名字、登入</li>
                </ul>
                <b>會留下（裡面沒有你寫的任何內容）</b>
                <ul>{summary.keeps.map((item) => <li key={item}>{item}</li>)}</ul>
                <label htmlFor="erase-phrase">要刪的話，請照著打「{summary.phrase}」</label>
                <input id="erase-phrase" className="search" value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" />
                <div className="btns mt8">
                  <button className="btn primary" type="button" disabled={!typedRight || erasing} onClick={erase}>{erasing ? "刪除中…" : "永遠刪除"}</button>
                  <button className="btn ghost" type="button" disabled={erasing} onClick={cancelErase}>不刪了</button>
                </div>
              </>
            )}
            {!summary && eraseError && <div className="btns"><button className="btn ghost" type="button" onClick={cancelErase}>關掉</button></div>}
          </div>
        )}
        {eraseError && <p className="error" role="alert">{eraseError}</p>}
        <Explain topic="erase" />
      </div>
      {error && <p className="error">{error}</p>}
    </>
  );
}
