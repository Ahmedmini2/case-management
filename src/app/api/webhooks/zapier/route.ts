import crypto from "node:crypto";
import { ActivityType, CaseSource, CaseStatus, Priority } from "@/types/enums";
import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { verifyApiKey } from "@/lib/api-keys";
import { writeAudit } from "@/lib/audit";
import { generateCaseNumber } from "@/lib/case-number";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getDefaultAssigneeId } from "@/lib/default-assignee";

const zapierSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().optional(),
  priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).optional(),
  type: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactName: z.string().optional(),
  assigneeEmail: z.string().email().optional(),
  customFields: z.record(z.unknown()).optional(),
  externalId: z.string().optional(),
  tags: z.array(z.string().min(1)).optional(),
  source: z.string().optional(),
});

function verifySecret(rawBody: string, provided: string | null) {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return true;
  if (!provided) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

async function verifyRequest(request: Request, rawBody: string) {
  const webhookSig = request.headers.get("x-webhook-secret");
  if (verifySecret(rawBody, webhookSig)) return true;

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice("Bearer ".length).trim();
  const key = await verifyApiKey(token);
  return Boolean(key);
}

export async function POST(request: Request) {
  const raw = await request.text();
  const authorized = await verifyRequest(request, raw);
  if (!authorized) return NextResponse.json(fail("Unauthorized webhook"), { status: 401 });

  const parsed = zapierSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) return NextResponse.json(fail("Invalid payload"), { status: 400 });

  const data = parsed.data;
  const sb = supabaseAdmin();

  // Resolve assignee + default pipeline
  const [assigneeRes, defaultPipelineRes] = await Promise.all([
    data.assigneeEmail
      ? sb.from("users").select("id").eq("email", data.assigneeEmail).maybeSingle()
      : Promise.resolve({ data: null }),
    sb.from("pipelines").select("id").eq("isDefault", true).maybeSingle(),
  ]);

  const assignee = assigneeRes.data as { id: string } | null;
  const defaultPipeline = defaultPipelineRes.data as { id: string } | null;

  let firstStageId: string | null = null;
  if (defaultPipeline) {
    const { data: stage } = await sb
      .from("pipeline_stages")
      .select("id")
      .eq("pipelineId", defaultPipeline.id)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();
    firstStageId = stage ? (stage as { id: string }).id : null;
  }

  const { data: fallbackOwnerRow } = await sb
    .from("users")
    .select("id")
    .limit(1)
    .maybeSingle();
  const fallbackOwner = fallbackOwnerRow as { id: string } | null;
  if (!fallbackOwner) {
    return NextResponse.json(fail("No users exist to own the created case"), { status: 400 });
  }

  // Upsert contact
  let contactId: string | null = null;
  if (data.contactEmail) {
    const { data: existingContact } = await sb
      .from("contacts")
      .select("id")
      .eq("email", data.contactEmail)
      .maybeSingle();
    if (existingContact) {
      contactId = (existingContact as { id: string }).id;
      await sb
        .from("contacts")
        .update({ name: data.contactName ?? data.contactEmail })
        .eq("id", contactId);
    } else {
      const { data: newContact } = await sb
        .from("contacts")
        .insert({ email: data.contactEmail, name: data.contactName ?? data.contactEmail })
        .select("id")
        .single();
      contactId = newContact ? (newContact as { id: string }).id : null;
    }
  }

  const caseNumber = await generateCaseNumber();
  const { data: createdRow, error: createErr } = await sb
    .from("cases")
    .insert({
      caseNumber,
      title: data.title,
      description: data.description,
      priority: (data.priority as Priority | undefined) ?? Priority.MEDIUM,
      status: CaseStatus.OPEN,
      source: CaseSource.ZAPIER,
      type: data.type,
      customFields: data.customFields,
      externalId: data.externalId,
      createdById: fallbackOwner.id,
      assignedToId: assignee?.id ?? (await getDefaultAssigneeId()),
      contactId,
      pipelineId: defaultPipeline?.id ?? null,
      pipelineStageId: firstStageId,
    })
    .select("id, caseNumber")
    .single();

  if (createErr || !createdRow) {
    return NextResponse.json(fail(createErr?.message ?? "Failed to create case"), { status: 500 });
  }
  const created = createdRow as { id: string; caseNumber: string };

  // Best-effort activity
  await sb.from("activities").insert({
    caseId: created.id,
    userId: fallbackOwner.id,
    type: ActivityType.CREATED,
    description: "Case created via Zapier webhook",
  });

  // Tag upsert + linking
  if (data.tags?.length) {
    for (const tagName of data.tags) {
      let tagId: string | null = null;
      const { data: existingTag } = await sb
        .from("tags")
        .select("id")
        .eq("name", tagName)
        .maybeSingle();
      if (existingTag) {
        tagId = (existingTag as { id: string }).id;
      } else {
        const { data: newTag } = await sb
          .from("tags")
          .insert({ name: tagName })
          .select("id")
          .single();
        tagId = newTag ? (newTag as { id: string }).id : null;
      }

      if (tagId) {
        await sb
          .from("case_tags")
          .upsert({ caseId: created.id, tagId }, { onConflict: "caseId,tagId" });
      }
    }
  }

  await writeAudit({
    userId: fallbackOwner.id,
    caseId: created.id,
    action: "ZAPIER_WEBHOOK_CREATED_CASE",
    resource: "case",
    resourceId: created.id,
    after: created,
    req: request,
  });

  return NextResponse.json(ok({ success: true, caseId: created.id, caseNumber: created.caseNumber }));
}
