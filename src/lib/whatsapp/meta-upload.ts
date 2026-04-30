// Meta Resumable Upload API — gets a "header_handle" for use in template HEADER components.
// Two-step protocol:
//   1. POST /<APP_ID>/uploads?file_length=N&file_type=MIME → returns { id: "upload:..." }
//   2. POST /<upload-session-id> with file body + Authorization: OAuth <token> + file_offset: 0
//      → returns { h: "4::aW..." }
// The `h` value is the header_handle.

const GRAPH_URL = "https://graph.facebook.com/v19.0";

export type MetaUploadResult = { handle: string };

export async function uploadToMetaResumable(
  file: ArrayBuffer | Buffer,
  mimeType: string,
): Promise<MetaUploadResult> {
  const appId = process.env.WHATSAPP_APP_ID;
  const token = process.env.WHATSAPP_TOKEN;
  if (!appId) throw new Error("WHATSAPP_APP_ID env var is not configured");
  if (!token) throw new Error("WHATSAPP_TOKEN env var is not configured");

  const buf = file instanceof ArrayBuffer ? Buffer.from(file) : file;
  const fileLength = buf.byteLength;

  // Step 1: open upload session
  const startUrl = new URL(`${GRAPH_URL}/${appId}/uploads`);
  startUrl.searchParams.set("file_length", String(fileLength));
  startUrl.searchParams.set("file_type", mimeType);
  startUrl.searchParams.set("access_token", token);

  const startRes = await fetch(startUrl, { method: "POST" });
  if (!startRes.ok) {
    const errText = await startRes.text().catch(() => "");
    throw new Error(`Meta upload session start failed: ${startRes.status} ${errText.slice(0, 300)}`);
  }
  const startJson = (await startRes.json()) as { id?: string };
  if (!startJson.id) throw new Error("Meta upload session start returned no id");

  // Step 2: upload bytes
  const uploadRes = await fetch(`${GRAPH_URL}/${startJson.id}`, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${token}`,
      file_offset: "0",
    },
    body: new Uint8Array(buf),
  });
  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => "");
    throw new Error(`Meta upload failed: ${uploadRes.status} ${errText.slice(0, 300)}`);
  }
  const uploadJson = (await uploadRes.json()) as { h?: string };
  if (!uploadJson.h) throw new Error("Meta upload returned no handle");

  return { handle: uploadJson.h };
}
