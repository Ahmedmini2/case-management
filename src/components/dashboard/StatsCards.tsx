import { Card, CardContent } from "@/components/ui/card";
import { Inbox, TrendingUp, Clock, CheckCircle2 } from "lucide-react";

const cardConfig = [
  {
    label: "Total Cases",
    key: "totalCases" as const,
    icon: Inbox,
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-950/40",
    border: "border-violet-200/60 dark:border-violet-800/40",
  },
  {
    label: "Open",
    key: "open" as const,
    icon: TrendingUp,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-950/40",
    border: "border-blue-200/60 dark:border-blue-800/40",
  },
  {
    label: "In Progress",
    key: "inProgress" as const,
    icon: Clock,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/40",
    border: "border-amber-200/60 dark:border-amber-800/40",
  },
  {
    label: "Closed / Resolved",
    key: "closed" as const,
    icon: CheckCircle2,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    border: "border-emerald-200/60 dark:border-emerald-800/40",
  },
];

export function StatsCards({
  totals,
}: {
  totals: { totalCases: number; open: number; inProgress: number; closed: number };
}) {
  return (
    <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cardConfig.map(({ label, key, icon: Icon, color, bg, border }) => (
        <Card
          key={key}
          className={`border ${border} shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5`}
        >
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  {label}
                </p>
                <p className="text-3xl font-bold tracking-tight">{totals[key].toLocaleString()}</p>
              </div>
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${bg}`}>
                <Icon className={`h-5 w-5 ${color}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
