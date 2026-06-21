"use client";

import Link from "next/link";
import { useState, useMemo, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  CalendarDays,
  UserCircle2,
  Search,
  X,
  CheckSquare,
  Tag,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { CasePriorityBadge } from "@/components/cases/CasePriorityBadge";
import { CaseStatusBadge } from "@/components/cases/CaseStatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import type { CaseListItem } from "@/types";

const STATUS_OPTIONS = [
  "OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER", "WAITING_ON_THIRD_PARTY",
  "RESOLVED", "CLOSED", "CANCELLED",
];
const PRIORITY_OPTIONS = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const PAGE_SIZE = 20;

type Props = {
  items: CaseListItem[];
};

export function CaseListClient({ items }: Props) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((item) => {
      if (q && !item.title.toLowerCase().includes(q) && !item.caseNumber.toLowerCase().includes(q)) return false;
      if (statusFilter && item.status !== statusFilter) return false;
      if (priorityFilter && item.priority !== priorityFilter) return false;
      return true;
    });
  }, [items, search, statusFilter, priorityFilter]);

  // Pagination — 20 per page, computed off the filtered set.
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  // Jump back to page 1 whenever the filtered set changes.
  useEffect(() => { setPage(1); }, [search, statusFilter, priorityFilter]);

  const allSelected = paged.length > 0 && paged.every((i) => selected.has(i.id));
  const someSelected = selected.size > 0;

  // Toggle selection for the rows visible on the current page.
  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (paged.every((i) => next.has(i.id))) paged.forEach((i) => next.delete(i.id));
      else paged.forEach((i) => next.add(i.id));
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearFilters() {
    setSearch("");
    setStatusFilter("");
    setPriorityFilter("");
  }

  const hasFilters = !!(search || statusFilter || priorityFilter);

  async function bulkUpdate(payload: Record<string, unknown>, label: string) {
    setBulkLoading(true);
    const ids = Array.from(selected);
    await Promise.all(
      ids.map((id) =>
        fetch(`/api/cases/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
      ),
    );
    setBulkLoading(false);
    setSelected(new Set());
    toast.success(`${ids.length} case${ids.length > 1 ? "s" : ""} ${label}`);
    // Trigger a page refresh to reflect changes
    window.location.reload();
  }

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title or case number…"
            className="h-9 pl-8 text-sm"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm focus:ring-2 focus:ring-primary/40 sm:flex-none"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
          ))}
        </select>

        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm focus:ring-2 focus:ring-primary/40 sm:flex-none"
        >
          <option value="">All priorities</option>
          {PRIORITY_OPTIONS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        {hasFilters && (
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={clearFilters}>
            <X className="h-3.5 w-3.5" />
            Clear
          </Button>
        )}

        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} of {items.length} cases
        </span>
      </div>

      {/* Bulk Actions Bar */}
      {someSelected && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5">
          <CheckSquare className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-medium text-primary">
            {selected.size} selected
          </span>
          <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
            {bulkLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              disabled={bulkLoading}
              onClick={() => void bulkUpdate({ status: "IN_PROGRESS" }, "marked In Progress")}
            >
              Mark In Progress
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              disabled={bulkLoading}
              onClick={() => void bulkUpdate({ status: "RESOLVED" }, "resolved")}
            >
              Resolve
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              disabled={bulkLoading}
              onClick={() => void bulkUpdate({ status: "CLOSED" }, "closed")}
            >
              Close
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground sm:ml-0 ml-auto"
              disabled={bulkLoading}
              onClick={() => setSelected(new Set())}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            {hasFilters ? (
              <>
                <Tag className="h-10 w-10 text-muted-foreground/30" />
                <p className="text-sm font-medium text-muted-foreground">No cases match your filters</p>
                <Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button>
              </>
            ) : (
              <>
                <AlertCircle className="h-10 w-10 text-muted-foreground/30" />
                <p className="text-sm font-medium text-muted-foreground">No cases found</p>
                <p className="text-xs text-muted-foreground/70">Create a new case to get started.</p>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {/* Select-all row */}
          <div className="flex items-center gap-3 px-1">
            <Checkbox
              checked={allSelected}
              onCheckedChange={toggleAll}
              aria-label="Select all"
              className="opacity-60 hover:opacity-100"
            />
            <span className="text-xs text-muted-foreground">Select all visible</span>
          </div>

          {paged.map((item) => (
            <div key={item.id} className="group flex items-start gap-3">
              <div className="pt-4 pl-1">
                <Checkbox
                  checked={selected.has(item.id)}
                  onCheckedChange={() => toggleOne(item.id)}
                  aria-label={`Select case ${item.caseNumber}`}
                  className="opacity-0 group-hover:opacity-100 data-[state=checked]:opacity-100 transition-opacity"
                />
              </div>

              <Link href={`/cases/${item.id}`} className="min-w-0 flex-1 block">
                <Card className="border transition-all duration-200 hover:-translate-y-px hover:border-primary/30 hover:shadow-md hover:shadow-primary/5">
                  <CardContent className="py-4 px-4 sm:px-5">
                    <div className="flex items-start gap-3 sm:gap-4">
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
                              style={
                                tag.color
                                  ? {
                                      backgroundColor: `${tag.color}20`,
                                      color: tag.color,
                                      borderColor: `${tag.color}40`,
                                    }
                                  : undefined
                              }
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
                              Due {new Date(item.dueDate).toLocaleDateString("en-GB")}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <CaseStatusBadge status={item.status} />
                        <CasePriorityBadge priority={item.priority} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </div>
          ))}

          {/* Pagination */}
          {pageCount > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
              <span className="text-xs text-muted-foreground">
                Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  disabled={currentPage === 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  Prev
                </Button>
                {Array.from({ length: pageCount }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === pageCount || Math.abs(p - currentPage) <= 1)
                  .map((p, idx, arr) => (
                    <span key={p} className="flex items-center">
                      {idx > 0 && arr[idx - 1] !== p - 1 && (
                        <span className="px-1 text-muted-foreground">…</span>
                      )}
                      <button
                        onClick={() => setPage(p)}
                        className={`h-8 min-w-[2rem] rounded-md px-2 text-xs transition-colors ${
                          p === currentPage
                            ? "bg-primary text-primary-foreground"
                            : "border hover:bg-muted"
                        }`}
                      >
                        {p}
                      </button>
                    </span>
                  ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  disabled={currentPage === pageCount}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
