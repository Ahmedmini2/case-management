-- Phone-number normalization + duplicate-conversation merge.
--
-- THE BUG: Meta's webhook stores the sender as a bare wa_id ("971501234567"),
-- while every app-side path stored a "+"-prefixed value ("+971501234567").
-- Because whatsapp_conversations.contactPhone is UNIQUE, the same person forked
-- into two rows (the classic "+971 vs 971 duplicate chat"). Going forward the
-- runtime normalizes to "+<digits>" (src/lib/whatsapp/phone.ts); this migration
-- backfills existing data to the same canonical form.
--
-- The UNIQUE index makes a naive `UPDATE ... SET contactPhone = '+' || ...`
-- abort the moment a bare row's new value collides with an existing "+" row.
-- So we MERGE colliding rows first (repoint messages -> survivor, fold counters)
-- and only then rename — by which point every canonical key is unique.
--
-- canon(x) = digits only, with a leading international "00" stripped. This
-- exactly mirrors normalizePhone(): "+971..", "971..", "00971.." all collapse
-- to the same key. Idempotent: re-running is a no-op once data is canonical.

DO $$
DECLARE
  grp      RECORD;
  survivor TEXT;
  loser    RECORD;
BEGIN
  FOR grp IN
    SELECT regexp_replace(regexp_replace("contactPhone", '[^0-9]', '', 'g'), '^00', '') AS canon
    FROM "whatsapp_conversations"
    WHERE regexp_replace(regexp_replace("contactPhone", '[^0-9]', '', 'g'), '^00', '') <> ''
    GROUP BY 1
    HAVING COUNT(*) > 1
  LOOP
    -- Survivor: prefer a row linked to a case, then one with an agent, then the
    -- most-recently-active, then the oldest.
    SELECT id INTO survivor
    FROM "whatsapp_conversations"
    WHERE regexp_replace(regexp_replace("contactPhone", '[^0-9]', '', 'g'), '^00', '') = grp.canon
    ORDER BY ("caseId" IS NOT NULL) DESC,
             ("agentId" IS NOT NULL) DESC,
             "lastMessageAt" DESC NULLS LAST,
             "createdAt" ASC
    LIMIT 1;

    FOR loser IN
      SELECT * FROM "whatsapp_conversations"
      WHERE regexp_replace(regexp_replace("contactPhone", '[^0-9]', '', 'g'), '^00', '') = grp.canon
        AND id <> survivor
    LOOP
      -- Move messages to the survivor BEFORE deleting the loser, or the
      -- ON DELETE CASCADE on whatsapp_messages.conversationId would destroy them.
      UPDATE "whatsapp_messages" SET "conversationId" = survivor WHERE "conversationId" = loser.id;

      -- Fold the loser's counters/metadata into the survivor.
      UPDATE "whatsapp_conversations" s SET
        "unreadCount" = COALESCE(s."unreadCount", 0) + COALESCE(loser."unreadCount", 0),
        "tags"        = ARRAY(SELECT DISTINCT unnest(COALESCE(s."tags", '{}'::text[]) || COALESCE(loser."tags", '{}'::text[]))),
        "caseId"      = COALESCE(s."caseId", loser."caseId"),
        "agentId"     = COALESCE(s."agentId", loser."agentId"),
        -- If either row was owned by a human agent, keep it human (the AI gate
        -- keys on handledBy, so don't leave an agent-owned row marked AI).
        "handledBy"   = CASE WHEN COALESCE(s."agentId", loser."agentId") IS NOT NULL
                             THEN 'HUMAN'::"HandledBy" ELSE s."handledBy" END,
        "lastMessage" = CASE WHEN loser."lastMessageAt" IS NOT NULL
                              AND (s."lastMessageAt" IS NULL OR loser."lastMessageAt" > s."lastMessageAt")
                             THEN loser."lastMessage" ELSE s."lastMessage" END,
        "lastMessageAt" = GREATEST(s."lastMessageAt", loser."lastMessageAt")
      WHERE s.id = survivor;

      DELETE FROM "whatsapp_conversations" WHERE id = loser.id;
    END LOOP;
  END LOOP;

  -- Every canonical key is now unique; rename collision-free.
  UPDATE "whatsapp_conversations"
  SET "contactPhone" = '+' || regexp_replace(regexp_replace("contactPhone", '[^0-9]', '', 'g'), '^00', '')
  WHERE regexp_replace(regexp_replace("contactPhone", '[^0-9]', '', 'g'), '^00', '') <> ''
    AND "contactPhone" <> '+' || regexp_replace(regexp_replace("contactPhone", '[^0-9]', '', 'g'), '^00', '');
END $$;

-- Keep the other phone stores consistent so the recipients->conversation join
-- and contact matching line up. Neither column is UNIQUE, so no merge needed.
UPDATE "contacts"
SET "phone" = '+' || regexp_replace(regexp_replace("phone", '[^0-9]', '', 'g'), '^00', '')
WHERE "phone" IS NOT NULL
  AND regexp_replace(regexp_replace("phone", '[^0-9]', '', 'g'), '^00', '') <> ''
  AND "phone" <> '+' || regexp_replace(regexp_replace("phone", '[^0-9]', '', 'g'), '^00', '');

UPDATE "broadcast_recipients"
SET "phone" = '+' || regexp_replace(regexp_replace("phone", '[^0-9]', '', 'g'), '^00', '')
WHERE "phone" IS NOT NULL
  AND regexp_replace(regexp_replace("phone", '[^0-9]', '', 'g'), '^00', '') <> ''
  AND "phone" <> '+' || regexp_replace(regexp_replace("phone", '[^0-9]', '', 'g'), '^00', '');
