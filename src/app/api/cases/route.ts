import { CaseSource, CaseStatus, Priority } from "@/types/enums";
import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { verifyApiKey } from "@/lib/api-keys";
import { runAutomationEngine } from "@/lib/automations/engine";
import { auth } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { generateCaseNumber } from "@/lib/case-number";
import { enqueueEmailJob } from "@/lib/queue/jobs";
import { triggerPusherEvent } from "@/lib/pusher";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { calculateSlaDueDate, enqueueSlaWarning } from "@/lib/sla";

// Resolve identity from either a NextAuth session (browser) or an API key Bearer token (n8n/Zapier).
// Returns the userId to record on the case, plus an optional email for outbound notification.
async function resolveCaller(request: Request): Promise<
  { userId: string; email: string | null } | null
> {
  const session = await auth();
  if (session?.user?.id) {
    return { userId: session.user.id, email: session.user.email ?? null };
  }
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  const key = await verifyApiKey(token);
  if (!key) return null;

  // Cases need a `createdById` (NOT NULL FK to users). For API-key-authored cases pick a system
  // owner: prefer SUPER_ADMIN → ADMIN → MANAGER → any active user.
  const sb = supabaseAdmin();
  for (const role of ["SUPER_ADMIN", "ADMIN", "MANAGER"]) {
    const { data } = await sb
      .from("users")
      .select("id, email")
      .eq("role", role)
      .eq("isActive", true)
      .order("createdAt", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data) {
      const o = data as { id: string; email: string };
      return { userId: o.id, email: o.email };
    }
  }
  // Fallback: any active user
  const { data: anyUser } = await sb
    .from("users")
    .select("id, email")
    .eq("isActive", true)
    .order("createdAt", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!anyUser) {
    console.error("[resolveCaller] no users in DB to attribute API-key case to");
    return null;
  }
  const u = anyUser as { id: string; email: string };
  return { userId: u.id, email: u.email };
}

const createCaseSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(5000).optional(),
  priority: z.nativeEnum(Priority).default(Priority.MEDIUM),
  status: z.nativeEnum(CaseStatus).default(CaseStatus.OPEN),
  type: z.string().max(100).optional(),
  assignedToId: z.string().optional(),
  teamId: z.string().optional(),
  contactId: z.string().optional(),
  pipelineId: z.string().optional(),
  pipelineStageId: z.string().optional(),
  source: z.nativeEnum(CaseSource).default(CaseSource.MANUAL),
  // Contact details — pass these to create or update the case's contact in one shot.
  // If contactId is also provided, that takes precedence and these are ignored.
  contactName: z.string().min(1).max(120).optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().max(40).optional(),
  contactCompany: z.string().max(120).optional(),
});

