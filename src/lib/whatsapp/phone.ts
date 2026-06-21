// Canonical WhatsApp phone identity.
//
// THE BUG THIS FIXES: Meta's webhook delivers the sender as a bare `wa_id`
// (digits only, e.g. "971501234567"), while every app-side path (New Chat,
// broadcasts, contacts, the case panel) stores a `+`-prefixed value
// ("+971501234567"). Because `whatsapp_conversations.contactPhone` is UNIQUE,
// the same human ends up with two separate conversation rows. Funnelling every
// create/lookup-by-phone through one normalizer keeps a single identity.
//
// Canonical form: a single leading "+" followed by digits only (E.164-style).
// We pick `+`-prefixed because the whole app already uses it — only the webhook
// deviates — so this is the smallest-blast-radius choice.

/**
 * Normalize an arbitrary phone string to the canonical `+<digits>` form.
 * Returns "" for empty/garbage input so callers can reject it.
 *
 * - strips spaces, dashes, parentheses and any other formatting,
 * - collapses multiple `+` signs to a single leading one,
 * - converts an international `00` dialing prefix to `+` (e.g. "0097150…" → "+97150…").
 */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  // Keep only digits and plus signs.
  let s = String(raw).replace(/[^+\d]/g, "");
  // Drop every "+"; we re-add exactly one leading "+" at the end. This also
  // collapses pathological inputs like "+971+50" to "97150".
  s = s.replace(/\+/g, "");
  // International access code → "+". Must run before the empty check so "00" alone → "".
  if (s.startsWith("00")) s = s.slice(2);
  if (!s) return "";
  return `+${s}`;
}

/**
 * True when two raw phone strings refer to the same canonical number.
 * (Convenience for read paths that compare against a stored value.)
 */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizePhone(a);
  return na !== "" && na === normalizePhone(b);
}
