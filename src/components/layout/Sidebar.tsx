"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bell,
  Bot,
  ChevronRight,
  Contact,
  FileText,
  Gauge,
  KeyRound,
  LayoutList,
  LifeBuoy,
  Map,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
  Settings,
  ShieldCheck,
  Type,
  Users,
  Webhook,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMobileNav } from "@/components/layout/MobileNav";

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

const coreItems = [
  { href: "/reports", label: "Dashboard", icon: Gauge },
  { href: "/cases", label: "All Cases", icon: LayoutList },
  { href: "/board", label: "Board", icon: Map },
  { href: "/whatsapp", label: "WhatsApp", icon: WhatsAppIcon, iconColor: "#25D366" },
  { href: "/broadcast", label: "Broadcast", icon: Radio, iconColor: "#25D366" },
  { href: "/contacts", label: "Contacts", icon: Contact },
  { href: "/automations", label: "Automations", icon: Bot },
  { href: "/notifications", label: "Notifications", icon: Bell },
];

const settingsItems = [
  { href: "/settings/general", label: "General", icon: Settings },
  { href: "/settings/fonts", label: "Fonts", icon: Type },
  { href: "/settings/users", label: "Users", icon: Users },
  { href: "/settings/team", label: "Team & Permissions", icon: ShieldCheck },
  { href: "/settings/pipelines", label: "Pipelines", icon: Map },
  { href: "/settings/sla", label: "SLA Policies", icon: Gauge },
  { href: "/settings/custom-fields", label: "Custom Fields", icon: FileText },
  { href: "/settings/email", label: "Email", icon: LifeBuoy },
  { href: "/settings/automations", label: "Automations", icon: Zap },
  { href: "/settings/integrations", label: "Integrations", icon: Webhook },
  { href: "/settings/api-keys", label: "API Keys", icon: KeyRound },
  { href: "/settings/audit-log", label: "Audit Log", icon: FileText },
  { href: "/settings/permissions", label: "Permissions", icon: ShieldCheck },
];

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  iconColor,
  collapsed,
  badge,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
  iconColor?: string;
  collapsed?: boolean;
  badge?: number;
}) {
  const hasBadge = typeof badge === "number" && badge > 0;
  return (
    <Link
      href={href}
      title={collapsed ? `${label}${hasBadge ? ` (${badge} unread)` : ""}` : undefined}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-lg text-sm font-medium transition-all duration-150",
        collapsed ? "justify-center px-0 py-2" : "px-3 py-2",
        active
          ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm shadow-black/20"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
      )}
    >
      <span className="relative shrink-0">
        <Icon
          className={cn(
            "h-4 w-4 transition-colors",
            !iconColor && (active ? "text-sidebar-primary-foreground" : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground"),
          )}
          style={iconColor ? { color: iconColor } : undefined}
        />
        {/* Badge shown beside the icon when sidebar is collapsed (no room for it on the right) */}
        {hasBadge && collapsed && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </span>
      {!collapsed && <span className="truncate">{label}</span>}
      {/* Badge on the right when expanded (next to the label) */}
      {hasBadge && !collapsed && (
        <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold leading-none text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
      {!collapsed && active && !hasBadge && <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 opacity-70" />}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { open, setOpen } = useMobileNav();
  const [collapsed, setCollapsed] = useState(false);
  // SSR/first paint assumes desktop so the static sidebar renders expanded
  // (matching server output). Flipped on mount + on resize across the lg breakpoint.
  const [isDesktop, setIsDesktop] = useState(true);
  const [whatsappUnread, setWhatsappUnread] = useState(0);
  const [casesUnread, setCasesUnread] = useState(0);

  // The "collapsed" (icons-only) treatment only applies to the static desktop
  // sidebar. The mobile drawer is always full-width and expanded.
  const isCollapsed = collapsed && isDesktop;

  // Track the lg (1024px) breakpoint that switches between drawer and static.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Close the mobile drawer whenever the route changes (a nav item was tapped).
  useEffect(() => {
    setOpen(false);
  }, [pathname, setOpen]);

  // Hydrate persisted state. SSR renders expanded; client may flip after mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem("sidebar.collapsed") === "1") setCollapsed(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("sidebar.collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    for (const item of [...coreItems, ...settingsItems]) {
      router.prefetch(item.href);
    }
  }, [router]);

  // Poll the unread badges (WhatsApp messages + new cases) on one interval.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [wa, cs] = await Promise.all([
          fetch("/api/whatsapp/unread-count", { cache: "no-store" }),
          fetch("/api/cases/unread-count", { cache: "no-store" }),
        ]);
        if (wa.ok) {
          const json = (await wa.json()) as { data?: { total: number } | null };
          if (!cancelled) setWhatsappUnread(json.data?.total ?? 0);
        }
        if (cs.ok) {
          const json = (await cs.json()) as { data?: { total: number } | null };
          if (!cancelled) setCasesUnread(json.data?.total ?? 0);
        }
      } catch { /* offline or signed out — leave the counts as-is */ }
    }
    void load();
    const id = setInterval(load, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // (settings active state is computed inline where needed)

  return (
    <>
      {/* Mobile backdrop — taps close the drawer */}
      <div
        onClick={() => setOpen(false)}
        aria-hidden
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <aside
        className={cn(
          // Mobile (< lg): off-canvas drawer sliding in over the content.
          "fixed inset-y-0 left-0 z-50 flex h-screen w-64 shrink-0 flex-col border-r bg-sidebar transition-transform duration-200 ease-out",
          // Desktop (lg+): static, sticky, width-collapsible.
          "lg:sticky lg:top-0 lg:z-40 lg:translate-x-0 lg:transition-[width]",
          isCollapsed ? "lg:w-14" : "lg:w-64",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Logo / Brand */}
        <div className={cn("flex h-16 items-center border-b border-sidebar-border", isCollapsed ? "justify-center px-2" : "gap-3 px-5")}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[#df5641] shadow-sm">
            <span className="text-sm font-black text-white leading-none">D</span>
          </div>
          {!isCollapsed && (
            <div className="min-w-0">
              <p className="text-sm font-bold tracking-widest uppercase text-sidebar-foreground">The Dungeon</p>
              <p className="text-[10px] text-sidebar-foreground/40 uppercase tracking-widest">Support Hub</p>
            </div>
          )}
          {/* Mobile close button */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close navigation menu"
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Collapse toggle (desktop only) */}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "mx-2 mt-2 hidden h-8 items-center gap-2 rounded-md text-xs font-medium text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors lg:flex",
            isCollapsed ? "justify-center px-0" : "justify-start px-2",
          )}
        >
          {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          {!isCollapsed && <span>Collapse</span>}
        </button>

        {/* Scrollable nav */}
        <nav className={cn("flex-1 overflow-y-auto py-4 space-y-5", isCollapsed ? "px-2" : "px-3")}>
          {/* Core section */}
          <div>
            {!isCollapsed && (
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/30">
                Menu
              </p>
            )}
            <div className="space-y-0.5">
              {coreItems.map((item) => {
                const active =
                  item.href === "/reports"
                    ? pathname === "/" || pathname === "/reports"
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
                const badge =
                  item.href === "/whatsapp" ? whatsappUnread : item.href === "/cases" ? casesUnread : undefined;
                return <NavItem key={item.href} {...item} active={active} collapsed={isCollapsed} badge={badge} />;
              })}
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-sidebar-border" />

          {/* Settings section */}
          <div>
            {!isCollapsed && (
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/30">
                Settings
              </p>
            )}
            <div className="space-y-0.5">
              {settingsItems.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return <NavItem key={item.href} {...item} active={active} collapsed={isCollapsed} />;
              })}
            </div>
          </div>
        </nav>

        {/* Footer */}
        {!isCollapsed && (
          <div className="border-t border-sidebar-border px-4 py-3">
            <p className="text-[10px] text-sidebar-foreground/25 text-center">The Dungeon Gear &middot; Dubai</p>
          </div>
        )}
      </aside>
    </>
  );
}
