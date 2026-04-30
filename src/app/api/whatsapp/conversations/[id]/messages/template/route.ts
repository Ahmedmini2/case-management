import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/api";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(fail("Unauthorized"), { status: 401 });

  const { templateId, variables } = (await request.json()) as {
    templateId?: string;
    variables?: Record<string, string>;
  };
  if (!templateId) return NextResponse.json(fail("templateId is required"), { status: 400 });

  const sb = supabaseAdmin();

  // Load conversation
  const { data: convRow, error: convErr } = await sb
    .from("whatsapp_conversations")
    .select("id, contactPhone")
    .eq("id", id)
    .maybeSingle();
  if (convErr) return NextResponse.json(fail(convErr.message), { status: 500 });
  if (!convRow) return NextResponse.json(fail("Conversation not found"), { status: 404 });
  const conv = convRow as { id: string; contactPhone: string };

  // Load template
  const { data: tplRow, error: tplErr } = await sb
    .from("whatsapp_templates")
    .select("id, name, language, status, body, variableCount, headerType, headerMediaUrl")
    .eq("id", templateId)
    .maybeSingle();
  if (tplErr) return NextResponse.json(fail(tplErr.message), { status: 500 });
  if (!tplRow) return NextResponse.json(fail("Template not found"), { status: 404 });
  const template = tplRow as {
    id: string;
    name: string;
    language: string;
    status: string;
    body: string;
    variableCount: number;
    headerType: string | null;
    headerMediaUrl: string | null;
  };
  if (template.status !== "APPROVED") {
    return NextResponse.json(
      fail(`Template "${template.name}" is not approved (status: ${template.status})`),
      { status: 400 },
    );
  }

  const vars = variables ?? {};
  if (template.variableCount > 0) {
    for (let i = 1; i <= template.variableCount; i++) {
      if (!vars[String(i)] || !vars[String(i)].trim()) {
        return NextResponse.json(fail(`Missing value for variable {{${i}}}`), { status: 400 });
      }
    }
  }

  // WhatsApp credentials
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;
  if (!phoneNumberId || !token) {
    return NextResponse.json(fail("WhatsApp credentials not configured"), { status: 500 });
  }

  // Build components for Meta API
  const components: Record<string, unknown>[] = [];

  if (template.headerType && template.headerType !== "TEXT" && template.headerMediaUrl) {
    const fmt = template.headerType.toLowerCase();
    const param: Record<string, unknown> = { type: fmt };
    if (fmt === "image") param.image = { link: template.headerMediaUrl };
    else if (fmt === "video") param.video = { link: template.headerMediaUrl };
    else if (fmt === "document") param.document = { link: template.headerMediaUrl, filename: "document.pdf" };
    components.push({ type: "header", parameters: [param] });
  }

  if (template.variableCount > 0) {
    const parameters = Array.from({ length: template.variableCount }, (_, i) => ({
      type: "text",
      text: vars[String(i + 1)],
    }));
    components.push({ type: "body", parameters });
  }

  // Send via Meta API
  let waMsgId: string | null = null;
  try {
    const waRes = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: conv.contactPhone,
        type: "template",
        template: {
          name: template.name,
          language: { code: template.language },
          ...(components.length > 0 ? { components } : {}),
        },
      }),
    });
    if (!waRes.ok) {
      const errText = await waRes.text();
      return NextResponse.json(fail(`WhatsApp API error: ${errText.slice(0, 300)}`), { status: 502 });
    }
    const data = (await waRes.json()) as { messages?: { id: string }[] };
    waMsgId = data.messages?.[0]?.id ?? null;
  } catch (err) {
    return NextResponse.json(fail(err instanceof Error ? err.message : "Send failed"), { status: 502 });
  }

  // Render the resolved body for storing in chat
  let renderedBody = template.body;
  for (const [key, value] of Object.entries(vars)) {
    renderedBody = renderedBody.replaceAll(`{{${key}}}`, value);
  }

  // Resolve sender display name
  const { data: user } = await sb
    .from("users")
    .select("name, email")
    .eq("id", session.user.id)
    .maybeSingle();
  const senderName =
    (user as { name?: string | null; email?: string } | null)?.name ??
    (user as { email?: string } | null)?.email ??
    "Agent";

  // Persist message
  const { data: message, error: insErr } = await sb
    .from("whatsapp_messages")
    .insert({
      conversationId: id,
      whatsappMsgId: waMsgId,
      direction: "outbound",
      sender: "agent",
      senderName,
      body: renderedBody,
      isAI: false,
      status: "sent",
      isRead: true,
    })
    .select("*")
    .single();
  if (insErr) return NextResponse.json(fail(insErr.message), { status: 500 });

  // Update conversation last-message
  const last = renderedBody.length > 200 ? renderedBody.slice(0, 200) + "..." : renderedBody;
  await sb
    .from("whatsapp_conversations")
    .update({ lastMessage: last, lastMessageAt: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json(ok(message), { status: 201 });
}
