import { CommandPalette } from "@/components/layout/CommandPalette";
import { Header } from "@/components/layout/Header";
import { KeyboardShortcuts } from "@/components/layout/KeyboardShortcuts";
import { NavigationProgress } from "@/components/layout/NavigationProgress";
import { Sidebar } from "@/components/layout/Sidebar";
import { FontProvider } from "@/components/providers/FontProvider";

export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <FontProvider>
      <div className="flex min-h-screen bg-background">
        <NavigationProgress />
        <Sidebar />
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <div className="sticky top-0 z-30">
            <Header />
          </div>
          <KeyboardShortcuts />
          <CommandPalette />
          <main className="flex-1 p-6 xl:p-8">{children}</main>
        </div>
      </div>
    </FontProvider>
  );
}
