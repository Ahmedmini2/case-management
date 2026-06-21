import Link from "next/link";
import { CaseListClient } from "@/components/cases/CaseListClient";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Download, Plus, LayoutList } from "lucide-react";
import type { CaseStatus, Priority } from "@/types/enums";

async function getCases() {
  const sb = supabaseAdmin();
  const { data: rowsRaw } = await sb
    .from("cases")
    .select(
      "id, caseNumber, title, status, priority, source, createdAt, dueDate, assignedToId",
    )
    .order("createdAt", { ascending: false })
    .limit(500);

  const cases = (rowsRaw ?? []) as {
    id: string;
    caseNumber: string;
    title: string;
    status: string;
    priority: string;
    source: string;
    createdAt: string;
    dueDate: string | null;
    assignedToId: string | null;
  }[];

  // Parallel: hydrate assignees AND case_tags in one round-trip
  const assigneeIds = [...new Set(cases.map((c) => c.assignedToId).filter(Boolean) as string[])];
  const caseIds = cases.map((c) => c.id);

  const [usersRes, caseTagsRes] = await Promise.all([
    assigneeIds.length > 0
      ? sb.from("users").select("id, name, email").in("id", assigneeIds)
      : Promise.resolve({ data: [] as unknown[] }),
    caseIds.length > 0
      ? sb.from("case_tags").select("caseId, tagId").in("caseId", caseIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const assigneeMap = new Map<string, { id: string; name: string | null; email: string }>();
  for (const u of (usersRes.data ?? []) as { id: string; name: string | null; email: string }[]) {
    assigneeMap.set(u.id, u);
  }

  const tagsByCaseId = new Map<string, { id: string; name: string; color: string }[]>();
  const ctRows = (caseTagsRes.data ?? []) as { caseId: string; tagId: string }[];
  const tagIds = [...new Set(ctRows.map((c) => c.tagId))];
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
  for (const ct of ctRows) {
    const tag = tagMap.get(ct.tagId);
    if (!tag) continue;
    const list = tagsByCaseId.get(ct.caseId) ?? [];
    list.push(tag);
    tagsByCaseId.set(ct.caseId, list);
  }

  return cases.map((c) => ({
    id: c.id,
    caseNumber: c.caseNumber,
    title: c.title,
    status: c.status,
    priority: c.priority,
    source: c.source,
    createdAt: c.createdAt,
    dueDate: c.dueDate,
    assignedTo: c.assignedToId ? assigneeMap.get(c.assignedToId) ?? null : null,
    tags: (tagsByCaseId.get(c.id) ?? []).map((tag) => ({ tag })),
  }));
}

export default async function CasesPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const cases = await getCases();

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <LayoutList className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight">Cases</h1>
            <p className="text-xs text-muted-foreground">{cases.length} cases · sorted by newest</p>
          </div>
        </div>
        <div className="flex flex-1 items-center gap-2 sm:flex-none">
          <Link
            href="/api/export/cases"
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors sm:flex-none"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </Link>
          <Link
            href="/cases/new"
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80 transition-colors sm:flex-none"
          >
            <Plus className="h-4 w-4" />
            New Case
          </Link>
        </div>
      </div>

      <CaseListClient
        items={cases.map((item) => ({
          ...item,
          status: item.status as CaseStatus,
          priority: item.priority as Priority,
          createdAt: new Date(item.createdAt).toISOString(),
          dueDate: item.dueDate ? new Date(item.dueDate).toISOString() : null,
          tags: item.tags.map((t) => t.tag),
        }))}
      />
    </div>
  );
}
