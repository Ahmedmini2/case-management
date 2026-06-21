"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

const COLORS = [
  "#6366f1", // indigo
  "#f59e0b", // amber
  "#10b981", // emerald
  "#ef4444", // red
  "#8b5cf6", // violet
  "#0ea5e9", // sky
  "#6b7280", // gray
];

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  WAITING_ON_CUSTOMER: "Waiting – Customer",
  WAITING_ON_THIRD_PARTY: "Waiting – 3rd Party",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
};

export function StatusDistribution({
  data,
}: {
  data: Array<{ status: string; count: number }>;
}) {
  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4 text-primary" />
          Cases by Status
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          {/* Chart */}
          <div className="h-48 w-48 shrink-0 min-w-0 sm:h-52 sm:w-52">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <PieChart>
                <Pie
                  data={data}
                  dataKey="count"
                  nameKey="status"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {data.map((entry, index) => (
                    <Cell
                      key={entry.status}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: "8px",
                    border: "none",
                    boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
                    fontSize: "12px",
                  }}
                  formatter={(value: number) => [
                    `${value} (${total > 0 ? Math.round((value / total) * 100) : 0}%)`,
                    "Cases",
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <div className="flex w-full flex-1 flex-col gap-2 min-w-0">
            {data.map((entry, index) => {
              const pct = total > 0 ? Math.round((entry.count / total) * 100) : 0;
              return (
                <div key={entry.status} className="flex items-center gap-2 min-w-0">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: COLORS[index % COLORS.length] }}
                  />
                  <span className="truncate text-xs text-muted-foreground">
                    {STATUS_LABELS[entry.status] ?? entry.status}
                  </span>
                  <span className="ml-auto shrink-0 text-xs font-semibold tabular-nums">
                    {entry.count}
                    <span className="ml-1 font-normal text-muted-foreground">({pct}%)</span>
                  </span>
                </div>
              );
            })}
            {!data.length && (
              <p className="text-xs text-muted-foreground">No data available.</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
