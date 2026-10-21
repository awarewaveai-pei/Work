"use client";
// The composer (SOCIAL_MANAGER_PLAN.md C21; ADR 016 §5 decision 5; mock #edPanel): channels on the left, writing in
// the middle (only it scrolls), previews on the right, and one bottom row -- 標籤, 設定發佈時間, and the main button that
// does what ▾ picked. The pieces are in compose/; this file holds the post being written and how it is saved.
// What can change follows the server: content only in the editable states and never after a channel went out (0098);
// who may do what is lib/social/state.ts RULES (the buttons only mirror it; the server decides).
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { commentTakesMedia, isVideo } from "@/lib/social/compose";
import { commentsOverLimit, overLimit } from "@/lib/social/limits";
import type { RepeatRule } from "@/lib/social/repeat-rule";
import type { PostState } from "@/lib/social/state";
import { splitKeywords } from "@/lib/social/auto-rules";
import { api, ApiError, type AutoRule, type ListRow, type MediaItem, type PostInput, type SavedRef, type StateInput } from "./api";
import { fileDataUrl, uploadTooLarge } from "./media";
import { instantAt, platformOf, shortDate, targetProblems, zoned, type Account, type AutoMode, type Brand, type Post, type Tag } from "./model";
import AutoReply, { blankRule, ruleDraftOf, type RuleDraft } from "./compose/AutoReply";
import ChannelPicker from "./compose/ChannelPicker";
import Comments from "./compose/Comments";
import DateTimePicker from "./compose/DateTimePicker";
import { channelText, cleanRepeat, copyInput, newRepeat, repeatText, whenText, type Act, type CommentDraft, type Delay } from "./compose/draft";
import Footer from "./compose/Footer";
import Formats from "./compose/Formats";
import Previews from "./compose/Previews";
import TagPicker from "./compose/TagPicker";
import Writer, { type Extra } from "./compose/Writer";
import { PfMark } from "./Calendar";
import "./compose/compose.css";

const MAX_COMMENTS = 50;               // 0105 social_post_comments.position 0..49

export interface EditorProps {
  brand: Brand;
  accounts: Account[];
  media: MediaItem[];
  post: Post | null;
  defaults: { date: string; time: string };
  today: string;
  /** unused since C21: a post goes into an autolist from that list's tab (C23 card boundary) */
  lists?: ListRow[];
  /** the reviewer's approve / reject bar (C8) */
  reviewBar?: ReactNode;
  /** a WordPress article this post starts from (C10) */
  source?: ReactNode;
  onSaved: (id: string, message: string, plan?: { date: string }) => void;
  onMediaAdded: (m: MediaItem) => void;
  /** C10: text, link, channel texts and media from a WordPress article; applied when n changes */
  prefill?: import("./ArticleSource").Prefill | null;
  /** C9: a library item to attach (n changes on every click, so the same item twice attaches once and says so) */
  attach?: { id: string; n: number } | null;
  attachMany?: { ids: string[]; n: number } | null;
  seed?: { body: string; mediaIds: string[]; n: number } | null;
  onOpenLibrary?: () => void;
}

