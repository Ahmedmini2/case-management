import Link from "next/link";
import { AgentPerformance } from "@/components/dashboard/AgentPerformance";
import { CasesOverTime } from "@/components/dashboard/CasesOverTime";
import { SLAWidget } from "@/components/dashboard/SLAWidget";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { StatusDistribution } from "@/components/dashboard/StatusDistribution";
import { Card, CardContent } from "@/components/ui/card";
import { getReportsData } from "@/lib/reports";
import {
  BarChart3, AlertTriangle, MessageCircle, Bot, Users, BellRing,
  Radio, Send, CheckCircle2, XCircle, Eye, Target,
} from "lucide-react";

type BroadcastRow = {
  id: string;
  name: string;
  status: string;
  totalCount: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  failedCount: number;
  createdAt: string;
  completedAt: string | null;
};

type ReportsResponse = {
  totals: { totalCases: number; open: number; inProgress: number; closed: number };
  whatsapp: { total: number; ai: number; human: number; unread: number };
  broadcast: {
    totalBroadcasts: number;
    totalRecipients: number;
    totalSent: number;
    totalDelivered: number;
    totalRead: number;
    totalFailed: number;
    deliveryRate: number;
    readRate: number;
    recentBroadcasts: BroadcastRow[];
  };
  byStatus: Array<{ status: string; count: number }>;
  casesOverTime: Array<{ date: string; count: number }>;
  slaComplianceRate: number;
  agentPerformance: Array<{
    agentId: string;
    agentName: string;
    assignedCount: number;
    resolvedCount: number;
    avgResolutionHours: number;
  }>;
};

async function getReportData(): Promise<ReportsResponse> {
  return (await getReportsData({ range: "30d" })) as ReportsResponse;
}

export default async function ReportsPage() {
  try {
    const report = await getReportData();
    return (
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold tracking-tight sm:text-xl">Reports</h1>
              <p className="truncate text-xs text-muted-foreground">Last 30 days · Auto-refreshed</p>
            </div>
          </div>
          <Link
            href="/api/export/reports"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Export CSV
          </Link>
        </div>

        {/* Stats */}
        <StatsCards totals={report.totals} />

        {/* WhatsApp stats */}
        <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 md:grid-cols-4">
          {[
            { label: "WhatsApp Chats", value: report.whatsapp.total, icon: MessageCircle, color: "text-green-500", bg: "bg-green-950/40", border: "border-green-800/40" },
            { label: "AI Handling", value: report.whatsapp.ai, icon: Bot, color: "text-blue-400", bg: "bg-blue-950/40", border: "border-blue-800/40" },
            { label: "Human Handling", value: report.whatsapp.human, icon: Users, color: "text-purple-400", bg: "bg-purple-950/40", border: "border-purple-800/40" },
            { label: "Unread", value: report.whatsapp.unread, icon: BellRing, color: "text-amber-400", bg: "bg-amber-950/40", border: "border-amber-800/40" },
          ].map(({ label, value, icon: Icon, color, bg, border }) => (
            <Card key={label} className={`border ${border} shadow-sm`}>
              <CardContent className="pt-5 pb-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
                    <p className="text-3xl font-bold tracking-tight">{value}</p>
                  </div>
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${bg}`}>
                    <Icon className={`h-5 w-5 ${color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Broadcast Report */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-green-500" />
            <h2 className="text-sm font-bold uppercase tracking-wide">WhatsApp Broadcasts</h2>
          </div>

          {/* Broadcast stat cards */}
          <div className="grid gap-3 grid-cols-2 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
            {[
              { label: "Broadcasts", value: report.broadcast.totalBroadcasts, icon: Radio, color: "text-green-500", bg: "bg-green-500/10" },
              { label: "Total Sent", value: report.broadcast.totalSent, icon: Send, color: "text-blue-400", bg: "bg-blue-500/10" },
              { label: "Delivered", value: report.broadcast.totalDelivered, icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10" },
              { label: "Read", value: report.broadcast.totalRead, icon: Eye, color: "text-purple-400", bg: "bg-purple-500/10" },
              { label: "Failed", value: report.broadcast.totalFailed, icon: XCircle, color: "text-red-400", bg: "bg-red-500/10" },
              { label: "Delivery Rate", value: `${report.broadcast.deliveryRate}%`, icon: Target, color: "text-amber-400", bg: "bg-amber-500/10" },
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <Card key={label} className="shadow-sm">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${bg}`}>
                      <Icon className={`h-4 w-4 ${color}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
                      <p className="text-xl font-bold">{typeof value === "number" ? value.toLocaleString() : value}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Recent broadcasts table */}
          {report.broadcast.recentBroadcasts.length > 0 && (
            <Card className="shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b">
                <h3 className="text-sm font-semibold">Recent Broadcasts</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-5 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Name</th>
                      <th className="text-left px-5 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Status</th>
                      <th className="text-center px-5 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Recipients</th>
                      <th className="text-center px-5 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Sent</th>
                      <th className="text-center px-5 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Delivered</th>
                      <th className="text-center px-5 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Read</th>
                      <th className="text-center px-5 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Failed</th>
                      <th className="text-right px-5 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Delivery %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.broadcast.recentBroadcasts.map((b) => {
                      const delivPct = b.sentCount > 0 ? Math.round((b.deliveredCount / b.sentCount) * 100) : 0;
                      const statusColor = b.status === "COMPLETED" ? "text-emerald-500" : b.status === "SENDING" ? "text-amber-400" : b.status === "FAILED" ? "text-red-400" : "text-muted-foreground";
                      return (
                        <tr key={b.id} className="border-t hover:bg-muted/30">
                          <td className="px-5 py-3 font-medium">
                            <Link href="/broadcast" className="hover:text-primary transition-colors">{b.name}</Link>
                          </td>
                          <td className="px-5 py-3">
                            <span className={`text-xs font-medium ${statusColor}`}>
                              {b.status.charAt(0) + b.status.slice(1).toLowerCase()}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-center">{b.totalCount.toLocaleString()}</td>
                          <td className="px-5 py-3 text-center text-blue-400 font-medium">{b.sentCount.toLocaleString()}</td>
                          <td className="px-5 py-3 text-center text-emerald-400 font-medium">{b.deliveredCount.toLocaleString()}</td>
                          <td className="px-5 py-3 text-center text-purple-400 font-medium">{b.readCount.toLocaleString()}</td>
                          <td className="px-5 py-3 text-center text-red-400 font-medium">{b.failedCount.toLocaleString()}</td>
                          <td className="px-5 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-emerald-500 transition-all"
                                  style={{ width: `${delivPct}%` }}
                                />
                              </div>
                              <span className="text-xs font-medium w-8 text-right">{delivPct}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>

        {/* Charts row */}
        <div className="grid gap-6 xl:grid-cols-2">
          <StatusDistribution data={report.byStatus} />
          <CasesOverTime data={report.casesOverTime} />
        </div>

        {/* Bottom row */}
        <div className="grid gap-6 xl:grid-cols-3">
          <SLAWidget complianceRate={report.slaComplianceRate} />
          <div className="xl:col-span-2">
            <AgentPerformance rows={report.agentPerformance} />
          </div>
        </div>
      </div>
    );
  } catch {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Unable to load reports</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            There was a problem fetching report data. Please try again later.
          </p>
        </div>
      </div>
    );
  }
}
