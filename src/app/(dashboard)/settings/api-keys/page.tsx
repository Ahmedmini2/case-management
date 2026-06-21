"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Copy, Key, Trash2, AlertTriangle, CheckCircle2 } from "lucide-react";

type ApiKeyItem = {
  id: string;
  name: string;
  scope: "read-only" | "write" | "admin";
  prefix: string;
  isActive: boolean;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
};

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export default function ApiKeysPage() {
  const [name, setName] = useState("");
  const [scope, setScope] = useState<ApiKeyItem["scope"]>("write");
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [createdKey, setCreatedKey] = useState("");
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/api-keys");
    const json = (await res.json()) as { data: ApiKeyItem[] | null };
    setKeys(json.data ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createKey() {
    if (!name.trim()) {
      toast.error("Please give the key a name");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), scope }),
      });
      const json = (await res.json()) as { data: { key?: string } | null; error: string | null };
      if (!res.ok || !json.data?.key) {
        toast.error(json.error ?? "Failed to create key");
        return;
      }
      setCreatedKey(json.data.key);
      setName("");
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string, keyName: string) {
    if (!confirm(`Revoke "${keyName}"? Any service using this key will stop working immediately.`)) return;
    setRevoking(id);
    try {
      const res = await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Failed to revoke");
        return;
      }
      toast.success("Key revoked");
      await load();
    } finally {
      setRevoking(null);
    }
  }

  async function copyKey() {
    if (!createdKey) return;
    try {
      await navigator.clipboard.writeText(createdKey);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Couldn't copy — select and copy manually");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">API Keys</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Generate keys for n8n, Zapier, or any external service that needs to call your API.
          Use the key in the <code className="rounded bg-muted px-1 py-0.5 text-xs">Authorization: Bearer cms_live_…</code> header.
        </p>
      </div>

      {/* New-key reveal banner */}
      {createdKey && (
        <Card className="border-emerald-500/40 bg-emerald-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-emerald-500">
              <CheckCircle2 className="h-5 w-5" />
              Your new API key
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                <strong>Copy this now.</strong> It will not be shown again. If you lose it, revoke this key and generate a new one.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={createdKey}
                className="font-mono text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button onClick={copyKey} variant="default" className="shrink-0">
                <Copy className="mr-2 h-4 w-4" />
                Copy
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setCreatedKey("")}>
              I&apos;ve saved it — dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Create form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Key className="h-4 w-4" />
            Generate a new key
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <div className="space-y-1.5">
              <Label htmlFor="key-name">Name</Label>
              <Input
                id="key-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. n8n, Zapier production"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void createKey();
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="key-scope">Scope</Label>
              <select
                id="key-scope"
                value={scope}
                onChange={(e) => setScope(e.target.value as ApiKeyItem["scope"])}
                className="h-10 w-full sm:w-40 rounded-md border bg-background px-3 text-sm"
              >
                <option value="read-only">read-only</option>
                <option value="write">write</option>
                <option value="admin">admin</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="opacity-0 sm:block hidden">.</Label>
              <Button onClick={createKey} disabled={creating} className="w-full sm:w-auto">
                {creating ? "Generating…" : "Generate Key"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Existing keys */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Existing keys</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">No API keys yet. Generate one above to get started.</p>
          ) : (
            keys.map((key) => (
              <div
                key={key.id}
                className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm">{key.name}</p>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                      {key.scope}
                    </span>
                    {!key.isActive && (
                      <span className="rounded-full bg-red-500/10 text-red-500 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                        Revoked
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="font-mono">{key.prefix}…</span>
                    <span>·</span>
                    <span>last used {relativeTime(key.lastUsedAt)}</span>
                    {key.expiresAt && (
                      <>
                        <span>·</span>
                        <span>expires {new Date(key.expiresAt).toLocaleDateString("en-GB")}</span>
                      </>
                    )}
                  </div>
                </div>
                {key.isActive && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void revoke(key.id, key.name)}
                    disabled={revoking === key.id}
                    className="shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    {revoking === key.id ? "Revoking…" : "Revoke"}
                  </Button>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* How to use */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">How to use</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">Add this header to any request to your API:</p>
          <pre className="rounded-md bg-muted p-3 text-xs overflow-x-auto">
{`Authorization: Bearer cms_live_<your-key>
Content-Type: application/json`}
          </pre>
          <p className="text-muted-foreground">Example: create a case from n8n / curl:</p>
          <pre className="rounded-md bg-muted p-3 text-xs overflow-x-auto">
{`curl -X POST https://support.thedungeonmerch.com/api/cases \\
  -H "Authorization: Bearer cms_live_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"Refund request","priority":"HIGH","source":"API"}'`}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
