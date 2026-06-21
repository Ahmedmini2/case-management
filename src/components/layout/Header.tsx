import { auth, signOut } from "@/lib/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MobileNavToggle } from "@/components/layout/MobileNav";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { LogOut } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function Header() {
  const session = await auth();

  // The JWT cookie holds the image at signin time. Fetch fresh from DB so the avatar
  // updates immediately after upload. Fall back to the session image only when the DB
  // row truly has no image set.
  let freshImage: string | null = session?.user?.image ?? null;
  if (session?.user?.id) {
    const { data } = await supabaseAdmin()
      .from("users")
      .select("image")
      .eq("id", session.user.id)
      .maybeSingle();
    const dbImage = (data as { image: string | null } | null)?.image ?? null;
    if (dbImage) freshImage = dbImage;
  }

  // Legacy local-uploads paths from before the Supabase Storage migration are dead links
  // on the deployed app. Render initials instead of a broken image.
  if (freshImage && freshImage.startsWith("/uploads/")) {
    freshImage = null;
  }
  if (process.env.NODE_ENV !== "production") {
    console.log("[Header] resolved avatar:", freshImage);
  }

  const displayName = session?.user?.name ?? session?.user?.email ?? "Unknown User";
  const initials = displayName
    .split(" ")
    .map((part: string) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="flex h-16 items-center justify-between gap-2 border-b bg-background/80 px-4 sm:px-6 backdrop-blur-sm">
      {/* Left: mobile menu toggle + user identity */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <MobileNavToggle />
        <Avatar className="h-8 w-8 shrink-0 ring-2 ring-primary/20">
          <AvatarImage src={freshImage ?? undefined} alt={displayName} />
          <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="hidden sm:block min-w-0">
          <p className="text-xs text-muted-foreground leading-none mb-0.5">Signed in as</p>
          <p className="text-sm font-semibold leading-none truncate">{displayName}</p>
        </div>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-1 shrink-0">
        <NotificationBell />
        <ThemeToggle />
        <div className="mx-1 h-5 w-px bg-border" />
        <Tooltip>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <TooltipTrigger
              render={<button
                type="submit"
                className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                aria-label="Sign out"
              />}
            >
              <LogOut className="h-4 w-4" />
            </TooltipTrigger>
          </form>
          <TooltipContent side="bottom">Sign out</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
