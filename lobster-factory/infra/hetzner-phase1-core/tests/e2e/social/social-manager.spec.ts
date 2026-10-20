/**
 * /tools/social UI flows (lobster-factory/docs/social/SOCIAL_MANAGER_PLAN.md C6 acceptance): create -> schedule ->
 * drag -> list bulk -> restore, and the one-screen rule (1280x660, no page scroll); C7 a rotation list takes a draft;
 * C10 a WordPress article starts a post from its own excerpt. C19: 建立貼文 opens the composer's own page
 * (compose/new), 回排程日曆 comes back to the calendar. C21: the composer's main button does what ▾ picked; two comments
 * go out with the post.
 * Every /api/social call is answered by an in-memory fake below (page.route), so this tests the page, never a
 * database or Postiz; the API itself is covered by next-admin app/api/social/__tests__. Run against a dev server
 * with no Supabase configured (.claude/launch.json "next-admin-social-ui", port 3902):
 *   cd lobster-factory/infra/hetzner-phase1-core/tests && PLAYWRIGHT_SOCIAL_URL=http://127.0.0.1:3902 npx playwright test --project social
 */
import { expect, test, type Page, type Route } from '@playwright/test';

const BRAND = { id: '0b0b0b0b-0000-4000-8000-000000000001', slug: 'soulful', name: 'Soulful Expression', default_timezone: 'Asia/Taipei', role: 'owner' };
const ACCOUNTS = [
  { id: 'acc00000-0000-4000-8000-000000000001', platform: 'bluesky', label: 'soulful.bsky.social', status: 'connected', postiz_integration_id: 'i1' },
  { id: 'acc00000-0000-4000-8000-000000000002', platform: 'facebook', label: 'Soulful 粉專', status: 'connected', postiz_integration_id: 'i2' },
];

type Post = Record<string, any>;

const ARTICLE = { siteId: 'site-1', siteName: 'Soulful', id: 42, title: '藝術治療和畫畫課有什麼不同', status: 'publish', date: '', viewUrl: 'https://soulful.example/a' };

