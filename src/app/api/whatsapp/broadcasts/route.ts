import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/api";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// List all broadcasts
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(fail("Unauthorized"), { status: 401 });

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("broadcasts")
    .select("*")
    .order("createdAt", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json(fail(error.message), { status: 500 });

  type BroadcastRow = { templateId: string | null } & Record<string, unknown>;
  const broadcasts = ((data as BroadcastRow[] | null) ?? []);

  // Hydrate templates
  const templateIds = [...new Set(broadcasts.map((b) => b.templateId).filter(Boolean))] as string[];
  const templateMap = new Map<string, { id: string; name: string; status: string }>();
  if (templateIds.length > 0) {
    const { data: templates } = await sb
      .from("whatsapp_templates")
      .select("id, name, status")
      .in("id", templateIds);
    for (const t of (templates ?? []) as { id: string; name: string; status: string }[]) {
      templateMap.set(t.id, t);
    }
  }

  const enriched = broadcasts.map((b) => ({
    ...b,
    template: b.templateId ? templateMap.get(b.templateId) ?? null : null,
  }));

  return NextResponse.json(ok(enriched));
}

// Create a new broadcast (draft)
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(fail("Unauthorized"), { status: 401 });

  const body = (await request.json()) as {
    name?: string;
    templateId?: string;
    templateVars?: Record<string, string>;
    recipients?: { phone: string; contactName?: string }[];
    scheduledAt?: string | null;
  };

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const templateId = typeof body.templateId === "string" ? body.templateId : null;
  const templateVars = body.templateVars && typeof body.templateVars === "object" ? body.templateVars : null;
  const recipients = Array.isArray(body.recipients) ? body.recipients : [];

  // Optional schedule: must be in the future. Empty/missing = send via the existing manual flow.
  let scheduledAtIso: string | null = null;
  if (typeof body.scheduledAt === "string" && body.scheduledAt.trim()) {
    const when = new Date(body.scheduledAt);
    if (Number.isNaN(when.getTime())) {
      return NextResponse.json(fail("scheduledAt is not a valid date/time"), { status: 400 });
    }
    if (when.getTime() <= Date.now() + 30_000) {
      return NextResponse.json(fail("scheduledAt must be at least 30 seconds in the future"), { status: 400 });
    }
    scheduledAtIso = when.toISOString();
  }

  if (!name) return NextResponse.json(fail("Broadcast name is required"), { status: 400 });
  if (!templateId) return NextResponse.json(fail("Please select a message template"), { status: 400 });
  if (recipients.length === 0) return NextResponse.json(fail("At least one recipient is required"), { status: 400 });

  const sb = supabaseAdmin();

  // Verify template
  const { data: template, error: tErr } = await sb
    .from("whatsapp_templates")
    .select("id, name, status, body")
    .eq("id", templateId)
    .maybeSingle();

  if (tErr) return NextResponse.json(fail(tErr.message), { status: 500 });
  if (!template) return NextResponse.json(fail("Template not found"), { status: 404 });
  const t = template as { id: string; name: string; status: string; body: string };
  if (t.status !== "APPROVED") {
    return NextResponse.json(fail(`Template "${t.name}" is not approved yet (status: ${t.status}). Only approved templates can be used for broadcasts.`), { status: 400 });
  }

  // Build the preview message from template
  let previewMessage = t.body;
  if (templateVars) {
    for (const [key, value] of Object.entries(templateVars)) {
      previewMessage = previewMessage.replace(`{{${key}}}`, value);
    }
  }

  // Normalize and dedupe phone numbers
  const seen = new Set<string>();
  const unique = recipients
    .map((r) => ({
      phone: (typeof r.phone === "string" ? r.phone : "").replace(/[^+\d]/g, ""),
      contactName: typeof r.contactName === "string" ? r.contactName.trim() : null,
    }))
    .filter((r) => {
      if (r.phone.length < 7) return false;
      if (!r.phone.startsWith("+")) r.phone = `+${r.phone}`;
      if (seen.has(r.phone)) return false;
      seen.add(r.phone);
      return true;
    });

  if (unique.length === 0) return NextResponse.json(fail("No valid phone numbers found"), { status: 400 });

  const { data: broadcast, error: bErr } = await sb
    .from("broadcasts")
    .insert({
      name,
      message: previewMessage,
      templateId,
      templateVars: templateVars ?? null,
      status: scheduledAtIso ? "SCHEDULED" : "DRAFT",
      scheduledAt: scheduledAtIso,
      totalCount: unique.length,
      createdById: session.user.id,
    })
    .select("id, name, status, totalCount, scheduledAt, createdAt")
    .single();

  if (bErr || !broadcast) return NextResponse.json(fail(bErr?.message ?? "Failed to create broadcast"), { status: 500 });

  const broadcastId = (broadcast as { id: string }).id;

  // Insert recipients in batches. A single insert of thousands of rows can hit
  // the request-body limit and silently truncate — which would leave a broadcast
  // claiming 4,000 recipients but only a handful of rows to actually send.
  const RECIPIENT_BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < unique.length; i += RECIPIENT_BATCH) {
    const slice = unique.slice(i, i + RECIPIENT_BATCH);
    const { data: rows, error: rErr } = await sb
      .from("broadcast_recipients")
      .insert(
        slice.map((r) => ({
          broadcastId,
          phone: r.phone,
          contactName: r.contactName,
        })),
      )
      .select("id");

    if (rErr) {
      // Best-effort cleanup so we never leave a partially-populated broadcast.
      await sb.from("broadcast_recipients").delete().eq("broadcastId", broadcastId);
      await sb.from("broadcasts").delete().eq("id", broadcastId);
      return NextResponse.json(fail(rErr.message), { status: 500 });
    }
    inserted += (rows as { id: string }[] | null)?.length ?? 0;
  }

  // Reconcile totalCount with what actually landed, so progress math is honest.
  if (inserted !== unique.length) {
    await sb.from("broadcasts").update({ totalCount: inserted }).eq("id", broadcastId);
  }
  if (inserted === 0) {
    await sb.from("broadcasts").delete().eq("id", broadcastId);
    return NextResponse.json(fail("Failed to save any recipients"), { status: 500 });
  }

  return NextResponse.json(ok({ ...(broadcast as Record<string, unknown>), totalCount: inserted }), { status: 201 });
}
