"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Send, Upload, Plus, Trash2, Play, XCircle, Clock,
  Loader2, FileSpreadsheet, Users, ArrowLeft, X, Phone, AlertCircle,
  Radio, RefreshCw, FileText, Copy, ExternalLink, MoreVertical,
  Search, Tag, Check, Save, Square, RotateCw,
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
    case "STOPPED": return { label: "Stopped", color: "#a855f7", bg: "#a855f715" };
    case "COMPLETED": return { label: "Completed", color: "#10b981", bg: "#10b98115" };
    case "FAILED": return { label: "Failed", color: "#ef4444", bg: "#ef444415" };
    case "APPROVED": return { label: "Approved", color: "#10b981", bg: "#10b98115" };
    case "PENDING": return { label: "Pending Review", color: "#f59e0b", bg: "#f59e0b15" };
    case "REJECTED": return { label: "Rejected", color: "#ef4444", bg: "#ef444415" };
    default: return { label: s, color: "#888", bg: "#88888815" };
  }
}

type ParsedRecipient = { phone: string; contactName?: string; fields: Record<string, string> };

// Parse a CSV/TSV into recipients. Returns the (non-phone) column headers so the
// user can map a template variable {{n}} to a column, and a per-row `fields` map
// keyed by header name so each message can be personalized.
function parseCSV(text: string): { headers: string[]; rows: ParsedRecipient[] } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { headers: [], rows: [] };

  const splitRow = (line: string) =>
    line.split(/[,;\t]/).map((s) => s.trim().replace(/^["']|["']$/g, ""));
  const digitsOnly = (s: string) => s.replace(/[^+\d]/g, "").replace(/^\+/, "");

  // The phone can live in ANY column ("Name, Phone" vs "Phone, Name"). Use the
  // header row to locate it if present; otherwise fall back to picking, per row,
  // the column that actually looks like a phone number (the most digits).
  let phoneCol = -1;
  let nameCol = -1;
  let dataStart = 0;
  let headers: string[] = [];
  const header = splitRow(lines[0]);
  const headerLike = header.some((c) => /phone|number|mobile|tel|whats|name|e-?mail/i.test(c));
  if (headerLike) {
    headers = header.map((h, i) => h || `column ${i + 1}`);
    header.forEach((c, i) => {
      if (phoneCol === -1 && /phone|number|mobile|tel|whats/i.test(c)) phoneCol = i;
      if (nameCol === -1 && /name/i.test(c)) nameCol = i;
    });
    dataStart = 1; // skip the header row
  }

  const rows: ParsedRecipient[] = [];
  for (let i = dataStart; i < lines.length; i++) {
    const cols = splitRow(lines[i]);
    if (cols.length === 0) continue;

    let phoneRaw = "";
    let name: string | undefined;
    let usedPhoneCol = phoneCol;
    if (phoneCol >= 0) {
      phoneRaw = cols[phoneCol] ?? "";
      name = nameCol >= 0 ? cols[nameCol] : cols.find((_, idx) => idx !== phoneCol);
    } else {
      // No usable header — the phone is whichever column has the most digits.
      let bestIdx = -1;
      let bestLen = 0;
      cols.forEach((c, idx) => {
        const d = digitsOnly(c).length;
        if (d > bestLen) { bestLen = d; bestIdx = idx; }
      });
      if (bestIdx === -1) continue;
      usedPhoneCol = bestIdx;
      phoneRaw = cols[bestIdx];
      name = cols.find((c, idx) => idx !== bestIdx && c.length > 0 && digitsOnly(c).length < 7);
    }

    let digits = digitsOnly(phoneRaw);
    if (digits.startsWith("00")) digits = digits.slice(2); // 0097... -> +97...
    if (digits.length < 7) continue;

    // Per-row field map (header name -> cell), excluding the phone column itself.
    const fields: Record<string, string> = {};
    if (headers.length > 0) {
      headers.forEach((h, idx) => {
        if (idx === usedPhoneCol) return;
        const v = cols[idx];
        if (v != null && v !== "") fields[h] = v;
      });
    }

    rows.push({ phone: `+${digits}`, contactName: name?.trim() || undefined, fields });
  }

  // Columns offered to the variable mapper = headers minus the phone column.
  const mappableHeaders = headers.filter((_, idx) => idx !== phoneCol);
  return { headers: mappableHeaders, rows };
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
/*  TEMPLATE PREVIEW CARD — WhatsApp-style bubble                      */
/* ------------------------------------------------------------------ */

function TemplatePreviewCard({
  template,
  values,
  compact = false,
}: {
  template: Template;
  values?: Record<string, string>;
  compact?: boolean;
}) {
  // Substitute {{1}}, {{2}} ... with provided values (fallback to placeholder)
  let bodyRendered = template.body;
  if (values) {
    for (const [key, val] of Object.entries(values)) {
      bodyRendered = bodyRendered.replaceAll(`{{${key}}}`, val.trim() || `{{${key}}}`);
    }
  }

  const headerType = template.headerType ?? "TEXT";
  const mediaUrl = template.headerMediaUrl;

  return (
    <div
      style={{
        background: "#0b141a",
        borderRadius: 8,
        border: "1px solid #1f2c33",
        padding: 8,
        maxWidth: compact ? "100%" : 360,
        fontFamily: 'system-ui, -apple-system, "Segoe UI", "Helvetica Neue", Arial, "Tahoma", "Noto Sans Arabic", sans-serif',
      }}
    >
      {/* Bubble */}
      <div
        style={{
          background: "#1f2c33",
          borderRadius: 8,
          padding: 4,
          color: "#e9edef",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        {headerType === "IMAGE" && mediaUrl && (
          <img
            src={mediaUrl}
            alt="Header"
            style={{
              display: "block",
              width: "100%",
              maxHeight: compact ? 140 : 220,
              objectFit: "cover",
              borderRadius: 6,
              marginBottom: 4,
              background: "#0b141a",
            }}
          />
        )}
        {headerType === "VIDEO" && mediaUrl && (
          <video
            src={mediaUrl}
            controls
            style={{
              display: "block",
              width: "100%",
              maxHeight: compact ? 140 : 220,
              borderRadius: 6,
              marginBottom: 4,
              background: "#0b141a",
            }}
          />
        )}
        {headerType === "DOCUMENT" && mediaUrl && (
          <a
            href={mediaUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 12px",
              background: "#0b141a",
              borderRadius: 6,
              marginBottom: 4,
              color: "#e9edef",
              textDecoration: "none",
              fontSize: 12,
            }}
          >
            <FileText style={{ width: 18, height: 18, color: "#8696a0", flexShrink: 0 }} />
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              Document attachment
            </span>
            <ExternalLink style={{ width: 12, height: 12, color: "#8696a0" }} />
          </a>
        )}
        {headerType === "TEXT" && template.header && (
          <div
            dir="auto"
            style={{
              padding: "8px 10px 0 10px",
              fontSize: 14,
              fontWeight: 700,
              color: "#fff",
            }}
          >
            {template.header}
          </div>
        )}

        {/* Body */}
        <div
          dir="auto"
          style={{
            padding: "6px 10px",
            fontSize: 14,
            lineHeight: 1.5,
            color: "#e9edef",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {bodyRendered}
        </div>

        {/* Footer */}
        {template.footer && (
          <div
            dir="auto"
            style={{
              padding: "0 10px 6px 10px",
              fontSize: 11,
              color: "#8696a0",
            }}
          >
            {template.footer}
          </div>
        )}

        {/* Timestamp row (visual only) */}
        <div
          style={{
            padding: "0 10px 6px 10px",
            display: "flex",
            justifyContent: "flex-end",
            fontSize: 10,
            color: "#8696a0",
          }}
        >
          12:34
        </div>
      </div>

      {/* Buttons — rendered below bubble in WhatsApp UI */}
      {template.buttons && template.buttons.length > 0 && (
        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
          {template.buttons.map((b, i) => {
            const icon =
              b.type === "URL" ? <ExternalLink style={{ width: 13, height: 13 }} /> :
              b.type === "PHONE_NUMBER" ? <Phone style={{ width: 13, height: 13 }} /> :
              null;
            const href =
              b.type === "URL" ? (b as { url: string }).url :
              b.type === "PHONE_NUMBER" ? `tel:${(b as { phone: string }).phone}` :
              undefined;
            const inner = (
              <>
                {icon}
                <span>{b.text}</span>
              </>
            );
            return href ? (
              <a
                key={i}
                href={href}
                target={b.type === "URL" ? "_blank" : undefined}
                rel="noopener noreferrer"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  background: "#1f2c33",
                  color: "#53bdeb",
                  fontSize: 13,
                  fontWeight: 500,
                  padding: "8px 12px",
                  borderRadius: 6,
                  textDecoration: "none",
                }}
              >
                {inner}
              </a>
            ) : (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  background: "#1f2c33",
                  color: "#53bdeb",
                  fontSize: 13,
                  fontWeight: 500,
                  padding: "8px 12px",
                  borderRadius: 6,
                }}
              >
                {inner}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  BROADCAST DRIVER — pushes a SENDING broadcast to completion        */
/* ------------------------------------------------------------------ */

// Each /send call sends one time-budget worth of messages and returns the live
// status. The browser repeats it until the broadcast is terminal, so large
// broadcasts finish without waiting on the once-a-minute cron. The server
// claims every recipient atomically, so overlapping callers are always safe;
// the cross-tab lock below only avoids wasted duplicate work.

// Must exceed how long one /send chunk can run (~45s budget, up to the 60s
// function ceiling) so another tab doesn't steal the lock mid-chunk while this
// tab is busy awaiting the request.
const DRIVER_LOCK_TTL = 90000;
const driverSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const driverLockKey = (id: string) => `bcast-driver:${id}`;

function acquireDriverLock(id: string, me: string): boolean {
  try {
    const raw = localStorage.getItem(driverLockKey(id));
    if (raw) {
      const { owner, ts } = JSON.parse(raw) as { owner: string; ts: number };
      if (owner !== me && Date.now() - ts < DRIVER_LOCK_TTL) return false;
    }
    localStorage.setItem(driverLockKey(id), JSON.stringify({ owner: me, ts: Date.now() }));
    return true;
  } catch {
    return true; // localStorage unavailable — proceed; the server CAS keeps it safe
  }
}

function releaseDriverLock(id: string, me: string) {
  try {
    const raw = localStorage.getItem(driverLockKey(id));
    if (!raw) return;
    const { owner } = JSON.parse(raw) as { owner: string };
    if (owner === me) localStorage.removeItem(driverLockKey(id));
  } catch {
    /* ignore */
  }
}

type DriveResult = {
  ok?: boolean;
  status?: string;
  terminal?: boolean;
  done?: boolean;
  reason?: string;
};

/* ------------------------------------------------------------------ */
/*  COMPONENT                                                          */
/* ------------------------------------------------------------------ */

export default function BroadcastPage() {
  const isMobile = useIsMobile();
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
  const [formRecipients, setFormRecipients] = useState<{ phone: string; contactName?: string; fields?: Record<string, string> }[]>([]);
  // Columns from the uploaded CSV, offered as choices for each template variable.
  const [csvColumns, setCsvColumns] = useState<string[]>([]);
  // Maps a template variable index ("1","2"…) to a CSV column header, or the
  // sentinel "__literal__" meaning "use the typed value in templateVars".
  const [varColumnMap, setVarColumnMap] = useState<Record<string, string>>({});
  const [manualPhone, setManualPhone] = useState("");
  const [manualName, setManualName] = useState("");
  const [creating, setCreating] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);

  // Schedule for create form
  const [formScheduledAt, setFormScheduledAt] = useState("");

  // Template search (create flow)
  const [templateSearch, setTemplateSearch] = useState("");

  // Recipient picker mode in the create flow.
  // "manual" = upload CSV / add by phone. "segment" = pick from saved tags.
  const [recipientMode, setRecipientMode] = useState<"manual" | "segment">("manual");
  type ContactTagSummary = { name: string; memberCount: number };
  const [contactTags, setContactTags] = useState<ContactTagSummary[]>([]);
  const [pickedSegmentTags, setPickedSegmentTags] = useState<string[]>([]);
  const [loadingSegment, setLoadingSegment] = useState(false);

  // Save-as-segment after building a recipient list
  const [saveSegmentTag, setSaveSegmentTag] = useState("");
  const [savingSegment, setSavingSegment] = useState(false);

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

  // Template preview modal
  const [previewTpl, setPreviewTpl] = useState<Template | null>(null);

  // Open three-dots menu on a template card (by template id)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  // Broadcasts this tab is actively driving + a stable id for the cross-tab lock.
  const drivingRef = useRef<Set<string>>(new Set());
  const tabIdRef = useRef<string>(Math.random().toString(36).slice(2));

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) ?? null;

  // WhatsApp rejects body params containing newlines or 4+ consecutive spaces.
  const sanitizeVar = (s: string) => s.replace(/\s+/g, " ").trim();

  // Resolve a variable's value for a given recipient: a CSV-column mapping reads
  // that recipient's field, falling back to the typed default when that cell is
  // blank; an unmapped variable always uses the typed value.
  function resolveVar(key: string, fields?: Record<string, string>): string {
    const mapping = varColumnMap[key];
    if (mapping && mapping !== "__literal__") {
      const fromColumn = sanitizeVar(fields?.[mapping] ?? "");
      if (fromColumn) return fromColumn;
    }
    return sanitizeVar(templateVars[key] ?? "");
  }

  // Values shown in the live preview — use the first recipient so a column
  // mapping previews a real value rather than the raw "{{1}}".
  const previewVars: Record<string, string> = (() => {
    if (!selectedTemplate || selectedTemplate.variableCount === 0) return templateVars;
    const sample = formRecipients[0]?.fields;
    const out: Record<string, string> = {};
    for (let i = 1; i <= selectedTemplate.variableCount; i++) {
      const key = String(i);
      const v = resolveVar(key, sample);
      out[key] = v || `{{${i}}}`;
    }
    return out;
  })();

  /* ---- Loaders ---- */
  const loadBroadcasts = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/broadcasts");
      const json = (await res.json()) as { data: Broadcast[] | null };
      setBroadcasts(json.data ?? []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  // Drive a broadcast to completion from the browser: keep POSTing /send (each
  // call sends one budget worth of messages) until the broadcast is terminal.
  // Idempotent — an in-tab guard plus a cross-tab lock prevent duplicate drivers,
  // and the server claims every recipient atomically regardless.
  const driveBroadcast = useCallback(async (id: string) => {
    if (drivingRef.current.has(id)) return;
    drivingRef.current.add(id);
    const me = tabIdRef.current;
    try {
      let guard = 0;
      let netErrors = 0; // consecutive transport failures; resets on any response
      while (guard++ < 100000) {
        if (!acquireDriverLock(id, me)) break; // another tab owns this broadcast
        let result: DriveResult | null = null;
        try {
          const res = await fetch(`/api/whatsapp/broadcasts/${id}/send`, { method: "POST" });
          const json = (await res.json()) as { data?: DriveResult; error?: string };
          result = json.data ?? null;
          if (!res.ok && !result) {
            toast.error(
              res.status === 401 || res.status === 403
                ? "Session expired — please log in again."
                : json.error ?? "Send failed",
            );
            break;
          }
          netErrors = 0;
        } catch {
          // Network blip or a long chunk that outran the gateway timeout — the
          // server kept all progress, so retry a few times. Give up (the cron +
          // auto-resume still finish it server-side) if it's persistently down.
          if (++netErrors > 5) {
            toast.error("Network problem — sending paused; it will resume automatically.");
            break;
          }
          await driverSleep(Math.min(3000 * netErrors, 15000));
          continue;
        }
        void loadBroadcasts();
        if (!result) { await driverSleep(2000); continue; }
        const status = result.status;
        if (result.done || result.terminal || (status !== undefined && status !== "SENDING")) {
          if (result.ok === false && result.reason) toast.error(result.reason);
          else if (status === "COMPLETED") toast.success("Broadcast complete");
          break;
        }
        await driverSleep(1200); // gentle back-pressure between chunks
      }
    } finally {
      drivingRef.current.delete(id);
      releaseDriverLock(id, me);
    }
  }, [loadBroadcasts]);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/templates");
      const json = (await res.json()) as { data: Template[] | null };
      setTemplates(json.data ?? []);
    } catch { /* silent */ }
  }, []);

  const loadContactTags = useCallback(async () => {
    try {
      const res = await fetch("/api/contacts/tags");
      const json = (await res.json()) as { data: { tags: ContactTagSummary[] } | null };
      setContactTags(json.data?.tags ?? []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { void loadBroadcasts(); void loadTemplates(); }, [loadBroadcasts, loadTemplates]);

  // Lazy-load tags when entering the create flow so the segment picker has data.
  useEffect(() => {
    if (view === "create") void loadContactTags();
  }, [view, loadContactTags]);

  // Close any open template three-dots menu on outside click
  useEffect(() => {
    if (!openMenuId) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!target?.closest("[data-tpl-menu]")) setOpenMenuId(null);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [openMenuId]);

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

  // Make sure every SENDING broadcast has a driver — covers page reloads with an
  // in-flight broadcast and the moment a freshly-sent one flips to SENDING. The
  // in-tab guard + cross-tab lock keep this from spawning duplicate drivers.
  useEffect(() => {
    for (const b of broadcasts) {
      if (b.status === "SENDING") void driveBroadcast(b.id);
    }
  }, [broadcasts, driveBroadcast]);

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

  function duplicateTemplate(t: Template) {
    // Prefill the create form with the template's data so the user can submit
    // a copy to Meta for fresh approval.
    const baseName = t.name.replace(/_copy(_\d+)?$/, "");
    const existingCopies = templates.filter((x) => x.name.startsWith(`${baseName}_copy`)).length;
    const suggestedName = existingCopies === 0 ? `${baseName}_copy` : `${baseName}_copy_${existingCopies + 1}`;

    setTplName(suggestedName);
    setTplCategory(t.category);
    setTplLang(t.language);
    setTplBody(t.body);
    setTplHeaderType((t.headerType ?? "TEXT") as HeaderType);
    setTplHeader(t.header ?? "");
    setTplHeaderMediaUrl(t.headerMediaUrl ?? "");
    // Meta requires a fresh upload to get a new headerMediaHandle; the user
    // must re-upload before submitting.
    setTplHeaderMediaHandle("");
    setTplFooter(t.footer ?? "");
    setTplButtons(t.buttons ? t.buttons.map((b) => ({ ...b })) : []);
    setShowTplForm(true);
    setPreviewTpl(null);

    // Scroll into view after the form mounts
    setTimeout(() => {
      const el = document.querySelector<HTMLInputElement>('input[placeholder="promotion_launch"]');
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.focus();
    }, 60);

    if (t.headerType && t.headerType !== "TEXT") {
      toast.info("Re-upload the header media before submitting — Meta requires a fresh upload handle.");
    } else {
      toast.success("Template duplicated — review and submit to Meta.");
    }
  }

  function startBroadcastFromTemplate(t: Template) {
    if (t.status !== "APPROVED") {
      toast.error("Template must be approved by Meta before you can broadcast with it.");
      return;
    }
    setSelectedTemplateId(t.id);
    setTemplateVars({});
    setVarColumnMap({});
    setCsvColumns([]);
    setFormName("");
    setFormRecipients([]);
    setFormScheduledAt("");
    setOpenMenuId(null);
    setPreviewTpl(null);
    setView("create");
    toast.success(`Broadcasting with template: ${t.name}`);
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    // Excel files are binary; readAsText would yield garbage. Nudge to CSV.
    if (/\.(xlsx|xls)$/i.test(file.name)) {
      toast.error("Please export your sheet as CSV first (File → Save As → CSV), then upload that.");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const { headers, rows } = parseCSV(ev.target?.result as string);
      if (rows.length === 0) {
        toast.error("No phone numbers found — make sure the file has a column of phone numbers (a 'Phone' header works best).");
        return;
      }
      const existing = new Set(formRecipients.map((r) => r.phone));
      const newOnes = rows.filter((r) => !existing.has(r.phone));
      setFormRecipients((prev) => [...prev, ...newOnes]);
      // Remember the column names so each template variable can be mapped to one.
      if (headers.length > 0) {
        setCsvColumns((prev) => [...new Set([...prev, ...headers])]);
      }
      toast.success(
        newOnes.length === rows.length
          ? `Added ${newOnes.length} recipients`
          : `Added ${newOnes.length} recipients (${rows.length - newOnes.length} duplicates skipped)`,
      );
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

  // Load every contact carrying `tagName` and merge them into the recipient
  // list (deduped by phone). Already-picked tags are removed.
  async function toggleSegmentTag(tagName: string) {
    const tag = tagName.trim().toLowerCase();
    if (!tag) return;
    if (pickedSegmentTags.includes(tag)) {
      // Just untrack the tag — we don't bulk-remove the contacts we may have added
      // from it, since the user might want to keep some of them.
      setPickedSegmentTags((prev) => prev.filter((t) => t !== tag));
      return;
    }
    setLoadingSegment(true);
    try {
      const res = await fetch(`/api/contacts?tags=${encodeURIComponent(tag)}`);
      const json = (await res.json()) as {
        data: { phone: string | null; name: string }[] | null;
      };
      const rows = (json.data ?? []).filter((c) => c.phone && c.phone.trim().length > 5);
      const newEntries = rows.map((c) => ({
        phone: (c.phone as string).trim(),
        contactName: c.name,
      }));
      const existing = new Set(formRecipients.map((r) => r.phone));
      const added = newEntries.filter((r) => !existing.has(r.phone));
      setFormRecipients((prev) => [...prev, ...added]);
      setPickedSegmentTags((prev) => [...prev, tag]);
      if (added.length === 0) {
        toast.info(`All ${newEntries.length} contacts in "${tag}" were already in the list`);
      } else {
        toast.success(`Added ${added.length} recipients from segment "${tag}"`);
      }
    } catch {
      toast.error("Failed to load segment");
    }
    setLoadingSegment(false);
  }

  async function saveCurrentAsSegment() {
    const tag = saveSegmentTag.trim().toLowerCase().replace(/[^a-z0-9_\- ]+/g, "").replace(/\s+/g, "-");
    if (!tag) { toast.error("Give the segment a name first"); return; }
    if (formRecipients.length === 0) { toast.error("Add some recipients first"); return; }

    setSavingSegment(true);
    try {
      const res = await fetch("/api/contacts/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: formRecipients.map((r) => ({ phone: r.phone, name: r.contactName })),
          tags: [tag],
        }),
      });
      const json = (await res.json()) as {
        data: { created: number; updated: number } | null;
        error: string | null;
      };
      if (!res.ok || !json.data) { toast.error(json.error ?? "Failed to save segment"); }
      else {
        const { created, updated } = json.data;
        toast.success(`Saved segment "${tag}" (${created} new, ${updated} updated)`);
        setSaveSegmentTag("");
        await loadContactTags();
      }
    } catch { toast.error("Failed to save segment"); }
    setSavingSegment(false);
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
      // Resolve per-recipient variable values from the column mapping. Recipients
      // with no value for a column-mapped variable fall back (server-side) to the
      // global templateVars. `vars` is omitted when there's nothing personalized.
      const varCount = selectedTemplate?.variableCount ?? 0;
      const recipientsPayload = formRecipients.map((r) => {
        const vars: Record<string, string> = {};
        for (let i = 1; i <= varCount; i++) {
          const key = String(i);
          const mapping = varColumnMap[key];
          if (mapping && mapping !== "__literal__") {
            const v = sanitizeVar(r.fields?.[mapping] ?? "");
            if (v) vars[key] = v;
          }
        }
        return Object.keys(vars).length > 0
          ? { phone: r.phone, contactName: r.contactName, vars }
          : { phone: r.phone, contactName: r.contactName };
      });

      // Global fallback values = the typed value for every variable (whether it's
      // an unmapped literal or the "default if blank" for a column-mapped one).
      // The server overlays each recipient's column value on top of this, so a
      // missing cell falls back here instead of emitting a literal "{{n}}".
      const globalVars: Record<string, string> = {};
      for (let i = 1; i <= varCount; i++) {
        const key = String(i);
        const v = sanitizeVar(templateVars[key] ?? "");
        if (v) globalVars[key] = v;
      }

      const res = await fetch("/api/whatsapp/broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName,
          templateId: selectedTemplateId,
          templateVars: globalVars,
          recipients: recipientsPayload,
          scheduledAt: scheduledAtIso,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) { toast.error(json.error ?? "Failed"); setCreating(false); return; }
      toast.success(scheduledAtIso ? "Broadcast scheduled" : "Broadcast created");
      setFormName(""); setSelectedTemplateId(""); setTemplateVars({}); setVarColumnMap({}); setCsvColumns([]); setFormRecipients([]); setFormScheduledAt("");
      setView("list"); await loadBroadcasts();
    } catch { toast.error("Failed"); }
    setCreating(false);
  }

  async function handleSend(id: string) {
    setSendingId(id);
    toast.success("Broadcast sending started");
    // Start the browser driver — it pushes the broadcast through every chunk to
    // completion. (The auto-resume effect also picks up SENDING broadcasts, but
    // we kick it now for an immediate start.)
    void driveBroadcast(id);
    // Let the first chunk flip the status, then refresh so the row shows Stop
    // and drop the Send spinner.
    setTimeout(() => {
      void loadBroadcasts();
      setSendingId((cur) => (cur === id ? null : cur));
    }, 1500);
  }

  async function handleDelete(id: string) {
    await fetch(`/api/whatsapp/broadcasts/${id}`, { method: "DELETE" });
    toast.success("Deleted"); if (view === "detail") setView("list");
    await loadBroadcasts();
  }

  // Track which broadcast is currently being stopped/resumed so we can disable
  // the relevant button + show a spinner. Plain string state is fine because
  // only one of these operations happens at a time per broadcast.
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const [resumingId, setResumingId] = useState<string | null>(null);

  async function handleStop(id: string) {
    if (!window.confirm("Stop this broadcast? In-flight messages may still complete, but no new messages will be sent. You can resume later.")) return;
    setStoppingId(id);
    try {
      const res = await fetch(`/api/whatsapp/broadcasts/${id}/stop`, { method: "POST" });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(json.error ?? "Failed to stop");
      } else {
        toast.success("Broadcast stopped");
      }
      await loadBroadcasts();
      if (view === "detail" && activeBroadcast?.id === id) {
        // Refresh the detail view so the Stop → Resume buttons swap correctly.
        const detailRes = await fetch(`/api/whatsapp/broadcasts/${id}`);
        const detailJson = (await detailRes.json()) as { data: (Broadcast & { recipients: Recipient[] }) | null };
        if (detailJson.data) setActiveBroadcast(detailJson.data);
      }
    } catch { toast.error("Failed to stop"); }
    setStoppingId(null);
  }

  async function handleResume(id: string) {
    setResumingId(id);
    try {
      const res = await fetch(`/api/whatsapp/broadcasts/${id}/resume`, { method: "POST" });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(json.error ?? "Failed to resume");
      } else {
        toast.success("Broadcast resumed");
        // Drive the requeued recipients to completion from the browser.
        void driveBroadcast(id);
      }
      await loadBroadcasts();
      if (view === "detail" && activeBroadcast?.id === id) {
        const detailRes = await fetch(`/api/whatsapp/broadcasts/${id}`);
        const detailJson = (await detailRes.json()) as { data: (Broadcast & { recipients: Recipient[] }) | null };
        if (detailJson.data) setActiveBroadcast(detailJson.data);
      }
    } catch { toast.error("Failed to resume"); }
    setResumingId(null);
  }

  const totalSent = broadcasts.reduce((s, b) => s + b.sentCount, 0);
  const totalFailed = broadcasts.reduce((s, b) => s + b.failedCount, 0);
  const approvedTemplates = templates.filter((t) => t.status === "APPROVED");

  /* ================================================================ */
  return (
    <div className="space-y-6">

      {/* ========== LIST VIEW ========== */}
      {view === "list" && (<>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-500/10">
              <Radio className="h-5 w-5 text-green-500" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold tracking-tight">Broadcasts</h1>
              <p className="text-xs text-muted-foreground truncate">{broadcasts.length} broadcasts · {totalSent} sent</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setView("templates")} className="inline-flex flex-1 sm:flex-none items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">
              <FileText className="h-4 w-4" /> Templates
            </button>
            <button onClick={() => setView("create")} className="inline-flex flex-1 sm:flex-none items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80 transition-colors">
              <Plus className="h-4 w-4" /> New Broadcast
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[
            { label: "Broadcasts", value: broadcasts.length, icon: Radio, color: "text-green-500", bg: "bg-green-500/10" },
            { label: "Messages Sent", value: totalSent, icon: Send, color: "text-blue-400", bg: "bg-blue-500/10" },
            { label: "Failed", value: totalFailed, icon: XCircle, color: "text-red-400", bg: "bg-red-500/10" },
            { label: "Templates", value: approvedTemplates.length, icon: FileText, color: "text-purple-400", bg: "bg-purple-500/10" },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="rounded-xl border bg-card p-3 sm:p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide truncate">{label}</p>
                  <p className="text-xl sm:text-2xl font-bold mt-1">{value}</p>
                </div>
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${bg}`}><Icon className={`h-4 w-4 ${color}`} /></div>
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
                <div key={b.id} onClick={() => void openDetail(b.id)} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4 rounded-xl border bg-card p-4 hover:border-primary/30 transition-colors cursor-pointer">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-0.5">
                      <span className="font-semibold text-sm truncate max-w-full">{b.name}</span>
                      <Badge status={b.status} />
                      {b.template && <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded truncate max-w-[140px]">{b.template.name}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{b.message}</p>
                  </div>
                  <div className="flex items-center gap-4 sm:gap-6 shrink-0 text-xs text-muted-foreground">
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
                  <div className="shrink-0 text-[11px] text-muted-foreground sm:w-20 text-left sm:text-right">{formatDistanceToNow(new Date(b.createdAt), { addSuffix: true })}</div>
                  <div className="flex items-center gap-1 shrink-0 self-end sm:self-auto" onClick={(e) => e.stopPropagation()}>
                    {b.status === "DRAFT" && (
                      <button onClick={() => void handleSend(b.id)} disabled={sendingId === b.id} className="flex h-8 w-8 items-center justify-center rounded-lg text-green-500 hover:bg-green-500/10" title="Send">
                        {sendingId === b.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                      </button>
                    )}
                    {b.status === "SENDING" && (
                      <button onClick={() => void handleStop(b.id)} disabled={stoppingId === b.id} className="flex h-8 w-8 items-center justify-center rounded-lg text-amber-500 hover:bg-amber-500/10" title="Stop broadcast">
                        {stoppingId === b.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
                      </button>
                    )}
                    {(b.status === "STOPPED" || b.status === "FAILED") && (
                      <button onClick={() => void handleResume(b.id)} disabled={resumingId === b.id} className="flex h-8 w-8 items-center justify-center rounded-lg text-green-500 hover:bg-green-500/10" title="Resume broadcast">
                        {resumingId === b.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => setView("list")} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><ArrowLeft className="h-4 w-4" /></button>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold tracking-tight">Message Templates</h1>
              <p className="text-xs text-muted-foreground truncate">Create and manage WhatsApp-approved message templates</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => void syncTemplates()} disabled={syncing} className="inline-flex flex-1 sm:flex-none items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} /> Sync from Meta
            </button>
            <button onClick={() => setShowTplForm(!showTplForm)} className="inline-flex flex-1 sm:flex-none items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80 transition-colors">
              <Plus className="h-4 w-4" /> Create Template
            </button>
          </div>
        </div>

        {/* Create template form */}
        {showTplForm && (
          <div className="rounded-xl border bg-card p-4 sm:p-5 space-y-4">
            <h3 className="text-sm font-semibold">New Template</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 rounded-lg border bg-background p-1">
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
                    <div key={idx} className="flex flex-wrap items-center gap-2 rounded-lg border bg-background p-2">
                      <span className="shrink-0 rounded bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">
                        {b.type === "QUICK_REPLY" ? "Reply" : b.type === "URL" ? "URL" : "Phone"}
                      </span>
                      <input
                        value={b.text}
                        onChange={(e) => updateButton(idx, { text: e.target.value })}
                        placeholder="Button text (e.g. Visit website)"
                        maxLength={25}
                        className="flex-1 min-w-[140px] rounded-md border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary"
                      />
                      {b.type === "URL" && (
                        <input
                          value={(b as { url: string }).url}
                          onChange={(e) => updateButton(idx, { url: e.target.value })}
                          placeholder="https://example.com"
                          className="flex-[2] min-w-[160px] rounded-md border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary"
                        />
                      )}
                      {b.type === "PHONE_NUMBER" && (
                        <input
                          value={(b as { phone: string }).phone}
                          onChange={(e) => updateButton(idx, { phone: e.target.value })}
                          placeholder="+15551234567"
                          className="flex-[2] min-w-[160px] rounded-md border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary"
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

        {/* Template grid */}
        {templates.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center border rounded-xl bg-card">
            <FileText className="h-10 w-10 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">No templates yet</p>
            <p className="text-xs text-muted-foreground/60">Click &quot;Sync from Meta&quot; to import existing templates, or create a new one</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {templates.map((t) => {
              const canBroadcast = t.status === "APPROVED";
              const menuOpen = openMenuId === t.id;
              return (
                <div
                  key={t.id}
                  className="group relative flex flex-col rounded-xl border bg-card overflow-hidden hover:border-primary/40 transition-colors"
                >
                  {/* Preview area — clickable to open full preview */}
                  <button
                    type="button"
                    onClick={() => setPreviewTpl(t)}
                    className="block w-full text-left cursor-pointer focus:outline-none"
                    style={{
                      background: "#0b141a",
                      padding: 16,
                    }}
                    aria-label={`Preview ${t.name}`}
                  >
                    <div style={{ pointerEvents: "none" }}>
                      <TemplatePreviewCard template={t} compact />
                    </div>
                  </button>

                  {/* Three-dots menu (top-right corner overlay) */}
                  <div data-tpl-menu className="absolute top-2 right-2 z-10">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setOpenMenuId(menuOpen ? null : t.id); }}
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-black/40 backdrop-blur text-white/90 hover:bg-black/60"
                      title="Actions"
                      aria-label="Template actions"
                    >
                      <MoreVertical className="h-3.5 w-3.5" />
                    </button>
                    {menuOpen && (
                      <div
                        className="absolute right-0 mt-1 w-48 rounded-md border bg-popover text-popover-foreground shadow-lg"
                        style={{ zIndex: 20 }}
                      >
                        <button
                          type="button"
                          onClick={() => startBroadcastFromTemplate(t)}
                          disabled={!canBroadcast}
                          className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                          title={canBroadcast ? "Create a broadcast using this template" : "Template must be approved before you can broadcast"}
                        >
                          <Send className="h-3.5 w-3.5 text-green-500" />
                          <span>Send a broadcast</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => { setOpenMenuId(null); duplicateTemplate(t); }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-muted"
                        >
                          <Copy className="h-3.5 w-3.5 text-blue-400" />
                          <span>Duplicate</span>
                        </button>
                        <div className="h-px bg-border" />
                        <button
                          type="button"
                          onClick={() => { setOpenMenuId(null); void deleteTemplate(t.id); }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-red-500/10 text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Delete</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Footer: name + tags */}
                  <div className="flex flex-col gap-2 p-3 border-t">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-xs font-semibold truncate flex-1" title={t.name}>{t.name}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge status={t.status} />
                      <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded uppercase tracking-wide">{t.category}</span>
                      <span className="text-[10px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded uppercase">{t.language}</span>
                      {t.variableCount > 0 && (
                        <span className="text-[10px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">
                          {t.variableCount} var{t.variableCount !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </>)}

      {/* ========== CREATE VIEW ========== */}
      {view === "create" && (<>
        <div className="flex items-center gap-3">
          <button onClick={() => setView("list")} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><ArrowLeft className="h-4 w-4" /></button>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight">
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

            {/* Template selection — preview-style grid with search */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Message Template
                  {selectedTemplate && (
                    <span className="ml-2 text-[11px] normal-case text-primary">
                      · {selectedTemplate.name}
                    </span>
                  )}
                </label>
                {selectedTemplate && (
                  <button
                    type="button"
                    onClick={() => { setSelectedTemplateId(""); setTemplateVars({}); setVarColumnMap({}); }}
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                )}
              </div>

              {approvedTemplates.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-center">
                  <p className="text-sm text-muted-foreground mb-2">No approved templates available</p>
                  <button onClick={() => setView("templates")} className="text-xs text-primary hover:underline">Go to Templates →</button>
                </div>
              ) : (
                <>
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <input
                      type="text"
                      value={templateSearch}
                      onChange={(e) => setTemplateSearch(e.target.value)}
                      placeholder="Search templates by name or message body..."
                      className="w-full rounded-lg border bg-background pl-9 pr-3 py-2 text-sm outline-none focus:border-primary"
                    />
                    {templateSearch && (
                      <button
                        type="button"
                        onClick={() => setTemplateSearch("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted"
                        aria-label="Clear search"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Filtered preview grid */}
                  {(() => {
                    const q = templateSearch.trim().toLowerCase();
                    const filteredApproved = q
                      ? approvedTemplates.filter((t) =>
                          t.name.toLowerCase().includes(q) ||
                          t.body.toLowerCase().includes(q) ||
                          (t.header ?? "").toLowerCase().includes(q) ||
                          (t.footer ?? "").toLowerCase().includes(q),
                        )
                      : approvedTemplates;

                    if (filteredApproved.length === 0) {
                      return (
                        <div className="rounded-lg border border-dashed p-4 text-center">
                          <p className="text-xs text-muted-foreground">No templates match &quot;{templateSearch}&quot;</p>
                        </div>
                      );
                    }

                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {filteredApproved.map((t) => {
                          const selected = selectedTemplateId === t.id;
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => { setSelectedTemplateId(t.id); setTemplateVars({}); setVarColumnMap({}); }}
                              className={`relative flex flex-col rounded-xl border overflow-hidden transition-all text-left ${
                                selected
                                  ? "border-primary ring-2 ring-primary/30 bg-primary/5"
                                  : "bg-card hover:border-primary/40"
                              }`}
                              aria-pressed={selected}
                            >
                              {selected && (
                                <div className="absolute top-2 right-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                                  <Check className="h-3.5 w-3.5" />
                                </div>
                              )}
                              {/* Preview */}
                              <div style={{ background: "#0b141a", padding: 12, pointerEvents: "none" }}>
                                <TemplatePreviewCard template={t} compact />
                              </div>
                              {/* Footer strip */}
                              <div className="flex flex-col gap-1.5 p-2.5 border-t">
                                <span className="font-mono text-[11px] font-semibold truncate" title={t.name}>{t.name}</span>
                                <div className="flex flex-wrap items-center gap-1">
                                  <Badge status={t.status} />
                                  <span className="text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded uppercase">{t.category}</span>
                                  <span className="text-[9px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded uppercase">{t.language}</span>
                                  {t.variableCount > 0 && (
                                    <span className="text-[9px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">
                                      {t.variableCount} var{t.variableCount !== 1 ? "s" : ""}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}
                </>
              )}
            </div>

            {/* Variable inputs — map each {{n}} to a CSV column, or type a constant */}
            {selectedTemplate && selectedTemplate.variableCount > 0 && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Template Variables</label>
                {csvColumns.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Pick a column from your uploaded file for each variable (personalized per recipient), or choose “Custom value” to use one value for everyone.
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Array.from({ length: selectedTemplate.variableCount }, (_, i) => {
                    const key = String(i + 1);
                    const mapping = varColumnMap[key] ?? "";
                    const isColumnMapped = csvColumns.length > 0 && mapping !== "" && mapping !== "__literal__";
                    return (
                      <div key={i} className="space-y-1">
                        <label className="text-[11px] text-muted-foreground">{`{{${i + 1}}}`}</label>
                        {csvColumns.length > 0 && (
                          <select
                            value={mapping}
                            onChange={(e) => setVarColumnMap((prev) => ({ ...prev, [key]: e.target.value }))}
                            className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                          >
                            <option value="">— choose column —</option>
                            {csvColumns.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                            <option value="__literal__">Custom value…</option>
                          </select>
                        )}
                        {/* Always available: the value when unmapped, or the fallback used
                            for any recipient whose mapped column cell is blank. */}
                        <input
                          value={templateVars[key] ?? ""}
                          onChange={(e) => setTemplateVars((prev) => ({ ...prev, [key]: e.target.value }))}
                          placeholder={isColumnMapped ? "Default if blank (optional)" : `Value for {{${i + 1}}}`}
                          className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Message preview — full WhatsApp-style with media, header, footer, buttons */}
            {selectedTemplate && (
              <div className="space-y-2">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Message Preview</p>
                <div className="rounded-lg border p-4" style={{ background: "#0b141a" }}>
                  <TemplatePreviewCard template={selectedTemplate} values={previewVars} compact />
                </div>
              </div>
            )}

            {/* Recipients */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recipients</label>
                {/* Mode toggle */}
                <div className="inline-flex rounded-lg border bg-background p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setRecipientMode("manual")}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1 transition-colors ${
                      recipientMode === "manual"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <Upload className="h-3 w-3" /> Upload / Manual
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecipientMode("segment")}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1 transition-colors ${
                      recipientMode === "segment"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <Tag className="h-3 w-3" /> From segment
                  </button>
                </div>
              </div>

              {recipientMode === "manual" && (
                <>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => fileRef.current?.click()} className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-lg border bg-background px-4 py-2.5 text-sm font-medium hover:bg-muted">
                      <Upload className="h-4 w-4" /> Upload CSV
                    </button>
                    <input ref={fileRef} type="file" accept=".csv,.txt,.tsv" onChange={handleFileUpload} className="hidden" />
                    <input value={manualPhone} onChange={(e) => setManualPhone(e.target.value)} placeholder="+971501234567" className="flex-1 min-w-[140px] rounded-lg border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" onKeyDown={(e) => { if (e.key === "Enter") addManual(); }} />
                    <input value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="Name" className="w-24 sm:w-32 rounded-lg border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" onKeyDown={(e) => { if (e.key === "Enter") addManual(); }} />
                    <button onClick={addManual} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/80"><Plus className="h-4 w-4" /></button>
                  </div>
                  <p className="text-[10px] text-muted-foreground/50">CSV: one number per line, or phone,name columns</p>
                </>
              )}

              {recipientMode === "segment" && (
                <div className="space-y-2">
                  {contactTags.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-4 text-center space-y-2">
                      <Tag className="h-6 w-6 text-muted-foreground/30 mx-auto" />
                      <p className="text-xs text-muted-foreground">
                        No saved segments yet. Upload a CSV in &quot;Upload / Manual&quot;, then save it as a segment below.
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-lg border bg-background overflow-hidden">
                      <div className="max-h-64 overflow-y-auto divide-y">
                        {contactTags.map((tag) => {
                          const picked = pickedSegmentTags.includes(tag.name);
                          return (
                            <button
                              key={tag.name}
                              type="button"
                              onClick={() => void toggleSegmentTag(tag.name)}
                              disabled={loadingSegment}
                              className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors disabled:opacity-60 ${
                                picked ? "bg-primary/5" : "hover:bg-muted"
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <div
                                  className={`flex h-5 w-5 items-center justify-center rounded ${
                                    picked ? "bg-primary text-primary-foreground" : "border bg-background"
                                  }`}
                                >
                                  {picked && <Check className="h-3 w-3" />}
                                </div>
                                <span className="text-sm font-medium truncate">{tag.name}</span>
                              </div>
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                {tag.memberCount} contact{tag.memberCount !== 1 ? "s" : ""}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground/60">
                    Each tag is a segment. Picking a segment adds its contacts to the recipient list (deduped).
                  </p>
                </div>
              )}

              {/* Save current recipients as a new segment */}
              {formRecipients.length > 0 && (
                <div className="rounded-lg border border-dashed bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Save className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Save current {formRecipients.length} recipients as a segment
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <input
                      value={saveSegmentTag}
                      onChange={(e) => setSaveSegmentTag(e.target.value)}
                      placeholder="e.g. purchased, vip, newsletter"
                      className="flex-1 min-w-[160px] rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                      onKeyDown={(e) => { if (e.key === "Enter") void saveCurrentAsSegment(); }}
                    />
                    <button
                      type="button"
                      onClick={() => void saveCurrentAsSegment()}
                      disabled={savingSegment || !saveSegmentTag.trim()}
                      className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-medium hover:bg-primary/80 disabled:opacity-50"
                    >
                      {savingSegment ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      Save segment
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground/60">
                    Creates contact records for any new phone numbers and tags them with the segment name.
                  </p>
                </div>
              )}
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
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button onClick={() => void handleCreate()} disabled={creating || !formName.trim() || !selectedTemplateId || formRecipients.length === 0} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed">
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => { setView("list"); setActiveBroadcast(null); }} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><ArrowLeft className="h-4 w-4" /></button>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold tracking-tight truncate">{activeBroadcast?.name ?? "Loading..."}</h1>
              {activeBroadcast && <p className="text-xs text-muted-foreground truncate">Created {format(new Date(activeBroadcast.createdAt), "d MMM yyyy, HH:mm")}</p>}
            </div>
          </div>
          {activeBroadcast && (
            <div className="flex flex-wrap items-center gap-2">
              {activeBroadcast.status === "DRAFT" && (
                <button onClick={() => void handleSend(activeBroadcast.id)} disabled={sendingId === activeBroadcast.id} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
                  {sendingId === activeBroadcast.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Send Now
                </button>
              )}
              {activeBroadcast.status === "SENDING" && (
                <button
                  onClick={() => void handleStop(activeBroadcast.id)}
                  disabled={stoppingId === activeBroadcast.id}
                  className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
                >
                  {stoppingId === activeBroadcast.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
                  Stop Broadcast
                </button>
              )}
              {(activeBroadcast.status === "STOPPED" || activeBroadcast.status === "FAILED") && (
                <button
                  onClick={() => void handleResume(activeBroadcast.id)}
                  disabled={resumingId === activeBroadcast.id}
                  className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {resumingId === activeBroadcast.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
                  Resume Broadcast
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
            {[
              { label: "Total", value: activeBroadcast.totalCount, color: "text-foreground" },
              { label: "Sent", value: activeBroadcast.sentCount, color: "text-blue-400" },
              { label: "Delivered", value: activeBroadcast.deliveredCount, color: "text-emerald-400" },
              { label: "Read", value: activeBroadcast.readCount, color: "text-purple-400" },
              { label: "Failed", value: activeBroadcast.failedCount, color: "text-red-400" },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-xl border bg-card p-3 sm:p-4 text-center">
                <p className={`text-xl sm:text-2xl font-bold ${color}`}>{value}</p>
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

          <div className="flex flex-wrap items-center gap-2">
            <Badge status={activeBroadcast.status} />
            {activeBroadcast.startedAt && <span className="text-xs text-muted-foreground">Started {format(new Date(activeBroadcast.startedAt), "d MMM HH:mm")}</span>}
            {activeBroadcast.completedAt && <span className="text-xs text-muted-foreground">· Completed {format(new Date(activeBroadcast.completedAt), "d MMM HH:mm")}</span>}
          </div>

          {/* Recipients table */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-4 py-3 border-b">
              <span className="text-sm font-medium shrink-0">Recipients ({activeBroadcast.recipients.length})</span>
              <div className="flex items-center gap-1 overflow-x-auto -mx-1 px-1 sm:flex-wrap sm:overflow-visible sm:justify-end">
                {["all", "PENDING", "SENT", "DELIVERED", "READ", "FAILED"].map((f) => (
                  <button key={f} onClick={() => setRecipientFilter(f)} className={`shrink-0 px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${recipientFilter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
                    {f === "all" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            </div>
            <div className="max-h-[500px] overflow-auto">
              <table className="w-full min-w-[560px] text-sm">
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

      {/* ========== TEMPLATE PREVIEW MODAL ========== */}
      {previewTpl && (
        <div
          onClick={() => setPreviewTpl(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--card, #1a1a1a)",
              border: "1px solid var(--border, #2a2a2a)",
              borderRadius: 12,
              width: "100%",
              maxWidth: 480,
              maxHeight: "calc(100vh - 32px)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* Modal header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 18px",
                borderBottom: "1px solid var(--border, #2a2a2a)",
                flexShrink: 0,
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                  <span
                    style={{
                      fontFamily: "monospace",
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--foreground, #fff)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {previewTpl.name}
                  </span>
                  <Badge status={previewTpl.status} />
                </div>
                <div style={{ fontSize: 11, color: "var(--muted-foreground, #888)" }}>
                  {previewTpl.category} · {previewTpl.language}
                  {previewTpl.variableCount > 0 ? ` · ${previewTpl.variableCount} variable${previewTpl.variableCount === 1 ? "" : "s"}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0, marginLeft: 12 }}>
                {previewTpl.status === "APPROVED" && (
                  <button
                    onClick={() => startBroadcastFromTemplate(previewTpl)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-2.5 sm:px-3 py-1.5 text-xs font-medium hover:bg-primary/80"
                    title="Create a broadcast using this template"
                  >
                    <Send className="h-3.5 w-3.5" /> {!isMobile && "Broadcast"}
                  </button>
                )}
                <button
                  onClick={() => duplicateTemplate(previewTpl)}
                  className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 sm:px-3 py-1.5 text-xs font-medium hover:bg-muted"
                  title="Duplicate this template"
                >
                  <Copy className="h-3.5 w-3.5" /> {!isMobile && "Duplicate"}
                </button>
                <button
                  onClick={() => setPreviewTpl(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                  aria-label="Close preview"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Scrollable WhatsApp-style preview */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                background: "#0b141a",
                padding: isMobile ? 14 : 24,
                display: "flex",
                justifyContent: "center",
              }}
            >
              <TemplatePreviewCard template={previewTpl} compact />
            </div>

            {/* Footer info */}
            <div
              style={{
                padding: "10px 18px",
                borderTop: "1px solid var(--border, #2a2a2a)",
                fontSize: 11,
                color: "var(--muted-foreground, #888)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexShrink: 0,
              }}
            >
              <span>Created {format(new Date(previewTpl.createdAt), "d MMM yyyy")}</span>
              {previewTpl.headerType && previewTpl.headerType !== "TEXT" && (
                <span style={{ textTransform: "lowercase" }}>{previewTpl.headerType} header</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
