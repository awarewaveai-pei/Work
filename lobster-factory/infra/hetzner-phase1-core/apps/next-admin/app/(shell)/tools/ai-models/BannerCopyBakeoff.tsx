// 實測紀錄 → 橫幅：生成文案. The 2026-11-26 production run (12 models, same brief), grouped by what the result means for
// the 促銷 button rather than by price. Copies are verbatim; NT$ / seconds are ai_call_logs 11:05:24-33.
// Tiers are Claude's first read except GPT-6.2 sol, which the operator judged poor on her own 精油 run.

type Copy = [headline: string, sub: string];
type Model = { name: string; ntd: string; sec: number; note: string; copies: Copy[]; isDefault?: boolean };
type Tier = { key: string; title: string; why: string; tone: string; models: Model[] };

const TIERS: Tier[] = [
  {
    key: "best", title: "推薦", why: "照「促銷」寫，五組切入點不同，可以直接放上橫幅", tone: "var(--accent-text)",
    models: [
      { name: "Claude Sonnet 5.5", ntd: "0.14", sec: 6, note: "推薦組裡最便宜、最快；新客、感情、年度運勢等角度都有。", copies: [
        ["塔羅解惑｜限時首次體驗85折", "感情、事業、財運一次看清，立即預約你的專屬牌陣解讀"],
        ["迷惘時刻，讓塔羅給你答案", "本週預約加贈延伸追問10分鐘，名額有限，立即搶位"],
        ["抽一張牌，看見未來的方向", "新客限定免費抽牌指引，現在點擊即可領取你的牌義"],
        ["年度運勢塔羅，早鳥優惠開跑", "整年運勢完整解析，現在下單享早鳥價，優惠只到本月底"],
        ["愛情卡關？塔羅幫你找出關鍵", "專業牌卡老師一對一解讀，今日預約再送牌陣解析報告"],
      ] },
      { name: "Claude Fable 5.1", ntd: "0.59", sec: 9, note: "標題最有記憶點。", copies: [
        ["塔羅限時優惠，解答你的迷惘", "本週下單享85折，立即預約專屬占卜"],
        ["愛情事業財運，一次看清", "新客首占只要299元，點我搶先預約"],
        ["你的未來，牌早就知道", "限量名額每日開放，點擊鎖定今日折扣"],
        ["迷惘時刻，讓塔羅指路", "買一送一體驗價，分享給需要的朋友"],
        ["三張牌，看透眼前的選擇", "活動只到月底，現在預約再送解牌報告"],
      ] },
      { name: "Claude Opus 5.5", ntd: "0.72", sec: 12, note: "唯一把塔羅牌當商品賣；最慢也最貴。", copies: [
        ["新手塔羅牌組限時75折", "附中文解牌手冊，今天下單免運到府"],
        ["抽一張牌，看清你的下一步", "經典偉特塔羅牌，首購再折百元立即入手"],
        ["買塔羅送牌布，數量有限", "精美絨布牌袋＋占卜桌布，送完為止快搶購"],
        ["週末塔羅特賣，全館8折起", "原創牌卡、水晶配件一次買齊，點擊搶先逛"],
        ["78張牌，解答你的心中疑問", "零基礎也能上手，買牌加贈線上教學課程"],
      ] },
    ],
  },
  {
    key: "ok", title: "可用，但普通", why: "有照促銷寫，用語平常或五組太像", tone: "var(--text-primary)",
    models: [
      { name: "Claude Haiku 5.5", ntd: "0.01", sec: 4, note: "最便宜；五組都是「限時、限量」，變化少。", copies: [
        ["限時優惠！塔羅占卜首次體驗半價", "現在預約塔羅諮詢，名額有限，立即搶購專屬解惑時段"],
        ["今日特惠，揭開你的命運之牌", "塔羅解牌限時五折起，點擊即刻開始你的指引之旅"],
        ["限量促銷！塔羅牌組買一送一", "精選正版塔羅牌限時優惠，數量有限，先搶先得"],
        ["心中有疑問？塔羅給你答案", "促銷期間加購解讀服務享八折，馬上預約你的專屬占卜"],
        ["週末限定！塔羅占卜超值方案", "三次解讀組合價大幅優惠，立即點擊，把握這次機會"],
      ] },
      { name: "GPT-5.4", ntd: "0.11", sec: 6, note: "短、可用，用語普通。", copies: [
        ["今天的答案牌上見", "立即抽牌占卜，解開感情工作疑問"],
        ["你的下一步塔羅告訴你", "限時體驗占卜，現在就看專屬指引"],
        ["愛情事業運勢一次看", "一鍵抽牌，快速獲得當下清晰方向"],
        ["迷惘時刻讓塔羅指路", "立即測問未來走向，把握關鍵時機"],
        ["專屬塔羅解讀立即揭曉", "現在就抽一張牌，看看宇宙想告訴你"],
      ] },
      { name: "GPT-5.5", ntd: "0.25", sec: 7, note: "字數最短，可用但普通。", copies: [
        ["塔羅指引限時開占", "現在預約，揭開你的關鍵答案"],
        ["看見命運下一步", "專屬塔羅解讀，限時優惠中"],
        ["愛情事業一牌看清", "立即抽牌，掌握你的轉機"],
        ["你的答案牌裡有", "限時體驗塔羅，為迷惘找方向"],
        ["開啟專屬塔羅訊息", "今日占卜優惠，錯過再等下次"],
      ] },
    ],
  },
  {
    key: "soft", title: "沒有促銷感", why: "文字溫和、像生活提案；比較適合「品牌形象」語氣，不適合促銷", tone: "var(--text-secondary)",
    models: [
      { name: "GPT-6 luna", ntd: "0.01", sec: 7, note: "通順但空泛，五組差不多。", copies: [
        ["揭開命運指引，遇見更好的自己", "即刻預約塔羅占卜，探索感情與職涯方向"],
        ["塔羅解讀迷惘，讓下一步更清晰", "限時優惠開放中，現在預約專屬牌卡解讀"],
        ["抽一張牌，聽見內心真正的答案", "用塔羅探索心中疑問，預約你的專屬解讀"],
        ["感情事業怎麼選？塔羅陪你看方向", "預約塔羅占卜，為重要選擇多一份參考"],
        ["你的近期運勢，現在就來揭曉", "立即預約塔羅解讀，探索近期生活新方向"],
      ] },
      { name: "GPT-6.1 terra", ntd: "0.05", sec: 7, note: "平淡。", copies: [
        ["用塔羅探索你的下一步", "現在體驗塔羅，為心中的疑問找方向"],
        ["心中有疑問就來抽張牌", "感情、工作或生活，讓塔羅陪你探索"],
        ["你的專屬塔羅時刻到了", "立即開啟塔羅，聆聽內心真正的想法"],
        ["讓塔羅為迷惘帶來靈感", "給自己一點時間，探索更多可能性"],
        ["翻開塔羅看見不同視角", "準備好探索自己了嗎？現在就開始"],
      ] },
      { name: "GPT-6.2 sol", ntd: "0.10", sec: 9, isDefault: true, note: "完全沒有促銷；操作者用「精油」測也判定不佳。", copies: [
        ["抽張塔羅看看此刻的你", "帶著心中的疑問，抽一張牌找找新方向"],
        ["感情卡關就來抽張牌", "選一張塔羅牌，看看這段關係裡你在意什麼"],
        ["找一副讓你心動的塔羅", "逛逛不同畫風，挑一副你想天天翻的牌"],
        ["從第一張牌開始學塔羅", "不用硬背牌義，先從看懂牌面故事開始"],
        ["每天一張牌陪你理思緒", "把抽牌留給自己，今天就開始這個小儀式"],
      ] },
      { name: "GPT-6.2 astra", ntd: "0.38", sec: 8, note: "文字最有質感，但一樣沒有促銷。", copies: [
        ["你的第一副塔羅牌", "從最吸引你的牌面開始挑吧"],
        ["一眼心動的塔羅牌", "看看各款牌面，挑出百看不膩的那副"],
        ["把每日一抽變成小儀式", "挑副喜歡的塔羅牌，陪你開啟每一天"],
        ["換張牌，換個角度想", "帶著心裡的問題，從一張塔羅牌聊起"],
        ["送一副塔羅，聊一晚心事", "挑一副送給好友，下次見面一起抽"],
      ] },
    ],
  },
  {
    key: "bad", title: "不能用", why: "內容有錯或誇大，不能放上橫幅", tone: "var(--danger)",
    models: [
      { name: "GPT-5.4 nano", ntd: "0.01", sec: 5, note: "誇大保證，廣告味重。", copies: [
        ["今晚就問塔羅：準到爆", "立即抽牌，解鎖你的答案與下一步"],
        ["塔羅開運特惠：抽一次就中", "現在點進來，讓命運告訴你該怎麼走"],
        ["想知道未來？用塔羅秒解", "快速抽牌，掌握感情、工作與財運方向"],
        ["塔羅牌占卜促銷中", "趕快體驗，獲得你的專屬指引與破解法"],
        ["一句提問，塔羅給你答案", "馬上抽牌，找到行動策略與好運入口"],
      ] },
      { name: "GPT-5.4 mini", ntd: "0.03", sec: 4, note: "把尺寸名稱「分享預覽」寫進副標。", copies: [
        ["塔羅牌揭曉你的答案", "立即分享預覽，看看今天的關鍵訊息"],
        ["一抽看見命運轉向", "現在就打開預覽，發現專屬指引"],
        ["今天適合問塔羅牌", "點開連結預覽，秒懂你的下一步"],
        ["迷霧中的答案在這", "馬上查看分享預覽，抓住你的運勢"],
        ["你的專屬塔羅提示", "立即預覽，讓今天的選擇更清楚"],
      ] },
    ],
  },
];

