import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/api";
import { auth } from "@/lib/auth";
import { db } from "@/lib/prisma";

const GRAPH_URL = "https://graph.facebook.com/v19.0";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(fail("Unauthorized"), { status: 401 });

  const template = await db.whatsAppTemplate.findUnique({ where: { id } });
  if (!template) return NextResponse.json(fail("Template not found"), { status: 404 });

  // Delete from Meta if it has a metaId
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  const token = process.env.WHATSAPP_TOKEN;

  if (wabaId && token && template.name) {
    try {
      await fetch(`${GRAPH_URL}/${wabaId}/message_templates?name=${template.name}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      console.error("[WhatsApp Templates] Delete from Meta error:", err);
    }
  }

  await db.whatsAppTemplate.delete({ where: { id } });
  return NextResponse.json(ok({ id }));
}
