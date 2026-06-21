import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export default async function AutomationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return null;

  const sb = supabaseAdmin();
  const { data: itemRow } = await sb
    .from("automations")
    .select("id, name, description, trigger, actions")
    .eq("id", id)
    .maybeSingle();

  if (!itemRow) return <p className="text-sm text-muted-foreground">Automation not found.</p>;

  const item = itemRow as {
    id: string;
    name: string;
    description: string | null;
    trigger: unknown;
    actions: unknown;
  };

  const { data: runsRaw } = await sb
    .from("automation_runs")
    .select("id, status, error, createdAt")
    .eq("automationId", id)
    .order("createdAt", { ascending: false })
    .limit(20);

  const runs = (runsRaw ?? []) as {
    id: string;
    status: string;
    error: string | null;
    createdAt: string;
  }[];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold break-words sm:text-2xl">{item.name}</h1>
      <p className="text-sm text-muted-foreground break-words">{item.description ?? "No description"}</p>
      <pre className="overflow-auto rounded-md border p-3 text-xs">{JSON.stringify(item.trigger, null, 2)}</pre>
      <pre className="overflow-auto rounded-md border p-3 text-xs">{JSON.stringify(item.actions, null, 2)}</pre>
      <div className="space-y-2">
        <h2 className="font-medium">Recent Runs</h2>
        {runs.map((run) => (
          <div key={run.id} className="rounded-md border p-3 text-sm">
            <p>
              {run.status} - {new Date(run.createdAt).toLocaleString()}
            </p>
            {run.error ? <p className="text-red-600 break-words">{run.error}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
