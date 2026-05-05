"use client";

import Link from "next/link";
import { useEffect, useState, useRef, useCallback } from "react";
import { formatDistanceToNow, format, isToday, isYesterday } from "date-fns";
import { toast } from "sonner";
import {
  Phone,
  Search,
  Send,
  Paperclip,
  MoreHorizontal,
  ArrowLeftRight,
  ExternalLink,
  X,
  Check,
  CheckCheck,
  Image,
  Video,
  Mic,
  FileText,
  Download,
  Plus,
  Tag,
  Ban,
  Smile,
  Loader2,
  Sparkles,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
  MessageSquarePlus,
  Radio,
  AlertTriangle,
  Clock,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  TYPES                                                              */
/* ------------------------------------------------------------------ */

interface Conversation {
  id: string;
  contactName: string;
  contactPhone: string;
  contactAvatar?: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  status: string;
  handledBy: string;
  agentId?: string;
  caseId?: string;
  caseNumber?: string;
  tags: string[];
}

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

/* ------------------------------------------------------------------ */
/*  HELPERS                                                            */
/* ------------------------------------------------------------------ */

function avatarColor(phone: string): string {
  let hash = 0;
  for (let i = 0; i < phone.length; i++) {
    hash = phone.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#14b8a6"];
  return colors[Math.abs(hash) % colors.length];
}

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function dateDivider(dateStr: string): string {
  const d = new Date(dateStr);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEE d MMM");
}

type Filter = "all" | "mine" | "broadcasts" | "ai" | "human" | "unread";

interface BroadcastSummary {
  id: string;
  name: string;
  status: string;
  totalCount: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  failedCount: number;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  template: { id: string; name: string; status: string } | null;
}

interface BroadcastRecipientRow {
  id: string;
  phone: string;
  contactName: string | null;
  status: string;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  conversationId?: string | null;
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ */
/*  STATUS PILL                                                        */
/* ------------------------------------------------------------------ */

function StatusPill({ status, handledBy, agentName }: { status: string; handledBy: string; agentName?: string }) {
  if (status === "RESOLVED") {
    return (
      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 3, background: "#10b98120", color: "#10b981", whiteSpace: "nowrap" }}>
        ✓ Resolved
      </span>
    );
  }
  if (status === "WAITING") {
    return (
      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 3, background: "#f59e0b20", color: "#f59e0b", whiteSpace: "nowrap" }}>
        ⏳ Waiting
      </span>
    );
  }
  if (handledBy === "HUMAN") {
    return (
      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 3, background: "#8b5cf620", color: "#8b5cf6", whiteSpace: "nowrap" }}>
        👤 {agentName ? `Agent: ${agentName}` : "Human"}
      </span>
    );
  }
  return (
    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 3, background: "#3b82f620", color: "#3b82f6", whiteSpace: "nowrap" }}>
      🤖 AI Active
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  MESSAGE STATUS ICON                                                */
/* ------------------------------------------------------------------ */

function MsgStatus({ status }: { status: string }) {
  if (status === "read") return <CheckCheck className="h-3 w-3 text-blue-400" />;
  if (status === "delivered") return <CheckCheck className="h-3 w-3 text-gray-500" />;
  if (status === "failed") return <X className="h-3 w-3 text-red-500" />;
  return <Check className="h-3 w-3 text-gray-500" />;
}

/* ------------------------------------------------------------------ */
/*  MEDIA PREVIEW                                                      */
/* ------------------------------------------------------------------ */

const EMOJI_PRESET = [
  "😀","😁","😂","🤣","😊","😍","😘","😎","🤩","😇",
  "🙏","👍","👎","👏","🙌","🤝","💪","🤞","✌️","🫡",
  "❤️","🧡","💛","💚","💙","💜","🖤","🤍","💕","💔",
  "🔥","⭐","✨","🎉","🎊","🎁","💯","✅","❌","⚠️",
  "🤔","😅","😢","😭","😡","😱","🥺","😴","🤯","🥳",
  "📞","📱","💬","📧","📩","📌","📎","🛒","💰","🏷️",
];

function EmojiPicker({ onPick }: { onPick: (e: string) => void }) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 48,
        right: 0,
        background: "#1a1a1a",
        border: "1px solid #333",
        borderRadius: 6,
        padding: 8,
        width: 264,
        display: "grid",
        gridTemplateColumns: "repeat(10, 1fr)",
        gap: 2,
        zIndex: 60,
        boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {EMOJI_PRESET.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onPick(emoji)}
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            fontSize: 18,
            padding: "4px 0",
            borderRadius: 3,
            transition: "background 0.1s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#2a2a2a")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

function MediaPreview({ mediaType, mediaUrl }: { mediaType: string; mediaUrl?: string | null }) {
  if (mediaUrl && mediaType === "image") {
    return (
      <a href={mediaUrl} target="_blank" rel="noopener noreferrer" style={{ display: "block", marginBottom: 6 }}>
        <img
          src={mediaUrl}
          alt="Sent media"
          style={{ maxWidth: 280, maxHeight: 280, borderRadius: 6, display: "block", objectFit: "cover" }}
        />
      </a>
    );
  }
  if (mediaUrl && mediaType === "video") {
    return (
      <video
        src={mediaUrl}
        controls
        style={{ maxWidth: 320, maxHeight: 280, borderRadius: 6, display: "block", marginBottom: 6 }}
      />
    );
  }
  if (mediaUrl && mediaType === "audio") {
    return <audio src={mediaUrl} controls style={{ display: "block", marginBottom: 6 }} />;
  }
  if (mediaUrl) {
    return (
      <a
        href={mediaUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 14px",
          background: "#ffffff08",
          borderRadius: 3,
          marginBottom: 6,
          color: "#ddd",
          textDecoration: "none",
        }}
      >
        <FileText className="h-5 w-5" />
        <span style={{ fontSize: 12, textTransform: "capitalize" }}>{mediaType || "Document"}</span>
        <Download className="h-3.5 w-3.5 ml-auto" />
      </a>
    );
  }
  // No URL — fall back to icon-only chip
  const icons: Record<string, React.ReactNode> = {
    image: <Image className="h-5 w-5" />,
    video: <Video className="h-5 w-5" />,
    audio: <Mic className="h-5 w-5" />,
    document: <FileText className="h-5 w-5" />,
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "#ffffff08", borderRadius: 3, marginBottom: 6, color: "#888" }}>
      {icons[mediaType] ?? <FileText className="h-5 w-5" />}
      <span style={{ fontSize: 12, textTransform: "capitalize" }}>{mediaType}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  PAGE COMPONENT                                                     */
/* ------------------------------------------------------------------ */

