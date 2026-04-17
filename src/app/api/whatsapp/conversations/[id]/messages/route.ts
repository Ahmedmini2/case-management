import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/api";
import { auth } from "@/lib/auth";
import { db } from "@/lib/prisma";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(fail("Unauthorized"), { status: 401 });
  }

  const conversation = await db.whatsAppConversation.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!conversation) {
    return NextResponse.json(fail("Conversation not found"), { status: 404 });
  }

  // Mark unread inbound messages as read
  await db.whatsAppMessage.updateMany({
    where: { conversationId: id, direction: "inbound", isRead: false },
    data: { isRead: true },
  });

  // Reset unread count on conversation
  await db.whatsAppConversation.update({
    where: { id },
    data: { unreadCount: 0 },
  });

  const messages = await db.whatsAppMessage.findMany({
    where: { conversationId: id },
    orderBy: { timestamp: "asc" },
  });

  return NextResponse.json(ok(messages));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(fail("Unauthorized"), { status: 401 });
  }

  const conversation = await db.whatsAppConversation.findUnique({
    where: { id },
  });

  if (!conversation) {
    return NextResponse.json(fail("Conversation not found"), { status: 404 });
  }

  const body = (await request.json()) as { body?: string };
  const messageBody = typeof body.body === "string" ? body.body.trim() : "";

  if (!messageBody) {
    return NextResponse.json(fail("Message body is required"), { status: 400 });
  }

  // Send via WhatsApp Business API
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;

  if (phoneNumberId && token) {
    try {
      const waRes = await fetch(
        `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: conversation.contactPhone,
            type: "text",
            text: { body: messageBody },
          }),
        },
      );

      if (!waRes.ok) {
        const errData = await waRes.text();
        console.error("[WhatsApp API] Send failed:", errData);
      }
    } catch (err) {
      console.error("[WhatsApp API] Network error:", err);
    }
  }

  // Save sent message to DB
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true },
  });

  const message = await db.whatsAppMessage.create({
    data: {
      conversationId: id,
      direction: "outbound",
      sender: "agent",
      senderName: user?.name ?? user?.email ?? "Agent",
      body: messageBody,
      isAI: false,
      status: "sent",
      isRead: true,
    },
  });

  // Update conversation last message
  await db.whatsAppConversation.update({
    where: { id },
    data: {
      lastMessage: messageBody.length > 200 ? messageBody.slice(0, 200) + "..." : messageBody,
      lastMessageAt: new Date(),
    },
  });

  return NextResponse.json(ok(message), { status: 201 });
}
