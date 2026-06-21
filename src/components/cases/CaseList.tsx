import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { CalendarDays, UserCircle2 } from "lucide-react";
import { CasePriorityBadge } from "@/components/cases/CasePriorityBadge";
import { CaseStatusBadge } from "@/components/cases/CaseStatusBadge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { CaseListItem } from "@/types";

export function CaseList({ items }: { items: CaseListItem[] }) {
  if (!items.length) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <UserCircle2 className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">No cases found</p>
          <p className="text-xs text-muted-foreground/70">Create a new case to get started.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <Link key={item.id} href={`/cases/${item.id}`} className="group block">
          <Card className="border transition-all duration-200 hover:-translate-y-px hover:border-primary/30 hover:shadow-md hover:shadow-primary/5">
            <CardContent className="py-4 px-4 sm:px-5">
              <div className="flex items-start gap-3 sm:gap-4">
                {/* Left: info */}
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono font-medium text-muted-foreground">
                      {item.caseNumber}
                    </span>
                    {item.tags.slice(0, 3).map((tag) => (
                      <Badge
                        key={tag.id}
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0 h-4"
                        style={tag.color ? { backgroundColor: `${tag.color}20`, color: tag.color, borderColor: `${tag.color}40` } : undefined}
                      >
                        {tag.name}
                      </Badge>
                    ))}
                    {item.tags.length > 3 && (
                      <span className="text-[10px] text-muted-foreground">+{item.tags.length - 3} more</span>
                    )}
                  </div>
                  <p className="font-semibold leading-snug text-foreground group-hover:text-primary transition-colors truncate">
                    {item.title}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {item.assignedTo ? (
                      <span className="flex min-w-0 items-center gap-1">
                        <UserCircle2 className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{item.assignedTo.name ?? item.assignedTo.email}</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 italic opacity-60">
                        <UserCircle2 className="h-3.5 w-3.5 shrink-0" />
                        Unassigned
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                      {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                    </span>
                    {item.dueDate && (
                      <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                        Due {new Date(item.dueDate).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: badges */}
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <CaseStatusBadge status={item.status} />
                  <CasePriorityBadge priority={item.priority} />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
