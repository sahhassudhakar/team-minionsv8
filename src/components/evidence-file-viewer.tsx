"use client";

import { Download } from "lucide-react";

export function EvidenceFileViewer({ evidenceId, fileName }: { evidenceId: string; fileName: string }) {
  const src = `/api/data/evidence/${evidenceId}/file`;
  const lower = fileName.toLowerCase();
  const isPdf = lower.endsWith(".pdf");
  const isImage = /\.(png|jpe?g)$/i.test(lower);

  if (isPdf) {
    return (
      <iframe
        src={src}
        title={fileName}
        className="h-full w-full rounded-lg border border-border-subtle bg-white"
      />
    );
  }

  if (isImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={fileName}
        className="h-full w-full rounded-lg border border-border-subtle bg-bg-surface-sunken object-contain"
      />
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-border-subtle bg-bg-surface-sunken text-sm text-text-tertiary">
      <p>Preview not available for this file type.</p>
      <a href={src} download={fileName} className="flex items-center gap-1 font-medium text-accent-primary hover:underline">
        <Download className="size-3.5" /> Download {fileName}
      </a>
    </div>
  );
}
