"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, Type } from "lucide-react";
import { FONT_OPTIONS } from "@/lib/fonts";
import { useFont } from "@/components/providers/FontProvider";

export default function FontsSettingsPage() {
  const { font: currentFont, setFont, previewFont, saving } = useFont();
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  async function pick(key: string) {
    if (key === currentFont.key) return;
    setPendingKey(key);
    try {
      await setFont(key);
      toast.success(`Font set to ${FONT_OPTIONS.find((f) => f.key === key)?.label ?? key}`);
    } catch {
      toast.error("Failed to save font preference");
    }
    setPendingKey(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Type className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Fonts</h2>
          <p className="text-sm text-muted-foreground">
            Pick the typeface used across the whole app. Your choice is saved to your account, so it follows you when you sign in on another browser.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {FONT_OPTIONS.map((opt) => {
          const isActive = opt.key === currentFont.key;
          const isPending = pendingKey === opt.key && saving;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => void pick(opt.key)}
              onMouseEnter={() => previewFont(opt.key)}
              onMouseLeave={() => previewFont(null)}
              onFocus={() => previewFont(opt.key)}
              onBlur={() => previewFont(null)}
              className={`text-left rounded-xl border p-4 transition-all relative ${
                isActive
                  ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                  : "bg-card hover:border-primary/40"
              }`}
              style={{ fontFamily: opt.stack }}
            >
              {/* Header row */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold text-sm" style={{ fontFamily: opt.stack }}>
                    {opt.label}
                  </span>
                  {opt.arabic && (
                    <span className="text-[9px] uppercase tracking-wide bg-emerald-500/15 text-emerald-500 px-1.5 py-0.5 rounded">
                      Arabic
                    </span>
                  )}
                </div>
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : isActive ? (
                  <Check className="h-4 w-4 text-primary" />
                ) : null}
              </div>

              {/* Description */}
              <p className="text-[11px] text-muted-foreground mb-3" style={{ fontFamily: "var(--font-sans, system-ui)" }}>
                {opt.description}
              </p>

              {/* Live preview */}
              <div className="rounded-lg bg-muted/30 p-3 space-y-1.5" style={{ fontFamily: opt.stack }}>
                <p className="text-base font-semibold">The quick brown fox</p>
                <p className="text-sm">jumps over the lazy dog 0123456789</p>
                {opt.arabic && (
                  <p className="text-sm" dir="rtl">
                    الثعلب البني السريع يقفز فوق الكلب الكسول
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
        Hover any card to preview the font live in the app. Click to apply it permanently. Custom fonts (other than the default) are downloaded from Google Fonts on demand.
      </div>
    </div>
  );
}
