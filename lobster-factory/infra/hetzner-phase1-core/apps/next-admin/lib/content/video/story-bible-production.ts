// Card U9 (video-unify-plan-20261116 §4 U9, D12): the workbench's 製作聖經 (a project's assets: character / scene /
// prop) and a Story Bible v1 document (story-bible.ts) are two editors of one version chain. These two pure functions
// map between them. Invariant: a field one side does not know stays as it was on the side that has it -- the Bible's
// rightsNote, continuity, episode, provenance and the entries the workbench has no item for; the workbench item's id,
// descr, time, locked and anything else. Items pair by the item's `key` = the Bible entry's id.
// No imports: the video workbench's backend loads this file as is (Node type stripping), so erasable TypeScript only.

export type ProductionKind = "character" | "scene" | "prop";
export interface ProductionItem { id?: string; key?: string; name?: string; role?: string; refs?: string[]; [field: string]: unknown }
export type Production = Partial<Record<ProductionKind, ProductionItem[]>> & Record<string, unknown>;
interface BibleEntry { id: string; name: string; role?: string; referenceAssetIds: string[]; [field: string]: unknown }
export type StoryBibleDocument = Record<string, unknown>;

export const BIBLE_GROUPS: ReadonlyArray<readonly ["characters" | "locations" | "props", ProductionKind]> = [["characters", "character"], ["locations", "scene"], ["props", "prop"]];
const ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
/** The workbench keeps at most this many reference pictures per item (scripts/projects-0.js asset dialog). */
export const MAX_REFS = 8;

const entriesOf = (doc: StoryBibleDocument | null | undefined, group: string): BibleEntry[] =>
  Array.isArray(doc?.[group]) ? (doc![group] as BibleEntry[]).filter((e) => e && typeof e === "object" && typeof e.id === "string") : [];
const itemsOf = (production: Production | null | undefined, kind: ProductionKind): ProductionItem[] =>
  Array.isArray(production?.[kind]) ? (production![kind] as ProductionItem[]).filter((i) => i && typeof i === "object") : [];
const unique = (xs: string[]) => [...new Set(xs)];

/** 套用核准版本: the Bible's entries onto the workbench items. A paired item takes the entry's name, role and pictures
 *  (urlOf = a Bible reference id -> the workbench url it was imported to; one without a url is left out); an entry
 *  with no item becomes a new one (newId). Items the Bible does not have stay untouched. */
export function productionFromStoryBible(doc: StoryBibleDocument, production: Production,
  urlOf: (assetId: string) => string | undefined, newId: () => string): Production {
  const out: Production = { ...production };
  for (const [group, kind] of BIBLE_GROUPS) {
    const items = itemsOf(production, kind).map((i) => ({ ...i }));
    for (const entry of entriesOf(doc, group)) {
      const refs = (Array.isArray(entry.referenceAssetIds) ? entry.referenceAssetIds : []).map(urlOf).filter((u): u is string => !!u);
      const item = items.find((i) => i.key === entry.id);
      const role = typeof entry.role === "string" ? { role: entry.role } : {};
      if (item) Object.assign(item, { name: entry.name, ...role, refs: unique([...refs, ...(Array.isArray(item.refs) ? item.refs : [])]).slice(0, MAX_REFS) });
      else items.push({ id: newId(), key: entry.id, name: entry.name, ...role, descr: "", refs: unique(refs).slice(0, MAX_REFS) });
    }
    out[kind] = items;
  }
  return out;
}

/** A new series' required parts the workbench has no editor for, filled from the project's title. */
function skeleton(organizationId: string, seriesId: string, title: string): StoryBibleDocument {
  const t = title.trim() || "未命名影片";
  return { schemaVersion: "1.0.0", organizationId, seriesId, revision: 1, state: "draft", characters: [], locations: [], props: [],
    continuity: { currentState: [], prohibitions: [], openThreads: [] },
    episode: { episodeId: "ep_1", premise: t, hook: t, beats: [t], stateDelta: {} },
    provenance: { capabilityVersion: "1.0.0", sourceArtifactIds: [] } };
}

/** 存成核准版本: the workbench items onto the Bible (base = the series' latest revision, null = a new series). A paired
 *  entry takes the item's name, role (when the item has one) and pictures (assetIdOf = a workbench url -> its main-system
 *  asset id); an item without a pairing becomes a new entry, its id = its key when that is free and valid, else
 *  `<kind>_<n>`. keys = item id -> the entry id it now pairs with (the caller stores it as the item's key); missing =
 *  the urls with no asset id (the caller refuses to save rather than drop a picture). */
export function storyBibleFromProduction(base: StoryBibleDocument | null, production: Production,
  { organizationId, seriesId, title, assetIdOf }: { organizationId: string; seriesId: string; title: string; assetIdOf: (url: string) => string | undefined }):
  { document: StoryBibleDocument; keys: Record<string, string>; missing: string[] } {
  const document: StoryBibleDocument = base ? { ...base, organizationId, seriesId, state: "draft" } : skeleton(organizationId, seriesId, title);
  const keys: Record<string, string> = {}, missing: string[] = [];
  for (const [group, kind] of BIBLE_GROUPS) {
    const entries = entriesOf(base, group).map((e) => ({ ...e }));
    const used = new Set(entries.map((e) => e.id));
    for (const item of itemsOf(production, kind)) {
      const name = typeof item.name === "string" ? item.name.trim() : "";
      if (!name) continue;
      const referenceAssetIds: string[] = [];
      for (const url of Array.isArray(item.refs) ? item.refs : []) {
        const id = typeof url === "string" ? assetIdOf(url) : undefined;
        if (id) referenceAssetIds.push(id);
        else missing.push(String(url));
      }
      const role = typeof item.role === "string" ? { role: item.role } : {};
      let entry = typeof item.key === "string" ? entries.find((e) => e.id === item.key) : undefined;
      if (entry) Object.assign(entry, { name, ...role, referenceAssetIds: unique(referenceAssetIds) });
      else {
        let id = typeof item.key === "string" && ID.test(item.key) && !used.has(item.key) ? item.key : "";
        for (let n = entries.length + 1; !id; n++) if (!used.has(`${kind}_${n}`)) id = `${kind}_${n}`;
        used.add(id);
        entry = { id, name, role: "", ...role, referenceAssetIds: unique(referenceAssetIds) };
        entries.push(entry);
      }
      if (typeof item.id === "string") keys[item.id] = entry.id;
    }
    document[group] = entries;
  }
  return { document, keys, missing };
}
