"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function NewPipelinePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Pipeline name is required.");
      return;
    }
    setSubmitting(true);

    const response = await fetch("/api/pipelines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), isDefault: true }),
    });
    const result = (await response.json()) as { data: { id: string } | null; error: string | null };
    setSubmitting(false);

    if (response.ok && result.data?.id) {
      toast.success("Pipeline created.");
      router.push(`/pipeline/${result.data.id}`);
      return;
    }
    toast.error(result.error ?? "Unable to create pipeline.");
    setError(result.error ?? "Unable to create pipeline.");
  }

  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-xl font-semibold sm:text-2xl">Create Pipeline</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Pipeline name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Creating..." : "Create"}
        </Button>
      </form>
    </div>
  );
}
