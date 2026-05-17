// Shared catalog of selectable UI fonts.
// Used by the API (allow-list), the Settings → Fonts page (picker UI),
// and the FontProvider (applies the user's choice at runtime).

export type FontOption = {
  key: string;
  label: string;
  description: string;
  /** CSS font-family value with fallbacks. */
  stack: string;
  /** Google Fonts stylesheet URL (null = no extra download needed). */
  googleHref: string | null;
  /** Whether the font ships Arabic glyphs. */
  arabic: boolean;
};

export const FONT_OPTIONS: FontOption[] = [
  {
    key: "default",
    label: "App Default",
    description: "Use the app's built-in font (Catamaran).",
    stack: 'Catamaran, system-ui, -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif',
    googleHref: null,
    arabic: false,
  },
  {
    key: "inter",
    label: "Inter",
    description: "Modern, clean, optimized for screens.",
    stack: '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
    googleHref: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
    arabic: false,
  },
  {
    key: "roboto",
    label: "Roboto",
    description: "Google's classic — neutral, highly readable.",
    stack: '"Roboto", system-ui, -apple-system, "Segoe UI", sans-serif',
    googleHref: "https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap",
    arabic: false,
  },
  {
    key: "open-sans",
    label: "Open Sans",
    description: "Friendly humanist sans-serif.",
    stack: '"Open Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
    googleHref: "https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700&display=swap",
    arabic: false,
  },
  {
    key: "nunito",
    label: "Nunito",
    description: "Soft, rounded — feels approachable.",
    stack: '"Nunito", system-ui, -apple-system, "Segoe UI", sans-serif',
    googleHref: "https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700&display=swap",
    arabic: false,
  },
  {
    key: "lato",
    label: "Lato",
    description: "Warm humanist sans-serif with strong personality.",
    stack: '"Lato", system-ui, -apple-system, "Segoe UI", sans-serif',
    googleHref: "https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&display=swap",
    arabic: false,
  },
  {
    key: "ibm-plex",
    label: "IBM Plex Sans",
    description: "Crisp corporate look with strong character.",
    stack: '"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
    googleHref: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap",
    arabic: false,
  },
  {
    key: "cairo",
    label: "Cairo",
    description: "Excellent Arabic + Latin support.",
    stack: '"Cairo", system-ui, -apple-system, "Segoe UI", "Noto Sans Arabic", sans-serif',
    googleHref: "https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700&display=swap",
    arabic: true,
  },
  {
    key: "tajawal",
    label: "Tajawal",
    description: "Modern Arabic-first sans-serif, also looks great in Latin.",
    stack: '"Tajawal", system-ui, -apple-system, "Segoe UI", "Noto Sans Arabic", sans-serif',
    googleHref: "https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700&display=swap",
    arabic: true,
  },
  {
    key: "noto-sans-arabic",
    label: "Noto Sans Arabic",
    description: "Google's universal Arabic typeface, very legible.",
    stack: '"Noto Sans Arabic", "Noto Sans", system-ui, -apple-system, sans-serif',
    googleHref: "https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;500;600;700&family=Noto+Sans:wght@400;500;600;700&display=swap",
    arabic: true,
  },
];

export function getFontByKey(key: string | null | undefined): FontOption {
  if (!key) return FONT_OPTIONS[0];
  return FONT_OPTIONS.find((f) => f.key === key) ?? FONT_OPTIONS[0];
}
