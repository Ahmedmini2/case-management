import Link from "next/link";
import { notFound } from "next/navigation";
import { CaseDetail } from "@/components/cases/CaseDetail";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ArrowLeft, Printer } from "lucide-react";
import type { CaseStatus, Priority } from "@/types/enums";

async function getCaseData(id: string) {
  const sb = supabaseAdmin();
  const { data: caseRow } = await sb
    .from("cases")
    .select(
      "id, caseNumber, title, description, status, priority, dueDate, slaBreachedAt, resolvedAt, closedAt, assignedToId, contactId",
    )
    .eq("id", id)
    .maybeSingle();

  if (!caseRow) return null;

  const c = caseRow as {
    id: string;
    caseNumber: string;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    dueDate: string | null;
    slaBreachedAt: string | null;
    resolvedAt: string | null;
    closedAt: string | null;
    assignedToId: string | null;
    contactId: string | null;
  };

  let assignedTo: { id: string; name: string | null; email: string; image: string | null } | null = null;
  if (c.assignedToId) {
    const { data: u } = await sb
      .from("users")
      .select("id, name, email, image")
      .eq("id", c.assignedToId)
      .maybeSingle();
    assignedTo = (u as typeof assignedTo) ?? null;
  }

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

  const { data: commentsRaw } = await sb
    .from("comments")
    .select("id, body, isInternal, createdAt, authorId")
    .eq("caseId", id)
    .order("createdAt", { ascending: false });

  const { data: activitiesRaw } = await sb
    .from("activities")
    .select("id, type, description, createdAt, userId")
    .eq("caseId", id)
    .order("createdAt", { ascending: false })
    .limit(50);

  const comments = (commentsRaw ?? []) as {
    id: string;
    body: string;
    isInternal: boolean;
    createdAt: string;
    authorId: string | null;
  }[];
  const activities = (activitiesRaw ?? []) as {
    id: string;
    type: string;
    description: string | null;
    createdAt: string;
    userId: string | null;
  }[];

  const userIds = [
    ...new Set([
      ...comments.map((cm) => cm.authorId).filter(Boolean) as string[],
      ...activities.map((a) => a.userId).filter(Boolean) as string[],
    ]),
  ];
  const userMap = new Map<string, { id: string; name: string | null; email: string }>();
  if (userIds.length > 0) {
    const { data: users } = await sb
      .from("users")
      .select("id, name, email")
      .in("id", userIds);
    for (const u of (users ?? []) as { id: string; name: string | null; email: string }[]) {
      userMap.set(u.id, u);
    }
  }

  return {
    id: c.id,
    caseNumber: c.caseNumber,
    title: c.title,
    description: c.description,
    status: c.status as CaseStatus,
    priority: c.priority as Priority,
    dueDate: c.dueDate,
    slaBreachedAt: c.slaBreachedAt,
    resolvedAt: c.resolvedAt,
    closedAt: c.closedAt,
    assignedTo,
    contact,
    comments: comments.map((cm) => ({
      id: cm.id,
      body: cm.body,
      isInternal: cm.isInternal,
      createdAt: cm.createdAt,
      author: cm.authorId ? userMap.get(cm.authorId) ?? null : null,
    })),
    activities: activities.map((a) => ({
      id: a.id,
      type: a.type,
      description: a.description ?? "",
      createdAt: a.createdAt,
      user: a.userId
        ? (() => {
            const u = userMap.get(a.userId);
            return u ? { id: u.id, name: u.name } : null;
          })()
        : null,
    })),
  };
}

async function getUsers() {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("users")
    .select("id, name, email, image, role")
    .order("name", { ascending: true });
  return ((data ?? []) as {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    role: string;
  }[]);
}

export default async function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const { id } = await params;

  const [caseData, users] = await Promise.all([
    getCaseData(id),
    getUsers(),
  ]);

  if (!caseData) notFound();

  const initialData = caseData;

  const initialUsers = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    image: u.image,
    role: u.role,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/cases" className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          All Cases
        </Link>
        <Link href={`/cases/${id}/print`} className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">
          <Printer className="h-4 w-4" />
          Print / PDF
        </Link>
      </div>
      <CaseDetail
        caseId={id}
        currentUserId={session.user.id}
        initialData={initialData as unknown as Parameters<typeof CaseDetail>[0]["initialData"]}
        initialUsers={initialUsers}
      />
    </div>
  );
}
