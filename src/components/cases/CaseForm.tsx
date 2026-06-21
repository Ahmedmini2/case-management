"use client";

import { Priority } from "@/types/enums";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const schema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().optional(),
  priority: z.nativeEnum(Priority),
  assignedToId: z.string().optional(),
});

type UserOption = { id: string; name: string | null; email: string | null; image?: string | null; role: string };

export function CaseForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const [users, setUsers] = useState<UserOption[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>(Priority.MEDIUM);
  const [assignedToId, setAssignedToId] = useState("");
  const selectedUser = users.find((user) => user.id === assignedToId) ?? null;

  useEffect(() => {
    async function loadUsers() {
      const response = await fetch("/api/users");
      const result = (await response.json()) as { data: UserOption[] | null };
      setUsers(result.data ?? []);
    }
    void loadUsers();
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setServerError("");
    const parsed = schema.safeParse({
      title,
      description,
      priority,
      assignedToId: assignedToId || undefined,
    });
    if (!parsed.success) {
      setServerError(parsed.error.issues[0]?.message ?? "Invalid form");
      return;
    }

    const response = await fetch("/api/cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    });

    const result = (await response.json()) as {
      data: { id: string } | null;
      error: string | null;
    };

    if (!response.ok || !result.data) {
      setServerError(result.error ?? "Failed to create case");
      return;
    }

    router.push(`/cases/${result.data.id}`);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create New Case</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" rows={6} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="priority">Priority</Label>
            <select
              id="priority"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
            >
              {Object.values(Priority).map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="assignedToId">Assign to user</Label>
            <select
              id="assignedToId"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={assignedToId}
              onChange={(e) => setAssignedToId(e.target.value)}
            >
              <option value="">Unassigned</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name ?? user.email} ({user.role})
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-2 text-sm">
              <Avatar size="sm">
                <AvatarImage src={selectedUser?.image ?? undefined} alt={selectedUser?.name ?? "Unassigned"} />
                <AvatarFallback>
                  {(selectedUser?.name ?? "Unassigned")
                    .split(" ")
                    .map((part) => part[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-muted-foreground">
                {selectedUser ? `Assigned to ${selectedUser.name ?? selectedUser.email}` : "No assignee selected"}
              </span>
            </div>
          </div>
          {serverError ? <p className="text-sm text-red-600">{serverError}</p> : null}
          <Button type="submit" className="w-full sm:w-auto">Create Case</Button>
        </form>
      </CardContent>
    </Card>
  );
}
