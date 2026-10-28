"use client";

import { useState, useEffect, useRef, useMemo, createContext, useContext } from "react";
import { AI_TEXT_MODELS, DEFAULT_AI_TEXT_MODEL } from "@/lib/ai/text-model-options";
import { chipStyle } from "@/components/tools/panel-primitives";
import StoryBibleWorkbench from "./StoryBibleWorkbench";
import OrganizationPicker from "./OrganizationPicker";
import { clampCustomScenes, handoffFromScript, type VideoHandoff } from "./video-handoff";
import { usePaidFeatures } from "@/lib/entitlements/use-paid-features";
import { renderSiteVoice } from "@/lib/content/brand-voice";
import { FORGE_NAV } from "@/lib/script-forge/nav";

// Palette mapped onto the GLOBAL theme CSS vars so ScriptForge matches the rest of the
// app (was a bespoke coral/violet/jade palette) AND follows /tools/theme automatically.
// Light tints use color-mix so they track the accent/status colors when the theme changes.
const C = {
  white:"var(--card-bg)",paper:"var(--body-bg)",fog:"var(--bg-hover)",border:"var(--border)",
  mid:"var(--text-muted)",ink:"var(--text-primary)",black:"var(--text-primary)",
  coral:"var(--accent)",corallt:"color-mix(in srgb, var(--accent) 12%, transparent)",
  violet:"var(--accent)",violetl:"color-mix(in srgb, var(--accent) 12%, transparent)",
  gold:"var(--yellow)",goldlt:"color-mix(in srgb, var(--yellow) 14%, transparent)",
  jade:"var(--green)",jadelt:"color-mix(in srgb, var(--green) 14%, transparent)",
  rose:"var(--red)",roselt:"color-mix(in srgb, var(--red) 12%, transparent)",
  sky:"var(--severity-low)",skylt:"color-mix(in srgb, var(--severity-low) 14%, transparent)",
  teal:"var(--green)",teallt:"color-mix(in srgb, var(--green) 12%, transparent)",
};

/* ── HISTORY ── */
function saveHistory(e){try{const h=JSON.parse(localStorage.getItem("sf_history")||"[]");h.unshift({...e,id:Date.now(),ts:new Date().toLocaleString("zh-TW")});localStorage.setItem("sf_history",JSON.stringify(h.slice(0,50)));}catch{}}
function getHistory(){try{return JSON.parse(localStorage.getItem("sf_history")||"[]");}catch{return [];}}

/* ── CLAUDE API（改走伺服器中轉 /api/tools/script-forge；SYS 在 route 端，瀏覽器不再直連 api.anthropic.com → 修掉 401 + 金鑰外洩）── */
// 模型選擇（模組級可變，避免穿過每個 forge() callsite）；UI 由設定列下拉設定，server 端會白名單化。
let SF_MODEL: string = DEFAULT_AI_TEXT_MODEL;
// 輸出語言（模組級，工具列下拉設定）；forge() 送給 server，由 server 加「預設語言」指令 → 所有模組輸出該語言
// （與你打的主題/文章語言無關；多語言模組的明確目標仍可覆蓋此預設）。
const SF_LANGS = ["繁體中文", "English", "簡體中文", "日本語", "한국어", "Español", "Bahasa Melayu"];
let SF_LANG: string = SF_LANGS[0];
let SF_SCENE_COUNT = 6;
let SF_CUSTOM_SCENES = 3;
// Set from usePaidFeatures in ScriptForge: every module button calls forge(), so the gate lives here (ADR 017 §4).
let SF_NOT_USABLE: string | undefined;

// The selected client's site: the server reads its brand voice (plan I1) instead of the page pasting it into prompts.
let SF_SITE_ID = "";
// That site's organization = its social brand (lib/social MODULE_MANIFEST: brand id = organization_id).
let SF_BRAND_ORG = "";

/** Saves one social draft for a brand: given only by the staff ScriptForge page (tools/script-forge/ScriptForgePage.tsx),
 *  so this component, which the video door also serves, never calls the social product's API itself. */
type SaveSocialDraft = (brand: string, fields: { body: string; notes: string }) => Promise<Response>;
const SocialDraftBridge = createContext<SaveSocialDraft | null>(null);

/** 「送社群」 (plan P5.27): the text as one social draft of the selected client's brand, no channel picked and no AI
 *  call -- the social tool's own per-platform writer (lib/social/write-posts.ts) takes it from there. */
function SendToSocial({ text, title }: { text: string; title: string }){
  const save=useContext(SocialDraftBridge);
  const[state,setState]=useState<"idle"|"saving"|"done"|string>("idle");
  if(!save||!text.trim())return null;
  if(!SF_BRAND_ORG)return <div style={{fontSize:11.5,color:C.mid}}>📣 要送社群，先在上方「載入客戶」選一個客戶。</div>;
  async function send(){
    setState("saving");
    try{
      const r=await save(SF_BRAND_ORG,{body:text.slice(0,20000),notes:`ScriptForge：${title}`.slice(0,500)});
      const j=await r.json().catch(()=>null);
      setState(r.ok?"done":(j?.error||`存檔失敗（${r.status}）`));
    }catch{setState("網路錯誤，請重試");}
  }
  if(state==="done")return <div style={{fontSize:12,color:C.jade,fontWeight:700}}>✅ 已存成社群草稿，到 <a href="/tools/social" style={{color:C.jade}}>社群工具</a> 選頻道、用 AI 改寫各平台版本後發布。</div>;
  return <div style={{display:"grid",gap:4}}><GBtn ch={state==="saving"?"存檔中…":"📣 送社群（存成草稿）"} onClick={()=>{if(state!=="saving")void send();}} style={{padding:"11px"}}/>{state!=="idle"&&state!=="saving"&&<div style={{fontSize:11.5,color:C.rose}}>{state}</div>}</div>;
}
/** One registered task of one module (lib/script-forge/modules.ts): the page sends only its fields; the role, rules,
 *  language line and brand are added on the server (plan I6). The answer streams back as text. */
async function forge(module: string, task: string, fields: Record<string, unknown>, onChunk?: (full: string) => void){
  if(SF_NOT_USABLE)throw new Error(SF_NOT_USABLE);
  const res=await fetch("/api/tools/script-forge",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({module,task,fields,siteId:SF_SITE_ID||undefined,lang:SF_LANG,sceneCount:SF_SCENE_COUNT,customScenes:SF_CUSTOM_SCENES,model:SF_MODEL})});
  if(!res.ok||!res.body){throw new Error(`腳本生成失敗（${res.status}）`);}
  const reader=res.body.getReader();const dec=new TextDecoder();let full="";
  while(true){const{done,value}=await reader.read();if(done)break;full+=dec.decode(value,{stream:true});onChunk?.(full);}
  full+=dec.decode();
  return full;
}

/* ── 送去做影片 bridge：一顆鍵、一個交接形狀（video-handoff.ts），經 context 給每個會出影片的模組（null = 不整合）── */
type SendToVideo = (h: VideoHandoff, organizationId: string) => void;
const VideoBridge = createContext<{ send: SendToVideo; needsClient: boolean } | null>(null);

