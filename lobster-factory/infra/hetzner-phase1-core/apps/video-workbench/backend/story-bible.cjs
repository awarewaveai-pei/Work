// Card U9 (docs/video-unify-plan-20261116.md §4 U9, §10 X3): the projects page's 製作聖經 and the main system's Story
// Bible version chain (next-admin app/api/video/story-bibles) are one record. The browser reads and writes the chain
// itself (same origin, the user's own session and role); this server does what only it can:
//   apply      a Bible's reference pictures -> library files here (imported once from our own storage, url-import.cjs
//              under the bases next-admin answers), then the Bible onto the project's items;
//   draft      the project's items -> the next Bible document (each picture -> its main-system asset id);
//   publicUrls local pictures -> their public object urls (the 一致性比對 sends those).
// The mapping both ways is next-admin's lib/content/video/story-bible-production.ts, loaded as is (one copy).
// Invariant: a reference id is turned into a picture only when the main system answers it as THIS organization's
// asset (main-system.cjs ownAssets); an id of another organization is skipped, never fetched.
const crypto = require("node:crypto"), path = require("node:path"), { pathToFileURL } = require("node:url");

const MAX_IDS = 50;
const fail = (message, status = 400) => Object.assign(Error(message), { status });
const isObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);

// main = backend/main-system.cjs (null = local mode); store(bytes, ext) -> a new local url; exists(url) -> boolean.
function createStoryBible({ main, appDir, urlImport, store, exists }) {
  let mapping = null;
  const load = () => (mapping ||= import(pathToFileURL(path.join(appDir, "lib/content/video/story-bible-production.ts")).href));
  const need = () => {
    if (!main) throw fail("製作聖經的版本要連上主系統才能用", 501);
  };

  // The local url of one of this organization's assets: one already here, else imported from our storage once.
  async function localOf(row, bases) {
    const have = main.localsOf(row.assetId).find(exists);
    if (have) return have;
    const got = await urlImport.fetchMedia(row.objectUrl, { kinds: ["image"], bases });
    const url = store(got.bytes, got.ext);
    main.adopt(url, { assetId: row.assetId, checksumSha256: row.checksumSha256, objectUrl: row.objectUrl, rightsSources: [{ kind: "unknown", url: row.objectUrl }] });
    return url;
  }

  async function apply({ document, production }) {
    need();
    if (!isObject(document) || !isObject(production)) throw fail("缺少製作聖經或核准版本");
    const { BIBLE_GROUPS, productionFromStoryBible } = await load();
    const ids = [...new Set(BIBLE_GROUPS.flatMap(([group]) => (Array.isArray(document[group]) ? document[group] : [])
      .flatMap((e) => (Array.isArray(e?.referenceAssetIds) ? e.referenceAssetIds : [])).filter((id) => typeof id === "string")))];
    if (ids.length > MAX_IDS) throw fail("核准版本的參考圖太多（上限 " + MAX_IDS + " 張）");
    const urls = new Map();
    if (ids.length) {
      const [rows, bases] = await Promise.all([main.ownAssets({ assetIds: ids }), main.storageBases()]);
      for (const row of rows) if (ids.includes(row.assetId)) urls.set(row.assetId, await localOf(row, bases));
    }
    return { production: productionFromStoryBible(document, production, (id) => urls.get(id), () => crypto.randomUUID()), skipped: ids.filter((id) => !urls.has(id)).length };
  }

  // One url -> its main-system { assetId, objectUrl }: a registered local file, or one of our storage's own objects.
  async function resolve(urls) {
    const out = new Map(), remote = [];
    const bases = urls.some((u) => !main.entryOf(u)) ? await main.storageBases() : [];
    for (const url of urls) {
      const entry = main.entryOf(url);
      if (entry?.assetId) out.set(url, { assetId: entry.assetId, objectUrl: entry.objectUrl });
      else if (bases.some((b) => urlImport.underBase(url, b))) remote.push(url);
    }
    for (let i = 0; i < remote.length; i += MAX_IDS)
      for (const row of await main.ownAssets({ objectUrls: remote.slice(i, i + MAX_IDS) })) out.set(row.objectUrl, row);
    return out;
  }
  const strings = (v, max) => {
    const list = (Array.isArray(v) ? v : []).filter((u) => typeof u === "string");
    if (list.length > max) throw fail("圖片太多（上限 " + max + " 張）");
    return [...new Set(list)];
  };

  async function draft({ base, production, seriesId, title }) {
    need();
    if (!isObject(production) || (base != null && !isObject(base)) || typeof seriesId !== "string" || !seriesId) throw fail("缺少製作聖經或系列");
    const { BIBLE_GROUPS, storyBibleFromProduction } = await load();
    const urls = strings(BIBLE_GROUPS.flatMap(([, kind]) => (Array.isArray(production[kind]) ? production[kind] : []).flatMap((i) => (Array.isArray(i?.refs) ? i.refs : []))), 400);
    const found = await resolve(urls);
    return storyBibleFromProduction(base ?? null, production, { organizationId: main.organizationId(), seriesId, title: String(title ?? ""), assetIdOf: (u) => found.get(u)?.assetId });
  }

  async function publicUrls({ urls }) {
    need();
    const list = strings(urls, 60), found = await resolve(list);
    return { urls: Object.fromEntries(list.map((u) => [u, found.get(u)?.objectUrl ?? null])) };
  }

  return { apply, draft, publicUrls };
}

module.exports = { createStoryBible };
