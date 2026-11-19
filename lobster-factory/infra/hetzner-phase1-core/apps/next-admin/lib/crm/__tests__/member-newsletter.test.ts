// N10 weekly member newsletter (lib/crm/member-newsletter.ts M1-M5), on fake deps: no DB, no bridge, no FluentCRM.
import { describe, expect, it, vi } from "vitest";
import type { BridgeNewsletterSpec } from "@/lib/crm/fluentcrm";
import { lastBrandWeek, newsletterItem, runMemberNewsletter, type MemberNewsletterDeps, type NewsletterItem, type NewsletterSite } from "@/lib/crm/member-newsletter";
import { clientJob } from "@/lib/schedules/jobs";
import { isDueNow } from "@/lib/schedules/schedule";

// Wednesday 2026-11-18 10:00 Taipei: the last full week is Mon 11-09 .. Sun 11-15
const NOW = new Date("2026-11-18T02:00:00Z");
const SITE: NewsletterSite = { id: "s1", name: "覺知波", url: "https://aware-wave.com", defaults: { requiredBlocks: ["本信由覺知波寄出，回覆即可聯絡我們。"] } };
const item = (over: Partial<NewsletterItem> = {}): NewsletterItem => ({
  title: "冥想入門", summary: "五分鐘學會呼吸", link: "https://youtu.be/abc", isVideo: true, publishedAt: "2026-11-12T03:00:00.000Z", ...over,
});

function deps(over: Partial<MemberNewsletterDeps> = {}, items: NewsletterItem[] = [item()]) {
  const claimed = new Set<string>();
  const d = {
    sites: vi.fn(async () => [SITE]),
    timeZone: vi.fn(async () => "Asia/Taipei"),
    published: vi.fn(async () => items),
    bridgeFor: vi.fn(() => "1"),
    // the DB's conditional update: one firing per site and week wins
    claimWeek: vi.fn(async (siteId: string, monday: string) => (claimed.has(`${siteId}:${monday}`) ? false : (claimed.add(`${siteId}:${monday}`), true))),
    createDraft: vi.fn(async () => ({ ok: true as const, value: { status: "committed", campaign_id: 42, campaign_status: "draft", edit_url: "https://aware-wave.com/wp-admin/x" } })),
    notify: vi.fn(async () => {}),
    ...over,
  };
  return d;
}

describe("member_newsletter", () => {
  it("the week is the last brand Monday-Sunday", () => {
    expect(lastBrandWeek(NOW, "Asia/Taipei")).toEqual({ monday: "2026-11-09", sunday: "2026-11-15", from: "2026-11-08T16:00:00.000Z", to: "2026-11-15T16:00:00.000Z" });
  });

  it("a week with nothing published claims nothing and creates nothing", async () => {
    const d = deps({}, [item({ publishedAt: "2026-11-16T01:00:00Z" })]);   // this week's, not last week's
    expect(await runMemberNewsletter(d, NOW)).toBe("site=s1 week=2026-11-09 none published");
    expect(d.claimWeek).not.toHaveBeenCalled();
    expect(d.createDraft).not.toHaveBeenCalled();
  });

  it("two firings in the same week make one draft", async () => {
    const d = deps();
    expect(await runMemberNewsletter(d, NOW)).toBe("site=s1 week=2026-11-09 draft=42 items=1");
    expect(await runMemberNewsletter(d, new Date("2026-11-19T02:00:00Z"))).toBe("site=s1 week=2026-11-09 already made");
    expect(d.createDraft).toHaveBeenCalledTimes(1);
    expect(d.notify).toHaveBeenCalledTimes(1);
    expect(vi.mocked(d.notify).mock.calls[0][0]).toMatchObject({ signalType: "business", title: "會員信草稿已備好：〈覺知波〉，1 支影片，到 FluentCRM 看過再寄" });
  });

  it("a site without FluentCRM is skipped and says so; no incident, no notice", async () => {
    const d = deps({ createDraft: vi.fn(async () => ({ ok: false as const, error: "fluentcrm_not_active" })) });
    expect(await runMemberNewsletter(d, NOW)).toBe("site=s1 week=2026-11-09 skipped: 沒裝 FluentCRM");
    expect(d.notify).not.toHaveBeenCalled();
    const nb = deps({ bridgeFor: vi.fn(() => null) });
    expect(await runMemberNewsletter(nb, NOW)).toBe("site=s1 week=2026-11-09 skipped: 沒有接 Bridge");
    expect(nb.createDraft).not.toHaveBeenCalled();
  });

  it("a bridge failure after the claim is skipped but a person is told once (critic M1)", async () => {
    const d = deps({ createDraft: vi.fn(async () => ({ ok: false as const, error: "bridge_timeout" })) });
    expect(await runMemberNewsletter(d, NOW)).toBe("site=s1 week=2026-11-09 skipped: Bridge 不通（bridge_timeout）");
    expect(vi.mocked(d.notify).mock.calls[0][0]).toMatchObject({ fingerprint: "member_newsletter:s1:2026-11-09:failed" });
  });

  it("the preview never cuts a character in half (critic M2: a lone surrogate makes the plugin refuse the body)", async () => {
    const d = deps({}, [item({ title: `${"字".repeat(119)}😀尾` })]);
    await runMemberNewsletter(d, NOW);
    const spec = vi.mocked(d.createDraft).mock.calls[0][0] as BridgeNewsletterSpec;
    expect(spec.preview).toBe(`${"字".repeat(119)}😀`);
    expect(JSON.stringify(spec)).not.toMatch(/\\ud83d/);
  });

  it("the email carries each title, its link (YouTube, else the article) and the site's must-carry paragraphs", async () => {
    const d = deps({}, [item(), item({ title: "睡前伸展", summary: "", link: "https://aware-wave.com/stretch", isVideo: false })]);
    await runMemberNewsletter(d, NOW);
    const [spec, clientId] = vi.mocked(d.createDraft).mock.calls[0] as unknown as [BridgeNewsletterSpec, string];
    expect(clientId).toBe("1");
    expect(spec.subject).toBe("覺知波 本週新內容（11/9–11/15）");
    for (const s of ["冥想入門", "五分鐘學會呼吸", "https://youtu.be/abc", "睡前伸展", "https://aware-wave.com/stretch", "本信由覺知波寄出，回覆即可聯絡我們。"]) {
      expect(spec.body_html).toContain(s);
    }
    expect(newsletterItem({ title: "t", updated_at: "2026-11-12T00:00:00+00:00", artifacts: {
      article: { summary: "s", published: { link: "https://site/a", at: "2026-11-12T01:00:00.000Z" } },
      publish: { youtube: { url: "https://youtu.be/y" } },
    } })).toMatchObject({ link: "https://youtu.be/y", isVideo: true });
  });

  it("an organization without the schedule row is off: the sweep never runs it", () => {
    const job = clientJob("member_newsletter")!;
    const cell = { ...job.defaults, enabled: false, lastRunAt: null };   // what a client with no row reads as (view.ts)
    expect(isDueNow(cell, new Date(Date.UTC(2026, 10, 16, job.defaults.hourUtc)))).toBe(false);
  });
});
