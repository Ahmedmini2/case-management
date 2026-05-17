"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { FONT_OPTIONS, getFontByKey, type FontOption } from "@/lib/fonts";

type FontContextValue = {
  font: FontOption;
  /** Apply (and persist for the signed-in user) a new font choice. */
  setFont: (key: string) => Promise<void>;
  /** Apply a font locally without persisting — used for hover previews on the settings page. */
  previewFont: (key: string | null) => void;
  saving: boolean;
};

const FontContext = createContext<FontContextValue | null>(null);

const LINK_ID = "user-font-stylesheet";
const STORAGE_KEY = "user.fontPreference";

function loadGoogleFont(href: string | null) {
  if (typeof document === "undefined") return;
  const existing = document.getElementById(LINK_ID) as HTMLLinkElement | null;
  if (!href) {
    existing?.remove();
    return;
  }
  if (existing && existing.href === href) return;
  if (existing) existing.remove();
  const link = document.createElement("link");
  link.id = LINK_ID;
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

function applyFontStack(stack: string | null) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!stack) {
    root.style.removeProperty("--font-sans");
    root.style.removeProperty("--font-heading");
    root.style.fontFamily = "";
    return;
  }
  // Set Tailwind theme variables so utility classes (font-sans, font-heading)
  // pick up the user's font, and also set the inline style as a fallback
  // for elements without an explicit font-family class.
  root.style.setProperty("--font-sans", stack);
  root.style.setProperty("--font-heading", stack);
  root.style.fontFamily = stack;
}

export function FontProvider({ children }: { children: React.ReactNode }) {
  const [fontKey, setFontKey] = useState<string>("default");
  const [saving, setSaving] = useState(false);

  // 1. Apply the cached choice immediately so there's no FOUC on reload.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const cached = window.localStorage.getItem(STORAGE_KEY);
    if (cached) {
      const opt = getFontByKey(cached);
      loadGoogleFont(opt.googleHref);
      applyFontStack(opt.key === "default" ? null : opt.stack);
      setFontKey(opt.key);
    }
  }, []);

  // 2. Then fetch the authoritative value from the server (this also covers
  //    the case where the user signed in on a fresh browser / device).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/me/font", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { data?: { font: string | null } | null };
        const serverKey = json?.data?.font ?? "default";
        if (cancelled) return;
        const opt = getFontByKey(serverKey);
        loadGoogleFont(opt.googleHref);
        applyFontStack(opt.key === "default" ? null : opt.stack);
        setFontKey(opt.key);
        window.localStorage.setItem(STORAGE_KEY, opt.key);
      } catch {
        /* signed out or offline — keep the cached value */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setFont = useCallback(async (key: string) => {
    const opt = getFontByKey(key);
    // Optimistic apply
    loadGoogleFont(opt.googleHref);
    applyFontStack(opt.key === "default" ? null : opt.stack);
    setFontKey(opt.key);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, opt.key);
    }
    setSaving(true);
    try {
      await fetch("/api/me/font", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ font: opt.key }),
      });
    } finally {
      setSaving(false);
    }
  }, []);

  const previewFont = useCallback((key: string | null) => {
    if (!key) {
      // restore the persisted choice
      const opt = getFontByKey(fontKey);
      loadGoogleFont(opt.googleHref);
      applyFontStack(opt.key === "default" ? null : opt.stack);
      return;
    }
    const opt = getFontByKey(key);
    loadGoogleFont(opt.googleHref);
    applyFontStack(opt.key === "default" ? null : opt.stack);
  }, [fontKey]);

  const value = useMemo<FontContextValue>(() => ({
    font: getFontByKey(fontKey),
    setFont,
    previewFont,
    saving,
  }), [fontKey, setFont, previewFont, saving]);

  return <FontContext.Provider value={value}>{children}</FontContext.Provider>;
}

export function useFont(): FontContextValue {
  const ctx = useContext(FontContext);
  if (!ctx) {
    // Allow usage outside the provider (e.g. on the public login page) without
    // throwing — render a no-op stub.
    return {
      font: FONT_OPTIONS[0],
      setFont: async () => {},
      previewFont: () => {},
      saving: false,
    };
  }
  return ctx;
}