export default function WhatsAppPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Chat list collapse
  const [listCollapsed, setListCollapsed] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("wa.listCollapsed");
    if (stored === "1") setListCollapsed(true);
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("wa.listCollapsed", listCollapsed ? "1" : "0");
  }, [listCollapsed]);

  // Broadcasts (for Broadcast Lists tab)
  const [broadcasts, setBroadcasts] = useState<BroadcastSummary[]>([]);
  const [broadcastsLoading, setBroadcastsLoading] = useState(false);
  const [activeBroadcastId, setActiveBroadcastId] = useState<string | null>(null);
  const [broadcastRecipients, setBroadcastRecipients] = useState<BroadcastRecipientRow[]>([]);

  // Create New Chat modal
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [ncName, setNcName] = useState("");
  const [ncPhone, setNcPhone] = useState("");
  const [ncCreating, setNcCreating] = useState(false);

  // Current user (for "My Chats" filter)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/session");
        const json = (await res.json()) as { user?: { id?: string } };
        if (!cancelled) setCurrentUserId(json.user?.id ?? null);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Quick reply (chat-side templates)
  type QuickReply = { id: string; title: string; content: string; createdAt: string };
  const [quickRepliesOpen, setQuickRepliesOpen] = useState(false);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [qrTitle, setQrTitle] = useState("");
  const [qrContent, setQrContent] = useState("");
  const [qrSaving, setQrSaving] = useState(false);
  const [qrFormOpen, setQrFormOpen] = useState(false);

  const loadQuickReplies = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/quick-replies");
      const json = (await res.json()) as { data: QuickReply[] | null };
      setQuickReplies(json.data ?? []);
    } catch { /* silent */ }
  }, []);

  function openQuickReplies() {
    setQuickRepliesOpen(true);
    void loadQuickReplies();
  }

  function insertQuickReply(content: string) {
    setReplyText((prev) => (prev ? prev + (prev.endsWith(" ") ? "" : " ") + content : content));
    setQuickRepliesOpen(false);
    textareaRef.current?.focus();
  }

  async function saveQuickReply() {
    const title = qrTitle.trim();
    const content = qrContent.trim();
    if (!title || !content) { toast.error("Title and content are required"); return; }
    setQrSaving(true);
    try {
      const res = await fetch("/api/whatsapp/quick-replies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      });
      const json = (await res.json()) as { data: QuickReply | null; error: string | null };
      if (!res.ok || !json.data) { toast.error(json.error ?? "Failed to save"); return; }
      setQuickReplies((prev) => [json.data as QuickReply, ...prev]);
      setQrTitle(""); setQrContent(""); setQrFormOpen(false);
      toast.success("Quick reply saved");
    } catch { toast.error("Failed to save"); }
    finally { setQrSaving(false); }
  }

  async function deleteQuickReply(id: string) {
    try {
      await fetch(`/api/whatsapp/quick-replies/${id}`, { method: "DELETE" });
      setQuickReplies((prev) => prev.filter((q) => q.id !== id));
    } catch { toast.error("Failed to delete"); }
  }

  // Template-send-to-conversation modal
  type TemplateLite = {
    id: string;
    name: string;
    language: string;
    status: string;
    body: string;
    variableCount: number;
  };
  const [tplModalOpen, setTplModalOpen] = useState(false);
  const [tplList, setTplList] = useState<TemplateLite[]>([]);
  const [tplSelectedId, setTplSelectedId] = useState("");
  const [tplVars, setTplVars] = useState<Record<string, string>>({});
  const [tplSending, setTplSending] = useState(false);

  const tplSelected = tplList.find((t) => t.id === tplSelectedId) ?? null;
  let tplPreview = tplSelected?.body ?? "";
  for (const [k, v] of Object.entries(tplVars)) {
    tplPreview = tplPreview.replaceAll(`{{${k}}}`, v || `{{${k}}}`);
  }

  async function openTemplateModal() {
    setTplModalOpen(true);
    setTplSelectedId("");
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
    if (!activeId || !tplSelectedId || tplSending) return;
    setTplSending(true);
    try {
      const res = await fetch(`/api/whatsapp/conversations/${activeId}/messages/template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: tplSelectedId, variables: tplVars }),
      });
      const json = (await res.json()) as { data: Message | null; error: string | null };
      if (!res.ok || !json.data) {
        toast.error(json.error ?? "Failed to send template");
        return;
      }
      setMessages((prev) => [...prev, json.data as Message]);
      toast.success("Template sent");
      setTplModalOpen(false);
    } catch {
      toast.error("Failed to send template");
    } finally {
      setTplSending(false);
    }
  }
  const [takingOver, setTakingOver] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [assignDropdownOpen, setAssignDropdownOpen] = useState(false);
  const [agents, setAgents] = useState<{ id: string; name: string | null; email: string }[]>([]);
  const [showTagInput, setShowTagInput] = useState(false);
  const [tagInput, setTagInput] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Tracks "did the user scroll away from the bottom" so polling doesn't yank them back.
  // Why: messages re-fetch every 20s; without this, scrollIntoView fires on every poll
  // even when the user is reading older history and pulls them back to the bottom.
  const userPinnedToBottomRef = useRef(true);
  const prevMsgCountRef = useRef(0);
  const prevConvIdRef = useRef<string | null>(null);

  const activeConv = conversations.find((c) => c.id === activeId) ?? null;

  /* ---- 24-hour Meta policy window ---- */
  // Find the most recent inbound (customer) message timestamp.
  // Meta policy: outside the 24h customer-service window, only approved templates may be sent.
  const lastInboundAt = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].direction === "inbound") return new Date(messages[i].timestamp).getTime();
    }
    return null;
  })();
  const windowExpired = lastInboundAt === null || (Date.now() - lastInboundAt) > TWENTY_FOUR_HOURS_MS;
  const windowMsRemaining = lastInboundAt !== null ? Math.max(0, TWENTY_FOUR_HOURS_MS - (Date.now() - lastInboundAt)) : 0;

  /* ---- Fetch conversations ---- */
  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/conversations", { cache: "no-store" });
      const json = (await res.json()) as { data: Conversation[] | null };
      setConversations(json.data ?? []);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  /* ---- Fetch agents for assignment ---- */
  useEffect(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then((json: { data?: { id: string; name: string | null; email: string }[] }) => {
        setAgents(json.data ?? []);
      })
      .catch(() => {});
  }, []);

  /* ---- Fetch messages ---- */
  const loadMessages = useCallback(async (convId: string) => {
    try {
      const res = await fetch(`/api/whatsapp/conversations/${convId}/messages`, { cache: "no-store" });
      const json = (await res.json()) as { data: Message[] | null };
      setMessages(json.data ?? []);
    } catch {
      /* silent */
    }
  }, []);

  /* ---- Mount: load conversations ---- */
  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  /* ---- Load broadcasts (for Broadcast Lists tab) ---- */
  const loadBroadcasts = useCallback(async () => {
    setBroadcastsLoading(true);
    try {
      const res = await fetch("/api/whatsapp/broadcasts", { cache: "no-store" });
      const json = (await res.json()) as { data: BroadcastSummary[] | null };
      setBroadcasts(json.data ?? []);
    } catch { /* silent */ }
    finally { setBroadcastsLoading(false); }
  }, []);

  /* ---- Load broadcast recipients on demand ---- */
  const loadBroadcastRecipients = useCallback(async (broadcastId: string) => {
    try {
      const res = await fetch(`/api/whatsapp/broadcasts/${broadcastId}/recipients`, { cache: "no-store" });
      const json = (await res.json()) as { data: BroadcastRecipientRow[] | null };
      setBroadcastRecipients(json.data ?? []);
    } catch {
      setBroadcastRecipients([]);
    }
  }, []);

  useEffect(() => {
    if (filter === "broadcasts") void loadBroadcasts();
  }, [filter, loadBroadcasts]);

  useEffect(() => {
    if (activeBroadcastId) void loadBroadcastRecipients(activeBroadcastId);
    else setBroadcastRecipients([]);
  }, [activeBroadcastId, loadBroadcastRecipients]);

  /* ---- Create New Chat ---- */
  async function createNewChat() {
    const name = ncName.trim();
    let phone = ncPhone.trim().replace(/[^+\d]/g, "");
    if (!name || !phone) { toast.error("Name and phone are required"); return; }
    if (!phone.startsWith("+")) phone = `+${phone}`;
    if (phone.length < 8) { toast.error("Phone number looks too short"); return; }
    setNcCreating(true);
    try {
      const res = await fetch("/api/whatsapp/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactName: name, contactPhone: phone }),
      });
      const json = (await res.json()) as { data?: { id: string }; error?: string };
      if (!res.ok || !json.data) {
        toast.error(json.error ?? "Failed to create chat");
        return;
      }
      await loadConversations();
      setNewChatOpen(false);
      setNcName(""); setNcPhone("");
      setActiveId(json.data.id);
      // First message to a never-contacted number requires an approved template per Meta policy.
      toast.success("Chat created. Send an approved template to start the conversation.");
    } catch {
      toast.error("Failed to create chat");
    } finally {
      setNcCreating(false);
    }
  }

  /* ---- Poll conversations every 30s (Pusher covers real-time) ---- */
  useEffect(() => {
    const id = setInterval(() => void loadConversations(), 30000);
    return () => clearInterval(id);
  }, [loadConversations]);

  /* ---- Load messages when active changes ---- */
  useEffect(() => {
    if (activeId) void loadMessages(activeId);
    else setMessages([]);
  }, [activeId, loadMessages]);

  /* ---- Poll active conversation messages every 20s (Pusher covers real-time) ---- */
  useEffect(() => {
    if (!activeId) return;
    const id = setInterval(() => void loadMessages(activeId), 20000);
    return () => clearInterval(id);
  }, [activeId, loadMessages]);

  /* ---- Auto-scroll: only when at-bottom or new outbound, not on every poll ---- */
  useEffect(() => {
    const container = messagesContainerRef.current;
    const convChanged = prevConvIdRef.current !== activeId;
    if (convChanged) {
      // Conversation switched: jump to the bottom instantly, then track from there.
      prevConvIdRef.current = activeId;
      prevMsgCountRef.current = messages.length;
      userPinnedToBottomRef.current = true;
      // Defer to after layout so scrollHeight is correct
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
      });
      return;
    }
    if (messages.length > prevMsgCountRef.current) {
      const newest = messages[messages.length - 1];
      const isOwnOutbound = newest?.direction === "outbound";
      // Auto-scroll only if the user was already at/near the bottom OR the user just sent a message.
      if (userPinnedToBottomRef.current || isOwnOutbound) {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        userPinnedToBottomRef.current = true;
      }
    }
    prevMsgCountRef.current = messages.length;
    // Container ref intentionally not in deps — we read its scroll position imperatively.
  }, [messages, activeId]);

  /* ---- Track whether user is reading older messages ---- */
  function handleMessagesScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    userPinnedToBottomRef.current = distanceFromBottom < 80;
  }

  /* ---- Filter conversations ---- */
  const filtered = conversations.filter((c) => {
    const q = search.toLowerCase();
    if (q && !c.contactName.toLowerCase().includes(q) && !c.contactPhone.includes(q) && !(c.lastMessage ?? "").toLowerCase().includes(q)) return false;
    if (filter === "ai" && c.handledBy !== "AI") return false;
    if (filter === "human" && c.handledBy !== "HUMAN") return false;
    if (filter === "unread" && c.unreadCount === 0) return false;
    if (filter === "mine") {
      // Only chats currently assigned to me AND being handled by a human
      // (so handover-to-AI removes them from the list automatically).
      if (!currentUserId) return false;
      if (c.agentId !== currentUserId) return false;
      if (c.handledBy === "AI") return false;
    }
    return true;
  });

  const stats = {
    active: conversations.filter((c) => c.status === "ACTIVE").length,
    ai: conversations.filter((c) => c.handledBy === "AI").length,
    human: conversations.filter((c) => c.handledBy === "HUMAN").length,
  };

  /* ---- Send message ---- */
  async function handleSend() {
    if (!activeId || !replyText.trim() || sending) return;
    const text = replyText.trim();
    setSending(true);
    setReplyText("");

    // Optimistic add
    const optimistic: Message = {
      id: `opt-${Date.now()}`,
      conversationId: activeId,
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
      const res = await fetch(`/api/whatsapp/conversations/${activeId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      if (!res.ok) throw new Error("Failed to send");
      const json = (await res.json()) as { data: Message };
      // Replace optimistic with real
      setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? json.data : m)));
    } catch {
      // Remove optimistic on error
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      toast.error("Failed to send message");
    }

    setSending(false);
  }

  /* ---- Send media attachment ---- */
  async function handleAttach(file: File) {
    if (!activeId || attaching) return;
    setAttaching(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/whatsapp/conversations/${activeId}/messages/media`, {
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

  /* ---- Take over / hand back ---- */
  async function toggleHandoff() {
    if (!activeConv) return;
    setTakingOver(true);
    const newHandler = activeConv.handledBy === "AI" ? "human" : "ai";
    try {
      await fetch(`/api/whatsapp/conversations/${activeConv.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handledBy: newHandler }),
      });
      await loadConversations();
      toast.success(newHandler === "human" ? "You took over the conversation" : "Handed back to AI");
    } catch {
      toast.error("Failed to update");
    }
    setTakingOver(false);
  }

  /* ---- Create case from conversation ---- */
  async function createCase() {
    if (!activeConv) return;
    try {
      // Build a description from the last few messages
      const recentMsgs = messages.slice(-10).map((m) =>
        `[${m.sender === "customer" ? activeConv.contactName : m.senderName}]: ${m.body}`
      ).join("\n");

      const description = `WhatsApp conversation with ${activeConv.contactName} (${activeConv.contactPhone})\n\n--- Chat History ---\n${recentMsgs}`;

      const title = `WhatsApp: ${activeConv.contactName}`.slice(0, 190);

      const res = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: description.slice(0, 5000),
          priority: "MEDIUM",
          source: "CHAT",
        }),
      });

      const json = (await res.json()) as { data?: { id: string; caseNumber: string }; error?: string };
      if (!res.ok) {
        toast.error(json.error ?? "Failed to create case");
        return;
      }

      const created = json.data!;

      // Link case to conversation
      await fetch(`/api/whatsapp/conversations/${activeConv.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: created.id, caseNumber: created.caseNumber }),
      });

      await loadConversations();
      toast.success(`Case ${created.caseNumber} created`);
    } catch {
      toast.error("Failed to create case");
    }
  }

  /* ---- Mark resolved ---- */
  async function markResolved() {
    if (!activeConv) return;
    setDropdownOpen(false);

    // Resolve the conversation
    await fetch(`/api/whatsapp/conversations/${activeConv.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "resolved" }),
    });

    // Also resolve the linked case if one exists
    if (activeConv.caseId) {
      await fetch(`/api/cases/${activeConv.caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "RESOLVED" }),
      });
    }

    await loadConversations();
    toast.success(
      activeConv.caseId
        ? "Conversation & linked case resolved"
        : "Conversation marked as resolved",
    );
  }

  /* ---- Assign to agent ---- */
  async function assignToAgent(agentId: string) {
    if (!activeConv) return;
    setAssignDropdownOpen(false);
    await fetch(`/api/whatsapp/conversations/${activeConv.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId, handledBy: "human" }),
    });
    await loadConversations();
    const agent = agents.find((a) => a.id === agentId);
    toast.success(`Assigned to ${agent?.name ?? agent?.email ?? "agent"}`);
  }

  /* ---- Add / remove tag ---- */
  async function addTag() {
    if (!activeConv || !tagInput.trim()) return;
    const tag = tagInput.trim().toLowerCase().replace(/\s+/g, "-");
    if ((activeConv.tags ?? []).includes(tag)) { toast.error("Tag already exists"); return; }
    const newTags = [...(activeConv.tags ?? []), tag];
    setDropdownOpen(false);
    setShowTagInput(false);
    setTagInput("");
    await fetch(`/api/whatsapp/conversations/${activeConv.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: newTags }),
    });
    await loadConversations();
    toast.success(`Tag "${tag}" added`);
  }

  async function removeTag(tag: string) {
    if (!activeConv) return;
    const newTags = (activeConv.tags ?? []).filter((t) => t !== tag);
    await fetch(`/api/whatsapp/conversations/${activeConv.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: newTags }),
    });
    await loadConversations();
    toast.success(`Tag "${tag}" removed`);
  }

  /* ---- Textarea key handler ---- */
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  /* ---- Group messages by date ---- */
  const groupedMessages: { date: string; items: Message[] }[] = [];
  for (const msg of messages) {
    const label = dateDivider(msg.timestamp);
    const last = groupedMessages[groupedMessages.length - 1];
    if (last && last.date === label) {
      last.items.push(msg);
    } else {
      groupedMessages.push({ date: label, items: [msg] });
    }
  }

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "mine", label: "My Chats" },
    { key: "broadcasts", label: "Broadcast Lists" },
    { key: "ai", label: "AI" },
    { key: "human", label: "Human" },
    { key: "unread", label: "Unread" },
  ];

  return (
    <div style={{ display: "flex", height: "calc(100vh - 64px)", margin: "-24px -24px 0 -24px", overflow: "hidden" }}>
      {/* =================== LEFT PANEL =================== */}
      <div
        style={{
          width: listCollapsed ? 0 : 340,
          minWidth: listCollapsed ? 0 : 340,
          display: "flex",
          flexDirection: "column",
          background: "#0f0f0f",
          borderRight: listCollapsed ? "none" : "1px solid #1e1e1e",
          overflow: "hidden",
          transition: "width 0.2s ease, min-width 0.2s ease",
        }}
      >
        {/* Top section */}
        <div style={{ padding: 16, borderBottom: "1px solid #1e1e1e" }}>
          {/* Title */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <span style={{ fontWeight: 700, fontSize: 16, color: "#fff" }}>WhatsApp</span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 11,
                color: "#25D366",
                background: "#25D36615",
                padding: "2px 10px",
                borderRadius: 3,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#25D366", display: "inline-block" }} />
              Connected
            </span>
            <button
              type="button"
              onClick={() => setNewChatOpen(true)}
              title="Start a new chat"
              aria-label="Start a new chat"
              style={{
                marginLeft: "auto",
                width: 28,
                height: 28,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#25D366",
                border: "none",
                borderRadius: 4,
                color: "#fff",
                cursor: "pointer",
              }}
            >
              <MessageSquarePlus style={{ width: 14, height: 14 }} />
            </button>
          </div>

          {/* Search */}
          <div style={{ position: "relative", marginBottom: 12 }}>
            <Search
              style={{
                position: "absolute",
                left: 10,
                top: "50%",
                transform: "translateY(-50%)",
                width: 14,
                height: 14,
                color: "#555",
              }}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations..."
              style={{
                width: "100%",
                padding: "8px 12px 8px 32px",
                background: "#1a1a1a",
                border: "1px solid #222",
                borderRadius: 3,
                color: "#fff",
                fontSize: 13,
                outline: "none",
              }}
            />
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4 }}>
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                style={{
                  padding: "4px 10px",
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 3,
                  border: "none",
                  cursor: "pointer",
                  background: filter === f.key ? "#fff" : "transparent",
                  color: filter === f.key ? "#000" : "#888",
                  transition: "all 0.15s",
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Conversation list (or Broadcast list when in Broadcast Lists tab) */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filter === "broadcasts" ? (
            broadcastsLoading ? (
              <div style={{ padding: 32, textAlign: "center", color: "#555", fontSize: 13 }}>Loading broadcasts...</div>
            ) : broadcasts.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: "#555", fontSize: 13 }}>
                No broadcasts yet. <Link href="/broadcast" style={{ color: "#25D366" }}>Create one</Link>
              </div>
            ) : (
              broadcasts.map((b) => {
                const isActive = b.id === activeBroadcastId;
                const sub = `${b.sentCount}/${b.totalCount} sent · ${b.deliveredCount} delivered · ${b.readCount} read`;
                return (
                  <button
                    key={b.id}
                    onClick={() => { setActiveBroadcastId(b.id); setActiveId(null); }}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "12px 16px",
                      background: isActive ? "#1a1a1a" : "transparent",
                      borderLeft: isActive ? "3px solid #25D366" : "3px solid transparent",
                      borderBottom: "1px solid #141414",
                      borderTop: "none",
                      borderRight: "none",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                      <Radio style={{ width: 13, height: 13, color: "#25D366" }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.name}</span>
                      <span style={{ marginLeft: "auto", fontSize: 10, padding: "2px 6px", borderRadius: 2, background: b.status === "COMPLETED" ? "#10b98120" : "#3b82f620", color: b.status === "COMPLETED" ? "#10b981" : "#3b82f6" }}>
                        {b.status}
                      </span>
                    </div>
                    {b.template && (
                      <div style={{ fontSize: 10, color: "#666", marginBottom: 3, fontFamily: "monospace" }}>
                        Template: {b.template.name}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: "#888" }}>{sub}</div>
                    <div style={{ fontSize: 10, color: "#555", marginTop: 3 }}>
                      {formatDistanceToNow(new Date(b.createdAt), { addSuffix: true })}
                    </div>
                  </button>
                );
              })
            )
          ) : loading ? (
            <div style={{ padding: 32, textAlign: "center", color: "#555", fontSize: 13 }}>Loading...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "#555", fontSize: 13 }}>No conversations</div>
          ) : (
            filtered.map((conv) => {
              const isActive = conv.id === activeId;
              return (
                <button
                  key={conv.id}
                  onClick={() => setActiveId(conv.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    width: "100%",
                    padding: "12px 16px",
                    height: 72,
                    background: isActive ? "#1a1a1a" : "transparent",
                    borderLeft: isActive ? "3px solid #fff" : "3px solid transparent",
                    borderBottom: "1px solid #141414",
                    borderTop: "none",
                    borderRight: "none",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "#141414"; }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                >
                  {/* Avatar */}
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      background: avatarColor(conv.contactPhone),
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 14,
                      fontWeight: 700,
                      color: "#fff",
                      flexShrink: 0,
                    }}
                  >
                    {initials(conv.contactName)}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {conv.contactName}
                      </span>
                      <span style={{ fontSize: 11, color: "#555", flexShrink: 0, marginLeft: 8 }}>
                        {formatDistanceToNow(new Date(conv.lastMessageAt), { addSuffix: false })}
                      </span>
                    </div>
                    <div style={{ marginBottom: 3 }}>
                      <StatusPill status={conv.status} handledBy={conv.handledBy} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 12, color: "#666", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                        {conv.lastMessage ?? "No messages"}
                      </span>
                      {conv.unreadCount > 0 && (
                        <span
                          style={{
                            background: "#fff",
                            color: "#000",
                            fontSize: 10,
                            fontWeight: 700,
                            minWidth: 18,
                            height: 18,
                            borderRadius: "50%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                            marginLeft: 8,
                          }}
                        >
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                    {(conv.tags ?? []).length > 0 && (
                      <div style={{ display: "flex", gap: 3, marginTop: 3, flexWrap: "wrap" }}>
                        {(conv.tags ?? []).slice(0, 3).map((tag) => (
                          <span key={tag} style={{ fontSize: 9, padding: "1px 5px", background: "#df564120", color: "#df5641", borderRadius: 2 }}>{tag}</span>
                        ))}
                        {(conv.tags ?? []).length > 3 && <span style={{ fontSize: 9, color: "#555" }}>+{(conv.tags ?? []).length - 3}</span>}
                      </div>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Stats bar */}
        <div
          style={{
            padding: "10px 16px",
            borderTop: "1px solid #1e1e1e",
            fontSize: 11,
            color: "#555",
            display: "flex",
            gap: 12,
          }}
        >
          <span>{stats.active} active</span>
          <span>·</span>
          <span>{stats.ai} AI</span>
          <span>·</span>
          <span>{stats.human} human</span>
        </div>
      </div>

      {/* =================== RIGHT PANEL =================== */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#0a0a0a", minWidth: 0, position: "relative" }}>
        {filter === "broadcasts" && activeBroadcastId && !activeConv ? (
          /* Broadcast recipient drill-down */
          (() => {
            const b = broadcasts.find((x) => x.id === activeBroadcastId);
            if (!b) return <div style={{ flex: 1 }} />;
            return (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <div style={{ height: 64, padding: "0 24px", display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between", borderBottom: "1px solid #1e1e1e", flexShrink: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <button
                      type="button"
                      onClick={() => setListCollapsed((v) => !v)}
                      title={listCollapsed ? "Show chat list" : "Hide chat list"}
                      style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "1px solid #333", borderRadius: 4, color: "#888", cursor: "pointer", flexShrink: 0 }}
                    >
                      {listCollapsed ? <PanelLeftOpen style={{ width: 14, height: 14 }} /> : <PanelLeftClose style={{ width: 14, height: 14 }} />}
                    </button>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>{b.name}</div>
                    <div style={{ fontSize: 11, color: "#666" }}>
                      {b.template ? `Template: ${b.template.name} · ` : ""}
                      {b.totalCount} recipients · {b.status}
                    </div>
                  </div>
                  </div>
                  <Link href="/broadcast" style={{ fontSize: 12, color: "#888", textDecoration: "none", border: "1px solid #333", padding: "6px 12px", borderRadius: 3 }}>
                    Open Broadcast Manager →
                  </Link>
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
                  {broadcastRecipients.length === 0 ? (
                    <div style={{ color: "#666", fontSize: 13, textAlign: "center", padding: 32 }}>Loading recipients...</div>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, color: "#ccc" }}>
                      <thead>
                        <tr style={{ color: "#666", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
                          <th style={{ textAlign: "left", padding: "8px 12px", borderBottom: "1px solid #222" }}>Contact</th>
                          <th style={{ textAlign: "left", padding: "8px 12px", borderBottom: "1px solid #222" }}>Phone</th>
                          <th style={{ textAlign: "left", padding: "8px 12px", borderBottom: "1px solid #222" }}>Status</th>
                          <th style={{ textAlign: "left", padding: "8px 12px", borderBottom: "1px solid #222" }}>Sent</th>
                          <th style={{ textAlign: "left", padding: "8px 12px", borderBottom: "1px solid #222" }}>Delivered</th>
                          <th style={{ textAlign: "left", padding: "8px 12px", borderBottom: "1px solid #222" }}>Read</th>
                          <th style={{ textAlign: "right", padding: "8px 12px", borderBottom: "1px solid #222" }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {broadcastRecipients.map((r) => (
                          <tr key={r.id} style={{ borderBottom: "1px solid #1a1a1a" }}>
                            <td style={{ padding: "8px 12px", color: "#fff" }}>{r.contactName ?? "—"}</td>
                            <td style={{ padding: "8px 12px", fontFamily: "monospace" }}>{r.phone}</td>
                            <td style={{ padding: "8px 12px" }}>
                              <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 2, background: r.status === "FAILED" ? "#ef444420" : r.status === "READ" ? "#3b82f620" : r.status === "DELIVERED" ? "#10b98120" : "#88888820", color: r.status === "FAILED" ? "#ef4444" : r.status === "READ" ? "#3b82f6" : r.status === "DELIVERED" ? "#10b981" : "#888" }}>
                                {r.status}
                              </span>
                            </td>
                            <td style={{ padding: "8px 12px", color: "#666" }}>{r.sentAt ? format(new Date(r.sentAt), "HH:mm dd MMM") : "—"}</td>
                            <td style={{ padding: "8px 12px", color: "#666" }}>{r.deliveredAt ? format(new Date(r.deliveredAt), "HH:mm dd MMM") : "—"}</td>
                            <td style={{ padding: "8px 12px", color: "#666" }}>{r.readAt ? format(new Date(r.readAt), "HH:mm dd MMM") : "—"}</td>
                            <td style={{ padding: "8px 12px", textAlign: "right" }}>
                              {r.conversationId ? (
                                <button
                                  onClick={() => { setActiveId(r.conversationId!); }}
                                  style={{ padding: "4px 10px", fontSize: 11, background: "transparent", border: "1px solid #333", borderRadius: 3, color: "#fff", cursor: "pointer" }}
                                >
                                  Open Chat
                                </button>
                              ) : (
                                <span style={{ color: "#444", fontSize: 11 }}>No chat yet</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            );
          })()
        ) : !activeConv ? (
          /* Empty state */
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: "#555", position: "relative" }}>
            {listCollapsed && (
              <button
                type="button"
                onClick={() => setListCollapsed(false)}
                title="Show chat list"
                style={{ position: "absolute", top: 16, left: 16, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "#1a1a1a", border: "1px solid #333", borderRadius: 4, color: "#888", cursor: "pointer" }}
              >
                <PanelLeftOpen style={{ width: 14, height: 14 }} />
              </button>
            )}
            <Phone style={{ width: 48, height: 48, opacity: 0.3 }} />
            <span style={{ fontSize: 14 }}>Select a conversation</span>
          </div>
        ) : (
          <>
            {/* ---- Top bar ---- */}
            <div
              style={{
                height: 64,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 24px",
                borderBottom: "1px solid #1e1e1e",
                flexShrink: 0,
              }}
            >
              {/* Left: list toggle + avatar + info */}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button
                  type="button"
                  onClick={() => setListCollapsed((v) => !v)}
                  title={listCollapsed ? "Show chat list" : "Hide chat list"}
                  aria-label={listCollapsed ? "Show chat list" : "Hide chat list"}
                  style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "1px solid #333", borderRadius: 4, color: "#888", cursor: "pointer", flexShrink: 0 }}
                >
                  {listCollapsed ? <PanelLeftOpen style={{ width: 14, height: 14 }} /> : <PanelLeftClose style={{ width: 14, height: 14 }} />}
                </button>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: avatarColor(activeConv.contactPhone),
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#fff",
                  }}
                >
                  {initials(activeConv.contactName)}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>{activeConv.contactName}</div>
                  <div style={{ fontSize: 11, color: "#666" }}>{activeConv.contactPhone}</div>
                </div>
              </div>

              {/* Center: status + assigned agent */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <StatusPill status={activeConv.status} handledBy={activeConv.handledBy} agentName={(activeConv as Record<string, unknown>).agentName as string | undefined} />
                <div style={{ position: "relative" }}>
                  <button
                    onClick={() => setAssignDropdownOpen(!assignDropdownOpen)}
                    style={{
                      padding: "3px 10px",
                      fontSize: 11,
                      borderRadius: 3,
                      background: "transparent",
                      border: "1px solid #333",
                      color: "#888",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {(activeConv as Record<string, unknown>).agentName
                      ? `👤 ${(activeConv as Record<string, unknown>).agentName}`
                      : "Assign Agent"}
                  </button>
                  {assignDropdownOpen && (
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 28,
                        background: "#1a1a1a",
                        border: "1px solid #2a2a2a",
                        borderRadius: 3,
                        minWidth: 200,
                        maxHeight: 240,
                        overflowY: "auto",
                        zIndex: 50,
                      }}
                    >
                      {agents.map((a) => (
                        <button
                          key={a.id}
                          onClick={() => void assignToAgent(a.id)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            width: "100%",
                            padding: "8px 14px",
                            background: a.id === activeConv.agentId ? "#222" : "transparent",
                            border: "none",
                            color: "#ccc",
                            fontSize: 12,
                            cursor: "pointer",
                            textAlign: "left",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "#222")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = a.id === activeConv.agentId ? "#222" : "transparent")}
                        >
                          👤 {a.name ?? a.email}
                          {a.id === activeConv.agentId && <span style={{ marginLeft: "auto", color: "#25D366" }}>✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Tags inline next to assigned agent */}
                {(activeConv.tags ?? []).length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                    {(activeConv.tags ?? []).map((tag) => (
                      <span
                        key={tag}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "3px 8px",
                          background: "#df564120",
                          color: "#df5641",
                          borderRadius: 3,
                          fontSize: 10,
                          fontWeight: 500,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {tag}
                        <button
                          onClick={() => void removeTag(tag)}
                          style={{ background: "none", border: "none", color: "#df5641", cursor: "pointer", padding: 0, fontSize: 12, lineHeight: 1 }}
                          aria-label={`Remove tag ${tag}`}
                        >
                          &times;
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Right: actions */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {/* Take over / hand back */}
                <button
                  onClick={() => void toggleHandoff()}
                  disabled={takingOver}
                  style={{
                    padding: "6px 14px",
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 3,
                    cursor: takingOver ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    transition: "all 0.15s",
                    ...(activeConv.handledBy === "AI"
                      ? { background: "#fff", color: "#000", border: "none" }
                      : { background: "transparent", color: "#fff", border: "1px solid #fff" }),
                  }}
                >
                  <ArrowLeftRight style={{ width: 13, height: 13 }} />
                  {takingOver ? "..." : activeConv.handledBy === "AI" ? "Take Over" : "Hand Back to AI"}
                </button>

                {/* View / Create case */}
                {activeConv.caseId ? (
                  <Link
                    href={`/cases/${activeConv.caseId}`}
                    style={{
                      padding: "6px 14px",
                      fontSize: 12,
                      fontWeight: 600,
                      borderRadius: 3,
                      background: "transparent",
                      color: "#fff",
                      border: "1px solid #333",
                      textDecoration: "none",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <ExternalLink style={{ width: 12, height: 12 }} />
                    View Case
                  </Link>
                ) : (
                  <button
                    style={{
                      padding: "6px 14px",
                      fontSize: 12,
                      fontWeight: 600,
                      borderRadius: 3,
                      background: "transparent",
                      color: "#fff",
                      border: "1px solid #333",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                    onClick={() => void createCase()}
                  >
                    <Plus style={{ width: 12, height: 12 }} />
                    Create Case
                  </button>
                )}

                {/* Dropdown */}
                <div style={{ position: "relative" }}>
                  <button
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    style={{
                      width: 32,
                      height: 32,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "transparent",
                      border: "1px solid #333",
                      borderRadius: 3,
                      cursor: "pointer",
                      color: "#888",
                    }}
                  >
                    <MoreHorizontal style={{ width: 14, height: 14 }} />
                  </button>
                  {dropdownOpen && (
                    <div
                      style={{
                        position: "absolute",
                        right: 0,
                        top: 36,
                        background: "#1a1a1a",
                        border: "1px solid #2a2a2a",
                        borderRadius: 3,
                        minWidth: 180,
                        zIndex: 50,
                        overflow: "hidden",
                      }}
                    >
                      {/* Menu items */}
                      {[
                        { label: "Send Template", icon: <FileText style={{ width: 13, height: 13 }} />, action: () => { setDropdownOpen(false); void openTemplateModal(); } },
                        { label: "Mark as Resolved", icon: <Check style={{ width: 13, height: 13 }} />, action: () => void markResolved() },
                        { label: "Add Tag", icon: <Tag style={{ width: 13, height: 13 }} />, action: () => setShowTagInput(true) },
                        { label: "Block Contact", icon: <Ban style={{ width: 13, height: 13 }} />, action: () => { setDropdownOpen(false); toast.info("Blocking coming soon"); } },
                      ].map((item) => (
                        <button
                          key={item.label}
                          onClick={item.action}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            width: "100%",
                            padding: "8px 14px",
                            background: "transparent",
                            border: "none",
                            color: "#ccc",
                            fontSize: 12,
                            cursor: "pointer",
                            textAlign: "left",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "#222")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          {item.icon}
                          {item.label}
                        </button>
                      ))}

                      {/* Tag input inline */}
                      {showTagInput && (
                        <div style={{ padding: "8px 14px", borderTop: "1px solid #2a2a2a" }}>
                          <div style={{ display: "flex", gap: 4 }}>
                            <input
                              type="text"
                              value={tagInput}
                              onChange={(e) => setTagInput(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") void addTag(); if (e.key === "Escape") { setShowTagInput(false); setTagInput(""); } }}
                              placeholder="Tag name..."
                              autoFocus
                              style={{
                                flex: 1,
                                padding: "4px 8px",
                                background: "#111",
                                border: "1px solid #333",
                                borderRadius: 3,
                                color: "#fff",
                                fontSize: 11,
                                outline: "none",
                              }}
                            />
                            <button
                              onClick={() => void addTag()}
                              style={{
                                padding: "4px 8px",
                                background: "#df5641",
                                border: "none",
                                borderRadius: 3,
                                color: "#fff",
                                fontSize: 11,
                                cursor: "pointer",
                              }}
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      )}

                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ---- Messages area ---- */}
            <div
              ref={messagesContainerRef}
              onScroll={handleMessagesScroll}
              style={{ flex: 1, overflowY: "auto", padding: "24px 32px" }}
              onClick={() => setDropdownOpen(false)}
            >
              {groupedMessages.map((group) => (
                <div key={group.date}>
                  {/* Date divider */}
                  <div style={{ display: "flex", justifyContent: "center", margin: "20px 0" }}>
                    <span
                      style={{
                        background: "#1e1e1e",
                        color: "#888",
                        fontSize: 11,
                        padding: "4px 14px",
                        borderRadius: 3,
                      }}
                    >
                      {group.date}
                    </span>
                  </div>

                  {group.items.map((msg) => {
                    const isOutbound = msg.direction === "outbound";
                    const isAIMsg = msg.isAI;

                    return (
                      <div
                        key={msg.id}
                        style={{
                          display: "flex",
                          justifyContent: isOutbound ? "flex-end" : "flex-start",
                          marginBottom: 10,
                        }}
                      >
                        <div style={{ maxWidth: "65%" }}>
                          {/* Sender label */}
                          {isOutbound && (
                            <div
                              style={{
                                fontSize: 10,
                                color: "#666",
                                textAlign: "right",
                                marginBottom: 3,
                              }}
                            >
                              {isAIMsg ? "🤖 AI" : `👤 ${msg.senderName}`}
                            </div>
                          )}

                          <div
                            style={{
                              padding: "10px 14px",
                              borderRadius: isOutbound ? "12px 0 12px 12px" : "0 12px 12px 12px",
                              fontSize: 13,
                              lineHeight: 1.5,
                              ...(isOutbound
                                ? isAIMsg
                                  ? { background: "#1e1e2e", border: "1px solid #2a2a4a", color: "#c8d0ff" }
                                  : { background: "#1a1a1a", border: "1px solid #333", color: "#fff" }
                                : { background: "#1a1a1a", border: "1px solid #222", color: "#fff" }),
                            }}
                          >
                            {(msg.mediaType || msg.mediaUrl) && (
                              <MediaPreview mediaType={msg.mediaType ?? "document"} mediaUrl={msg.mediaUrl} />
                            )}
                            <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{msg.body}</div>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "flex-end",
                                gap: 4,
                                marginTop: 4,
                              }}
                            >
                              <span style={{ fontSize: 10, color: "#555" }}>
                                {format(new Date(msg.timestamp), "HH:mm")}
                              </span>
                              {isOutbound && <MsgStatus status={msg.status} />}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* ---- Reply bar ---- */}
            {activeConv.handledBy === "AI" ? (
              <div
                style={{
                  padding: "14px 24px",
                  borderTop: "1px solid #1e1e1e",
                  background: "#0f0f0f",
                  color: "#666",
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span>🤖</span>
                <span>AI is currently handling this conversation. Take over to reply.</span>
              </div>
            ) : windowExpired ? (
              /* 24-hour customer service window expired — Meta policy: only approved templates can be sent */
              <div
                style={{
                  padding: "14px 24px",
                  borderTop: "1px solid #f59e0b40",
                  background: "#1a1408",
                  color: "#f59e0b",
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <AlertTriangle style={{ width: 18, height: 18, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: "#fbbf24", marginBottom: 2 }}>
                    24-hour reply window has expired
                  </div>
                  <div style={{ fontSize: 11, color: "#a78b5a" }}>
                    {lastInboundAt
                      ? `Last customer message ${formatDistanceToNow(new Date(lastInboundAt), { addSuffix: true })}.`
                      : "No inbound message yet — Meta requires a template to start the conversation."}
                    {" "}Send an approved template to re-open it.
                  </div>
                </div>
                <button
                  onClick={() => void openTemplateModal()}
                  style={{
                    padding: "8px 16px",
                    background: "#f59e0b",
                    border: "none",
                    borderRadius: 4,
                    color: "#000",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    flexShrink: 0,
                  }}
                >
                  <FileText style={{ width: 13, height: 13 }} />
                  Send Template
                </button>
              </div>
            ) : (
              <>
                {/* Window-remaining indicator (only when low) */}
                {windowMsRemaining > 0 && windowMsRemaining < 6 * 60 * 60 * 1000 && (
                  <div
                    style={{
                      padding: "6px 24px",
                      borderTop: "1px solid #1e1e1e",
                      background: "#1a1408",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 11,
                      color: "#f59e0b",
                    }}
                  >
                    <Clock style={{ width: 12, height: 12 }} />
                    <span>
                      {Math.floor(windowMsRemaining / 3600000)}h {Math.floor((windowMsRemaining % 3600000) / 60000)}m left in 24h reply window — outside it Meta only allows approved templates.
                    </span>
                  </div>
                )}
                <div
                  style={{
                    padding: "16px 24px",
                    borderTop: "1px solid #1e1e1e",
                    display: "flex",
                    alignItems: "flex-end",
                    gap: 12,
                  }}
                >
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={attaching}
                  style={{
                    width: 36,
                    height: 36,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "transparent",
                    border: "none",
                    color: attaching ? "#999" : "#555",
                    cursor: attaching ? "wait" : "pointer",
                    flexShrink: 0,
                  }}
                  aria-label="Attach file"
                >
                  {attaching ? (
                    <Loader2 style={{ width: 18, height: 18 }} className="animate-spin" />
                  ) : (
                    <Paperclip style={{ width: 18, height: 18 }} />
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,video/mp4,video/3gpp,audio/aac,audio/mp4,audio/mpeg,audio/amr,audio/ogg,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleAttach(f);
                    e.target.value = "";
                  }}
                />
                <div style={{ flex: 1, position: "relative" }}>
                  <textarea
                    ref={textareaRef}
                    value={replyText}
                    onChange={(e) => {
                      setReplyText(e.target.value);
                      // Auto-resize
                      e.target.style.height = "auto";
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                    }}
                    onKeyDown={onKeyDown}
                    placeholder="Type a message..."
                    rows={1}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      background: "#1a1a1a",
                      border: "1px solid transparent",
                      borderRadius: 3,
                      color: "#fff",
                      fontSize: 13,
                      resize: "none",
                      outline: "none",
                      lineHeight: 1.5,
                      maxHeight: 120,
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "#333")}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "transparent")}
                  />
                  {replyText.length > 800 && (
                    <span
                      style={{
                        position: "absolute",
                        right: 10,
                        bottom: 6,
                        fontSize: 10,
                        color: replyText.length > 4096 ? "#ef4444" : "#666",
                      }}
                    >
                      {replyText.length} / 4096
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={openQuickReplies}
                  title="Quick replies"
                  aria-label="Quick replies"
                  style={{
                    width: 36,
                    height: 36,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "transparent",
                    border: "none",
                    color: "#555",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  <Sparkles style={{ width: 18, height: 18 }} />
                </button>
                <div style={{ position: "relative" }}>
                  <button
                    type="button"
                    onClick={() => setEmojiOpen((v) => !v)}
                    style={{
                      width: 36,
                      height: 36,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "transparent",
                      border: "none",
                      color: emojiOpen ? "#fff" : "#555",
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    <Smile style={{ width: 18, height: 18 }} />
                  </button>
                  {emojiOpen && (
                    <EmojiPicker
                      onPick={(emoji) => {
                        setReplyText((prev) => prev + emoji);
                        setEmojiOpen(false);
                        textareaRef.current?.focus();
                      }}
                    />
                  )}
                </div>
                <button
                  onClick={() => void handleSend()}
                  disabled={!replyText.trim() || sending}
                  style={{
                    width: 36,
                    height: 36,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: replyText.trim() ? "#fff" : "#333",
                    border: "none",
                    borderRadius: 3,
                    cursor: replyText.trim() ? "pointer" : "not-allowed",
                    color: replyText.trim() ? "#000" : "#666",
                    flexShrink: 0,
                    transition: "all 0.15s",
                  }}
                >
                  <Send style={{ width: 16, height: 16 }} />
                </button>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* ---- New chat modal ---- */}
      {newChatOpen && (
        <div
          onClick={() => !ncCreating && setNewChatOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 440,
              background: "#0f0f0f",
              border: "1px solid #2a2a2a",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #1e1e1e", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: "#fff", margin: 0 }}>Start new chat</h3>
                <p style={{ fontSize: 11, color: "#666", margin: "2px 0 0" }}>
                  First message must be an approved template (Meta policy).
                </p>
              </div>
              <button
                onClick={() => !ncCreating && setNewChatOpen(false)}
                style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", color: "#666", cursor: "pointer", borderRadius: 4 }}
              >
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>
            <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 0.5 }}>Contact name</label>
                <input
                  value={ncName}
                  onChange={(e) => setNcName(e.target.value)}
                  placeholder="e.g. Aisha Khan"
                  autoFocus
                  style={{ width: "100%", marginTop: 6, padding: "8px 10px", background: "#0a0a0a", border: "1px solid #2a2a2a", borderRadius: 4, color: "#fff", fontSize: 13, outline: "none" }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 0.5 }}>Phone (with country code)</label>
                <input
                  value={ncPhone}
                  onChange={(e) => setNcPhone(e.target.value)}
                  placeholder="+971501234567"
                  style={{ width: "100%", marginTop: 6, padding: "8px 10px", background: "#0a0a0a", border: "1px solid #2a2a2a", borderRadius: 4, color: "#fff", fontSize: 13, outline: "none", fontFamily: "monospace" }}
                />
              </div>
            </div>
            <div style={{ padding: "12px 18px", borderTop: "1px solid #1e1e1e", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={() => !ncCreating && setNewChatOpen(false)}
                style={{ padding: "8px 14px", background: "transparent", border: "1px solid #333", borderRadius: 4, color: "#ccc", fontSize: 12, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={() => void createNewChat()}
                disabled={ncCreating || !ncName.trim() || !ncPhone.trim()}
                style={{
                  padding: "8px 16px",
                  background: ncCreating || !ncName.trim() || !ncPhone.trim() ? "#333" : "#25D366",
                  border: "none",
                  borderRadius: 4,
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: ncCreating || !ncName.trim() || !ncPhone.trim() ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {ncCreating ? <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" /> : <MessageSquarePlus style={{ width: 13, height: 13 }} />}
                Create chat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Send template modal ---- */}
      {/* ---- Quick replies modal ---- */}
      {quickRepliesOpen && (
        <div
          onClick={() => setQuickRepliesOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 520,
              maxHeight: "85vh",
              background: "#0f0f0f",
              border: "1px solid #2a2a2a",
              borderRadius: 8,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "14px 18px",
                borderBottom: "1px solid #1e1e1e",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: "#fff", margin: 0 }}>Quick Replies</h3>
                <p style={{ fontSize: 11, color: "#666", margin: "2px 0 0" }}>
                  Saved snippets — click to insert into the reply box
                </p>
              </div>
              <button
                onClick={() => setQuickRepliesOpen(false)}
                style={{
                  width: 28,
                  height: 28,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "transparent",
                  border: "none",
                  color: "#666",
                  cursor: "pointer",
                  borderRadius: 4,
                }}
                aria-label="Close"
              >
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>

            <div style={{ padding: 18, overflowY: "auto", flex: 1 }}>
              {/* Add new */}
              {qrFormOpen ? (
                <div style={{ marginBottom: 14, padding: 12, border: "1px solid #2a2a2a", borderRadius: 4, background: "#0a0a0a" }}>
                  <input
                    value={qrTitle}
                    onChange={(e) => setQrTitle(e.target.value)}
                    placeholder="Title (e.g. Greeting, Closing, FAQ link)"
                    maxLength={80}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      background: "#0a0a0a",
                      border: "1px solid #2a2a2a",
                      borderRadius: 4,
                      color: "#fff",
                      fontSize: 12,
                      outline: "none",
                      marginBottom: 8,
                    }}
                  />
                  <textarea
                    value={qrContent}
                    onChange={(e) => setQrContent(e.target.value)}
                    placeholder="Message content (you can use emojis 🙂)"
                    rows={4}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      background: "#0a0a0a",
                      border: "1px solid #2a2a2a",
                      borderRadius: 4,
                      color: "#fff",
                      fontSize: 12,
                      outline: "none",
                      resize: "vertical",
                      fontFamily: "inherit",
                    }}
                  />
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                    <button
                      onClick={() => { setQrFormOpen(false); setQrTitle(""); setQrContent(""); }}
                      style={{
                        padding: "6px 12px",
                        background: "transparent",
                        border: "1px solid #333",
                        borderRadius: 4,
                        color: "#ccc",
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => void saveQuickReply()}
                      disabled={qrSaving || !qrTitle.trim() || !qrContent.trim()}
                      style={{
                        padding: "6px 12px",
                        background: qrTitle.trim() && qrContent.trim() && !qrSaving ? "#df5641" : "#333",
                        border: "none",
                        borderRadius: 4,
                        color: "#fff",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: qrTitle.trim() && qrContent.trim() && !qrSaving ? "pointer" : "not-allowed",
                      }}
                    >
                      {qrSaving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setQrFormOpen(true)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 12px",
                    background: "transparent",
                    border: "1px dashed #333",
                    borderRadius: 4,
                    color: "#888",
                    fontSize: 11,
                    cursor: "pointer",
                    marginBottom: 14,
                  }}
                >
                  <Plus style={{ width: 12, height: 12 }} />
                  New Quick Reply
                </button>
              )}

              {/* List */}
              {quickReplies.length === 0 ? (
                <p style={{ fontSize: 12, color: "#666" }}>No quick replies yet. Add one above.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {quickReplies.map((q) => (
                    <div
                      key={q.id}
                      style={{
                        padding: "10px 12px",
                        background: "#1a1a1a",
                        border: "1px solid #2a2a2a",
                        borderRadius: 4,
                        display: "flex",
                        gap: 8,
                        alignItems: "flex-start",
                      }}
                    >
                      <button
                        onClick={() => insertQuickReply(q.content)}
                        style={{
                          flex: 1,
                          textAlign: "left",
                          background: "transparent",
                          border: "none",
                          color: "#fff",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{q.title}</div>
                        <p
                          style={{
                            fontSize: 11,
                            color: "#888",
                            margin: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                          }}
                        >
                          {q.content}
                        </p>
                      </button>
                      <button
                        onClick={() => void deleteQuickReply(q.id)}
                        title="Delete"
                        style={{
                          width: 24,
                          height: 24,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "transparent",
                          border: "none",
                          color: "#666",
                          cursor: "pointer",
                          borderRadius: 3,
                        }}
                      >
                        <Trash2 style={{ width: 13, height: 13 }} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tplModalOpen && (
        <div
          onClick={() => setTplModalOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 520,
              maxHeight: "85vh",
              background: "#0f0f0f",
              border: "1px solid #2a2a2a",
              borderRadius: 8,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "14px 18px",
                borderBottom: "1px solid #1e1e1e",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: "#fff", margin: 0 }}>Send Template</h3>
                <p style={{ fontSize: 11, color: "#666", margin: "2px 0 0" }}>
                  to {activeConv?.contactName ?? activeConv?.contactPhone}
                </p>
              </div>
              <button
                onClick={() => setTplModalOpen(false)}
                style={{
                  width: 28,
                  height: 28,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "transparent",
                  border: "none",
                  color: "#666",
                  cursor: "pointer",
                  borderRadius: 4,
                }}
                aria-label="Close"
              >
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>

            <div style={{ padding: 18, overflowY: "auto", flex: 1 }}>
              {/* Template list */}
              <label style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 0.5 }}>
                Approved templates
              </label>
              {tplList.length === 0 ? (
                <p style={{ fontSize: 12, color: "#666", marginTop: 8 }}>
                  No approved templates available. Submit one in the Broadcast page.
                </p>
              ) : (
                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
                  {tplList.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setTplSelectedId(t.id);
                        setTplVars({});
                      }}
                      style={{
                        textAlign: "left",
                        padding: "10px 12px",
                        background: tplSelectedId === t.id ? "#1a1a1a" : "transparent",
                        border: `1px solid ${tplSelectedId === t.id ? "#df5641" : "#2a2a2a"}`,
                        borderRadius: 4,
                        color: "#fff",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, fontFamily: "monospace" }}>{t.name}</span>
                        <span style={{ fontSize: 10, color: "#666" }}>{t.language}</span>
                        {t.variableCount > 0 && (
                          <span style={{ fontSize: 10, color: "#3b82f6" }}>
                            {t.variableCount} variable{t.variableCount !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                      <p
                        style={{
                          fontSize: 11,
                          color: "#888",
                          margin: "4px 0 0",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                        }}
                      >
                        {t.body}
                      </p>
                    </button>
                  ))}
                </div>
              )}

              {/* Variable inputs */}
              {tplSelected && tplSelected.variableCount > 0 && (
                <div style={{ marginTop: 16 }}>
                  <label style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Variables
                  </label>
                  <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
                    {Array.from({ length: tplSelected.variableCount }, (_, i) => i + 1).map((n) => (
                      <input
                        key={n}
                        value={tplVars[String(n)] ?? ""}
                        onChange={(e) => setTplVars((prev) => ({ ...prev, [String(n)]: e.target.value }))}
                        placeholder={`Value for {{${n}}}`}
                        style={{
                          padding: "8px 10px",
                          background: "#0a0a0a",
                          border: "1px solid #2a2a2a",
                          borderRadius: 4,
                          color: "#fff",
                          fontSize: 12,
                          outline: "none",
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Preview */}
              {tplSelected && (
                <div style={{ marginTop: 16 }}>
                  <label style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Preview
                  </label>
                  <div
                    style={{
                      marginTop: 6,
                      padding: 12,
                      background: "#1a1a1a",
                      border: "1px solid #2a2a2a",
                      borderRadius: 4,
                      fontSize: 12,
                      color: "#ddd",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {tplPreview}
                  </div>
                </div>
              )}
            </div>

            <div
              style={{
                padding: "12px 18px",
                borderTop: "1px solid #1e1e1e",
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <button
                onClick={() => setTplModalOpen(false)}
                style={{
                  padding: "8px 14px",
                  background: "transparent",
                  border: "1px solid #333",
                  borderRadius: 4,
                  color: "#ccc",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => void sendTemplate()}
                disabled={!tplSelectedId || tplSending}
                style={{
                  padding: "8px 16px",
                  background: tplSelectedId && !tplSending ? "#df5641" : "#333",
                  border: "none",
                  borderRadius: 4,
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: tplSelectedId && !tplSending ? "pointer" : "not-allowed",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {tplSending ? (
                  <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />
                ) : (
                  <Send style={{ width: 14, height: 14 }} />
                )}
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
