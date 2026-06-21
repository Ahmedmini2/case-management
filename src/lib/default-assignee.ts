import { supabaseAdmin } from "@/lib/supabase/admin";

// The user flagged as "default case receiver" (set from Settings → Users) gets
// every new case that comes in without an explicit assignee. Returns null when
// no default is configured, so callers fall back to leaving the case unassigned.
export async function getDefaultAssigneeId(): Promise<string | null> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("users")
    .select("id")
    .eq("isDefaultCaseReceiver", true)
    .eq("isActive", true)
    .limit(1)
    .maybeSingle();
  return data ? (data as { id: string }).id : null;
}
