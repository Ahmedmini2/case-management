-- The broadcast code uses two enum values that were never added to the DB enums:
--   * BroadcastStatus.STOPPED   — set by the Stop endpoint and respected by the
--     finalize guard / chunk loop. Without it, stopping a broadcast (and now
--     completing one) errors: invalid input value for enum "BroadcastStatus".
--   * RecipientStatus.SENDING   — the in-flight claim state for a recipient row.
-- Both are additive and idempotent (ADD VALUE IF NOT EXISTS).
ALTER TYPE "BroadcastStatus" ADD VALUE IF NOT EXISTS 'STOPPED';
ALTER TYPE "RecipientStatus" ADD VALUE IF NOT EXISTS 'SENDING';
