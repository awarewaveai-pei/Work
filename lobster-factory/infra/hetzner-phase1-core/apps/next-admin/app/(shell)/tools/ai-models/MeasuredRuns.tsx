// 實測紀錄 tab of /tools/ai-models — real paid/free runs (article text/images, copy, banner copy, video, music, speech/audio).
// Every figure is a recorded run (WORKLOG heading or bake-off folder in the source line); no catalog value is read or changed here.
// Each test is its own sub-tab (?tab=measured&test=<key>), grouped by category; rows inside a test stay cheapest first.
// Region-edit (圖片局部編輯) is on /tools/edit-guide section 十一, not repeated here. Styles: .mr-* in app/globals.css.
import Link from "next/link";
import { MUSIC_RATES, musicUsd } from "@/lib/ai/cost-model";
import { nt } from "@/lib/studio/model-options";
import { bakeoffHref, type BakeoffSlug } from "./bakeoff-pages";
import BannerCopyBakeoff from "./BannerCopyBakeoff";

/** NT$ of one song from the app's own music price table, so a list price here cannot drift from the app. */
const songNt = (id: keyof typeof MUSIC_RATES) => `NT$${nt(musicUsd(id)).toFixed(2)}`;

type Verdict = "good" | "bad" | "todo";
type Row = { date: string; model: string; asked: string; money: string; result: string; src: string; verdict?: Verdict; plain?: boolean; rank?: number;
  /** A control run (old method on a model already listed): shown, but not counted as a model. */
  control?: boolean };
type CategoryKey = "text" | "image" | "video" | "audio";
type Group = {
  key: string; category: CategoryKey; title: string; subtitle?: string;
  /** The one question the test answers, and what was decided — shown on the overview card and the test header. */
  question: string; conclusion?: string;
  /** Only for a test without rows (its results live in `page` or `body`); otherwise both come from the rows. */
  date?: string; models?: number;
  /** What one counted row is (default 個模型); e.g. the ElevenLabs rows are API features, not distinct models. */
  unit?: string;
  intro?: string; rows: Row[];
  /** A test that renders its own results (it carries its own summary, so the header shows no facts/conclusion). */
  body?: React.ReactNode;
  image?: { src: string; alt: string; caption: string };
  /** The full bake-off page, embedded in a sandboxed iframe from the staff-only bakeoff route. */
  page?: BakeoffSlug;
};

const CATEGORIES: { key: CategoryKey; label: string }[] = [
  { key: "text", label: "文字" },
  { key: "image", label: "圖片" },
  { key: "video", label: "影片" },
  { key: "audio", label: "音訊" },
];

const W9 = "2026-11-13（續9）影音工作台三張卡整合：音樂生成接三模型、圖片局部編輯器補齊、新工具破框貼文動畫";
const W12 = "2026-11-13（續12）ElevenLabs 免費額度接進配音、字幕辨識、音軌分離、去配樂・重配音效";
const W5 = "2026-11-14（續5）破框：入口邊開格、照參考改寫提示詞、頁面畫鎖定遮罩（任務自己的輸入）";

const ART = "agency-os/reports/model-bakeoff/2026-11-article/（key.json、editor-review.md）";

const ARTIMG = "agency-os/reports/model-bakeoff/2026-11-article-image/（runs.json、image-bakeoff.html）";

