import { CaseStatus, Priority } from "@/types/enums";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { runAutomationEngine } from "@/lib/automations/engine";
import { auth } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { enqueueEmailJob } from "@/lib/queue/jobs";
import { triggerPusherEvent } from "@/lib/pusher";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getCaseNotifyRecipients } from "@/lib/notify";

const updateCaseSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  status: z.nativeEnum(CaseStatus).optional(),
  priority: z.nativeEnum(Priority).optional(),
  assignedToId: z.string().nullable().optional(),
  teamId: z.string().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  pipelineStageId: z.string().nullable().optional(),
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(fail("Unauthorized"), { status: 401 });
  }

  const sb = supabaseAdmin();
  const { data: caseRow, error: caseErr } = await sb
    .from("cases")
    .select(
      "id, caseNumber, title, description, status, priority, source, createdAt, updatedAt, dueDate, assignedToId, createdById, contactId",
    )
    .eq("id", id)
    .maybeSingle();

  if (caseErr) return NextResponse.json(fail(caseErr.message), { status: 500 });
  if (!caseRow) return NextResponse.json(fail("Case not found"), { status: 404 });

  const c = caseRow as {
    id: string;
    caseNumber: string;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    source: string;
    createdAt: string;
    updatedAt: string;
    dueDate: string | null;
    assignedToId: string | null;
    createdById: string | null;
    contactId: string | null;
  };

  // Fetch contact in parallel with users
  let contact: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    company: string | null;
  } | null = null;
  if (c.contactId) {
    const { data: ct } = await sb
      .from("contacts")
      .select("id, name, email, phone, company")
      .eq("id", c.contactId)
      .maybeSingle();
    contact = (ct as typeof contact) ?? null;
  }

  // Fetch related users
  const userIds = [c.assignedToId, c.createdById].filter(Boolean) as string[];
  const userMap = new Map<string, { id: string; name: string | null; email: string; image: string | null }>();
  if (userIds.length > 0) {
    const { data: users } = await sb
      .from("users")
      .select("id, name, email, image")
      .in("id", [...new Set(userIds)]);
    for (const u of (users ?? []) as { id: string; name: string | null; email: string; image: string | null }[]) {
      userMap.set(u.id, u);
    }
  }

  // Comments
  const { data: rawComments } = await sb
    .from("comments")
    .select("id, body, isInternal, createdAt, authorId")
    .eq("caseId", id)
    .order("createdAt", { ascending: false });

  const comments = ((rawComments ?? []) as {
    id: string;
    body: string;
    isInternal: boolean;
    createdAt: string;
    authorId: string | null;
  }[]);

  // Activities
  const { data: rawActivities } = await sb
    .from("activities")
    .select("id, type, description, oldValue, newValue, createdAt, userId")
    .eq("caseId", id)
    .order("createdAt", { ascending: false });

  const activities = ((rawActivities ?? []) as {
    id: string;
    type: string;
    description: string | null;
    oldValue: string | null;
    newValue: string | null;
    createdAt: string;
    userId: string | null;
  }[]);

  // Hydrate authors and activity users
  const authorIds = [
    ...new Set([
      ...comments.map((c) => c.authorId).filter(Boolean),
      ...activities.map((a) => a.userId).filter(Boolean),
    ]),
  ] as string[];
  const missing = authorIds.filter((aid) => !userMap.has(aid));
  if (missing.length > 0) {
    const { data: extras } = await sb
      .from("users")
      .select("id, name, email")
      .in("id", missing);
    for (const u of (extras ?? []) as { id: string; name: string | null; email: string }[]) {
      userMap.set(u.id, { id: u.id, name: u.name, email: u.email, image: null });
    }
  }

  const item = {
    id: c.id,
    caseNumber: c.caseNumber,
    title: c.title,
    description: c.description,
    status: c.status,
    priority: c.priority,
    source: c.source,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    dueDate: c.dueDate,
    assignedTo: c.assignedToId
      ? (() => {
          const u = userMap.get(c.assignedToId);
          return u ? { id: u.id, name: u.name, email: u.email, image: u.image } : null;
        })()
      : null,
    createdBy: c.createdById
      ? (() => {
          const u = userMap.get(c.createdById);
          return u ? { id: u.id, name: u.name, email: u.email } : null;
        })()
      : null,
    contact,
    comments: comments.map((cm) => ({
      id: cm.id,
      body: cm.body,
      isInternal: cm.isInternal,
      createdAt: cm.createdAt,
      author: cm.authorId
        ? (() => {
            const u = userMap.get(cm.authorId);
            return u ? { id: u.id, name: u.name, email: u.email } : null;
          })()
        : null,
    })),
    activities: activities.map((a) => ({
      id: a.id,
      type: a.type,
      description: a.description,
      oldValue: a.oldValue,
      newValue: a.newValue,
      createdAt: a.createdAt,
      user: a.userId
        ? (() => {
            const u = userMap.get(a.userId);
            return u ? { id: u.id, name: u.name } : null;
          })()
        : null,
    })),
  };

  return NextResponse.json(ok(item));
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(fail("Unauthorized"), { status: 401 });
  }

  const sb = supabaseAdmin();
  const { data: existing, error: findErr } = await sb
    .from("cases")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (findErr) return NextResponse.json(fail(findErr.message), { status: 500 });
  if (!existing) return NextResponse.json(fail("Case not found"), { status: 404 });

  const ex = existing as Record<string, unknown> & {
    id: string;
    status: string;
    priority: string;
    pipelineStageId: string | null;
  };

  const json = await request.json();
  const parsed = updateCaseSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(fail("Invalid request body"), { status: 400 });
  }

  // Resolve next stage name (for activity log)
  let nextStageName: string | null = null;
  if (typeof parsed.data.pipelineStageId !== "undefined" && parsed.data.pipelineStageId) {
    const { data: stage } = await sb
      .from("pipeline_stages")
      .select("name")
      .eq("id", parsed.data.pipelineStageId)
      .maybeSingle();
    nextStageName = stage ? (stage as { name: string }).name : null;
  }

  const updatePayload: Record<string, unknown> = { ...parsed.data };
  if (typeof parsed.data.dueDate !== "undefined") {
    updatePayload.dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate).toISOString() : null;
  }

  const { data: updatedRow, error: updErr } = await sb
    .from("cases")
    .update(updatePayload)
    .eq("id", id)
    .select("id, caseNumber, title, status, priority, dueDate, updatedAt")
    .single();
  if (updErr || !updatedRow) {
    return NextResponse.json(fail(updErr?.message ?? "Update failed"), { status: 500 });
  }

  const updated = updatedRow as {
    id: string;
    caseNumber: string;
    title: string;
    status: string;
    priority: string;
    dueDate: string | null;
    updatedAt: string;
  };

  // Best-effort activities
  if (parsed.data.status && parsed.data.status !== ex.status) {
    const { error } = await sb.from("activities").insert({
      caseId: id,
      userId: session.user.id,
      type: "STATUS_CHANGED",
      description: "Status updated",
      oldValue: ex.status,
      newValue: parsed.data.status,
    });
    if (error) console.error("[case:patch] activity STATUS failed:", error.message);
  }

  if (parsed.data.priority && parsed.data.priority !== ex.priority) {
    const { error } = await sb.from("activities").insert({
      caseId: id,
      userId: session.user.id,
      type: "PRIORITY_CHANGED",
      description: "Priority updated",
      oldValue: ex.priority,
      newValue: parsed.data.priority,
    });
    if (error) console.error("[case:patch] activity PRIORITY failed:", error.message);
  }

  const stageChanged =
    typeof parsed.data.pipelineStageId !== "undefined" &&
    parsed.data.pipelineStageId !== ex.pipelineStageId;

  if (stageChanged) {
    const { error: stageActErr } = await sb.from("activities").insert({
      caseId: id,
      userId: session.user.id,
      type: "STAGE_CHANGED",
      description: "Pipeline stage updated",
      oldValue: ex.pipelineStageId ?? "",
      newValue: parsed.data.pipelineStageId ?? "",
    });
    if (stageActErr) console.error("[case:patch] activity STAGE failed:", stageActErr.message);

    // Tag swap for stage:<id>
    const oldStageTagName = ex.pipelineStageId ? `stage:${ex.pipelineStageId}` : null;
    const newStageTagName = parsed.data.pipelineStageId ? `stage:${parsed.data.pipelineStageId}` : null;

    if (oldStageTagName) {
      try {
        const { data: oldTag } = await sb
          .from("tags")
          .select("id")
          .eq("name", oldStageTagName)
          .maybeSingle();
        if (oldTag) {
          await sb
            .from("case_tags")
            .delete()
            .eq("caseId", id)
            .eq("tagId", (oldTag as { id: string }).id);
        }
      } catch (err) {
        console.error("[case:patch] old tag remove failed:", err);
      }
    }

    if (newStageTagName) {
      try {
        // Upsert tag
        const { data: existingTag } = await sb
          .from("tags")
          .select("id")
          .eq("name", newStageTagName)
          .maybeSingle();

        let tagId: string | null = existingTag ? (existingTag as { id: string }).id : null;

        if (tagId) {
          await sb.from("tags").update({ color: "#0ea5e9" }).eq("id", tagId);
        } else {
          const { data: newTag, error: newTagErr } = await sb
            .from("tags")
            .insert({ name: newStageTagName, color: "#0ea5e9" })
            .select("id")
            .single();
          if (!newTagErr && newTag) tagId = (newTag as { id: string }).id;
        }

        if (tagId) {
          // Upsert case_tags (composite key caseId+tagId)
          await sb
            .from("case_tags")
            .upsert({ caseId: id, tagId }, { onConflict: "caseId,tagId" });
        }
      } catch (err) {
        console.error("[case:patch] new tag upsert failed:", err);
      }

      if (nextStageName) {
        const { error: tagActErr } = await sb.from("activities").insert({
          caseId: id,
          userId: session.user.id,
          type: "TAG_ADDED",
          description: `Stage tag updated to ${nextStageName}`,
          newValue: nextStageName,
        });
        if (tagActErr) console.error("[case:patch] activity TAG_ADDED failed:", tagActErr.message);
      }
    }
  }

  const actorUserId = session.user.id;
  const recipientEmail = session.user.email ?? null;

  after(async () => {
    const sbAfter = supabaseAdmin();
    try {
      await writeAudit({
        userId: actorUserId,
        caseId: id,
        action: "CASE_UPDATED",
        resource: "case",
        resourceId: id,
        before: ex,
        after: updated,
        req: request,
      });
    } catch (err) {
      console.error("[case:update] audit failed", err);
    }

    try {
      await triggerPusherEvent("cases", "case:updated", {
        id: updated.id,
        caseNumber: updated.caseNumber,
        title: updated.title,
        pipelineStageId: parsed.data.pipelineStageId ?? null,
      });
    } catch (err) {
      console.error("[case:update] pusher failed", err);
    }

    // Notify on every update (status, priority, assignee, due date, etc.)
    const recipients = getCaseNotifyRecipients(recipientEmail);
    if (recipients.length > 0) {
      try {
        const changedFields: string[] = [];
        if (parsed.data.status && parsed.data.status !== ex.status) {
          changedFields.push(`status: ${ex.status} → ${parsed.data.status}`);
        }
        if (parsed.data.priority && parsed.data.priority !== ex.priority) {
          changedFields.push(`priority: ${ex.priority} → ${parsed.data.priority}`);
        }
        if (typeof parsed.data.assignedToId !== "undefined") {
          changedFields.push("assignee changed");
        }
        if (typeof parsed.data.title !== "undefined") changedFields.push("title");
        if (typeof parsed.data.description !== "undefined") changedFields.push("description");
        if (typeof parsed.data.pipelineStageId !== "undefined") changedFields.push("stage");
        if (typeof parsed.data.dueDate !== "undefined") changedFields.push("due date");
        const updateMessage =
          changedFields.length > 0 ? `Changes: ${changedFields.join(", ")}.` : "Case updated.";

        const { data: emailRecord } = await sbAfter
          .from("emails")
          .insert({
            caseId: id,
            subject: `Case updated: ${updated.caseNumber}`,
            body: updateMessage,
            bodyText: updateMessage,
            direction: "OUTBOUND",
            from: process.env.EMAIL_FROM ?? "support@example.com",
            to: recipients,
            cc: [],
            bcc: [],
            status: "PENDING",
          })
          .select("id")
          .single();

        if (emailRecord) {
          await enqueueEmailJob({
            emailId: (emailRecord as { id: string }).id,
            to: recipients,
            subject: `Case updated: ${updated.caseNumber}`,
            caseNumber: updated.caseNumber,
            caseTitle: updated.title,
            status: updated.status,
            priority: updated.priority,
            assignee: null,
            updateMessage,
            caseUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/cases/${id}`,
          });
        }
      } catch (err) {
        console.error("[case:update] email job failed", err);
      }
    }

    if (parsed.data.status) {
      try {
        await runAutomationEngine({
          triggerType: "CASE_STATUS_CHANGED",
          caseId: id,
          actorUserId,
          payload: { oldStatus: ex.status, newStatus: parsed.data.status },
        });
      } catch (err) {
        console.error("[case:update] automation STATUS failed", err);
      }
    }

    if (parsed.data.priority) {
      try {
        await runAutomationEngine({
          triggerType: "CASE_PRIORITY_CHANGED",
          caseId: id,
          actorUserId,
          payload: { oldPriority: ex.priority, newPriority: parsed.data.priority },
        });
      } catch (err) {
        console.error("[case:update] automation PRIORITY failed", err);
      }
    }

    if (stageChanged) {
      try {
        await runAutomationEngine({
          triggerType: "STAGE_CHANGED",
          caseId: id,
          actorUserId,
          payload: { oldStageId: ex.pipelineStageId, newStageId: parsed.data.pipelineStageId },
        });
      } catch (err) {
        console.error("[case:update] automation STAGE failed", err);
      }
    }
  });

  return NextResponse.json(ok(updated));
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(fail("Unauthorized"), { status: 401 });
  }

  const sb = supabaseAdmin();
  const { data: existing, error: findErr } = await sb
    .from("cases")
    .select("id, caseNumber, title")
    .eq("id", id)
    .maybeSingle();
  if (findErr) return NextResponse.json(fail(findErr.message), { status: 500 });
  if (!existing) return NextResponse.json(fail("Case not found"), { status: 404 });

  const { error: delErr } = await sb.from("cases").delete().eq("id", id);
  if (delErr) return NextResponse.json(fail(delErr.message), { status: 500 });

  await writeAudit({
    userId: session.user.id,
    caseId: id,
    action: "CASE_DELETED",
    resource: "case",
    resourceId: id,
    before: existing,
    req: request,
  });

  return NextResponse.json(ok({ id }));
}
