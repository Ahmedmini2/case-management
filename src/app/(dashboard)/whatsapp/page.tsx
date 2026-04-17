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

type Filter = "all" | "ai" | "human" | "unread";

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

function MediaPreview({ mediaType }: { mediaType: string }) {
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
      <Download className="h-3.5 w-3.5 ml-auto" />
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
  const [takingOver, setTakingOver] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [assignDropdownOpen, setAssignDropdownOpen] = useState(false);
  const [agents, setAgents] = useState<{ id: string; name: string | null; email: string }[]>([]);
  const [showTagInput, setShowTagInput] = useState(false);
  const [tagInput, setTagInput] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeConv = conversations.find((c) => c.id === activeId) ?? null;

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

  /* ---- Poll conversations every 15s ---- */
  useEffect(() => {
    const id = setInterval(() => void loadConversations(), 15000);
    return () => clearInterval(id);
  }, [loadConversations]);

  /* ---- Load messages when active changes ---- */
  useEffect(() => {
    if (activeId) void loadMessages(activeId);
    else setMessages([]);
  }, [activeId, loadMessages]);

  /* ---- Poll active conversation messages every 5s ---- */
  useEffect(() => {
    if (!activeId) return;
    const id = setInterval(() => void loadMessages(activeId), 5000);
    return () => clearInterval(id);
  }, [activeId, loadMessages]);

  /* ---- Auto-scroll to bottom ---- */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ---- Filter conversations ---- */
  const filtered = conversations.filter((c) => {
    const q = search.toLowerCase();
    if (q && !c.contactName.toLowerCase().includes(q) && !c.contactPhone.includes(q) && !(c.lastMessage ?? "").toLowerCase().includes(q)) return false;
    if (filter === "ai" && c.handledBy !== "AI") return false;
    if (filter === "human" && c.handledBy !== "HUMAN") return false;
    if (filter === "unread" && c.unreadCount === 0) return false;
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
    if (activeConv.tags.includes(tag)) { toast.error("Tag already exists"); return; }
    const newTags = [...activeConv.tags, tag];
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
    const newTags = activeConv.tags.filter((t) => t !== tag);
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
    { key: "ai", label: "AI Handling" },
    { key: "human", label: "Human" },
    { key: "unread", label: "Unread" },
  ];

  return (
    <div style={{ display: "flex", height: "calc(100vh - 64px)", margin: "-24px -24px 0 -24px", overflow: "hidden" }}>
      {/* =================== LEFT PANEL =================== */}
      <div
        style={{
          width: 340,
          minWidth: 340,
          display: "flex",
          flexDirection: "column",
          background: "#0f0f0f",
          borderRight: "1px solid #1e1e1e",
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

        {/* Conversation list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading ? (
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
                    {conv.tags.length > 0 && (
                      <div style={{ display: "flex", gap: 3, marginTop: 3, flexWrap: "wrap" }}>
                        {conv.tags.slice(0, 3).map((tag) => (
                          <span key={tag} style={{ fontSize: 9, padding: "1px 5px", background: "#df564120", color: "#df5641", borderRadius: 2 }}>{tag}</span>
                        ))}
                        {conv.tags.length > 3 && <span style={{ fontSize: 9, color: "#555" }}>+{conv.tags.length - 3}</span>}
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
      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#0a0a0a", minWidth: 0 }}>
        {!activeConv ? (
          /* Empty state */
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: "#555" }}>
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
              {/* Left: avatar + info */}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
                {activeConv.tags.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                    {activeConv.tags.map((tag) => (
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
                            {msg.mediaType && <MediaPreview mediaType={msg.mediaType} />}
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
            ) : (
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
                  <Paperclip style={{ width: 18, height: 18 }} />
                </button>
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
            )}
          </>
        )}
      </div>
    </div>
  );
}