const GROUPS: Group[] = [
  {
    key: "article-image",
    category: "image",
    title: "文章配圖",
    question: "哪一個來源畫得出符合文章內容的圖？",
    conclusion: "GPT-Image-2 低、Nano Banana 2.1、FLUX dev 三個沒有出錯；預設維持 FLUX schnell，另留 GPT-Image-2 低、Nano Banana 2.1、Codex 免費生圖可選。",
    page: "image",
    intro: "2026-11-25 正式站。目的：哪一個來源畫得出符合文章內容的圖。寫文章的 AI 為每張圖寫一句英文畫面描述，同一組描述給六個來源各畫一次，封面套上統一版型；另用改版前的做法畫一組對照。照新做法畫的每一張都跟它那一段有關；操作者看過後判定 GPT-Image-2 低、Nano Banana 2.1、FLUX dev 三個沒有出錯。中文一篇、英文一篇（「workplace burnout」），六個來源在兩篇上都是完整的四張。免費圖庫沒有測。操作者的決定（2026-11-25）：預設維持 FLUX schnell；另外保留 GPT-Image-2 低、Nano Banana 2.1 和 Codex 免費生圖可以選，之後再測一次再決定要不要換。FLUX dev 和 FLUX 2 Klein 4B 不放進文章的選單。",
    rows: [
      { date: "2026-11-25", model: "Codex 免費生圖（ChatGPT 訂閱）", asked: "「職場倦怠」一篇文章的封面底圖＋三張內文圖，同一句英文畫面描述、照片感", money: "實扣 NT$0", result: "四張都跟段落有關。每張 42–55 秒，四張共 3 分 14 秒，沒有被額度擋下。只能本人按、筆電要開著；排程用不了。操作者：留著當免費選項。英文文章也測過四張（每張 50–59 秒），同樣貼題。", src: ARTIMG, plain: true },
      { date: "2026-11-25", model: "FLUX 2 Klein 4B", asked: "「職場倦怠」一篇文章的封面底圖＋三張內文圖，同一句英文畫面描述、照片感", money: "實扣 NT$0.06／張", result: "四張都跟段落有關，每張約 8 秒。操作者沒有列入「沒出錯」的三個。英文文章也測過四張，同樣貼題。", src: ARTIMG, plain: true },
      { date: "2026-11-25", model: "FLUX schnell（原本的預設）", asked: "「職場倦怠」一篇文章的封面底圖＋三張內文圖，同一句英文畫面描述、照片感", money: "實扣 NT$0.10／張", result: "四張都跟段落有關，每張 5–8 秒，最快。操作者沒有列入「沒出錯」的三個。英文文章也測過四張，同樣貼題。", src: ARTIMG, plain: true },
      { date: "2026-11-25", model: "GPT-Image-2 低", asked: "「職場倦怠」一篇文章的封面底圖＋三張內文圖，同一句英文畫面描述、照片感", money: "實扣 NT$0.64／張", result: "操作者判定沒有出錯。每張 15–18 秒。英文文章「workplace burnout」也測過四張，同樣貼題。", src: ARTIMG, plain: true, verdict: "good" },
      { date: "2026-11-25", model: "FLUX dev", asked: "「職場倦怠」一篇文章的封面底圖＋三張內文圖，同一句英文畫面描述、照片感", money: "實扣 NT$0.80／張", result: "操作者判定沒有出錯。每張 8–12 秒。英文文章也測過四張，同樣貼題。", src: ARTIMG, plain: true, verdict: "good" },
      { date: "2026-11-25", model: "Nano Banana 2.1", asked: "「職場倦怠」一篇文章的封面底圖＋三張內文圖，同一句英文畫面描述、照片感", money: "實扣 NT$1.82／張", result: "操作者判定沒有出錯。每張 28–33 秒，最貴也最慢。英文文章也測過四張，同樣貼題（三張內文圖是補畫的）。", src: ARTIMG, plain: true, verdict: "good" },
      { date: "2026-11-25", model: "對照：改版前的做法（FLUX schnell＋中文替代文字）", asked: "同一篇文章的封面底圖＋三張內文圖，但只給每張圖的中文替代文字，沒有英文畫面描述", money: "實扣 NT$0.10／張", result: "四張都跟文章無關：封面畫成寺廟與湖景，「跟主管談工作量」那一段畫成熱氣球和小花。問題出在只給替代文字，不在模型。", src: ARTIMG, plain: true, verdict: "bad", control: true },
    ],
  },
  {
    key: "article-text",
    category: "text",
    title: "文章生成",
    question: "哪一個模型寫的文章最接近可以直接上線？",
    conclusion: "選定 GPT-6.2 sol 為文章預設：盲評第 2 名，一篇 NT$1.96。",
    page: "article",
    intro: "2026-11-22 正式站，同一題目同一條件各一篇；操作者選定 GPT-6.2 sol 為文章預設。名次是繁中編輯盲評（12 篇）；第 1–4 名輕修可上，第 9–12 名接近重寫。",
    rows: [
      { rank: 8, date: "2026-11-22", model: "Claude Haiku 5.5", asked: "「職場倦怠」一篇文章，同題目同條件", money: "實扣 NT$0.08", result: "只有常識，沒有東西可帶走；乾淨安全。耗時 24 秒、2,621 字、SEO 59 分、未查證標記 0 處。", src: ART },
      { rank: 9, date: "2026-11-22", model: "GPT-6 luna", asked: "「職場倦怠」一篇文章，同題目同條件", money: "實扣 NT$0.13", result: "安全過頭，免責聲明蓋過內容。耗時 55 秒、4,297 字、SEO 82 分、未查證標記 0 處。", src: ART, verdict: "bad" },
      { rank: 12, date: "2026-11-22", model: "GPT-5.4 nano", asked: "「職場倦怠」一篇文章，同題目同條件", money: "實扣 NT$0.25", result: "用語不像台灣、引用標記滿篇、標題農場味，需重寫。耗時 33 秒、5,298 字、SEO 64 分、未查證標記 1 處。", src: ART, verdict: "bad" },
      { rank: 11, date: "2026-11-22", model: "GPT-5.4 mini", asked: "「職場倦怠」一篇文章，同題目同條件", money: "實扣 NT$0.71", result: "連結原始碼外露、內容重複、缺專線。耗時 23 秒、3,801 字、SEO 68 分、未查證標記 5 處。", src: ART, verdict: "bad" },
      { rank: 5, date: "2026-11-22", model: "GPT-6.1 terra", asked: "「職場倦怠」一篇文章，同題目同條件", money: "實扣 NT$1.02", result: "穩、克制、實用；要刪掉 5 處「待查」字樣。耗時 82 秒、4,328 字、SEO 77 分、未查證標記 6 處。", src: ART },
      { rank: 2, date: "2026-11-22", model: "GPT-6.2 sol（選定為文章預設）", asked: "「職場倦怠」一篇文章，同題目同條件", money: "實扣 NT$1.96", result: "話術具體、查對請假規則；要刪 6 處「年份未核」外露標記。耗時 80 秒、4,338 字、SEO 86 分、未查證標記 0 處。", src: ART, verdict: "good" },
      { rank: 3, date: "2026-11-22", model: "Claude Sonnet 5.5", asked: "「職場倦怠」一篇文章，同題目同條件", money: "實扣 NT$2.16", result: "最貼題、篇幅最剛好；有一處媒體歸屬寫錯。耗時 46 秒、3,576 字、SEO 68 分、未查證標記 0 處。", src: ART, verdict: "good" },
      { rank: 10, date: "2026-11-22", model: "GPT-5.4", asked: "「職場倦怠」一篇文章，同題目同條件", money: "實扣 NT$2.88", result: "假經驗口吻、空泛引用、後段灌水。耗時 84 秒、4,978 字、SEO 73 分、未查證標記 3 處。", src: ART, verdict: "bad" },
      { rank: 1, date: "2026-11-22", model: "GPT-6.2 astra", asked: "「職場倦怠」一篇文章，同題目同條件", money: "實扣 NT$6.68", result: "最像真人編輯寫的，話術可直接用，零杜撰。耗時 105 秒、4,117 字、SEO 82 分、未查證標記 3 處。", src: ART, verdict: "good" },
      { rank: 4, date: "2026-11-22", model: "Claude Opus 5.5（原預設）", asked: "「職場倦怠」一篇文章，同題目同條件", money: "實扣 NT$8.03", result: "最完整、台灣資源最齊；太長、套話多。耗時 119 秒、5,221 字、SEO 86 分、未查證標記 7 處。", src: ART, verdict: "good" },
      { rank: 7, date: "2026-11-22", model: "GPT-5.5", asked: "「職場倦怠」一篇文章，同題目同條件", money: "實扣 NT$8.72", result: "內容好但寫到一半被截斷；門檻數字自創。耗時 164 秒、4,850 字、SEO 77 分、未查證標記 3 處。", src: ART },
      { rank: 6, date: "2026-11-22", model: "Claude Fable 5.1", asked: "「職場倦怠」一篇文章，同題目同條件", money: "實扣 NT$19.56", result: "結構與切題滿分，但杜撰數字與引用最多。耗時 167 秒、5,437 字、SEO 82 分、未查證標記 13 處。", src: ART },
    ],
  },
  {
    key: "copy-tasks",
    category: "text",
    title: "八種文案",
    // The day the results were committed (4066ff696, K16); results.json carries no run timestamps.
    date: "2026-11-23",
    models: 5,
    question: "八種文案工作（標題、社群貼文、商品文案等）各用哪個模型寫得好？",
    page: "copy",
    intro: "八種文案工作（標題、社群貼文、商品文案等）各用多個模型實際跑過的完整比較：每一種的原文、花費與耗時都在下面的頁面裡。",
    rows: [],
  },
  {
    key: "banner-copy",
    category: "text",
    title: "橫幅文案",
    date: "2026-11-26",
    models: 12,
    question: "橫幅「促銷」語氣的標題＋副標，哪個模型寫得能直接用？",
    conclusion: "促銷文案用 Claude Sonnet 5.5：推薦的三個裡最便宜（NT$0.14）、最快（6 秒）；目前預設 GPT-6.2 sol 沒有促銷感。主題沒給折扣時 Claude 會自編「85折」等數字，用前要換成真的。",
    rows: [],
    body: <BannerCopyBakeoff />,
  },
  {
    key: "breakout-video",
    category: "video",
    title: "破框貼文動畫",
    question: "哪一個影片模型能讓主角乾淨衝出貼文照片框？",
    conclusion: "還沒有可提供的模型：唯一乾淨衝出框的 Seedance 是中國模型，不採用；Veo 3.1 Fast 還沒測。",
    intro: "同一個流程（IG 貼文、照片當第一格、5 秒、9:16），主角要往下衝出照片。貼文文字列由我們鎖定。",
    rows: [
      { date: "2026-11-13/14", model: "Runway Gen-4 Turbo", asked: "照片裡的主角衝出貼文框，真跑 5 次", money: "實扣 NT$8.00，標價 NT$8.00（一致）",
        result: "5 次主角都沒離開照片。文字列「12.4K／389／127」在第 0／30／60／90／119 格完全相同（有鎖定時）。", src: W5, verdict: "bad" },
      { date: "2026-11-15", model: "Luma Ray 3.2", asked: "同一個流程，從工具頁面送出", money: "實扣 NT$9.60，標價 NT$9.60（一致）", result: "鯊魚出現了，但沒有乾淨衝出照片框，後段變成一層霧蓋過貼文。同一天另用全英文提示詞直接在 Replicate 跑一次：第 30 格衝出照片框，之後模型把貼文下方的文字整塊抹掉（這次扣款沒對帳）。", src: "Replicate 帳單畫面與各次 prediction 回應（WORKLOG 沒寫）", verdict: "bad", plain: true },
      { date: "2026-11-15", model: "Grok Imagine Video", asked: "5 秒、720p、9:16，用有人物的貼文照片", money: "估約 NT$11.20（依模型頁牌價估，實扣沒對帳）", result: "接受有人物的照片。鯊魚的鰭越過照片下緣，蓋到圖示列。", src: "Replicate 帳單畫面與各次 prediction 回應（WORKLOG 沒寫）", verdict: "bad", plain: true },
      { date: "2026-11-15", model: "Seedance 2.0 Fast（不採用：中國模型）", asked: "同一個流程，兩次", money: "第一次沒收費；第二次帳單約 NT$24.00", result: "第一次失敗（E005）：照片裡有看起來像真人的人物。第二次用沒有人的拿鐵照片，5 秒、720p、無聲，鯊魚乾淨地衝出照片框。因為是中國模型，不提供給使用者。", src: "Replicate 帳單畫面與各次 prediction 回應（WORKLOG 沒寫）", verdict: "bad", plain: true },
      { date: "尚未實測", model: "Veo 3.1 Fast", asked: "—", money: "—", result: "還沒跑。", src: W5, verdict: "todo" },
    ],
    image: { src: "/guides/breakout-frames.jpg", alt: "Runway 破框貼文動畫的第 0、30、60、90、119 格", caption: "Runway 第 5 次：第 0／30／60／90／119 格。照片裡的鯊魚一直在照片內，下方文字列每一格都一樣。" },
  },
  {
    key: "music",
    category: "audio",
    title: "音樂生成",
    question: "哪一個音樂模型可以接進音樂生成？",
    conclusion: "Lyria 3 Clip 可用；Eleven Music 要付費方案，目前不接；Lyria 3.5 還沒測。",
    rows: [
      { date: "2026-11-13", model: "Lyria 3 Clip", asked: "生成一首歌", money: `實扣 ${songNt("lyria-3-clip-preview")}，標價 ${songNt("lyria-3-clip-preview")}（一致）`, result: "成功。", src: W9, verdict: "good" },
      { date: "尚未實測", model: "Lyria 3.5", asked: "—", money: `標價 ${songNt("lyria-3.5")}／首`, result: "還沒跑。", src: W9, verdict: "todo" },
      { date: "2026-11-13", model: "Eleven Music", asked: "生成音樂（免費方案帳號）", money: "實扣 0 點", result: "被拒：402 paid_plan_required。這個模型需要付費的 ElevenLabs 方案，目前不接。", src: W12, verdict: "bad" },
    ],
  },
  {
    key: "voice",
    category: "audio",
    title: "語音與音效",
    subtitle: "ElevenLabs 免費方案（每月 10,000 點）",
    unit: "項 API",
    question: "ElevenLabs 免費方案的四項語音 API 能不能用？",
    conclusion: "四項都成功，全在免費額度內；人聲分離最耗點數（5 秒 100 點）。",
    intro: "每一項都是透過 API 真的呼叫一次，回應全部 200，實扣 NT$0.00（免費額度內）。",
    rows: [
      { date: "2026-11-13", model: "Scribe v2（字幕辨識）", asked: "辨識一段台灣國語", money: "3 點", result: "成功，但回傳簡體字。現在由我們的路由轉成繁體。", src: W12, verdict: "good" },
      { date: "2026-11-13", model: "Text-to-speech（配音）", asked: "把一段文字念出來", money: "4 點", result: "成功。", src: W12, verdict: "good" },
      { date: "2026-11-13", model: "Sound effects（音效）", asked: "依描述生成一個音效", money: "10 點", result: "成功。", src: W12, verdict: "good" },
      { date: "2026-11-13", model: "Voice isolation（人聲分離）", asked: "分離 5 秒音檔的人聲", money: "100 點", result: "成功。5 秒就用掉 100 點，是這四項裡最貴的。", src: W12, verdict: "good" },
    ],
  },
];

