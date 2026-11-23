import { VectorProFrame } from "../../(full)/tools/vector-pro/VectorProFrame";
import { SR_ONLY } from "@/lib/portal/sr-only";

export const metadata = { title: "向量（專業版）" };

// design.<base domain>/pro: the same VectorCraft frame as /tools/vector-pro.
export default function DesignVectorProPage() {
  return <><h1 style={SR_ONLY}>向量（專業版）</h1><VectorProFrame /></>;
}
