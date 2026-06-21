-- Reply context for WhatsApp messages. When a customer replies to one of our
-- messages, Meta sends context.id = the WAMID of the replied-to message. We
-- store that WAMID and (when resolvable) the local message row id so the chat
-- can render a quoted bubble like native WhatsApp. Both nullable; no backfill.
ALTER TABLE "whatsapp_messages" ADD COLUMN IF NOT EXISTS "replyToWamid" TEXT;
ALTER TABLE "whatsapp_messages" ADD COLUMN IF NOT EXISTS "replyToMessageId" TEXT;

-- Helps the (optional) "all replies to message X" lookup; cheap and idempotent.
CREATE INDEX IF NOT EXISTS "whatsapp_messages_replyToMessageId_idx"
  ON "whatsapp_messages"("replyToMessageId");
