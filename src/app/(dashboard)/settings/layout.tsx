import Link from "next/link";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/settings/general", label: "General" },
  { href: "/settings/fonts", label: "Fonts" },
  { href: "/settings/team", label: "Team" },
  { href: "/settings/users", label: "Users" },
  { href: "/settings/pipelines", label: "Pipelines" },
  { href: "/settings/automations", label: "Automations" },
  { href: "/settings/email", label: "Email" },
  { href: "/settings/sla", label: "SLA" },
  { href: "/settings/custom-fields", label: "Custom Fields" },
  { href: "/settings/api-keys", label: "API Keys" },
  { href: "/settings/audit-log", label: "Audit Log" },
  { href: "/settings/permissions", label: "Permissions" },
  { href: "/settings/integrations", label: "Integrations" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn("rounded-md border px-3 py-1 text-sm text-muted-foreground hover:bg-accent")}
          >
            {tab.label}
          </Link>
        ))}
      </div>
      <div>{children}</div>
    </div>
  );
}
