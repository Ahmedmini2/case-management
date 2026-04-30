import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api";
import { auth } from "@/lib/auth";
import { StorageBuckets, uploadToBucket } from "@/lib/supabase/storage";
import { uploadToMetaResumable } from "@/lib/whatsapp/meta-upload";

// Per Meta's docs for template HEADER media:
//   IMAGE: image/jpeg, image/png — up to 5 MB
//   VIDEO: video/mp4, video/3gpp — up to 16 MB
//   DOCUMENT: application/pdf — up to 100 MB
const TYPE_RULES: Record<
  "IMAGE" | "VIDEO" | "DOCUMENT",
  { mimes: string[]; maxBytes: number }
> = {
  IMAGE: { mimes: ["image/jpeg", "image/png"], maxBytes: 5 * 1024 * 1024 },
  VIDEO: { mimes: ["video/mp4", "video/3gpp"], maxBytes: 16 * 1024 * 1024 },
  DOCUMENT: { mimes: ["application/pdf"], maxBytes: 100 * 1024 * 1024 },
};

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(fail("Unauthorized"), { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file");
  const headerType = (formData.get("headerType") as string | null)?.toUpperCase() ?? "";

  if (!(file instanceof File)) return NextResponse.json(fail("file is required"), { status: 400 });
  if (headerType !== "IMAGE" && headerType !== "VIDEO" && headerType !== "DOCUMENT") {
    return NextResponse.json(fail("headerType must be IMAGE, VIDEO, or DOCUMENT"), { status: 400 });
  }

  const rules = TYPE_RULES[headerType];
  if (!rules.mimes.includes(file.type)) {
    return NextResponse.json(
      fail(`File type ${file.type} not allowed for ${headerType}. Allowed: ${rules.mimes.join(", ")}`),
      { status: 400 },
    );
  }
  if (file.size > rules.maxBytes) {
    return NextResponse.json(
      fail(`File exceeds ${headerType} limit of ${Math.floor(rules.maxBytes / 1024 / 1024)} MB`),
      { status: 400 },
    );
  }

  const buf = await file.arrayBuffer();

  // Run both uploads in parallel:
  //   - Supabase Storage → public URL we use at SEND time (Meta's `link` parameter)
  //   - Meta Resumable Upload → handle we use at template CREATE time (in `example.header_handle`)
  const ext = file.name.split(".").pop() ?? "bin";
  const key = `headers/${randomUUID()}.${ext}`;

  let supabaseUrl: string;
  let metaHandle: string;

  try {
    const [sbRes, metaRes] = await Promise.all([
      uploadToBucket(StorageBuckets.WhatsAppMedia, key, buf, file.type),
      uploadToMetaResumable(buf, file.type),
    ]);
    supabaseUrl = sbRes.url;
    metaHandle = metaRes.handle;
  } catch (err) {
    return NextResponse.json(
      fail(err instanceof Error ? err.message : "Upload failed"),
      { status: 500 },
    );
  }

  return NextResponse.json(ok({ url: supabaseUrl, handle: metaHandle, headerType, mimeType: file.type }));
}
