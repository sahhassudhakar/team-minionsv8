"use client";

import { useCallback, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { UploadCloud, FileText, X, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DOCUMENT_CATEGORIES } from "@/lib/water-extraction";
import type { Site } from "@/lib/water-types";

interface PendingFile {
  file: File;
  progress: number;
  done: boolean;
  /** Only meaningful when requireWaterContext is true — the document type this specific file will be filed and extracted under. */
  categoryId: string;
}

export function UploadEvidenceDialog({
  open,
  onOpenChange,
  onUploaded,
  sites,
  requireWaterContext = false,
  defaultSiteId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onUploaded: (files: File[], waterContext?: { siteId: string; categoryIds: string[] }) => void | Promise<void>;
  sites?: Site[];
  /** True for Store Manager uploads — requires a Site + a Document Category per file before uploading, so extraction can target the right PWI questionnaire fields for each document. */
  requireWaterContext?: boolean;
  defaultSiteId?: string;
}) {
  const MAX_FILES = 15;

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [siteId, setSiteId] = useState(defaultSiteId ?? "");
  const [limitNotice, setLimitNotice] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep(1);
    setFiles([]);
    setDragOver(false);
    setLimitNotice(false);
    setUploadError(null);
  };

  const addFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const incoming = Array.from(fileList).map((file) => ({ file, progress: 0, done: false, categoryId: "" }));
    setFiles((prev) => {
      const combined = [...prev, ...incoming];
      if (combined.length > MAX_FILES) {
        setLimitNotice(true);
        return combined.slice(0, MAX_FILES);
      }
      setLimitNotice(false);
      return combined;
    });
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  }, []);

  const setFileCategory = (idx: number, categoryId: string) => {
    setFiles((prev) => prev.map((f, i) => (i === idx ? { ...f, categoryId } : f)));
  };

  /** Bulk-set every file to the same type in one click — the common case when a whole batch is the same kind of document (e.g. 10 pages of one bill). Per-file selectors below still let any of them be overridden individually. */
  const applyCategoryToAll = (categoryId: string) => {
    setFiles((prev) => prev.map((f) => ({ ...f, categoryId })));
  };

  const startUpload = () => {
    setStep(3);
    files.forEach((_, idx) => {
      const duration = 800 + Math.random() * 900;
      const start = Date.now();
      const tick = () => {
        const pct = Math.min(100, ((Date.now() - start) / duration) * 100);
        setFiles((prev) => prev.map((f, i) => (i === idx ? { ...f, progress: pct, done: pct >= 100 } : f)));
        if (pct < 100) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  };

  const allDone = files.length > 0 && files.every((f) => f.done);
  const allCategorized = files.length > 0 && files.every((f) => f.categoryId);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent size={requireWaterContext ? "lg" : "md"}>
        <DialogHeader>
          <DialogTitle>Upload Evidence</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.18 }}
              >
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => inputRef.current?.click()}
                  className={cn(
                    "flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition-all",
                    dragOver
                      ? "scale-[1.01] border-accent-primary bg-accent-primary/5"
                      : "border-border-strong hover:bg-bg-surface-sunken"
                  )}
                >
                  <input
                    ref={inputRef}
                    type="file"
                    multiple
                    className="hidden"
                    accept=".pdf,.png,.jpg,.jpeg,.xlsx,.csv,.docx,.pptx,.txt"
                    onChange={(e) => addFiles(e.target.files)}
                  />
                  <UploadCloud className="mb-3 size-8 text-text-tertiary" strokeWidth={1.5} />
                  <p className="text-sm font-medium text-text-primary">Drag files here or click to browse</p>
                  <p className="mt-1 text-xs text-text-tertiary">PDF, DOCX, PPTX, XLSX, CSV, TXT, PNG, JPG up to 25MB · up to {MAX_FILES} files per upload</p>
                </div>

                {limitNotice && (
                  <p className="mt-2 text-xs text-status-insufficient">
                    Only the first {MAX_FILES} files were kept — upload the rest in a separate batch.
                  </p>
                )}

                {files.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {files.map((f, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-3 rounded-md border border-border-subtle px-3 py-2"
                      >
                        <FileText className="size-4 shrink-0 text-text-tertiary" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-text-primary">{f.file.name}</p>
                          <p className="text-xs text-text-tertiary">{(f.file.size / 1024).toFixed(0)} KB</p>
                        </div>
                        <button
                          onClick={() => setFiles((prev) => prev.filter((_, i) => i !== idx))}
                          className="rounded p-1 text-text-tertiary hover:bg-bg-surface-sunken hover:text-text-primary"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.18 }}
                className="space-y-4"
              >
                <div>
                  <label className="text-xs font-medium text-text-secondary">Site</label>
                  <select
                    value={siteId}
                    onChange={(e) => setSiteId(e.target.value)}
                    className="mt-1 w-full rounded-md border border-border-strong px-2.5 py-2 text-sm focus:border-accent-primary focus:outline-none"
                  >
                    <option value="">Select a site…</option>
                    {sites?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} — {s.basinName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-medium text-text-secondary">Document type</label>
                    <span className="text-xs text-text-tertiary">
                      {files.filter((f) => f.categoryId).length}/{files.length} set
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-text-tertiary">
                    Each file is extracted against its own type, so a mixed batch (a bill and a lab report together) reads correctly.
                  </p>

                  {files.length > 1 && (
                    <select
                      value=""
                      onChange={(e) => e.target.value && applyCategoryToAll(e.target.value)}
                      className="mt-2 w-full rounded-md border border-dashed border-border-strong bg-bg-surface-sunken px-2.5 py-1.5 text-xs text-text-secondary focus:border-accent-primary focus:outline-none"
                    >
                      <option value="">Apply one type to all {files.length} files…</option>
                      {DOCUMENT_CATEGORIES.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  )}

                  <div className="mt-2 max-h-[280px] space-y-2 overflow-y-auto pr-1">
                    {files.map((f, idx) => {
                      const category = DOCUMENT_CATEGORIES.find((c) => c.id === f.categoryId);
                      return (
                        <div key={idx} className="rounded-md border border-border-subtle px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <FileText className="size-3.5 shrink-0 text-text-tertiary" />
                            <p className="min-w-0 flex-1 truncate text-sm text-text-primary">{f.file.name}</p>
                          </div>
                          <select
                            value={f.categoryId}
                            onChange={(e) => setFileCategory(idx, e.target.value)}
                            className={cn(
                              "mt-1.5 w-full rounded-md border px-2.5 py-1.5 text-sm focus:border-accent-primary focus:outline-none",
                              f.categoryId ? "border-border-strong" : "border-status-proposed/60 bg-status-proposed-bg"
                            )}
                          >
                            <option value="">Select a type…</option>
                            {DOCUMENT_CATEGORIES.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                          {category && <p className="mt-1 text-xs text-text-tertiary">{category.description}</p>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.18 }}
                className="space-y-3"
              >
                {files.map((f, idx) => (
                  <div key={idx} className="rounded-md border border-border-subtle px-3 py-2.5">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="truncate text-sm text-text-primary">{f.file.name}</span>
                      {f.done ? (
                        <Check className="size-4 text-status-verified" />
                      ) : (
                        <span className="text-xs text-text-tertiary">{Math.round(f.progress)}%</span>
                      )}
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-bg-surface-sunken">
                      <motion.div
                        className={cn("h-full rounded-full", f.done ? "bg-status-verified" : "bg-accent-primary")}
                        animate={{ width: `${f.progress}%` }}
                        transition={{ ease: "linear" }}
                      />
                    </div>
                  </div>
                ))}
                {allDone && !uploadError && (
                  <p className="pt-1 text-sm text-status-verified">
                    All files uploaded — queued for extraction.
                  </p>
                )}
                {uploadError && (
                  <p className="pt-1 text-sm text-status-insufficient">{uploadError}</p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <DialogFooter>
          {step === 1 && (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                disabled={files.length === 0}
                onClick={() => (requireWaterContext ? setStep(2) : startUpload())}
              >
                {requireWaterContext ? "Next" : `Upload ${files.length > 0 ? `(${files.length})` : ""}`}
              </Button>
            </>
          )}
          {step === 2 && (
            <>
              <Button variant="ghost" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button disabled={!siteId || !allCategorized} onClick={startUpload}>
                Upload ({files.length})
              </Button>
            </>
          )}
          {step === 3 && (
            <Button
              disabled={!allDone}
              onClick={async () => {
                setUploadError(null);
                try {
                  await onUploaded(
                    files.map((f) => f.file),
                    requireWaterContext ? { siteId, categoryIds: files.map((f) => f.categoryId) } : undefined
                  );
                  onOpenChange(false);
                  reset();
                } catch (err) {
                  setUploadError(err instanceof Error ? err.message : "Some files failed to upload.");
                }
              }}
            >
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
