const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const S = require('../shared/episode-spine.js');
const p = { id: 'p', title: '片名', ratio: '16:9', episodes: [{ id: 'e', shots: [], steps: [], outputs: [{ url: '/old.mp4', jobId: 'old' }],
  intro: { kind: 'title', fields: { title: '新片頭' }, seconds: 2, transition: 'crossfade', transitionSeconds: .5 } }] };
const jobs = [], preferences = {}, V = {
  projects: { list: async () => [p] }, preferences: { get: async (k, fallback) => preferences[k] || fallback },
  capabilities: {}, safeUrl: (u) => u, showJob() {}, jobAsset: (j) => ({ id: j.id, url: j.result.url, kind: 'video' }),
  generations: { list: async () => jobs, create: async (input) => {
    assert.ok(['editor-export', 'remotion-template'].includes(input.operation), '不得重生鏡頭或配音');
    const job = { id: 'j' + jobs.length, createdAt: String(jobs.length), input, status: 'succeeded', type: 'video', result: { url: input.prompt === '片頭標題卡' ? '/intro.mp4' : '/new' + jobs.length + '.mp4' } };
    jobs.push(job); return job;
  } },
};
const document = { createElement: () => ({ set src(u) { this.duration = u.includes('intro') ? 2 : 5; queueMicrotask(() => this.onloadedmetadata()); }, removeAttribute() {}, load() {} }) };
vm.runInNewContext(fs.readFileSync(require.resolve('../shared/bookends.js'), 'utf8'), { VideoWorkbench: V, EpisodeSpine: S, structuredClone, document, crypto, setTimeout, clearTimeout });
(async () => {
  const old = { id: 'old', input: { link: { projectId: 'p', episodeId: 'e' }, settings: { ratio: '16:9' } }, result: { url: '/old.mp4', script: '原旁白', mainCaptionCues: [{ startMs: 0, endMs: 900, text: '原旁白' }] } };
  const first = await V.bookends.join(old);
  assert.equal(first.input.settings.project.clips.filter((c) => c.bookend === 'intro').length, 1);
  assert.equal(first.input.settings.bookendBase.clips[0].asset.url, '/old.mp4');
  assert.equal(first.input.settings.project.clips.find((c) => c.id === 'main').startFrame, 60);
  assert.equal(first.input.settings.project.clips.find((c) => c.id === 'main').transition, '溶解');
  const text = require('../backend/release-text.cjs').releaseText(first);
  assert.match(text.script, /原旁白/);
  assert.equal(text.subtitles[0].startMs, 2000, '已燒入字幕的主片只順延 QA／字幕檔時間，不再畫第二層字幕');
  S.settle([p], first);
  assert.equal(p.episodes[0].outputs.length, 2);
  assert.equal(p.episodes[0].outputs[1].derivedFrom, '/old.mp4');
  const second = await V.bookends.join(first);
  assert.equal(second.input.settings.project.clips.filter((c) => c.bookend === 'intro').length, 1, '重接不疊第二層片頭');
  assert.equal(require('../backend/release-text.cjs').releaseText(second).subtitles[0].startMs, 2000, '第二次重接不累加舊片頭的字幕位移');
  assert.equal(jobs.filter((j) => j.input.prompt === '片頭標題卡').length, 1, '同設定只渲染一次');
  await V.bookends.render(p, p.episodes[0], 'intro', '16:9', true);
  assert.equal(jobs.filter((j) => j.input.prompt === '片頭標題卡').length, 2, '明確重新生成才新增任務');
  assert.throws(() => V.bookends.baseProject({ input: { settings: { bookends: {} } }, result: { url: '/old.mp4' } }, 5), /沒有保留/);
  // The vendor downloads and separately registers the actual main bytes; it must never alias them to the full cut's checksum.
  let n = 0, registration, adopted;
  const result = await require('../backend/quick-render.cjs').run({ id: 'quick', input: {
    link: { projectId: 'p' }, settings: { ratio: '16:9', title: '片名', scenes: [{ narration: '旁白', url: '/shot.png' }] },
  } }, { main: { organizationId: () => 'org', assetOf: () => 'asset',
    call: async (path, options = {}) => ({ ok: true, value: options.method === 'POST' ? { ok: true, jobId: 'remote' } :
      { ok: true, status: 'done', url: 'https://r2.example/full.mp4', mainUrl: 'https://r2.example/main.mp4', assetId: 'full-asset' } }),
    adopt: (...args) => { adopted = args; }, ingest: async (value) => { registration = value; } },
    mediaStore: { ingest: async () => ({ url: '/media/file-' + (++n) + '.mp4' }), fileFor: (url) => '/data' + url },
    fetchImpl: async () => new Response('video'), signal: new AbortController().signal, sizeOf: () => 10,
  });
  assert.equal(result.mainUrl, '/media/file-2.mp4');
  assert.equal(adopted[0], '/media/file-1.mp4');
  assert.equal(registration.url, result.mainUrl);
  assert.deepEqual(registration.sources, ['/media/file-1.mp4']);
  let submitted = 0;
  const saved = { ok: true, status: 'done', jobId: 'kept-remote', url: 'https://r2.example/full.mp4', assetId: 'asset' };
  await require('../backend/quick-render.cjs').run({ id: 'retry', quickRenderDone: saved, input: {
    link: { projectId: 'p' }, settings: { ratio: '16:9', title: '片名', scenes: [{ narration: '旁白', url: '/shot.png' }] },
  } }, { main: { organizationId: () => 'org', assetOf: () => 'asset', call: async () => { submitted++; throw Error('不得重新送出配音'); }, adopt() {} },
    mediaStore: { ingest: async () => ({ url: '/kept.mp4' }) }, fetchImpl: async () => new Response('video'),
    signal: new AbortController().signal, sizeOf: () => 10 });
  assert.equal(submitted, 0, '下載／保留主片失敗後重試沿用原成片，不重付配音費');
  console.log('PASS U5.5: join old cut, preserve version and voice, reuse title, explicit regeneration, no duplicated intro');
})().catch((error) => { console.error(error); process.exitCode = 1; });
