-- Hide broadcast-only conversations (a send the customer never replied to) from
-- the chat tabs until they reply. Additive + idempotent.
ALTER TABLE "whatsapp_conversations"
  ADD COLUMN IF NOT EXISTS "isBroadcastOnly" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "whatsapp_conversations_isBroadcastOnly_idx"
  ON "whatsapp_conversations"("isBroadcastOnly");

-- One-time backfill: flag existing conversations that only ever received a
-- broadcast (have a "Broadcast" message) and never an inbound reply. Safe to
-- re-run — a conversation that later gets a reply is flipped back by the webhook.
UPDATE "whatsapp_conversations" c
SET "isBroadcastOnly" = true
WHERE NOT EXISTS (
    SELECT 1 FROM "whatsapp_messages" m
    WHERE m."conversationId" = c.id AND m.direction = 'inbound'
  )
  AND EXISTS (
    SELECT 1 FROM "whatsapp_messages" m
    WHERE m."conversationId" = c.id AND m."senderName" = 'Broadcast'
  );
