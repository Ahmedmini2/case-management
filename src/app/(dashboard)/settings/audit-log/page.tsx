"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AuditRow = {
  id: string;
  action: string;
  resource: string;
  resourceId: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
  user: { id: string; name: string | null; email: string | null } | null;
};

function toCsv(rows: AuditRow[]) {
  const header = ["timestamp", "user", "action", "resource", "resourceId"];
  const lines = rows.map((row) =>
    [
      row.createdAt,
      row.user?.email ?? row.user?.name ?? "system",
      row.action,
      row.resource,
      row.resourceId ?? "",
    ].join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

export default function AuditLogPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [action, setAction] = useState("");

  async function load() {
    const query = action ? `?action=${encodeURIComponent(action)}` : "";
    const res = await fetch(`/api/audit-logs${query}`);
    const json = (await res.json()) as { data: AuditRow[] | null };
    setRows(json.data ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  function exportCsv() {
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "audit-log.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder="Filter by action..."
          className="w-full sm:w-auto sm:flex-1"
        />
        <Button onClick={load} className="flex-1 sm:flex-none">
          Filter
        </Button>
        <Button variant="outline" onClick={exportCsv} className="flex-1 sm:flex-none">
          Export CSV
        </Button>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="p-2">Timestamp</th>
              <th className="p-2">User</th>
              <th className="p-2">Action</th>
              <th className="p-2">Resource</th>
              <th className="p-2">Diff</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b align-top">
                <td className="p-2">{new Date(row.createdAt).toLocaleString()}</td>
                <td className="p-2">{row.user?.name ?? row.user?.email ?? "system"}</td>
                <td className="p-2">{row.action}</td>
                <td className="p-2">
                  {row.resource}
                  {row.resourceId ? ` (${row.resourceId})` : ""}
                </td>
                <td className="p-2 text-xs">
                  <pre className="max-w-xs whitespace-pre-wrap break-words">{JSON.stringify({ before: row.before, after: row.after }, null, 2)}</pre>
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td className="p-2 text-muted-foreground" colSpan={5}>
                  No audit rows found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
