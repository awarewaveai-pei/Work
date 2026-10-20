"use client";
// 設定發佈時間 (mock #dtp, renderDtp): a month on the left, 15-minute times on the right (the chosen one scrolled to the
// middle), the time zone under them; with a repeat, how often / which days / when to stop above. No native date input.
// date null = time only (C23's list slots use it that way).
import { useEffect, useRef, useState } from "react";
import type { RepeatRule } from "@/lib/social/repeat-rule";
import { addDays, weekday, WEEKDAY_NAMES } from "../model";
import { followStart } from "./draft";
import CIcon from "./icons";

const TIMES = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`);
const FREQS: Array<[RepeatRule["freq"], string]> = [["day", "每天"], ["week", "每週"], ["month", "每月"]];

export default function DateTimePicker({ date, time, tz, today, repeat, onDone, onClose }: {
  date: string | null; time: string; tz: string; today: string; repeat?: RepeatRule | null;
  onDone: (time: string, date: string | null, repeat: RepeatRule | null) => void; onClose: () => void;
}) {
  const [day, setDay] = useState(date);
  const [t, setT] = useState(time);
  const [month, setMonth] = useState((date ?? today).slice(0, 7));
  const [r, setR] = useState<RepeatRule | null>(repeat ? { ...repeat, days: [...(repeat.days ?? [])] } : null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { list.current?.querySelector<HTMLElement>(".sm-on")?.scrollIntoView({ block: "center" }); }, []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  const times = TIMES.includes(t) ? TIMES : [...TIMES, t].sort();
  const first = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const step = (n: number) => { const k = y * 12 + m - 1 + n; setMonth(`${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, "0")}`); };
  const setRule = (patch: Partial<RepeatRule>) => r && setR({ ...r, ...patch });
  return (
    <div className="sm-pop sm-dtp" role="dialog" aria-label="設定發佈時間">
      {r && (
        <div className="sm-rpt">
          <span className="sm-frow"><b>多久一次</b><span className="sm-seg">{FREQS.map(([k, n]) => <button type="button" key={k} className={r.freq === k ? "sm-on" : ""} aria-pressed={r.freq === k} onClick={() => setRule({ freq: k })}>{n}</button>)}</span></span>
          {r.freq === "week" && (
            <span className="sm-frow"><b>哪幾天</b><span className="sm-seg">{WEEKDAY_NAMES.map((n, i) => {
              const on = (r.days ?? []).includes(i + 1);
              return <button type="button" key={n} className={on ? "sm-on" : ""} aria-pressed={on} aria-label={`星期${n}`} onClick={() => setRule({ days: on ? (r.days ?? []).filter((d) => d !== i + 1) : [...(r.days ?? []), i + 1] })}>{n}</button>;
            })}</span></span>
          )}
          {r.freq === "month" && (
            <span className="sm-frow"><b>每月幾號</b><span className="sm-tstep">
              <button type="button" className="sm-ibtn" aria-label="少一天" onClick={() => setRule({ mday: Math.max(1, (r.mday ?? 1) - 1) })}><CIcon name="chevL" /></button><b>{r.mday}</b>
              <button type="button" className="sm-ibtn" aria-label="多一天" onClick={() => setRule({ mday: Math.min(31, (r.mday ?? 1) + 1) })}><CIcon name="chevR" /></button>
            </span>{(r.mday ?? 1) > 28 && <span className="sm-muted">沒有這一天的月份不發。</span>}</span>
          )}
          <span className="sm-frow"><b>什麼時候停</b><span className="sm-seg">
            <button type="button" className={r.end === "never" ? "sm-on" : ""} aria-pressed={r.end === "never"} onClick={() => setRule({ end: "never" })}>不停</button>
            <button type="button" className={r.end === "count" ? "sm-on" : ""} aria-pressed={r.end === "count"} onClick={() => setRule({ end: "count", count: r.count ?? 8 })}>發幾次就停</button>
          </span>{r.end === "count" && <span className="sm-tstep">
            <button type="button" className="sm-ibtn" aria-label="少一次" onClick={() => setRule({ count: Math.max(1, (r.count ?? 8) - 1) })}><CIcon name="chevL" /></button><b>{r.count} 次</b>
            <button type="button" className="sm-ibtn" aria-label="多一次" onClick={() => setRule({ count: Math.min(1000, (r.count ?? 8) + 1) })}><CIcon name="chevR" /></button>
          </span>}</span>
        </div>
      )}
      <div className="sm-dtrow">
        {day !== null && (
          <div>
            {r && <b className="sm-tcolh">從哪天開始</b>}
            <div className="sm-dhd">
              <button type="button" className="sm-ibtn" aria-label="上個月" disabled={month <= today.slice(0, 7)} onClick={() => step(-1)}><CIcon name="chevL" /></button>
              <b>{y} 年 {m} 月</b>
              <button type="button" className="sm-ibtn" aria-label="下個月" onClick={() => step(1)}><CIcon name="chevR" /></button>
            </div>
            <div className="sm-cal7">
              {WEEKDAY_NAMES.map((n) => <span key={n} className="sm-muted">{n}</span>)}
              {Array.from({ length: weekday(first) - 1 }, (_, i) => <span key={`b${i}`} />)}
              {Array.from({ length: dim }, (_, i) => {
                const v = addDays(first, i);
                return <button type="button" key={v} className={`${v === day ? "sm-on" : ""}${v === today ? " sm-today" : ""}`} aria-pressed={v === day} disabled={v < today} onClick={() => { setR(r && day ? followStart(r, day, v) : r); setDay(v); }}>{i + 1}</button>;
              })}
            </div>
          </div>
        )}
        <div className="sm-tcol">
          <b className="sm-tcolh"><CIcon name="clock" />幾點發</b>
          <div className="sm-tlist" ref={list}>{times.map((x) => <button type="button" key={x} className={x === t ? "sm-on" : ""} aria-pressed={x === t} onClick={() => setT(x)}>{x}</button>)}</div>
          <span className="sm-muted">{tz}</span>
        </div>
      </div>
      <div className="sm-dtft">
        <button type="button" onClick={onClose}>取消</button>
        <button type="button" className="btn-primary" onClick={() => onDone(t, day, r)}>好</button>
      </div>
    </div>
  );
}
