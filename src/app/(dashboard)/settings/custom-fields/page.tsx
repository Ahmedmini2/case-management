"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type FieldDef = { id: string; name: string; label: string; type: string; isRequired: boolean };

export default function CustomFieldsSettingsPage() {
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [type, setType] = useState("TEXT");
  const [open, setOpen] = useState(false);

  async function load() {
    const res = await fetch("/api/custom-fields");
    const json = (await res.json()) as { data: FieldDef[] | null };
    setFields(json.data ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function createField() {
    const response = await fetch("/api/custom-fields", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, label, type }),
    });
    if (!response.ok) {
      toast.error("Failed to create field");
      return;
    }
    setName("");
    setLabel("");
    setType("TEXT");
    await load();
    setOpen(false);
    toast.success("Custom field created.");
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Custom Fields</h2>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button className="bg-indigo-600 hover:bg-indigo-500">Add Field</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Custom Field</DialogTitle>
            <DialogDescription>Create a reusable schema field for cases.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input placeholder="name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input placeholder="label" value={label} onChange={(e) => setLabel(e.target.value)} />
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option>TEXT</option>
              <option>NUMBER</option>
              <option>DATE</option>
              <option>SELECT</option>
              <option>MULTISELECT</option>
              <option>BOOLEAN</option>
              <option>URL</option>
            </select>
          </div>
          <DialogFooter>
            <Button onClick={createField}>Create Field</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="space-y-2">
        {fields.map((field) => (
          <div key={field.id} className="rounded-md border p-3 text-sm">
            <p className="font-medium">
              {field.label} ({field.name})
            </p>
            <p className="text-muted-foreground">
              {field.type} {field.isRequired ? "- required" : ""}
            </p>
          </div>
        ))}
        {!fields.length ? <p className="text-sm text-muted-foreground">No custom fields yet.</p> : null}
      </div>
    </div>
  );
}
