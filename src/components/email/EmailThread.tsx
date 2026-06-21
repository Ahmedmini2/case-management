"use client";

import { useEffect, useState, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import { Mail, MailOpen, ArrowDown, ArrowUp, Inbox } from "lucide-react";
import { EmailComposer } from "@/components/email/EmailComposer";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type EmailItem = {
  id: string;
  subject: string;
  body: string;
  direction: "INBOUND" | "OUTBOUND";
  from: string;
  to: string[];
  status: string;
  createdAt: string;
};

export function EmailThread({ caseId }: { caseId: string }) {
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const res = await fetch(`/api/cases/${caseId}/emails`, { cache: "no-store" });
    const payload = (await res.json()) as { data: EmailItem[] | null };
    const list = payload.data ?? [];
    setEmails(list);
    // Auto-expand the latest email
    if (list.length > 0) {
      setExpanded(new Set([list[0].id]));
    }
  }, [caseId]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <EmailComposer caseId={caseId} onSent={load} />

      {emails.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <Inbox className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No emails yet</p>
          <p className="text-xs text-muted-foreground/70">Compose an email to start the conversation</p>
        </div>
      ) : (
        <div className="space-y-2">
          {emails.map((email) => {
            const isOpen = expanded.has(email.id);
            const isOutbound = email.direction === "OUTBOUND";

            return (
              <Card
                key={email.id}
                className={cn(
                  "overflow-hidden transition-all",
                  isOutbound ? "border-primary/20" : "border-border",
                )}
              >
                {/* Header row */}
                <button
                  onClick={() => toggleExpand(email.id)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                >
                  <div
                    className={cn(
                      "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                      isOutbound
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {isOutbound ? (
                      <ArrowUp className="h-3.5 w-3.5" />
                    ) : (
                      <ArrowDown className="h-3.5 w-3.5" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{email.subject}</p>
                      {email.status === "PENDING" && (
                        <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                          Queued
                        </span>
                      )}
                      {email.status === "SENT" && (
                        <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                          Sent
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {isOutbound
                        ? `To: ${email.to.join(", ")}`
                        : `From: ${email.from}`}
                      {" · "}
                      {formatDistanceToNow(new Date(email.createdAt), { addSuffix: true })}
                    </p>
                  </div>

                  <div className="shrink-0 text-muted-foreground">
                    {isOpen ? (
                      <MailOpen className="h-4 w-4" />
                    ) : (
                      <Mail className="h-4 w-4" />
                    )}
                  </div>
                </button>

                {/* Body */}
                {isOpen && (
                  <CardContent className="border-t bg-muted/20 px-4 pb-4 pt-3">
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
                      {email.body}
                    </p>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
