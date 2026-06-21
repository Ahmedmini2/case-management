-- Per-user "new case" read tracking for the sidebar "All Cases" badge.
--
-- case_views records that a user has opened a case (mirrors how WhatsApp resets
-- unreadCount when a conversation is opened, but per-user instead of global).
--
-- users.casesBadgeSince is the per-user baseline: the badge only counts cases
-- created AFTER this timestamp that the user hasn't opened. Defaulting existing
-- users to the migration time prevents day-one flooding the badge with every
-- historical case. New users default to their creation time via the app default.

CREATE TABLE IF NOT EXISTS "case_views" (
  "caseId"   TEXT NOT NULL,
  "userId"   TEXT NOT NULL,
  "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "case_views_pkey" PRIMARY KEY ("caseId", "userId"),
  CONSTRAINT "case_views_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "case_views_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "case_views_userId_idx" ON "case_views"("userId");

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "casesBadgeSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