/** Tests in category order (文字 → 圖片 → 影片 → 音訊); the sub-nav and the overview both read this. */
const TESTS: Group[] = CATEGORIES.flatMap((c) => GROUPS.filter((g) => g.category === c.key));
export const TEST_KEYS = TESTS.map((t) => t.key);

const VERDICT: Record<Verdict, { label: string; badge: string }> = {
  good: { label: "通過", badge: "badge-green" },
  bad: { label: "未通過", badge: "badge-red" },
  todo: { label: "待測", badge: "badge-gray" },
};

const srcLabel = (r: Row) => (r.plain || r.src === ART ? r.src : `WORKLOG ${r.src}`);
/** The value when every row carries the same one, else null (then each row shows its own). */
const shared = (rows: Row[], pick: (r: Row) => string): string | null =>
  rows.length > 0 && rows.every((r) => pick(r) === pick(rows[0])) ? pick(rows[0]) : null;
/** The value most rows carry when that is more than half of them, else null; rows that differ show their own. */
const usual = (rows: Row[], pick: (r: Row) => string): string | null => {
  const n = new Map<string, number>();
  for (const r of rows) n.set(pick(r), (n.get(pick(r)) ?? 0) + 1);
  const [v, c] = [...n].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
  return c * 2 > rows.length ? v : null;
};
/** Rows that were actually run (a 待測 row is a model still to try). One row can hold several runs of that model, so this counts models, not runs. */
const ran = (rows: Row[]) => rows.filter((r) => r.verdict !== "todo");
const spanOf = (dates: string[]) => {
  const ds = [...new Set(dates)].sort();
  return ds.length === 0 ? null : ds.length === 1 ? ds[0] : `${ds[0]} – ${ds[ds.length - 1]}`;
};
const dateOf = (g: Group) => g.date ?? (g.rows.length ? spanOf(ran(g.rows).map((r) => r.date)) ?? "尚未實測" : null);
const unitOf = (g: Group) => g.unit ?? "個模型";
const modelsOf = (g: Group) => g.models ?? (g.rows.length ? ran(g.rows).filter((r) => !r.control).length : null);
const href = (key?: string) => (key ? `/tools/ai-models?tab=measured&test=${key}` : "/tools/ai-models?tab=measured");
const catLabel = (k: CategoryKey) => CATEGORIES.find((c) => c.key === k)?.label ?? k;

