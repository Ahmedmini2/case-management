-- The single user who automatically receives every new unassigned case.
-- Set from Settings → Users ("Make default receiver"). Additive + idempotent.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isDefaultCaseReceiver" BOOLEAN NOT NULL DEFAULT false;
