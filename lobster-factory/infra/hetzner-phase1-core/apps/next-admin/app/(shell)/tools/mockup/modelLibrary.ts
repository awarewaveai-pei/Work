// Shared by the two halves of Mockup Studio's model flow (operator, 2026-11-02):
//   【模特兒印製】 ModelLibraryStudio -- generates 模特兒圖 (a person, pose and scene in a plain garment) into the library;
//   主頁 模特 tab  ModelMockupPanel   -- picks several 模特兒圖 + one design and composites the product mockups.
import type { PrintBox } from "@/lib/studio/fabric-print";

export interface LibraryPhoto {
  id: string;
  object_url: string | null;
  asset_domain: "mockup_model_preset" | "mockup_product_preset";
  metadata: {
    preset_name?: string | null;
    preset_settings?: Record<string, string> | null;
    model_key?: string;
    photo_role?: string;
    garment_color?: string;
    print_box?: PrintBox;
  } | null;
}

export interface Model { key: string; name: string; gender: string; photos: LibraryPhoto[] }
export type Shot = { status: "generating" } | { status: "done"; image: string } | { status: "error"; error: string };

export const COLOR_LABEL: Record<string, string> = { white: "白", grey: "灰", black: "黑" };
export const GENDER_LABEL: Record<string, string> = { woman: "女", man: "男", "androgynous person": "中性" };

/** Model photos grouped per model (metadata.model_key); a row saved before model_key existed is a one-photo model. */
export function groupModels(photos: LibraryPhoto[]): Model[] {
  const byKey = new Map<string, Model>();
  for (const p of photos) {
    if (!p.object_url || p.asset_domain !== "mockup_model_preset") continue;
    const key = p.metadata?.model_key ?? p.id;
    const m = byKey.get(key) ?? { key, name: p.metadata?.preset_name ?? "模特兒", gender: "", photos: [] };
    m.gender ||= p.metadata?.preset_settings?.mGender ?? "";
    m.photos.push(p);
    byKey.set(key, m);
  }
  return [...byKey.values()];
}

/** Runs the jobs two at a time, reporting each as it lands (same pace as Mockup Studio's Printful batch). */
export async function inPairs<T>(items: T[], run: (item: T, i: number) => Promise<void>) {
  for (let i = 0; i < items.length; i += 2) await Promise.all(items.slice(i, i + 2).map((it, j) => run(it, i + j)));
}

/** The body of a JSON API call. A gateway error page (nginx 502/504 while a deploy restarts the app, 2026-11-02) is
 *  HTML: res.json() would surface "Unexpected token '<'"; this answers { ok:false, error } in words instead. */
export async function readJson<T extends object>(res: Response): Promise<T & { ok?: boolean; error?: string; code?: string }> {
  try {
    return (await res.json()) as T & { ok?: boolean; error?: string };
  } catch {
    const busy = res.status === 502 || res.status === 503 || res.status === 504;
    return { ok: false, error: busy
      ? `伺服器暫時沒有回應（HTTP ${res.status}），可能正在部署，請稍等一分鐘再試`
      : `伺服器回傳了非預期的內容（HTTP ${res.status}）` } as T & { ok: boolean; error: string };
  }
}

/** The message a refused or failed JSON call shows: withFeature answers 403 { ok:false, code } with no text. */
export function failureText(res: Response, json: { error?: string; code?: string }): string {
  return json.error ?? (res.status === 403 ? `沒有使用權限（${json.code ?? "403"}）` : `HTTP ${res.status}`);
}
