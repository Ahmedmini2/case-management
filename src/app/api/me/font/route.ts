import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/api";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Keep in sync with the Settings → Fonts page. A bad key is rejected.
const ALLOWED_FONTS = new Set([
  "default",
  "inter",
  "roboto",
  "open-sans",
  "nunito",
  "lato",
  "ibm-plex",
  "cairo",
  "tajawal",
  "noto-sans-arabic",
]);

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(fail("Unauthorized"), { status: 401 });

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("users")
    .select("fontPreference")
    .eq("id", session.user.id)
    .maybeSingle();

  if (error) return NextResponse.json(fail(error.message), { status: 500 });
  return NextResponse.json(ok({ font: (data?.fontPreference as string | null) ?? null }));
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(fail("Unauthorized"), { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { font?: unknown };
  const font = typeof body.font === "string" ? body.font.trim().toLowerCase() : "";

  // Empty string or "default" => clear the override (use app default).
  const next: string | null = font === "" || font === "default" ? null : font;
  if (next !== null && !ALLOWED_FONTS.has(next)) {
    return NextResponse.json(fail(`Unsupported font: ${next}`), { status: 400 });
  }

  const sb = supabaseAdmin();
  const { error } = await sb
    .from("users")
    .update({ fontPreference: next })
    .eq("id", session.user.id);

  if (error) return NextResponse.json(fail(error.message), { status: 500 });
  return NextResponse.json(ok({ font: next }));
}
