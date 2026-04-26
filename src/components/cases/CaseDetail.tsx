"use client";

import Link from "next/link";
import { CaseStatus, Priority } from "@/types/enums";
import { useEffect, useState, useCallback } from "react";
import { CasePriorityBadge } from "@/components/cases/CasePriorityBadge";
import { CaseStatusBadge } from "@/components/cases/CaseStatusBadge";
import { CaseTimeline } from "@/components/cases/CaseTimeline";
import { CaseWatchers } from "@/components/cases/CaseWatchers";
import { FileUploader } from "@/components/cases/FileUploader";
import { SlaTimer } from "@/components/cases/SlaTimer";
import { CommentEditor } from "@/components/comments/CommentEditor";
import { CommentList } from "@/components/comments/CommentList";
import { EmailThread } from "@/components/email/EmailThread";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Hash, UserCircle2, FileText, Paperclip, Loader2, Mail, Phone, Building2, User } from "lucide-react";

type CaseDetailData = {
  id: string;
  caseNumber: string;
  title: string;
  description: string | null;
  status: Parameters<typeof CaseStatusBadge>[0]["status"];
  priority: Parameters<typeof CasePriorityBadge>[0]["priority"];
  dueDate: string | null;
  slaBreachedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  comments: Array<{
    id: string;
    body: string;
    isInternal: boolean;
    createdAt: string;
    author: { name: string | null; email: string | null };
  }>;
  activities: Array<{
    id: string;
    description: string;
    createdAt: string;
    user: { name: string | null } | null;
  }>;
  assignedTo: { id: string; name: string | null; email: string | null; image?: string | null } | null;
  contact?: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    company: string | null;
  } | null;
};

function CaseDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-4 w-24 mt-1" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Skeleton className="h-10 rounded-md" />
            <Skeleton className="h-10 rounded-md" />
          </div>
          <Skeleton className="h-20 rounded-md" />
        </CardContent>
      </Card>
      <Skeleton className="h-10 w-64 rounded-lg" />
    </div>
  );
}

type UserOption = { id: string; name: string | null; email: string | null; image?: string | null; role: string };

