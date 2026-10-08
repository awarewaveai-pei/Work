"use client";

// 我的資料 (GOVERN, card 33): everything about the person's own data that is not bound to one case, in one place --
// what they share and with whom (each consent, withdrawable), their appeals, research, and export / erase. Nothing is
// shared by default: a consent names documents one by one, and the person sees exactly what and who before saying yes.
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { docs, type Doc } from "../../lib/blocks";
import { humanError } from "../../lib/errors";
import {
  PURPOSE_LABEL, REMOVE_NAMES_FIRST, RESEARCH_SENTENCE, SHAREABLE, accountSummary, appealsExportHref, appealsToHandle, consents, deleteAppeal,
  exportHref, giveConsent, groupMembers, makeAppeal, myAppeals, myGroups, withdrawConsent,
  type AccountSummary, type Appeal, type Consent, type ConsentItem, type ConsentPurpose, type GroupMember, type MyGroup,
} from "../../lib/govern";
import { apiFetch } from "../../lib/api";
import { formatTime } from "../../lib/time";

type CaseRow = { project_id: string; name: string };
type Pick = { project_id: string; case_name: string; kind: string; kind_name: string; doc_id: string; label: string };
const itemKey = (item: { project_id: string; doc_id: string }) => `${item.project_id}/${item.doc_id}`;
const preview = (doc: Doc) => String(doc.content.text ?? doc.content.title ?? doc.content.statement ?? "").slice(0, 40) || "（沒有文字）";

/** Every shareable document of my cases, as checkboxes grouped by case: never a "share everything" control. */
function ItemPicker({ cases, chosen, onChange }: { cases: CaseRow[]; chosen: Pick[]; onChange: (next: Pick[]) => void }) {
  const [found, setFound] = useState<Pick[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all(cases.flatMap((row) => SHAREABLE.map(([kind, kindName]) => docs.list<Record<string, unknown>>(row.project_id, kind).then((list) => list.map((doc) => (
      { project_id: row.project_id, case_name: row.name, kind, kind_name: kindName, doc_id: doc.doc_id, label: preview(doc) }))))))
      .then((lists) => { if (active) setFound(lists.flat()); })
      .catch((reason) => { if (active) setError(humanError(reason)); });
    return () => { active = false; };
  }, [cases]);
  if (!found) return <p className="sub">{error || "載入你的案子…"}</p>;
  if (found.length === 0) return <p className="sub">你的案子裡還沒有可以分享的卡。</p>;
  const toggle = (item: Pick) => onChange(chosen.some((other) => itemKey(other) === itemKey(item)) ? chosen.filter((other) => itemKey(other) !== itemKey(item)) : [...chosen, item]);
  return (
    <div>
      {cases.filter((row) => found.some((item) => item.project_id === row.project_id)).map((row) => (
        <fieldset key={row.project_id} className="field">
          <b>{row.name}</b>
          <ul className="check">
            {found.filter((item) => item.project_id === row.project_id).map((item) => (
              <li key={itemKey(item)}>
                <label><input type="checkbox" checked={chosen.some((other) => itemKey(other) === itemKey(item))} onChange={() => toggle(item)} /> {item.kind_name}：{item.label}</label>
              </li>
            ))}
          </ul>
        </fieldset>
      ))}
    </div>
  );
}

