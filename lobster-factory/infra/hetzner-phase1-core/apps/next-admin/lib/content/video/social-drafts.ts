/**
 * V5.2: a finished video becomes one social DRAFT per ticked channel (draft-first, D10). Each channel gets the ratio its
 * platform takes (platform-ratio.ts) and its own text; the video is uploaded to the brand's media once per ratio.
 * Dependencies are passed in so the route owns auth and the social store, and the rule stays testable.
 */
import { ratioFor } from "./platform-ratio";

/** ratio = the one the operator picked for this channel (B1); absent = the platform default (platform-ratio.ts). */
export interface DraftItem { accountId: string; text: string; ratio?: string }
export interface DraftDeps {
  /** The brand's channels (social accounts). */
  accounts(): Promise<Array<{ id: string; platform: string; status: string; label: string }>>;
  /** Approved Releases of this video: one per finished ratio row, with that row's chosen cover (lib/content/video/cover.ts). */
  releases(): Promise<Array<{ releaseId: string; ratio: string; videoUrl: string; coverUrl?: string | null }>>;
  /** Checks the text against each platform's hard limit; throws with the reason. */
  assertWithinLimits(body: string, accountId: string): Promise<void>;
  /** deadline = this save's one time limit (ms epoch): a cover is attempted only if it still fits (store.addVideo). */
  addVideo(videoUrl: string, fileName: string, coverUrl: string | null, deadline: number): Promise<{ id: string }>;
  /** altText = the video's title (card VD.5): the description a screen reader gets where the platform takes one. */
  savePost(fields: { body: string; notes: string; source_url?: string }, accountId: string, mediaId: string, altText: string): Promise<{ id: string }>;
}
export type DraftResult =
  | { ok: true; drafts: Array<{ accountId: string; postId: string; ratio: string; platform: string; mediaId: string }> }
  | { ok: false; status: number; error: string };

export async function saveVideoSocialDrafts(deps: DraftDeps, title: string, items: DraftItem[]): Promise<DraftResult> {
  if (items.length === 0) return { ok: false, status: 400, error: "沒有勾選頻道" };
  if (items.some((i) => !i.text.trim())) return { ok: false, status: 400, error: "每個頻道都要有文案" };
  const [accounts, releases] = await Promise.all([deps.accounts(), deps.releases()]);
  const plan: Array<DraftItem & { platform: string; ratio: string; videoUrl: string; coverUrl: string | null }> = [];
  for (const item of items) {
    const account = accounts.find((a) => a.id === item.accountId);
    if (!account) return { ok: false, status: 404, error: "頻道不屬於這個客戶" };
    if (account.status !== "connected") return { ok: false, status: 409, error: `${account.label} 的連線已失效，請先到社群工具重新連線` };
    const approved = releases.map((r) => r.ratio);
    if (item.ratio && !approved.includes(item.ratio)) return { ok: false, status: 409, error: `${account.label} 選的比例還沒有核准發布的影片` };
    const ratio = item.ratio ?? ratioFor(account.platform, approved);
    const release = releases.find((r) => r.ratio === ratio);
    if (!ratio || !release) return { ok: false, status: 409, error: `${account.label} 需要的比例還沒有核准發布的影片` };
    plan.push({ ...item, platform: account.platform, ratio, videoUrl: release.videoUrl, coverUrl: release.coverUrl ?? null });
  }
  for (const p of plan) await deps.assertWithinLimits(p.text, p.accountId);   // every text first: nothing is uploaded or saved on a refusal

  const media = new Map<string, string>();
  const deadline = Date.now() + 240_000;   // one budget for every ratio of this request (300 s proxy timeout)
  const drafts: Array<{ accountId: string; postId: string; ratio: string; platform: string; mediaId: string }> = [];
  for (const p of plan) {
    if (!media.has(p.ratio)) media.set(p.ratio, (await deps.addVideo(p.videoUrl, `${p.ratio}.mp4`, p.coverUrl, deadline)).id);
    const post = await deps.savePost({ body: p.text, notes: `影片：${title}`.slice(0, 500), source_url: p.videoUrl }, p.accountId, media.get(p.ratio)!, title.trim().slice(0, 1000));
    drafts.push({ accountId: p.accountId, postId: post.id, ratio: p.ratio, platform: p.platform, mediaId: media.get(p.ratio)! });
  }
  return { ok: true, drafts };
}
