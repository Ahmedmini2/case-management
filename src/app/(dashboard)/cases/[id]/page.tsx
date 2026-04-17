import Link from "next/link";
import { notFound } from "next/navigation";
import { CaseDetail } from "@/components/cases/CaseDetail";
import { auth } from "@/lib/auth";
import { db } from "@/lib/prisma";
import { ArrowLeft, Printer } from "lucide-react";

async function getCaseData(id: string) {
  return db.case.findUnique({
    where: { id },
    select: {
      id: true,
      caseNumber: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      dueDate: true,
      slaBreachedAt: true,
      resolvedAt: true,
      closedAt: true,
      assignedTo: { select: { id: true, name: true, email: true, image: true } },
      comments: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          body: true,
          isInternal: true,
          createdAt: true,
          author: { select: { id: true, name: true, email: true } },
        },
      },
      activities: {
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          type: true,
          description: true,
          createdAt: true,
          user: { select: { id: true, name: true } },
        },
      },
    },
  });
}

async function getUsers() {
  return db.user.findMany({
    select: { id: true, name: true, email: true, image: true, role: true },
    orderBy: { name: "asc" },
  });
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

  const initialData = {
    ...caseData,
    dueDate: caseData.dueDate?.toISOString() ?? null,
    slaBreachedAt: caseData.slaBreachedAt?.toISOString() ?? null,
    resolvedAt: caseData.resolvedAt?.toISOString() ?? null,
    closedAt: caseData.closedAt?.toISOString() ?? null,
    comments: caseData.comments.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
    })),
    activities: caseData.activities.map((a) => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
    })),
  };

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
        initialData={initialData}
        initialUsers={initialUsers}
      />
    </div>
  );
}
