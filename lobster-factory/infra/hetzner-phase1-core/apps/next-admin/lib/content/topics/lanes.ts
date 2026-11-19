// The three filters on the two auto-content pages (TopicsBoard, the workbench's 自動排程) and the one next step per row.
// Pure: both pages call these, so a topic is in the same lane on both. Old rows carry no new field -- only `status` and
// `scheduled_for` are read (an October topic still 'proposed' is 過期).
import type { Topic } from "./store";

export type TopicLane = "running" | "waiting" | "overdue";
export type LaneFilter = TopicLane | "all";
export const LANE_LABEL: Record<LaneFilter, string> = { all: "全部", running: "進行中", waiting: "等你處理", overdue: "過期" };
export const LANE_ORDER: LaneFilter[] = ["all", "running", "waiting", "overdue"];

/** `status` is a plain string so the workbench list (rows straight from the API) can use these too. */
type Row = { status: string; scheduled_for: string | null };

/** 進行中 = being made; 過期 = still 'proposed' after its time (checked first, so it is not also 等你處理);
 *  等你處理 = a person's move is next. approved / rejected / scheduled / published are in no lane (only 全部). */
export function topicLane(t: Row, now: Date): TopicLane | null {
  if (t.status === "proposed" && t.scheduled_for && Date.parse(t.scheduled_for) < now.getTime()) return "overdue";
  if (["generating", "drafted", "waiting_video", "embedded", "publishing"].includes(t.status)) return "running";
  if (["proposed", "reviewed", "failed"].includes(t.status)) return "waiting";
  return null;
}

export function inLane<T extends Row>(topics: T[], filter: LaneFilter, now: Date): T[] {
  return filter === "all" ? topics : topics.filter((t) => topicLane(t, now) === filter);
}

export function laneCounts(topics: Row[], now: Date): Record<LaneFilter, number> {
  const c: Record<LaneFilter, number> = { all: topics.length, running: 0, waiting: 0, overdue: 0 };
  for (const t of topics) { const l = topicLane(t, now); if (l) c[l] += 1; }
  return c;
}

export type NextStep = { action: "approve" | "reject" | "retry" | "publish"; label: string };

/** The one button on a row, or null when nothing is for a person to do (the status says what is going on). approve /
 *  reject / retry are the topic PATCH route's; publish (N6) is POST [id]/publish, behind a confirmation that names
 *  where it goes (publishTargets). */
export function nextStep(t: Row, now: Date): NextStep | null {
  const lane = topicLane(t, now);
  if (lane === "overdue") return { action: "reject", label: "退回" };
  if (t.status === "proposed") return { action: "approve", label: "核准" };
  if (t.status === "failed") return { action: "retry", label: "重試" };
  if (t.status === "reviewed") return { action: "publish", label: "發布" };
  return null;
}

/** Minutes until the next 5-minute run of the host cron (1-5). */
export function minutesToNextRun(now: Date): number {
  return 5 - (now.getUTCMinutes() % 5);
}

/** What an approved topic waits for: its time is already past -> the next 5-minute run starts it; ahead -> its time. */
export function approvedStartText(t: Row, now: Date, whenText: string): string | null {
  if (t.status !== "approved") return null;
  if (!t.scheduled_for || Date.parse(t.scheduled_for) <= now.getTime()) return `下一輪排程（約 ${minutesToNextRun(now)} 分鐘內）開始；今天的額度滿了會順延`;
  return `排定 ${whenText} 開始`;
}

/** The WordPress draft's edit link when the topic has one (https only). */
export function draftUrl(t: Pick<Topic, "artifacts">): string | null {
  const article = (t.artifacts as { article?: { wp_edit_url?: unknown } } | null)?.article;
  const url = article?.wp_edit_url;
  return typeof url === "string" && /^https:\/\//.test(url) ? url : null;
}

type PublishArts = { article?: { wp_post_id?: unknown; published?: unknown }; social?: { post_id?: unknown; youtube_post_id?: unknown; sent?: unknown }; publish?: { youtube?: { url?: unknown } } } | null;

