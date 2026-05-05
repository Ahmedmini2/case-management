"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  CheckCheck,
  Clock,
  FileText,
  Loader2,
  MessageSquarePlus,
  Paperclip,
  Send,
  X,
} from "lucide-react";

interface Message {
  id: string;
  conversationId: string;
  direction: string;
  sender: string;
  senderName: string;
  body: string;
  mediaUrl?: string;
  mediaType?: string;
  timestamp: string;
  status: string;
  isAI: boolean;
}

interface Conversation {
  id: string;
  contactName: string;
  contactPhone: string;
  lastMessage: string | null;
  lastMessageAt: string;
  unreadCount: number;
  status: string;
  handledBy: string;
  agentId?: string | null;
  caseId?: string | null;
  tags?: string[];
}

interface TemplateLite {
  id: string;
  name: string;
  language: string;
  status: string;
  body: string;
  variableCount: number;
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

function dateDivider(dateStr: string): string {
  const d = new Date(dateStr);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEE d MMM");
}

function MsgStatus({ status }: { status: string }) {
  if (status === "read") return <CheckCheck className="h-3 w-3 text-blue-400" />;
  if (status === "delivered") return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
  if (status === "failed") return <X className="h-3 w-3 text-red-500" />;
  return <Check className="h-3 w-3 text-muted-foreground" />;
}

export function CaseWhatsAppPanel({
  contactName,
  contactPhone,
  caseId,
}: {
  contactName: string;
  contactPhone: string;
  caseId: string;
}) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [takingOver, setTakingOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const userPinnedToBottomRef = useRef(true);
  const prevMsgCountRef = useRef(0);
  const prevConvIdRef = useRef<string | null>(null);

  // Templates
  const [tplOpen, setTplOpen] = useState(false);
  const [tplList, setTplList] = useState<TemplateLite[]>([]);
  const [tplId, setTplId] = useState("");
  const [tplVars, setTplVars] = useState<Record<string, string>>({});
  const [tplSending, setTplSending] = useState(false);
  const tplSelected = tplList.find((t) => t.id === tplId) ?? null;

  /* ---- Find or create the conversation by phone ---- */
  const findConversation = useCallback(async () => {
    const normalized = contactPhone.replace(/[^+\d]/g, "");
    if (!normalized || normalized.length < 7) {
      setLoading(false);
      return null;
    }
    try {
      const res = await fetch(
        `/api/whatsapp/conversations?phone=${encodeURIComponent(normalized.startsWith("+") ? normalized : `+${normalized}`)}`,
        { cache: "no-store" },
      );
      const json = (await res.json()) as { data: Conversation[] | null };
      const found = (json.data ?? [])[0] ?? null;
      setConversation(found);
      // Auto-link the conversation to this case so future inbound updates the timeline
      if (found && !found.caseId) {
        await fetch(`/api/whatsapp/conversations/${found.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ caseId }),
        });
      }
      return found;
    } catch {
      return null;
    } finally {
      setLoading(false);
    }
  }, [contactPhone, caseId]);

  useEffect(() => {
    void findConversation();
  }, [findConversation]);

  /* ---- Messages ---- */
  const loadMessages = useCallback(async (convId: string) => {
    try {
      const res = await fetch(`/api/whatsapp/conversations/${convId}/messages`, { cache: "no-store" });
      const json = (await res.json()) as { data: Message[] | null };
      setMessages(json.data ?? []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (!conversation) { setMessages([]); return; }
    void loadMessages(conversation.id);
    const id = setInterval(() => void loadMessages(conversation.id), 20000);
    return () => clearInterval(id);
  }, [conversation, loadMessages]);

  /* ---- Smart auto-scroll (don't yank user back when reading older messages) ---- */
  useEffect(() => {
    const convChanged = prevConvIdRef.current !== (conversation?.id ?? null);
    if (convChanged) {
      prevConvIdRef.current = conversation?.id ?? null;
      prevMsgCountRef.current = messages.length;
      userPinnedToBottomRef.current = true;
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
      });
      return;
    }
    if (messages.length > prevMsgCountRef.current) {
      const newest = messages[messages.length - 1];
      const isOwnOutbound = newest?.direction === "outbound";
      if (userPinnedToBottomRef.current || isOwnOutbound) {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        userPinnedToBottomRef.current = true;
      }
    }
    prevMsgCountRef.current = messages.length;
  }, [messages, conversation?.id]);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    userPinnedToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  /* ---- 24-hour Meta policy window ---- */
  const lastInboundAt = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].direction === "inbound") return new Date(messages[i].timestamp).getTime();
    }
    return null;
  })();
  const windowExpired = !!conversation && (lastInboundAt === null || (Date.now() - lastInboundAt) > TWENTY_FOUR_HOURS_MS);
  const windowMsRemaining = lastInboundAt !== null ? Math.max(0, TWENTY_FOUR_HOURS_MS - (Date.now() - lastInboundAt)) : 0;

  /* ---- Start a chat (when none exists for this contact) ---- */
  async function startChat() {
    let phone = contactPhone.replace(/[^+\d]/g, "");
    if (!phone) { toast.error("Contact has no phone"); return; }
    if (!phone.startsWith("+")) phone = `+${phone}`;
    setCreating(true);
    try {
      const res = await fetch("/api/whatsapp/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactName, contactPhone: phone }),
      });
      const json = (await res.json()) as { data?: Conversation; error?: string };
      if (!res.ok || !json.data) {
        toast.error(json.error ?? "Failed to start chat");
        return;
      }
      // Link to case
      await fetch(`/api/whatsapp/conversations/${json.data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId }),
      });
      setConversation(json.data);
      toast.success("Chat created. Send an approved template to start the conversation.");
    } catch {
      toast.error("Failed to start chat");
    } finally {
      setCreating(false);
    }
  }

  /* ---- Send text ---- */
  async function handleSend() {
    if (!conversation || !replyText.trim() || sending) return;
    const text = replyText.trim();
    setReplyText("");
    setSending(true);
    const optimistic: Message = {
      id: `opt-${Date.now()}`,
      conversationId: conversation.id,
      direction: "outbound",
      sender: "agent",
      senderName: "You",
      body: text,
      timestamp: new Date().toISOString(),
      status: "sent",
      isAI: false,
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      const res = await fetch(`/api/whatsapp/conversations/${conversation.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      if (!res.ok) throw new Error();
      const json = (await res.json()) as { data: Message };
      setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? json.data : m)));
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      toast.error("Failed to send message");
    } finally {
      setSending(false);
    }
  }

  /* ---- Attach media ---- */
  async function handleAttach(file: File) {
    if (!conversation || attaching) return;
    setAttaching(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/whatsapp/conversations/${conversation.id}/messages/media`, {
        method: "POST",
        body: form,
      });
      const json = (await res.json()) as { data: Message | null; error: string | null };
      if (!res.ok || !json.data) {
        toast.error(json.error ?? "Failed to send file");
        return;
      }
      setMessages((prev) => [...prev, json.data as Message]);
      toast.success(`Sent ${file.name}`);
    } catch {
      toast.error("Failed to send file");
    } finally {
      setAttaching(false);
    }
  }

  /* ---- Take over / hand back to AI ---- */
  async function toggleHandoff() {
    if (!conversation) return;
    setTakingOver(true);
    const next = conversation.handledBy === "AI" ? "human" : "ai";
    try {
      await fetch(`/api/whatsapp/conversations/${conversation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handledBy: next }),
      });
      const refreshed = await findConversation();
      if (refreshed) toast.success(next === "human" ? "You took over" : "Handed back to AI");
    } catch {
      toast.error("Failed to update");
    } finally {
      setTakingOver(false);
    }
  }

  /* ---- Templates ---- */
  async function openTemplate() {
    setTplOpen(true);
    setTplId("");
    setTplVars({});
    try {
      const res = await fetch("/api/whatsapp/templates");
      const json = (await res.json()) as { data: TemplateLite[] | null };
      setTplList((json.data ?? []).filter((t) => t.status === "APPROVED"));
    } catch {
      toast.error("Failed to load templates");
    }
  }

  async function sendTemplate() {
    if (!conversation || !tplId || tplSending) return;
    setTplSending(true);
    try {
      const res = await fetch(`/api/whatsapp/conversations/${conversation.id}/messages/template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: tplId, variables: tplVars }),
      });
      const json = (await res.json()) as { data: Message | null; error: string | null };
      if (!res.ok || !json.data) {
        toast.error(json.error ?? "Failed to send template");
        return;
      }
      setMessages((prev) => [...prev, json.data as Message]);
      setTplOpen(false);
      toast.success("Template sent");
    } catch {
      toast.error("Failed to send template");
    } finally {
      setTplSending(false);
    }
  }

  let tplPreview = tplSelected?.body ?? "";
  for (const [k, v] of Object.entries(tplVars)) {
    tplPreview = tplPreview.replaceAll(`{{${k}}}`, v || `{{${k}}}`);
  }

  /* ---- Group messages by date ---- */
  const grouped: { date: string; items: Message[] }[] = [];
  for (const msg of messages) {
    const label = dateDivider(msg.timestamp);
    const last = grouped[grouped.length - 1];
    if (last && last.date === label) last.items.push(msg);
    else grouped.push({ date: label, items: [msg] });
  }

  /* ---- Render ---- */

  if (!contactPhone) {
    return (
      <div className="rounded-lg border bg-muted/30 p-8 text-center">
        <p className="text-sm text-muted-foreground">No phone number on this contact.</p>
        <p className="text-xs text-muted-foreground/70 mt-1">Add a phone to the contact to enable WhatsApp.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-[600px] items-center justify-center rounded-lg border bg-muted/30">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border bg-muted/30 p-12 text-center">
        <MessageSquarePlus className="h-10 w-10 text-muted-foreground/40" />
        <div>
          <p className="text-sm font-medium">No WhatsApp conversation yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Start a chat with <span className="font-mono">{contactPhone}</span> — the first message must be an approved template.
          </p>
        </div>
        <button
          onClick={() => void startChat()}
          disabled={creating}
          className="inline-flex items-center gap-2 rounded-md bg-[#25D366] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquarePlus className="h-4 w-4" />}
          Start chat
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-[640px] flex-col rounded-lg border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex h-12 items-center justify-between border-b bg-muted/30 px-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-2 w-2 rounded-full bg-[#25D366] shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{conversation.contactName}</div>
            <div className="text-[11px] text-muted-foreground font-mono">{conversation.contactPhone}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium ${conversation.handledBy === "AI" ? "bg-blue-500/20 text-blue-400" : "bg-purple-500/20 text-purple-400"}`}>
            {conversation.handledBy === "AI" ? "🤖 AI" : "👤 Human"}
          </span>
          <button
            onClick={() => void toggleHandoff()}
            disabled={takingOver}
            className="inline-flex items-center gap-1 rounded border bg-background px-3 py-1 text-xs font-medium hover:bg-muted disabled:opacity-60"
          >
            <ArrowLeftRight className="h-3 w-3" />
            {takingOver ? "..." : conversation.handledBy === "AI" ? "Take over" : "Hand back"}
          </button>
          <button
            onClick={() => void openTemplate()}
            className="inline-flex items-center gap-1 rounded border bg-background px-3 py-1 text-xs font-medium hover:bg-muted"
          >
            <FileText className="h-3 w-3" />
            Template
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-5 py-4 bg-background"
      >
        {grouped.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No messages yet — send a template to begin.
          </div>
        ) : (
          grouped.map((g) => (
            <div key={g.date}>
              <div className="my-3 flex justify-center">
                <span className="rounded bg-muted px-3 py-0.5 text-[10px] text-muted-foreground">{g.date}</span>
              </div>
              {g.items.map((msg) => {
                const isOutbound = msg.direction === "outbound";
                return (
                  <div key={msg.id} className={`mb-2 flex ${isOutbound ? "justify-end" : "justify-start"}`}>
                    <div className="max-w-[70%]">
                      {isOutbound && (
                        <div className="text-[10px] text-right text-muted-foreground mb-0.5">
                          {msg.isAI ? "🤖 AI" : `👤 ${msg.senderName}`}
                        </div>
                      )}
                      <div
                        className={`rounded-lg px-3 py-2 text-sm ${
                          isOutbound
                            ? msg.isAI
                              ? "bg-blue-950/50 border border-blue-900 text-blue-100"
                              : "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground"
                        }`}
                      >
                        {msg.mediaUrl && msg.mediaType === "image" && (
                          <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer">
                            <img src={msg.mediaUrl} alt="media" className="mb-1 max-w-[260px] rounded" />
                          </a>
                        )}
                        {msg.mediaUrl && msg.mediaType === "video" && (
                          <video src={msg.mediaUrl} controls className="mb-1 max-w-[280px] rounded" />
                        )}
                        {msg.mediaUrl && msg.mediaType === "audio" && (
                          <audio src={msg.mediaUrl} controls className="mb-1" />
                        )}
                        {msg.mediaUrl && !["image", "video", "audio"].includes(msg.mediaType ?? "") && (
                          <a
                            href={msg.mediaUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mb-1 flex items-center gap-1 text-xs underline"
                          >
                            <FileText className="h-3 w-3" />
                            {msg.mediaType ?? "Document"}
                          </a>
                        )}
                        <div className="whitespace-pre-wrap break-words">{msg.body}</div>
                        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-70">
                          <span>{format(new Date(msg.timestamp), "HH:mm")}</span>
                          {isOutbound && <MsgStatus status={msg.status} />}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply bar / 24h gate */}
      {conversation.handledBy === "AI" ? (
        <div className="flex items-center gap-2 border-t bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
          🤖 AI is handling this chat. Take over to reply.
        </div>
      ) : windowExpired ? (
        <div className="flex items-center gap-3 border-t border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-amber-500">24-hour reply window has expired</div>
            <div className="text-[11px] text-amber-500/70">
              {lastInboundAt
                ? `Last customer message ${formatDistanceToNow(new Date(lastInboundAt), { addSuffix: true })}.`
                : "No inbound message yet."}{" "}
              Send an approved template to re-open the conversation.
            </div>
          </div>
          <button
            onClick={() => void openTemplate()}
            className="inline-flex items-center gap-1 rounded bg-amber-500 px-3 py-1.5 text-xs font-semibold text-black hover:opacity-90"
          >
            <FileText className="h-3 w-3" />
            Send Template
          </button>
        </div>
      ) : (
        <>
          {windowMsRemaining > 0 && windowMsRemaining < 6 * 60 * 60 * 1000 && (
            <div className="flex items-center gap-1.5 border-t border-amber-500/20 bg-amber-500/5 px-4 py-1.5 text-[11px] text-amber-500">
              <Clock className="h-3 w-3" />
              {Math.floor(windowMsRemaining / 3600000)}h {Math.floor((windowMsRemaining % 3600000) / 60000)}m left in the 24h reply window.
            </div>
          )}
          <div className="flex items-end gap-2 border-t bg-muted/30 px-3 py-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/jpeg,image/png,image/webp,video/mp4,video/3gpp,audio/aac,audio/mp4,audio/mpeg,audio/amr,audio/ogg,application/pdf,text/plain"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleAttach(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={attaching}
              className="flex h-9 w-9 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-50"
              title="Attach file"
            >
              {attaching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
            </button>
            <textarea
              value={replyText}
              onChange={(e) => {
                setReplyText(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder="Type a message..."
              rows={1}
              className="flex-1 resize-none rounded border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus:ring-1 focus:ring-primary/40"
              style={{ maxHeight: 120 }}
            />
            <button
              onClick={() => void handleSend()}
              disabled={!replyText.trim() || sending}
              className="flex h-9 w-9 items-center justify-center rounded bg-primary text-primary-foreground disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </>
      )}

      {/* Template modal */}
      {tplOpen && (
        <div
          onClick={() => !tplSending && setTplOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-5"
        >
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md max-h-[80vh] flex flex-col rounded-lg border bg-card overflow-hidden">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold">Send Template</h3>
                <p className="text-xs text-muted-foreground">to {conversation.contactName}</p>
              </div>
              <button onClick={() => !tplSending && setTplOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {tplList.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No approved templates. Submit one in the Broadcast page.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {tplList.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => { setTplId(t.id); setTplVars({}); }}
                      className={`w-full text-left rounded border px-3 py-2 ${tplId === t.id ? "border-primary bg-primary/5" : "hover:bg-muted"}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-semibold">{t.name}</span>
                        <span className="text-[10px] text-muted-foreground">{t.language}</span>
                        {t.variableCount > 0 && (
                          <span className="text-[10px] text-blue-500">{t.variableCount} var{t.variableCount > 1 ? "s" : ""}</span>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2">{t.body}</p>
                    </button>
                  ))}
                </div>
              )}
              {tplSelected && tplSelected.variableCount > 0 && (
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Variables</label>
                  <div className="mt-1 space-y-1.5">
                    {Array.from({ length: tplSelected.variableCount }, (_, i) => i + 1).map((n) => (
                      <input
                        key={n}
                        value={tplVars[String(n)] ?? ""}
                        onChange={(e) => setTplVars((p) => ({ ...p, [String(n)]: e.target.value }))}
                        placeholder={`Value for {{${n}}}`}
                        className="w-full rounded border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary/40"
                      />
                    ))}
                  </div>
                </div>
              )}
              {tplSelected && (
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Preview</label>
                  <div className="mt-1 rounded bg-muted px-3 py-2 text-xs whitespace-pre-wrap">
                    {tplPreview}
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
              <button onClick={() => !tplSending && setTplOpen(false)} className="rounded border px-3 py-1.5 text-xs hover:bg-muted">
                Cancel
              </button>
              <button
                onClick={() => void sendTemplate()}
                disabled={!tplId || tplSending}
                className="inline-flex items-center gap-1 rounded bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
              >
                {tplSending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
