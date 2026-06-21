"use client";

import Link from "next/link";
import { Bell, Check, CheckCheck, MessageCircle, AlertCircle, Zap, Mail, X } from "lucide-react";
import { useEffect, useState, useCallback, useRef } from "react";
import { formatDistanceToNow } from "date-fns";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  isRead: boolean;
  link: string | null;
  createdAt: string;
};

function NotifIcon({ type }: { type: string }) {
  const base = "h-5 w-5";
  if (type === "WHATSAPP") return <MessageCircle className={`${base} text-green-500`} />;
  if (type === "EMAIL") return <Mail className={`${base} text-blue-400`} />;
  if (type === "AUTOMATION") return <Zap className={`${base} text-amber-400`} />;
  if (type === "WARNING" || type === "SLA") return <AlertCircle className={`${base} text-red-400`} />;
  return <Bell className={`${base} text-muted-foreground`} />;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const loadAll = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      const json = (await res.json()) as { data: Notification[] | null };
      const items = json.data ?? [];
      setNotifications(items);
      setUnreadCount(items.filter((n) => !n.isRead).length);
    } catch { /* silent */ }
  }, []);

  const loadCount = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?unreadOnly=true");
      const json = (await res.json()) as { meta?: { total?: number } };
      setUnreadCount(json.meta?.total ?? 0);
    } catch { /* silent */ }
  }, []);

  // Load count on mount + poll
  useEffect(() => {
    void loadCount();
    const id = setInterval(() => void loadCount(), 10000);
    return () => clearInterval(id);
  }, [loadCount]);

  // Load all when panel opens
  useEffect(() => {
    if (open) void loadAll();
  }, [open, loadAll]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  async function markRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
  }

  async function markAllRead() {
    const unread = notifications.filter((n) => !n.isRead);
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    await Promise.all(unread.map((n) => fetch(`/api/notifications/${n.id}/read`, { method: "PATCH" })));
  }

  return (
    <div ref={panelRef} style={{ position: "relative" }}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-accent"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
      >
        <Bell className="h-4 w-4 text-muted-foreground" />
        {unreadCount > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            // Clamp to the viewport so the panel never overflows on phones
            // (anchored at the bell's right edge, ~16px from the screen edge).
            width: "min(380px, calc(100vw - 24px))",
            maxHeight: "70vh",
            display: "flex",
            flexDirection: "column",
            borderRadius: 12,
            overflow: "hidden",
            zIndex: 100,
          }}
          className="border bg-popover shadow-xl shadow-black/20"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h3 className="text-sm font-bold">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={() => void markAllRead()}
                  className="text-[11px] font-medium text-primary hover:underline"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-muted text-muted-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Notification list */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <Bell className="h-8 w-8 text-muted-foreground/20" />
                <p className="text-sm text-muted-foreground">No notifications yet</p>
              </div>
            ) : (
              notifications.map((notif) => {
                const inner = (
                  <div
                    className={`flex gap-3 px-4 py-3 transition-colors cursor-pointer ${
                      notif.isRead
                        ? "hover:bg-muted/50"
                        : "bg-primary/5 hover:bg-primary/10"
                    }`}
                    style={{ borderBottom: "1px solid var(--border)" }}
                  >
                    {/* Icon */}
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                      <NotifIcon type={notif.type} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-[13px] leading-snug ${notif.isRead ? "text-muted-foreground" : "text-foreground font-medium"}`}>
                        {notif.title}
                      </p>
                      {notif.body && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {notif.body}
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground/60 mt-1">
                        {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}
                      </p>
                    </div>

                    {/* Unread dot + read button */}
                    <div className="flex flex-col items-center justify-center gap-1 shrink-0">
                      {!notif.isRead && (
                        <>
                          <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              void markRead(notif.id);
                            }}
                            className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-muted text-muted-foreground"
                            title="Mark as read"
                          >
                            <Check className="h-3 w-3" />
                          </button>
                        </>
                      )}
                      {notif.isRead && (
                        <CheckCheck className="h-3.5 w-3.5 text-muted-foreground/30" />
                      )}
                    </div>
                  </div>
                );

                if (notif.link) {
                  return (
                    <Link
                      key={notif.id}
                      href={notif.link}
                      onClick={() => {
                        if (!notif.isRead) void markRead(notif.id);
                        setOpen(false);
                      }}
                      className="block"
                    >
                      {inner}
                    </Link>
                  );
                }

                return (
                  <div
                    key={notif.id}
                    onClick={() => { if (!notif.isRead) void markRead(notif.id); }}
                  >
                    {inner}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="flex items-center justify-center py-2.5 border-t text-xs font-medium text-primary hover:bg-muted/50 transition-colors"
          >
            See all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
