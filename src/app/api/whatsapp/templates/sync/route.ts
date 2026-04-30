import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/api";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

const GRAPH_URL = "https://graph.facebook.com/v19.0";

type MetaButton = {
  type: string;
  text: string;
  url?: string;
  phone_number?: string;
};

type MetaTemplate = {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  components: {
    type: string;
    text?: string;
    format?: string;
    buttons?: MetaButton[];
  }[];
};

function mapStatus(metaStatus: string): "PENDING" | "APPROVED" | "REJECTED" | "PAUSED" | "DISABLED" {
  switch (metaStatus) {
    case "APPROVED": return "APPROVED";
    case "REJECTED": return "REJECTED";
    case "PAUSED": return "PAUSED";
    case "DISABLED": return "DISABLED";
    default: return "PENDING";
  }
}

// Sync templates from Meta Business API to local DB
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(fail("Unauthorized"), { status: 401 });

  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  const token = process.env.WHATSAPP_TOKEN;

  if (!wabaId || !token) {
    return NextResponse.json(fail("WHATSAPP_BUSINESS_ACCOUNT_ID not configured"), { status: 500 });
  }

  try {
    const metaRes = await fetch(
      `${GRAPH_URL}/${wabaId}/message_templates?limit=100`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!metaRes.ok) {
      const errData = (await metaRes.json()) as { error?: { message?: string } };
      return NextResponse.json(fail(errData.error?.message ?? "Failed to fetch templates from Meta"), { status: 400 });
    }

    const metaData = (await metaRes.json()) as { data: MetaTemplate[] };
    const templates = metaData.data ?? [];

    const sb = supabaseAdmin();
    let created = 0;
    let updated = 0;

    for (const t of templates) {
      const bodyComp = t.components.find((c) => c.type === "BODY");
      const headerComp = t.components.find((c) => c.type === "HEADER");
      const footerComp = t.components.find((c) => c.type === "FOOTER");
      const buttonsComp = t.components.find((c) => c.type === "BUTTONS");
      const body = bodyComp?.text ?? "";

      const varMatches = body.match(/\{\{\d+\}\}/g) ?? [];
      const variableCount = new Set(varMatches).size;

      const buttons = buttonsComp?.buttons
        ? buttonsComp.buttons.map((b) => {
            if (b.type === "URL") return { type: "URL", text: b.text, url: b.url ?? "" };
            if (b.type === "PHONE_NUMBER") return { type: "PHONE_NUMBER", text: b.text, phone: b.phone_number ?? "" };
            return { type: "QUICK_REPLY", text: b.text };
          })
        : null;

      const { data: existing } = await sb
        .from("whatsapp_templates")
        .select("id")
        .or(`metaId.eq.${t.id},name.eq.${t.name}`)
        .limit(1)
        .maybeSingle();

      const headerFormat = (headerComp?.format ?? "TEXT").toUpperCase();
      const payload = {
        metaId: t.id,
        name: t.name,
        language: t.language,
        category: t.category,
        status: mapStatus(t.status),
        body,
        header: headerFormat === "TEXT" ? headerComp?.text ?? null : null,
        headerType: ["TEXT", "IMAGE", "VIDEO", "DOCUMENT"].includes(headerFormat) ? headerFormat : "TEXT",
        footer: footerComp?.text ?? null,
        buttons,
        variableCount,
      };

      if (existing) {
        const { error: updErr } = await sb
          .from("whatsapp_templates")
          .update(payload)
          .eq("id", (existing as { id: string }).id);
        if (updErr) {
          console.error("[WhatsApp Templates Sync] Update error:", updErr.message);
          continue;
        }
        updated++;
      } else {
        const { error: insErr } = await sb.from("whatsapp_templates").insert(payload);
        if (insErr) {
          console.error("[WhatsApp Templates Sync] Insert error:", insErr.message);
          continue;
        }
        created++;
      }
    }

    return NextResponse.json(ok({ synced: templates.length, created, updated }));
  } catch (err) {
    console.error("[WhatsApp Templates Sync] Error:", err);
    return NextResponse.json(fail("Failed to sync templates"), { status: 500 });
  }
}
