// Always-notify mailing list for case create/update events.
// Override at runtime by setting CASE_NOTIFY_EMAILS=a@x.com,b@y.com (comma separated).
const DEFAULT_RECIPIENTS = [
  "Support@thedungeon.ae",
  "Thedungeoncrm@gmail.com",
];

function getStaticRecipients(): string[] {
  const env = process.env.CASE_NOTIFY_EMAILS;
  if (env && env.trim()) {
    return env
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return DEFAULT_RECIPIENTS;
}

/**
 * Returns the deduped, lowercased list of recipients for case email notifications.
 * Always includes the configured static recipients; optionally appends the actor's email.
 */
export function getCaseNotifyRecipients(actorEmail?: string | null): string[] {
  const list = [...getStaticRecipients()];
  if (actorEmail) list.push(actorEmail);
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const e of list) {
    const k = e.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(e);
  }
  return deduped;
}
