import { PhotoProFrame } from "./PhotoProFrame";
import { SR_ONLY } from "@/lib/portal/sr-only";

export const metadata = { title: "畫布" };

// /tools/photo-pro: PhotoCraft's web build, full window (agency-os/handoffs/2026-11-05-photocraft-pro/R0-PLAN.md C3.1).
export default function PhotoProPage() {
  return <><h1 style={SR_ONLY}>畫布</h1><PhotoProFrame /></>;
}