export function CaseDetail({
  caseId,
  currentUserId,
  initialData,
  initialUsers,
}: {
  caseId: string;
  currentUserId: string;
  initialData?: CaseDetailData | null;
  initialUsers?: UserOption[];
}) {
  const [item, setItem] = useState<CaseDetailData | null>(initialData ?? null);
  const [users, setUsers] = useState<UserOption[]>(initialUsers ?? []);
  const [loading, setLoading] = useState(!initialData);
  const [updating, setUpdating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(`/api/cases/${caseId}`, { cache: "no-store" });
    const result = (await response.json()) as { data: CaseDetailData | null };
    setItem(result.data);
    setLoading(false);
  }, [caseId]);

  useEffect(() => {
    if (!initialData) void load();
  }, [caseId, initialData, load]);

  useEffect(() => {
    if (initialUsers && initialUsers.length > 0) return;
    async function loadUsers() {
      const response = await fetch("/api/users");
      const result = (await response.json()) as { data: UserOption[] | null };
      setUsers(result.data ?? []);
    }
    void loadUsers();
  }, [initialUsers]);

  async function assignUser(userId: string) {
    if (!item) return;
    const nextAssignee = userId
      ? users.find((u) => u.id === userId) ?? null
      : null;
    await updateCase(
      { assignedToId: userId || null },
      "Assignee updated.",
      (prev) => ({
        ...prev,
        assignedTo: nextAssignee
          ? { id: nextAssignee.id, name: nextAssignee.name, email: nextAssignee.email, image: nextAssignee.image ?? null }
          : null,
      }),
    );
  }

  async function updateCase(
    payload: Partial<{ assignedToId: string | null; status: CaseStatus; priority: Priority }>,
    successMessage: string,
    optimistic?: (prev: CaseDetailData) => CaseDetailData,
  ) {
    if (!item) return;
    const snapshot = item;
    const next = optimistic
      ? optimistic(item)
      : { ...item, ...(payload.status ? { status: payload.status } : {}), ...(payload.priority ? { priority: payload.priority } : {}) };
    setItem(next);
    setUpdating(true);
    try {
      const response = await fetch(`/api/cases/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const result = (await response.json()) as { error: string | null };
        setItem(snapshot);
        toast.error(result.error ?? "Failed to update case");
        return;
      }
      toast.success(successMessage);
    } catch (err) {
      setItem(snapshot);
      toast.error("Network error. Please try again.");
    } finally {
      setUpdating(false);
    }
  }

  function handleCommentCreated(
    created: CaseDetailData["comments"][number],
  ) {
    setItem((prev) => (prev ? { ...prev, comments: [created, ...prev.comments] } : prev));
  }

  if (loading) return <CaseDetailSkeleton />;

  if (!item) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <FileText className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">Case not found</p>
        </CardContent>
      </Card>
    );
  }

  const initials =
    (item.assignedTo?.name ?? "U")
      .split(" ")
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

  return (
    <div className="space-y-6">
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <CardTitle className="text-xl leading-snug">{item.title}</CardTitle>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Hash className="h-3 w-3" />
                <span className="font-mono">{item.caseNumber}</span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <CaseStatusBadge status={item.status} />
              <CasePriorityBadge priority={item.priority} />
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Status & Priority controls */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                Status
                {updating && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
              </p>
              <select
                className="h-9 w-full rounded-lg border bg-background px-3 text-sm ring-0 transition focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
                value={item.status}
                disabled={updating}
                onChange={(e) =>
                  void updateCase({ status: e.target.value as CaseStatus }, "Status updated.")
                }
              >
                {Object.values(CaseStatus).map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                Priority
                {updating && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
              </p>
              <select
                className="h-9 w-full rounded-lg border bg-background px-3 text-sm ring-0 transition focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
                value={item.priority}
                disabled={updating}
                onChange={(e) =>
                  void updateCase({ priority: e.target.value as Priority }, "Priority updated.")
                }
              >
                {Object.values(Priority).map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Assignee */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Assignee</p>
            <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
              <Avatar className="h-6 w-6">
                <AvatarImage src={item.assignedTo?.image ?? undefined} alt={item.assignedTo?.name ?? "Unassigned"} />
                <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                  {item.assignedTo ? initials : <UserCircle2 className="h-3.5 w-3.5" />}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm text-muted-foreground">
                {item.assignedTo?.name ?? "Unassigned"}
              </span>
            </div>
            <select
              className="h-9 w-full rounded-lg border bg-background px-3 text-sm focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
              value={item.assignedTo?.id ?? ""}
              disabled={updating}
              onChange={(e) => void assignUser(e.target.value)}
            >
              <option value="">Unassigned</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name ?? user.email} ({user.role})
                </option>
              ))}
            </select>
          </div>

          {/* Contact / customer details */}
          {item.contact && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <UserCircle2 className="h-3.5 w-3.5" />
                Customer
              </p>
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium">{item.contact.name}</span>
                  {item.contact.company && (
                    <>
                      <span className="text-muted-foreground/40">·</span>
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Building2 className="h-3 w-3" />
                        {item.contact.company}
                      </span>
                    </>
                  )}
                </div>
                {item.contact.email && (
                  <a
                    href={`mailto:${item.contact.email}`}
                    className="flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    {item.contact.email}
                  </a>
                )}
                {item.contact.phone && (
                  <a
                    href={`tel:${item.contact.phone}`}
                    className="flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                    {item.contact.phone}
                  </a>
                )}
                <div className="pt-1 border-t border-border/40">
                  <Link
                    href={`/contacts/${item.contact.id}`}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    View contact profile →
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Description */}
          {item.description ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</p>
              <div className="rounded-lg bg-muted/30 px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
                {item.description}
              </div>
            </div>
          ) : (
            <p className="text-sm italic text-muted-foreground/60">No description provided.</p>
          )}

          {/* SLA Timer */}
          {item.dueDate && (
            <>
              <Separator />
              <SlaTimer
                dueDate={item.dueDate}
                slaBreachedAt={item.slaBreachedAt}
                resolvedAt={item.resolvedAt}
                closedAt={item.closedAt}
              />
            </>
          )}

          <Separator />

          {/* Watchers */}
          <CaseWatchers caseId={item.id} currentUserId={currentUserId} />
        </CardContent>
      </Card>

      <Tabs defaultValue="activity">
        <TabsList className="h-10 rounded-xl bg-muted/60 p-1">
          <TabsTrigger value="activity" className="rounded-lg px-4 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm">
            Activity
          </TabsTrigger>
          <TabsTrigger value="comments" className="rounded-lg px-4 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm">
            Comments
            {item.comments.length > 0 && (
              <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                {item.comments.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="emails" className="rounded-lg px-4 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm">
            Emails
          </TabsTrigger>
          <TabsTrigger value="attachments" className="rounded-lg px-4 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Paperclip className="mr-1.5 h-3.5 w-3.5" />
            Attachments
          </TabsTrigger>
        </TabsList>
        <TabsContent value="activity" className="mt-4">
          <CaseTimeline items={item.activities} />
        </TabsContent>
        <TabsContent value="comments" className="mt-4 space-y-4">
          <CommentEditor caseId={item.id} onCreated={handleCommentCreated} />
          <CommentList comments={item.comments} />
        </TabsContent>
        <TabsContent value="emails" className="mt-4">
          <EmailThread caseId={item.id} />
        </TabsContent>
        <TabsContent value="attachments" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <FileUploader caseId={item.id} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
