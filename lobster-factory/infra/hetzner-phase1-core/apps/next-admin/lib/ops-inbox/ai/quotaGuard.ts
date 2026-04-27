import { getSupabaseWriteClient } from "@/lib/supabase-server";

export async function checkAndConsumeGeminiQuota(maxPerDay: number): Promise<{ allowed: boolean; currentCount: number }> {
  const supabase = getSupabaseWriteClient();
  if (!supabase) return { allowed: false, currentCount: 0 };

  const { data, error } = await supabase.rpc("ops_inbox_gemini_quota_increment", { p_max: maxPerDay });
  if (error) return { allowed: false, currentCount: 0 };

  const row = Array.isArray(data) ? data[0] : data;
  return {
    allowed: Boolean(row?.allowed),
    currentCount: Number(row?.current_count ?? 0),
  };
}
