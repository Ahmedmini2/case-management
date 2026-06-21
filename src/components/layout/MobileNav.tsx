"use client";

import { createContext, useContext, useState } from "react";
import { Menu } from "lucide-react";

// Shared open/close state for the mobile sidebar drawer. The Sidebar (a client
// component) and the hamburger toggle (rendered inside the server Header) are
// siblings in the layout, so they coordinate through this context rather than
// local state. On lg+ screens the sidebar is static and this state is ignored.
type MobileNavCtx = { open: boolean; setOpen: (v: boolean) => void };

const Ctx = createContext<MobileNavCtx>({ open: false, setOpen: () => {} });

export function useMobileNav(): MobileNavCtx {
  return useContext(Ctx);
}

export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return <Ctx.Provider value={{ open, setOpen }}>{children}</Ctx.Provider>;
}

// Hamburger button — only visible below the lg breakpoint, where the sidebar is
// a drawer. Sits at the left of the header.
export function MobileNavToggle() {
  const { setOpen } = useMobileNav();
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Open navigation menu"
      className="lg:hidden flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}
