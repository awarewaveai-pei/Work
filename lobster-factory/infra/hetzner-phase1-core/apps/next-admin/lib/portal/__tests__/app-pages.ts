// The URLs app/ answers from page.tsx files, mapped as the App Router does: a route group "(name)" adds no segment, a
// "_name" folder is never a route. The registry tests ask "is this door page built" through here, so a door whose pages
// sit in route groups (app/video/(door), app/video/(wb)) is still built and still under every door gate.
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

export const APP_DIR = path.join(__dirname, "../../../app");

export function pageUrls(dir: string, url: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? (e.name.startsWith("_") ? [] : pageUrls(path.join(dir, e.name), e.name.startsWith("(") ? url : `${url}/${e.name}`))
      : e.name === "page.tsx" ? [url || "/"] : []);
}

/** Every URL a door's own directory (app<door.page>) answers, e.g. "/video", "/video/works". */
export const doorPageUrls = (page: string): string[] => pageUrls(path.join(APP_DIR, page.slice(1)), page);
