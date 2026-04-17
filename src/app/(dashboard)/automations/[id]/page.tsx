import { auth } from "@/lib/auth";
import { db } from "@/lib/prisma";

export default async function AutomationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return null;

  const item = await db.automation.findUnique({
    where: { id },
    include: { runs: { orderBy: { createdAt: "desc" }, take: 20 } },
  });
  if (!item) return <p className="text-sm text-muted-foreground">Automation not found.</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{item.name}</h1>
      <p className="text-sm text-muted-foreground">{item.description ?? "No description"}</p>
      <pre className="overflow-auto rounded-md border p-3 text-xs">{JSON.stringify(item.trigger, null, 2)}</pre>
      <pre className="overflow-auto rounded-md border p-3 text-xs">{JSON.stringify(item.actions, null, 2)}</pre>
      <div className="space-y-2">
        <h2 className="font-medium">Recent Runs</h2>
        {item.runs.map((run) => (
          <div key={run.id} className="rounded-md border p-3 text-sm">
            <p>
              {run.status} - {new Date(run.createdAt).toLocaleString()}
            </p>
            {run.error ? <p className="text-red-600">{run.error}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
