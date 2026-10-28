/**
 * V5.2: a finished video becomes one social DRAFT per ticked channel (draft-first, D10). Each channel gets the ratio its
 * platform takes (platform-ratio.ts) and its own text; the video is uploaded to the brand's media once per ratio.
 * Dependencies are passed in so the route owns auth and the social store, and the rule stays testable.
 */
import { ratioFor, ratioOfUrl } from "./platform-ratio";

export interface DraftItem { accountId: string; text: string }
export interface DraftDeps {
  /** The brand's channels (social accounts). */
  accounts(): Promise<Array<{ id: string; platform: string; status: string; label: string }>>;
  /** Approved Releases of this video: one per finished ratio row. */
  releases(): Promise<Array<{ releaseId: string; ratio: string; videoUrl: string }>>;
  /** Checks the text against each platform's hard limit; throws with the reason. */
  assertWithinLimits(body: string, accountId: string): Promise<void>;
  addVideo(videoUrl: string, fileName: string): Promise<{ id: string }>;
  savePost(fields: { body: string; notes: string }, accountId: string, mediaId: string): Promise<{ id: string }>;
}
export type DraftResult =
  | { ok: true; drafts: Array<{ accountId: string; postId: string; ratio: string; platform: string }> }
  | { ok: false; status: number; error: string };

export async function saveVideoSocialDrafts(deps: DraftDeps, title: string, items: DraftItem[]): Promise<DraftResult> {
  if (items.length === 0) return { ok: false, status: 400, error: "沒有勾選頻道" };
  if (items.some((i) => !i.text.trim())) return { ok: false, status: 400, error: "每個頻道都要有文案" };
  const [accounts, releases] = await Promise.all([deps.accounts(), deps.releases()]);
  const plan: Array<DraftItem & { platform: string; ratio: string; videoUrl: string }> = [];
  for (const item of items) {
    const account = accounts.find((a) => a.id === item.accountId);
    if (!account) return { ok: false, status: 404, error: "頻道不屬於這個客戶" };
    if (account.status !== "connected") return { ok: false, status: 409, error: `${account.label} 的連線已失效，請先到社群工具重新連線` };
    const ratio = ratioFor(account.platform, releases.map((r) => r.ratio));
    const release = releases.find((r) => r.ratio === ratio);
    if (!ratio || !release) return { ok: false, status: 409, error: `${account.label} 需要的比例還沒有核准發布的影片` };
    plan.push({ ...item, platform: account.platform, ratio, videoUrl: release.videoUrl });
  }
  for (const p of plan) await deps.assertWithinLimits(p.text, p.accountId);   // every text first: nothing is uploaded or saved on a refusal

  const media = new Map<string, string>();
  const drafts: Array<{ accountId: string; postId: string; ratio: string; platform: string }> = [];
  for (const p of plan) {
    if (!media.has(p.ratio)) media.set(p.ratio, (await deps.addVideo(p.videoUrl, `${ratioOfUrl(p.videoUrl) ?? p.ratio}.mp4`)).id);
    const post = await deps.savePost({ body: p.text, notes: `影片：${title}`.slice(0, 500) }, p.accountId, media.get(p.ratio)!);
    drafts.push({ accountId: p.accountId, postId: post.id, ratio: p.ratio, platform: p.platform });
  }
  return { ok: true, drafts };
}
