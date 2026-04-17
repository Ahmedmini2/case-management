"use client";

import { useEffect, useState, use } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Stage = { id: string; name: string; color: string };
type Pipeline = { id: string; name: string; description: string | null; isDefault: boolean; stages: Stage[] };

export default function PipelineDetailPage({ params }: { params: Promise<{ pipelineId: string }> }) {
  const { pipelineId } = use(params);
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const response = await fetch(`/api/pipelines/${pipelineId}`);
      const result = (await response.json()) as { data: Pipeline | null };
      if (result.data) {
        setPipeline(result.data);
        setName(result.data.name);
      }
    }
    void load();
  }, [pipelineId]);

  async function save() {
    setSaving(true);
    await fetch(`/api/pipelines/${pipelineId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setSaving(false);
  }

  if (!pipeline) {
    return <p className="text-sm text-muted-foreground">Loading pipeline...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Pipeline Settings</h1>
        <p className="text-sm text-muted-foreground">Manage pipeline name and stages.</p>
      </div>
      <div className="max-w-md space-y-2">
        <Label htmlFor="pipeline-name">Name</Label>
        <Input id="pipeline-name" value={name} onChange={(e) => setName(e.target.value)} />
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
      <div className="space-y-2">
        <h2 className="font-medium">Stages</h2>
        {pipeline.stages.map((stage) => (
          <div key={stage.id} className="rounded-md border p-3 text-sm">
            <span className="font-medium">{stage.name}</span> - <span className="text-muted-foreground">{stage.color}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
