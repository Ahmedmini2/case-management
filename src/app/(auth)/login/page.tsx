"use client";

import { FormEvent, useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Mail, ArrowRight, ShieldCheck } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/cases";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl,
    });

    if (result?.error) {
      setLoading(false);
      setError("Invalid email or password. Please try again.");
      return;
    }
    window.location.assign(result?.url ?? callbackUrl);
  }

  return (
    <div className="flex min-h-screen">
      {/* Left panel — brand */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-[#1a1a1a] p-12">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded bg-[#df5641]">
            <span className="text-lg font-black text-white leading-none">D</span>
          </div>
          <span className="text-xl font-bold text-white tracking-widest uppercase">The Dungeon</span>
        </div>

        <div className="space-y-6">
          <h1 className="text-4xl font-bold leading-tight text-white uppercase tracking-wide">
            Support<br />Hub.
          </h1>
          <p className="text-lg text-white/50 leading-relaxed max-w-sm">
            Manage cases, WhatsApp conversations, and customer support — all in one place.
          </p>

          <div className="space-y-3 pt-2">
            {[
              "WhatsApp AI agent integration",
              "Automated SLA tracking and alerts",
              "Broadcast messaging to customers",
            ].map((feature) => (
              <div key={feature} className="flex items-center gap-2.5">
                <ShieldCheck className="h-4 w-4 text-[#df5641] shrink-0" />
                <span className="text-sm text-white/70">{feature}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-white/20">© {new Date().getFullYear()} The Dungeon Gear · Dubai, UAE</p>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-1 flex-col items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-[#df5641]">
              <span className="text-sm font-black text-white leading-none">D</span>
            </div>
            <span className="text-lg font-bold tracking-widest uppercase">The Dungeon</span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold tracking-tight">Welcome back</h2>
            <p className="mt-1 text-sm text-muted-foreground">Sign in to your account to continue.</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Email address
              </Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="pl-9 h-10"
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Password
              </Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-9 h-10"
                  required
                  autoComplete="current-password"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <Button type="submit" className="w-full h-10 gap-2" disabled={loading}>
              {loading ? "Signing in…" : (
                <>
                  Sign in
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>

            <div className="relative flex items-center gap-3 py-1">
              <div className="flex-1 border-t" />
              <span className="text-xs text-muted-foreground">or</span>
              <div className="flex-1 border-t" />
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full h-10"
              onClick={() => router.push("/register")}
            >
              Create an account
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
