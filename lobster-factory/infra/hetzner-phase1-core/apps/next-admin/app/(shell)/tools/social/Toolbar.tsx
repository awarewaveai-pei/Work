"use client";
// The one row above the calendar (ADR 016 §5 decision 4; mock: #calPanel .toolbar): search, ‹ this week ›, week | month,
// the filter button + panel, best times (C22 fills it), 建立貼文. The list view keeps search, filter and 建立貼文.
import type { PostState } from "@/lib/social/state";
import { stateStyle } from "./Calendar";
import Icon from "./Icon";
import { platformOf, STATE_NAMES } from "./model";

export const FILTER_STATES: PostState[] = ["draft", "review", "scheduled", "queued", "published", "error", "rotation"];

export interface Filters { platforms: Set<string>; states: Set<PostState> }   // empty = all

export default function Toolbar(props: {
  mode: "week" | "month" | "list"; query: string; onQuery: (q: string) => void; rangeLabel: string; atToday: boolean;
  onStep: (n: number) => void; onToday: () => void; onMode: (m: "week" | "month") => void;
  platforms: string[]; filters: Filters; onFilters: (f: Filters) => void; filterOpen: boolean; onFilterOpen: (open: boolean) => void;
  best: boolean; onBest: () => void; canWrite: boolean; onCreate: () => void;
}) {
  const { mode, filters } = props;
  const n = filters.platforms.size + filters.states.size;
  const flip = <T,>(set: Set<T>, k: T) => { const s = new Set(set); if (s.has(k)) s.delete(k); else s.add(k); return s; };
  return (
    <>
      <div className="sm-toolbar">
        <label className="sm-search"><Icon name="search" /><input type="search" placeholder="搜尋貼文" aria-label="搜尋貼文" value={props.query} onChange={(e) => props.onQuery(e.target.value)} /></label>
        {mode === "list" && <span className="sm-range">{props.rangeLabel}</span>}
        {mode !== "list" && <>
          <span className="sm-seg">
            <button type="button" aria-label="往前" onClick={() => props.onStep(-1)}><Icon name="chevL" /></button>
            <button type="button" disabled={props.atToday} onClick={props.onToday}>{mode === "month" ? "本月" : "本週"}</button>
            <button type="button" aria-label="往後" onClick={() => props.onStep(1)}><Icon name="chevR" /></button>
          </span>
          <span className="sm-range">{props.rangeLabel}</span>
          <span className="sm-seg">
            {(["week", "month"] as const).map((m) => <button type="button" key={m} data-view={m} className={mode === m ? "sm-on" : ""} aria-pressed={mode === m} onClick={() => props.onMode(m)}>{m === "week" ? "週" : "月"}</button>)}
          </span>
        </>}
        <button type="button" aria-expanded={props.filterOpen} onClick={() => props.onFilterOpen(!props.filterOpen)}><Icon name="filter" />篩選{n > 0 && <b> · {n}</b>}</button>
        {mode !== "list" && <button type="button" aria-pressed={props.best} className={props.best ? "sm-on" : ""} title="各社群最佳發布時間" onClick={props.onBest}><Icon name="star" />最佳發布時間</button>}
        {props.canWrite && <span className="sm-end"><button type="button" className="btn-primary" data-view="compose" onClick={props.onCreate}><Icon name="plus" />建立貼文</button></span>}
      </div>
      {props.best && mode !== "list" && <div className="sm-bestbar sm-muted" role="status">功能準備中，日曆將標示各平台建議時段，點選即可發文。</div>}
      {props.filterOpen && (
        <div className="sm-pop sm-filters" role="dialog" aria-label="篩選">
          <div className="sm-cols">
            <div><h3>只看這些平台</h3>
              {props.platforms.map((pf) => (
                <label className="sm-ck" key={pf}><input type="checkbox" checked={filters.platforms.has(pf)} onChange={() => props.onFilters({ ...filters, platforms: flip(filters.platforms, pf) })} />{platformOf(pf).name}</label>
              ))}
              {!props.platforms.length && <span className="sm-muted">還沒有頻道</span>}
            </div>
            <div><h3>只看這些狀態</h3>
              {FILTER_STATES.map((s) => (
                <label className="sm-ck" key={s}><input type="checkbox" checked={filters.states.has(s)} onChange={() => props.onFilters({ ...filters, states: flip(filters.states, s) })} />
                  <span className="sm-dot" style={{ background: "var(--sm-state)", ...stateStyle(s) }} />{STATE_NAMES[s]}</label>
              ))}
            </div>
          </div>
          <div className="sm-ft"><span className="sm-muted">全部不勾選時，代表顯示全部。</span>
            <span className="sm-row"><button type="button" onClick={() => props.onFilters({ platforms: new Set(), states: new Set() })}>清除</button>
              <button type="button" className="btn-primary" onClick={() => props.onFilterOpen(false)}>完成</button></span>
          </div>
        </div>
      )}
    </>
  );
}
