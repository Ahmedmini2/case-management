"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";
import {
  Send, Upload, Plus, Trash2, Play, CheckCircle2, XCircle, Clock,
  Loader2, FileSpreadsheet, Users, ArrowLeft, X, Phone, AlertCircle,
  Radio, RefreshCw, FileText, Sparkles,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  TYPES                                                              */
/* ------------------------------------------------------------------ */

type HeaderType = "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";

type TemplateButton =
  | { type: "QUICK_REPLY"; text: string }
  | { type: "URL"; text: string; url: string }
  | { type: "PHONE_NUMBER"; text: string; phone: string };

interface Template {
  id: string;
  metaId: string | null;
  name: string;
  language: string;
  category: string;
  status: string;
  body: string;
  header: string | null;
  headerType: HeaderType | null;
  headerMediaUrl: string | null;
  footer: string | null;
  buttons: TemplateButton[] | null;
  variableCount: number;
  createdAt: string;
}

interface Broadcast {
  id: string;
  name: string;
  message: string;
  templateId: string | null;
  status: string;
  totalCount: number;
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
  readCount: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  template?: { id: string; name: string; status: string } | null;
}

interface Recipient {
  id: string;
  phone: string;
  contactName: string | null;
  status: string;
  error: string | null;
  sentAt: string | null;
}

type View = "list" | "create" | "detail" | "templates";

/* ------------------------------------------------------------------ */
/*  HELPERS                                                            */
/* ------------------------------------------------------------------ */

function statusCfg(s: string) {
  switch (s) {
    case "DRAFT": return { label: "Draft", color: "#888", bg: "#88888815" };
    case "SENDING": return { label: "Sending", color: "#f59e0b", bg: "#f59e0b15" };
    case "COMPLETED": return { label: "Completed", color: "#10b981", bg: "#10b98115" };
    case "FAILED": return { label: "Failed", color: "#ef4444", bg: "#ef444415" };
    case "APPROVED": return { label: "Approved", color: "#10b981", bg: "#10b98115" };
    case "PENDING": return { label: "Pending Review", color: "#f59e0b", bg: "#f59e0b15" };
    case "REJECTED": return { label: "Rejected", color: "#ef4444", bg: "#ef444415" };
    default: return { label: s, color: "#888", bg: "#88888815" };
  }
}

function parseCSV(text: string): { phone: string; contactName?: string }[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const results: { phone: string; contactName?: string }[] = [];
  for (const line of lines) {
    const parts = line.split(/[,;\t]/).map((s) => s.trim().replace(/^["']|["']$/g, ""));
    if (!parts[0] || /phone|number|mobile|tel/i.test(parts[0])) continue;
    const phone = parts[0].replace(/[^+\d]/g, "");
    if (phone.length < 7) continue;
    results.push({ phone: phone.startsWith("+") ? phone : `+${phone}`, contactName: parts[1] || undefined });
  }
  return results;
}

function Badge({ status }: { status: string }) {
  const c = statusCfg(status);
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: c.bg, color: c.color }}>
      {c.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  COMPONENT                                                          */
/* ------------------------------------------------------------------ */

export default function BroadcastPage() {
  const [view, setView] = useState<View>("list");
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  // Detail
  const [activeBroadcast, setActiveBroadcast] = useState<(Broadcast & { recipients: Recipient[] }) | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [recipientFilter, setRecipientFilter] = useState("all");

  // Create form
  const [formName, setFormName] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateVars, setTemplateVars] = useState<Record<string, string>>({});
  const [formRecipients, setFormRecipients] = useState<{ phone: string; contactName?: string }[]>([]);
  const [manualPhone, setManualPhone] = useState("");
  const [manualName, setManualName] = useState("");
  const [creating, setCreating] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);

  // Schedule for create form
  const [formScheduledAt, setFormScheduledAt] = useState("");

  // Template create form
  const [tplName, setTplName] = useState("");
  const [tplCategory, setTplCategory] = useState("MARKETING");
  const [tplLang, setTplLang] = useState("en");
  const [tplBody, setTplBody] = useState("");
  const [tplHeaderType, setTplHeaderType] = useState<HeaderType>("TEXT");
  const [tplHeader, setTplHeader] = useState("");
  const [tplHeaderMediaUrl, setTplHeaderMediaUrl] = useState("");
  const [tplHeaderMediaHandle, setTplHeaderMediaHandle] = useState("");
  const [tplHeaderUploading, setTplHeaderUploading] = useState(false);
  const tplHeaderInputRef = useRef<HTMLInputElement>(null);
  const [tplFooter, setTplFooter] = useState("");
  const [tplButtons, setTplButtons] = useState<TemplateButton[]>([]);
  const [tplCreating, setTplCreating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showTplForm, setShowTplForm] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) ?? null;

  /* ---- Loaders ---- */
  const loadBroadcasts = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/broadcasts");
      const json = (await res.json()) as { data: Broadcast[] | null };
      setBroadcasts(json.data ?? []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/templates");
      const json = (await res.json()) as { data: Template[] | null };
      setTemplates(json.data ?? []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { void loadBroadcasts(); void loadTemplates(); }, [loadBroadcasts, loadTemplates]);

  // Poll while sending
  useEffect(() => {
    if (!broadcasts.some((b) => b.status === "SENDING")) return;
    const id = setInterval(() => void loadBroadcasts(), 3000);
    return () => clearInterval(id);
  }, [broadcasts, loadBroadcasts]);

  // Poll detail while sending
  useEffect(() => {
    if (!activeBroadcast || activeBroadcast.status !== "SENDING") return;
    const id = setInterval(async () => {
      const res = await fetch(`/api/whatsapp/broadcasts/${activeBroadcast.id}`);
      const json = (await res.json()) as { data: (Broadcast & { recipients: Recipient[] }) | null };
      if (json.data) setActiveBroadcast(json.data);
    }, 3000);
    return () => clearInterval(id);
  }, [activeBroadcast]);

  /* ---- Actions ---- */
  async function openDetail(id: string) {
    setDetailLoading(true); setView("detail");
    try {
      const res = await fetch(`/api/whatsapp/broadcasts/${id}`);
      const json = (await res.json()) as { data: (Broadcast & { recipients: Recipient[] }) | null };
      setActiveBroadcast(json.data ?? null);
    } catch { toast.error("Failed to load"); }
    setDetailLoading(false);
  }

  async function syncTemplates() {
    setSyncing(true);
    try {
      const res = await fetch("/api/whatsapp/templates/sync", { method: "POST" });
      const json = (await res.json()) as { data?: { synced: number }; error?: string };
      if (!res.ok) { toast.error(json.error ?? "Sync failed"); } else {
        toast.success(`Synced ${json.data?.synced ?? 0} templates from Meta`);
        await loadTemplates();
      }
    } catch { toast.error("Sync failed"); }
    setSyncing(false);
  }

  async function uploadTplHeaderMedia(file: File, headerType: Exclude<HeaderType, "TEXT">) {
    setTplHeaderUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("headerType", headerType);
      const res = await fetch("/api/whatsapp/templates/upload-header", { method: "POST", body: form });
      const json = (await res.json()) as { data: { url?: string; handle?: string } | null; error: string | null };
      if (!res.ok || !json.data?.url || !json.data?.handle) {
        toast.error(json.error ?? "Upload failed");
        return;
      }
      setTplHeaderMediaUrl(json.data.url);
      setTplHeaderMediaHandle(json.data.handle);
      toast.success("Header media uploaded");
    } catch { toast.error("Upload failed"); }
    finally { setTplHeaderUploading(false); }
  }

  async function createTemplate() {
    if (!tplName.trim() || !tplBody.trim()) { toast.error("Name and body are required"); return; }
    if (tplHeaderType !== "TEXT" && !tplHeaderMediaHandle) {
      toast.error(`Upload an example ${tplHeaderType.toLowerCase()} for the header first`);
      return;
    }
    setTplCreating(true);
    try {
      const res = await fetch("/api/whatsapp/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: tplName, category: tplCategory, language: tplLang,
          body: tplBody,
          headerType: tplHeaderType,
          header: tplHeaderType === "TEXT" ? (tplHeader || null) : null,
          headerMediaUrl: tplHeaderType !== "TEXT" ? tplHeaderMediaUrl : null,
          headerMediaHandle: tplHeaderType !== "TEXT" ? tplHeaderMediaHandle : null,
          footer: tplFooter || null,
          buttons: tplButtons.length > 0 ? tplButtons : undefined,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) { toast.error(json.error ?? "Failed"); } else {
        toast.success("Template submitted to Meta for review");
        setTplName(""); setTplBody(""); setTplHeader(""); setTplFooter(""); setTplButtons([]);
        setTplHeaderType("TEXT"); setTplHeaderMediaUrl(""); setTplHeaderMediaHandle("");
        setShowTplForm(false);
        await loadTemplates();
      }
    } catch { toast.error("Failed to create template"); }
    setTplCreating(false);
  }

  function addButton(type: TemplateButton["type"]) {
    if (tplButtons.length >= 3) { toast.error("Max 3 buttons total"); return; }
    const counts = { QUICK_REPLY: 0, URL: 0, PHONE_NUMBER: 0 };
    for (const b of tplButtons) counts[b.type]++;
    if (type === "QUICK_REPLY" && counts.QUICK_REPLY >= 3) { toast.error("Max 3 quick-reply buttons"); return; }
    if (type === "URL" && counts.URL >= 2) { toast.error("Max 2 URL buttons"); return; }
    if (type === "PHONE_NUMBER" && counts.PHONE_NUMBER >= 1) { toast.error("Max 1 phone button"); return; }
    if (type === "URL") setTplButtons([...tplButtons, { type, text: "", url: "" }]);
    else if (type === "PHONE_NUMBER") setTplButtons([...tplButtons, { type, text: "", phone: "" }]);
    else setTplButtons([...tplButtons, { type, text: "" }]);
  }

  function updateButton(idx: number, patch: Partial<TemplateButton>) {
    setTplButtons((prev) => prev.map((b, i) => (i === idx ? ({ ...b, ...patch } as TemplateButton) : b)));
  }

  function removeButton(idx: number) {
    setTplButtons((prev) => prev.filter((_, i) => i !== idx));
  }

  async function deleteTemplate(id: string) {
    await fetch(`/api/whatsapp/templates/${id}`, { method: "DELETE" });
    toast.success("Template deleted");
    await loadTemplates();
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = parseCSV(ev.target?.result as string);
      if (parsed.length === 0) { toast.error("No valid phone numbers"); return; }
      const existing = new Set(formRecipients.map((r) => r.phone));
      const newOnes = parsed.filter((r) => !existing.has(r.phone));
      setFormRecipients((prev) => [...prev, ...newOnes]);
      toast.success(`Added ${newOnes.length} recipients`);
    };
    reader.readAsText(file); e.target.value = "";
  }

  function addManual() {
    const phone = manualPhone.replace(/[^+\d]/g, "");
    if (phone.length < 7) { toast.error("Invalid number"); return; }
    const formatted = phone.startsWith("+") ? phone : `+${phone}`;
    if (formRecipients.some((r) => r.phone === formatted)) { toast.error("Already added"); return; }
    setFormRecipients((prev) => [...prev, { phone: formatted, contactName: manualName.trim() || undefined }]);
    setManualPhone(""); setManualName("");
  }

  async function handleCreate() {
    if (!formName.trim() || !selectedTemplateId || formRecipients.length === 0) {
      toast.error("Fill all required fields"); return;
    }

    // If scheduled, convert the local datetime input to an ISO string
    let scheduledAtIso: string | null = null;
    if (formScheduledAt.trim()) {
      const when = new Date(formScheduledAt);
      if (Number.isNaN(when.getTime())) { toast.error("Invalid schedule date/time"); return; }
      if (when.getTime() <= Date.now() + 30_000) {
        toast.error("Scheduled time must be in the future");
        return;
      }
      scheduledAtIso = when.toISOString();
    }

    setCreating(true);
    try {
      const res = await fetch("/api/whatsapp/broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName,
          templateId: selectedTemplateId,
          templateVars,
          recipients: formRecipients,
          scheduledAt: scheduledAtIso,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) { toast.error(json.error ?? "Failed"); setCreating(false); return; }
      toast.success(scheduledAtIso ? "Broadcast scheduled" : "Broadcast created");
      setFormName(""); setSelectedTemplateId(""); setTemplateVars({}); setFormRecipients([]); setFormScheduledAt("");
      setView("list"); await loadBroadcasts();
    } catch { toast.error("Failed"); }
    setCreating(false);
  }

  async function handleSend(id: string) {
    setSendingId(id);
    try {
      const res = await fetch(`/api/whatsapp/broadcasts/${id}/send`, { method: "POST" });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) { toast.error(json.error ?? "Failed"); } else { toast.success("Broadcast sending started"); }
      await loadBroadcasts();
    } catch { toast.error("Failed"); }
    setSendingId(null);
  }

  async function handleDelete(id: string) {
    await fetch(`/api/whatsapp/broadcasts/${id}`, { method: "DELETE" });
    toast.success("Deleted"); if (view === "detail") setView("list");
    await loadBroadcasts();
  }

  const totalSent = broadcasts.reduce((s, b) => s + b.sentCount, 0);
  const totalFailed = broadcasts.reduce((s, b) => s + b.failedCount, 0);
  const approvedTemplates = templates.filter((t) => t.status === "APPROVED");

  // Build message preview when template + vars change
  let messagePreview = selectedTemplate?.body ?? "";
  if (selectedTemplate) {
    for (const [key, value] of Object.entries(templateVars)) {
      messagePreview = messagePreview.replace(`{{${key}}}`, value || `[var ${key}]`);
    }
  }

  /* ================================================================ */
  return (
    <div className="space-y-6">

      {/* ========== LIST VIEW ========== */}
      {view === "list" && (<>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/10">
              <Radio className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Broadcasts</h1>
              <p className="text-xs text-muted-foreground">{broadcasts.length} broadcasts · {totalSent} sent</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setView("templates")} className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">
              <FileText className="h-4 w-4" /> Templates
            </button>
            <button onClick={() => setView("create")} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80 transition-colors">
              <Plus className="h-4 w-4" /> New Broadcast
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Broadcasts", value: broadcasts.length, icon: Radio, color: "text-green-500", bg: "bg-green-500/10" },
            { label: "Messages Sent", value: totalSent, icon: Send, color: "text-blue-400", bg: "bg-blue-500/10" },
            { label: "Failed", value: totalFailed, icon: XCircle, color: "text-red-400", bg: "bg-red-500/10" },
            { label: "Templates", value: approvedTemplates.length, icon: FileText, color: "text-purple-400", bg: "bg-purple-500/10" },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
                  <p className="text-2xl font-bold mt-1">{value}</p>
                </div>
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${bg}`}><Icon className={`h-4 w-4 ${color}`} /></div>
              </div>
            </div>
          ))}
        </div>

        {/* Broadcast list */}
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : broadcasts.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center border rounded-xl bg-card">
            <Radio className="h-10 w-10 text-muted-foreground/20" />
            <p className="text-sm font-medium text-muted-foreground">No broadcasts yet</p>
            <button onClick={() => setView("create")} className="mt-2 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80 transition-colors">
              <Plus className="h-4 w-4" /> Create Broadcast
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {broadcasts.map((b) => {
              const progress = b.totalCount > 0 ? Math.round(((b.sentCount + b.failedCount) / b.totalCount) * 100) : 0;
              return (
                <div key={b.id} onClick={() => void openDetail(b.id)} className="flex items-center gap-4 rounded-xl border bg-card p-4 hover:border-primary/30 transition-colors cursor-pointer">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-semibold text-sm truncate">{b.name}</span>
                      <Badge status={b.status} />
                      {b.template && <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{b.template.name}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{b.message}</p>
                  </div>
                  <div className="flex items-center gap-6 shrink-0 text-xs text-muted-foreground">
                    <div className="text-center"><p className="font-bold text-foreground text-sm">{b.totalCount}</p><p>Recipients</p></div>
                    <div className="text-center"><p className="font-bold text-green-500 text-sm">{b.sentCount}</p><p>Sent</p></div>
                    <div className="text-center"><p className="font-bold text-red-400 text-sm">{b.failedCount}</p><p>Failed</p></div>
                    {b.status === "SENDING" && (
                      <div className="w-16">
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div>
                        <p className="text-[10px] text-center mt-0.5">{progress}%</p>
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-[11px] text-muted-foreground w-20 text-right">{formatDistanceToNow(new Date(b.createdAt), { addSuffix: true })}</div>
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {b.status === "DRAFT" && (
                      <button onClick={() => void handleSend(b.id)} disabled={sendingId === b.id} className="flex h-8 w-8 items-center justify-center rounded-lg text-green-500 hover:bg-green-500/10" title="Send">
                        {sendingId === b.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                      </button>
                    )}
                    {b.status !== "SENDING" && (
                      <button onClick={() => void handleDelete(b.id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10" title="Delete">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </>)}

      {/* ========== TEMPLATES VIEW ========== */}
      {view === "templates" && (<>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setView("list")} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><ArrowLeft className="h-4 w-4" /></button>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Message Templates</h1>
              <p className="text-xs text-muted-foreground">Create and manage WhatsApp-approved message templates</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => void syncTemplates()} disabled={syncing} className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} /> Sync from Meta
            </button>
            <button onClick={() => setShowTplForm(!showTplForm)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80 transition-colors">
              <Plus className="h-4 w-4" /> Create Template
            </button>
          </div>
        </div>

        {/* Create template form */}
        {showTplForm && (
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <h3 className="text-sm font-semibold">New Template</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Name</label>
                <input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="promotion_launch" className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
                <p className="text-[10px] text-muted-foreground">Lowercase, underscores only</p>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Category</label>
                <select value={tplCategory} onChange={(e) => setTplCategory(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary">
                  <option value="MARKETING">Marketing</option>
                  <option value="UTILITY">Utility</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Language</label>
                <select value={tplLang} onChange={(e) => setTplLang(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary">
                  <option value="en">English</option>
                  <option value="ar">Arabic</option>
                  <option value="en_US">English (US)</option>
                </select>
              </div>
            </div>
            {/* Header — TEXT or media (IMAGE/VIDEO/DOCUMENT) */}
            <div className="space-y-2">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Header (optional)</label>
              <div className="grid grid-cols-4 gap-1 rounded-lg border bg-background p-1">
                {(["TEXT", "IMAGE", "VIDEO", "DOCUMENT"] as HeaderType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setTplHeaderType(t);
                      if (t === "TEXT") { setTplHeaderMediaUrl(""); setTplHeaderMediaHandle(""); }
                      else { setTplHeader(""); }
                    }}
                    className={`rounded-md px-3 py-1.5 text-[11px] font-medium transition ${
                      tplHeaderType === t
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {t === "TEXT" ? "Text" : t === "IMAGE" ? "Image" : t === "VIDEO" ? "Video" : "Document"}
                  </button>
                ))}
              </div>

              {tplHeaderType === "TEXT" && (
                <input
                  value={tplHeader}
                  onChange={(e) => setTplHeader(e.target.value)}
                  placeholder="Optional header text (max 60 chars)"
                  maxLength={60}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              )}

              {tplHeaderType !== "TEXT" && (
                <div className="space-y-2">
                  <input
                    ref={tplHeaderInputRef}
                    type="file"
                    accept={
                      tplHeaderType === "IMAGE" ? "image/jpeg,image/png" :
                      tplHeaderType === "VIDEO" ? "video/mp4,video/3gpp" :
                      "application/pdf"
                    }
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadTplHeaderMedia(f, tplHeaderType);
                      e.target.value = "";
                    }}
                    className="hidden"
                  />
                  {!tplHeaderMediaUrl ? (
                    <button
                      type="button"
                      onClick={() => tplHeaderInputRef.current?.click()}
                      disabled={tplHeaderUploading}
                      className="inline-flex items-center gap-2 rounded-lg border border-dashed bg-background px-4 py-3 text-sm hover:border-primary disabled:opacity-60 w-full justify-center"
                    >
                      {tplHeaderUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      {tplHeaderUploading ? "Uploading…" : `Upload example ${tplHeaderType.toLowerCase()}`}
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-2">
                      {tplHeaderType === "IMAGE" && (
                        <img src={tplHeaderMediaUrl} alt="" className="h-12 w-12 rounded object-cover" />
                      )}
                      {tplHeaderType === "VIDEO" && (
                        <div className="flex h-12 w-12 items-center justify-center rounded bg-muted">
                          <Send className="h-4 w-4" />
                        </div>
                      )}
                      {tplHeaderType === "DOCUMENT" && (
                        <FileText className="h-8 w-8 text-muted-foreground" />
                      )}
                      <a
                        href={tplHeaderMediaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 truncate text-xs text-primary hover:underline"
                      >
                        Preview uploaded {tplHeaderType.toLowerCase()}
                      </a>
                      <button
                        type="button"
                        onClick={() => { setTplHeaderMediaUrl(""); setTplHeaderMediaHandle(""); }}
                        className="text-muted-foreground hover:text-destructive p-1"
                        aria-label="Remove"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground/70">
                    {tplHeaderType === "IMAGE" && "JPG/PNG, max 5 MB"}
                    {tplHeaderType === "VIDEO" && "MP4/3GP, max 16 MB"}
                    {tplHeaderType === "DOCUMENT" && "PDF, max 100 MB"}
                    {" — Meta requires a sample for approval. Uploaded once, reused for every broadcast."}
                  </p>
                </div>
              )}
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Body</label>
                <span className="text-[10px] text-muted-foreground">Use {"{{1}}"}, {"{{2}}"} for variables</span>
              </div>
              <textarea value={tplBody} onChange={(e) => setTplBody(e.target.value)} placeholder={"Hello {{1}}, check out our new collection! Use code {{2}} for 20% off."} rows={4} className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary resize-y" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Footer (optional)</label>
              <input value={tplFooter} onChange={(e) => setTplFooter(e.target.value)} placeholder="Reply STOP to unsubscribe" className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            </div>

            {/* Buttons builder */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Buttons (optional)</label>
                <span className="text-[10px] text-muted-foreground">Max 3 quick-reply, 2 URL, 1 phone</span>
              </div>
              {tplButtons.length > 0 && (
                <div className="space-y-2">
                  {tplButtons.map((b, idx) => (
                    <div key={idx} className="flex items-center gap-2 rounded-lg border bg-background p-2">
                      <span className="shrink-0 rounded bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">
                        {b.type === "QUICK_REPLY" ? "Reply" : b.type === "URL" ? "URL" : "Phone"}
                      </span>
                      <input
                        value={b.text}
                        onChange={(e) => updateButton(idx, { text: e.target.value })}
                        placeholder="Button text (e.g. Visit website)"
                        maxLength={25}
                        className="flex-1 rounded-md border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary"
                      />
                      {b.type === "URL" && (
                        <input
                          value={(b as { url: string }).url}
                          onChange={(e) => updateButton(idx, { url: e.target.value })}
                          placeholder="https://example.com"
                          className="flex-[2] rounded-md border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary"
                        />
                      )}
                      {b.type === "PHONE_NUMBER" && (
                        <input
                          value={(b as { phone: string }).phone}
                          onChange={(e) => updateButton(idx, { phone: e.target.value })}
                          placeholder="+15551234567"
                          className="flex-[2] rounded-md border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary"
                        />
                      )}
                      <button
                        onClick={() => removeButton(idx)}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
                        aria-label="Remove button"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => addButton("QUICK_REPLY")}
                  className="inline-flex items-center gap-1.5 rounded-md border border-dashed bg-background px-2.5 py-1 text-[11px] text-muted-foreground hover:border-primary hover:text-foreground"
                >
                  <Plus className="h-3 w-3" /> Quick Reply
                </button>
                <button
                  type="button"
                  onClick={() => addButton("URL")}
                  className="inline-flex items-center gap-1.5 rounded-md border border-dashed bg-background px-2.5 py-1 text-[11px] text-muted-foreground hover:border-primary hover:text-foreground"
                >
                  <Plus className="h-3 w-3" /> URL
                </button>
                <button
                  type="button"
                  onClick={() => addButton("PHONE_NUMBER")}
                  className="inline-flex items-center gap-1.5 rounded-md border border-dashed bg-background px-2.5 py-1 text-[11px] text-muted-foreground hover:border-primary hover:text-foreground"
                >
                  <Plus className="h-3 w-3" /> Phone
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button onClick={() => void createTemplate()} disabled={tplCreating} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80 disabled:opacity-50">
                {tplCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Submit for Review
              </button>
              <button onClick={() => setShowTplForm(false)} className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:bg-muted">Cancel</button>
            </div>
          </div>
        )}

        {/* Template list */}
        {templates.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center border rounded-xl bg-card">
            <FileText className="h-10 w-10 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">No templates yet</p>
            <p className="text-xs text-muted-foreground/60">Click &quot;Sync from Meta&quot; to import existing templates, or create a new one</p>
          </div>
        ) : (
          <div className="space-y-2">
            {templates.map((t) => (
              <div key={t.id} className="flex items-center gap-4 rounded-xl border bg-card p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-semibold text-sm font-mono">{t.name}</span>
                    <Badge status={t.status} />
                    <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{t.category}</span>
                    <span className="text-[10px] text-muted-foreground">{t.language}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{t.body}</p>
                  {t.variableCount > 0 && <p className="text-[10px] text-blue-400 mt-0.5">{t.variableCount} variable{t.variableCount !== 1 ? "s" : ""}</p>}
                  {t.buttons && t.buttons.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {t.buttons.map((b, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 rounded border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                        >
                          {b.type === "QUICK_REPLY" ? "↩" : b.type === "URL" ? "🔗" : "📞"} {b.text}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={() => void deleteTemplate(t.id)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </>)}

      {/* ========== CREATE VIEW ========== */}
      {view === "create" && (<>
        <div className="flex items-center gap-3">
          <button onClick={() => setView("list")} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><ArrowLeft className="h-4 w-4" /></button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              New Broadcast
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide align-middle">
                <Clock className="h-3 w-3" />
                Scheduling enabled
              </span>
            </h1>
            <p className="text-xs text-muted-foreground">Select an approved template, fill variables, upload recipients, and optionally schedule.</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3 space-y-5">
            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Broadcast Name</label>
              <input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. New Collection Launch" className="w-full rounded-lg border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary" />
            </div>

            {/* Template selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Message Template</label>
              {approvedTemplates.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-center">
                  <p className="text-sm text-muted-foreground mb-2">No approved templates available</p>
                  <button onClick={() => setView("templates")} className="text-xs text-primary hover:underline">Go to Templates →</button>
                </div>
              ) : (
                <div className="space-y-2">
                  {approvedTemplates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setSelectedTemplateId(t.id);
                        setTemplateVars({});
                      }}
                      className={`w-full text-left rounded-lg border p-3 transition-colors ${
                        selectedTemplateId === t.id ? "border-primary bg-primary/5" : "hover:border-muted-foreground/30"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Sparkles className="h-3.5 w-3.5 text-green-500" />
                        <span className="font-medium text-sm font-mono">{t.name}</span>
                        <Badge status={t.status} />
                        {t.variableCount > 0 && <span className="text-[10px] text-blue-400">{t.variableCount} vars</span>}
                      </div>
                      <p className="text-xs text-muted-foreground">{t.body}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Variable inputs */}
            {selectedTemplate && selectedTemplate.variableCount > 0 && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Template Variables</label>
                <div className="grid grid-cols-2 gap-3">
                  {Array.from({ length: selectedTemplate.variableCount }, (_, i) => (
                    <div key={i} className="space-y-1">
                      <label className="text-[11px] text-muted-foreground">{`{{${i + 1}}}`}</label>
                      <input
                        value={templateVars[String(i + 1)] ?? ""}
                        onChange={(e) => setTemplateVars((prev) => ({ ...prev, [String(i + 1)]: e.target.value }))}
                        placeholder={`Value for {{${i + 1}}}`}
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Message preview */}
            {selectedTemplate && (
              <div className="rounded-lg border bg-muted/30 p-4 space-y-1">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Message Preview</p>
                {selectedTemplate.header && <p className="text-sm font-semibold">{selectedTemplate.header}</p>}
                <p className="text-sm whitespace-pre-wrap">{messagePreview}</p>
                {selectedTemplate.footer && <p className="text-[11px] text-muted-foreground mt-2">{selectedTemplate.footer}</p>}
              </div>
            )}

            {/* Upload recipients */}
            <div className="space-y-3">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recipients</label>
              <div className="flex gap-2">
                <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 rounded-lg border bg-background px-4 py-2.5 text-sm font-medium hover:bg-muted">
                  <Upload className="h-4 w-4" /> Upload CSV
                </button>
                <input ref={fileRef} type="file" accept=".csv,.txt,.tsv" onChange={handleFileUpload} className="hidden" />
                <input value={manualPhone} onChange={(e) => setManualPhone(e.target.value)} placeholder="+971501234567" className="flex-1 rounded-lg border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" onKeyDown={(e) => { if (e.key === "Enter") addManual(); }} />
                <input value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="Name" className="w-32 rounded-lg border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" onKeyDown={(e) => { if (e.key === "Enter") addManual(); }} />
                <button onClick={addManual} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/80"><Plus className="h-4 w-4" /></button>
              </div>
              <p className="text-[10px] text-muted-foreground/50">CSV: one number per line, or phone,name columns</p>
            </div>

            {/* Schedule (optional) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Schedule (optional)
                </label>
                {formScheduledAt && (
                  <button
                    type="button"
                    onClick={() => setFormScheduledAt("")}
                    className="text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                <input
                  type="datetime-local"
                  value={formScheduledAt}
                  onChange={(e) => setFormScheduledAt(e.target.value)}
                  min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
                  className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
              <p className="text-[10px] text-muted-foreground/60">
                Leave blank to create as a draft and send manually. If set, the broadcast will fire automatically at the chosen time (cron runs every minute).
              </p>
            </div>

            {/* Submit */}
            <div className="flex items-center gap-3 pt-2">
              <button onClick={() => void handleCreate()} disabled={creating || !formName.trim() || !selectedTemplateId || formRecipients.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : formScheduledAt ? <Clock className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                {formScheduledAt ? "Schedule Broadcast" : "Create Broadcast"}
              </button>
              <button onClick={() => setView("list")} className="rounded-lg px-4 py-2.5 text-sm text-muted-foreground hover:bg-muted">Cancel</button>
            </div>
          </div>

          {/* Recipient list */}
          <div className="lg:col-span-2">
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <div className="flex items-center gap-2"><Users className="h-4 w-4 text-muted-foreground" /><span className="text-sm font-medium">{formRecipients.length} Recipients</span></div>
                {formRecipients.length > 0 && <button onClick={() => setFormRecipients([])} className="text-[11px] text-red-400 hover:underline">Clear all</button>}
              </div>
              <div className="max-h-[400px] overflow-y-auto">
                {formRecipients.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-12"><FileSpreadsheet className="h-8 w-8 text-muted-foreground/20" /><p className="text-xs text-muted-foreground">Upload CSV or add manually</p></div>
                ) : formRecipients.map((r, i) => (
                  <div key={`${r.phone}-${i}`} className="flex items-center gap-3 px-4 py-2 border-b last:border-b-0 hover:bg-muted/50">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{r.phone}</p>
                      {r.contactName && <p className="text-[11px] text-muted-foreground">{r.contactName}</p>}
                    </div>
                    <button onClick={() => setFormRecipients((p) => p.filter((_, j) => j !== i))} className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-red-400"><X className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </>)}

      {/* ========== DETAIL VIEW ========== */}
      {view === "detail" && (<>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => { setView("list"); setActiveBroadcast(null); }} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><ArrowLeft className="h-4 w-4" /></button>
            <div>
              <h1 className="text-xl font-bold tracking-tight">{activeBroadcast?.name ?? "Loading..."}</h1>
              {activeBroadcast && <p className="text-xs text-muted-foreground">Created {format(new Date(activeBroadcast.createdAt), "d MMM yyyy, HH:mm")}</p>}
            </div>
          </div>
          {activeBroadcast && (
            <div className="flex items-center gap-2">
              {activeBroadcast.status === "DRAFT" && (
                <button onClick={() => void handleSend(activeBroadcast.id)} disabled={sendingId === activeBroadcast.id} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
                  {sendingId === activeBroadcast.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Send Now
                </button>
              )}
              {activeBroadcast.status !== "SENDING" && (
                <button onClick={() => void handleDelete(activeBroadcast.id)} className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/10">
                  <Trash2 className="h-4 w-4" />
                  {activeBroadcast.status === "SCHEDULED" ? "Cancel & Delete" : "Delete"}
                </button>
              )}
            </div>
          )}
        </div>

        {detailLoading || !activeBroadcast ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (<>
          <div className="grid grid-cols-5 gap-4">
            {[
              { label: "Total", value: activeBroadcast.totalCount, color: "text-foreground" },
              { label: "Sent", value: activeBroadcast.sentCount, color: "text-blue-400" },
              { label: "Delivered", value: activeBroadcast.deliveredCount, color: "text-emerald-400" },
              { label: "Read", value: activeBroadcast.readCount, color: "text-purple-400" },
              { label: "Failed", value: activeBroadcast.failedCount, color: "text-red-400" },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-xl border bg-card p-4 text-center">
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {activeBroadcast.status === "SENDING" && (
            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin text-primary" /> Sending...</span>
                <span className="text-sm text-muted-foreground">{activeBroadcast.sentCount + activeBroadcast.failedCount} / {activeBroadcast.totalCount}</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${activeBroadcast.totalCount > 0 ? Math.round(((activeBroadcast.sentCount + activeBroadcast.failedCount) / activeBroadcast.totalCount) * 100) : 0}%` }} />
              </div>
            </div>
          )}

          <div className="rounded-xl border bg-card p-4">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Message</p>
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{activeBroadcast.message}</p>
          </div>

          <div className="flex items-center gap-2">
            <Badge status={activeBroadcast.status} />
            {activeBroadcast.startedAt && <span className="text-xs text-muted-foreground">Started {format(new Date(activeBroadcast.startedAt), "d MMM HH:mm")}</span>}
            {activeBroadcast.completedAt && <span className="text-xs text-muted-foreground">· Completed {format(new Date(activeBroadcast.completedAt), "d MMM HH:mm")}</span>}
          </div>

          {/* Recipients table */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <span className="text-sm font-medium">Recipients ({activeBroadcast.recipients.length})</span>
              <div className="flex items-center gap-1">
                {["all", "PENDING", "SENT", "DELIVERED", "READ", "FAILED"].map((f) => (
                  <button key={f} onClick={() => setRecipientFilter(f)} className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${recipientFilter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
                    {f === "all" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            </div>
            <div className="max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-[11px] font-medium text-muted-foreground uppercase">Phone</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-medium text-muted-foreground uppercase">Name</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-medium text-muted-foreground uppercase">Status</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-medium text-muted-foreground uppercase">Sent At</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-medium text-muted-foreground uppercase">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {activeBroadcast.recipients.filter((r) => recipientFilter === "all" || r.status === recipientFilter).map((r) => {
                    const c = statusCfg(r.status);
                    return (
                      <tr key={r.id} className="border-t hover:bg-muted/30">
                        <td className="px-4 py-2.5 font-mono text-xs">{r.phone}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{r.contactName ?? "—"}</td>
                        <td className="px-4 py-2.5"><span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: c.bg, color: c.color }}>{c.label}</span></td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{r.sentAt ? format(new Date(r.sentAt), "HH:mm:ss") : "—"}</td>
                        <td className="px-4 py-2.5 text-xs text-red-400 max-w-48 truncate">{r.error ? <span title={r.error} className="flex items-center gap-1"><AlertCircle className="h-3 w-3 shrink-0" />{r.error.slice(0, 60)}</span> : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {activeBroadcast.recipients.filter((r) => recipientFilter === "all" || r.status === recipientFilter).length === 0 && (
                <div className="py-8 text-center text-xs text-muted-foreground">No recipients with this status</div>
              )}
            </div>
          </div>
        </>)}
      </>)}
    </div>
  );
}