/** 「🎬 送去做影片」: needsClient (the standalone page) means the project is created for the loaded client. */
function SendToVideoButton({ build, label = "🎬 送去做影片" }: { build: () => VideoHandoff; label?: string }){
  const bridge=useContext(VideoBridge);
  const[sent,setSent]=useState(false);
  if(!bridge)return null;
  if(bridge.needsClient&&!SF_BRAND_ORG)return <div style={{fontSize:11.5,color:C.mid}}>🎬 要送去做影片，先在上方「載入客戶」選一個客戶。</div>;
  return <PBtn ch={sent?"✅ 已送出":label} onClick={()=>{bridge.send(build(),SF_BRAND_ORG);setSent(true);}} full/>;
}
// 場景總數與 AI 生圖分配屬於前製腳本：它們會改變腳本內容量與每場 visual_type。
// VideoStudio 只負責素材模式、模型、配音、輸出比例與渲染。
const ScriptSettingsCtx = createContext<{ sceneCount: number; customScenes: number }>({ sceneCount: 6, customScenes: 3 });
function pj(raw){return JSON.parse(raw.replace(/```json|```/g,"").trim());}
/** `#tag #tag`: space separated, a leading # in the data is not doubled. */
function hashtagLine(tags:string[]){return (tags||[]).map(h=>String(h).trim().replace(/^#+/,"")).filter(Boolean).map(h=>`#${h}`).join(" ");}

/* ── 短劇 Story Bible 套用（2026-09-11）── 這是「手動生成」腳本生成的唯一接線點；其餘 23 個
   模組（廣告A/B/C、產業模板…）刻意不加，避免同一顆選擇器複製 10 份卻多半用不到——短劇連續性
   的真實使用場景就是「手動生成」+ Story Bible workbench 這條路。org 選擇器是 ManualModule 自己
   帶的獨立 OrganizationPicker 實例（跟 FootageEditor/StoryBibleWorkbench 同 pattern，非全域
   state），因為 ScriptForge 本身在此之前完全沒有 organizationId 概念（Step 2 才選租戶）。 */
type StoryBibleDoc = {
  seriesId: string; revision: number;
  characters: { id: string; name: string; role?: string; referenceAssetIds?: string[] }[];
  locations: { id: string; name: string }[];
  continuity: { currentState: string[]; prohibitions: string[]; openThreads: string[] };
  episode: { episodeId: string; premise: string; hook: string; beats: string[] };
};
type ReferenceAsset = { id: string; object_url: string; mime_type?: string };
type StoryBibleListItem = { id: string; series_id: string; revision: number; status: string; document_json: StoryBibleDoc };

/** Bible 內容轉成可插進生成 prompt 的中文區塊；缺欄位一律顯示「（無）」，不留空字串造成 prompt 斷句怪異。 */
function storyBibleContextBlock(doc: StoryBibleDoc): string {
  const chars = (doc.characters || []).map((c) => c.role ? `${c.name}（${c.role}）` : c.name).join("、") || "（無）";
  const locs = (doc.locations || []).map((l) => l.name).join("、") || "（無）";
  const state = (doc.continuity?.currentState || []).join("；") || "（無）";
  const forbid = (doc.continuity?.prohibitions || []).join("；") || "（無）";
  const threads = (doc.continuity?.openThreads || []).join("；") || "（無）";
  const beats = (doc.episode?.beats || []).filter(Boolean).join(" → ") || "（無）";
  return `\n\n【短劇 Story Bible 設定 — 必須嚴格遵守，不可違反「不可違反的設定」任何一條】\n角色：${chars}\n場景／地點：${locs}\n目前狀態：${state}\n不可違反的設定：${forbid}\n尚未解開的線索（可延續但不可提前解開）：${threads}\n本集大綱節拍：${beats}\n本集前提：${doc.episode?.premise || "（無）"}\n本集結尾鉤子：${doc.episode?.hook || "（無）"}\n`;
}

type ContinuityCheck = { loading?: boolean; ok?: boolean | null; violations?: { rule: string; sceneIndex: number; reason: string }[]; error?: boolean };

/** 生成完成後跑一次連續性檢查：不擋「送去做影片」，只是誠實列出可能的違反供人判斷——
   這是輔助審核，不是自動裁決（腳本品質判斷仍是人的工作）。 */
async function checkStoryBibleContinuity(script: any, doc: StoryBibleDoc): Promise<ContinuityCheck> {
  const forbid = doc.continuity?.prohibitions || [];
  if (!forbid.length) return { ok: true, violations: [] };
  try {
    const raw = await forge("story_bible","check",{forbid,characters:(doc.characters||[]).map((c)=>c.name),locations:(doc.locations||[]).map((l)=>l.name),lines:(script.scenes||[]).map((s:any)=>s.dialogue||s.narration||"")});
    const parsed = pj(raw);
    // ok 欄位缺失（LLM 沒照格式回）視同解析失敗，不可默認當「通過」——否則格式錯誤會誤顯示綠色打勾。
    if (typeof parsed.ok !== "boolean") return { ok: null, violations: [], error: true };
    const violations = Array.isArray(parsed.violations)
      ? parsed.violations.map((v: any) => ({ rule: String(v?.rule ?? "未說明"), sceneIndex: Number.isFinite(Number(v?.sceneIndex)) ? Number(v.sceneIndex) : -1, reason: String(v?.reason ?? "") }))
      : [];
    return { ok: parsed.ok, violations };
  } catch {
    return { ok: null, violations: [], error: true };
  }
}

function useStoryBibles(organizationId: string) {
  const [bibles, setBibles] = useState<StoryBibleListItem[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  useEffect(() => {
    if (!organizationId) { setBibles([]); setStatus("idle"); return; }
    let cancelled = false;
    setStatus("loading");
    fetch(`/api/video/story-bibles?organizationId=${encodeURIComponent(organizationId)}`)
      .then((r) => r.json())
      .then((j: { ok: boolean; items?: StoryBibleListItem[] }) => {
        if (cancelled) return;
        // GET 已按 series_id, revision desc 排序；每個 series 只留最新一筆 approved 版本。
        const seen = new Set<string>();
        const approved = (j.items || []).filter((it) => it.status === "approved" && !seen.has(it.series_id) && seen.add(it.series_id));
        setBibles(approved);
        setStatus("ready");
      })
      .catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; };
  }, [organizationId]);
  return { bibles, status };
}

/** org 的已註冊參考素材（含圖片；/api/video/reference-assets 無 mime 限制）→ 角色定裝照 id→URL 解析用。 */
function useReferenceAssets(organizationId: string) {
  const [assets, setAssets] = useState<ReferenceAsset[]>([]);
  useEffect(() => {
    if (!organizationId) { setAssets([]); return; }
    let cancelled = false;
    fetch(`/api/video/reference-assets?organizationId=${encodeURIComponent(organizationId)}`)
      .then((r) => r.json())
      .then((j: { ok: boolean; items?: ReferenceAsset[] }) => { if (!cancelled) setAssets(j.items ?? []); })
      .catch(() => { if (!cancelled) setAssets([]); });
    return () => { cancelled = true; };
  }, [organizationId]);
  return assets;
}

/** Bible characters[].referenceAssetIds（各取第一張）→ {characterId: imageUrl} 供生圖/畫面一致性比對用。 */
function buildCharacterRefMap(doc: StoryBibleDoc | undefined, assets: ReferenceAsset[]): Record<string, string> {
  if (!doc) return {};
  const byId = new Map(assets.map((a) => [a.id, a.object_url]));
  const map: Record<string, string> = {};
  for (const c of doc.characters || []) {
    const firstRef = (c.referenceAssetIds || []).find((id) => byId.has(id));
    if (firstRef) map[c.id] = byId.get(firstRef)!;
  }
  return map;
}


/* ── INDUSTRY DATA ── */
const INDUSTRIES={
  beauty:{label:"美妝／保養",icon:"💄",voice:"優雅真實，像懂美的閨蜜，強調成分與效果",forbidden:"爆款、神奇、100%保證",preferred:"親測、成分、質地、持久、自然",structure:"使用前後對比→成分解析→使用方式→真實感受→CTA",hooks:["用了三個月我才敢說這個","護膚博主不告訴你的事","為什麼貴的保養品不一定贏"]},
  food:{label:"餐飲／食品",icon:"🍜",voice:"熱情有食慾感，重視食材故事",forbidden:"最好吃、天下第一",preferred:"新鮮、手工、祖傳、限定、季節",structure:"食物特寫鉤子→食材來源→製作過程→口感→地點CTA",hooks:["台北最難訂位的一碗麵","這個食材老闆找了三年","每天限量20份的原因"]},
  ecommerce:{label:"電商／零售",icon:"🛍️",voice:"直接有利益感，快速建立信任，強調CP值",forbidden:"假評價、過度承諾",preferred:"實測、對比、CP值、解決、升級",structure:"痛點→產品登場→功能演示→對比競品→限時優惠→CTA",hooks:["我退貨過三次才找到這個","為什麼它值這個價格","同類產品我買過七種"]},
  course:{label:"課程／教練",icon:"🎓",voice:"專業但親切，建立權威感，用數據和案例說話",forbidden:"輕鬆躺賺、保證成功",preferred:"系統、實作、案例、轉變、方法",structure:"學員痛點→你也這樣嗎→我的方法→學員案例→CTA",hooks:["我失敗過17次才找到這個方法","三個月前他還不知道怎麼開始","這個問題我學生每個都問"]},
  realestate:{label:"房地產／金融",icon:"🏠",voice:"專業信任感強，數據為主",forbidden:"穩賺不賠、保證獲利",preferred:"分析、數據、區域、投報率",structure:"市場觀察→數據佐證→案例分析→常見誤區→CTA",hooks:["大家都說現在不能買房","這個數字讓我改變想法","房仲不希望你知道的事"]},
  fitness:{label:"健身／健康",icon:"💪",voice:"激勵科學化真實，強調正確方法",forbidden:"七天瘦十公斤、躺著減肥",preferred:"正確姿勢、科學、循序漸進",structure:"錯誤觀念鉤子→正確解析→動作示範→科學原理→CTA",hooks:["我健身兩年沒有結果的原因","大家都練錯的一個動作","教練說的話我後來才懂"]},
  art:{label:"藝術／設計",icon:"🎨",voice:"有溫度啟發性，強調過程而非結果",forbidden:"天才、標準答案、完美",preferred:"過程、嘗試、失敗、靈感、感受",structure:"作品展示鉤子→創作動機→製作過程→困難→心得→CTA",hooks:["這幅畫我畫了又刪了六次","沒有天分如何開始創作","我最喜歡的作品其實是失敗品"]},
  travel:{label:"旅遊業",icon:"✈️",voice:"感性有畫面感，強調獨特與在地",forbidden:"必去、超值",preferred:"在地、隱藏、秘境、當地人、慢旅",structure:"景色鉤子→地點揭曉→在地故事→實用資訊→CTA",hooks:["Google沒有標記的地方","當地人才知道的路線","這一天改變了我對旅行的看法"]},
  wellness:{label:"身心靈／療癒",icon:"🌿",voice:"溫柔包容不說教，創造安全感",forbidden:"治好、保證、唯一方法",preferred:"陪伴、感受、自我、慢慢、允許",structure:"情緒共鳴開場→個人故事→方法分享→邀請嘗試→CTA",hooks:["那天我突然哭了出來","不是你的問題","允許自己慢下來"]},
  tech:{label:"科技／SaaS",icon:"💻",voice:"清晰有邏輯，解決具體問題，強調效率與ROI",forbidden:"革命性、顛覆",preferred:"效率、節省、整合、自動化、數據",structure:"工作痛點鉤子→現有方案問題→產品演示→數據效益→CTA",hooks:["我每天浪費三小時在這件事","這個功能讓我的工作少了一半","為什麼大公司都在用這個"]},
};

const PLATFORMS=[{id:"reels",label:"Instagram Reels",icon:"◈"},{id:"tiktok",label:"TikTok",icon:"♪"},{id:"shorts",label:"YT Shorts",icon:"▶"},{id:"youtube",label:"YouTube 長片",icon:"⬛"},{id:"podcast",label:"Podcast",icon:"◎"},{id:"ad",label:"廣告腳本",icon:"◆"}];
const DURATIONS=["15秒","30秒","60秒","3分鐘","10分鐘"];
const GOALS=["吸粉增長","教育受眾","銷售產品","引流導網","品牌曝光","建立信任"];
const TONES=["專業權威","溫柔親切","幽默搞笑","犀利直接","高級質感","情緒共鳴"];
const CTAS=["留言互動","追蹤頻道","購買產品","預約服務","下載資源","私訊詢問"];
const LANGUAGES=[{id:"en",label:"英文",flag:"🇺🇸"},{id:"ja",label:"日文",flag:"🇯🇵"},{id:"yue",label:"粵語",flag:"🇭🇰"},{id:"ko",label:"韓文",flag:"🇰🇷"},{id:"th",label:"泰文",flag:"🇹🇭"},{id:"ms",label:"馬來文",flag:"🇲🇾"}];

const NAVS=[
  {id:"story_bible",label:"短劇 Story Bible",icon:"📖",group:"生成"},
  {id:"manual",label:"手動生成",icon:"✏️",group:"生成"},
  {id:"article",label:"文章轉腳本",icon:"📄",group:"生成"},
  {id:"industry",label:"產業模板",icon:"🏭",group:"生成"},
  {id:"ab",label:"廣告A/B/C",icon:"🎯",group:"生成"},
  {id:"host",label:"AI主持人稿",icon:"🤖",group:"生成"},
  {id:"brand_story",label:"品牌故事",icon:"📰",group:"生成"},
  {id:"sales",label:"銷售對話",icon:"💰",group:"生成"},
  {id:"speech",label:"演講腳本",icon:"🎤",group:"生成"},
  {id:"pitch",label:"Pitch Deck",icon:"📊",group:"生成"},
  {id:"seo",label:"SEO轉腳本",icon:"🔍",group:"生成"},
  {id:"hook",label:"Hook生成器",icon:"🪝",group:"工具"},
  {id:"pain",label:"受眾痛點",icon:"💬",group:"工具"},
  {id:"viral",label:"爆款拆解",icon:"🔁",group:"工具"},
  {id:"thumbnail",label:"縮圖文案",icon:"🎬",group:"工具"},
  {id:"repurpose",label:"腳本轉文案",icon:"📧",group:"工具"},
  {id:"translate",label:"多語言版本",icon:"🌍",group:"工具"},
  {id:"preview",label:"動態預覽",icon:"▶️",group:"工具"},
  {id:"predict",label:"績效預測",icon:"📊",group:"分析"},
  {id:"brand_build",label:"品牌速建",icon:"🧠",group:"設定"},
  {id:"brand",label:"品牌語氣",icon:"📋",group:"設定"},
  {id:"calendar",label:"30天計畫",icon:"📅",group:"規劃"},
  {id:"proposal",label:"客戶提案包",icon:"📦",group:"規劃"},
  {id:"history",label:"腳本歷史",icon:"📝",group:"紀錄"},
];

/* ── MINI UI ── */
const Tag=({c,bg,ch,small}: any)=><span style={{display:"inline-block",padding:small?"1px 8px":"2px 10px",borderRadius:999,fontSize:small?10:11,fontWeight:700,letterSpacing:.4,color:c||C.coral,background:bg||C.corallt}}>{ch}</span>;
const Pill=({label,active,onClick})=><button type="button" onClick={onClick} style={chipStyle(!!active)}>{active?"✓ "+label:label}</button>;
const PBtn=({ch,onClick,disabled,full,style={}}: any)=><button onClick={onClick} disabled={disabled} style={{padding:"12px 20px",borderRadius:10,background:disabled?C.fog:C.coral,color:disabled?C.mid:"var(--btn-primary-text)",border:"none",fontWeight:800,fontSize:13.5,cursor:disabled?"not-allowed":"pointer",fontFamily:"inherit",transition:"all .2s",boxShadow:disabled?"none":"0 4px 14px color-mix(in srgb, var(--accent) 26%, transparent)",width:full?"100%":"auto",...style}}>{ch}</button>;
const GBtn=({ch,onClick,style={}})=><button onClick={onClick} style={{padding:"8px 14px",borderRadius:8,background:C.white,border:`1.5px solid ${C.border}`,color:C.ink,fontSize:12.5,fontWeight:600,cursor:"pointer",fontFamily:"inherit",transition:"all .15s",...style}}>{ch}</button>;
const Card=({children,style={}})=><div style={{background:C.white,border:`1.5px solid ${C.border}`,borderRadius:13,padding:18,...style}}>{children}</div>;
const SL=({ch})=><div style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:C.mid,textTransform:"uppercase",marginBottom:7}}>{ch}</div>;
const Spin=({label})=><div style={{textAlign:"center",padding:"56px 0"}}><div style={{display:"inline-flex",gap:6,marginBottom:10}}>{[0,1,2].map(i=><div key={i} style={{width:7,height:7,borderRadius:"50%",background:C.coral,animation:`bonce .8s ease-in-out ${i*.15}s infinite alternate`}}/>)}</div><div style={{fontSize:13.5,color:C.ink,fontWeight:600}}>{label}</div><div style={{fontSize:11.5,color:C.mid,marginTop:3}}>AI正在思考中...</div></div>;
const SBar=({label,val,accent})=><div style={{marginBottom:9}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{fontSize:12,color:C.ink}}>{label}</span><span style={{fontSize:12,fontWeight:800,color:accent}}>{val}<span style={{fontSize:9,color:C.mid}}>/10</span></span></div><div style={{height:4,borderRadius:99,background:C.fog,overflow:"hidden"}}><div style={{width:`${(val/10)*100}%`,height:"100%",background:accent,borderRadius:99,transition:"width 1.2s cubic-bezier(.4,0,.2,1)"}}/></div></div>;

function TA({value,onChange,placeholder,rows=4}){const[f,sf]=useState(false);return<textarea value={value} onChange={onChange} placeholder={placeholder} rows={rows} onFocus={()=>sf(true)} onBlur={()=>sf(false)} style={{width:"100%",padding:"11px 13px",background:C.white,border:`2px solid ${f?C.coral:C.border}`,borderRadius:10,fontSize:13.5,color:C.black,resize:"vertical",outline:"none",lineHeight:1.6,fontFamily:"inherit",transition:"border-color .2s",boxSizing:"border-box"}}/>;}
function IN({value,onChange,placeholder,onKeyDown}: any){const[f,sf]=useState(false);return<input value={value} onChange={onChange} placeholder={placeholder} onKeyDown={onKeyDown} onFocus={()=>sf(true)} onBlur={()=>sf(false)} style={{width:"100%",padding:"10px 13px",background:C.white,border:`2px solid ${f?C.coral:C.border}`,borderRadius:10,fontSize:13.5,color:C.black,outline:"none",fontFamily:"inherit",transition:"border-color .2s",boxSizing:"border-box"}}/>;}
function PlatGrid({value,onChange}){return<div><div style={{fontSize:11,color:C.mid,marginBottom:6}}>寫這支腳本時的主平台（決定字數、節奏、語氣）。寫完後可用結果頁的「多平台轉換」另產其他平台版本。</div><div style={{display:"flex",flexWrap:"wrap",gap:7}}>{PLATFORMS.map(p=><button key={p.id} onClick={()=>onChange(p.id)} style={{padding:"10px 8px",borderRadius:10,border:`2px solid ${value===p.id?C.coral:C.border}`,background:value===p.id?C.corallt:C.white,cursor:"pointer",textAlign:"center",flex:"1 1 70px",fontFamily:"inherit",transition:"all .15s"}}><div style={{fontSize:14,marginBottom:2,color:value===p.id?C.coral:C.mid}}>{p.icon}</div><div style={{fontSize:9.5,fontWeight:value===p.id?700:400,color:value===p.id?C.coral:C.ink,lineHeight:1.2}}>{p.label}</div></button>)}</div></div>;}
const SceneCard=({scene,idx})=><div style={{border:`1.5px solid ${C.border}`,borderRadius:11,overflow:"hidden",background:C.white}}><div style={{background:C.black,padding:"6px 13px",display:"flex",alignItems:"center",gap:9}}><div style={{background:C.coral,color:C.white,width:22,height:22,borderRadius:5,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,flexShrink:0}}>{String(idx+1).padStart(2,"0")}</div><span style={{fontSize:11,color:"#ccc"}}>{scene.time}</span>{scene.subtitle&&<span style={{marginLeft:"auto",background:"rgba(255,255,255,.1)",color:"#fff",padding:"1px 9px",borderRadius:999,fontSize:10,fontWeight:700}}>「{scene.subtitle}」</span>}</div><div style={{padding:"11px 14px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>{[["🖼 畫面",scene.visual,C.black,false],["🎙 台詞",scene.dialogue,C.violet,true],["📷 拍攝",scene.shoot_tip,C.ink,false],["✂️ 剪輯",scene.edit_tip,C.jade,false]].map(([l,v,col,it])=><div key={l}><div style={{fontSize:9,color:C.mid,fontWeight:700,letterSpacing:1,marginBottom:2,textTransform:"uppercase"}}>{l}</div><div style={{fontSize:12.5,color:col,lineHeight:1.5,fontStyle:it?"italic":"normal",fontFamily:it?"DM Serif Display,serif":"inherit"}}>{v}</div></div>)}</div></div>;

/* ═══════════════════════════════════
   ANIMATED SCRIPT PREVIEW
═══════════════════════════════════ */
function AnimatedPreview({script,onClose}){
  const[currentScene,setCurrentScene]=useState(0);
  const[playing,setPlaying]=useState(false);
  const[charIdx,setCharIdx]=useState(0);
  const[showSubtitle,setShowSubtitle]=useState(false);
  const[showVisual,setShowVisual]=useState(false);
  const[transition,setTransition]=useState(false);
  const intervalRef=useRef(null);
  const scenes=script?.scenes||[];
  const scene=scenes[currentScene];

  useEffect(()=>{
    if(!playing)return;
    setCharIdx(0);setShowSubtitle(false);setShowVisual(false);setTransition(true);
    const tt=setTimeout(()=>setTransition(false),400);
    const vt=setTimeout(()=>setShowVisual(true),600);
    const st=setTimeout(()=>setShowSubtitle(true),1000);
    const dialogue=scene?.dialogue||"";
    let i=0;
    const ci=setInterval(()=>{
      if(i<dialogue.length){setCharIdx(++i);}
      else{
        clearInterval(ci);
        const nt=setTimeout(()=>{
          if(currentScene<scenes.length-1){setCurrentScene(c=>c+1);}
          else{setPlaying(false);setCurrentScene(0);}
        },2000);
        intervalRef.current=nt;
      }
    },40);
    intervalRef.current=ci;
    return()=>{clearInterval(ci);clearTimeout(tt);clearTimeout(vt);clearTimeout(st);};
  },[playing,currentScene]);

  function goTo(i){setPlaying(false);setCurrentScene(i);setCharIdx(0);setShowSubtitle(false);setShowVisual(false);}
  useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if(e.key==="Escape")onClose();};window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey);},[onClose]);
  function togglePlay(){if(playing){setPlaying(false);clearInterval(intervalRef.current);}else{setPlaying(true);}}

  const bgColors=["#1a0a00","#0a001a","#001a0a","#1a1000","#001018","#180010"];
  const bg=bgColors[currentScene%bgColors.length];

  return(
    // A short window scrolls the overlay (margin:auto keeps it centered when it fits); the close button sits on the
    // frame, so it is never pushed below the fold. Esc and a click on the backdrop close it too.
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.85)",zIndex:1000,display:"flex",padding:20,overflowY:"auto"}}>
      <div onClick={e=>e.stopPropagation()} style={{margin:"auto",position:"relative",width:"100%",maxWidth:440,background:C.white,borderRadius:20,overflow:"hidden",boxShadow:"0 24px 80px rgba(0,0,0,.4)"}}>
        <button type="button" onClick={onClose} aria-label="關閉預覽" title="關閉預覽（Esc）" style={{position:"absolute",top:10,right:10,zIndex:5,width:34,height:34,borderRadius:"50%",border:"1px solid rgba(255,255,255,.35)",background:"rgba(0,0,0,.55)",color:"#fff",fontSize:16,cursor:"pointer"}}>✕</button>
        {/* Phone frame */}
        <div style={{background:bg,position:"relative",height:"min(480px, 52vh)",overflow:"hidden",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",transition:"background .5s"}}>
          {/* Animated bg shapes */}
          <div style={{position:"absolute",width:200,height:200,borderRadius:"50%",background:"rgba(255,255,255,.03)",top:-40,right:-40,animation:"float1 4s ease-in-out infinite"}}/>
          <div style={{position:"absolute",width:120,height:120,borderRadius:"50%",background:"rgba(255,255,255,.04)",bottom:-20,left:-20,animation:"float2 5s ease-in-out infinite"}}/>

          {/* Scene transition flash */}
          {transition&&<div style={{position:"absolute",inset:0,background:"rgba(255,255,255,.15)",animation:"flash .3s ease-out"}}/>}

          {/* Visual description pill */}
          {showVisual&&scene?.visual&&(
            <div style={{position:"absolute",top:20,left:16,right:56,background:"rgba(255,255,255,.12)",borderRadius:10,padding:"8px 12px",backdropFilter:"blur(8px)",animation:"slideDown .4s ease",border:"1px solid rgba(255,255,255,.15)"}}>
              <div style={{fontSize:9,color:"rgba(255,255,255,.5)",fontWeight:700,letterSpacing:1,marginBottom:3}}>🎬 畫面</div>
              <div style={{fontSize:11.5,color:"rgba(255,255,255,.85)",lineHeight:1.5}}>{scene.visual}</div>
            </div>
          )}

          {/* Subtitle bar */}
          {showSubtitle&&scene?.subtitle&&(
            <div style={{position:"absolute",bottom:80,left:20,right:20,textAlign:"center",animation:"fadeUp .3s ease"}}>
              <div style={{display:"inline-block",background:"rgba(0,0,0,.7)",color:C.white,padding:"6px 16px",borderRadius:6,fontSize:15,fontWeight:800,letterSpacing:.3,border:"2px solid rgba(255,255,255,.2)"}}>
                {scene.subtitle}
              </div>
            </div>
          )}

          {/* Main dialogue typewriter */}
          <div style={{padding:"20px 24px",textAlign:"center",position:"relative",zIndex:2}}>
            <div style={{fontSize:18,color:C.white,fontWeight:700,lineHeight:1.6,minHeight:80,fontFamily:"DM Serif Display,serif",textShadow:"0 2px 10px rgba(0,0,0,.5)"}}>
              {(scene?.dialogue||"").slice(0,charIdx)}
              {playing&&charIdx<(scene?.dialogue||"").length&&<span style={{animation:"blink 0.7s infinite",borderRight:"2px solid rgba(255,255,255,.6)"}}/>}
            </div>
          </div>

          {/* Scene counter */}
          <div style={{position:"absolute",bottom:16,right:16,background:"rgba(0,0,0,.5)",color:"rgba(255,255,255,.7)",padding:"3px 10px",borderRadius:999,fontSize:11,fontWeight:700}}>
            {currentScene+1} / {scenes.length}
          </div>

          {/* Shoot tip */}
          {scene?.shoot_tip&&(
            <div style={{position:"absolute",bottom:16,left:16,background:"color-mix(in srgb, var(--accent) 16%, transparent)",border:"1px solid color-mix(in srgb, var(--accent) 32%, transparent)",color:"#fff",padding:"3px 9px",borderRadius:6,fontSize:10,maxWidth:180}}>
              📷 {scene.shoot_tip}
            </div>
          )}
        </div>

        {/* Controls */}
        <div style={{background:C.black,padding:"14px 16px"}}>
          {/* Scene dots */}
          <div style={{display:"flex",justifyContent:"center",gap:5,marginBottom:12}}>
            {scenes.map((_,i)=>(
              <button key={i} onClick={()=>goTo(i)} style={{width:i===currentScene?20:7,height:7,borderRadius:999,background:i===currentScene?C.coral:"rgba(255,255,255,.25)",border:"none",cursor:"pointer",transition:"all .3s"}}/>
            ))}
          </div>
          {/* Play controls */}
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <button onClick={()=>goTo(Math.max(0,currentScene-1))} style={{background:"rgba(255,255,255,.1)",border:"none",color:"white",width:36,height:36,borderRadius:"50%",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>⟨</button>
            <button onClick={togglePlay} style={{flex:1,background:playing?C.rose:C.coral,border:"none",color:"white",height:40,borderRadius:10,cursor:"pointer",fontSize:14,fontWeight:800,fontFamily:"inherit",transition:"all .2s"}}>{playing?"⏸ 暫停":"▶ 播放腳本"}</button>
            <button onClick={()=>goTo(Math.min(scenes.length-1,currentScene+1))} style={{background:"rgba(255,255,255,.1)",border:"none",color:"white",width:36,height:36,borderRadius:"50%",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>⟩</button>
          </div>
        </div>

        {/* Scene list */}
        <div style={{maxHeight:160,overflowY:"auto",borderTop:`1px solid ${C.border}`}}>
          {scenes.map((s,i)=>(
            <div key={i} onClick={()=>goTo(i)} style={{padding:"9px 16px",display:"flex",gap:10,alignItems:"center",cursor:"pointer",background:i===currentScene?C.corallt:C.white,borderBottom:`1px solid ${C.border}`,transition:"background .15s"}}>
              <div style={{width:20,height:20,borderRadius:5,background:i===currentScene?C.coral:C.fog,color:i===currentScene?C.white:C.mid,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,flexShrink:0}}>{String(i+1).padStart(2,"0")}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:10.5,color:i===currentScene?C.coral:C.mid,fontWeight:700,marginBottom:1}}>{s.time}</div>
                <div style={{fontSize:12,color:C.ink,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.dialogue}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Close */}
        <div style={{padding:"12px 16px",borderTop:`1px solid ${C.border}`,background:C.paper}}>
          <GBtn ch="關閉預覽" onClick={onClose} style={{width:"100%",padding:"10px"}}/>
        </div>
      </div>
    </div>
  );
}

/* ── SCRIPT RESULT ── */
function ScriptResult({script,score,onReset,extraTop,autoSaveTag,sbCharacterRefs}: any){
  const[repLoading,setRepLoading]=useState(false);
  // Versions side by side: the original stays; each platform's rewrite is kept under its id. `sel` = the version that is sent and copied.
  const[versions,setVersions]=useState<Record<string,any>>({});
  const[sel,setSel]=useState("original");
  const[copiedId,setCopiedId]=useState("");
  const orig=script;
  const cur=sel==="original"?orig:(versions[sel]||orig);
  const[showPreview,setShowPreview]=useState(false);
  const { customScenes }=useContext(ScriptSettingsCtx);

  useEffect(()=>{if(script&&autoSaveTag)saveHistory({tag:autoSaveTag,title:script.title,hook:script.hook,script});},[script]);
  useEffect(()=>{setVersions({});setSel("original");},[script]);

  function copyVersion(id){
    const v=id==="original"?orig:versions[id];
    if(!v)return;
    let t=`# ${v.title}\n\n開頭鉤子：${v.hook}\n\n`;
    v.scenes?.forEach(s=>{t+=`【${s.time}】\n畫面：${s.visual||""}\n台詞：${s.dialogue}\n字幕：${s.subtitle||""}\n拍攝：${s.shoot_tip||""}\n剪輯：${s.edit_tip||""}\n\n`;});
    t+=`CTA：${v.cta||""}`;
    if(v.titles?.length)t+=`\n\n標題：\n${v.titles.join("\n")}`;
    if(v.hashtags?.length)t+=`\n\nHashtags：${hashtagLine(v.hashtags)}`;
    navigator.clipboard.writeText(t);setCopiedId(id);setTimeout(()=>setCopiedId(""),2000);
  }

  // forceNew = 「重新轉換」; a platform already converted just switches to its version, no AI call.
  async function doRep(pid,forceNew=false){
    if(versions[pid]&&!forceNew){setSel(pid);return;}
    setRepLoading(true);
    const plat=PLATFORMS.find(p=>p.id===pid)?.label||pid;
    try{const raw=await forge("result","platform",{plat,platformId:pid,title:orig.title,hook:orig.hook,dialogues:orig.scenes?.map(s=>s.dialogue),cta:orig.cta});setVersions(v=>({...v,[pid]:pj(raw)}));setSel(pid);}catch{}
    setRepLoading(false);
  }

  return(
    <div style={{display:"grid",gap:16}}>
      {showPreview&&<AnimatedPreview script={script} onClose={()=>setShowPreview(false)}/>}
      {extraTop}
      {/* Hero */}
      <div style={{background:C.coral,borderRadius:14,padding:22,position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",right:-16,top:-16,width:80,height:80,borderRadius:"50%",background:"rgba(255,255,255,.08)"}}/>
        <SL ch="腳本標題"/>
        <div style={{fontSize:19,fontWeight:900,color:C.white,lineHeight:1.25,letterSpacing:"-.4px",marginBottom:10,fontFamily:"DM Serif Display,serif"}}>{script.title}</div>
        <div style={{background:"rgba(255,255,255,.15)",borderRadius:9,padding:"9px 13px",marginBottom:10}}>
          <SL ch="開頭鉤子"/>
          <div style={{fontSize:14,color:C.white,fontStyle:"italic",lineHeight:1.5,fontFamily:"DM Serif Display,serif"}}>「{script.hook}」</div>
        </div>
        {/* Animated Preview Button */}
        <button onClick={()=>setShowPreview(true)} style={{background:"rgba(255,255,255,.2)",border:"1.5px solid rgba(255,255,255,.4)",color:C.white,padding:"8px 18px",borderRadius:8,fontSize:12.5,fontWeight:700,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:6,backdropFilter:"blur(4px)",transition:"all .2s"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,.3)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,.2)"}>
          ▶️ 動態預覽腳本
        </button>
      </div>

      {/* Scenes */}
      <div><SL ch="📽 分鏡腳本"/><div style={{display:"grid",gap:9}}>{script.scenes?.map((s,i)=><SceneCard key={i} scene={s} idx={i}/>)}</div></div>

      {script.cta&&<Card style={{borderColor:C.violet,background:C.violetl}}><SL ch="🎯 CTA"/><div style={{fontSize:14,color:C.violet,fontStyle:"italic",fontFamily:"DM Serif Display,serif"}}>「{script.cta}」</div></Card>}

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        {[["備用鉤子",script.alt_hooks,C.gold],["標題建議",script.titles,C.jade]].map(([l,items,col])=>items&&<Card key={l} style={{borderColor:col}}><SL ch={l}/>{items.map((item,i)=><div key={i} style={{fontSize:12.5,color:C.ink,padding:"5px 0",borderBottom:i<items.length-1?`1px solid ${C.border}`:"none",lineHeight:1.4}}><span style={{color:C.mid,fontWeight:700,marginRight:5}}>{i+1}.</span>{item}</div>)}</Card>)}
      </div>

      {script.hashtags&&<div style={{display:"flex",flexWrap:"wrap",gap:5}}>{script.hashtags.map((h,i)=><span key={i} style={{background:C.violetl,color:C.violet,padding:"4px 11px",borderRadius:999,fontSize:11.5,fontWeight:600}}>#{h.replace(/^#/,"")}</span>)}</div>}

      {score&&<Card style={{background:C.paper}}><div style={{display:"flex",alignItems:"center",gap:18}}><div style={{textAlign:"center",flexShrink:0}}><div style={{fontSize:48,fontWeight:900,color:C.coral,lineHeight:1,fontFamily:"DM Serif Display,serif"}}>{score.overall}</div><div style={{fontSize:10,color:C.mid}}>綜合評分/10</div></div><div style={{flex:1}}>{score.scores&&[["🪝 Hook",score.scores.hook,C.coral],["🎵 節奏",score.scores.rhythm,C.violet],["💡 清晰",score.scores.clarity,C.gold],["❤️ 情緒",score.scores.emotion,C.rose],["📷 拍攝",score.scores.shootability,C.jade],["🎯 轉換",score.scores.conversion,C.sky]].map(([l,v,a])=>v!==undefined&&<SBar key={l} label={l} val={v} accent={a}/>)}</div></div>{score.optimized_hook&&<div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border}`}}><SL ch="✨ AI優化"/><div style={{fontSize:12.5,color:C.coral,fontStyle:"italic"}}>鉤子：「{score.optimized_hook}」</div>{score.optimized_cta&&<div style={{fontSize:12.5,color:C.violet,fontStyle:"italic",marginTop:3}}>CTA：「{score.optimized_cta}」</div>}</div>}</Card>}

      <Card><SL ch="🔄 多平台轉換"/><div style={{fontSize:11,color:C.mid,marginBottom:6}}>把寫好的這支腳本另改成其他平台版本（原版保留，不改上面選的主平台）；點選的那版會用來送出。</div><div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:6}}>{PLATFORMS.map(p=><button key={p.id} disabled={repLoading} onClick={()=>doRep(p.id)} style={{padding:"6px 12px",borderRadius:999,border:`1.5px solid ${versions[p.id]?C.violet:C.border}`,background:sel===p.id?C.violetl:C.white,color:versions[p.id]?C.violet:C.ink,fontSize:11.5,fontWeight:versions[p.id]?700:400,cursor:"pointer",transition:"all .15s",fontFamily:"inherit"}}>{p.icon} {p.label}{versions[p.id]?" ✓":""}</button>)}</div>{repLoading&&<div style={{textAlign:"center",padding:"12px 0",color:C.mid,fontSize:12.5}}>轉換中...</div>}{Object.keys(versions).length>0&&<><SL ch="版本（選中的那版 = 送出／複製用）"/><div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>{["original",...Object.keys(versions)].map(id=><button key={id} onClick={()=>setSel(id)} style={{padding:"6px 12px",borderRadius:8,border:`1.5px solid ${sel===id?C.violet:C.border}`,background:sel===id?C.violet:C.white,color:sel===id?C.white:C.ink,fontSize:11.5,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{id==="original"?"原版":PLATFORMS.find(p=>p.id===id)?.label||id}</button>)}</div></>}{sel!=="original"&&versions[sel]&&<div style={{background:C.violetl,borderRadius:9,padding:12}}><div style={{fontSize:13.5,fontWeight:800,color:C.violet,marginBottom:3}}>{versions[sel].title}</div><div style={{fontSize:12.5,color:C.violet,fontStyle:"italic",marginBottom:7}}>「{versions[sel].hook}」</div>{versions[sel].scenes?.map((s,i)=><div key={i} style={{fontSize:11.5,color:C.ink,padding:"4px 0",borderBottom:`1px solid rgba(124,92,252,.1)`}}><b style={{color:C.violet}}>【{s.time}】</b> {s.dialogue}</div>)}{versions[sel].hashtags?.length>0&&<div style={{marginTop:7,fontSize:11.5,color:C.violet}}>{hashtagLine(versions[sel].hashtags)}</div>}{versions[sel].key_changes&&<div style={{marginTop:7,fontSize:11.5,color:C.mid,background:C.white,borderRadius:6,padding:"6px 9px"}}><b>與原版差異：</b>{versions[sel].key_changes}</div>}<div style={{display:"flex",gap:8,marginTop:9}}><GBtn ch="🔁 重新轉換" onClick={()=>doRep(sel,true)} style={{padding:"7px 12px"}}/></div></div>}{Object.keys(versions).length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:10}}>{["original",...Object.keys(versions)].map(id=><GBtn key={id} ch={copiedId===id?"✅ 已複製":`📋 複製${id==="original"?"原版":(PLATFORMS.find(p=>p.id===id)?.label||id)}`} onClick={()=>copyVersion(id)} style={{padding:"7px 12px"}}/>)}</div>}</Card>

      <SendToVideoButton build={()=>handoffFromScript(cur,{customScenes,characterRefs:sbCharacterRefs})}/>
      <SendToSocial title={cur?.title||"腳本"} text={[cur?.title,cur?.hook,...(cur?.scenes||[]).map(sc=>sc.dialogue).filter(Boolean),cur?.cta,hashtagLine(cur?.hashtags||[])].filter(Boolean).join("\n")}/>
      <div style={{display:"flex",gap:9}}><GBtn ch={copiedId===sel?"✅ 已複製":"📋 複製腳本"} onClick={()=>copyVersion(sel)} style={{flex:1,padding:"11px"}}/><PBtn ch="重新開始 →" onClick={onReset} full style={{flex:1}}/></div>
    </div>
  );
}

/* ── BRAND STORY MODULE ── */
function BrandStoryModule({brand}){
  const[form,setForm]=useState({name:"",founder:"",founded:"",problem:"",mission:"",turning_point:"",impact:"",tone:"溫柔親切"});
  const[type,setType]=useState("brand");
  const[loading,setLoading]=useState(false);
  const[result,setResult]=useState(null);
  const[copied,setCopied]=useState(false);
  const types=[{id:"brand",label:"品牌故事",icon:"🏢"},{id:"founder",label:"創辦人故事",icon:"👤"},{id:"why",label:"為什麼創業",icon:"💡"},{id:"customer",label:"客戶見證故事",icon:"❤️"}];
  async function doGen(){
    if(!form.name)return;setLoading(true);setResult(null);
    try{const raw=await forge("brand_story","gen",{kind:types.find(t=>t.id===type)?.label,...form});
      const s=pj(raw);setResult(s);
      saveHistory({tag:"品牌故事",title:s.title,hook:s.hook,script:s});
    }catch{}setLoading(false);
  }
  return(
    <div style={{display:"grid",gap:18}}>
      {!result&&<><div><h2 style={{fontSize:19,fontWeight:900,color:C.black,fontFamily:"DM Serif Display,serif",marginBottom:3}}>品牌故事腳本</h2><p style={{fontSize:12.5,color:C.mid}}>把品牌或創辦人的真實故事，轉成能打動人心的影片腳本</p></div>
      <div><SL ch="故事類型"/><div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:7}}>{types.map(t=><button key={t.id} onClick={()=>setType(t.id)} style={{padding:"12px 6px",borderRadius:10,border:`2px solid ${type===t.id?C.coral:C.border}`,background:type===t.id?C.corallt:C.white,cursor:"pointer",textAlign:"center",fontFamily:"inherit",transition:"all .15s"}}><div style={{fontSize:18,marginBottom:3}}>{t.icon}</div><div style={{fontSize:10.5,fontWeight:type===t.id?700:400,color:type===t.id?C.coral:C.ink,lineHeight:1.2}}>{t.label}</div></button>)}</div></div>
      {[["品牌/人物名稱 *","name","text","例如：小林手工蠟燭"],["創辦人/主角","founder","text","例如：林小姐，前金融業工作者"],["成立背景","founded","text","例如：2020年疫情期間"],["解決的問題","problem","area","例如：市場上找不到無香料、對敏感肌友善的蠟燭"],["品牌使命","mission","text","例如：讓每個家都有屬於自己的溫暖氣息"],["最關鍵的轉捩點","turning_point","area","例如：第一個客戶的一封信改變了我的想法..."],["目前的影響力或成果","impact","text","例如：三年內服務3000位客戶，回購率85%"]].map(([l,k,type,ph])=><div key={k}><SL ch={l}/>{type==="area"?<TA value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})} placeholder={ph} rows={3}/>:<IN value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})} placeholder={ph}/>}</div>)}
      <div><SL ch="語氣"/><div style={{display:"flex",flexWrap:"wrap",gap:5}}>{TONES.map(t=><Pill key={t} label={t} active={form.tone===t} onClick={()=>setForm({...form,tone:t})}/>)}</div></div>
      {loading&&<Spin label="AI 正在撰寫品牌故事腳本..."/>}
      {!loading&&<PBtn ch="📰 生成品牌故事腳本 →" onClick={doGen} disabled={!form.name} full/>}</>}
      {result&&!loading&&<div>
        {result.key_message&&<Card style={{marginBottom:14,background:C.corallt,borderColor:C.coral}}><SL ch="核心訊息"/><div style={{fontSize:14,color:C.coral,fontWeight:700}}>{result.key_message}</div></Card>}
        {result.story_arc&&<Card style={{marginBottom:14,background:C.goldlt,borderColor:C.gold}}><SL ch="📖 故事弧線"/>
          {[["開場情境",result.story_arc.opening],["遇到困難",result.story_arc.conflict],["轉捩點",result.story_arc.turning_point],["解決成長",result.story_arc.resolution],["邀請觀眾",result.story_arc.invitation]].map(([l,v],i)=><div key={l} style={{display:"flex",gap:10,padding:"7px 0",borderBottom:i<4?`1px solid rgba(240,165,0,.15)`:"none",alignItems:"flex-start"}}><div style={{width:20,height:20,borderRadius:"50%",background:C.gold,color:C.white,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,flexShrink:0}}>{i+1}</div><div><div style={{fontSize:10,color:C.mid,fontWeight:700,marginBottom:1}}>{l}</div><div style={{fontSize:12.5,color:C.ink}}>{v}</div></div></div>)}
        </Card>}
        <ScriptResult script={result} onReset={()=>setResult(null)} autoSaveTag="品牌故事"/>
      </div>}
    </div>
  );
}

/* ── SALES SCRIPT MODULE ── */
function SalesModule(){
  const[product,setProduct]=useState("");
  const[salesType,setSalesType]=useState("cold_call");
  const[objections,setObjections]=useState("");
  const[loading,setLoading]=useState(false);
  const[result,setResult]=useState(null);
  const[copied,setCopied]=useState(false);
  const salesTypes=[{id:"cold_call",label:"陌生開發電話",icon:"📞"},{id:"followup",label:"跟進追售",icon:"🔄"},{id:"face",label:"面對面銷售",icon:"🤝"},{id:"dm",label:"私訊/聊天室",icon:"💬"},{id:"close",label:"臨門一腳成交",icon:"🎯"}];
  async function doGen(){
    if(!product)return;setLoading(true);setResult(null);
    try{const raw=await forge("sales","gen",{kind:salesTypes.find(t=>t.id===salesType)?.label,product,objections});
      setResult(pj(raw));saveHistory({tag:"銷售對話",title:result?.title||product,hook:result?.opening,script:{title:product,scenes:[],cta:result?.close_lines?.[0]}});
    }catch{}setLoading(false);
  }
  return(
    <div style={{display:"grid",gap:18}}>
      {!result&&<><div><h2 style={{fontSize:19,fontWeight:900,color:C.black,fontFamily:"DM Serif Display,serif",marginBottom:3}}>銷售對話腳本</h2><p style={{fontSize:12.5,color:C.mid}}>生成開場白、探索問題、處理異議、成交語的完整銷售腳本</p></div>
      <div><SL ch="銷售場景"/><div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:7}}>{salesTypes.map(t=><button key={t.id} onClick={()=>setSalesType(t.id)} style={{padding:"12px 6px",borderRadius:10,border:`2px solid ${salesType===t.id?C.coral:C.border}`,background:salesType===t.id?C.corallt:C.white,cursor:"pointer",textAlign:"center",fontFamily:"inherit",transition:"all .15s"}}><div style={{fontSize:18,marginBottom:3}}>{t.icon}</div><div style={{fontSize:10.5,fontWeight:salesType===t.id?700:400,color:salesType===t.id?C.coral:C.ink,lineHeight:1.2}}>{t.label}</div></button>)}</div></div>
      <div><SL ch="產品/服務 *"/><TA value={product} onChange={e=>setProduct(e.target.value)} placeholder="詳細描述你的產品或服務、目標客群、價格..." rows={4}/></div>
      <div><SL ch="客戶常見異議"/><IN value={objections} onChange={e=>setObjections(e.target.value)} placeholder="例如：太貴了、我需要再考慮、現在沒有預算..."/></div>
      {loading&&<Spin label="AI 正在生成銷售腳本..."/>}
      {!loading&&<PBtn ch="💰 生成銷售腳本 →" onClick={doGen} disabled={!product} full/>}</>}
      {result&&!loading&&<div style={{display:"grid",gap:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><h2 style={{fontSize:17,fontWeight:900,color:C.black,fontFamily:"DM Serif Display,serif",margin:0}}>{result.title}</h2><div style={{display:"flex",gap:7}}><GBtn ch={copied?"✅ 已複製":"📋 複製全稿"} onClick={()=>{navigator.clipboard.writeText(result.full_script||"");setCopied(true);setTimeout(()=>setCopied(false),2000);}}/><GBtn ch="重新生成" onClick={()=>setResult(null)}/></div></div>
        <Card style={{background:C.corallt,borderColor:C.coral}}><SL ch="🎤 開場白"/><div style={{fontSize:13.5,color:C.black,lineHeight:1.7,fontFamily:"DM Serif Display,serif",fontStyle:"italic"}}>「{result.opening}」</div></Card>
        <Card><SL ch="🔍 探索痛點問題"/>
          {result.pain_discovery?.map((q,i)=><div key={i} style={{display:"flex",gap:8,alignItems:"flex-start",padding:"6px 0",borderBottom:i<result.pain_discovery.length-1?`1px solid ${C.border}`:"none"}}><div style={{width:18,height:18,borderRadius:"50%",background:C.violet,color:C.white,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,flexShrink:0}}>{i+1}</div><div style={{fontSize:12.5,color:C.ink,fontStyle:"italic"}}>「{q}」</div></div>)}
        </Card>
        {result.objection_handlers&&<Card><SL ch="🛡 異議處理手冊"/>
          {result.objection_handlers.map((o,i)=><div key={i} style={{padding:"10px 0",borderBottom:i<result.objection_handlers.length-1?`1px solid ${C.border}`:"none"}}><div style={{display:"flex",gap:6,alignItems:"center",marginBottom:5}}><Tag ch="客戶說" c={C.rose} bg={C.roselt} small/><div style={{fontSize:12.5,color:C.rose,fontStyle:"italic"}}>「{o.objection}」</div></div><div style={{display:"flex",gap:6,alignItems:"flex-start",marginBottom:4}}><Tag ch="你說" c={C.jade} bg={C.jadelt} small/><div style={{fontSize:12.5,color:C.ink}}>{o.response}</div></div><div style={{fontSize:11.5,color:C.mid,paddingLeft:4}}>→ 追問：{o.follow_up}</div></div>)}
        </Card>}
        {result.close_lines&&<Card style={{borderColor:C.jade,background:C.jadelt}}><SL ch="🎯 成交語"/>
          {result.close_lines.map((l,i)=><div key={i} style={{fontSize:13,color:C.ink,padding:"5px 0",borderBottom:i<result.close_lines.length-1?`1px solid rgba(0,168,120,.15)`:"none",fontStyle:"italic"}}>「{l}」</div>)}
        </Card>}
        {result.full_script&&<Card><SL ch="📜 完整腳本示範"/><div style={{fontSize:13,color:C.black,lineHeight:1.9,whiteSpace:"pre-wrap",fontFamily:"DM Serif Display,serif"}}>{result.full_script}</div></Card>}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {result.dos&&<Card style={{borderColor:C.jade,background:C.jadelt}}><SL ch="✅ 應該做"/>{result.dos.map((d,i)=><div key={i} style={{fontSize:12.5,color:C.ink,padding:"4px 0",borderBottom:i<result.dos.length-1?`1px solid rgba(0,168,120,.15)`:"none"}}>{d}</div>)}</Card>}
          {result.donts&&<Card style={{borderColor:C.rose,background:C.roselt}}><SL ch="🚫 不要做"/>{result.donts.map((d,i)=><div key={i} style={{fontSize:12.5,color:C.ink,padding:"4px 0",borderBottom:i<result.donts.length-1?`1px solid rgba(232,54,111,.15)`:"none"}}>{d}</div>)}</Card>}
        </div>
      </div>}
    </div>
  );
}

/* ── SPEECH MODULE ── */
function SpeechModule(){
  const[topic,setTopic]=useState("");const[duration,setDuration]=useState("10分鐘");const[audience,setAudience]=useState("");const[style,setStyle]=useState("TED風格");const[loading,setLoading]=useState(false);const[result,setResult]=useState(null);const[copied,setCopied]=useState(false);
  const styles=["TED風格","企業演講","激勵演講","學術報告","婚禮致詞","頒獎典禮"];
  async function doGen(){
    if(!topic)return;setLoading(true);setResult(null);
    try{const raw=await forge("speech","gen",{style,topic,duration,audience});
      setResult(pj(raw));
    }catch{}setLoading(false);
  }
  return(
    <div style={{display:"grid",gap:18}}>
      {!result&&<><div><h2 style={{fontSize:19,fontWeight:900,color:C.black,fontFamily:"DM Serif Display,serif",marginBottom:3}}>演講腳本</h2><p style={{fontSize:12.5,color:C.mid}}>TED風格、企業演講、激勵演講的完整腳本，含結構與交付技巧</p></div>
      <div><SL ch="演講主題 *"/><IN value={topic} onChange={e=>setTopic(e.target.value)} placeholder="例如：失敗如何成為我最好的老師"/></div>
      <div><SL ch="演講風格"/><div style={{display:"flex",flexWrap:"wrap",gap:5}}>{styles.map(s=><Pill key={s} label={s} active={style===s} onClick={()=>setStyle(s)}/>)}</div></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><div><SL ch="時長"/><div style={{display:"flex",flexWrap:"wrap",gap:5}}>{["3分鐘","5分鐘","10分鐘","15分鐘","20分鐘"].map(d=><Pill key={d} label={d} active={duration===d} onClick={()=>setDuration(d)}/>)}</div></div><div><SL ch="聽眾"/><IN value={audience} onChange={e=>setAudience(e.target.value)} placeholder="例如：新創業者、業務團隊"/></div></div>
      {loading&&<Spin label="AI 正在撰寫演講腳本..."/>}
      {!loading&&<PBtn ch="🎤 生成演講腳本 →" onClick={doGen} disabled={!topic} full/>}</>}
      {result&&!loading&&<div style={{display:"grid",gap:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:11,color:C.coral,fontWeight:700,letterSpacing:1}}>演講腳本</div><h2 style={{fontSize:17,fontWeight:900,color:C.black,fontFamily:"DM Serif Display,serif",margin:"2px 0 0"}}>{result.title}</h2><div style={{fontSize:12.5,color:C.mid,marginTop:2}}>{result.tagline}</div></div><GBtn ch="重新生成" onClick={()=>setResult(null)}/></div>
        <div style={{background:C.coral,borderRadius:13,padding:18,color:C.white}}><SL ch="開場震撼句"/><div style={{fontSize:16,fontStyle:"italic",fontFamily:"DM Serif Display,serif",lineHeight:1.5}}>「{result.hook}」</div></div>
        {result.structure&&<Card style={{background:C.goldlt,borderColor:C.gold}}><SL ch="📐 演講結構"/>
          {[["開場",result.structure.opening],["核心論點",result.structure.thesis],["第一點",result.structure.point1?.title+`：${result.structure.point1?.content}`],["第二點",result.structure.point2?.title+`：${result.structure.point2?.content}`],["第三點",result.structure.point3?.title+`：${result.structure.point3?.content}`],["行動呼籲",result.structure.call_to_action],["結尾",result.structure.closing]].map(([l,v],i)=><div key={l} style={{display:"flex",gap:9,padding:"6px 0",borderBottom:i<6?`1px solid rgba(240,165,0,.15)`:"none",alignItems:"flex-start"}}><div style={{width:18,height:18,borderRadius:"50%",background:C.gold,color:C.white,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,flexShrink:0}}>{i+1}</div><div><div style={{fontSize:10,color:C.mid,fontWeight:700,marginBottom:1}}>{l}</div><div style={{fontSize:12.5,color:C.ink}}>{v}</div></div></div>)}
        </Card>}
        {result.impact_lines&&<Card style={{borderColor:C.violet,background:C.violetl}}><SL ch="💥 最有力的句子"/>{result.impact_lines.map((l,i)=><div key={i} style={{fontSize:13,color:C.violet,fontStyle:"italic",padding:"5px 0",borderBottom:i<result.impact_lines.length-1?`1px solid rgba(124,92,252,.15)`:"none",fontFamily:"DM Serif Display,serif"}}>「{l}」</div>)}</Card>}
        {result.full_script&&<Card><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><SL ch="📜 完整演講稿"/><GBtn ch={copied?"✅ 已複製":"📋 複製全稿"} onClick={()=>{navigator.clipboard.writeText(result.full_script);setCopied(true);setTimeout(()=>setCopied(false),2000);}}/></div><div style={{fontSize:13,color:C.black,lineHeight:1.9,whiteSpace:"pre-wrap",fontFamily:"DM Serif Display,serif"}}>{result.full_script}</div></Card>}
        {result.delivery_notes&&<Card style={{borderColor:C.jade,background:C.jadelt}}><SL ch="🎭 演講技巧"/>{result.delivery_notes.map((n,i)=><div key={i} style={{fontSize:12.5,color:C.ink,padding:"4px 0",borderBottom:i<result.delivery_notes.length-1?`1px solid rgba(0,168,120,.15)`:"none"}}>{n}</div>)}</Card>}
      </div>}
    </div>
  );
}

/* ── PITCH DECK MODULE ── */
function PitchModule(){
  const[form,setForm]=useState({company:"",product:"",problem:"",solution:"",market:"",traction:"",ask:""});
  const[loading,setLoading]=useState(false);const[result,setResult]=useState(null);const[copied,setCopied]=useState(false);
  async function doGen(){
    if(!form.company||!form.product)return;setLoading(true);setResult(null);
    try{const raw=await forge("pitch","gen",form);
      setResult(pj(raw));
    }catch{}setLoading(false);
  }
  return(
    <div style={{display:"grid",gap:18}}>
      {!result&&<><div><h2 style={{fontSize:19,fontWeight:900,color:C.black,fontFamily:"DM Serif Display,serif",marginBottom:3}}>Pitch Deck 演說腳本</h2><p style={{fontSize:12.5,color:C.mid}}>輸入公司資訊，生成完整投資人簡報演說稿、電梯簡報與Q&A準備</p></div>
      {[["公司名稱 *","company","text","例如：ScriptForge AI"],["產品/服務 *","product","area","描述你的產品、解決什麼問題、怎麼運作..."],["核心問題","problem","text","例如：創作者每天花3小時寫腳本，效率極低"],["你的解法","solution","text","例如：AI一鍵生成可直接拍攝的腳本"],["市場規模","market","text","例如：全球短影音市場2025年達500億美元"],["目前進展","traction","text","例如：Beta版1000用戶，月留存80%"],["募資需求","ask","text","例如：種子輪500萬，用於產品開發與市場推廣"]].map(([l,k,type,ph])=><div key={k}><SL ch={l}/>{type==="area"?<TA value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})} placeholder={ph} rows={3}/>:<IN value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})} placeholder={ph}/>}</div>)}
      {loading&&<Spin label="AI 正在生成 Pitch Deck 腳本..."/>}
      {!loading&&<PBtn ch="📊 生成Pitch腳本 →" onClick={doGen} disabled={!form.company||!form.product} full/>}</>}
      {result&&!loading&&<div style={{display:"grid",gap:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><h2 style={{fontSize:17,fontWeight:900,color:C.black,fontFamily:"DM Serif Display,serif",margin:0}}>{result.company} Pitch</h2><GBtn ch="重新生成" onClick={()=>setResult(null)}/></div>
        <div style={{background:C.coral,borderRadius:13,padding:18,color:C.white}}><SL ch="⚡ 30秒電梯簡報"/><div style={{fontSize:14,lineHeight:1.7,fontFamily:"DM Serif Display,serif",fontStyle:"italic"}}>「{result.elevator_pitch}」</div></div>
        {result.hooks&&<Card><SL ch="🪝 3種開場方式"/>{result.hooks.map((h,i)=><div key={i} style={{fontSize:12.5,color:C.ink,padding:"6px 0",borderBottom:i<result.hooks.length-1?`1px solid ${C.border}`:"none",fontStyle:"italic"}}>版本{i+1}：「{h}」</div>)}</Card>}
        {result.slides&&<Card><SL ch="📑 投影片演說稿"/>
          {result.slides.map((s,i)=><div key={i} style={{padding:"10px 0",borderBottom:i<result.slides.length-1?`1px solid ${C.border}`:"none"}}><div style={{display:"flex",gap:8,alignItems:"center",marginBottom:5}}><div style={{width:22,height:22,borderRadius:6,background:C.violet,color:C.white,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,flexShrink:0}}>{s.slide_number}</div><span style={{fontSize:13,fontWeight:700,color:C.black}}>{s.title}</span><span style={{marginLeft:"auto",fontSize:11,color:C.mid,background:C.fog,padding:"2px 7px",borderRadius:6}}>{s.timing}</span></div><div style={{fontSize:11,color:C.mid,marginBottom:3}}>核心：{s.key_message}</div><div style={{fontSize:12.5,color:C.ink,lineHeight:1.6,background:C.paper,borderRadius:7,padding:"8px 10px"}}>{s.speaking_notes}</div></div>)}
        </Card>}
        {result.qa_prep&&<Card style={{borderColor:C.gold,background:C.goldlt}}><SL ch="❓ 投資人Q&A準備"/>{result.qa_prep.map((q,i)=><div key={i} style={{padding:"8px 0",borderBottom:i<result.qa_prep.length-1?`1px solid rgba(240,165,0,.15)`:"none"}}><div style={{fontSize:12,color:C.gold,fontWeight:700,marginBottom:3}}>Q：{q.question}</div><div style={{fontSize:12.5,color:C.ink}}>A：{q.answer}</div></div>)}</Card>}
        {result.full_script&&<Card><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><SL ch="📜 完整演說稿"/><GBtn ch={copied?"✅ 已複製":"📋 複製"} onClick={()=>{navigator.clipboard.writeText(result.full_script);setCopied(true);setTimeout(()=>setCopied(false),2000);}}/></div><div style={{fontSize:13,color:C.black,lineHeight:1.9,whiteSpace:"pre-wrap"}}>{result.full_script}</div></Card>}
      </div>}
    </div>
  );
}

/* ── SEO MODULE ── */
function SEOModule({brand}){
  const[article,setArticle]=useState("");const[keyword,setKeyword]=useState("");const[platform,setPlatform]=useState("");const[loading,setLoading]=useState(false);const[result,setResult]=useState(null);
  async function doGen(){
    if(!article.trim()||!platform)return;setLoading(true);setResult(null);
    const plat=PLATFORMS.find(p=>p.id===platform)?.label||"";
    try{const raw=await forge("seo","gen",{plat,keyword,article});
      const s=pj(raw);setResult(s);saveHistory({tag:"SEO轉腳本",title:s.title,hook:s.hook,script:s});
    }catch{}setLoading(false);
  }
  const analysisCard=result?.seo_analysis&&<Card style={{background:C.jadelt,borderColor:C.jade,marginBottom:14}}><SL ch="🔍 SEO分析"/><div style={{display:"grid",gap:5}}><div><span style={{fontSize:10.5,color:C.mid}}>主要關鍵字：</span><Tag ch={result.seo_analysis.primary_keyword||keyword} c={C.jade} bg="rgba(0,168,120,.1)"/></div><div><span style={{fontSize:10.5,color:C.mid}}>搜尋意圖：</span><span style={{fontSize:12.5,color:C.ink}}>{result.seo_analysis.search_intent}</span></div><div><span style={{fontSize:10.5,color:C.mid}}>最可分享的點：</span><span style={{fontSize:12.5,color:C.jade,fontWeight:600}}>{result.seo_analysis.most_shareable_point}</span></div>{result.seo_analysis.top_insights?.map((k,i)=><div key={i}><span style={{fontSize:10.5,color:C.mid}}>洞察{i+1}：</span><span style={{fontSize:12.5,color:C.ink}}>{k}</span></div>)}</div></Card>;
  return(
    <div style={{display:"grid",gap:18}}>
      {!result&&<><div><h2 style={{fontSize:19,fontWeight:900,color:C.black,fontFamily:"DM Serif Display,serif",marginBottom:3}}>SEO文章轉腳本</h2><p style={{fontSize:12.5,color:C.mid}}>把排名好的SEO文章轉成短影音腳本，搜尋流量變觀看流量</p></div>
      <div><SL ch="目標關鍵字"/><IN value={keyword} onChange={e=>setKeyword(e.target.value)} placeholder="例如：新手學畫畫、睡眠改善方法、台北美食推薦"/></div>
      <div><SL ch="貼入SEO文章 *"/><TA value={article} onChange={e=>setArticle(e.target.value)} placeholder="貼入你的SEO文章、排名文章或部落格內容..." rows={8}/><div style={{textAlign:"right",fontSize:10.5,color:C.mid,marginTop:2}}>{article.length}字</div></div>
      <div><SL ch="目標平台 *"/><PlatGrid value={platform} onChange={setPlatform}/></div>
      {loading&&<Spin label="AI 正在分析SEO內容並生成腳本..."/>}
      {!loading&&<PBtn ch="🔍 SEO文章轉腳本 →" onClick={doGen} disabled={!article.trim()||!platform} full/>}</>}
      {result&&!loading&&<ScriptResult script={result} extraTop={analysisCard} onReset={()=>{setResult(null);setArticle("");}} autoSaveTag="SEO轉腳本"/>}
    </div>
  );
}

/* ── PREVIEW MODULE (standalone) ── */
function PreviewModule(){
  const[script,setScript]=useState("");const[parsed,setParsed]=useState(null);const[showAnim,setShowAnim]=useState(false);
  function parseScript(){
    const lines=script.split("\n").filter(s=>s.trim());
    const scenes=[];let cur=null;
    for(const line of lines){
      if(line.match(/^【.+】/)||line.match(/^\d+[\.、]/)){if(cur)scenes.push(cur);cur={time:line.replace(/^【|】$/g,""),visual:"",dialogue:line,subtitle:"",shoot_tip:"",edit_tip:""};}
      else if(cur){if(line.includes("畫面：")){cur.visual=line.replace("畫面：","");}else if(line.includes("台詞：")){cur.dialogue=line.replace("台詞：","");}else if(line.includes("字幕：")){cur.subtitle=line.replace("字幕：","");}else{cur.dialogue+=" "+line;}}
    }
    if(cur)scenes.push(cur);
    if(scenes.length===0){const dlgs=lines.filter(l=>l.trim().length>5);dlgs.forEach((d,i)=>{scenes.push({time:`場景 ${i+1}`,visual:"",dialogue:d,subtitle:d.slice(0,10),shoot_tip:"",edit_tip:""}); });}
    setParsed({title:"腳本動態預覽",hook:scenes[0]?.dialogue||"",scenes});
  }
  return(
    <div style={{display:"grid",gap:18}}>
      {showAnim&&parsed&&<AnimatedPreview script={parsed} onClose={()=>setShowAnim(false)}/>}
      <div><h2 style={{fontSize:19,fontWeight:900,color:C.black,fontFamily:"DM Serif Display,serif",marginBottom:3}}>動態腳本預覽器</h2><p style={{fontSize:12.5,color:C.mid}}>貼入任何腳本文字，AI動態呈現字幕動畫與場景切換效果，讓客戶身歷其境</p></div>
      <Card style={{background:C.corallt,borderColor:C.coral}}><SL ch="💡 使用說明"/>
        <div style={{display:"grid",gap:4}}>
          {["貼入你在任何模組生成的腳本台詞","或直接用【場景名稱】分段格式貼入","支援：畫面：/ 台詞：/ 字幕：格式自動解析","點「生成預覽」即可看到動態腳本展示"].map((t,i)=><div key={i} style={{display:"flex",gap:7,alignItems:"flex-start"}}><div style={{width:16,height:16,borderRadius:"50%",background:C.coral,color:C.white,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:800,flexShrink:0,marginTop:1}}>{i+1}</div><div style={{fontSize:12,color:C.ink}}>{t}</div></div>)}
        </div>
      </Card>
      <div><SL ch="貼入腳本文字 *"/><TA value={script} onChange={e=>setScript(e.target.value)} placeholder={`例如：\n【0-3秒】\n台詞：你畫不好，不是因為沒天分。\n字幕：不是沒天分\n\n【3-8秒】\n台詞：很多新手一開始就練錯方向。\n字幕：新手最常犯的錯`} rows={10}/></div>
      <div style={{display:"flex",gap:9}}>
        <PBtn ch="🎬 生成動態預覽" onClick={()=>{parseScript();setTimeout(()=>setShowAnim(true),100);}} disabled={!script.trim()} full/>
      </div>
      {parsed&&<div style={{textAlign:"center",padding:"10px 0",color:C.mid,fontSize:12.5}}>解析到 {parsed.scenes?.length} 個場景 · <button onClick={()=>setShowAnim(true)} style={{color:C.coral,fontWeight:700,background:"none",border:"none",cursor:"pointer",fontSize:12.5}}>再次播放 →</button></div>}
    </div>
  );
}

/* ── REMAINING MODULES (condensed) ── */

/* ── 目標受眾分類複選選擇器（Q1）：分類標籤可複選 + 每類自訂 + 常用人設一鍵套組；組成字串餵 prompt ── */
const AUDIENCE_CATS: { key: string; label: string; opts: string[]; custom?: boolean }[] = [
  { key: "age", label: "年齡層", opts: ["18–24", "25–34", "35–44", "45–54", "55+"] },
  { key: "gender", label: "性別", opts: ["女性", "男性", "不限"] },
  { key: "job", label: "職業 / 身分", opts: ["上班族", "學生", "創業 / 自雇", "家長", "退休族", "創作者"], custom: true },
  { key: "emotion", label: "情緒 / 心理狀態", opts: ["焦慮壓力", "想自我成長", "尋找療癒", "缺乏自信", "想被理解"], custom: true },
  { key: "awareness", label: "對主題的熟悉度", opts: ["完全新手", "在比較方案", "進階老手"] },
  { key: "spending", label: "消費力", opts: ["平價親民", "中等", "高端精品"] },
];
const AUDIENCE_PRESETS: { label: string; sel: Record<string, string[]> }[] = [
  { label: "想成長的年輕上班族", sel: { age: ["25–34"], gender: ["不限"], job: ["上班族"], emotion: ["想自我成長"], awareness: ["在比較方案"], spending: ["中等"] } },
  { label: "尋求療癒的家長", sel: { age: ["35–44"], gender: ["女性"], job: ["家長"], emotion: ["尋找療癒"], awareness: ["完全新手"], spending: ["中等"] } },
  { label: "想學創作的新手", sel: { age: ["25–34", "35–44"], gender: ["不限"], job: ["創作者", "上班族"], emotion: ["缺乏自信", "想自我成長"], awareness: ["完全新手"], spending: ["平價親民"] } },
];
function AudiencePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [sel, setSel] = useState<Record<string, string[]>>({});
  const [custom, setCustom] = useState<Record<string, string>>({});
  useEffect(() => { if (!value) { setSel({}); setCustom({}); } }, [value]); // 外部清空(reset/clearAll/載入範例為空)→同步清掉 chips，避免顯示與選取脫鉤
  function emit(s: Record<string, string[]>, c: Record<string, string>) {
    const parts: string[] = [];
    for (const cat of AUDIENCE_CATS) {
      const vals = [...(s[cat.key] || [])];
      const cv = (c[cat.key] || "").trim(); if (cv) vals.push(cv);
      if (vals.length) parts.push(`${cat.label}：${vals.join("、")}`);
    }
    onChange(parts.join("；"));
  }
  function toggle(k: string, o: string) { const cur = sel[k] || []; const next = cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o]; const ns = { ...sel, [k]: next }; setSel(ns); emit(ns, custom); }
  function setC(k: string, v: string) { const nc = { ...custom, [k]: v }; setCustom(nc); emit(sel, nc); }
  function applyPreset(p: { sel: Record<string, string[]> }) { setSel(p.sel); setCustom({}); emit(p.sel, {}); }
  function clearAll() { setSel({}); setCustom({}); onChange(""); }
  const hasSel = Object.values(sel).some((a) => a && a.length > 0) || Object.values(custom).some((v) => (v || "").trim());
  return (
    <div style={{ display: "grid", gap: 11 }}>
      {AUDIENCE_CATS.map((cat) => (
        <div key={cat.key}>
          <div style={{ fontSize: 11.5, color: C.mid, marginBottom: 5 }}>{cat.label}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            {cat.opts.map((o) => <Pill key={o} label={o} active={(sel[cat.key] || []).includes(o)} onClick={() => toggle(cat.key, o)} />)}
            {cat.custom && <input value={custom[cat.key] || ""} onChange={(e) => setC(cat.key, e.target.value)} placeholder="+ 自訂" style={{ padding: "6px 11px", borderRadius: 999, border: `1.5px dashed ${C.border}`, fontSize: 12, width: 96, fontFamily: "inherit", outline: "none", color: C.ink, background: C.white, boxSizing: "border-box" }} />}
          </div>
        </div>
      ))}
      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
        <div style={{ fontSize: 11.5, color: C.mid, marginBottom: 6 }}>⚡ 常用人設（一鍵套整組）</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {AUDIENCE_PRESETS.map((p) => <button key={p.label} type="button" onClick={() => applyPreset(p)} style={{ padding: "6px 12px", borderRadius: 8, border: `1.5px solid ${C.violet}`, background: C.violetl, color: C.violet, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{p.label}</button>)}
          {hasSel && <button type="button" onClick={clearAll} style={{ padding: "6px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.white, color: C.mid, fontSize: 11.5, cursor: "pointer", fontFamily: "inherit" }}>清除</button>}
        </div>
        {hasSel && <div style={{ marginTop: 8, fontSize: 11, color: C.jade, background: C.jadelt, borderRadius: 6, padding: "6px 9px", lineHeight: 1.5 }}>✅ 已選：{value}</div>}
      </div>
    </div>
  );
}

function ManualModule({brand}){
  const[st,setSt]=useState("brief");const[brief,setBrief]=useState({topic:"",platform:"",duration:"",goal:"",tone:"",cta:"",audience:""});const[angles,setAngles]=useState(null);const[script,setScript]=useState(null);const[score,setScore]=useState(null);const[loading,setLoading]=useState(false);const[err,setErr]=useState("");
  const plat=PLATFORMS.find(p=>p.id===brief.platform)?.label||"";
  const EXAMPLES=[{topic:"新手如何開始學畫畫",platform:"reels",duration:"60秒",goal:"吸粉增長",tone:"溫柔親切",cta:"追蹤頻道",audience:"25-35歲想學創作的上班族"},{topic:"三個讓你睡更好的習慣",platform:"tiktok",duration:"30秒",goal:"教育受眾",tone:"專業權威",cta:"留言互動",audience:"睡眠品質差的上班族"}];
  // 短劇 Story Bible（選填）：org 選了才去查已核准的 bible 清單；沒選 bible → sbDoc 是 undefined，
  // 下面 prompt 注入與連續性檢查全部原樣跳過，行為與這功能存在之前完全一致（fail-closed，非預設開）。
  const[sbOrgId,setSbOrgId]=useState("");const[sbSeriesId,setSbSeriesId]=useState("");const[continuityCheck,setContinuityCheck]=useState<ContinuityCheck|null>(null);
  // The loaded client (載入客戶) is the Story Bible's organization; the picker shows only when no client is loaded.
  useEffect(()=>{if(SF_BRAND_ORG&&sbOrgId!==SF_BRAND_ORG){setSbOrgId(SF_BRAND_ORG);setSbSeriesId("");}});
  const{bibles:sbBibles,status:sbStatus}=useStoryBibles(sbOrgId);
  const sbDoc=sbBibles.find(b=>b.series_id===sbSeriesId)?.document_json;
  const sbBlock=sbDoc?storyBibleContextBlock(sbDoc):"";
  const briefFields={topic:brief.topic,plat,duration:brief.duration,audience:brief.audience,goal:brief.goal,tone:brief.tone,cta:brief.cta,sbBlock};
  // 角色定裝照解析：Bible characters[].referenceAssetIds → 實際 URL；localPortraitRefs 疊在上面——
  // 本輪自動生成的定裝照立刻可用（不必等 useStoryBibles 重新載入，新版也還是 draft 不會出現在已核准清單）。
  const sbRefAssets=useReferenceAssets(sbOrgId);
  const[localPortraitRefs,setLocalPortraitRefs]=useState<Record<string,string>>({});
  const[portraitStatus,setPortraitStatus]=useState<{loading?:boolean;generated?:number;error?:string}|null>(null);
  // 切換 org/series 時讓進行中的 autoGeneratePortraits 失效（比對這個 token）——防止使用者中途換
  // 租戶/Bible，前一輪還在跑的角色定裝照 fetch 結束後把「舊租戶角色 id → 新租戶正在用的 URL」寫進
  // sbCharacterRefs（id 是各自文件內的短字串、無跨文件唯一性保證，撞名即可能把別租戶的定裝照套到
  // 這個租戶的場景生圖）。
  const portraitGenTokenRef=useRef(0);
  useEffect(()=>{portraitGenTokenRef.current++;setLocalPortraitRefs({});setPortraitStatus(null);},[sbOrgId,sbSeriesId]);
  const sbCharacterRefs=useMemo(()=>({...buildCharacterRefMap(sbDoc,sbRefAssets),...localPortraitRefs}),[sbDoc,sbRefAssets,localPortraitRefs]);
  async function doAngles(){if(!brief.topic||!brief.platform){setErr("請填入主題並選擇平台");return;}setErr("");setLoading(true);setAngles(null);setSt("angles");try{const raw=await forge("manual","angles",briefFields);setAngles(pj(raw).angles);}catch{setErr("失敗，請再試");setSt("brief");}setLoading(false);}
  // 角色 id→名字對照：sbDoc 存在時要求 Claude 用 Bible 的 id（非角色名字）回填每場景 character_id，
  // 場景沒有明確角色登場則留空——這個 id 是後面畫面一致性生圖/自動定裝照的唯一對應鍵。
  const characterIdHint=sbDoc&&sbDoc.characters?.length>0?`\n角色 ID 對照（scenes 的 character_id 欄位須填這裡的 id，不要填角色名字；場景沒有明確角色登場則留空字串）：${sbDoc.characters.map(c=>`${c.id}=${c.name}`).join("、")}\n`:"";
  const sceneCharacterField=sbDoc?`,"character_id":"(見角色ID對照，無角色則空字串)"`:"";
  const MAX_AUTO_PORTRAITS=5; // 成本閘：一輪腳本最多自動生 5 張定裝照，短劇常見角色數遠低於此
  async function autoGeneratePortraits(scenes: any[], org: string, doc: StoryBibleDoc){
    const token=portraitGenTokenRef.current;
    const usedIds=new Set((scenes||[]).map((s: any)=>s?.character_id).filter(Boolean));
    // 「缺定裝照」看 referenceAssetIds 是否為空，不是看 sbCharacterRefs 有沒有解出 URL——後者在
    // org 素材超過 /api/video/reference-assets 的 200 筆上限時，已存在的參考照可能解不出 URL，
    // 誤判成「缺」會重複生成、浪費 Replicate 額度。
    const missing=(doc.characters||[]).filter(c=>usedIds.has(c.id)&&(!c.referenceAssetIds||c.referenceAssetIds.length===0)).slice(0,MAX_AUTO_PORTRAITS);
    if(missing.length===0)return;
    setPortraitStatus({loading:true});
    const generated: Record<string,string>={};const newRefIds: Record<string,string>={};
    // 角色名字沒有內建性別/外觀線索（"小雨"、"主角"對生圖模型是中性字串）——2026-09-12 真實測試
    // 證實：完全沒有描述時 flux-schnell 會賭一個性別，操作者明明在「不可違反的設定」寫了外觀鎖定
    // 句（如「小雨的髮型與穿著...短髮、米色針織外套」）卻沒被用到。從 prohibitions 撈出提到這個
    // 角色名字的句子塞進定裝照 prompt，讓這條規則真的生效，而不是只存在文件裡沒人讀。
    const prohibitions=doc.continuity?.prohibitions||[];
    for(const c of missing){
      const description=prohibitions.filter(p=>p&&c.name&&p.includes(c.name)).join("；")||undefined;
      try{
        const r=await fetch("/api/video/story-bibles/generate-portrait",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({organizationId:org,name:c.name,role:c.role,description})});
        const j=await r.json();
        if(j.ok){generated[c.id]=j.imageUrl;newRefIds[c.id]=j.assetId;}
      }catch{/* 單一角色失敗不擋其他角色 */}
    }
    if(portraitGenTokenRef.current!==token)return; // 使用者中途換了 org/series，這輪結果不再適用，直接丟棄不寫入任何 state
    if(Object.keys(generated).length===0){setPortraitStatus({error:"定裝照自動生成失敗（可到 Story Bible 頁手動補角色參考素材）"});return;}
    setLocalPortraitRefs(prev=>({...prev,...generated}));
    try{
      const nextDoc={...doc,characters:(doc.characters||[]).map(c=>newRefIds[c.id]?{...c,referenceAssetIds:[...(c.referenceAssetIds||[]),newRefIds[c.id]]}:c)};
      const r=await fetch("/api/video/story-bibles",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({organizationId:org,storyBible:nextDoc})});
      const j=await r.json();
      if(portraitGenTokenRef.current!==token)return;
      setPortraitStatus({generated:Object.keys(generated).length,error:j.ok?undefined:"已生成定裝照但存回 Bible 新版本失敗，需到 Story Bible 頁手動補上"});
    }catch{if(portraitGenTokenRef.current===token)setPortraitStatus({generated:Object.keys(generated).length,error:"已生成定裝照但存回 Bible 新版本失敗，需到 Story Bible 頁手動補上"});}
  }
  async function doScript(angle){setSt("script");setScript(null);setScore(null);setContinuityCheck(null);setPortraitStatus(null);setLoading(true);try{const raw=await forge("manual","script",{...briefFields,angleName:angle.name,angleHook:angle.hook,characterIdHint,sceneCharacterField});const s=pj(raw);setScript(s);const sr=await forge("result","score",{hook:s.hook,scenes:s.scenes?.length,cta:s.cta});setScore(pj(sr));if(sbDoc){setContinuityCheck({loading:true});checkStoryBibleContinuity(s,sbDoc).then(setContinuityCheck);void autoGeneratePortraits(s.scenes||[],sbOrgId,sbDoc);}}catch{}setLoading(false);}
  function reset(){setSt("brief");setAngles(null);setScript(null);setScore(null);setContinuityCheck(null);setPortraitStatus(null);setBrief({topic:"",platform:"",duration:"",goal:"",tone:"",cta:"",audience:""});}
  const storyBiblePicker=(<Card style={{borderColor:sbDoc?C.violet:C.border,background:sbDoc?C.violetl:C.white}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}><SL ch="📖 套用短劇 Story Bible（選填，加強角色／場景連續性）"/></div><div style={{fontSize:11,color:C.mid,lineHeight:1.6,marginBottom:sbOrgId?8:0}}>選了之後：腳本會自動套用角色設定＋跑連續性檢查；角色沒有定裝照時系統會自動生一張存回 Bible；送去做影片後，有定裝照的角色場景會自動維持長相一致，並在草稿頁多一個比對面板。完整流程說明見「📖 短劇 Story Bible」分頁。</div>{!SF_BRAND_ORG&&<div style={{maxWidth:340,marginBottom:sbOrgId?8:0}}><OrganizationPicker value={sbOrgId} onChange={(v)=>{setSbOrgId(v);setSbSeriesId("");}} disabled={portraitStatus?.loading}/></div>}{sbOrgId&&sbStatus==="loading"&&<div style={{fontSize:11.5,color:C.mid}}>載入 Story Bible 清單…</div>}{sbOrgId&&sbStatus==="ready"&&sbBibles.length===0&&<div style={{fontSize:11.5,color:C.mid}}>此租戶還沒有已核准的 Story Bible——可到上方「📖 短劇 Story Bible」分頁建立。</div>}{sbOrgId&&sbBibles.length>0&&<select value={sbSeriesId} onChange={e=>setSbSeriesId(e.target.value)} disabled={portraitStatus?.loading} style={{width:"100%",padding:"7px 9px",borderRadius:7,border:`1.5px solid ${C.border}`,background:C.white,color:C.ink,fontSize:12,fontFamily:"inherit"}}><option value="">不套用 Story Bible</option>{sbBibles.map(b=><option key={b.id} value={b.series_id}>{b.series_id}（r{b.revision}，{b.document_json?.episode?.episodeId}）</option>)}</select>}{portraitStatus?.loading&&<div style={{fontSize:10.5,color:C.mid,marginTop:4}}>🎨 定裝照生成中，暫時鎖定租戶/Bible 切換避免跨租戶誤用…</div>}{sbDoc&&<div style={{marginTop:8,fontSize:11.5,color:C.ink,lineHeight:1.6}}><div><b>角色：</b>{(sbDoc.characters||[]).map(c=>c.name).join("、")||"（無）"}</div><div><b>場景：</b>{(sbDoc.locations||[]).map(l=>l.name).join("、")||"（無）"}</div>{(sbDoc.continuity?.prohibitions||[]).length>0&&<div style={{color:C.rose}}><b>不可違反：</b>{sbDoc.continuity.prohibitions.join("；")}</div>}</div>}</Card>);
  if(st==="brief")return(<div style={{display:"grid",gap:18}}><div><h2 style={{fontSize:19,fontWeight:900,color:C.black,fontFamily:"DM Serif Display,serif",marginBottom:3}}>手動生成腳本</h2><p style={{fontSize:12.5,color:C.mid}}>填入需求，AI完成策略、分鏡、評分</p>{brand?.voice&&<div style={{marginTop:6,padding:"5px 11px",background:C.jadelt,borderRadius:6,fontSize:11.5,color:C.jade,fontWeight:700,display:"inline-block"}}>✅ 已套用品牌語氣：{brand.name||"我的品牌"}</div>}</div><div style={{display:"flex",gap:6,flexWrap:"wrap"}}><span style={{fontSize:11,color:C.mid,alignSelf:"center"}}>範例：</span>{EXAMPLES.map((ex,i)=><button key={i} onClick={()=>setBrief(ex)} style={{padding:"4px 10px",borderRadius:7,border:`1.5px solid ${C.border}`,background:C.white,color:C.ink,fontSize:11.5,cursor:"pointer",fontFamily:"inherit"}} onMouseEnter={e=>e.currentTarget.style.borderColor=C.coral} onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>{ex.topic.slice(0,12)}...</button>)}</div><div><SL ch="主題 *"/><TA value={brief.topic} onChange={e=>setBrief({...brief,topic:e.target.value})} placeholder="例如：新手如何開始學畫畫..." rows={2}/></div><div><SL ch="平台 *"/><PlatGrid value={brief.platform} onChange={v=>setBrief({...brief,platform:v})}/></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>{[["影片長度","duration",DURATIONS],["內容目的","goal",GOALS],["語氣風格","tone",TONES],["觀眾行動","cta",CTAS]].map(([l,k,opts]: any)=><div key={k}><SL ch={l}/><div style={{display:"flex",flexWrap:"wrap",gap:5}}>{opts.map(o=><Pill key={o} label={o} active={brief[k]===o} onClick={()=>setBrief({...brief,[k]:o})}/>)}</div></div>)}</div><div><SL ch="目標受眾"/><AudiencePicker value={brief.audience} onChange={(v)=>setBrief({...brief,audience:v})}/></div>{storyBiblePicker}{err&&<div style={{padding:"7px 11px",background:C.roselt,border:`1.5px solid ${C.rose}`,borderRadius:7,fontSize:12.5,color:C.rose,fontWeight:600}}>{err}</div>}<PBtn ch="產生腳本角度 →" onClick={doAngles} disabled={!brief.topic||!brief.platform} full/></div>);
  if(st==="angles")return(<div><div style={{display:"flex",alignItems:"center",gap:9,marginBottom:18}}><GBtn ch="← 返回" onClick={()=>setSt("brief")}/><h2 style={{fontSize:17,fontWeight:900,color:C.black,fontFamily:"DM Serif Display,serif",margin:0}}>選擇腳本角度</h2></div>{loading&&!angles&&<Spin label="AI 正在生成角度..."/>}{angles&&<div style={{display:"grid",gap:11}}>{angles.map(a=><div key={a.id} onClick={()=>doScript(a)} style={{background:C.white,border:`2px solid ${C.border}`,borderRadius:13,overflow:"hidden",cursor:"pointer",transition:"all .2s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=C.coral;e.currentTarget.style.boxShadow="0 3px 14px color-mix(in srgb, var(--accent) 16%, transparent)";}} onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.boxShadow="none";}}><div style={{padding:"10px 15px",borderBottom:`1.5px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{display:"flex",alignItems:"center",gap:7}}><Tag ch={a.type} c={C.violet} bg={C.violetl}/><span style={{fontSize:13.5,fontWeight:800,color:C.black,fontFamily:"DM Serif Display,serif"}}>{a.name}</span></div><div style={{fontSize:15,fontWeight:900,color:C.coral}}>{a.score}<span style={{fontSize:9,color:C.mid}}>/10</span></div></div><div style={{padding:"12px 15px"}}><div style={{background:C.violetl,borderRadius:8,padding:"8px 11px",marginBottom:9}}><div style={{fontSize:9,color:C.violet,fontWeight:700,letterSpacing:1,marginBottom:3}}>開頭鉤子</div><div style={{fontSize:13,color:C.violet,fontStyle:"italic",fontFamily:"DM Serif Display,serif"}}>「{a.hook}」</div></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}><div><div style={{fontSize:9.5,color:C.mid,marginBottom:1}}>核心概念</div><div style={{fontSize:12,color:C.ink}}>{a.core}</div></div><div><div style={{fontSize:9.5,color:C.mid,marginBottom:1}}>為什麼有效</div><div style={{fontSize:12,color:C.ink}}>{a.why}</div></div></div><div style={{marginTop:9,paddingTop:8,borderTop:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}><Tag ch={`⚠ ${a.risk}`} c={C.rose} bg={C.roselt} small/><span style={{fontSize:11.5,color:C.coral,fontWeight:700}}>選擇此角度 →</span></div></div></div>)}</div>}</div>);
  if(st==="script"){
    const ccPanel=continuityCheck&&(
      continuityCheck.loading?<Card style={{borderColor:C.violet,background:C.violetl}}><SL ch="📖 Story Bible 連續性檢查中..."/></Card>:
      continuityCheck.error?<Card style={{borderColor:C.mid}}><SL ch="📖 Story Bible 連續性檢查"/><div style={{fontSize:12,color:C.mid}}>檢查失敗（AI 回應格式錯誤），未影響腳本本身——請自行覆核連續性。</div></Card>:
      continuityCheck.ok===false&&(continuityCheck.violations?.length??0)>0?<Card style={{borderColor:C.rose,background:C.roselt}}><SL ch={`⚠️ Story Bible 連續性檢查：發現 ${continuityCheck.violations!.length} 個可能違反`}/><div style={{display:"grid",gap:5,marginTop:6}}>{continuityCheck.violations!.map((v,i)=><div key={i} style={{fontSize:12,color:C.ink}}>{v.sceneIndex>=0?`場景${v.sceneIndex+1}：`:""}<b style={{color:C.rose}}>{v.rule}</b> — {v.reason}</div>)}</div><div style={{fontSize:11,color:C.mid,marginTop:6}}>這是輔助提醒，不會阻擋送去做影片——請自行判斷是否需要調整。</div></Card>:
      <Card style={{borderColor:C.jade,background:C.jadelt}}><SL ch="✅ Story Bible 連續性檢查通過"/></Card>
    );
    const portraitPanel=portraitStatus&&(
      portraitStatus.loading?<Card style={{borderColor:C.violet,background:C.violetl}}><SL ch="🎨 為新角色自動生成定裝照中..."/></Card>:
      <Card style={{borderColor:portraitStatus.error?C.gold:C.jade,background:portraitStatus.error?C.goldlt:C.jadelt}}>
        <SL ch={portraitStatus.generated?`🎨 已為 ${portraitStatus.generated} 個角色自動生成定裝照`:"🎨 定裝照"}/>
        <div style={{fontSize:11.5,color:C.ink,marginTop:4}}>{portraitStatus.error??"已存回 Story Bible 新草稿版本；下方場景生圖會用這些定裝照換角色跨場景一致性；到「📖 短劇 Story Bible」頁核准即可讓下次使用也直接吃到。"}</div>
      </Card>
    );
    return(<div><div style={{display:"flex",alignItems:"center",gap:9,marginBottom:18}}><GBtn ch="← 返回" onClick={()=>setSt("angles")}/><h2 style={{fontSize:17,fontWeight:900,color:C.black,fontFamily:"DM Serif Display,serif",margin:0}}>完整腳本</h2></div>{loading&&!script&&<Spin label="AI 正在撰寫腳本..."/>}{script&&<ScriptResult script={script} score={score} onReset={reset} autoSaveTag="手動生成" extraTop={<>{ccPanel}{portraitPanel}</>} sbCharacterRefs={sbCharacterRefs}/>}</div>);
  }
}

/* ── OTHER MODULES (simplified stubs that call ScriptResult) ── */
function makeSimpleModule(title,desc,icon,moduleId,tag,extraFields){
  return function SimpleModule({brand}){
    const[fields,setFields]=useState({});const[platform,setPlatform]=useState("");const[loading,setLoading]=useState(false);const[script,setScript]=useState(null);const[score,setScore]=useState(null);
    async function doGen(){
      const canGo=extraFields.every(f=>!f.required||fields[f.key]?.trim());
      if(!canGo||!platform)return;setLoading(true);setScript(null);
      const plat=PLATFORMS.find(p=>p.id===platform)?.label||"";
      try{const raw=await forge(moduleId,"gen",{...fields,plat});const s=pj(raw);setScript(s);const sr=await forge("result","score",{hook:s.hook,scenes:s.scenes?.length,cta:s.cta});setScore(pj(sr));}catch{}setLoading(false);
    }
    if(script&&!loading)return <ScriptResult script={script} score={score} onReset={()=>{setScript(null);setFields({});}} autoSaveTag={tag}/>;
    return(<div style={{display:"grid",gap:18}}><div><h2 style={{fontSize:19,fontWeight:900,color:C.black,fontFamily:"DM Serif Display,serif",marginBottom:3}}>{icon} {title}</h2><p style={{fontSize:12.5,color:C.mid}}>{desc}</p></div>{extraFields.map(f=><div key={f.key}><SL ch={f.label}/>{f.type==="area"?<TA value={fields[f.key]||""} onChange={e=>setFields({...fields,[f.key]:e.target.value})} placeholder={f.placeholder} rows={f.rows||3}/>:<IN value={fields[f.key]||""} onChange={e=>setFields({...fields,[f.key]:e.target.value})} placeholder={f.placeholder}/>}</div>)}<div><SL ch="目標平台 *"/><PlatGrid value={platform} onChange={setPlatform}/></div>{loading&&<Spin label={`AI 正在生成${title}...`}/>}{!loading&&<PBtn ch={`${icon} 生成${title} →`} onClick={doGen} disabled={!platform} full/>}</div>);
  };
}

const ArticleModule=makeSimpleModule("文章轉腳本","貼入文章，AI萃取精華轉成可拍攝腳本","📄","article","文章轉腳本",[{key:"article",label:"貼入文章 *",type:"area",placeholder:"貼入部落格、新聞稿、長文...",rows:8,required:true}]);

function IndustryModule({saveVoice,brand}){
  const[sel,setSel]=useState(null);const[platform,setPlatform]=useState("");const[topic,setTopic]=useState("");const[loading,setLoading]=useState(false);const[script,setScript]=useState(null);const[score,setScore]=useState(null);
  const ind=sel?INDUSTRIES[sel]:null;
  async function doGen(){if(!sel||!platform||!topic)return;setLoading(true);setScript(null);const plat=PLATFORMS.find(p=>p.id===platform)?.label||"";try{const raw=await forge("industry","gen",{industry:ind.label,plat,topic,voice:ind.voice,forbidden:ind.forbidden,preferred:ind.preferred,structure:ind.structure});const s=pj(raw);setScript(s);const sr=await forge("result","score_short",{hook:s.hook,scenes:s.scenes?.length});setScore(pj(sr));}catch{}setLoading(false);}
  if(script&&!loading)return<ScriptResult script={script} score={score} onReset={()=>{setScript(null);setTopic("");setPlatform("");}} autoSaveTag={`產業模板：${ind?.label}`}/>;
  return(<div style={{display:"grid",gap:18}}><div><h2 style={{fontSize:19,fontWeight:900,color:C.black,fontFamily:"DM Serif Display,serif",marginBottom:3}}>產業模板庫</h2><p style={{fontSize:12.5,color:C.mid}}>選產業，自動套入語氣、結構、禁用詞</p></div><div><SL ch="選擇產業 *"/><div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:7}}>{Object.entries(INDUSTRIES).map(([id,ind])=><button key={id} onClick={()=>setSel(id)} style={{padding:"12px 6px",borderRadius:10,border:`2px solid ${sel===id?C.coral:C.border}`,background:sel===id?C.corallt:C.white,cursor:"pointer",textAlign:"center",transition:"all .15s",fontFamily:"inherit"}}><div style={{fontSize:18,marginBottom:3}}>{ind.icon}</div><div style={{fontSize:9.5,fontWeight:sel===id?700:400,color:sel===id?C.coral:C.ink,lineHeight:1.2}}>{ind.label}</div></button>)}</div></div>{ind&&<Card style={{background:C.corallt,borderColor:C.coral}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}><div style={{fontSize:14,fontWeight:800,color:C.coral}}>{ind.icon} {ind.label}</div><GBtn ch="設為品牌語氣" onClick={async()=>{const err=await saveVoice({instructions:[ind.voice,ind.preferred&&`常用詞：${ind.preferred}`].filter(Boolean).join("\n"),forbidden:ind.forbidden});alert(err||"已存成目前客戶的品牌語氣");}} style={{fontSize:10.5,padding:"4px 9px"}}/></div><div style={{display:"grid",gap:5}}><div><span style={{fontSize:9.5,color:C.mid,fontWeight:700}}>語氣：</span><span style={{fontSize:12,color:C.ink}}>{ind.voice}</span></div><div><span style={{fontSize:9.5,color:C.rose,fontWeight:700}}>禁用：</span><span style={{fontSize:12,color:C.ink}}>{ind.forbidden}</span></div><div><span style={{fontSize:9.5,color:C.jade,fontWeight:700}}>偏好：</span><span style={{fontSize:12,color:C.ink}}>{ind.preferred}</span></div></div></Card>}{ind&&<><div><SL ch="影片主題 *"/><IN value={topic} onChange={e=>setTopic(e.target.value)} placeholder={`例如：${ind.hooks[0]}`}/></div><div><SL ch="目標平台 *"/><PlatGrid value={platform} onChange={setPlatform}/></div>{loading&&<Spin label={`AI 正在生成${ind.label}腳本...`}/>}{!loading&&<PBtn ch={`${ind.icon} 生成腳本 →`} onClick={doGen} disabled={!topic||!platform} full/>}</>}</div>);
}

function ABModule({brand}){
  const[product,setProduct]=useState("");const[platform,setPlatform]=useState("");const[duration,setDuration]=useState("30秒");const[loading,setLoading]=useState(false);const[ads,setAds]=useState(null);const[activeTab,setActiveTab]=useState(0);const[err,setErr]=useState("");
  const vC=[C.coral,C.violet,C.jade];const vL=[C.corallt,C.violetl,C.jadelt];
  async function doGen(){if(!product||!platform)return;setLoading(true);setAds(null);setErr("");const plat=PLATFORMS.find(p=>p.id===platform)?.label||"";try{const raw=await forge("ab","gen",{plat,duration,product});setAds(pj(raw));}catch{setErr("生成失敗，請再試一次（可能是 AI 回應逾時或格式問題）");}setLoading(false);}
  if(!ads)return(<div style={{display:"grid",gap:18}}><div><h2 style={{fontSize:19,fontWeight:900,color:C.black,fontFamily:"DM Serif Display,serif",marginBottom:3}}>廣告腳本 A/B/C 版本</h2><p style={{fontSize:12.5,color:C.mid}}>同一產品，三個不同角度廣告腳本</p></div><div><SL ch="產品/服務 *"/><TA value={product} onChange={e=>setProduct(e.target.value)} placeholder="詳細描述產品或服務..." rows={4}/></div><div><SL ch="廣告平台 *"/><PlatGrid value={platform} onChange={setPlatform}/></div><div><SL ch="廣告長度"/><div style={{display:"flex",gap:5}}>{["15秒","30秒","60秒"].map(d=><Pill key={d} label={d} active={duration===d} onClick={()=>setDuration(d)}/>)}</div></div>{err&&<div style={{padding:"7px 11px",background:C.roselt,border:`1.5px solid ${C.rose}`,borderRadius:7,fontSize:12.5,color:C.rose,fontWeight:600}}>{err}</div>}{loading&&<Spin label="AI 正在生成三個版本..."/>}{!loading&&<PBtn ch="🎯 生成A/B/C三版本 →" onClick={doGen} disabled={!product||!platform} full/>}</div>);
  return(<div style={{display:"grid",gap:14}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><h2 style={{fontSize:17,fontWeight:900,color:C.black,fontFamily:"DM Serif Display,serif",margin:0}}>三版本廣告腳本</h2><GBtn ch="重新生成" onClick={()=>setAds(null)}/></div>{ads.recommendation&&<Card style={{background:C.goldlt,borderColor:C.gold}}><SL ch="💡 AI建議先測試"/><div style={{fontSize:12.5,color:C.ink,lineHeight:1.6}}>{ads.recommendation}</div></Card>}<div style={{display:"flex",gap:6,borderBottom:`1.5px solid ${C.border}`}}>{ads.versions?.map((v,i)=><button key={i} onClick={()=>setActiveTab(i)} style={{padding:"9px 16px",border:"none",borderBottom:`3px solid ${activeTab===i?vC[i]:"transparent"}`,background:"transparent",color:activeTab===i?vC[i]:C.mid,fontWeight:activeTab===i?800:400,fontSize:12.5,cursor:"pointer",fontFamily:"inherit"}}>版本{v.version}：{v.type}</button>)}</div>{ads.versions?.map((v,i)=>activeTab===i&&<div key={i} style={{display:"grid",gap:10}}><Card style={{background:vL[i],borderColor:vC[i]}}><div style={{fontSize:15,fontWeight:800,color:vC[i],marginBottom:3,fontFamily:"DM Serif Display,serif"}}>{v.title}</div><div style={{fontSize:12.5,color:vC[i],fontStyle:"italic",marginBottom:7}}>「{v.hook}」</div><div style={{fontSize:11.5,color:C.ink,background:C.white,borderRadius:7,padding:"7px 10px"}}><b>適合：</b>{v.strength}</div></Card><div style={{display:"grid",gap:7}}>{v.scenes?.map((s,j)=><div key={j} style={{border:`1.5px solid ${C.border}`,borderRadius:10,overflow:"hidden"}}><div style={{background:C.black,padding:"5px 11px",display:"flex",alignItems:"center",gap:7}}><div style={{background:vC[i],color:C.white,width:19,height:19,borderRadius:4,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:800}}>{String(j+1).padStart(2,"0")}</div><span style={{fontSize:10.5,color:"#ccc"}}>{s.time}</span>{s.subtitle&&<span style={{marginLeft:"auto",fontSize:9.5,color:"rgba(255,255,255,.7)"}}>「{s.subtitle}」</span>}</div><div style={{padding:"9px 13px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}><div><div style={{fontSize:8.5,color:C.mid,fontWeight:700,letterSpacing:1,marginBottom:1}}>畫面</div><div style={{fontSize:11.5,color:C.ink}}>{s.visual}</div></div><div><div style={{fontSize:8.5,color:C.mid,fontWeight:700,letterSpacing:1,marginBottom:1}}>台詞</div><div style={{fontSize:11.5,color:vC[i],fontStyle:"italic"}}>{s.dialogue}</div></div></div></div>)}</div><Card style={{borderColor:vC[i],background:vL[i]}}><SL ch="CTA"/><div style={{fontSize:13.5,color:vC[i],fontStyle:"italic",fontFamily:"DM Serif Display,serif"}}>「{v.cta}」</div></Card>{v.scenes?.length>0&&<SendToVideoButton label={`🎬 送去做影片（版本${v.version}）`} build={()=>{const sc=(v.scenes||[]).map(s=>({narration:(s.dialogue||"").trim(),imagePrompt:(s.visual||"").trim()})).filter(s=>s.narration);return{title:v.title||product||"",script:v,production:{topic:v.title||product||"",articleTitle:v.title||"",articleContent:`${v.hook?`開場鉤子：${v.hook}\n\n`:""}${sc.map(s=>s.narration).join("\n")}${v.cta?`\n\n結尾 CTA：${v.cta}`:""}`,scenes:sc.length>0?sc:undefined}};}}/>}</div>)}</div>);
}

/* ── 主持人稿標記 SSOT：標記說明 legend 與 文稿內標記上色 共用同一份 → 顏色永遠一致；新增標記只需改這裡（修「文稿沒上色／顏色對不上說明／缺【放慢】【降調】」）。 ── */
const HOST_MARKERS = [
  { k: "停",   d: "停頓", c: C.coral,  bg: C.corallt },
  { k: "換氣", d: "換氣", c: C.sky,    bg: C.skylt   },
  { k: "升調", d: "升高", c: C.jade,   bg: C.jadelt  },
  { k: "降調", d: "降低", c: C.rose,   bg: C.roselt  },
  { k: "加重", d: "加重", c: C.violet, bg: C.violetl },
  { k: "放慢", d: "放慢", c: C.teal,   bg: C.teallt  },
  { k: "快說", d: "加快", c: C.gold,   bg: C.goldlt  },
];
const HOST_MARKER_MAP: Record<string, { k: string; d: string; c: string; bg: string }> =
  Object.fromEntries(HOST_MARKERS.map((m) => [m.k, m]));

/* 文稿渲染：① 標記【…】上色（與 legend 同 SSOT）② 表情提示（…）淡化 ③ 遇【停】【換氣】或句末標點斷行成段 → 解決「擠成一團、難讀」。 */
function HostMarkedText({ text }: { text?: string }) {
  if (!text) return null;
  const tokens: { t: "text" | "mark" | "cue"; v: string }[] = [];
  const re = /【([^】]+)】|（([^）]+)）|\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) tokens.push({ t: "text", v: text.slice(last, m.index) });
    if (m[1] !== undefined) tokens.push({ t: "mark", v: m[1] });
    else tokens.push({ t: "cue", v: (m[2] ?? m[3]) as string });
    last = re.lastIndex;
  }
  if (last < text.length) tokens.push({ t: "text", v: text.slice(last) });

  // 斷行成段：遇【停】【換氣】前換行（停頓/換氣＝自然句讀），句末標點後換行 → 像提詞機逐句呈現。
  const lines: { t: string; v: string }[][] = [[]];
  const brk = () => { if (lines[lines.length - 1].length) lines.push([]); };
  for (const tk of tokens) {
    if (tk.t === "mark" && (tk.v === "停" || tk.v === "換氣")) brk();
    lines[lines.length - 1].push(tk);
    if (tk.t === "text" && /[。！？!?]\s*$/.test(tk.v)) brk();
  }

  const piece = (tk: { t: string; v: string }, i: number) => {
    if (tk.t === "text") return <span key={i}>{tk.v}</span>;
    if (tk.t === "cue")
      return <span key={i} style={{ color: C.mid, fontStyle: "italic", fontSize: 12 }}>（{tk.v}）</span>;
    const mk = HOST_MARKER_MAP[tk.v];
    return (
      <span key={i} style={{ display: "inline-block", margin: "0 3px", padding: "1px 7px", borderRadius: 5, background: mk ? mk.bg : C.fog, color: mk ? mk.c : C.mid, fontWeight: 800, fontSize: 11.5, verticalAlign: "middle" }}>
        【{tk.v}】
      </span>
    );
  };

  return (
    <div>
      {lines.filter((l) => l.length).map((l, li) => (
        <div key={li} style={{ marginBottom: 8, lineHeight: 2, fontSize: 14, color: C.black }}>
          {l.map(piece)}
        </div>
      ))}
    </div>
  );
}

function HostModule(){
  const[topic,setTopic]=useState("");const[style,setStyle]=useState("");const[duration,setDuration]=useState("60秒");const[loading,setLoading]=useState(false);const[result,setResult]=useState(null);const[copied,setCopied]=useState(false);const[err,setErr]=useState("");
  const hostStyles=["親切朋友型","專業老師型","熱情分享型","冷靜分析型","幽默主持型"];
  async function doGen(){if(!topic)return;setLoading(true);setResult(null);setErr("");try{const raw=await forge("host","gen",{topic,style,duration});setResult(pj(raw));}catch{setErr("生成失敗，請再試一次（可能是 AI 回應逾時或格式問題）");}setLoading(false);}
  if(!result)return(<div style={{display:"grid",gap:18}}><div><h2 style={{fontSize:19,fontWeight:900,color:C.black,fontFamily:"DM Serif Display,serif",marginBottom:3}}>AI 主持人稿</h2><p style={{fontSize:12.5,color:C.mid}}>生成適合真人說話的腳本，含停頓、語氣、換氣、肢體動作標記</p></div><div><SL ch="影片主題 *"/><IN value={topic} onChange={e=>setTopic(e.target.value)} placeholder="例如：新手學畫畫的三個誤區"/></div><div><SL ch="主持風格"/><div style={{display:"flex",flexWrap:"wrap",gap:5}}>{hostStyles.map(s=><Pill key={s} label={s} active={style===s} onClick={()=>setStyle(s)}/>)}</div></div><div><SL ch="長度"/><div style={{display:"flex",gap:5}}>{DURATIONS.map(d=><Pill key={d} label={d} active={duration===d} onClick={()=>setDuration(d)}/>)}</div></div>{err&&<div style={{padding:"7px 11px",background:C.roselt,border:`1.5px solid ${C.rose}`,borderRadius:7,fontSize:12.5,color:C.rose,fontWeight:600}}>{err}</div>}{loading&&<Spin label="AI 正在撰寫主持人稿..."/>}{!loading&&<PBtn ch="🤖 生成主持人稿 →" onClick={doGen} disabled={!topic} full/>}</div>);
  return(<div style={{display:"grid",gap:12}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><h2 style={{fontSize:17,fontWeight:900,color:C.black,fontFamily:"DM Serif Display,serif",margin:0}}>{result.title}</h2><div style={{display:"flex",gap:7}}><GBtn ch={copied?"✅ 已複製":"📋 複製全稿"} onClick={()=>{const t=result.segments?.map(s=>`【${s.duration}】\n${s.marked_text}\n（${s.action_notes}）`).join("\n\n");navigator.clipboard.writeText(t);setCopied(true);setTimeout(()=>setCopied(false),2000);}}/><GBtn ch="重新生成" onClick={()=>setResult(null)}/></div></div><Card style={{background:C.corallt,borderColor:C.coral}}><SL ch="標記說明"/><div style={{display:"flex",flexWrap:"wrap",gap:5}}>{HOST_MARKERS.map((mk)=><div key={mk.k} style={{padding:"3px 9px",background:C.white,borderRadius:6,border:`1px solid ${C.border}`}}><span style={{fontSize:10.5,fontWeight:700,color:mk.c}}>【{mk.k}】</span><span style={{fontSize:9.5,color:C.mid,marginLeft:3}}>{mk.d}</span></div>)}</div></Card>{result.segments?.map((seg,i)=><Card key={i}><div style={{display:"flex",alignItems:"center",gap:7,marginBottom:9}}><div style={{background:C.coral,color:C.white,width:21,height:21,borderRadius:5,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800}}>{i+1}</div><span style={{fontSize:11.5,fontWeight:700,color:C.ink}}>{seg.duration}</span></div><div style={{background:"#FEFEF9",border:`1.5px solid ${C.border}`,borderRadius:9,padding:"12px 14px",marginBottom:9}}><HostMarkedText text={seg.marked_text}/></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>{seg.action_notes&&<div style={{background:C.roselt,borderRadius:7,padding:"7px 9px"}}><div style={{fontSize:9.5,color:C.rose,fontWeight:700,marginBottom:2}}>肢體</div><div style={{fontSize:11.5,color:C.ink}}>{seg.action_notes}</div></div>}{seg.breathing_notes&&<div style={{background:C.skylt,borderRadius:7,padding:"7px 9px"}}><div style={{fontSize:9.5,color:C.sky,fontWeight:700,marginBottom:2}}>換氣</div><div style={{fontSize:11.5,color:C.ink}}>{seg.breathing_notes}</div></div>}</div></Card>)}{result.delivery_tips&&<Card style={{borderColor:C.jade,background:C.jadelt}}><SL ch="🎭 表演建議"/>{result.delivery_tips.map((t,i)=><div key={i} style={{fontSize:12.5,color:C.ink,padding:"4px 0",borderBottom:i<result.delivery_tips.length-1?`1px solid rgba(0,168,120,.15)`:"none"}}>{t}</div>)}</Card>}{result.segments?.length>0&&<SendToVideoButton label="🎬 送去做影片（主持人稿）" build={()=>{const sc=(result.segments||[]).map(s=>({narration:(s.marked_text||"").replace(/【[^】]*】/g,"").replace(/（[^）]*）/g,"").replace(/\([^)]*\)/g,"").replace(/\s+/g," ").trim(),imagePrompt:""})).filter(s=>s.narration);return{title:result.title||topic||"",script:result,production:{topic:result.title||topic||"",articleTitle:result.title||"",articleContent:sc.map(s=>s.narration).join("\n\n"),scenes:sc.length>0?sc:undefined}};}}/>}</div>);
}

function HookModule(){
  const[topic,setTopic]=useState("");const[loading,setLoading]=useState(false);const[hooks,setHooks]=useState(null);const[ci,setCi]=useState(null);
  const tC={"反常識型":[C.coral,C.corallt],"痛點型":[C.rose,C.roselt],"故事型":[C.violet,C.violetl],"數據型":[C.sky,C.skylt],"挑戰型":[C.gold,C.goldlt],"問題型":[C.jade,C.jadelt],"情緒型":[C.rose,C.roselt],"對比型":[C.coral,C.corallt],"利益承諾型":[C.jade,C.jadelt],"懸念型":[C.violet,C.violetl]};
  async function doHooks(){if(!topic.trim())return;setLoading(true);setHooks(null);try{const raw=await forge("hook","hooks",{topic});setHooks(pj(raw).hooks);}catch{}setLoading(false);}
  return(<div style={{display:"grid",gap:18}}><div><h2 style={{fontSize:19,fontWeight:900,color:C.black,fontFamily:"DM Serif Display,serif",marginBottom:3}}>Hook 生成器</h2><p style={{fontSize:12.5,color:C.mid}}>輸入主題，一次生成 10 種不同風格的開頭鉤子</p></div><div style={{display:"flex",gap:7}}><div style={{flex:1}}><IN value={topic} onChange={e=>setTopic(e.target.value)} placeholder="輸入影片主題..." onKeyDown={e=>e.key==="Enter"&&doHooks()}/></div><PBtn ch="🪝 生成" onClick={doHooks} disabled={!topic.trim()||loading}/></div>{loading&&<Spin label="AI 正在生成 10 種鉤子..."/>}{hooks&&<div style={{display:"grid",gap:7}}>{hooks.map((h,i)=>{const[col,bg]=tC[h.type]||[C.coral,C.corallt];return(<div key={i} style={{background:C.white,border:`1.5px solid ${C.border}`,borderRadius:11,padding:12,display:"flex",gap:10,alignItems:"flex-start",transition:"all .15s"}} onMouseEnter={e=>e.currentTarget.style.borderColor=col} onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}><div style={{flexShrink:0,width:26,height:26,borderRadius:6,background:bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:900,color:col}}>{String(i+1).padStart(2,"0")}</div><div style={{flex:1}}><Tag ch={h.type} c={col} bg={bg} small/><div style={{fontSize:13.5,color:C.black,lineHeight:1.5,margin:"5px 0 3px",fontFamily:"DM Serif Display,serif",fontStyle:"italic"}}>「{h.hook}」</div><div style={{fontSize:11,color:C.mid}}>{h.why}</div></div><div style={{display:"flex",alignItems:"center",gap:7,flexShrink:0}}><span style={{fontSize:12.5,fontWeight:800,color:col}}>{h.score}<span style={{fontSize:9,color:C.mid}}>/10</span></span><button onClick={()=>{navigator.clipboard.writeText(h.hook);setCi(i);setTimeout(()=>setCi(null),1500);}} style={{padding:"4px 10px",borderRadius:6,border:`1.5px solid ${col}`,background:ci===i?col:C.white,color:ci===i?C.white:col,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all .15s"}}>{ci===i?"✓":"複製"}</button></div></div>);})}  <GBtn ch="🔄 重新生成" onClick={doHooks} style={{marginTop:3}}/></div>}</div>);
}

function PainModule(){
  const[industry,setIndustry]=useState("");const[custom,setCustom]=useState("");const[loading,setLoading]=useState(false);const[pains,setPains]=useState(null);const[filter,setFilter]=useState("全部");const[ci,setCi]=useState(null);
  async function doGen(){const target=industry||custom;if(!target)return;setLoading(true);setPains(null);try{const raw=await forge("pain","gen",{target});setPains(pj(raw));}catch{}setLoading(false);}
  const cats=["全部","恐懼","渴望","問題","誤區","障礙"];const catC={"恐懼":[C.rose,C.roselt],"渴望":[C.jade,C.jadelt],"問題":[C.coral,C.corallt],"誤區":[C.violet,C.violetl],"障礙":[C.gold,C.goldlt]};
  const filtered=pains?.pain_points?.filter(p=>filter==="全部"||p.category===filter)||[];
  return(<div style={{display:"grid",gap:18}}><div><h2 style={{fontSize:19,fontWeight:900,color:C.black,fontFamily:"DM Serif Display,serif",marginBottom:3}}>受眾痛點挖掘</h2><p style={{fontSize:12.5,color:C.mid}}>輸入產業，AI一次列出50個受眾真實痛點</p></div><div><SL ch="選擇產業"/><div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:9}}>{Object.values(INDUSTRIES).map(ind=><button key={ind.label} onClick={()=>{setIndustry(ind.label);setCustom("");}} style={{padding:"5px 11px",borderRadius:8,border:`1.5px solid ${industry===ind.label?C.coral:C.border}`,background:industry===ind.label?C.corallt:C.white,color:industry===ind.label?C.coral:C.ink,fontSize:12,cursor:"pointer",fontFamily:"inherit",transition:"all .15s"}}>{ind.icon} {ind.label}</button>)}</div><SL ch="或自訂"/><IN value={custom} onChange={e=>{setCustom(e.target.value);setIndustry("");}} placeholder="例如：單親媽媽、30歲轉職者..." onKeyDown={e=>e.key==="Enter"&&doGen()}/></div>{loading&&<Spin label="AI 正在挖掘 50 個痛點..."/>}{!loading&&<PBtn ch="💬 挖掘 50 個痛點 →" onClick={doGen} disabled={!industry&&!custom.trim()} full/>}{pains&&<div><div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:10}}>{cats.map(c=><button key={c} onClick={()=>setFilter(c)} style={{padding:"4px 10px",borderRadius:999,border:`1.5px solid ${filter===c?C.coral:C.border}`,background:filter===c?C.corallt:C.white,color:filter===c?C.coral:C.mid,fontSize:12,fontWeight:filter===c?700:400,cursor:"pointer",fontFamily:"inherit"}}>{c}</button>)}</div><div style={{display:"grid",gap:6}}>{filtered.map((p,i)=>{const[col,bg]=catC[p.category]||[C.coral,C.corallt];return(<div key={p.id} onClick={()=>{navigator.clipboard.writeText(p.hook_potential);setCi(i);setTimeout(()=>setCi(null),1500);}} style={{background:C.white,border:`1.5px solid ${C.border}`,borderRadius:10,padding:"9px 12px",cursor:"pointer",transition:"all .15s",display:"flex",gap:9,alignItems:"flex-start"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=col;e.currentTarget.style.background=bg;}} onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.background=C.white;}}><div style={{width:22,height:22,borderRadius:6,background:bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9.5,fontWeight:800,color:col,flexShrink:0}}>{p.id}</div><div style={{flex:1}}><div style={{display:"flex",alignItems:"center",gap:5,marginBottom:2}}><Tag ch={p.category} c={col} bg={bg} small/>{p.urgency==="高"&&<Tag ch="🔥高" c={C.rose} bg={C.roselt} small/>}</div><div style={{fontSize:12.5,color:C.black,lineHeight:1.4,marginBottom:2}}>{p.pain}</div><div style={{fontSize:11,color:col,fontStyle:"italic"}}>→ {p.hook_potential}</div></div><div style={{fontSize:11,color:ci===i?C.jade:C.mid,fontWeight:ci===i?700:400,flexShrink:0}}>{ci===i?"✓已複製":"點擊複製"}</div></div>);})}</div></div>}</div>);
}

function ViralModule(){
  const[text,setText]=useState("");const[platform,setPlatform]=useState("");const[loading,setLoading]=useState(false);const[result,setResult]=useState(null);
  async function doAnalyze(){if(!text.trim()||!platform)return;setLoading(true);setResult(null);const plat=PLATFORMS.find(p=>p.id===platform)?.label||"";try{const raw=await forge("viral","analyze",{plat,text});setResult(pj(raw));}catch{}setLoading(false);}
  if(!result)return(<div style={{display:"grid",gap:18}}><div><h2 style={{fontSize:19,fontWeight:900,color:C.black,fontFamily:"DM Serif Display,serif",marginBottom:3}}>爆款腳本拆解</h2><p style={{fontSize:12.5,color:C.mid}}>貼入爆款影片文字，AI深度分析為何爆，提取可複製公式</p></div><div><SL ch="貼入爆款影片文字 *"/><TA value={text} onChange={e=>setText(e.target.value)} placeholder="把爆款影片的字幕或腳本貼在這裡..." rows={8}/></div><div><SL ch="影片平台 *"/><PlatGrid value={platform} onChange={setPlatform}/></div>{loading&&<Spin label="AI 正在深度拆解爆款..."/>}{!loading&&<PBtn ch="🔁 拆解爆款 →" onClick={doAnalyze} disabled={!text.trim()||!platform} full/>}</div>);
  return(<div style={{display:"grid",gap:12}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><h2 style={{fontSize:17,fontWeight:900,color:C.black,fontFamily:"DM Serif Display,serif",margin:0}}>爆款拆解報告</h2><GBtn ch="重新分析" onClick={()=>setResult(null)}/></div><div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:9}}>{[["🪝 鉤子強度",result.rating?.hook_strength,C.coral],["🔁 病毒係數",result.rating?.virality,C.violet],["⏱ 留存力",result.rating?.retention,C.jade]].map(([l,v,c])=><Card key={l} style={{textAlign:"center",padding:14}}><div style={{fontSize:28,fontWeight:900,color:c,fontFamily:"DM Serif Display,serif"}}>{v}</div><div style={{fontSize:10.5,color:C.mid,marginTop:1}}>{l}/10</div></Card>)}</div><Card style={{background:C.corallt,borderColor:C.coral}}><SL ch="🪝 鉤子拆解"/><div style={{fontSize:14,color:C.coral,fontStyle:"italic",fontFamily:"DM Serif Display,serif",marginBottom:7}}>「{result.hook_analysis?.hook_text}」</div><div style={{display:"grid",gap:4}}><div><span style={{fontSize:10.5,color:C.mid}}>為何有效：</span><span style={{fontSize:12.5,color:C.ink}}>{result.hook_analysis?.why_works}</span></div><div><span style={{fontSize:10.5,color:C.mid}}>心理機制：</span><span style={{fontSize:12.5,color:C.coral,fontWeight:600}}>{result.hook_analysis?.psychological_trigger}</span></div></div></Card><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><Card><SL ch="🔥 爆紅因素"/>{result.viral_factors?.map((f,i)=><div key={i} style={{display:"flex",gap:6,alignItems:"flex-start",padding:"4px 0",borderBottom:i<result.viral_factors.length-1?`1px solid ${C.border}`:"none"}}><div style={{width:16,height:16,borderRadius:"50%",background:C.coral,color:C.white,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:800,flexShrink:0}}>{i+1}</div><span style={{fontSize:12,color:C.ink}}>{f}</span></div>)}</Card><Card><SL ch="🧠 受眾心理"/><div style={{display:"grid",gap:5}}><div><div style={{fontSize:9.5,color:C.mid,marginBottom:1}}>主要情緒</div><div style={{fontSize:12.5,color:C.ink}}>{result.audience_psychology?.emotion}</div></div><div><div style={{fontSize:9.5,color:C.mid,marginBottom:1}}>分享原因</div><div style={{fontSize:12.5,color:C.ink}}>{result.audience_psychology?.share_reason}</div></div></div></Card></div><Card style={{background:C.goldlt,borderColor:C.gold}}><SL ch="📐 可複製公式"/><div style={{display:"grid",gap:7}}><div><div style={{fontSize:9.5,color:C.mid,marginBottom:2}}>腳本結構公式</div><div style={{fontSize:13,color:C.black,fontWeight:600}}>{result.template_extracted?.structure}</div></div><div><div style={{fontSize:9.5,color:C.mid,marginBottom:2}}>鉤子公式</div><div style={{fontSize:13,color:C.gold,fontWeight:600}}>{result.template_extracted?.hook_formula}</div></div></div></Card></div>);
}

function ThumbnailModule(){
  const[topic,setTopic]=useState("");const[platform,setPlatform]=useState("");const[loading,setLoading]=useState(false);const[result,setResult]=useState(null);const[ci,setCi]=useState(null);
  async function doGen(){if(!topic||!platform)return;setLoading(true);setResult(null);const plat=PLATFORMS.find(p=>p.id===platform)?.label||"";try{const raw=await forge("thumbnail","gen",{topic,plat});setResult(pj(raw));}catch{}setLoading(false);}
  const pals=["#6366f1","#7C5CFC","#00A878","#F0A500","#0EA5E9"];
  if(!result)return(<div style={{display:"grid",gap:18}}><div><h2 style={{fontSize:19,fontWeight:900,color:C.black,fontFamily:"DM Serif Display,serif",marginBottom:3}}>縮圖文案生成</h2><p style={{fontSize:12.5,color:C.mid}}>5種不同風格的影片封面標題、構圖建議與配色</p></div><div><SL ch="影片主題 *"/><IN value={topic} onChange={e=>setTopic(e.target.value)} placeholder="例如：新手學畫畫的三個誤區"/></div><div><SL ch="平台 *"/><PlatGrid value={platform} onChange={setPlatform}/></div>{loading&&<Spin label="AI 正在生成縮圖文案..."/>}{!loading&&<PBtn ch="🎬 生成縮圖文案 →" onClick={doGen} disabled={!topic||!platform} full/>}</div>);
  return(<div style={{display:"grid",gap:12}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><h2 style={{fontSize:17,fontWeight:900,color:C.black,fontFamily:"DM Serif Display,serif",margin:0}}>5種縮圖方案</h2><GBtn ch="重新生成" onClick={()=>setResult(null)}/></div>{result.options?.map((opt,i)=>{const col=pals[i]||C.coral;return(<Card key={i} style={{borderLeft:`4px solid ${col}`,paddingLeft:16}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:9}}><Tag ch={opt.style} c={col} bg={col+"18"}/><Tag ch={opt.click_rate_estimate==="高"?"🔥高點擊":opt.click_rate_estimate==="中"?"📈中點擊":"📊低點擊"} c={opt.click_rate_estimate==="高"?C.jade:opt.click_rate_estimate==="中"?C.gold:C.mid} bg={opt.click_rate_estimate==="高"?C.jadelt:opt.click_rate_estimate==="中"?C.goldlt:C.fog} small/></div><div style={{background:col+"10",border:`1.5px solid ${col}30`,borderRadius:9,padding:"12px 14px",marginBottom:9,textAlign:"center"}}><div style={{fontSize:20,fontWeight:900,color:col,letterSpacing:"-.5px",fontFamily:"DM Serif Display,serif"}}>{opt.main_text}</div>{opt.sub_text&&<div style={{fontSize:12.5,color:C.ink,marginTop:3}}>{opt.sub_text}</div>}</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}><div><div style={{fontSize:9.5,color:C.mid,fontWeight:700,letterSpacing:1,marginBottom:2}}>構圖</div><div style={{fontSize:12,color:C.ink}}>{opt.visual_suggestion}</div></div><div><div style={{fontSize:9.5,color:C.mid,fontWeight:700,letterSpacing:1,marginBottom:2}}>配色</div><div style={{fontSize:12,color:C.ink}}>{opt.color_scheme}</div></div></div><button onClick={()=>{navigator.clipboard.writeText(`主標題：${opt.main_text}\n副標題：${opt.sub_text||""}\n構圖：${opt.visual_suggestion}\n配色：${opt.color_scheme}`);setCi(i);setTimeout(()=>setCi(null),1500);}} style={{marginTop:9,width:"100%",padding:"6px",borderRadius:7,border:`1.5px solid ${col}`,background:ci===i?col:C.white,color:ci===i?C.white:col,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all .15s"}}>{ci===i?"✅ 已複製":"📋 複製此方案"}</button></Card>);})}</div>);
}

function RepurposeModule(){
  const[script,setScript]=useState("");const[targetType,setTargetType]=useState("");const[loading,setLoading]=useState(false);const[result,setResult]=useState(null);const[copied,setCopied]=useState(false);
  const types=[{id:"email",label:"Email文案",icon:"📧"},{id:"landing",label:"Landing Page",icon:"🌐"},{id:"social",label:"社群貼文",icon:"📱"},{id:"ad_copy",label:"廣告文案",icon:"🎯"}];
  async function doGen(){if(!script.trim()||!targetType)return;setLoading(true);setResult(null);const t=types.find(t=>t.id===targetType);try{const raw=await forge("repurpose","gen",{label:t?.label,target:targetType,script});setResult(pj(raw));}catch{}setLoading(false);}
  if(!result)return(<div style={{display:"grid",gap:18}}><div><h2 style={{fontSize:19,fontWeight:900,color:C.black,fontFamily:"DM Serif Display,serif",marginBottom:3}}>腳本轉文案</h2><p style={{fontSize:12.5,color:C.mid}}>把腳本轉成Email、Landing Page、社群貼文或廣告文案</p></div><div><SL ch="貼入腳本/台詞 *"/><TA value={script} onChange={e=>setScript(e.target.value)} placeholder="貼入你的影片腳本台詞..." rows={7}/></div><div><SL ch="轉換為 *"/><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>{types.map(t=><button key={t.id} onClick={()=>setTargetType(t.id)} style={{padding:"12px 10px",borderRadius:10,border:`2px solid ${targetType===t.id?C.coral:C.border}`,background:targetType===t.id?C.corallt:C.white,cursor:"pointer",textAlign:"left",fontFamily:"inherit",transition:"all .15s"}}><div style={{fontSize:18,marginBottom:4}}>{t.icon}</div><div style={{fontSize:12.5,fontWeight:targetType===t.id?700:400,color:targetType===t.id?C.coral:C.black}}>{t.label}</div></button>)}</div></div>{loading&&<Spin label="AI 正在轉換文案格式..."/>}{!loading&&<PBtn ch="📧 轉換文案 →" onClick={doGen} disabled={!script.trim()||!targetType} full/>}</div>);
  return(<div style={{display:"grid",gap:12}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><h2 style={{fontSize:17,fontWeight:900,color:C.black,fontFamily:"DM Serif Display,serif",margin:0}}>{result.type}</h2><div style={{display:"flex",gap:7}}><GBtn ch={copied?"✅ 已複製":"📋 複製"} onClick={()=>{navigator.clipboard.writeText(result.main_output);setCopied(true);setTimeout(()=>setCopied(false),2000);}}/><GBtn ch="重新轉換" onClick={()=>setResult(null)}/></div></div>{result.subject_lines&&<Card style={{borderColor:C.sky,background:C.skylt}}><SL ch="📧 主旨建議"/>{result.subject_lines.map((s,i)=><div key={i} style={{fontSize:12.5,color:C.ink,padding:"4px 0",borderBottom:i<result.subject_lines.length-1?`1px solid rgba(14,165,233,.15)`:"none"}}><span style={{color:C.mid,fontWeight:700,marginRight:5}}>{i+1}.</span>{s}</div>)}</Card>}<Card><SL ch="主要內容"/><div style={{fontSize:13,color:C.black,lineHeight:1.8,whiteSpace:"pre-wrap"}}>{result.main_output}</div></Card><SendToSocial title={result.type||"腳本轉文案"} text={typeof result.main_output==="string"?result.main_output:""}/>{result.key_differences&&<Card style={{background:C.goldlt,borderColor:C.gold}}><SL ch="📝 調整說明"/><div style={{fontSize:12.5,color:C.ink,lineHeight:1.6}}>{result.key_differences}</div></Card>}</div>);
}

function TranslateModule(){
  const[script,setScript]=useState("");const[langs,setLangs]=useState([]);const[loading,setLoading]=useState(false);const[results,setResults]=useState(null);const[activeTab,setActiveTab]=useState(0);
  function toggleLang(id){setLangs(prev=>prev.includes(id)?prev.filter(l=>l!==id):[...prev,id]);}
  async function doTranslate(){if(!script.trim()||langs.length===0)return;setLoading(true);setResults(null);try{const raw=await forge("translate","translate",{langs:langs.map(l=>LANGUAGES.find(lang=>lang.id===l)?.label),script});setResults(pj(raw));}catch{}setLoading(false);}
  if(!results)return(<div style={{display:"grid",gap:18}}><div><h2 style={{fontSize:19,fontWeight:900,color:C.black,fontFamily:"DM Serif Display,serif",marginBottom:3}}>多語言版本</h2><p style={{fontSize:12.5,color:C.mid}}>同一腳本轉成多個語言版本，符合當地文化，非直譯</p></div><div><SL ch="貼入腳本 *"/><TA value={script} onChange={e=>setScript(e.target.value)} placeholder="貼入你的影片台詞或腳本..." rows={7}/></div><div><SL ch="目標語言（可多選） *"/><div style={{display:"flex",flexWrap:"wrap",gap:8}}>{LANGUAGES.map(l=><button key={l.id} onClick={()=>toggleLang(l.id)} style={{padding:"10px 14px",borderRadius:10,border:`2px solid ${langs.includes(l.id)?C.coral:C.border}`,background:langs.includes(l.id)?C.corallt:C.white,cursor:"pointer",textAlign:"center",transition:"all .15s",fontFamily:"inherit"}}><div style={{fontSize:22,marginBottom:3}}>{l.flag}</div><div style={{fontSize:11.5,fontWeight:langs.includes(l.id)?700:400,color:langs.includes(l.id)?C.coral:C.ink}}>{l.label}</div></button>)}</div></div>{loading&&<Spin label={`AI 正在翻譯成 ${langs.length} 種語言...`}/>}{!loading&&<PBtn ch={`🌍 翻譯成 ${langs.length} 種語言 →`} onClick={doTranslate} disabled={!script.trim()||langs.length===0} full/>}</div>);
  return(<div style={{display:"grid",gap:12}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><h2 style={{fontSize:17,fontWeight:900,color:C.black,fontFamily:"DM Serif Display,serif",margin:0}}>多語言版本</h2><GBtn ch="重新翻譯" onClick={()=>setResults(null)}/></div><div style={{display:"flex",gap:6,borderBottom:`1.5px solid ${C.border}`}}>{results.translations?.map((t,i)=><button key={i} onClick={()=>setActiveTab(i)} style={{padding:"9px 16px",border:"none",borderBottom:`3px solid ${activeTab===i?C.coral:"transparent"}`,background:"transparent",color:activeTab===i?C.coral:C.mid,fontWeight:activeTab===i?800:400,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>{t.flag} {t.language}</button>)}</div>{results.translations?.map((t,i)=>activeTab===i&&<div key={i} style={{display:"grid",gap:10}}><Card style={{borderColor:C.coral,background:C.corallt}}><SL ch={`開頭鉤子`}/><div style={{fontSize:14,color:C.coral,fontStyle:"italic",fontFamily:"DM Serif Display,serif"}}>「{t.hook_translated}」</div></Card><Card><SL ch="完整翻譯"/><div style={{fontSize:13,color:C.black,lineHeight:1.8,whiteSpace:"pre-wrap"}}>{t.translated_text}</div></Card><Card style={{background:C.goldlt,borderColor:C.gold}}><SL ch="🌏 本地化說明"/><div style={{fontSize:12.5,color:C.ink,lineHeight:1.6}}>{t.localization_notes}</div></Card><GBtn ch={`📋 複製 ${t.language} 版本`} onClick={()=>navigator.clipboard.writeText(t.translated_text)} style={{width:"100%",padding:"10px"}}/></div>)}</div>);
}

function PredictModule(){
  const[script,setScript]=useState("");const[platform,setPlatform]=useState("");const[loading,setLoading]=useState(false);const[result,setResult]=useState(null);
  const mC=(v)=>{const n=parseFloat(v);if(n>=70)return C.jade;if(n>=40)return C.gold;return C.rose;};
  async function doPredict(){if(!script.trim()||!platform)return;setLoading(true);setResult(null);const plat=PLATFORMS.find(p=>p.id===platform)?.label||"";try{const raw=await forge("predict","predict",{plat,script});setResult(pj(raw));}catch{}setLoading(false);}
  if(!result)return(<div style={{display:"grid",gap:18}}><div><h2 style={{fontSize:19,fontWeight:900,color:C.black,fontFamily:"DM Serif Display,serif",marginBottom:3}}>腳本績效預測</h2><p style={{fontSize:12.5,color:C.mid}}>貼入腳本，AI預測完播率、轉換率、病毒係數</p></div><div><SL ch="貼入腳本 *"/><TA value={script} onChange={e=>setScript(e.target.value)} placeholder="貼入你的腳本台詞..." rows={8}/></div><div><SL ch="發布平台 *"/><PlatGrid value={platform} onChange={setPlatform}/></div>{loading&&<Spin label="AI 正在分析腳本績效..."/>}{!loading&&<PBtn ch="📊 預測績效 →" onClick={doPredict} disabled={!script.trim()||!platform} full/>}</div>);
  return(<div style={{display:"grid",gap:12}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><h2 style={{fontSize:17,fontWeight:900,color:C.black,fontFamily:"DM Serif Display,serif",margin:0}}>績效預測報告</h2><GBtn ch="重新分析" onClick={()=>setResult(null)}/></div><div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:9}}>{[["前3秒留存",result.predicted_retention?.["3s_hook_rate"]],["完播率",result.predicted_retention?.full_watch_rate],["預估轉換率",result.conversion_estimate?.conversion_rate]].map(([l,v])=><Card key={l} style={{textAlign:"center",padding:14}}><div style={{fontSize:26,fontWeight:900,color:mC(v),fontFamily:"DM Serif Display,serif"}}>{v}</div><div style={{fontSize:10.5,color:C.mid,marginTop:1}}>{l}</div></Card>)}</div>{result.viral_coefficient&&<Card style={{borderColor:result.viral_coefficient.score>=7?C.jade:C.gold}}><SL ch="🔥 病毒係數"/><div style={{display:"flex",alignItems:"center",gap:10}}><div style={{fontSize:36,fontWeight:900,color:result.viral_coefficient.score>=7?C.jade:C.gold,fontFamily:"DM Serif Display,serif"}}>{result.viral_coefficient.score}<span style={{fontSize:12,color:C.mid}}>/10</span></div><div><Tag ch={result.viral_coefficient.label} c={result.viral_coefficient.score>=7?C.jade:C.gold} bg={result.viral_coefficient.score>=7?C.jadelt:C.goldlt}/><div style={{fontSize:12,color:C.ink,marginTop:3}}>{result.viral_coefficient.reason}</div></div></div></Card>}{result.top3_improvements&&<Card><SL ch="⚡ 三大改善建議"/>{result.top3_improvements.map((t,i)=><div key={i} style={{padding:"7px 0",borderBottom:i<2?`1px solid ${C.border}`:"none"}}><div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}><div style={{width:17,height:17,borderRadius:"50%",background:C.coral,color:C.white,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:800,flexShrink:0}}>{i+1}</div><span style={{fontSize:12.5,fontWeight:700,color:C.black}}>{t.issue}</span><Tag ch={t.impact} c={C.jade} bg={C.jadelt} small/></div><div style={{fontSize:11.5,color:C.mid,paddingLeft:23}}>{t.fix}</div></div>)}</Card>}{result.algorithm_score&&<Card><SL ch="🤖 演算法評估"/><div style={{fontSize:34,fontWeight:900,color:C.violet,marginBottom:10,fontFamily:"DM Serif Display,serif"}}>{result.algorithm_score.score}<span style={{fontSize:12,color:C.mid}}>/100</span></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>{result.algorithm_score.factors&&<div style={{background:C.jadelt,borderRadius:8,padding:"8px 10px"}}><SL ch="✅ 有利"/>{result.algorithm_score.factors.map((f,i)=><div key={i} style={{fontSize:11.5,color:C.ink,padding:"2px 0"}}>{f}</div>)}</div>}{result.algorithm_score.risks&&<div style={{background:C.roselt,borderRadius:8,padding:"8px 10px"}}><SL ch="⚠ 風險"/>{result.algorithm_score.risks.map((r,i)=><div key={i} style={{fontSize:11.5,color:C.ink,padding:"2px 0"}}>{r}</div>)}</div>}</div></Card>}{result.best_post_time&&<Card style={{background:C.goldlt,borderColor:C.gold}}><SL ch="⏰ 最佳發布時間"/><div style={{fontSize:12.5,color:C.ink}}>{result.best_post_time}</div></Card>}</div>);
}

function BrandBuildModule({saveVoice}){
  const[step,setStep]=useState(0);const[answers,setAnswers]=useState({});const[current,setCurrent]=useState("");const[loading,setLoading]=useState(false);const[result,setResult]=useState(null);const[saved,setSaved]=useState(false);
  const questions=[{key:"name",q:"你的品牌或頻道叫什麼名字？",placeholder:"例如：小林的生活日記"},{key:"product",q:"你主要賣什麼或分享什麼？",placeholder:"例如：手工蠟燭、健身課程"},{key:"audience",q:"你的主要受眾是誰？他們的痛點？",placeholder:"例如：30歲女性，工作壓力大"},{key:"personality",q:"希望品牌給人什麼感覺？3個形容詞",placeholder:"例如：溫柔、真實、有質感"},{key:"dislike",q:"你最不想要什麼感覺？",placeholder:"例如：不要太誇張、不要像傳統廣告"}];
  const q=questions[step];
  function next(){if(!current.trim())return;const na={...answers,[q.key]:current};setAnswers(na);setCurrent("");if(step<questions.length-1){setStep(step+1);}else{buildBrand(na);}}
  async function buildBrand(ans){setLoading(true);try{const raw=await forge("brand_build","gen",ans);setResult(pj(raw));}catch{}setLoading(false);}
  async function saveBrand(){if(!result)return;const err=await saveVoice({instructions:[result.voice,result.preferred&&`常用詞：${result.preferred}`,result.cta_style&&`CTA 風格：${result.cta_style}`].filter(Boolean).join("\n"),audience:result.audience,forbidden:result.forbidden});if(err){alert(err);return;}setSaved(true);}
  if(loading)return<Spin label="AI 正在建立品牌語氣..."/>;
  if(result)return(<div style={{display:"grid",gap:14}}><div><h2 style={{fontSize:19,fontWeight:900,color:C.black,fontFamily:"DM Serif Display,serif",marginBottom:3}}>品牌語氣已生成！</h2></div><div style={{background:C.coral,borderRadius:13,padding:18,color:C.white}}><div style={{fontSize:11,fontWeight:700,letterSpacing:1.5,marginBottom:3,opacity:.7}}>品牌定位</div><div style={{fontSize:17,fontWeight:900,fontFamily:"DM Serif Display,serif",marginBottom:5}}>{result.name}</div><div style={{fontSize:12.5,opacity:.85}}>{result.brand_summary}</div></div>{[["品牌語氣",result.voice],["目標受眾",result.audience]].map(([l,v])=><Card key={l}><SL ch={l}/><div style={{fontSize:12.5,color:C.ink,lineHeight:1.6}}>{v}</div></Card>)}<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><Card style={{borderColor:C.rose,background:C.roselt}}><SL ch="🚫 禁用"/><div style={{fontSize:12.5,color:C.ink}}>{result.forbidden}</div></Card><Card style={{borderColor:C.jade,background:C.jadelt}}><SL ch="✅ 偏好"/><div style={{fontSize:12.5,color:C.ink}}>{result.preferred}</div></Card></div>{result.sample_hooks&&<Card><SL ch="範例鉤子"/>{result.sample_hooks.map((h,i)=><div key={i} style={{fontSize:12.5,color:C.violet,fontStyle:"italic",padding:"4px 0",borderBottom:i<result.sample_hooks.length-1?`1px solid ${C.border}`:"none"}}>「{h}」</div>)}</Card>}<PBtn ch={saved?"✅ 已儲存！":"💾 儲存為品牌語氣"} onClick={saveBrand} full/><GBtn ch="重新填寫" onClick={()=>{setStep(0);setAnswers({});setCurrent("");setResult(null);setSaved(false);}} style={{width:"100%",padding:"10px"}}/></div>);
  return(<div style={{display:"grid",gap:18}}><div><h2 style={{fontSize:19,fontWeight:900,color:C.black,fontFamily:"DM Serif Display,serif",marginBottom:3}}>品牌速建</h2><p style={{fontSize:12.5,color:C.mid}}>AI問你5個問題，自動建立完整品牌語氣</p></div><div style={{display:"flex",gap:4,marginBottom:2}}>{questions.map((_,i)=><div key={i} style={{flex:1,height:3,borderRadius:99,background:i<=step?C.coral:C.border,transition:"background .3s"}}/>)}</div><Card style={{background:C.corallt,borderColor:C.coral,padding:22}}><div style={{fontSize:10.5,color:C.coral,fontWeight:700,letterSpacing:1,marginBottom:6}}>問題 {step+1} / {questions.length}</div><div style={{fontSize:16,fontWeight:800,color:C.black,lineHeight:1.4,marginBottom:14,fontFamily:"DM Serif Display,serif"}}>{q.q}</div><TA value={current} onChange={e=>setCurrent(e.target.value)} placeholder={q.placeholder} rows={3}/></Card><PBtn ch={step<questions.length-1?"下一題 →":"🧠 生成品牌語氣"} onClick={next} disabled={!current.trim()} full/></div>);
}

function BrandModule({site,saveVoice}){
  const d=site?.contentDefaults||{};const m=d.marketing||{};
  const[form,setForm]=useState({instructions:d.brandVoiceInstructions||"",tone:d.tone||"",audience:m.audience||"",forbidden:m.forbiddenClaims||"",primaryCta:m.primaryCta||""});const[saved,setSaved]=useState(false);const[err,setErr]=useState("");
  async function save(){const e=await saveVoice(form);if(e){setErr(e);return;}setErr("");setSaved(true);setTimeout(()=>setSaved(false),2000);}
  if(!site)return(<div style={{display:"grid",gap:10}}><h2 style={{fontSize:19,fontWeight:900,color:C.black,fontFamily:"DM Serif Display,serif",marginBottom:3}}>品牌語氣設定</h2><p style={{fontSize:12.5,color:C.mid}}>先在右上「載入客戶」選一個客戶。品牌語氣存在客戶的網站設定，文章、社群貼文和腳本共用同一份。</p></div>);
  return(<div style={{display:"grid",gap:18}}><div><h2 style={{fontSize:19,fontWeight:900,color:C.black,fontFamily:"DM Serif Display,serif",marginBottom:3}}>品牌語氣設定</h2><p style={{fontSize:12.5,color:C.mid}}>存在「{site.name}」的客戶設定；文章、社群貼文和所有腳本模組共用這一份</p></div>{[["品牌語氣描述","instructions","area","例如：溫柔、專業、有藝術感，像一位耐心的導師"],["語氣","tone","text","例如：溫暖、專業"],["目標受眾","audience","text","例如：25–35歲想學創作的上班族"],["禁用詞","forbidden","area","例如：爆款、逆襲、財富自由"],["主要行動呼籲","primaryCta","text","例如：預約免費體驗課"]].map(([l,k,type,ph])=><div key={k}><SL ch={l}/>{type==="area"?<TA value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})} placeholder={ph} rows={3}/>:<IN value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})} placeholder={ph}/>}</div>)}{err&&<div style={{fontSize:12,color:C.rose}}>{err}</div>}<PBtn ch={saved?"✅ 已儲存！":"💾 儲存品牌語氣"} onClick={save} full/></div>);
}

function CalendarModule({brand}){
  const[theme,setTheme]=useState("");const[platform,setPlatform]=useState("");const[goal,setGoal]=useState("");const[loading,setLoading]=useState(false);const[plan,setPlan]=useState(null);const[ew,setEw]=useState(0);
  const tC={"教學":[C.sky,C.skylt],"故事":[C.violet,C.violetl],"爭議":[C.rose,C.roselt],"娛樂":[C.gold,C.goldlt],"銷售":[C.jade,C.jadelt],"分享":[C.coral,C.corallt]};
  async function doPlan(){if(!theme||!platform)return;setLoading(true);setPlan(null);const plat=PLATFORMS.find(p=>p.id===platform)?.label||"";try{const raw=await forge("calendar","plan",{theme,plat,goal});setPlan(pj(raw));}catch{}setLoading(false);}
  if(!plan)return(<div style={{display:"grid",gap:18}}><div><h2 style={{fontSize:19,fontWeight:900,color:C.black,fontFamily:"DM Serif Display,serif",marginBottom:3}}>30 天內容計畫</h2><p style={{fontSize:12.5,color:C.mid}}>設定主題，一次生成整個月的腳本主題</p></div><div><SL ch="頻道主題 *"/><IN value={theme} onChange={e=>setTheme(e.target.value)} placeholder="例如：學畫畫教學、個人理財..."/></div><div><SL ch="平台 *"/><PlatGrid value={platform} onChange={setPlatform}/></div><div><SL ch="內容目的"/><div style={{display:"flex",flexWrap:"wrap",gap:5}}>{GOALS.map(g=><Pill key={g} label={g} active={goal===g} onClick={()=>setGoal(g)}/>)}</div></div>{loading&&<Spin label="AI 正在規劃 30 天計畫..."/>}{!loading&&<PBtn ch="📅 生成 30 天計畫 →" onClick={doPlan} disabled={!theme||!platform} full/>}</div>);
  return(<div><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><h2 style={{fontSize:17,fontWeight:900,color:C.black,fontFamily:"DM Serif Display,serif",margin:0}}>30 天計畫</h2><GBtn ch="重新生成" onClick={()=>setPlan(null)}/></div>{plan.overview&&<Card style={{marginBottom:10,background:C.goldlt,borderColor:C.gold}}><SL ch="整體策略"/><div style={{fontSize:12.5,color:C.ink,lineHeight:1.6}}>{plan.overview}</div></Card>}{plan.weeks?.map((week,wi)=><div key={wi} style={{marginBottom:8}}><button onClick={()=>setEw(ew===wi?-1:wi)} style={{width:"100%",padding:"11px 15px",background:ew===wi?C.coral:C.white,border:`1.5px solid ${ew===wi?C.coral:C.border}`,borderRadius:ew===wi?"11px 11px 0 0":11,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",fontFamily:"inherit",transition:"all .2s"}}><div style={{display:"flex",alignItems:"center",gap:9}}><span style={{fontWeight:800,fontSize:13.5,color:ew===wi?C.white:C.black}}>第 {week.week} 週</span><span style={{fontSize:12,color:ew===wi?"rgba(255,255,255,.8)":C.mid}}>{week.theme}</span></div><span style={{color:ew===wi?C.white:C.mid,fontSize:13}}>{ew===wi?"▲":"▼"}</span></button>{ew===wi&&<div style={{border:`1.5px solid ${C.coral}`,borderTop:"none",borderRadius:"0 0 11px 11px",overflow:"hidden"}}>{week.days?.map((day,di)=>{const[col,bg]=tC[day.type]||[C.coral,C.corallt];return(<div key={di} style={{padding:"9px 14px",borderBottom:di<week.days.length-1?`1px solid ${C.border}`:"none",background:di%2===0?C.white:C.paper,display:"flex",gap:9,alignItems:"flex-start"}}><div style={{width:24,height:24,borderRadius:6,background:bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9.5,fontWeight:800,color:col,flexShrink:0}}>{day.day}</div><div style={{flex:1}}><div style={{display:"flex",alignItems:"center",gap:5,marginBottom:2}}><Tag ch={day.type} c={col} bg={bg} small/><span style={{fontSize:12.5,fontWeight:700,color:C.black}}>{day.title}</span></div><div style={{fontSize:11,color:C.violet,fontStyle:"italic",marginBottom:1}}>「{day.hook}」</div><div style={{fontSize:11,color:C.mid}}>{day.angle}</div></div></div>);})}</div>}</div>)}</div>);
}

function ProposalModule(){
  const[client,setClient]=useState({name:"",industry:"",product:"",goal:"",budget:""});const[loading,setLoading]=useState(false);const[proposal,setProposal]=useState(null);const[copied,setCopied]=useState(false);
  async function doGen(){if(!client.name||!client.product)return;setLoading(true);setProposal(null);try{const raw=await forge("proposal","gen",client);setProposal(pj(raw));}catch{}setLoading(false);}
  function copyProposal(){if(!proposal)return;let t=`# ${proposal.proposal_title}\n客戶：${proposal.client_name}\n\n## 執行摘要\n${proposal.executive_summary}\n\n## 核心訊息\n${proposal.content_strategy?.core_message}\n\n## 三個月計畫\n${proposal.execution_plan?.month1}\n${proposal.execution_plan?.month2}\n${proposal.execution_plan?.month3}\n\n## 預期成果\n${proposal.expected_results?.join("\n")}\n\n## 下一步\n${proposal.next_steps?.join("\n")}\n\n${proposal.closing}`;navigator.clipboard.writeText(t);setCopied(true);setTimeout(()=>setCopied(false),2000);}
  if(!proposal)return(<div style={{display:"grid",gap:18}}><div><h2 style={{fontSize:19,fontWeight:900,color:C.black,fontFamily:"DM Serif Display,serif",marginBottom:3}}>客戶提案包</h2><p style={{fontSize:12.5,color:C.mid}}>輸入客戶資訊，生成完整策略提案</p></div>{[["客戶名稱 *","name","text","例如：林小姐的手工蠟燭品牌"],["產品/服務 *","product","area","詳細描述..."],["所屬產業","industry","text","例如：手工藝"],["行銷目標","goal","text","例如：三個月增加1000追蹤"],["預算規模","budget","text","例如：小型5萬以下"]].map(([l,k,type,ph])=><div key={k}><SL ch={l}/>{type==="area"?<TA value={client[k]} onChange={e=>setClient({...client,[k]:e.target.value})} placeholder={ph} rows={3}/>:<IN value={client[k]} onChange={e=>setClient({...client,[k]:e.target.value})} placeholder={ph}/>}</div>)}{loading&&<Spin label="AI 正在生成客戶提案..."/>}{!loading&&<PBtn ch="📦 生成客戶提案包 →" onClick={doGen} disabled={!client.name||!client.product} full/>}</div>);
  return(<div style={{display:"grid",gap:12}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><h2 style={{fontSize:17,fontWeight:900,color:C.black,fontFamily:"DM Serif Display,serif",margin:0}}>{proposal.proposal_title}</h2><div style={{display:"flex",gap:7}}><GBtn ch={copied?"✅ 已複製":"📋 複製全文"} onClick={copyProposal}/><GBtn ch="重新生成" onClick={()=>setProposal(null)}/></div></div><div style={{background:C.coral,borderRadius:12,padding:18,color:C.white}}><SL ch="執行摘要"/><div style={{fontSize:13,lineHeight:1.7}}>{proposal.executive_summary}</div></div><Card><SL ch="🎯 核心訊息"/><div style={{fontSize:13.5,color:C.coral,fontWeight:700,marginBottom:5}}>{proposal.content_strategy?.core_message}</div><div style={{fontSize:12,color:C.mid}}>{proposal.content_strategy?.target_audience}</div></Card><Card><SL ch="🎬 範例腳本方向"/>{proposal.sample_scripts?.map((s,i)=><div key={i} style={{padding:"8px 0",borderBottom:i<proposal.sample_scripts.length-1?`1px solid ${C.border}`:"none"}}><div style={{fontSize:12.5,fontWeight:700,color:C.black,marginBottom:2}}>{i+1}. {s.title}</div><div style={{fontSize:11.5,color:C.violet,fontStyle:"italic",marginBottom:1}}>「{s.hook}」</div><div style={{fontSize:11.5,color:C.mid}}>{s.angle}</div></div>)}</Card><Card style={{background:C.jadelt,borderColor:C.jade}}><SL ch="📅 三個月計畫"/>{[["第一個月",proposal.execution_plan?.month1],["第二個月",proposal.execution_plan?.month2],["第三個月",proposal.execution_plan?.month3]].map(([l,v])=><div key={l} style={{padding:"6px 0",borderBottom:`1px solid rgba(0,168,120,.15)`}}><span style={{fontSize:10.5,color:C.jade,fontWeight:700,marginRight:7}}>{l}</span><span style={{fontSize:12.5,color:C.ink}}>{v}</span></div>)}</Card>{proposal.expected_results&&<Card><SL ch="📈 預期成果"/>{proposal.expected_results.map((r,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:7,padding:"5px 0",borderBottom:i<proposal.expected_results.length-1?`1px solid ${C.border}`:"none"}}><div style={{width:5,height:5,borderRadius:"50%",background:C.jade,flexShrink:0}}/><span style={{fontSize:12.5,color:C.ink}}>{r}</span></div>)}</Card>}{proposal.closing&&<Card style={{textAlign:"center",background:C.paper}}><div style={{fontSize:13,color:C.ink,lineHeight:1.7,fontStyle:"italic",fontFamily:"DM Serif Display,serif"}}>{proposal.closing}</div></Card>}</div>);
}

function HistoryModule({setNav}){
  const[history,setHistory]=useState(getHistory());const[selected,setSelected]=useState(null);const[search,setSearch]=useState("");const[copied,setCopied]=useState(false);
  function clearAll(){localStorage.removeItem("sf_history");setHistory([]);setSelected(null);}
  const filtered=history.filter(h=>!search||(h.title||"").includes(search)||(h.tag||"").includes(search)||(h.hook||"").includes(search));
  const tC={"手動生成":[C.coral,C.corallt],"文章轉腳本":[C.violet,C.violetl],"廣告A/B":[C.jade,C.jadelt],"品牌故事":[C.gold,C.goldlt],"SEO轉腳本":[C.sky,C.skylt]};
  return(<div style={{display:"grid",gap:18}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}><div><h2 style={{fontSize:19,fontWeight:900,color:C.black,fontFamily:"DM Serif Display,serif",marginBottom:3}}>腳本歷史紀錄</h2><p style={{fontSize:12.5,color:C.mid}}>儲存最近 50 筆，自動記錄</p></div>{history.length>0&&<GBtn ch="清除全部" onClick={clearAll} style={{fontSize:11.5,padding:"5px 10px",color:C.rose,borderColor:C.rose}}/>}</div>{history.length===0&&<div style={{textAlign:"center",padding:"60px 0",color:C.mid}}><div style={{fontSize:32,marginBottom:10}}>📝</div><div style={{fontSize:14,fontWeight:600}}>還沒有歷史紀錄</div><div style={{fontSize:12.5,marginTop:4}}>使用任何生成功能後，腳本會自動儲存在這裡</div><PBtn ch="開始生成腳本 →" onClick={()=>setNav("manual")} style={{marginTop:16}}/></div>}{history.length>0&&<><IN value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜尋標題、標籤或鉤子..."/>{!selected&&<div style={{display:"grid",gap:8}}>{filtered.map((h)=>{const[col,bg]=(Object.entries(tC).find(([k])=>h.tag?.includes(k)))||[[C.coral,C.corallt]];return(<div key={h.id} onClick={()=>setSelected(h)} style={{background:C.white,border:`1.5px solid ${C.border}`,borderRadius:11,padding:"12px 15px",cursor:"pointer",transition:"all .15s",display:"flex",gap:10,alignItems:"flex-start"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=C.coral;}} onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;}}><div style={{flex:1}}><div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}><Tag ch={h.tag||"腳本"} c={col} bg={bg} small/><span style={{fontSize:10.5,color:C.mid}}>{h.ts}</span></div><div style={{fontSize:13.5,fontWeight:700,color:C.black,lineHeight:1.3,marginBottom:2}}>{h.title||"未命名"}</div>{h.hook&&<div style={{fontSize:11.5,color:C.violet,fontStyle:"italic"}}>「{h.hook?.slice(0,40)}...」</div>}</div><span style={{fontSize:12,color:C.coral,fontWeight:600,flexShrink:0}}>查看 →</span></div>);})}</div>}{selected&&<div style={{display:"grid",gap:12}}><div style={{display:"flex",alignItems:"center",gap:9}}><GBtn ch="← 返回" onClick={()=>setSelected(null)}/><div style={{fontSize:11,color:C.mid}}>{selected.ts}</div></div><div style={{background:C.coral,borderRadius:13,padding:20,color:C.white}}><div style={{fontSize:11,opacity:.7,marginBottom:4}}>{selected.tag}</div><div style={{fontSize:18,fontWeight:900,fontFamily:"DM Serif Display,serif",marginBottom:7}}>{selected.title}</div>{selected.hook&&<div style={{background:"rgba(255,255,255,.15)",borderRadius:8,padding:"9px 12px"}}><div style={{fontSize:11,opacity:.7,marginBottom:2}}>開頭鉤子</div><div style={{fontSize:13.5,fontStyle:"italic",fontFamily:"DM Serif Display,serif"}}>「{selected.hook}」</div></div>}</div>{selected.script?.scenes&&<div><SL ch="分鏡腳本"/><div style={{display:"grid",gap:8}}>{selected.script.scenes.map((s,i)=><SceneCard key={i} scene={s} idx={i}/>)}</div></div>}{selected.script?.cta&&<Card style={{borderColor:C.violet,background:C.violetl}}><SL ch="CTA"/><div style={{fontSize:13.5,color:C.violet,fontStyle:"italic",fontFamily:"DM Serif Display,serif"}}>「{selected.script.cta}」</div></Card>}{selected.script?.titles&&<Card><SL ch="標題建議"/>{selected.script.titles.map((t,i)=><div key={i} style={{fontSize:12.5,color:C.ink,padding:"4px 0",borderBottom:i<selected.script.titles.length-1?`1px solid ${C.border}`:"none"}}><span style={{color:C.mid,fontWeight:700,marginRight:5}}>{i+1}.</span>{t}</div>)}</Card>}<GBtn ch={copied?"✅ 已複製":"📋 複製腳本"} onClick={()=>{let t=`# ${selected.title}\n\n鉤子：${selected.hook}\n\n`;selected.script?.scenes?.forEach(s=>{t+=`【${s.time}】台詞：${s.dialogue}\n`;});t+=`\nCTA：${selected.script?.cta}`;navigator.clipboard.writeText(t);setCopied(true);setTimeout(()=>setCopied(false),2000);}} style={{width:"100%",padding:"10px"}}/></div>}</>}</div>);
}

/* ═══ ROOT ═══ */
export default function ScriptForge({ onSendToVideo, videoNeedsClient = false, sideMenu = false, saveSocialDraft }: { onSendToVideo?: SendToVideo; /** the standalone page: a video project is created for the loaded client */ videoNeedsClient?: boolean; /** the standalone page: modules in a left column with their one-line blurbs */ sideMenu?: boolean; saveSocialDraft?: SaveSocialDraft } = {}){
  const { why } = usePaidFeatures();
  SF_NOT_USABLE = why("video.script");
  const notUsable = SF_NOT_USABLE;
  const[nav,setNav]=useState("manual");
  const[siteId,setSiteId]=useState<string>(()=>{try{return localStorage.getItem("sf_site")||"";}catch{return "";}});
  const groups=["生成","工具","分析","設定","規劃","紀錄"];
  // Side menu groups fold like the app sidebar (SidebarNav.tsx): only the current module's group starts open.
  const[openGroups,setOpenGroups]=useState<Set<string>>(()=>new Set([FORGE_NAV.find(n=>n.id===nav)?.group??"生成"]));
  // Switching module (e.g. 紀錄's 「開始生成腳本」) opens its group, so the current item is never hidden.
  useEffect(()=>{const g=FORGE_NAV.find(n=>n.id===nav)?.group;if(g)setOpenGroups(prev=>prev.has(g)?prev:new Set(prev).add(g));},[nav]);
  function toggleGroup(g:string){setOpenGroups(prev=>{const next=new Set(prev);if(next.has(g))next.delete(g);else next.add(g);return next;});}
  const gNavs=groups.map(g=>({group:g,items:NAVS.filter(n=>n.group===g)}));
  // ── 串接客戶：載入 內容工具›網站管理 的客戶 contentDefaults.marketing 當品牌語境（零新後端，GET 已回 marketing）──
  const[clients,setClients]=useState<any[]>([]);
  const[model,setModel]=useState<string>(SF_MODEL);
  const[lang,setLang]=useState<string>(SF_LANG);
  const[sceneCount,setSceneCount]=useState(6);
  const[customScenes,setCustomScenes]=useState(3);
  function updateSceneCount(n: number) {
    const next = Math.max(1, Math.min(20, Math.round(n)));
    setSceneCount(next);
    SF_SCENE_COUNT = next;
    setCustomScenes((prev) => {
      const clamped = clampCustomScenes(prev, next);
      SF_CUSTOM_SCENES = clamped;
      return clamped;
    });
  }
  function updateCustomScenes(n: number) {
    const next = clampCustomScenes(n, sceneCount);
    setCustomScenes(next);
    SF_CUSTOM_SCENES = next;
  }
  // active 過濾已移到 route.ts GET 的預設（2026-08-26）；這裡原本自己濾一次，是把同一條
  // 規則放在消費端的第二份抄本 —— ContentStudio 沒抄到那份，死站就漏出去了。刪掉抄本。
  useEffect(()=>{(async()=>{try{const r=await fetch("/api/content/sites");const j=await r.json();if(j?.ok&&Array.isArray(j.sites))setClients(j.sites);}catch{/* best-effort：未登入/無客戶 → 下拉為空 */}})();},[]);
  // 品牌語氣只有一份：所選客戶網站的 content_defaults（lib/content/brand-voice.ts）。這台電腦只記住選了哪個客戶。
  const site=clients.find((c:any)=>c.id===siteId)||null;
  SF_SITE_ID=site?.id||"";
  SF_BRAND_ORG=site?.organization_id||"";
  const brand=useMemo(()=>site?{name:site.name,voice:renderSiteVoice(site.contentDefaults)||site.name,forbidden:site.contentDefaults?.marketing?.forbiddenClaims||"",_clientId:site.id}:null,[site]);
  function pickSite(id:string){setSiteId(id);try{if(id)localStorage.setItem("sf_site",id);else localStorage.removeItem("sf_site");}catch{}}
  /** Writes the given fields into the selected client's content_defaults; undefined = keep, "" = clear. Returns an error to show, or null. */
  async function saveVoice(f:{instructions?:string;tone?:string;audience?:string;forbidden?:string;primaryCta?:string}):Promise<string|null>{
    if(!site)return "先在右上「載入客戶」選一個客戶，品牌語氣存在客戶的網站設定。";
    const d=site.contentDefaults||{};const m=d.marketing||{};
    const pick=(v:string|undefined,old:string|undefined)=>v===undefined?old:(v.trim()||undefined);
    const contentDefaults={...d,brandVoiceInstructions:pick(f.instructions,d.brandVoiceInstructions),tone:pick(f.tone,d.tone),marketing:{...m,audience:pick(f.audience,m.audience),forbiddenClaims:pick(f.forbidden,m.forbiddenClaims),primaryCta:pick(f.primaryCta,m.primaryCta)}};
    try{
      const r=await fetch(`/api/content/sites/${site.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({contentDefaults})});
      const j=await r.json().catch(()=>null);
      if(!r.ok||!j?.ok)return `儲存失敗：${j?.error??r.status}`;
      setClients(prev=>prev.map((c:any)=>c.id===site.id?{...c,contentDefaults:j.site?.contentDefaults??contentDefaults}:c));
      return null;
    }catch{return "網路錯誤，請重試";}
  }
  return(
    <ScriptSettingsCtx.Provider value={{ sceneCount, customScenes }}>
    <VideoBridge.Provider value={onSendToVideo ? { send: onSendToVideo, needsClient: videoNeedsClient } : null}>
    <SocialDraftBridge.Provider value={saveSocialDraft ?? null}>
    <div style={{minHeight:"100vh",background:C.paper,fontFamily:"DM Sans,sans-serif"}}>
    {notUsable&&<div role="status" style={{padding:"10px 16px",background:C.corallt,color:C.coral,fontSize:13,fontWeight:600}}>腳本生成：{notUsable}，按鈕會直接回報這個原因。</div>}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800&family=DM+Serif+Display:ital@0;1&display=swap');
        @keyframes bonce{from{transform:translateY(0)}to{transform:translateY(-8px)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes flash{from{opacity:.3}to{opacity:0}}
        @keyframes slideDown{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
        @keyframes float1{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-10px,15px) scale(1.05)}}
        @keyframes float2{0%,100%{transform:translate(0,0)}50%{transform:translate(8px,-12px)}}
        *{box-sizing:border-box;margin:0;padding:0;}
        ::placeholder{color:${C.mid};}
        textarea,input,button{font-family:"DM Sans",sans-serif;}
        .sf-side{display:grid;grid-template-columns:minmax(0,1fr) 250px;gap:18px;align-items:start;max-width:1220px!important}
        .sf-side>*{grid-column:1;min-width:0}
        .sf-side>aside{grid-column:2;grid-row:1}
        @media (max-width:767px){.sf-side{grid-template-columns:minmax(0,1fr)}.sf-side>aside{grid-column:1;grid-row:auto;order:2;position:static!important}}
        ::-webkit-scrollbar{width:3px;}
        ::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px;}
      `}</style>
      <nav style={{background:C.white,borderBottom:`1.5px solid ${C.border}`,position:"sticky",top:0,zIndex:100}}>
        <div style={{maxWidth:960,margin:"0 auto",padding:"0 14px"}}>
          <div style={{display:"flex",alignItems:"center",height:50,gap:0}}>
            <div style={{display:"flex",alignItems:"center",gap:7,paddingRight:14,borderRight:`1.5px solid ${C.border}`,marginRight:12,flexShrink:0}}>
              <div style={{width:27,height:27,borderRadius:7,background:C.coral,display:"flex",alignItems:"center",justifyContent:"center",color:C.white,fontWeight:900,fontSize:13,fontFamily:"DM Serif Display,serif"}}>S</div>
              <span style={{fontWeight:800,fontSize:13.5,color:C.black,letterSpacing:"-.3px",whiteSpace:"nowrap"}}>ScriptForge<span style={{color:C.coral}}> AI</span></span>
            </div>
            <div style={{display:"flex",gap:0,flex:1,overflowX:"auto",scrollbarWidth:"none"}}>
              {!sideMenu&&gNavs.map(({group,items})=><div key={group} style={{display:"flex",alignItems:"center",gap:1,paddingRight:8,marginRight:8,borderRight:`1px solid ${C.border}`,flexShrink:0}}>
                <span style={{fontSize:9,color:C.mid,fontWeight:700,letterSpacing:.5,marginRight:2,whiteSpace:"nowrap",textTransform:"uppercase"}}>{group}</span>
                {items.map(n=><button key={n.id} onClick={()=>setNav(n.id)} style={{padding:"5px 8px",borderRadius:6,border:"none",background:nav===n.id?C.corallt:"transparent",color:nav===n.id?C.coral:C.mid,fontWeight:nav===n.id?700:400,fontSize:11,cursor:"pointer",whiteSpace:"nowrap",transition:"all .15s",fontFamily:"inherit",flexShrink:0}}>{n.icon} {n.label}</button>)}
              </div>)}
            </div>
          </div>
        </div>
      </nav>

      {/* 設定列：使用流程提示 + AI 模型 + 載入客戶（從擠爆的 nav 移出，對齊 Content Studio 體驗）*/}
      <div style={{background:C.white,borderBottom:`1.5px solid ${C.border}`}}>
        <div style={{maxWidth:960,margin:"0 auto",padding:"9px 14px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <span style={{fontSize:11.5,color:C.mid,lineHeight:1.5}}>
            <b style={{color:C.ink}}>怎麼用：</b>① {sideMenu?"左邊":"上方"}選功能（預設「手動生成」）→ ② 填主題、按生成 → ③ 結果頁按「<b style={{color:C.coral}}>🎬 送去做影片</b>」轉成影片
          </span>
          <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <label style={{fontSize:11,color:C.mid,fontWeight:700,whiteSpace:"nowrap"}}>🌐 語言</label>
            <select value={lang} onChange={e=>{setLang(e.target.value);SF_LANG=e.target.value;}} title="腳本輸出語言（與你打的主題語言無關）" style={{padding:"5px 9px",borderRadius:7,border:`1.5px solid ${C.border}`,background:C.white,color:C.ink,fontSize:11.5,fontFamily:"inherit",cursor:"pointer"}}>
              {SF_LANGS.map((l)=><option key={l} value={l}>{l}</option>)}
            </select>
            <label style={{fontSize:11,color:C.mid,fontWeight:700,whiteSpace:"nowrap"}}>🎞 場景</label>
            <select value={sceneCount} onChange={e=>updateSceneCount(Number(e.target.value))} title="腳本場景總數：AI 會依此決定內容量；影片區只負責生產" style={{padding:"5px 9px",borderRadius:7,border:`1.5px solid ${C.border}`,background:C.white,color:C.ink,fontSize:11.5,fontFamily:"inherit",cursor:"pointer"}}>
              {[4,6,8,10,12,16,20].map((n)=><option key={n} value={n}>{n} 場</option>)}
            </select>
            <label style={{fontSize:11,color:C.mid,fontWeight:700,whiteSpace:"nowrap"}}>🎨 AI 生圖</label>
            <select value={customScenes} onChange={e=>updateCustomScenes(Number(e.target.value))} title="前製素材分配：腳本會依此標記 custom / broll，送去影片生產時照此執行" style={{padding:"5px 9px",borderRadius:7,border:`1.5px solid ${C.border}`,background:C.white,color:C.ink,fontSize:11.5,fontFamily:"inherit",cursor:"pointer"}}>
              {Array.from({length:sceneCount+1},(_,n)=><option key={n} value={n}>{n} 場</option>)}
            </select>
            <span style={{fontSize:10.5,color:C.mid,whiteSpace:"nowrap"}}>圖庫補 {sceneCount-customScenes} 場</span>
            <label style={{fontSize:11,color:C.mid,fontWeight:700,whiteSpace:"nowrap"}}>🤖 AI 模型</label>
            <select value={model} onChange={e=>{setModel(e.target.value);SF_MODEL=e.target.value;}} title="文字 AI 模型（與內容工具共用同一份選單）" style={{padding:"5px 9px",borderRadius:7,border:`1.5px solid ${C.border}`,background:C.white,color:C.ink,fontSize:11.5,fontFamily:"inherit",cursor:"pointer"}}>
              {["Claude","OpenAI"].map((g)=><optgroup key={g} label={g}>{AI_TEXT_MODELS.filter((m)=>m.group===g).map((m)=><option key={m.value} value={m.value}>{m.label}</option>)}</optgroup>)}
            </select>
            {clients.length>0&&<select value={siteId} onChange={e=>pickSite(e.target.value)} title="載入客戶品牌語境（來自 內容工具 › 網站管理 的行銷預設）" style={{padding:"5px 9px",borderRadius:7,border:`1.5px solid ${C.border}`,background:C.white,color:C.ink,fontSize:11.5,fontFamily:"inherit",cursor:"pointer",maxWidth:160}}>
              <option value="">👤 載入客戶…</option>
              {clients.map((c:any)=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>}
            {brand?.name&&<div style={{padding:"3px 9px",background:C.jadelt,borderRadius:999,fontSize:10.5,color:C.jade,fontWeight:700,whiteSpace:"nowrap"}}>✅ {brand.name}</div>}
          </div>
        </div>
      </div>
      {/* 場景總數與 AI/圖庫分配已回到前製腳本；影片生產只負責素材模式、模型、配音、輸出比例與渲染。 */}
      <div className={sideMenu?"sf-side":undefined} style={{maxWidth:960,margin:"0 auto",padding:"22px 14px 80px",animation:"fadeUp .3s ease"}}>
        {sideMenu&&<aside aria-label="ScriptForge 模組" style={{position:"sticky",top:62,background:"var(--sidebar-bg)",border:"1px solid var(--sidebar-border)",borderRadius:10,paddingBottom:8}}>
          {groups.map(g=>{const isOpen=openGroups.has(g);return <div key={g} className="sidebar-section">
            <button type="button" className="sidebar-section-label sidebar-section-toggle" aria-expanded={isOpen} onClick={()=>toggleGroup(g)}>
              <span className="sidebar-chevron" aria-hidden>{isOpen?"▾":"▸"}</span>{g}
            </button>
            {isOpen&&FORGE_NAV.filter(n=>n.group===g).map(n=><button key={n.id} type="button" onClick={()=>setNav(n.id)} aria-current={nav===n.id?"page":undefined} className={nav===n.id?"sidebar-link active":"sidebar-link"}>
              <span className="sidebar-icon">{n.icon}</span><span style={{display:"grid",gap:1}}><span>{n.label}</span><span style={{fontSize:11,color:"var(--sidebar-section-label)",lineHeight:1.4,fontWeight:"normal"}}>{n.blurb}</span></span>
            </button>)}
          </div>;})}
        </aside>}
        {nav==="story_bible"&&<StoryBibleWorkbench/>}
        {nav==="manual"&&<ManualModule brand={brand}/>}
        {nav==="article"&&<ArticleModule brand={brand}/>}
        {nav==="industry"&&<IndustryModule saveVoice={saveVoice} brand={brand}/>}
        {nav==="ab"&&<ABModule brand={brand}/>}
        {nav==="host"&&<HostModule/>}
        {nav==="brand_story"&&<BrandStoryModule brand={brand}/>}
        {nav==="sales"&&<SalesModule/>}
        {nav==="speech"&&<SpeechModule/>}
        {nav==="pitch"&&<PitchModule/>}
        {nav==="seo"&&<SEOModule brand={brand}/>}
        {nav==="hook"&&<HookModule/>}
        {nav==="pain"&&<PainModule/>}
        {nav==="viral"&&<ViralModule/>}
        {nav==="thumbnail"&&<ThumbnailModule/>}
        {nav==="repurpose"&&<RepurposeModule/>}
        {nav==="translate"&&<TranslateModule/>}
        {nav==="preview"&&<PreviewModule/>}
        {nav==="predict"&&<PredictModule/>}
        {nav==="brand_build"&&<BrandBuildModule saveVoice={saveVoice}/>}
        {nav==="brand"&&<BrandModule key={siteId} site={site} saveVoice={saveVoice}/>}
        {nav==="calendar"&&<CalendarModule brand={brand}/>}
        {nav==="proposal"&&<ProposalModule/>}
        {nav==="history"&&<HistoryModule setNav={setNav}/>}
      </div>
    </div>
    </SocialDraftBridge.Provider>
    </VideoBridge.Provider>
    </ScriptSettingsCtx.Provider>
  );
}
