import { headers } from "next/headers";
import { productHost } from "@/lib/portal/hosts";
import { PRODUCTS } from "@/lib/portal/products";
import { doorAccess } from "@/lib/portal/door-access";
import ScriptForgeWorkbench from "./ScriptForgeWorkbench";

export const metadata = { title: "腳本" };

// video.<base domain>/script-forge: the video workbench's 腳本 (video-unify-plan-20261116 §4 U3, D7). ?project=&episode=
// = opened from that episode's step 2: the script is written back to it. 送社群 shows only to a caller who may open the
// social door (D15: social is optional for video), and links there.
export default async function VideoScriptForgePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : null);
  const project = one(params.project), episode = one(params.episode);
  // A closed door (enabled: false) has no live host to link to.
  const social = PRODUCTS.find((p) => p.key === "social" && p.door.app === "next-admin" && p.door.enabled !== false);
  const socialHref = social && (await doorAccess(await headers(), social.key)) === "open" ? `https://${productHost(social)}` : null;
  return <ScriptForgeWorkbench episode={project && episode ? { projectId: project, episodeId: episode } : null} socialHref={socialHref} />;
}
