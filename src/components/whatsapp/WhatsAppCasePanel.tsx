"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ExternalLink, Loader2 } from "lucide-react";

type CaseData = {
  id: string;
  caseNumber: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assignedToId: string | null;
};

type Agent = { id: string; name: string | null; email: string };

const STATUS_COLORS: Record<string, string> = {
  OPEN: "#3b82f6",
  IN_PROGRESS: "#f59e0b",
  WAITING_ON_CUSTOMER: "#a855f7",
  WAITING_ON_THIRD_PARTY: "#a855f7",
  RESOLVED: "#10b981",
  CLOSED: "#6b7280",
  CANCELLED: "#ef4444",
};
const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: "#ef4444",
  HIGH: "#f59e0b",
  MEDIUM: "#3b82f6",
  LOW: "#6b7280",
};

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 999,
        background: `${color}22`,
        color,
        whiteSpace: "nowrap",
      }}
    >
      {label.replace(/_/g, " ")}
    </span>
  );
}

// Right-hand panel on the WhatsApp page showing the case linked to the open
// chat (if any), with inline assignee editing. Self-contained: fetches the case
// and the agent list itself. Hidden below the `lg` breakpoint so it doesn't
// crowd small screens.
export function WhatsAppCasePanel({ conversationId }: { conversationId: string }) {
  const [data, setData] = useState<CaseData | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [caseRes, usersRes] = await Promise.all([
        // Resolves the related case via the conversation's caseId OR the contact
        // behind the phone number — so it works even for chats that started in
        // WhatsApp and were never opened from a case page.
        fetch(`/api/whatsapp/conversations/${conversationId}/case`, { cache: "no-store" }),
        fetch("/api/users", { cache: "no-store" }),
      ]);
      const caseJson = (await caseRes.json()) as { data: { case: CaseData | null } | null };
      const usersJson = (await usersRes.json()) as { data: Agent[] | null };
      setData(caseJson.data?.case ?? null);
      setAgents(usersJson.data ?? []);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateAssignee(assignedToId: string) {
    if (!data) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/cases/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedToId: assignedToId || null }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        toast.error(json.error ?? "Failed to update assignee");
        return;
      }
      setData((prev) => (prev ? { ...prev, assignedToId: assignedToId || null } : prev));
      toast.success("Assignee updated");
    } catch {
      toast.error("Failed to update assignee");
    } finally {
      setSaving(false);
    }
  }

  // NOTE: display/flexDirection are intentionally NOT set here — an inline
  // `display` would override the `hidden lg:flex` class (inline styles win over
  // utilities) and force this desktop-only panel to render on mobile too.
  const panelStyle: React.CSSProperties = {
    width: 320,
    flexShrink: 0,
    borderLeft: "1px solid #1e1e1e",
    background: "#0a0a0a",
    overflowY: "auto",
  };

  return (
    <div className="hidden lg:flex lg:flex-col" style={panelStyle}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #1e1e1e" }}>
        <p style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>
          Related case
        </p>
      </div>

      {loading ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Loader2 className="animate-spin" style={{ width: 18, height: 18, color: "#555" }} />
        </div>
      ) : !data ? (
        <div style={{ padding: 16, fontSize: 12, color: "#666" }}>No case linked to this chat yet.</div>
      ) : (
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <span style={{ fontSize: 11, fontFamily: "monospace", color: "#888", background: "#1a1a1a", padding: "2px 6px", borderRadius: 4 }}>
              {data.caseNumber}
            </span>
            <h4 style={{ fontSize: 14, fontWeight: 600, color: "#fff", margin: "8px 0 0" }}>{data.title}</h4>
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Chip label={data.status} color={STATUS_COLORS[data.status] ?? "#6b7280"} />
            <Chip label={data.priority} color={PRIORITY_COLORS[data.priority] ?? "#6b7280"} />
          </div>

          {data.description && (
            <div>
              <p style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 4px" }}>
                Details
              </p>
              <p style={{ fontSize: 12, color: "#bbb", margin: 0, whiteSpace: "pre-wrap", maxHeight: 160, overflowY: "auto" }}>
                {data.description}
              </p>
            </div>
          )}

          <div>
            <p style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 4px" }}>
              Assigned agent
            </p>
            <div style={{ position: "relative" }}>
              <select
                value={data.assignedToId ?? ""}
                disabled={saving}
                onChange={(e) => void updateAssignee(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  background: "#1a1a1a",
                  border: "1px solid #2a2a2a",
                  borderRadius: 4,
                  color: "#fff",
                  fontSize: 12,
                  outline: "none",
                  cursor: saving ? "wait" : "pointer",
                }}
              >
                <option value="">Unassigned</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name ?? a.email}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <Link
            href={`/cases/${data.id}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: "#3b82f6",
              textDecoration: "none",
              marginTop: 2,
            }}
          >
            <ExternalLink style={{ width: 13, height: 13 }} />
            Open full case
          </Link>
        </div>
      )}
    </div>
  );
}
