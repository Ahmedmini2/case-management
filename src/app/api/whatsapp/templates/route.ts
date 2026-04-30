import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/api";
import { auth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

const GRAPH_URL = "https://graph.facebook.com/v19.0";

// List all templates (local DB)
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(fail("Unauthorized"), { status: 401 });

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("whatsapp_templates")
    .select("*")
    .order("createdAt", { ascending: false });

  if (error) return NextResponse.json(fail(error.message), { status: 500 });
  return NextResponse.json(ok(data ?? []));
}

// Create a new template via Meta API + save locally
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(fail("Unauthorized"), { status: 401 });

  type ButtonInput =
    | { type: "QUICK_REPLY"; text: string }
    | { type: "URL"; text: string; url: string }
    | { type: "PHONE_NUMBER"; text: string; phone: string };

  const body = (await request.json()) as {
    name?: string;
    category?: string;
    language?: string;
    body?: string;
    header?: string;
    headerType?: string;
    headerMediaUrl?: string;
    headerMediaHandle?: string;
    footer?: string;
    buttons?: ButtonInput[];
  };

  const name = typeof body.name === "string" ? body.name.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") : "";
  const category = typeof body.category === "string" ? body.category.toUpperCase() : "MARKETING";
  const language = typeof body.language === "string" ? body.language : "en";
  const templateBody = typeof body.body === "string" ? body.body.trim() : "";
  const headerType = (typeof body.headerType === "string" ? body.headerType.toUpperCase() : "TEXT") as
    | "TEXT"
    | "IMAGE"
    | "VIDEO"
    | "DOCUMENT";
  const header = typeof body.header === "string" ? body.header.trim() : null;
  const headerMediaUrl = typeof body.headerMediaUrl === "string" ? body.headerMediaUrl : null;
  const headerMediaHandle = typeof body.headerMediaHandle === "string" ? body.headerMediaHandle : null;
  const footer = typeof body.footer === "string" ? body.footer.trim() : null;
  const buttonsInput = Array.isArray(body.buttons) ? body.buttons.slice(0, 10) : [];

  if (!["TEXT", "IMAGE", "VIDEO", "DOCUMENT"].includes(headerType)) {
    return NextResponse.json(fail("Invalid headerType"), { status: 400 });
  }
  if (headerType !== "TEXT" && !headerMediaHandle) {
    return NextResponse.json(
      fail("Media headers require uploading the example file first (use /api/whatsapp/templates/upload-header)"),
      { status: 400 },
    );
  }

  if (!name) return NextResponse.json(fail("Template name is required"), { status: 400 });
  if (!templateBody) return NextResponse.json(fail("Template body is required"), { status: 400 });

  const varMatches = templateBody.match(/\{\{\d+\}\}/g) ?? [];
  const variableCount = new Set(varMatches).size;

  // Validate Meta button-type limits
  const counts = { QUICK_REPLY: 0, URL: 0, PHONE_NUMBER: 0 };
  for (const b of buttonsInput) {
    if (!b || typeof b.text !== "string" || !b.text.trim()) {
      return NextResponse.json(fail("Each button must have non-empty text"), { status: 400 });
    }
    if (b.type === "URL" && (typeof b.url !== "string" || !/^https?:\/\//.test(b.url))) {
      return NextResponse.json(fail(`URL button "${b.text}" needs a valid http(s) URL`), { status: 400 });
    }
    if (b.type === "PHONE_NUMBER" && (typeof b.phone !== "string" || !/^\+?\d{6,}$/.test(b.phone.replace(/\s/g, "")))) {
      return NextResponse.json(fail(`Phone button "${b.text}" needs a valid phone number`), { status: 400 });
    }
    if (!(b.type in counts)) {
      return NextResponse.json(fail(`Unknown button type: ${(b as { type: string }).type}`), { status: 400 });
    }
    counts[b.type]++;
  }
  if (counts.QUICK_REPLY > 3) return NextResponse.json(fail("Max 3 quick-reply buttons"), { status: 400 });
  if (counts.URL > 2) return NextResponse.json(fail("Max 2 URL buttons"), { status: 400 });
  if (counts.PHONE_NUMBER > 1) return NextResponse.json(fail("Max 1 phone button"), { status: 400 });

  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  const token = process.env.WHATSAPP_TOKEN;

  if (!wabaId || !token) {
    return NextResponse.json(fail("WhatsApp Business Account ID not configured. Add WHATSAPP_BUSINESS_ACCOUNT_ID to .env.local"), { status: 500 });
  }

  const components: Record<string, unknown>[] = [];

  if (headerType === "TEXT" && header) {
    components.push({ type: "HEADER", format: "TEXT", text: header });
  } else if (headerType !== "TEXT" && headerMediaHandle) {
    components.push({
      type: "HEADER",
      format: headerType,
      example: { header_handle: [headerMediaHandle] },
    });
  }

  components.push({
    type: "BODY",
    text: templateBody,
    ...(variableCount > 0 ? {
      example: {
        body_text: [Array.from({ length: variableCount }, (_, i) => `sample${i + 1}`)],
      },
    } : {}),
  });

  if (footer) {
    components.push({ type: "FOOTER", text: footer });
  }

  if (buttonsInput.length > 0) {
    const metaButtons = buttonsInput.map((b) => {
      if (b.type === "URL") return { type: "URL", text: b.text, url: b.url };
      if (b.type === "PHONE_NUMBER") return { type: "PHONE_NUMBER", text: b.text, phone_number: b.phone };
      return { type: "QUICK_REPLY", text: b.text };
    });
    components.push({ type: "BUTTONS", buttons: metaButtons });
  }

  try {
    const metaRes = await fetch(`${GRAPH_URL}/${wabaId}/message_templates`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        language,
        category,
        components,
      }),
    });

    const metaData = (await metaRes.json()) as { id?: string; error?: { message?: string } };

    if (!metaRes.ok) {
      return NextResponse.json(
        fail(metaData.error?.message ?? "Meta API rejected the template"),
        { status: 400 },
      );
    }

    const sb = supabaseAdmin();
    const { data: template, error } = await sb
      .from("whatsapp_templates")
      .insert({
        metaId: metaData.id ?? null,
        name,
        language,
        category,
        status: "PENDING",
        body: templateBody,
        header: headerType === "TEXT" ? header : null,
        headerType,
        headerMediaUrl: headerType !== "TEXT" ? headerMediaUrl : null,
        headerMediaHandle: headerType !== "TEXT" ? headerMediaHandle : null,
        footer,
        buttons: buttonsInput.length > 0 ? buttonsInput : null,
        variableCount,
      })
      .select("*")
      .single();

    if (error) return NextResponse.json(fail(error.message), { status: 500 });
    return NextResponse.json(ok(template), { status: 201 });
  } catch (err) {
    console.error("[WhatsApp Templates] Create error:", err);
    return NextResponse.json(fail("Failed to create template"), { status: 500 });
  }
}
