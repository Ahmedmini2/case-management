"use client";

import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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

type UserItem = { id: string; name: string | null; email: string | null; image: string | null; role: string; isDefaultCaseReceiver?: boolean };

export default function UsersSettingsPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("AGENT");
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState("");
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editImage, setEditImage] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  async function load() {
    const response = await fetch("/api/users");
    const json = (await response.json()) as { data: UserItem[] | null };
    setUsers(json.data ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function createUser() {
    const response = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, role }),
    });
    const json = (await response.json()) as { error: string | null };
    if (!response.ok) {
      toast.error(json.error ?? "Failed to create user");
      return;
    }
    setName("");
    setEmail("");
    setPassword("");
    setRole("AGENT");
    await load();
    setOpen(false);
    toast.success("User created successfully.");
  }

  async function updateRole(userId: string, nextRole: string) {
    const response = await fetch(`/api/users/${userId}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: nextRole }),
    });
    if (!response.ok) {
      toast.error("Failed to update role");
      return;
    }
    await load();
    toast.success("Role updated.");
  }

  // Make a user the default case receiver (pass null to clear). New incoming
  // cases with no explicit assignee are auto-assigned to this person.
  async function setDefaultReceiver(userId: string | null) {
    const response = await fetch("/api/users/default-receiver", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (!response.ok) {
      const json = (await response.json()) as { error: string | null };
      toast.error(json.error ?? "Failed to update default receiver");
      return;
    }
    await load();
    toast.success(userId ? "Default case receiver updated." : "Default case receiver cleared.");
  }

  function openEditModal(user: UserItem) {
    setEditingUserId(user.id);
    setEditName(user.name ?? "");
    setEditEmail(user.email ?? "");
    setEditImage(user.image ?? "");
    setAvatarFile(null);
    setEditOpen(true);
  }

  async function uploadAvatarIfNeeded() {
    if (!avatarFile) return editImage;
    const formData = new FormData();
    formData.append("file", avatarFile);
    const response = await fetch("/api/uploads/avatar", {
      method: "POST",
      body: formData,
    });
    const json = (await response.json()) as { data: { url: string } | null; error: string | null };
    if (!response.ok || !json.data?.url) {
      throw new Error(json.error ?? "Failed to upload avatar");
    }
    return json.data.url;
  }

  async function updateUser() {
    if (!editingUserId) return;
    try {
      const imageUrl = await uploadAvatarIfNeeded();
      const response = await fetch(`/api/users/${editingUserId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          email: editEmail.trim(),
          image: imageUrl || null,
        }),
      });
      const json = (await response.json()) as { error: string | null };
      if (!response.ok) {
        toast.error(json.error ?? "Failed to update user");
        return;
      }
      await load();
      setEditOpen(false);
      toast.success("User updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update user");
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Users</h2>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button className="bg-indigo-600 hover:bg-indigo-500">Add User</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
            <DialogDescription>Create a user and assign an initial role.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option>SUPER_ADMIN</option>
              <option>ADMIN</option>
              <option>MANAGER</option>
              <option>AGENT</option>
              <option>VIEWER</option>
              <option>CUSTOMER</option>
            </select>
          </div>
          <DialogFooter>
            <Button onClick={createUser}>Create User</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="space-y-2">
        {users.map((user) => (
          <div key={user.id} className="flex flex-col gap-3 rounded-md border p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar className="shrink-0">
                <AvatarImage src={user.image ?? undefined} alt={user.name ?? "User"} />
                <AvatarFallback>
                  {(user.name ?? user.email ?? "U")
                    .split(" ")
                    .map((part) => part[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  <span className="truncate">{user.name ?? "Unnamed User"}</span>
                  {user.isDefaultCaseReceiver && (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                      Default case receiver
                    </span>
                  )}
                </p>
                <p className="truncate text-muted-foreground">
                  {user.email ?? "No email"} - {user.role}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
              <Button
                variant={user.isDefaultCaseReceiver ? "default" : "outline"}
                size="sm"
                onClick={() => void setDefaultReceiver(user.isDefaultCaseReceiver ? null : user.id)}
                title={
                  user.isDefaultCaseReceiver
                    ? "New cases auto-assign to this user. Click to clear."
                    : "Make this user the default receiver for new cases"
                }
              >
                {user.isDefaultCaseReceiver ? "✓ Default receiver" : "Make default receiver"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => openEditModal(user)}>
                <Pencil className="mr-1 h-4 w-4" />
                Edit
              </Button>
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={user.role}
                onChange={(e) => void updateRole(user.id, e.target.value)}
              >
                <option>SUPER_ADMIN</option>
                <option>ADMIN</option>
                <option>MANAGER</option>
                <option>AGENT</option>
                <option>VIEWER</option>
                <option>CUSTOMER</option>
              </select>
            </div>
          </div>
        ))}
        {!users.length ? <p className="text-sm text-muted-foreground">No users found.</p> : null}
      </div>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update user details and profile image.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input placeholder="Name" value={editName} onChange={(e) => setEditName(e.target.value)} />
            <Input placeholder="Email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
            <Input
              placeholder="Profile image URL (optional)"
              value={editImage}
              onChange={(e) => setEditImage(e.target.value)}
            />
            <Input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <DialogFooter>
            <Button onClick={updateUser}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
