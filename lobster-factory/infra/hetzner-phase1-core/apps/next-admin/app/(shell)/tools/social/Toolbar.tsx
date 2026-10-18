"use client";
// The one row above the calendar (ADR 016 §5 decision 4; mock: #calPanel .toolbar): search, ‹ this week ›, week | month,
// the filter button + panel (platform / state / tag), best times (a platform .seg under the row), 批次動作 (list tab only),
// 建立貼文. The list view keeps search, filter, 批次動作 and 建立貼文.
import { useState } from "react";
import type { PostState } from "@/lib/social/state";
import { PfMark, stateStyle } from "./Calendar";
import Icon from "./Icon";
import { platformOf, STATE_NAMES, TAG_TOKEN, type Tag } from "./model";

export const FILTER_STATES: PostState[] = ["draft", "review", "scheduled", "queued", "published", "error", "rotation"];

export interface Filters { platforms: Set<string>; states: Set<PostState>; tags: Set<string> }   // empty = all
export const noFilters = (): Filters => ({ platforms: new Set(), states: new Set(), tags: new Set() });

export default function Toolbar(props: {
  mode: "week" | "month" | "list"; query: string; onQuery: (q: string) => void; rangeLabel: string; atToday: boolean;
  onStep: (n: number) => void; onToday: () => void; onMode: (m: "week" | "month") => void;
  platforms: string[]; tags: Tag[]; filters: Filters; onFilters: (f: Filters) => void; filterOpen: boolean; onFilterOpen: (open: boolean) => void;
  /** best times: the platforms that have them, the one chosen (null = off) */
  bestPlatforms: string[]; best: string | null; onBest: (platform: string | null) => void;
  canWrite: boolean; onCreate: () => void;
  /** 批次動作 on the list tab: how many are ticked, and what the menu does */
  checkedN: number; onBulk: (action: "submit" | "delete") => void;
}) {
  const { mode, filters } = props;
  const [bulkOpen, setBulkOpen] = useState(false);
  const n = filters.platforms.size + filters.states.size + filters.tags.size;
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
        <button type="button" aria-expanded={props.filterOpen} onClick={() => { setBulkOpen(false); props.onFilterOpen(!props.filterOpen); }}><Icon name="filter" />篩選{n > 0 && <b> · {n}</b>}</button>
        {mode === "week" && <button type="button" aria-pressed={!!props.best} className={props.best ? "sm-on" : ""} title="各社群最佳發布時間" onClick={() => props.onBest(props.best ? null : props.bestPlatforms[0] ?? null)}><Icon name="star" />最佳發布時間</button>}
        {mode === "list" && props.canWrite && (
          <button type="button" aria-expanded={bulkOpen} disabled={!props.checkedN} title={props.checkedN ? "" : "先勾選左邊的貼文"} onClick={() => { props.onFilterOpen(false); setBulkOpen((o) => !o); }}>批次動作{props.checkedN > 0 && <b> · {props.checkedN}</b>}</button>
        )}
        {props.canWrite && <span className="sm-end"><button type="button" className="btn-primary" data-view="compose" onClick={props.onCreate}><Icon name="plus" />建立貼文</button></span>}
      </div>
      {mode === "week" && props.best && props.bestPlatforms.length > 0 && (
        <div className="sm-bestbar" role="status">
          <span className="sm-muted">看哪個平台的最佳時間：</span>
          <span className="sm-seg">
            {props.bestPlatforms.map((pf) => <button type="button" key={pf} className={pf === props.best ? "sm-on" : ""} aria-pressed={pf === props.best} onClick={() => props.onBest(pf)}><PfMark platform={pf} />{platformOf(pf).name}</button>)}
          </span>
          <span className="sm-muted">參考值，不是你帳號的數據；點時間就在那個時間寫一則。</span>
        </div>
      )}
      {bulkOpen && props.checkedN > 0 && (
        <div className="sm-pop sm-menu sm-bulkmenu" role="menu">
          <button type="button" role="menuitem" onClick={() => { setBulkOpen(false); props.onBulk("submit"); }}>送審所選</button>
          <button type="button" role="menuitem" className="sm-danger" onClick={() => { setBulkOpen(false); props.onBulk("delete"); }}>刪除所選（可在「已刪除貼文」還原）</button>
        </div>
      )}
      {props.filterOpen && (
        <div className="sm-pop sm-filters" role="dialog" aria-label="篩選">
          <div className="sm-cols">
            <div><h3>只看這些平台</h3>
              {props.platforms.map((pf) => (
                <label className="sm-ck" key={pf}><input type="checkbox" checked={filters.platforms.has(pf)} onChange={() => props.onFilters({ ...filters, platforms: flip(filters.platforms, pf) })} /><PfMark platform={pf} />{platformOf(pf).name}</label>
              ))}
              {!props.platforms.length && <span className="sm-muted">還沒有頻道</span>}
            </div>
            <div><h3>只看這些狀態</h3>
              {FILTER_STATES.map((s) => (
                <label className="sm-ck" key={s}><input type="checkbox" checked={filters.states.has(s)} onChange={() => props.onFilters({ ...filters, states: flip(filters.states, s) })} />
                  <span className="sm-dot" style={{ background: "var(--sm-state)", ...stateStyle(s) }} />{STATE_NAMES[s]}</label>
              ))}
            </div>
            <div><h3>只看這些標籤</h3>
              {props.tags.map((t) => (
                <label className="sm-ck" key={t.id}><input type="checkbox" checked={filters.tags.has(t.id)} onChange={() => props.onFilters({ ...filters, tags: flip(filters.tags, t.id) })} />
                  <span className="sm-dot" style={{ background: `var(${TAG_TOKEN[t.colour]})` }} />{t.name}</label>
              ))}
              {!props.tags.length && <span className="sm-muted">還沒有標籤</span>}
            </div>
          </div>
          <div className="sm-ft"><span className="sm-muted">都不勾＝全部都看</span>
            <span className="sm-row"><button type="button" onClick={() => props.onFilters(noFilters())}>清除</button>
              <button type="button" className="btn-primary" onClick={() => props.onFilterOpen(false)}>完成</button></span>
          </div>
        </div>
      )}
    </>
  );
}