/** Choose what to share and with whom; the dialog shows exactly that before anything is saved. */
function NewConsent({ cases, groups, onSaved }: { cases: CaseRow[]; groups: MyGroup[]; onSaved: () => void }) {
  const [purpose, setPurpose] = useState<ConsentPurpose | null>(null);
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);
  const [facilitators, setFacilitators] = useState<Array<{ id: string; name: string }>>([]);
  const [study, setStudy] = useState("");
  const [chosen, setChosen] = useState<Pick[]>([]);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (purpose !== "facilitator") return;
    let active = true;
    Promise.all(groups.map((group) => groupMembers(group.group_id)))
      .then((lists) => { if (active) setFacilitators(lists.flat().filter((member) => member.role === "facilitator").map((member) => ({ id: member.identity_id, name: member.display_name }))); })
      .catch((reason) => { if (active) setError(humanError(reason)); });
    return () => { active = false; };
  }, [purpose, groups]);
  const who = purpose === "research" ? (study.trim() ? { id: study.trim(), name: `研究「${study.trim()}」` } : null) : target;
  const save = async () => {
    try {
      await giveConsent(purpose as ConsentPurpose, who!.id, chosen.map(({ project_id, kind, doc_id }): ConsentItem => ({ project_id, kind, doc_id })));
      setAsking(false); setChosen([]); setPurpose(null); setTarget(null); setStudy(""); setError(""); onSaved();
    } catch (reason) { setError(humanError(reason)); }
  };
  const choices = purpose === "group" ? groups.map((group) => ({ id: group.group_id, name: `群組「${group.name}」` })) : facilitators.map((person) => ({ id: person.id, name: `帶領的人 ${person.name}` }));
  return (
    <div className="card">
      <h3>分享新的東西</h3>
      <p className="how">先選給誰看，再一份一份勾要分享的東西。沒勾的都不會分享。</p>
      <div className="chips">
        {(["group", "facilitator", "research"] as ConsentPurpose[]).map((value) => (
          <button key={value} type="button" className={`chip${purpose === value ? " on" : ""}`} aria-pressed={purpose === value} onClick={() => { setPurpose(value); setTarget(null); }}>{PURPOSE_LABEL[value]}</button>
        ))}
      </div>
      {(purpose === "group" || purpose === "facilitator") && (
        <div className="chips">
          {choices.length === 0 && <span className="sub">{purpose === "group" ? "你還不在任何群組裡。" : "你的群組裡還沒有帶領的人。"}</span>}
          {choices.map((choice) => <button key={choice.id} type="button" className={`chip${target?.id === choice.id ? " on" : ""}`} aria-pressed={target?.id === choice.id} onClick={() => setTarget(choice)}>{choice.name}</button>)}
        </div>
      )}
      {purpose === "research" && (
        <div className="field">
          <p className="how">{RESEARCH_SENTENCE} {REMOVE_NAMES_FIRST}</p>
          <label htmlFor="study-code">研究的代號（做研究的人會給你）</label>
          <input id="study-code" value={study} onChange={(event) => setStudy(event.target.value)} maxLength={200} />
        </div>
      )}
      {purpose && <ItemPicker cases={cases} chosen={chosen} onChange={setChosen} />}
      <div className="btns"><button type="button" className="btn" disabled={!who || chosen.length === 0} onClick={() => setAsking(true)}>看一下要分享什麼</button></div>
      {asking && who && (
        <div className="judge" role="dialog" aria-label="確認要分享的東西">
          <p><b>{who.name}</b> 會看得到這 {chosen.length} 份：</p>
          <ul>{chosen.map((item) => <li key={itemKey(item)}>{item.case_name} · {item.kind_name}：{item.label}</li>)}</ul>
          <p className="sub">之後你改了這幾份，對方看到的是新的一版。你隨時可以撤回。</p>
          <div className="btns">
            <button type="button" className="btn" onClick={save}>確定分享</button>
            <button type="button" className="btn ghost" onClick={() => setAsking(false)}>先不要</button>
          </div>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

function ConsentList({ items, groups, onChange }: { items: Consent[]; groups: MyGroup[]; onChange: () => void }) {
  const [error, setError] = useState("");
  const live = items.filter((consent) => !consent.content.withdrawn);
  const targetName = (consent: Consent) => consent.content.purpose === "group" ? `群組「${groups.find((group) => group.group_id === consent.content.target)?.name ?? "已不在的群組"}」`
    : consent.content.purpose === "research" ? `研究「${consent.content.target}」` : "帶領的人";
  const withdraw = async (consent: Consent) => { try { await withdrawConsent(consent.doc_id); setError(""); onChange(); } catch (reason) { setError(humanError(reason)); } };
  return (
    <div>
      {live.length === 0 && <p className="sub">你現在沒有分享任何東西。</p>}
      {live.map((consent) => (
        <div key={consent.doc_id} className="row">
          <b>{PURPOSE_LABEL[consent.content.purpose]}</b>
          <span>{targetName(consent)} 看得到 {consent.content.items.length} 份，從 {formatTime(consent.created_at ?? consent.at)} 起。
            <button type="button" className="btn ghost" onClick={() => withdraw(consent)}>撤回</button></span>
        </div>
      ))}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

/** Write an appeal about a facilitator met in a group: anonymous unless the person turns their name on. */
function NewAppeal({ groups, onSaved }: { groups: MyGroup[]; onSaved: () => void }) {
  const mine = groups.filter((group) => group.my_role === "participant");
  const [group, setGroup] = useState<MyGroup | null>(null);
  const [facilitators, setFacilitators] = useState<GroupMember[]>([]);
  const [about, setAbout] = useState<GroupMember | null>(null);
  const [text, setText] = useState("");
  const [named, setNamed] = useState(false);
  const [error, setError] = useState("");
  const pickGroup = async (chosen: MyGroup) => {
    setGroup(chosen); setAbout(null);
    try { setFacilitators((await groupMembers(chosen.group_id)).filter((member) => member.role === "facilitator")); } catch (reason) { setError(humanError(reason)); }
  };
  const send = async () => {
    try { await makeAppeal(group!.group_id, about!.identity_id, text, named); setText(""); setNamed(false); setAbout(null); setGroup(null); setError(""); onSaved(); }
    catch (reason) { setError(humanError(reason)); }
  };
  if (mine.length === 0) return <p className="sub">你參加過有人帶的群組，才能對帶領的人提申訴。</p>;
  return (
    <div>
      <div className="chips">{mine.map((choice) => <button key={choice.group_id} type="button" className={`chip${group?.group_id === choice.group_id ? " on" : ""}`} aria-pressed={group?.group_id === choice.group_id} onClick={() => pickGroup(choice)}>{choice.name}</button>)}</div>
      {group && (
        <div className="chips">
          {facilitators.length === 0 && <span className="sub">這個群組沒有帶領的人。</span>}
          {facilitators.map((person) => <button key={person.identity_id} type="button" className={`chip${about?.identity_id === person.identity_id ? " on" : ""}`} aria-pressed={about?.identity_id === person.identity_id} onClick={() => setAbout(person)}>{person.display_name}</button>)}
        </div>
      )}
      {about && (
        <div className="field">
          <label htmlFor="appeal-text">你想說的事</label>
          <textarea id="appeal-text" value={text} maxLength={4000} onChange={(event) => setText(event.target.value)} />
          <label><input type="checkbox" id="appeal-named" checked={named} onChange={(event) => setNamed(event.target.checked)} /> 寫上我的名字</label>
          <p className="sub">{named ? "處理申訴的人會看到是你寫的。" : "沒有寫名字：處理申訴的人看不到是誰寫的。你說的那位帶領的人，什麼都看不到。"}</p>
          <div className="btns"><button type="button" className="btn" disabled={!text.trim()} onClick={send}>送出申訴</button></div>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

export function MyDataPage() {
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [groups, setGroups] = useState<MyGroup[]>([]);
  const [mine, setMine] = useState<Consent[] | null>(null);
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [toHandle, setToHandle] = useState<Appeal[]>([]);
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [error, setError] = useState("");
  const load = () => Promise.all([apiFetch<CaseRow[]>("/projects"), myGroups(), consents(), myAppeals(), appealsToHandle(), accountSummary()])
    .then(([projects, joined, given, written, handled, summary]) => { setCases(projects); setGroups(joined); setMine(given); setAppeals(written); setToHandle(handled); setAccount(summary); })
    .catch((reason) => setError(humanError(reason)));
  useEffect(() => { load(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!mine) return <div className="card"><p>{error || "載入中…"}</p></div>;
  const groupName = (id: string) => groups.find((group) => group.group_id === id)?.name ?? "一個群組";
  const removeAppeal = async (appeal: Appeal) => { try { await deleteAppeal(appeal.doc_id); load(); } catch (reason) { setError(humanError(reason)); } };
  const research = mine.filter((consent) => consent.content.purpose === "research" && !consent.content.withdrawn);

  return (
    <div>
      <div className="card">
        <h2>你分享了什麼、給誰看</h2>
        <p className="how">別人只看得到你一份一份勾過的東西。撤回之後，對方下一次打開就看不到了。</p>
        <ConsentList items={mine.filter((consent) => consent.content.purpose !== "research")} groups={groups} onChange={load} />
      </div>
      <NewConsent cases={cases} groups={groups} onSaved={load} />

      <div className="card">
        <h2>申訴</h2>
        <p className="how">你可以對帶你的人提出異議。由人處理，AI 不做決定。申訴是你的：你可以匯出、刪除。</p>
        <NewAppeal groups={groups} onSaved={load} />
        <h3>你寫的申訴 <small>{appeals.length} 件</small></h3>
        {appeals.map((appeal) => (
          <div key={appeal.doc_id} className="row">
            <b>{groupName(appeal.group_id)}</b>
            <span>{appeal.text}<br /><span className="sub">{appeal.named ? "有寫你的名字" : "沒有寫名字"}</span>
              <button type="button" className="btn ghost" onClick={() => removeAppeal(appeal)}>刪除</button></span>
          </div>
        ))}
        {appeals.length > 0 && <p className="sub"><a href={appealsExportHref()} download>匯出你的申訴</a></p>}
        {toHandle.length > 0 && (
          <>
            <h3>請你處理的申訴 <small>{toHandle.length} 件</small></h3>
            {toHandle.map((appeal) => (
              <div key={appeal.doc_id} className="row">
                <b>{appeal.named ? appeal.author_name : "沒具名"}</b>
                <span>{appeal.text}{appeal.on && <><br /><span className="sub">{appeal.on}</span></>}</span>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="card">
        <h2>研究</h2>
        <p className="how">你可以讓你的資料用在研究上，也可以隨時撤回。撤回之後，下一次的研究檔案就不會有你的資料。</p>
        <p className="how">{RESEARCH_SENTENCE}</p>
        <p className="how">{REMOVE_NAMES_FIRST}</p>
        {research.length === 0 && <p className="sub">你現在沒有參加任何研究。要參加，在上面「分享新的東西」選「給研究」。</p>}
        <ConsentList items={research} groups={groups} onChange={load} />
      </div>

      <div className="card">
        <h2>匯出和刪除</h2>
        <p className="how">匯出只是把資料搬出來，不經過 AI。</p>
        <div className="btns"><a className="btn" href={exportHref(null, "md")} download>匯出我的資料（文字）</a><a className="btn" href={exportHref(null, "json")} download>匯出我的資料（JSON）</a></div>
        {account && (
          <>
            <p className="how mt8">刪除帳號會刪掉 {account.cases.length} 個案子和你個人的紀錄。會留下的只有：</p>
            <ul>{account.keeps.map((line) => <li key={line}>{line}</li>)}</ul>
          </>
        )}
        <p className="sub mb0">要刪除帳號，到<Link href="/settings">設定</Link>，那裡會再問你一次。</p>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
