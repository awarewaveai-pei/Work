"use client";

// 該回來看的事 (ACT / LEARN cards: 提醒出現在「我的案子」首頁): what the engine says is due across the person's own cases and
// the two practices they set. The engine decides what is due (GET /me/reminders); this only lists it, in the person's own
// day. The text of a reminder never carries the case's content beyond its name. Email is not sent.
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";
import type { Reminder } from "../../lib/act";
import { humanError } from "../../lib/errors";

export function RemindersPanel() {
  const [due, setDue] = useState<Reminder[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { apiFetch<Reminder[]>(`/me/reminders?utc_offset=${-new Date().getTimezoneOffset()}`).then(setDue).catch((reason) => setError(humanError(reason))); }, []);
  return (
    <div className="card">
      <h2>該回來看的事{due ? <small>{due.length} 件</small> : null}</h2>
      {error && <p className="error">{error}</p>}
      {due && due.length === 0 && <p className="sub mb0">現在沒有該回來看的事。</p>}
      {due && due.map((item) => (
        <p key={`${item.scope}-${item.project_id ?? "me"}-${item.kind}-${item.since}`} className="mt0">
          <Link href={item.path}>{item.project_name ? `${item.project_name}：` : ""}{item.text}</Link><span className="sub">（從 {item.since} 起）</span>
        </p>
      ))}
      <p className="sub mb0">每天 10 分鐘的校準和每週的思考衝刺，在 <Link href="/me/learn">我的校準</Link>。</p>
    </div>
  );
}
