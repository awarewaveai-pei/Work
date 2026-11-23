import { VectorProFrame } from "./VectorProFrame";
import { SR_ONLY } from "@/lib/portal/sr-only";

export const metadata = { title: "向量（專業版）" };

// /tools/vector-pro: VectorCraft's web build, full window (agency-os/handoffs/2026-11-04-vectorcraft-pro/R0-PLAN.md C3).
export default function VectorProPage() {
  return <><h1 style={SR_ONLY}>向量（專業版）</h1><VectorProFrame /></>;
}
