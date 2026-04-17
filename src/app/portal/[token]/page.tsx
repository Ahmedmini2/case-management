"use client";

import { useEffect, useState, use } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type PortalCase = {
  caseNumber: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  comments: Array<{
    id: string;
    body: string;
    createdAt: string;
    author: { name: string | null; email: string | null };
  }>;
  activities: Array<{ id: string; description: string; createdAt: string }>;
};

export default function PortalTrackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [item, setItem] = useState<PortalCase | null>(null);
  const [reply, setReply] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch(`/api/portal/${token}`, { cache: "no-store" });
    const json = (await response.json()) as { data: PortalCase | null; error: string | null };
    if (!response.ok) {
      setMessage(json.error ?? "Unable to load case.");
      return;
    }
    setItem(json.data);
  }

  useEffect(() => {
    void load();
  }, [token]);

  async function sendReply() {
    if (!reply.trim()) return;
    const response = await fetch(`/api/portal/${token}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: reply }),
    });
    if (!response.ok) {
      setMessage("Failed to send reply.");
      return;
    }
    setReply("");
    setMessage("Reply sent.");
    await load();
  }

  if (!item) {
    return <div className="p-6 text-sm text-muted-foreground">{message || "Loading..."}</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>
            {item.caseNumber} - {item.title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Status: {item.status} - Priority: {item.priority}
          </p>
          <p className="text-sm">{item.description}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Public Timeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {item.activities.map((activity) => (
            <div key={activity.id} className="rounded-md border p-3 text-sm">
              <p>{activity.description}</p>
              <p className="text-xs text-muted-foreground">{new Date(activity.createdAt).toLocaleString()}</p>
            </div>
          ))}
          {!item.activities.length ? <p className="text-sm text-muted-foreground">No timeline yet.</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Comments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {item.comments.map((comment) => (
            <div key={comment.id} className="rounded-md border p-3 text-sm">
              <p>{comment.body}</p>
              <p className="text-xs text-muted-foreground">
                {comment.author.name ?? comment.author.email ?? "Support"} -{" "}
                {new Date(comment.createdAt).toLocaleString()}
              </p>
            </div>
          ))}
          {!item.comments.length ? <p className="text-sm text-muted-foreground">No public comments yet.</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reply</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={5} />
          <Button onClick={sendReply}>Send Reply</Button>
          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
