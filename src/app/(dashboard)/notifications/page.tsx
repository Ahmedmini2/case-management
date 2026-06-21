"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Item = {
  id: string;
  title: string;
  body: string | null;
  isRead: boolean;
  link: string | null;
  createdAt: string;
};

export default function NotificationsPage() {
  const [items, setItems] = useState<Item[]>([]);

  async function load() {
    const res = await fetch("/api/notifications");
    const json = (await res.json()) as { data: Item[] | null };
    setItems(json.data ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function markRead(id: string) {
    await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
    await load();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold sm:text-2xl">Notifications</h1>
      {items.map((item) => (
        <div key={item.id} className="rounded-md border p-4">
          <p className="font-medium break-words">{item.title}</p>
          {item.body ? <p className="mt-1 text-sm text-muted-foreground break-words">{item.body}</p> : null}
          <p className="mt-1 text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</p>
          {!item.isRead ? (
            <Button className="mt-2 w-full sm:w-auto" variant="outline" onClick={() => markRead(item.id)}>
              Mark Read
            </Button>
          ) : null}
        </div>
      ))}
      {!items.length ? <p className="text-sm text-muted-foreground">No notifications yet.</p> : null}
    </div>
  );
}
