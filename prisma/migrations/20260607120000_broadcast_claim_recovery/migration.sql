-- Crash-recovery + bounded-retry support for chunked broadcast sending.
-- Additive and idempotent: safe to run even if a worker already applied it.

-- Per-row claim timestamp. Set when a worker flips PENDING -> SENDING; cleared
-- when the row goes back to PENDING or reaches a terminal state. Lets a later
-- worker reclaim rows orphaned in SENDING by a killed worker.
ALTER TABLE "broadcast_recipients" ADD COLUMN IF NOT EXISTS "claimedAt" TIMESTAMP(3);

-- Transient-failure attempt counter (timeout / 429 / 5xx). Bounded so a
-- permanently-flaky number eventually fails instead of retrying forever.
ALTER TABLE "broadcast_recipients" ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0;

-- Speeds up the stale-claim recovery sweep (WHERE status = 'SENDING' AND claimedAt < ...).
CREATE INDEX IF NOT EXISTS "broadcast_recipients_status_claimedAt_idx"
  ON "broadcast_recipients"("status", "claimedAt");