function fakeServer() {
  const posts = new Map<string, Post>();
  const lists = new Map<string, Post>();
  const calls: string[] = [];
  let n = 0;
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  const ok = (route: Route, body: object = {}) => json(route, { ok: true, ...body });
  const write = (p: Post, input: any) => {
    Object.assign(p, input.fields ?? {});
    if (input.targets) p.targets = input.targets.map((t: any, i: number) => ({ id: `${p.id}-t${i}`, state: 'pending', postiz_post_id: null, release_url: null, error: null, ...t }));
    if (input.media) p.media = input.media.map((m: any, i: number) => ({ ...m, position: i }));
    if (input.comments) p.comments = input.comments.map((c: any, i: number) => ({ ...c, position: i }));
    if (input.tags) p.tags = input.tags.map((tag_id: string) => ({ tag_id }));
  };
  async function handle(route: Route) {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const body = req.postDataJSON?.() ?? null;
    calls.push(`${req.method()} ${path}${body?.action ? ` ${body.action}` : ''}`);
    if (path === '/api/social/brands') return ok(route, { brands: [BRAND] });
    if (path === '/api/social/accounts') return ok(route, { accounts: ACCOUNTS, connecting: null, justConnected: null, connectFailed: null });
    if (path === '/api/social/media') return ok(route, { media: [
      { id: 'media-image', kind: 'image', file_name: 'poster.png', postiz_path: null, bytes: 10, created_at: '2026-10-01T00:00:00Z', used: 0 },
      { id: 'media-video', kind: 'video', file_name: 'clip.mp4', postiz_path: null, bytes: 20, created_at: '2026-10-02T00:00:00Z', used: 0 },
    ] });
    if (path === '/api/social/texts') return ok(route, { texts: [{ id: 'saved-1', body: '素材庫裡的貼文文字。', mediaIds: ['media-image'] }] });
    if (path === '/api/social/needs') return ok(route, { failed: [], expired: [], review: [], n: 0 });
    if (path === '/api/social/settings') return ok(route, { requireReview: false });
    if (path === '/api/social/log') return ok(route, { log: [] });
    if (path === '/api/social/wp-article') return ok(route, { article: { title: ARTICLE.title, excerpt: '畫畫課教技巧；藝術治療看的是過程。', content: '', link: ARTICLE.viewUrl, image: null } });
    if (path === '/api/social/lists' && req.method() === 'GET') return ok(route, { lists: [...lists.values()] });
    if (path === '/api/social/lists' && req.method() === 'POST') {
      const id = `11111111-0000-4000-8000-${String(++n).padStart(12, '0')}`;
      lists.set(id, { id, name: body.name, weekdays: body.weekdays, send_time: body.send_time, active: body.active, cursor: 0, accounts: body.account_ids.map((a: string) => ({ account_id: a })) });
      return ok(route, { id, materialized: 0 });
    }
    const lm = path.match(/^\/api\/social\/lists\/([^/]+)$/);
    if (lm && req.method() === 'GET') {
      const items = [...posts.values()].filter((p) => p.state === 'rotation' && p.list_id === lm[1]).sort((a, b) => a.list_position - b.list_position);
      return ok(route, { list: lists.get(lm[1]), items, upcoming: [] });
    }
    if (path === '/api/social/posts' && req.method() === 'GET') {
      if (url.searchParams.get('trash') === '1') return ok(route, { posts: [...posts.values()].filter((p) => p.state === 'deleted'), deletions: {} });
      const start = Date.parse(url.searchParams.get('start')!), end = Date.parse(url.searchParams.get('end')!);
      // the article sits on the second day of the window, 08:00 site time
      const day = new Date(start + 36 * 3600_000).toISOString().slice(0, 10);
      return ok(route, { undatedTruncated: false, tags: [], wordpress: [{ ...ARTICLE, date: `${day}T08:00:00` }], posts: [...posts.values()].filter((p) => p.state !== 'deleted'
        && (p.scheduled_at === null || (Date.parse(p.scheduled_at) >= start && Date.parse(p.scheduled_at) < end))) });
    }
    if (path === '/api/social/posts' && req.method() === 'POST') {
      const id = `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
      const p: Post = { id, state: 'draft', body: '', scheduled_at: null, list_id: null, list_position: null, first_comment: null, link_url: null, link_utm: false,
        notes: null, source_url: null, published_at: null, deleted_at: null, created_by: 'ops:owner', version: 1, targets: [], media: [],
        repeat: null, repeat_of: null, origin_slot: null, auto_mode: 'brand', comments: [], tags: [] };
      write(p, body);
      posts.set(id, p);
      return ok(route, { post: { id, version: 1 } });
    }
    if (path === '/api/social/posts/bulk') {
      const results = body.items.map((it: any) => {
        const p = posts.get(it.id)!;
        p.state = it.action === 'delete' ? 'deleted' : 'review';
        p.version++;
        return { id: it.id, ok: true, version: p.version, state: p.state };
      });
      return ok(route, { results });
    }
    const m = path.match(/^\/api\/social\/posts\/([^/]+)(\/state)?$/);
    if (m) {
      const p = posts.get(m[1]);
      if (!p) return json(route, { ok: false, error: 'no such post' }, 404);
      if (req.method() === 'GET') return ok(route, { post: p });
      if (body.version !== p.version) return json(route, { ok: false, error: 'changed' }, 409);
      if (!m[2]) write(p, body);
      else if (body.action === 'schedule') Object.assign(p, { state: 'scheduled', scheduled_at: body.scheduledAt });
      else if (body.action === 'unschedule') p.state = 'draft';
      else if (body.action === 'submit') p.state = 'review';
      else if (body.action === 'delete') Object.assign(p, { state: 'deleted', deleted_at: new Date().toISOString() });
      else if (body.action === 'restore') Object.assign(p, { state: 'draft', deleted_at: null });
      else if (body.action === 'publish_now') Object.assign(p, { state: 'scheduled', scheduled_at: new Date().toISOString() });
      else if (body.action === 'to_rotation') Object.assign(p, { state: 'rotation', scheduled_at: null, list_id: body.listId, list_position: body.listPosition });
      p.version++;
      return ok(route, { post: { id: p.id, version: p.version } });
    }
    return json(route, { ok: false, error: `fake: ${path} not handled` }, 501);
  }
  return { posts, calls, handle };
}

async function open(page: Page) {
  const server = fakeServer();
  await page.route('**/api/social/**', (r) => server.handle(r));
  // a Wednesday noon in Taipei: the week view ends on Sunday, so on a Saturday evening "tomorrow" is its last column and
  // the drag below could only go back into the past (same pin as __tests__/SocialManager.switch-post.render.test.tsx)
  await page.clock.setFixedTime(new Date('2026-10-14T04:00:00Z'));
  await page.setViewportSize({ width: 1280, height: 660 });
  await page.goto(`/tools/social?brand=${BRAND.id}`);
  await expect(page.getByRole('heading', { name: '社群發文' })).toBeVisible();
  await expect(page.getByRole('button', { name: BRAND.name })).toBeVisible();
  return server;
}

/** the composer's ▾: pick what the main button does (C21) */
async function pick(page: Page, act: string) {
  await page.getByRole('button', { name: '換一種做法' }).click();
  await page.getByRole('menuitemradio', { name: new RegExp(`^${act}`) }).click();
}

/** 建立貼文 -> the composer's own page */
async function compose(page: Page) {
  await page.getByRole('button', { name: '建立貼文' }).click();
  await page.waitForURL(/\/tools\/social\/compose\/new/);
  await expect(page.getByLabel('貼文內容')).toBeVisible();
}

test.describe('social manager', () => {
  test('fits one 1280x660 screen with no page scroll', async ({ page }) => {
    await open(page);
    const size = await page.evaluate(() => ({ h: document.scrollingElement!.scrollHeight, w: document.scrollingElement!.scrollWidth }));
    expect(size.h).toBeLessThanOrEqual(660);
    expect(size.w).toBeLessThanOrEqual(1280);
    expect(await page.locator('select').count()).toBe(0);
  });

  test('create -> schedule -> drag to another day -> list bulk delete -> restore', async ({ page }) => {
    const server = await open(page);

    // create on the composer's page and schedule (tomorrow 12:00 is the new post's default); the address becomes the post's
    await compose(page);
    await page.getByLabel('貼文內容').fill('週六親子藝術時光還有三個名額。');
    await page.getByRole('button', { name: '設定行程', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('已排在');
    const [post] = [...server.posts.values()];
    expect(post.state).toBe('scheduled');
    expect(post.targets.map((t: any) => t.account_id).sort()).toEqual(ACCOUNTS.map((a) => a.id).sort());
    await expect(page).toHaveURL(new RegExp(`/tools/social/compose/${post.id}`));
    await page.getByRole('button', { name: '回排程日曆' }).click();
    await page.waitForURL(/\/tools\/social\?/);
    // Back reopens the saved post, not an empty composer that would save a duplicate (critic 2026-10-17)
    await page.goBack();
    await expect(page.getByLabel('貼文內容')).toHaveValue('週六親子藝術時光還有三個名額。');
    await page.getByRole('button', { name: '回排程日曆' }).click();
    await page.waitForURL(/\/tools\/social\?/);

    // the week shows it; drag it one day later
    const before = post.scheduled_at as string;
    const card = page.locator('.sm-post', { hasText: '週六親子藝術時光' });
    await expect(card).toBeVisible();
    const from = await card.boundingBox();
    const cols = page.locator('.sm-col');
    const fromDay = await card.evaluate((el) => (el.parentElement as HTMLElement).dataset.date);
    const fromIndex = await cols.evaluateAll((els, d) => els.findIndex((e) => (e as HTMLElement).dataset.date === d), fromDay);
    const target = cols.nth(fromIndex === 6 ? 5 : fromIndex + 1);
    const box = await target.boundingBox();
    await card.dragTo(target, { targetPosition: { x: box!.width / 2, y: from!.y - box!.y + 4 } });
    await expect(page.getByRole('status')).toContainText('已改到');
    expect(server.calls.filter((c) => c.endsWith('/state schedule')).length).toBe(2);
    const after = server.posts.get(post.id)!.scheduled_at as string;
    expect(Math.abs(Date.parse(after) - Date.parse(before) - 24 * 3600_000)).toBeLessThan(3600_000);   // a day later, about the same time

    // list: tick it, bulk delete; then the bin restores it
    await page.getByRole('button', { name: '貼文清單', exact: true }).click();
    await page.getByLabel('選取').first().check();
    await page.getByRole('button', { name: /^批次動作/ }).click();
    await page.getByRole('menuitem', { name: /^刪除所選/ }).click();
    await expect(page.getByRole('status')).toContainText('已刪除');
    expect(server.posts.get(post.id)!.state).toBe('deleted');
    await page.getByRole('button', { name: '已刪除貼文', exact: true }).click();
    await page.getByRole('button', { name: '還原' }).click();
    await expect(page.getByRole('status')).toContainText('已還原');
    expect(server.posts.get(post.id)!.state).toBe('draft');
  });

  // C22: the list's 批次動作 stays grey until something is ticked; two ticked posts go to review in one go
  test('C22: tick two posts in the list, 批次動作 -> 送審所選, and both wait for review', async ({ page }) => {
    const server = await open(page);
    ['第一則：十一月課程報名', '第二則：親子藝術時光'].forEach((body, i) => {
      const id = `00000000-0000-4000-8000-00000000009${i}`;
      server.posts.set(id, { id, state: 'scheduled', body, scheduled_at: `2026-10-15T0${i + 2}:00:00.000Z`, list_id: null, list_position: null, first_comment: null,
        link_url: null, link_utm: false, notes: null, source_url: null, published_at: null, deleted_at: null, created_by: 'ops:owner', version: 1,
        targets: [{ id: `${id}-t`, account_id: ACCOUNTS[0].id, custom_body: null, format: 'post', state: 'pending', postiz_post_id: null, release_url: null, error: null }],
        media: [], repeat: null, repeat_of: null, origin_slot: null, auto_mode: 'brand', comments: [], tags: [] });
    });
    await page.reload();
    await page.getByRole('button', { name: '貼文清單', exact: true }).click();
    await expect(page.getByRole('button', { name: /^批次動作/ })).toBeDisabled();
    await page.getByLabel('選取').nth(0).check();
    await page.getByLabel('選取').nth(1).check();
    await page.getByRole('button', { name: /^批次動作/ }).click();
    await page.getByRole('menuitem', { name: '送審所選' }).click();
    await expect(page.getByRole('status')).toContainText('已送審');
    expect([...server.posts.values()].map((p) => p.state)).toEqual(['review', 'review']);
  });

  // C21 acceptance: 建立 -> two comments -> 設定行程 -> back on the calendar the card is there; the comments went with it
  test('C21: a post with two comments is scheduled and shows on the calendar', async ({ page }) => {
    const server = await open(page);
    await compose(page);
    await page.getByLabel('貼文內容').fill('十一月團體課開放報名。');
    await page.getByRole('button', { name: '新增留言' }).last().click();
    await page.getByLabel('第 1 則留言', { exact: true }).fill('報名表在這裡。');
    await page.getByRole('button', { name: '新增留言' }).last().click();
    await page.getByLabel('第 2 則留言', { exact: true }).fill('名額滿了會在這裡說。');
    await page.getByRole('button', { name: '第 2 則什麼時候留' }).click();
    await page.getByRole('button', { name: '設定行程', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('已排在');
    const [post] = [...server.posts.values()];
    expect(post.state).toBe('scheduled');
    expect(post.comments).toEqual([
      { body: '報名表在這裡。', delay_minutes: 0, media_id: null, position: 0 },
      { body: '名額滿了會在這裡說。', delay_minutes: 1, media_id: null, position: 1 },
    ]);
    await page.getByRole('button', { name: '回排程日曆' }).click();
    await page.waitForURL(/\/tools\/social\?/);
    await expect(page.locator('.sm-post', { hasText: '十一月團體課開放報名' })).toBeVisible();
  });

  test('publishing now asks once more before it sends', async ({ page }) => {
    const server = await open(page);
    await compose(page);
    await page.getByLabel('貼文內容').fill('現在就發。');
    await pick(page, '立即發佈');
    await page.getByRole('button', { name: '立即發佈', exact: true }).click();
    await expect(page.getByText('發出去之後，這裡收不回來')).toBeVisible();
    expect(server.calls.some((c) => c.includes('publish_now'))).toBe(false);
    await page.getByRole('button', { name: '確定發佈' }).click();
    await expect(page.getByRole('status')).toContainText('已交出去');
    expect(server.calls.some((c) => c.endsWith('/state publish_now'))).toBe(true);
  });

  test('C7: a rotation list is created and takes a draft', async ({ page }) => {
    const server = await open(page);
    await compose(page);
    await page.getByLabel('貼文內容').fill('藝術治療需要會畫畫嗎？不用。');
    await pick(page, '存草稿');
    await page.getByRole('button', { name: '存草稿', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('已存成草稿');
    await page.getByRole('button', { name: '回排程日曆' }).click();
    await page.getByRole('button', { name: '自動發布清單', exact: true }).click();
    await page.getByRole('button', { name: '＋ 新清單' }).click();
    await page.getByLabel('清單名稱').fill('常見問題');
    await page.getByRole('button', { name: '一', exact: true }).click();
    await page.getByRole('button', { name: '儲存清單' }).click();
    await expect(page.getByRole('status')).toContainText('清單已儲存');
    await page.getByRole('button', { name: '從草稿加入' }).click();
    await page.getByRole('button', { name: /藝術治療需要會畫畫嗎/ }).click();
    await expect(page.getByText('已加到清單最後。')).toBeVisible();
    const [draft] = [...server.posts.values()];
    expect([draft.state, draft.list_position]).toEqual(['rotation', 0]);
  });

  test('C10: a WordPress article starts a post from its own excerpt, at no cost', async ({ page }) => {
    await open(page);
    await page.locator('.sm-post.sm-article').first().click();
    await page.waitForURL(/\/compose\/new\?.*article=42/);
    await expect(page.getByRole('button', { name: /AI 改寫（約 NT\$/ })).toBeVisible();
    await page.getByRole('button', { name: '用文章摘要' }).click();
    await expect(page.getByLabel('貼文內容')).toHaveValue(/藝術治療看的是過程。\n\n全文：https:\/\/soulful.example\/a/);
    await expect(page.getByText('沒有花錢')).toBeVisible();
  });

  test('C31: library tabs seed saved text or multiple media into a new post', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: '貼文素材庫', exact: true }).click();
    await expect(page.getByRole('button', { name: '存起來的貼文' })).toBeVisible();
    await expect(page.getByText('素材庫裡的貼文文字。')).toBeVisible();
    await page.getByText('素材庫裡的貼文文字。').click();
    await page.waitForURL(/\/tools\/social\/compose\/new/);
    await expect(page.getByLabel('貼文內容')).toHaveValue('素材庫裡的貼文文字。');
    await expect(page.locator('.sm-mt')).toHaveCount(1);

    await page.getByRole('button', { name: '回排程日曆' }).click();
    await page.getByRole('button', { name: '貼文素材庫', exact: true }).click();
    await page.getByRole('button', { name: '圖片和影片' }).click();
    await page.getByTitle('poster.png').click();
    await page.getByTitle('clip.mp4').click();
    await page.getByRole('button', { name: '用這些寫新貼文（2）' }).click();
    await page.waitForURL(/\/tools\/social\/compose\/new/);
    await expect(page.locator('.sm-mt')).toHaveCount(2);
  });
});
