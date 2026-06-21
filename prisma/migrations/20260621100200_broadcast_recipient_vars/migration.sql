-- Per-recipient template variables for broadcasts. Previously templateVars was a
-- single global map on the broadcast, substituted identically into every message.
-- To map a template variable ({{1}}, {{2}}…) to a column of the uploaded CSV
-- (e.g. {{1}} -> the recipient's "name"), each recipient now carries its own
-- resolved values. Nullable JSON so existing/global-only broadcasts keep working
-- (the sender falls back to the broadcast's global templateVars).
ALTER TABLE "broadcast_recipients" ADD COLUMN IF NOT EXISTS "vars" JSONB;
