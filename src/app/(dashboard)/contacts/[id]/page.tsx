import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CaseStatusBadge } from "@/components/cases/CaseStatusBadge";
import { CasePriorityBadge } from "@/components/cases/CasePriorityBadge";
import {
  ArrowLeft,
  Building2,
  Mail,
  Phone,
  FileText,
  Hash,
  Calendar,
  UserCircle2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

async function getContact(id: string) {
  return db.contact.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      company: true,
      avatarUrl: true,
      notes: true,
      createdAt: true,
      cases: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          caseNumber: true,
          title: true,
          status: true,
          priority: true,
          createdAt: true,
          assignedTo: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
}

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return null;

  const contact = await getContact(id);
  if (!contact) notFound();

  const initials = contact.name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link href="/contacts" className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          All Contacts
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Contact Profile */}
        <div className="space-y-4 lg:col-span-1">
          <Card className="shadow-sm">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center gap-3 text-center">
                <Avatar className="h-16 w-16 ring-4 ring-primary/10">
                  <AvatarFallback className="text-xl font-semibold bg-primary/10 text-primary">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h2 className="text-lg font-semibold">{contact.name}</h2>
                  {contact.company && (
                    <p className="text-sm text-muted-foreground">{contact.company}</p>
                  )}
                </div>
              </div>

              <div className="mt-6 space-y-3">
                {contact.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <a
                      href={`mailto:${contact.email}`}
                      className="min-w-0 truncate text-primary hover:underline"
                    >
                      {contact.email}
                    </a>
                  </div>
                )}
                {contact.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <a href={`tel:${contact.phone}`} className="hover:underline">
                      {contact.phone}
                    </a>
                  </div>
                )}
                {contact.company && (
                  <div className="flex items-center gap-2 text-sm">
                    <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>{contact.company}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4 shrink-0" />
                  <span>Added {formatDistanceToNow(contact.createdAt, { addSuffix: true })}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          {contact.notes && (
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  <FileText className="h-3.5 w-3.5" />
                  Notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{contact.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: Linked Cases */}
        <div className="lg:col-span-2">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Hash className="h-4 w-4 text-muted-foreground" />
                Cases
                <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {contact.cases.length}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {contact.cases.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <FileText className="h-8 w-8 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">No cases linked to this contact yet.</p>
                </div>
              ) : (
                <div className="divide-y">
                  {contact.cases.map((c) => (
                    <Link
                      key={c.id}
                      href={`/cases/${c.id}`}
                      className="flex items-start gap-3 py-3 transition-colors hover:bg-muted/40 rounded-lg px-2 -mx-2 group"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">
                            #{c.caseNumber}
                          </span>
                          <CaseStatusBadge status={c.status} />
                          <CasePriorityBadge priority={c.priority} />
                        </div>
                        <p className="mt-0.5 truncate text-sm font-medium group-hover:text-primary transition-colors">
                          {c.title}
                        </p>
                        <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <UserCircle2 className="h-3 w-3" />
                          <span>{c.assignedTo?.name ?? c.assignedTo?.email ?? "Unassigned"}</span>
                          <span className="mx-1">·</span>
                          <span>{formatDistanceToNow(c.createdAt, { addSuffix: true })}</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
