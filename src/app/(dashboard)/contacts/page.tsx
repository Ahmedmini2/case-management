"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import {
  Building2,
  Mail,
  Plus,
  Users,
  Search,
  Tag,
  X,
  Loader2,
  Phone,
} from "lucide-react";

type Contact = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  tags: string[];
  _count: { cases: number };
};

type TagSummary = { name: string; memberCount: number };

type Tab = "all" | "segments";

export default function ContactsPage() {
  const [tab, setTab] = useState<Tab>("all");

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [tags, setTags] = useState<TagSummary[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [loadingTags, setLoadingTags] = useState(false);

  // Filters (All tab)
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);

  // New contact dialog
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [newTags, setNewTags] = useState("");
  const [open, setOpen] = useState(false);

  // Debounce search input
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(id);
  }, [search]);

  const loadContacts = useCallback(async () => {
    setLoadingContacts(true);
    try {
      const qs = new URLSearchParams();
      if (debouncedSearch) qs.set("search", debouncedSearch);
      if (activeTags.length > 0) qs.set("tags", activeTags.join(","));
      const res = await fetch(`/api/contacts?${qs.toString()}`);
      const json = (await res.json()) as { data: Contact[] | null };
      setContacts(json.data ?? []);
    } catch {
      /* silent */
    }
    setLoadingContacts(false);
  }, [debouncedSearch, activeTags]);

  const loadTags = useCallback(async () => {
    setLoadingTags(true);
    try {
      const res = await fetch("/api/contacts/tags");
      const json = (await res.json()) as { data: { tags: TagSummary[] } | null };
      setTags(json.data?.tags ?? []);
    } catch {
      /* silent */
    }
    setLoadingTags(false);
  }, []);

  useEffect(() => { void loadContacts(); }, [loadContacts]);
  useEffect(() => { void loadTags(); }, [loadTags]);

  async function createContact() {
    if (!name.trim()) return;
    const tagList = newTags
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    const response = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        company: company.trim() || undefined,
        tags: tagList.length > 0 ? tagList : undefined,
      }),
    });
    if (!response.ok) {
      toast.error("Failed to add contact");
      return;
    }
    setName("");
    setEmail("");
    setPhone("");
    setCompany("");
    setNewTags("");
    await Promise.all([loadContacts(), loadTags()]);
    setOpen(false);
    toast.success("Contact added.");
  }

  function toggleTag(tag: string) {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

  function pickSegment(tag: string) {
    setActiveTags([tag]);
    setSearch("");
    setTab("all");
  }

  const visibleContacts = contacts;

  const totalsByTag = useMemo(() => new Map(tags.map((t) => [t.name, t.memberCount])), [tags]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold sm:text-xl">Contacts</h1>
            <p className="truncate text-xs text-muted-foreground">
              {contacts.length} {tab === "all" ? "shown" : "total"} · {tags.length} segment{tags.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="shrink-0 gap-2">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Add Contact</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Contact</DialogTitle>
              <DialogDescription>Create a customer or contact profile.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Name *</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full name"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Email</label>
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@example.com"
                  type="email"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Phone</label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 555 000 0000"
                  type="tel"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Company</label>
                <Input
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Company name"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Segments / tags</label>
                <Input
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  placeholder="purchased, vip, newsletter"
                />
                <p className="text-[10px] text-muted-foreground/70">Comma-separated. Lowercased automatically.</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => void createContact()} disabled={!name.trim()}>
                Save Contact
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Tabs */}
      <div className="inline-flex rounded-lg border bg-background p-0.5 text-sm">
        <button
          type="button"
          onClick={() => setTab("all")}
          className={`flex items-center gap-2 rounded-md px-4 py-1.5 transition-colors ${
            tab === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
          }`}
        >
          <Users className="h-3.5 w-3.5" />
          All Contacts
        </button>
        <button
          type="button"
          onClick={() => setTab("segments")}
          className={`flex items-center gap-2 rounded-md px-4 py-1.5 transition-colors ${
            tab === "segments" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
          }`}
        >
          <Tag className="h-3.5 w-3.5" />
          Segments
          {tags.length > 0 && (
            <span className={`rounded-full px-1.5 text-[10px] font-bold ${
              tab === "segments" ? "bg-primary-foreground/20" : "bg-muted-foreground/15"
            }`}>
              {tags.length}
            </span>
          )}
        </button>
      </div>

      {tab === "all" && (
        <>
          {/* Search + tag filter chips */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email, phone, or company..."
                className="pl-9"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-1">
                  Segments:
                </span>
                {tags.map((t) => {
                  const active = activeTags.includes(t.name);
                  return (
                    <button
                      key={t.name}
                      type="button"
                      onClick={() => toggleTag(t.name)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                        active
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted-foreground/15"
                      }`}
                    >
                      <Tag className="h-2.5 w-2.5" />
                      {t.name}
                      <span className={`rounded px-1 text-[9px] ${
                        active ? "bg-primary-foreground/25" : "bg-background/50"
                      }`}>
                        {t.memberCount}
                      </span>
                    </button>
                  );
                })}
                {activeTags.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTags([])}
                    className="ml-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-2.5 w-2.5" /> Clear filter
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Contact list */}
          {loadingContacts ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : visibleContacts.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
              <Users className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm font-medium text-muted-foreground">
                {debouncedSearch || activeTags.length > 0 ? "No contacts match your filters" : "No contacts yet"}
              </p>
              <p className="text-xs text-muted-foreground/70">
                {debouncedSearch || activeTags.length > 0 ? "Try a different search or remove filters" : "Add your first contact to get started"}
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visibleContacts.map((contact) => {
                const initials = contact.name
                  .split(" ")
                  .map((p) => p[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase();

                return (
                  <Link
                    key={contact.id}
                    href={`/contacts/${contact.id}`}
                    className="group flex flex-col gap-2 rounded-xl border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-sm"
                  >
                    <div className="flex items-start gap-3">
                      <Avatar className="h-10 w-10 shrink-0 ring-2 ring-background">
                        <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-sm group-hover:text-primary transition-colors">
                          {contact.name}
                        </p>
                        {contact.email && (
                          <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                            <Mail className="h-3 w-3 shrink-0" />
                            <span className="truncate">{contact.email}</span>
                          </div>
                        )}
                        {contact.phone && (
                          <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                            <Phone className="h-3 w-3 shrink-0" />
                            <span className="truncate font-mono">{contact.phone}</span>
                          </div>
                        )}
                        {contact.company && (
                          <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                            <Building2 className="h-3 w-3 shrink-0" />
                            <span className="truncate">{contact.company}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {contact.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {contact.tags.map((t) => (
                          <span
                            key={t}
                            className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[10px]"
                          >
                            <Tag className="h-2 w-2" />
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground/70">
                      {contact._count.cases} {contact._count.cases === 1 ? "case" : "cases"}
                    </p>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === "segments" && (
        <>
          {loadingTags ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : tags.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
              <Tag className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm font-medium text-muted-foreground">No segments yet</p>
              <p className="text-xs text-muted-foreground/70 max-w-xs">
                Tag contacts to group them. Tags can also be created from the Broadcast flow by uploading a CSV and clicking &quot;Save segment&quot;.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {tags.map((t) => (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => pickSegment(t.name)}
                  className="group flex flex-col items-start gap-2 rounded-xl border bg-card p-4 text-left transition-all hover:border-primary/40 hover:shadow-sm"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                    <Tag className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold text-sm truncate max-w-full group-hover:text-primary transition-colors">
                      {t.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {totalsByTag.get(t.name) ?? t.memberCount} contact{t.memberCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