// Resolve or create a contact from inline name/email/phone/company. Returns the contactId.
async function upsertContact(input: {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
}): Promise<string | null> {
  const { name, email, phone, company } = input;
  if (!name && !email && !phone) return null;

  const sb = supabaseAdmin();

  // Prefer email match (it's unique); fall back to phone match.
  if (email) {
    const { data: existing } = await sb
      .from("contacts")
      .select("id, name, phone, company")
      .eq("email", email)
      .maybeSingle();
    if (existing) {
      const ex = existing as { id: string; name: string | null; phone: string | null; company: string | null };
      const patch: Record<string, unknown> = {};
      if (name && name !== ex.name) patch.name = name;
      if (phone && phone !== ex.phone) patch.phone = phone;
      if (company && company !== ex.company) patch.company = company;
      if (Object.keys(patch).length > 0) {
        await sb.from("contacts").update(patch).eq("id", ex.id);
      }
      return ex.id;
    }
  }

  if (phone) {
    const { data: existingByPhone } = await sb
      .from("contacts")
      .select("id, name, email, company")
      .eq("phone", phone)
      .limit(1)
      .maybeSingle();
    if (existingByPhone) {
      const ex = existingByPhone as { id: string; name: string | null; email: string | null; company: string | null };
      const patch: Record<string, unknown> = {};
      if (name && name !== ex.name) patch.name = name;
      if (email && email !== ex.email) patch.email = email;
      if (company && company !== ex.company) patch.company = company;
      if (Object.keys(patch).length > 0) {
        await sb.from("contacts").update(patch).eq("id", ex.id);
      }
      return ex.id;
    }
  }

  // Create new contact. Name is required by the schema, so derive one from whatever we have.
  const derivedName = name ?? email ?? phone ?? "Unknown";
  const { data: created, error } = await sb
    .from("contacts")
    .insert({
      name: derivedName,
      email: email ?? null,
      phone: phone ?? null,
      company: company ?? null,
    })
    .select("id")
    .single();
  if (error || !created) {
    console.error("[upsertContact] failed:", error?.message);
    return null;
  }
  return (created as { id: string }).id;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(fail("Unauthorized"), { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const take = Math.min(Number(searchParams.get("take") ?? "20"), 50);
  const cursor = searchParams.get("cursor");
  const q = searchParams.get("q");
  const status = searchParams.get("status");
  const priority = searchParams.get("priority");

  const sb = supabaseAdmin();

  // Build the cases query
  let query = sb
    .from("cases")
    .select("id, caseNumber, title, status, priority, source, createdAt, dueDate, assignedToId", {
      count: "exact",
    })
    .order("createdAt", { ascending: false })
    .limit(take + 1);

  if (q) {
    query = query.or(`title.ilike.%${q}%,caseNumber.ilike.%${q}%`);
  }
  if (status) query = query.eq("status", status);
  if (priority) query = query.eq("priority", priority);

  // Cursor-based pagination: fetch the cursor row's createdAt then filter
  if (cursor) {
    const { data: cursorRow } = await sb
      .from("cases")
      .select("createdAt")
      .eq("id", cursor)
      .maybeSingle();
    if (cursorRow) {
      const ts = (cursorRow as { createdAt: string }).createdAt;
      query = query.lt("createdAt", ts);
    }
  }

  const { data: rows, error, count } = await query;
  if (error) return NextResponse.json(fail(error.message), { status: 500 });

  type Row = {
    id: string;
    caseNumber: string;
    title: string;
    status: string;
    priority: string;
    source: string;
    createdAt: string;
    dueDate: string | null;
    assignedToId: string | null;
  };
  const items = (rows ?? []) as Row[];
  const hasMore = items.length > take;
  const sliced = hasMore ? items.slice(0, take) : items;
  const nextCursor = hasMore ? sliced[sliced.length - 1]?.id ?? null : null;

  // Hydrate assignees
  const assigneeIds = [...new Set(sliced.map((c) => c.assignedToId).filter(Boolean))] as string[];
  const assigneeMap = new Map<string, { id: string; name: string | null; email: string }>();
  if (assigneeIds.length > 0) {
    const { data: users } = await sb
      .from("users")
      .select("id, name, email")
      .in("id", assigneeIds);
    for (const u of (users ?? []) as { id: string; name: string | null; email: string }[]) {
      assigneeMap.set(u.id, u);
    }
  }

  // Hydrate tags via case_tags + tags
  const caseIds = sliced.map((c) => c.id);
  const tagsByCaseId = new Map<string, { id: string; name: string; color: string }[]>();
  if (caseIds.length > 0) {
    const { data: caseTags } = await sb
      .from("case_tags")
      .select("caseId, tagId")
      .in("caseId", caseIds);
    const tagIds = [
      ...new Set(((caseTags ?? []) as { caseId: string; tagId: string }[]).map((t) => t.tagId)),
    ];
    const tagMap = new Map<string, { id: string; name: string; color: string }>();
    if (tagIds.length > 0) {
      const { data: tagsData } = await sb
        .from("tags")
        .select("id, name, color")
        .in("id", tagIds);
      for (const t of (tagsData ?? []) as { id: string; name: string; color: string }[]) {
        tagMap.set(t.id, t);
      }
    }
    for (const ct of (caseTags ?? []) as { caseId: string; tagId: string }[]) {
      const tag = tagMap.get(ct.tagId);
      if (!tag) continue;
      const list = tagsByCaseId.get(ct.caseId) ?? [];
      list.push(tag);
      tagsByCaseId.set(ct.caseId, list);
    }
  }

  const data = sliced.map((c) => ({
    id: c.id,
    caseNumber: c.caseNumber,
    title: c.title,
    status: c.status,
    priority: c.priority,
    source: c.source,
    createdAt: c.createdAt,
    dueDate: c.dueDate,
    assignedTo: c.assignedToId ? assigneeMap.get(c.assignedToId) ?? null : null,
    tags: (tagsByCaseId.get(c.id) ?? []).map((t) => ({ tag: t })),
  }));

  return NextResponse.json(
    ok(data, {
      total: count ?? data.length,
      take,
      hasMore,
      nextCursor,
    }),
  );
}

export async function POST(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller) {
    return NextResponse.json(fail("Unauthorized"), { status: 401 });
  }

  try {
    const json = await request.json();
    const parsed = createCaseSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(fail("Invalid request body"), { status: 400 });
    }

    const sb = supabaseAdmin();

    // Resolve pipeline + first stage
    let pipelineId: string | null = parsed.data.pipelineId ?? null;
    let stageId: string | null = parsed.data.pipelineStageId ?? null;

    if (!stageId) {
      if (pipelineId) {
        // Just verify pipeline exists; no auto-stage selection
        const { data: pipe } = await sb
          .from("pipelines")
          .select("id")
          .eq("id", pipelineId)
          .maybeSingle();
        if (!pipe) pipelineId = null;
      } else {
        const { data: defaultPipe } = await sb
          .from("pipelines")
          .select("id")
          .eq("isDefault", true)
          .maybeSingle();
        if (defaultPipe) {
          pipelineId = (defaultPipe as { id: string }).id;
          const { data: firstStage } = await sb
            .from("pipeline_stages")
            .select("id")
            .eq("pipelineId", pipelineId)
            .order("position", { ascending: true })
            .limit(1)
            .maybeSingle();
          stageId = firstStage ? (firstStage as { id: string }).id : null;
        }
      }
    }

    // Resolve or create the contact from inline details if no explicit contactId.
    let contactId: string | null = parsed.data.contactId ?? null;
    if (!contactId && (parsed.data.contactName || parsed.data.contactEmail || parsed.data.contactPhone)) {
      contactId = await upsertContact({
        name: parsed.data.contactName,
        email: parsed.data.contactEmail,
        phone: parsed.data.contactPhone,
        company: parsed.data.contactCompany,
      });
    }

    const caseNumber = await generateCaseNumber();
    const dueDate = await calculateSlaDueDate(parsed.data.priority);

    const { data: created, error: createErr } = await sb
      .from("cases")
      .insert({
        caseNumber,
        title: parsed.data.title,
        description: parsed.data.description,
        priority: parsed.data.priority,
        status: parsed.data.status,
        type: parsed.data.type,
        assignedToId: parsed.data.assignedToId ?? null,
        teamId: parsed.data.teamId ?? null,
        contactId,
        source: parsed.data.source,
        createdById: caller.userId,
        pipelineId,
        pipelineStageId: stageId,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      })
      .select("id, caseNumber, title, status, priority, createdAt")
      .single();

    if (createErr || !created) {
      return NextResponse.json(fail(createErr?.message ?? "Failed to create case"), { status: 500 });
    }

    const newCase = created as {
      id: string;
      caseNumber: string;
      title: string;
      status: string;
      priority: string;
      createdAt: string;
    };

    // Best-effort activity record
    const { error: actErr } = await sb.from("activities").insert({
      caseId: newCase.id,
      userId: caller.userId,
      type: "CREATED",
      description: "Case created",
    });
    if (actErr) console.error("[POST /api/cases] best-effort activity failed:", actErr.message);

    await writeAudit({
      userId: caller.userId,
      caseId: newCase.id,
      action: "CASE_CREATED",
      resource: "case",
      resourceId: newCase.id,
      after: newCase,
      req: request,
    });

    await triggerPusherEvent("cases", "case:created", {
      id: newCase.id,
      caseNumber: newCase.caseNumber,
      title: newCase.title,
    });

    // Fire-and-forget: SLA, automations, email — don't block the response
    Promise.all([
      enqueueSlaWarning(newCase.id).catch((e) => console.error("[POST /api/cases] SLA warning error:", e)),
      runAutomationEngine({
        triggerType: "CASE_CREATED",
        caseId: newCase.id,
        actorUserId: caller.userId,
      }).catch((e) => console.error("[POST /api/cases] Automation error:", e)),
      (async () => {
        if (!caller.email) return;
        const { data: emailRecord, error: emErr } = await sb
          .from("emails")
          .insert({
            caseId: newCase.id,
            subject: `Case created: ${newCase.caseNumber}`,
            body: "A new case has been created.",
            bodyText: "A new case has been created.",
            direction: "OUTBOUND",
            from: process.env.EMAIL_FROM ?? "support@example.com",
            to: [caller.email],
            cc: [],
            bcc: [],
            status: "PENDING",
          })
          .select("id")
          .single();
        if (emErr || !emailRecord) {
          console.error("[POST /api/cases] email row create failed:", emErr?.message);
          return;
        }
        await enqueueEmailJob({
          emailId: (emailRecord as { id: string }).id,
          to: [caller.email],
          subject: `Case created: ${newCase.caseNumber}`,
          caseNumber: newCase.caseNumber,
          caseTitle: newCase.title,
          status: newCase.status,
          priority: newCase.priority,
          assignee: null,
          updateMessage: "Your case has been created successfully.",
          caseUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/cases/${newCase.id}`,
        });
      })().catch((e) => console.error("[POST /api/cases] Email error:", e)),
    ]).catch(() => {});

    // Hydrate contact for the response so the caller can confirm what was linked
    let contact: { id: string; name: string; email: string | null; phone: string | null; company: string | null } | null = null;
    if (contactId) {
      const { data: contactRow } = await sb
        .from("contacts")
        .select("id, name, email, phone, company")
        .eq("id", contactId)
        .maybeSingle();
      contact = (contactRow as typeof contact) ?? null;
    }

    return NextResponse.json(ok({ ...newCase, contact }), { status: 201 });
  } catch (err) {
    console.error("[POST /api/cases] Error:", err);
    return NextResponse.json(fail("Failed to create case"), { status: 500 });
  }
}
