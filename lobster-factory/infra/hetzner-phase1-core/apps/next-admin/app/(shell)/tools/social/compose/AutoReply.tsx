"use client";
// 這則的自動回覆 (mock #autoBox; ADR 016 §5 decision 6): the brand's rules by default, none, or a rule of this post's
// own, which wins over the brand's. The rule is a social_auto_rules row with post_id = this post (0105); the brand's
// rules are edited in the 自動化流程 tab (C27).
import { PfMark } from "../Calendar";
import type { AutoRule } from "../api";
import type { AutoMode } from "../model";
import CIcon from "./icons";

export interface RuleDraft { id: string | null; name: string; trigger: "comment" | "dm"; keywords: string; platforms: string[]; action: "reply" | "dm" | "both"; reply: string; active: boolean }
export const blankRule = (): RuleDraft => ({ id: null, name: "這則專用", trigger: "comment", keywords: "", platforms: ["facebook", "instagram"], action: "reply", reply: "", active: true });
export const ruleDraftOf = (r: AutoRule): RuleDraft => ({ id: r.id, name: r.name, trigger: r.trigger, keywords: r.keywords.join(", "), platforms: [...r.platforms], action: r.action, reply: r.reply, active: r.active });

const MODES: Array<[AutoMode, string]> = [["none", "不用"], ["brand", "照品牌規則"], ["own", "這則另外設"]];
const TRIG = { comment: "留言含關鍵字", dm: "私訊含關鍵字" } as const;
const HOWS = { reply: "公開回覆留言", dm: "私訊對方", both: "兩者" } as const;
const PLATFORMS = [["facebook", "Facebook"], ["instagram", "Instagram"]] as const;
const ruleLine = (r: AutoRule) => `${TRIG[r.trigger].replace("關鍵字", "")}「${r.keywords.join(", ")}」→ ${HOWS[r.action]}`;

export default function AutoReply({ mode, open, brandRules, rule, editable, onMode, onOpen, onRule }: {
  mode: AutoMode; open: boolean; brandRules: AutoRule[] | null; rule: RuleDraft | null; editable: boolean;
  onMode: (m: AutoMode) => void; onOpen: () => void; onRule: (r: RuleDraft) => void;
}) {
  const on = (brandRules ?? []).filter((r) => r.active);
  const sum = mode === "brand" ? `照品牌規則（${brandRules ? `${on.length} 條開著` : "載入中"}）` : mode === "none" ? "不用" : "這則另外設";
  const set = (patch: Partial<RuleDraft>) => rule && onRule({ ...rule, ...patch });
  return (
    <div className="sm-autobox">
      <button type="button" className="sm-autohead" aria-expanded={open} onClick={onOpen}><CIcon name={open ? "chevD" : "chevR"} /><b>這則的自動回覆</b><span className="sm-muted">{sum}</span></button>
      {open && (
        <div className="sm-autobody">
          <span className="sm-seg" role="group" aria-label="這則的自動回覆">
            {MODES.map(([k, t]) => <button type="button" key={k} className={mode === k ? "sm-on" : ""} aria-pressed={mode === k} disabled={!editable} onClick={() => onMode(k)}>{t}</button>)}
          </span>
          <span className="sm-muted">這則的規則優先，品牌規則不會對這則再回一次。只有 Facebook、Instagram，要等 Meta 審核通過才會真的動作。</span>
          {mode === "brand" && (
            <div className="sm-muted">{brandRules === null ? "載入中…" : on.length ? on.map((r) => <div key={r.id}>・{r.name || "（沒有名字）"}：{ruleLine(r)}</div>) : "品牌目前沒有開著的規則。"}</div>
          )}
          {mode === "own" && rule && (
            <div className="sm-rule">
              <div className="sm-frow"><span className="sm-lab">當</span>
                <span className="sm-seg">{(Object.keys(TRIG) as Array<keyof typeof TRIG>).map((k) => <button type="button" key={k} className={rule.trigger === k ? "sm-on" : ""} aria-pressed={rule.trigger === k} disabled={!editable} onClick={() => set({ trigger: k })}>{TRIG[k]}</button>)}</span>
                <input type="text" aria-label="關鍵字" placeholder="關鍵字，用逗號分開：報名, 怎麼報" value={rule.keywords} readOnly={!editable} onChange={(e) => set({ keywords: e.target.value })} />
              </div>
              <div className="sm-frow"><span className="sm-lab">哪些平台</span>
                {PLATFORMS.map(([k, n]) => (
                  <label className="sm-ck" key={k}><input type="checkbox" checked={rule.platforms.includes(k)} disabled={!editable}
                    onChange={(e) => set({ platforms: e.target.checked ? [...rule.platforms, k] : rule.platforms.filter((x) => x !== k) })} /><PfMark platform={k} /> {n}</label>
                ))}
              </div>
              <div className="sm-frow"><span className="sm-lab">就</span>
                <span className="sm-seg">{(Object.keys(HOWS) as Array<keyof typeof HOWS>).map((k) => <button type="button" key={k} className={rule.action === k ? "sm-on" : ""} aria-pressed={rule.action === k} disabled={!editable} onClick={() => set({ action: k })}>{HOWS[k]}</button>)}</span>
              </div>
              <div className="sm-frow sm-ftop"><span className="sm-lab">回覆內容</span>
                <textarea rows={2} aria-label="回覆內容" maxLength={2000} value={rule.reply} readOnly={!editable} onChange={(e) => set({ reply: e.target.value })} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