function message(e: unknown): string {
  if (e instanceof ApiError) {
    const d = e.detail as { overLimit?: Array<{ platform: string; length: number; limit: number }>; commentOverLimit?: Array<{ platform: string; length: number; limit: number; comment: number }> } | undefined;
    if (d?.overLimit?.length) return d.overLimit.map((o) => `${platformOf(o.platform).name} ${o.length}／${o.limit} 字，太長了`).join("；");
    if (d?.commentOverLimit?.length) return d.commentOverLimit.map((o) => `第 ${o.comment} 則留言在 ${platformOf(o.platform).name} ${o.length}／${o.limit} 字，太長了`).join("；");
    if (e.status === 409) return `${e.message}（重新整理後再試）`;
    return e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

const param = (k: string) => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get(k));
// a read that may fail (or not exist in a test's fake api) only leaves its part empty
const load = <T,>(read: () => Promise<T>, done: (v: T) => void, fail?: (e: unknown) => void) => { Promise.resolve().then(read).then(done).catch((e) => fail?.(e)); };

export default function Editor(props: EditorProps) {
  const { brand, accounts, post } = props;
  const tz = brand.default_timezone;
  const canWrite = brand.role === "owner" || brand.role === "editor";
  const state: PostState = post?.state ?? "draft";
  const sentIds = useMemo(() => new Set((post?.targets ?? []).filter((t) => t.state === "queued" || t.state === "published").map((t) => t.account_id)), [post]);
  const contentLocked = !canWrite || state === "queued" || state === "published" || state === "deleted" || sentIds.size > 0;
  const readOnly = !canWrite || state === "published" || state === "deleted";
  // queued = in Postiz waiting for its time: only its time, a draft or a submission may change (0100 release); a rule,
  // tags or channels saved meanwhile would be lost or move the version under the sender (critic 2026-10-18 M1/M2)
  const queued = state === "queued";
  const channelEditable = (id: string) => !readOnly && !sentIds.has(id) && state !== "queued";

  const connected = accounts.filter((a) => a.status === "connected");
  const firstPick = () => {
    if (post) return post.targets.map((t) => t.account_id);
    const wanted = param("accounts")?.split(",") ?? [];
    const hit = connected.filter((a) => wanted.includes(a.id)).map((a) => a.id);
    return hit.length ? hit : connected.slice(0, 3).map((a) => a.id);   // the mock's blank(): the first three
  };
  const [picked, setPicked] = useState<string[]>(firstPick);
  const [tab, setTab] = useState("all");
  const [body, setBody] = useState(post?.body ?? "");
  const [custom, setCustom] = useState<Record<string, string>>(() => Object.fromEntries((post?.targets ?? []).filter((t) => t.custom_body != null).map((t) => [t.account_id, t.custom_body as string])));
  const [formats, setFormats] = useState<Record<string, string>>(() => Object.fromEntries((post?.targets ?? []).map((t) => [t.account_id, t.format])));
  const [link, setLink] = useState(post?.link_url ?? "");
  const [utm, setUtm] = useState(post?.link_utm ?? false);
  const [notes, setNotes] = useState(post?.notes ?? "");
  const [mediaList, setMediaList] = useState(() => [...(post?.media ?? [])].sort((a, b) => a.position - b.position).map((m) => ({ media_id: m.media_id, alt_text: m.alt_text })));
  const keyRef = useRef(0);
  const [comments, setComments] = useState<CommentDraft[]>(() => [...(post?.comments ?? [])].sort((a, b) => a.position - b.position)
    .map((c) => ({ key: ++keyRef.current, body: c.body, delay: c.delay_minutes as Delay, media_id: c.media_id })));
  const [tagIds, setTagIds] = useState<string[]>(() => (post?.tags ?? []).map((t) => t.tag_id));
  const [tags, setTags] = useState<Tag[] | null>(null);
  const [autoMode, setAutoMode] = useState<AutoMode>(post?.auto_mode ?? "brand");
  const [autoOpen, setAutoOpen] = useState(post?.auto_mode === "own");
  const [brandRules, setBrandRules] = useState<AutoRule[] | null>(null);
  const [rule, setRule] = useState<RuleDraft | null>(null);
  const [ruleDirty, setRuleDirty] = useState(false);
  const [ownRuleIds, setOwnRuleIds] = useState<string[]>([]);
  const [open, setOpen] = useState<Set<Extra>>(() => new Set<Extra>([...(post?.link_url ? ["link" as const] : []), ...(post?.notes ? ["notes" as const] : []), ...(post?.media.some((m) => m.alt_text) ? ["alt" as const] : [])]));
  const at = post?.scheduled_at ? zoned(post.scheduled_at, tz) : null;
  const [date, setDate] = useState(at?.date ?? props.defaults.date);
  const [time, setTime] = useState(at?.time ?? props.defaults.time);
  const [repeat, setRepeat] = useState<RepeatRule>(() => post?.repeat ? { ...post.repeat } : newRepeat(at?.date ?? props.defaults.date));
  const [chosen, setChosen] = useState<Act | null>(null);
  const [requireReview, setRequireReview] = useState(false);
  const [dtOpen, setDtOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmNow, setConfirmNow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [squareCrop, setSquareCrop] = useState(false);
  const [mobilePane, setMobilePane] = useState<"write" | "preview">("write");
  const [hint, setHint] = useState<{ text: string; error?: boolean } | null>(null);
  const [texts, setTexts] = useState<Array<{ id: string; body: string }> | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(post?.source_url ?? null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadFor = useRef<"post" | number>("post");
  const pickTouched = useRef(false);
  // what this page last wrote: a retry after a later step failed continues from it instead of creating the post twice
  // or writing against a version it already moved (critic 2026-10-18 M5)
  const done = useRef<{ ref: SavedRef; state: PostState } | null>(null);
  const lastAttach = useRef(props.attach?.n ?? 0);
  const lastAttachMany = useRef(props.attachMany?.n ?? 0);
  const lastPrefill = useRef(0);
  const lastSeed = useRef(0);
  const say = (text: string, error = false) => setHint({ text, error });

  // a new post opened before the brand's channels arrived: pick once they do, unless someone chose
  useEffect(() => {
    if (!post && !pickTouched.current && accounts.length) setPicked(firstPick());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post, accounts]);
  useEffect(() => {
    load(() => api.tags(brand.id), (r) => setTags(r.tags), () => setTags([]));
    load(() => api.autoRules(brand.id), (r) => setBrandRules(r.rules), () => setBrandRules([]));
    load(() => api.settings(brand.id), (r) => setRequireReview(r.requireReview));
  }, [brand.id]);
  useEffect(() => {
    if (!post || post.auto_mode !== "own") return;
    load(() => api.autoRules(brand.id, post.id), (r) => { setOwnRuleIds(r.rules.map((x) => x.id)); setRule(r.rules[0] ? ruleDraftOf(r.rules[0]) : blankRule()); }, (e) => say(message(e), true));
  }, [brand.id, post]);
  useEffect(() => {
    if (open.has("texts") && texts === null) load(() => api.texts(brand.id), (r) => setTexts(r.texts), (e) => say(message(e), true));
  }, [open, texts, brand.id]);
  useEffect(() => {
    const p = props.prefill;
    if (!p || p.n === lastPrefill.current) return;
    lastPrefill.current = p.n;
    setBody(p.body);
    setLink(p.link);
    if (p.link) setOpen((o) => new Set(o).add("link"));
    setSourceUrl(p.sourceUrl);
    setCustom(p.custom);
    setMediaList(p.mediaIds.map((id) => ({ media_id: id, alt_text: null })));
  }, [props.prefill]);
  useEffect(() => {
    const seed = props.seed;
    if (!seed || seed.n === lastSeed.current || post) return;
    lastSeed.current = seed.n;
    setBody(seed.body);
    setMediaList(seed.mediaIds.map((id) => ({ media_id: id, alt_text: null })));
  }, [props.seed, post]);
  useEffect(() => {
    const a = props.attach;
    if (!a || a.n === lastAttach.current) return;
    lastAttach.current = a.n;
    setMediaList((l) => (l.some((m) => m.media_id === a.id) ? l : [...l, { media_id: a.id, alt_text: null }]));
  }, [props.attach]);
  useEffect(() => {
    const a = props.attachMany;
    if (!a || a.n === lastAttachMany.current) return;
    lastAttachMany.current = a.n;
    setMediaList((l) => [...l, ...a.ids.filter((id) => !l.some((m) => m.media_id === id)).map((media_id) => ({ media_id, alt_text: null }))]);
  }, [props.attachMany]);

  const channels = useMemo(() => picked.map((id) => accounts.find((a) => a.id === id)).filter((a): a is Account => !!a), [picked, accounts]);
  const curTab = channels.some((a) => a.id === tab) ? tab : "all";   // a tab whose channel was unticked falls back to 共用
  const textFor = (a: Account) => channelText(a, body, custom, link, utm);
  const mediaPath = (id: string) => props.media.find((m) => m.id === id)?.postiz_path ?? null;
  const mediaKind = (id: string) => props.media.find((m) => m.id === id)?.kind ?? null;
  const previewMedia = mediaList.map((m) => ({ path: mediaPath(m.media_id), kind: mediaKind(m.media_id) })).filter((m): m is { path: string; kind: string | null } => !!m.path);
  const images = previewMedia.map((m) => m.path);
  const mediaKinds = previewMedia.map((m) => m.kind ?? "image");
  const liveComments = comments.filter((c) => c.body.trim() || c.media_id);
  const problems = overLimit("", channels.map((a) => ({ accountId: a.id, platform: a.platform, customBody: textFor(a) })));
  // numbered over every box on the page (an empty box keeps its number)
  const commentProblems = commentsOverLimit(comments.map((c) => c.body), channels.map((a) => ({ accountId: a.id, platform: a.platform })));
  const noCommentImage = channels.filter((a) => !commentTakesMedia(a.platform));

  // ---- what the main button may do (lib/social/state.ts RULES; with review on an editor submits, 0102) ----
  const reviewGate = requireReview && brand.role === "editor";
  const unapproved = !post || ["draft", "error", "rotation"].includes(state);
  const can = {
    draft: canWrite && (!post || ["draft", "review", "scheduled", "queued", "rotation", "error"].includes(state)),
    library: canWrite,
    review: canWrite && (!post || ["draft", "review", "scheduled", "queued", "rotation"].includes(state)),
    schedule: canWrite && (!post || ["draft", "scheduled", "queued", "error", "rotation"].includes(state)) && !(reviewGate && unapproved),
    // not from an autolist: 0105 refuses repeat on a rotation post, and the save comes before leaving the list
    repeat: canWrite && (!post || ["draft", "scheduled", "error"].includes(state)) && !post?.repeat_of && !(reviewGate && unapproved),
    now: brand.role === "owner" && (!post || ["draft", "scheduled", "queued", "error", "rotation"].includes(state)),
    keep: canWrite && state === "rotation",
  };
  const allowed = (a: Act) => (a === "keep" ? can.keep : can[a]);
  const preferred = ([state === "rotation" ? "keep" : null, post?.repeat ? "repeat" : null, reviewGate && unapproved ? "review" : null, "schedule", "review", "draft"] as Array<Act | null>)
    .find((a): a is Act => !!a && allowed(a)) ?? "draft";
  const act: Act = chosen && allowed(chosen) ? chosen : preferred;

  function validate(kind: Act): string | null {
    const empty = !body.trim() && !mediaList.length && !channels.some((a) => custom[a.id]?.trim());
    if (empty && !contentLocked) return "貼文還是空的。";
    if (kind !== "draft" && kind !== "keep" && !channels.length) return "還沒選要發到哪裡：在左邊勾頻道。";
    if (problems.length) return `${problems.map((p) => `${accounts.find((a) => a.id === p.accountId)?.label ?? ""}（${platformOf(p.platform).name}）`).join("、")} 超過字數上限，點上面它的名字另外寫一份短的。`;
    if (commentProblems.length) return `第 ${commentProblems[0].comment} 則留言超過 ${platformOf(commentProblems[0].platform).name} 的字數上限（${commentProblems[0].length}／${commentProblems[0].limit}）。`;
    const imageOnly = comments.findIndex((c) => c.media_id && !c.body.trim());
    if (imageOnly >= 0 && noCommentImage.length) return `第 ${imageOnly + 1} 則留言只有圖，${[...new Set(noCommentImage.map((a) => platformOf(a.platform).name))].join("、")} 的留言不能帶圖，請加上文字。`;
    if (kind !== "draft" && kind !== "keep") {
      if (channels.some((a) => a.platform.startsWith("instagram")) && !mediaList.length) return "Instagram 一定要有圖片或影片。";
      // compose.ts: a Reel is a post with exactly one video (Codex 2026-10-18: do not refuse one that has it)
      if (channels.some((a) => formats[a.id] === "reel") && !(mediaList.length === 1 && isVideo(mediaPath(mediaList[0].media_id)))) return "Reel 要剛好一支影片。影片上傳還沒開放，先改成「貼文」或「限時動態」。";
    }
    if (kind === "repeat" && repeat.freq === "week" && !repeat.days?.length) return "週期性安排：至少選一天。";
    if (autoMode === "own" && rule) {
      const kw = splitKeywords(rule.keywords);
      if (!kw.length || !rule.reply.trim() || !rule.platforms.length) return "這則的自動回覆：關鍵字、回覆內容、至少一個平台都要有。";
      // lib/social/auto-rules.ts parseAutoRule and the 0105 checks
      if (kw.length > 50 || kw.join(",").length > 2000 || rule.reply.trim().length > 2000 || rule.name.length > 80) return "這則的自動回覆：關鍵字最多 50 個，回覆內容最多 2000 字。";
    }
    return null;
  }

  function input(kind: Act): PostInput {
    const fields: PostInput["fields"] = { notes: notes.trim() || null };
    if (!contentLocked) Object.assign(fields, { body, link_url: link.trim() || null, link_utm: utm, source_url: sourceUrl });
    // 0105: a template holds the rule; 設定行程 or 立即發佈 on a template ends the series (its untouched children go)
    if (kind === "repeat") fields.repeat = cleanRepeat(repeat);
    else if ((kind === "schedule" || kind === "now") && post?.repeat) fields.repeat = null;
    if (autoMode !== (post?.auto_mode ?? "brand")) fields.auto_mode = autoMode;
    return {
      fields,
      targets: picked.map((id) => ({ account_id: id, custom_body: custom[id] ?? null, format: formats[id] ?? "post" })),
      ...(contentLocked ? {} : {
        media: mediaList.map((m) => ({ media_id: m.media_id, alt_text: m.alt_text?.trim() || null })),
        comments: liveComments.map((c) => ({ body: c.body, delay_minutes: c.delay, media_id: c.media_id })),
      }),
      tags: tagIds,
    };
  }

  async function saveContent(base: SavedRef | null, stateNow: PostState, kind: Act): Promise<SavedRef> {
    if (!base) return (await api.create(brand.id, input(kind))).post;
    if (stateNow === "queued" || stateNow === "published") return base;   // nothing of its content may change
    return (await api.save(brand.id, base.id, base.version, input(kind))).post;
  }

  // this post's own auto-reply rule (0105: a rule save moves the post's version, so the next step uses the new one)
  async function saveRule(ref: SavedRef, stateNow: PostState): Promise<SavedRef> {
    if (stateNow === "queued") return ref;   // the panel is read-only then; the store refuses it too
    let version = ref.version;
    if (autoMode === "own" && rule && (ruleDirty || !rule.id)) {
      const r = await api.saveAutoRule(brand.id, rule.id, { post_id: ref.id, name: rule.name.trim() || "這則專用", trigger: rule.trigger,
        keywords: splitKeywords(rule.keywords), platforms: rule.platforms, action: rule.action, reply: rule.reply.trim(), active: true });
      setRule({ ...rule, id: r.id });
      setRuleDirty(false);
      setOwnRuleIds((ids) => (ids.includes(r.id) ? ids : [...ids, r.id]));
      version = r.postVersion ?? version;
    } else if (autoMode !== "own" && ownRuleIds.length) {
      for (const id of ownRuleIds) version = (await api.deleteAutoRule(brand.id, id)).postVersion ?? version;
      setOwnRuleIds([]);
    }
    return { id: ref.id, version };
  }

  async function run(kind: Act) {
    setMenuOpen(false);
    if (kind === "library") {
      if (!body.trim()) return say("貼文還是空的。", true);
      try {
        await api.addText(brand.id, body.trim(), mediaList.map((m) => m.media_id));
        setTexts(null);
        return say(mediaList.length ? `已把文字和 ${mediaList.length} 個媒體存到素材庫。` : "已把文字存到素材庫（常用文字）。");
      } catch (e) {
        return say(message(e), true);
      }
    }
    const bad = validate(kind);
    if (bad) return say(bad, true);
    let when: string | null = null;
    if (kind === "schedule" || kind === "repeat") {
      when = instantAt(date, time, tz);
      if (Date.parse(when) <= Date.now()) return say("發佈時間要在未來。要現在發，選「立即發佈」。", true);
    }
    setBusy(true);
    setHint(null);
    try {
      const st: PostState = done.current?.state ?? state;
      const live = st === "scheduled" || st === "queued";
      let ref: SavedRef = done.current?.ref ?? (post ? { id: post.id, version: post.version } : { id: "", version: 0 });
      const keep = (r: SavedRef, s: PostState) => { ref = r; done.current = { ref: r, state: s }; };
      const step = async (s: StateInput, to: PostState) => keep((await api.setState(brand.id, ref.id, ref.version, s)).post, to);
      if (ref.id && live && (kind === "draft" || kind === "review")) {
        // taken off the schedule first, then edited: with review on, an approved post's content is refused while it is
        // scheduled (review 2026-10-15), and a draft or a submission is what these two ask for anyway
        await step({ action: "unschedule" }, "draft");
        keep(await saveContent(ref, "draft", kind), "draft");
      } else {
        keep(await saveContent(ref.id ? ref : null, st, kind), st);
      }
      const now = done.current?.state ?? st;
      keep(await saveRule(ref, now), now);
      if (now === "rotation" && kind !== "keep") await step({ action: "from_rotation" }, "draft");
      if (kind === "draft") props.onSaved(ref.id, live ? "已取消排程，存成草稿。" : st === "rotation" ? "已移出自動發布清單，存成草稿。" : st === "review" ? "已存起來，還在等審核。" : "已存成草稿。");
      else if (kind === "keep") props.onSaved(ref.id, "已存起來（還在自動發布清單裡）。");
      else if (kind === "review") {
        if (st !== "review") await step({ action: "submit" }, "review");
        props.onSaved(ref.id, st === "review" ? "已存起來，還在等審核。" : "已送審，審核人核准後才會排程。");
      } else if (kind === "schedule" || kind === "repeat") {
        await step({ action: "schedule", scheduledAt: when as string }, "scheduled");
        const z = zoned(when as string, tz);
        props.onSaved(ref.id, kind === "repeat" ? `已設定週期：${repeatText(repeat, z.date, z.time)}。` : `已排在 ${shortDate(z.date)} ${z.time}。按「回排程日曆」看它在哪。`, { date: z.date });
      } else {
        await step({ action: "publish_now", confirmPublishNow: true }, "scheduled");
        props.onSaved(ref.id, "已交出去，幾分鐘內會看到結果。", { date: zoned(new Date().toISOString(), tz).date });
      }
    } catch (e) {
      say(message(e), true);
    } finally {
      setBusy(false);
      setConfirmNow(false);
    }
  }

  async function copyAsNew() {
    if (!post) return;
    setBusy(true);
    try {
      const ref = (await api.create(brand.id, copyInput(post))).post;
      props.onSaved(ref.id, "已複製成新草稿。");
    } catch (e) {
      say(message(e), true);
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File) {
    const video = file.type.startsWith("video/");
    const tooLarge = uploadTooLarge(file);
    if (tooLarge) return say(tooLarge, true);
    const target = uploadFor.current;
    setBusy(true);
    try {
      const dataUrl = await fileDataUrl(file, squareCrop);
      const name = file.name.replace(/[^\w.\- ]/g, "_").slice(0, 200) || (video ? "video.mp4" : "image.webp");
      const { media } = video ? await api.uploadVideo(brand.id, dataUrl, name) : await api.upload(brand.id, dataUrl, name);
      props.onMediaAdded(media);
      if (target === "post") setMediaList((l) => [...l, { media_id: media.id, alt_text: null }]);
      else setComments((cs) => cs.map((c) => (c.key === target ? { ...c, media_id: media.id } : c)));
    } catch (e) {
      say(message(e), true);
    } finally {
      setBusy(false);
    }
  }
  const moveMedia = (id: string, delta: -1 | 1) => setMediaList((list) => {
    const index = list.findIndex((m) => m.media_id === id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= list.length) return list;
    const next = [...list]; [next[index], next[target]] = [next[target], next[index]]; return next;
  });
  const pickFile = (target: "post" | number) => { uploadFor.current = target; fileRef.current?.click(); };
  const addComment = () => {
    if (comments.length >= MAX_COMMENTS) return say(`留言最多 ${MAX_COMMENTS} 則。`, true);
    setComments((cs) => [...cs, { key: ++keyRef.current, body: "", delay: 0, media_id: null }]);
  };

  // ---- the bottom row's hint (mock renderHint) ----
  const notices: Array<{ text: string; error?: boolean }> = [
    ...(post ? targetProblems(post, accounts).map((text) => ({ text, error: true })) : []),
    ...(queued ? [{ text: "這則已交給 Postiz 等時間到。可以改時間或取消排程；內容、頻道、標籤、自動回覆和週期性安排要先取消排程（存草稿）才能改。" }] : []),
    ...(sentIds.size && state !== "published" ? [{ text: "已有頻道發出了，共用的文字和媒體不能再改；其他頻道可以另寫文字。" }] : []),
    ...(state === "review" && brand.role !== "reviewer" ? [{ text: "等審核人核准，核准後照排定時間發。" }] : []),
    ...(post?.repeat && !post.published_at ? [{ text: "這則是週期性安排的第一次。在它發出前刪掉，整個系列都會停止。" }] : []),
    ...(post?.repeat_of ? [{ text: "這是週期性安排產生的一次。改這一則，只改這一次。" }] : []),
    ...(reviewGate && unapproved ? [{ text: "這個品牌要審核：先送審，擁有者核准後才會排上。" }] : []),
  ];
  const hintNode = (
    <>
      {hint && <span className={hint.error ? "sm-err" : "sm-muted"}>{hint.text}</span>}
      {!hint && notices.slice(0, 2).map((n) => <span key={n.text} className={n.error ? "sm-err" : "sm-muted"}>{n.text}</span>)}
      {state === "published" && post && (
        <span className="sm-muted">已發佈，不能改。<span className="sm-release-links sm-release-links-own" aria-label="已發佈貼文連結">{post.targets.filter((t) => t.release_url).map((t) => {
          const a = accounts.find((x) => x.id === t.account_id);
          const label = `在 ${a ? platformOf(a.platform).name : "平台"} 查看貼文`;
          return <a key={t.id} href={t.release_url as string} target="_blank" rel="noopener noreferrer" aria-label={label}><PfMark platform={a?.platform ?? ""} />{label}</a>;
        })}</span></span>
      )}
    </>
  );
  const when = act === "now" ? "現在就發" : act === "repeat" ? repeatText(repeat, date, time) : act === "library" ? "不用時間" : whenText(date, time);

  return (
    <div className={`sm-cgrid${mobilePane === "preview" ? " sm-mobile-preview" : ""}`}>
      <div className="sm-mobile-compose-tabs" role="tablist" aria-label="撰寫頁檢視">
        <button type="button" role="tab" aria-selected={mobilePane === "write"} className={mobilePane === "write" ? "sm-on" : ""} onClick={() => setMobilePane("write")}>編輯</button>
        <button type="button" role="tab" aria-selected={mobilePane === "preview"} className={mobilePane === "preview" ? "sm-on" : ""} onClick={() => setMobilePane("preview")}>預覽</button>
      </div>
      <ChannelPicker accounts={accounts} picked={picked} locked={sentIds} readOnly={readOnly || queued}
        onToggle={(id) => { pickTouched.current = true; setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id])); }} />
      <div className="sm-cwrite">
        <Writer channels={channels} tab={curTab} onTab={setTab}
          body={body} custom={custom}
          onText={(v) => { if (curTab !== "all" && custom[curTab] != null) setCustom((c) => ({ ...c, [curTab]: v })); else setBody(v); }}
          onOwn={(id, own) => setCustom((c) => { const n = { ...c }; if (own) n[id] = body; else delete n[id]; return n; })}
          link={link} onLink={setLink} utm={utm} onUtm={setUtm} notes={notes} onNotes={setNotes}
          media={mediaList} mediaPath={mediaPath} mediaKind={mediaKind} onAlt={(id, alt) => setMediaList((l) => l.map((m) => (m.media_id === id ? { ...m, alt_text: alt } : m)))}
          onRemoveMedia={(id) => setMediaList((l) => l.filter((m) => m.media_id !== id))} onMoveMedia={moveMedia} onPickFile={() => pickFile("post")}
          cropOnUpload={squareCrop} onCropUpload={setSquareCrop}
          onOpenLibrary={props.onOpenLibrary}
          open={open} onOpen={(k) => setOpen((o) => { const n = new Set(o); if (n.has(k)) n.delete(k); else n.add(k); return n; })}
          onAddComment={addComment} texts={texts}
          onSaveText={() => load(() => api.addText(brand.id, body.trim()), ({ text }) => { setTexts((t) => [...(t ?? []), text]); say("已存到常用文字。"); }, (e) => say(message(e), true))}
          textFor={textFor} sharedEditable={!contentLocked} channelEditable={channelEditable} writable={!readOnly}
          above={<>{props.source}{props.reviewBar}</>}
          below={<>
            <Comments comments={comments} channels={channels} editable={!contentLocked} mediaPath={mediaPath} onChange={setComments} onAdd={addComment} onPickImage={(k) => pickFile(k)} />
            <Formats channels={channels} tab={curTab} formats={formats} editable={channelEditable} onFormat={(id, f) => setFormats((x) => ({ ...x, [id]: f }))} />
            <AutoReply mode={autoMode} open={autoOpen} brandRules={brandRules} rule={rule} editable={!readOnly && !queued}
              onMode={(m) => { setAutoMode(m); if (m === "own" && !rule) setRule(blankRule()); }} onOpen={() => setAutoOpen((o) => !o)}
              onRule={(r) => { setRule(r); setRuleDirty(true); }} />
          </>} />
        <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
      </div>
      <Previews channels={channels} tab={curTab} textFor={textFor} formats={formats} images={images} mediaKinds={mediaKinds}
        comments={comments} mediaPath={mediaPath} commentImage={commentTakesMedia} when={act === "now" ? "剛剛" : `${shortDate(date)} ${time}`} />
      <Footer
        tags={<TagPicker brandId={brand.id} tags={tags} selected={tagIds} disabled={readOnly || queued} canEdit={canWrite} onSelect={setTagIds} onTags={setTags} say={say} />}
        hint={hintNode} when={when} whenDisabled={readOnly || act === "now" || act === "library" || act === "keep"} onWhen={() => setDtOpen(true)}
        picker={dtOpen ? (
          <DateTimePicker date={date} time={time} tz={tz} today={props.today} repeat={act === "repeat" ? repeat : null} onClose={() => setDtOpen(false)}
            onDone={(t, d, r) => { setTime(t); if (d) setDate(d); if (r) setRepeat(r); setDtOpen(false); }} />
        ) : null}
        act={act} can={can} busy={busy} menuOpen={menuOpen} onMenu={setMenuOpen} onAct={(a) => { setChosen(a); setConfirmNow(false); }}
        onMain={() => (act === "now" ? setConfirmNow(true) : void run(act))}
        confirmNow={confirmNow} confirmChannels={channels} onConfirm={() => void run("now")} onCancel={() => setConfirmNow(false)}
        readOnlyMain={readOnly ? (state === "published" && canWrite ? { label: "複製成新貼文", onClick: () => void copyAsNew() } : null) : null} />
    </div>
  );
}
