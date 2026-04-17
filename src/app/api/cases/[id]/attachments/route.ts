import { ActivityType } from "@prisma/client";
import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api";
import { auth } from "@/lib/auth";
import { db } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

const ALLOWED_TYPES = [
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain", "text/csv",
  "application/zip",
];
const MAX_SIZE = 25 * 1024 * 1024; // 25 MB

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(fail("Unauthorized"), { status: 401 });

  const attachments = await db.attachment.findMany({
    where: { caseId: id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fileName: true,
      fileSize: true,
      mimeType: true,
      url: true,
      createdAt: true,
    },
  });

  return NextResponse.json(ok(attachments, { total: attachments.length }));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(fail("Unauthorized"), { status: 401 });

  const caseRecord = await db.case.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!caseRecord) return NextResponse.json(fail("Case not found"), { status: 404 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json(fail("No file provided"), { status: 400 });

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(fail("File type not allowed"), { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json(fail("File exceeds 25 MB limit"), { status: 400 });
  }

  const ext = file.name.split(".").pop() ?? "bin";
  const key = `${randomUUID()}.${ext}`;
  const uploadDir = join(process.cwd(), "public", "uploads", "attachments");
  await mkdir(uploadDir, { recursive: true });
  const bytes = await file.arrayBuffer();
  await writeFile(join(uploadDir, key), Buffer.from(bytes));
  const url = `/uploads/attachments/${key}`;

  const attachment = await db.attachment.create({
    data: {
      caseId: id,
      uploadedById: session.user.id,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      url,
      key,
    },
    select: { id: true, fileName: true, fileSize: true, mimeType: true, url: true, createdAt: true },
  });

  await db.activity.create({
    data: {
      caseId: id,
      userId: session.user.id,
      type: ActivityType.ATTACHMENT_ADDED,
      description: `Attached file: ${file.name}`,
      newValue: file.name,
    },
  });

  return NextResponse.json(ok(attachment), { status: 201 });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(fail("Unauthorized"), { status: 401 });

  const { searchParams } = new URL(request.url);
  const attachmentId = searchParams.get("attachmentId");
  if (!attachmentId) return NextResponse.json(fail("attachmentId required"), { status: 400 });

  const attachment = await db.attachment.findFirst({
    where: { id: attachmentId, caseId: id },
    select: { id: true },
  });
  if (!attachment) return NextResponse.json(fail("Attachment not found"), { status: 404 });

  await db.attachment.delete({ where: { id: attachmentId } });
  return NextResponse.json(ok({ id: attachmentId }));
}
