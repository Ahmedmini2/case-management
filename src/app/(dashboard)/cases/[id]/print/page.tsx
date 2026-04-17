import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/prisma";

export default async function PrintCasePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const { id } = await params;

  const item = await db.case.findUnique({
    where: { id },
    select: {
      caseNumber: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      source: true,
      createdAt: true,
      updatedAt: true,
      comments: {
        where: { isInternal: false },
        orderBy: { createdAt: "asc" },
        select: { id: true, body: true, createdAt: true },
      },
    },
  });

  if (!item) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6 print:p-0">
      <h1 className="text-2xl font-semibold">
        {item.caseNumber} - {item.title}
      </h1>
      <p>
        Status: {item.status} | Priority: {item.priority} | Source: {item.source}
      </p>
      <p>{item.description}</p>
      <h2 className="text-lg font-medium">Public Comments</h2>
      {item.comments.map((c) => (
        <div key={c.id} className="rounded-md border p-3">
          <p>{c.body}</p>
          <p className="text-xs text-muted-foreground">{new Date(c.createdAt).toLocaleString()}</p>
        </div>
      ))}
      <p className="text-sm text-muted-foreground print:hidden">
        Use browser print (<kbd>Ctrl/Cmd + P</kbd>) to export this page as PDF.
      </p>
    </div>
  );
}
