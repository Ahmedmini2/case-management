"use client";

import { useCallback, useRef, useState } from "react";
import { Paperclip, X, Upload, FileText, Image, File } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Attachment = {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  url: string;
  createdAt: string;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith("image/")) return <Image className="h-4 w-4 text-blue-500" />;
  if (mimeType === "application/pdf") return <FileText className="h-4 w-4 text-red-500" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

export function FileUploader({ caseId, onUploaded }: { caseId: string; onUploaded?: () => void }) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadAttachments = useCallback(async () => {
    const res = await fetch(`/api/cases/${caseId}/attachments`);
    const json = (await res.json()) as { data: Attachment[] | null };
    setAttachments(json.data ?? []);
  }, [caseId]);

  // Load on mount
  useState(() => {
    void loadAttachments();
  });

  async function upload(file: File) {
    if (file.size > 25 * 1024 * 1024) {
      toast.error("File exceeds 25 MB limit");
      return;
    }
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/cases/${caseId}/attachments`, { method: "POST", body: form });
    setUploading(false);
    if (!res.ok) {
      const json = (await res.json()) as { error?: string };
      toast.error(json.error ?? "Upload failed");
      return;
    }
    toast.success(`${file.name} uploaded`);
    await loadAttachments();
    onUploaded?.();
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void upload(file);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void upload(file);
  }

  async function deleteAttachment(id: string, name: string) {
    const res = await fetch(`/api/cases/${caseId}/attachments?attachmentId=${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Failed to delete"); return; }
    toast.success(`${name} removed`);
    await loadAttachments();
  }

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        className={cn(
          "relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 text-center transition-colors sm:p-6",
          dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-accent/30",
          uploading && "pointer-events-none opacity-60",
        )}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="h-6 w-6 text-muted-foreground mb-2" />
        <p className="text-sm font-medium">{uploading ? "Uploading…" : "Drop a file or click to browse"}</p>
        <p className="text-xs text-muted-foreground mt-1">PDF, images, Word, Excel, CSV — up to 25 MB</p>
        <input ref={inputRef} type="file" className="hidden" onChange={onFileChange} />
      </div>

      {/* Attachment list */}
      {attachments.length > 0 && (
        <div className="space-y-1.5">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2 text-sm"
            >
              <FileIcon mimeType={att.mimeType} />
              <a
                href={att.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 truncate font-medium hover:text-primary transition-colors"
              >
                {att.fileName}
              </a>
              <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(att.fileSize)}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={(e) => { e.stopPropagation(); void deleteAttachment(att.id, att.fileName); }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {!attachments.length && !uploading && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Paperclip className="h-3 w-3" />
          No attachments yet
        </p>
      )}
    </div>
  );
}