function Tally({ rows }: { rows: Row[] }) {
  return (
    <span className="mr-tally">
      {(["good", "bad", "todo"] as const).map((k) => [k, rows.filter((r) => r.verdict === k).length] as const).filter(([, n]) => n > 0).map(([k, n]) => (
        <span key={k} className={`mr-tally-item mr-tally-item--${k}`}>{VERDICT[k].label} {n}</span>
      ))}
    </span>
  );
}

function SubNav({ active }: { active: string | null }) {
  const cls = (on: boolean) => (on ? "mr-nav-item mr-nav-item--active" : "mr-nav-item");
  return (
    <nav className="mr-nav" aria-label="實測項目">
      <div className="mr-nav-group">
        <Link href={href()} className={cls(active === null)} aria-current={active === null ? "page" : undefined}>總覽</Link>
      </div>
      {CATEGORIES.map((c) => (
        <div key={c.key} className="mr-nav-group">
          <span className="mr-nav-label">{c.label}</span>
          {TESTS.filter((g) => g.category === c.key).map((g) => {
            const n = modelsOf(g);
            return (
              <Link key={g.key} href={href(g.key)} className={cls(active === g.key)} aria-current={active === g.key ? "page" : undefined}>
                {g.title}{n !== null ? <span className="tab-count">{n}</span> : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function Overview() {
  return (
    <div>
      <div className="mr-cards">
        {TESTS.map((g) => {
          const meta = [dateOf(g), modelsOf(g) !== null ? `${modelsOf(g)} ${unitOf(g)}` : null].filter(Boolean).join(" · ");
          return (
            <Link key={g.key} href={href(g.key)} className="mr-card">
              <span className="mr-card-meta"><span className="mr-card-cat">{catLabel(g.category)}</span>{meta}</span>
              <span className="mr-card-title">{g.title}</span>
              <span className="mr-card-q">{g.question}</span>
              {g.conclusion ? <span className="mr-card-conclusion">{g.conclusion}</span> : <span className="mr-card-q">各模型的成品、花費與耗時並排在完整比較頁。</span>}
              <span className="mr-card-foot">{g.rows.length ? <Tally rows={g.rows} /> : <span />}<span className="mr-card-more">看紀錄 →</span></span>
            </Link>
          );
        })}
      </div>
      <p className="mr-note">
        圖片局部編輯器的五顆鈕比較在 <Link href="/tools/edit-guide">改圖怎麼挑</Link> 第十一節，這裡不重複。
      </p>
    </div>
  );
}

function FullPage({ g, slug }: { g: Group; slug: BakeoffSlug }) {
  return (
    <section className="mr-embed">
      <div className="mr-embed-bar">
        <span className="mr-embed-label">完整比較頁</span>
        <a href={bakeoffHref(slug)} target="_blank" rel="noopener" className="btn btn-secondary">另開完整頁面</a>
      </div>
      <iframe src={bakeoffHref(slug)} sandbox="allow-scripts" title={`${g.title}：完整比較頁`} loading="lazy" className="mr-embed-frame" />
    </section>
  );
}

function TestDetail({ g }: { g: Group }) {
  const asked = usual(g.rows, (r) => r.asked);
  const allAsked = shared(g.rows, (r) => r.asked);
  const src = usual(g.rows, srcLabel);
  const date = shared(g.rows, (r) => r.date);
  const models = modelsOf(g);
  return (
    <article>
      <header className="mr-head">
        <span className="mr-eyebrow">{catLabel(g.category)}{g.subtitle ? ` · ${g.subtitle}` : ""}</span>
        <h3 className="mr-title">{g.title}</h3>
        <p className="mr-q">{g.question}</p>
        {g.body ? null : (
          <>
            {dateOf(g) || models !== null || g.rows.length ? (
              <dl className="mr-facts">
                {dateOf(g) ? <div><dt>日期</dt><dd>{dateOf(g)}</dd></div> : null}
                {models !== null ? <div><dt>已測</dt><dd>{models} {unitOf(g)}</dd></div> : null}
                {g.rows.length ? <div><dt>判定</dt><dd><Tally rows={g.rows} /></dd></div> : null}
              </dl>
            ) : null}
            {g.conclusion ? <p className="mr-conclusion"><span className="mr-conclusion-label">結論</span>{g.conclusion}</p> : null}
            {g.intro || asked ? (
              <div className="mr-method">
                {asked ? <p><strong>{allAsked ? "每個模型做的事" : "多數模型做的事"}</strong>{asked}{allAsked ? "" : "（不同的另在該列註明）"}</p> : null}
                {g.intro ? <p><strong>怎麼測</strong>{g.intro}</p> : null}
              </div>
            ) : null}
          </>
        )}
      </header>

      {g.page ? <FullPage g={g} slug={g.page} /> : null}
      {g.body ?? null}

      {g.rows.length ? (
        <div className="mr-list">
          <div className="mr-row mr-row--head" aria-hidden="true">
            <span>模型</span><span>實扣／標價</span><span>結果</span>
          </div>
          {g.rows.map((r, i) => {
            const meta = [!date ? r.date : null, r.asked !== asked && r.asked !== "—" ? `做了：${r.asked}` : null, srcLabel(r) !== src ? `出處：${srcLabel(r)}` : null].filter(Boolean);
            return (
              <div key={i} className={`mr-row${r.verdict === "todo" ? " mr-row--todo" : ""}`}>
                <div className="mr-model">
                  <span className="mr-model-name">{r.model}</span>
                  <span className="mr-model-tags">
                    {r.verdict ? <span className={`card-badge ${VERDICT[r.verdict].badge}`}>{VERDICT[r.verdict].label}</span> : null}
                    {r.rank ? <span className="mr-rank">盲評第 {r.rank} 名</span> : null}
                  </span>
                </div>
                <div className="mr-money">{r.money}</div>
                <div className="mr-result">
                  <p>{r.result}</p>
                  {meta.length ? <p className="mr-row-meta">{meta.join(" · ")}</p> : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {g.image ? (
        <figure className="mr-figure">
          <img src={g.image.src} alt={g.image.alt} />
          <figcaption>{g.image.caption}</figcaption>
        </figure>
      ) : null}

      {src ? <p className="mr-source">{shared(g.rows, srcLabel) ? "出處" : "其餘各列出處"}：{src}</p> : null}
    </article>
  );
}

export default function MeasuredRuns({ test }: { test?: string } = {}) {
  const g = TESTS.find((t) => t.key === test) ?? null;
  const dated = TESTS.flatMap((t) => (t.date ? [t.date] : ran(t.rows).map((r) => r.date)));
  return (
    <div className="mr">
      <div className="mr-intro">
        <h2 className="mr-h2">實測紀錄</h2>
        <p>
          只放真的跑過的紀錄：哪個模型、實際扣多少、結果如何。共 {TESTS.length} 項測試（{spanOf(dated)}），分文字、圖片、影片、音訊四類，每項一頁。
          出處是 WORKLOG 的日期標題或 bake-off 資料夾，在 repo 搜那一行就找得到。
        </p>
      </div>
      <SubNav active={g ? g.key : null} />
      {g ? <TestDetail g={g} /> : <Overview />}
    </div>
  );
}
