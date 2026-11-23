import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PRODUCTS } from "../products";
import { APP_DIR } from "./app-pages";

// A door page's name is one word in three places: the door menu (door.nav[].name), the page's <title> (metadata) and its
// first <h1> (blueprint §15A). This reads the registry, so a new door page or a renamed menu item is checked without edit.
const ROOT = path.join(APP_DIR, "..");

function pageFiles(dir: string, url: string, out: Map<string, string>): Map<string, string> {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory() && !e.name.startsWith("_")) pageFiles(path.join(dir, e.name), e.name.startsWith("(") ? url : `${url}/${e.name}`, out);
    else if (e.name === "page.tsx") out.set(url || "/", path.join(dir, e.name));
  }
  return out;
}

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? path.join(ROOT, spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
  if (!base) return null;
  return [`${base}.tsx`, `${base}.ts`, path.join(base, "index.tsx")].find((c) => existsSync(c) && readFileSync(c, "utf8") !== null) ?? null;
}

// The first <h1> in document order: the page file, then what it imports (4 levels). Text with a {expression} is dynamic.
function firstH1(file: string, seen = new Set<string>(), depth = 0): { file: string; text: string } | null {
  if (seen.has(file) || depth > 4) return null;
  seen.add(file);
  const src = readFileSync(file, "utf8");
  const m = /<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(src);
  if (m) return { file, text: m[1].replace(/\s+/g, " ").trim() };
  for (const im of src.matchAll(/from\s+["']([^"']+)["']/g)) {
    const next = resolveImport(file, im[1]);
    const hit = next && firstH1(next, seen, depth + 1);
    if (hit) return hit;
  }
  return null;
}

const rel = (f: string) => path.relative(path.join(ROOT, "../.."), f).split(path.sep).join("/");
const lineOf = (file: string, needle: string | RegExp) => {
  const i = readFileSync(file, "utf8").split("\n").findIndex((l) => (typeof needle === "string" ? l.includes(needle) : needle.test(l)));
  return i < 0 ? 1 : i + 1;
};

interface Item { key: string; name: string; file: string }
const items: Item[] = PRODUCTS.flatMap((p) => {
  const door = p.door;
  if (door.app !== "next-admin" || !door.nav) return [];
  const files = pageFiles(path.join(APP_DIR, door.page.slice(1)), door.page, new Map());
  return door.nav.flatMap((n) => {
    const file = files.get(n.path ? `${door.page}/${n.path}` : door.page);
    return file ? [{ key: `${door.page}${n.path ? `/${n.path}` : ""}`, name: n.name, file }] : [];
  });
});

// Why a page does not match yet, or null when it does. A page that only redirects draws nothing, so only its <title> counts.
function mismatch({ name, file }: Item): string | null {
  const src = readFileSync(file, "utf8");
  const bad: string[] = [];
  const title = /metadata\s*=\s*\{\s*title:\s*["']([^"']+)["']/.exec(src)?.[1];
  if (!title?.includes(name)) bad.push(`title ${title ? `"${title}"` : "(none)"} lacks "${name}" (${rel(file)}:${lineOf(file, /metadata/)})`);
  if (!/\bredirect\(/.test(src)) {
    const h1 = firstH1(file);
    if (!h1) bad.push(`no <h1> (${rel(file)}:1)`);
    else if (!h1.text.includes(name)) bad.push(`first <h1> "${h1.text.slice(0, 40)}" lacks "${name}" (${rel(h1.file)}:${lineOf(h1.file, "<h1")})`);
  }
  return bad.length ? bad.join("; ") : null;
}

// Door pages still to be renamed. A to-do, not an exemption: `owner` is the card that fixes the page, and the test fails
// the day the page already matches so the row gets deleted. Every row is a content page (products.ts and the content
// pages belong to card U11, which re-lays out the content door); nothing outside this list may mismatch.
const TODO: Record<string, { owner: string; until: string }> = {
  "/content": { owner: "U11", until: "第 8 批" },
  "/content/topics": { owner: "U11", until: "第 8 批" },
  "/content/topics/steps": { owner: "U11", until: "第 8 批" },
  "/content/sites": { owner: "U11", until: "第 8 批" },
  "/content/events": { owner: "U11", until: "第 8 批" },
};

describe("door page names (menu = <title> = first <h1>)", () => {
  it("reads every door.nav item that has a page file", () => {
    expect(items.length).toBeGreaterThan(20);
  });

  it("no page outside the to-do list mismatches its menu name", () => {
    const bad = items.filter((i) => !TODO[i.key]).flatMap((i) => { const m = mismatch(i); return m ? [`${i.key} (menu "${i.name}"): ${m}`] : []; });
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("every to-do row names a real menu item, an owner card and a deadline, and still mismatches", () => {
    const byKey = new Map(items.map((i) => [i.key, i]));
    const bad = Object.entries(TODO).flatMap(([key, t]) => {
      const item = byKey.get(key);
      if (!item) return [`${key}: not a door.nav page any more -- delete the row`];
      if (!/^[A-Z]\d+$/.test(t.owner) || !t.until) return [`${key}: needs an owner card (e.g. U11) and a deadline`];
      return mismatch(item) ? [] : [`${key}: already matches "${item.name}" -- delete the row`];
    });
    expect(bad, bad.join("\n")).toEqual([]);
  });
});
