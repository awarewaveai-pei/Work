"use client";

// 求助 (GOVERN contract card): this is not a therapy service; where to find help for the place you are in; the rights you
// keep while using the platform. Open to anyone -- a person in a crisis must not meet a login wall.
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { humanError } from "../../lib/errors";
import { helpFor, type Help } from "../../lib/govern";
import { HelpLines } from "./GovernParts";

export function HelpPage() {
  const [help, setHelp] = useState<Help | null>(null);
  const [where, setWhere] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    helpFor().then((found) => { if (active) { setHelp(found); setWhere(found.where ?? ""); } }).catch((reason) => { if (active) setError(humanError(reason)); });
    return () => { active = false; };
  }, []);
  const look = async () => {
    setBusy(true); setError("");
    try { setHelp(await helpFor(where.trim())); } catch (reason) { setError(humanError(reason)); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="crumbs"><Link href="/">首頁</Link> › 求助與你的權利</div>
      <h1>求助與你的權利</h1>
      {help && <div className="card accent" role="note"><p className="mt0">{help.notice}</p></div>}

      <div className="card">
        <h2>現在需要幫忙</h2>
        {!help && <p>{error || "載入中…"}</p>}
        {help && (
          <>
            <p className="sub">
              {help.where ? `你寫的地方：${help.where}。` : "你還沒寫你在哪裡。"}
              {help.covered ? "這個地方有專屬的電話，列在最前面。" : "這個地方系統還沒有專屬的電話，先給世界各地都能用的；之後會加更多地方。"}
            </p>
            <HelpLines lines={help.resources} />
          </>
        )}
      </div>

      <div className="card">
        <h2>換一個地方看</h2>
        <label htmlFor="help-where">你在哪個城市或國家</label>
        <input id="help-where" className="search" value={where} maxLength={200} onChange={(event) => setWhere(event.target.value)} />
        <div className="btns mt8">
          <button className="btn primary" type="button" disabled={!where.trim() || busy} onClick={look}>{busy ? "找中…" : "看這個地方的求助電話"}</button>
          <Link className="btn ghost" href="/settings">寫進設定，之後系統直接給你這個地方的</Link>
        </div>
        {error && help && <p className="error">{error}</p>}
      </div>

      <div className="card">
        <h2>你的權利</h2>
        <ul className="check">
          <li>你隨時可以停下來，也可以跳過任何一塊。</li>
          <li>你寫的東西，預設只有你自己看得到。</li>
          <li>你可以匯出自己的資料，也可以完整刪除。<Link href="/settings">到設定</Link></li>
          <li>你寫到危機的話，AI 會停下來，把這一頁的電話交給你。它不會自己處理。</li>
        </ul>
      </div>
    </>
  );
}
