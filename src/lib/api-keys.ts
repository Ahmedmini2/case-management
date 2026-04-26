import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type ApiKeyScope = "read-only" | "write" | "admin";

export function generateApiKey() {
  return `cms_live_${nanoid(32)}`;
}

export async function hashApiKey(rawKey: string) {
  return bcrypt.hash(rawKey, 12);
}

export function getApiKeyPrefix(rawKey: string) {
  return rawKey.slice(0, 8);
}

export async function verifyApiKey(rawKey: string) {
  if (!rawKey.startsWith("cms_live_")) {
    console.log("[verifyApiKey] reject: missing cms_live_ prefix; got first 9 chars:", rawKey.slice(0, 9));
    return null;
  }

  const prefix = getApiKeyPrefix(rawKey);
  const sb = supabaseAdmin();
  const nowIso = new Date().toISOString();
  const { data: candidatesRaw, error } = await sb
    .from("api_keys")
    .select("id, keyHash, name, expiresAt, isActive")
    .eq("prefix", prefix);

  if (error) {
    console.error("[verifyApiKey] lookup failed:", error.message);
    return null;
  }

  const allCandidates = (candidatesRaw ?? []) as {
    id: string;
    keyHash: string;
    name: string;
    expiresAt: string | null;
    isActive: boolean | null;
  }[];

  console.log(
    `[verifyApiKey] prefix=${prefix} found ${allCandidates.length} rows; isActive=${JSON.stringify(allCandidates.map((c) => c.isActive))}`,
  );

  // Filter active + not expired
  const candidates = allCandidates.filter(
    (c) => c.isActive === true && (!c.expiresAt || new Date(c.expiresAt) > new Date(nowIso)),
  );

  if (candidates.length === 0) {
    console.log("[verifyApiKey] no active/non-expired candidates; raw count:", allCandidates.length);
    return null;
  }

  for (const key of candidates) {
    const ok = await bcrypt.compare(rawKey, key.keyHash);
    if (ok) {
      await sb
        .from("api_keys")
        .update({ lastUsedAt: nowIso })
        .eq("id", key.id);
      console.log("[verifyApiKey] match for key id:", key.id);
      return { id: key.id, keyHash: key.keyHash, name: key.name };
    }
  }

  console.log("[verifyApiKey] no bcrypt match across", candidates.length, "candidates");
  return null;
}