/** The YouTube draft 「發布」 would still send (its id), or null when there is none or it is already on YouTube. */
export function pendingYoutubePostId(t: Pick<Topic, "artifacts">): string | null {
  const a = t.artifacts as PublishArts;
  const id = a?.social?.youtube_post_id;
  return typeof id === "string" && id && !a?.publish?.youtube?.url ? id : null;
}

/** null = the draft could not be read; "mixed" = its YouTube channels differ. */
export type DraftPrivacy = "public" | "unlisted" | "mixed" | null;

/** The privacy the YouTube draft goes out with: its targets' format, written when the draft was made (N5a make.ts
 *  youtubeFormat) and read by the sender (lib/social/compose.ts: "unlisted" -> unlisted, anything else public).
 *  Changing the site's setting later does not touch it. No targets = unknown. */
export function draftPrivacy(targets: ReadonlyArray<{ format?: string | null }> | null | undefined): DraftPrivacy {
  if (!targets?.length) return null;
  const n = targets.filter((x) => x.format === "unlisted").length;
  return n === targets.length ? "unlisted" : n === 0 ? "public" : "mixed";
}

const PRIVACY_TEXT: Record<"public" | "unlisted", string> = { public: "公開", unlisted: "不公開" };
const draftText = (d: DraftPrivacy) => (d === null ? "無法確認，請到社群草稿看" : d === "mixed" ? "各頻道不同，請到社群草稿看" : PRIVACY_TEXT[d]);

/** Where 「發布」 sends a reviewed topic, in the order it goes (publish-steps.ts): the confirmation's lines. YouTube's
 *  privacy is the draft's own (draftPrivacy), never the site's current setting. */
export function publishTargets(t: Pick<Topic, "formats" | "artifacts">, youtube: DraftPrivacy): string[] {
  const a = t.artifacts as PublishArts;
  const out: string[] = [];
  if (pendingYoutubePostId(t)) out.push(`YouTube（這則草稿：${draftText(youtube)}）`);
  if (t.formats.includes("article") && a?.article?.wp_post_id && !a.article.published) out.push("網站文章（WordPress 草稿改成公開）");
  if (a?.social?.post_id && !a.social.sent) out.push("其他社群頻道（排在文章上線後）");
  return out;
}

/** The reminder when the YouTube draft's privacy is not the site's current setting (the draft wins); null when they
 *  match or the draft could not be read (publishTargets already says so). */
export function youtubePrivacyMismatch(draft: DraftPrivacy, site: "public" | "unlisted"): string | null {
  if (draft === null || draft === site) return null;
  return `網站設定現在是「${PRIVACY_TEXT[site]}」，但這則 YouTube 草稿是「${draftText(draft)}」，會照草稿發出；要改請到社群草稿修改。`;
}

export type PublishConfirm = { question: string; steps: string[]; reminder: string | null; reviewWarning: string | null; closing: string };

/** The pieces of 「發布」's in-page confirmation (TopicsBoard renders them inside the topic's card, with the link to the
 *  social drafts beside the reminder). */
export function publishConfirm(title: string, to: string[], reviewFailed: boolean, mismatch: string | null): PublishConfirm {
  return {
    question: `確定發布「${title}」？會依序發到：`,
    steps: to,
    reminder: mismatch ? `提醒：${mismatch}` : null,
    reviewWarning: reviewFailed ? "注意：規則審核沒通過，發布前請先看過草稿。" : null,
    closing: "發出去之後不會自動收回。",
  };
}

/** What a publish step went out without (publish-steps.ts PublishStep.note), e.g. an article a person had already
 *  published keeps its video file (N5b): a yellow line on the topic, not an error. */
export function publishNote(t: Pick<Topic, "artifacts">): string | null {
  const note = (t.artifacts as { publish?: { article?: { note?: unknown } } } | null)?.publish?.article?.note;
  return typeof note === "string" && note ? note : null;
}

/** The social tool's post list of the topic's brand, where its social drafts are (the tool opens no single post by link). */
export const socialDraftsUrl = (organizationId: string) => `/tools/social?brand=${encodeURIComponent(organizationId)}&view=list`;