/** A discount / price the brief never gave: the model made it up and it must be replaced before use. */
const MADE_UP = /\d+\s*折|\d+元|半價|五折|八折|買一送一|折百元/;

const LINE = "var(--card-border)";
const chip: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 999, border: `1px solid ${LINE}`, fontSize: 12, color: "var(--text-secondary)", background: "var(--card-bg)", whiteSpace: "nowrap" };

function ModelCard({ m, tone }: { m: Model; tone: string }) {
  return (
    <article style={{ display: "flex", flexDirection: "column", background: "var(--card-bg)", border: `1px solid ${LINE}`, borderTop: `3px solid ${tone}`, borderRadius: 12, overflow: "hidden" }}>
      <header style={{ padding: "14px 16px 10px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>{m.name}</h4>
          {m.isDefault ? <span style={{ ...chip, padding: "1px 8px", fontSize: 11 }}>目前預設</span> : null}
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 6, fontSize: 13, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
          <span><b style={{ color: "var(--text-primary)", fontSize: 16 }}>NT${m.ntd}</b> 一次</span>
          <span>{m.sec} 秒</span>
        </div>
        <p style={{ margin: "8px 0 0", fontSize: 13, lineHeight: 1.6, color: "var(--text-secondary)" }}>{m.note}</p>
      </header>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, borderTop: `1px solid ${LINE}` }}>
        {m.copies.map(([h, t], i) => {
          const madeUp = MADE_UP.test(h + t);
          return (
            <li key={i} style={{ display: "grid", gridTemplateColumns: "20px 1fr", gap: 8, padding: "10px 16px", borderTop: i ? `1px solid ${LINE}` : undefined }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums", paddingTop: 2 }}>{i + 1}</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.5, color: "var(--text-primary)" }}>{h}</div>
                <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--text-secondary)" }}>{t}</div>
                {madeUp ? <span style={{ display: "inline-block", marginTop: 4, fontSize: 11, color: "var(--danger)" }}>含自編的優惠數字</span> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </article>
  );
}

export default function BannerCopyBakeoff() {
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {["2026-11-26 正式站", "主題「塔羅牌」", "語氣：促銷", "尺寸 1.91:1", "12 個模型各一次", "每個回 5 組", "合計實扣約 NT$2.3"].map((c) => <span key={c} style={chip}>{c}</span>)}
      </div>

      <div style={{ display: "grid", gap: 4, padding: "14px 16px", marginBottom: 22, borderRadius: 12, border: `1px solid ${LINE}`, borderLeft: "4px solid var(--accent-text)", background: "var(--card-bg)", maxWidth: 900 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)" }}>結論：促銷文案用 Claude Sonnet 5.5</div>
        <div style={{ fontSize: 13, lineHeight: 1.65, color: "var(--text-secondary)" }}>
          推薦的三個裡它最便宜（NT$0.14）、最快（6 秒）。目前的預設 GPT-6.2 sol 沒有促銷感。
          主題沒給價錢或折扣時，Claude 系會自己編「85折」「299元」，標了紅字的那組用之前要換成真的。
        </div>
      </div>

      {TIERS.map((t) => (
        <section key={t.key} style={{ marginBottom: 26 }}>
          <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: "4px 12px", marginBottom: 10 }}>
            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: t.tone }}>{t.title}<span style={{ marginLeft: 6, fontWeight: 600, color: "var(--text-muted)" }}>{t.models.length}</span></h4>
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{t.why}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))", gap: 14, alignItems: "start" }}>
            {t.models.map((m) => <ModelCard key={m.name} m={m} tone={t.tone} />)}
          </div>
        </section>
      ))}

      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
        每組內由便宜到貴。分組是 Claude 的初判（標準：有沒有照「促銷」寫、能不能直接放上橫幅）；GPT-6.2 sol 另有操作者的判定。
        出處：正式站 ai_call_logs 2026-11-26 11:05 的 12 筆；WORKLOG 2026-11-26 橫幅生成文案 12 模型實測。
      </p>
    </div>
  );
}
