"use client";

import { useEffect, useState } from "react";
import { Check, X, FileText, PenLine } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EvidenceFileViewer } from "@/components/evidence-file-viewer";
import { QUESTIONNAIRE_FIELD_META } from "@/lib/water-types";
import type { QuestionnaireField } from "@/lib/water-types";

export function PWIFieldVerificationModal({
  field,
  open,
  onOpenChange,
  onValidate,
  onReject,
  onManualEntry,
  readOnly = false,
}: {
  field: QuestionnaireField | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onValidate: (fieldId: string) => void;
  onReject: (fieldId: string, reason: string) => void;
  onManualEntry: (fieldId: string, value: number) => void;
  readOnly?: boolean;
}) {
  const [showIssue, setShowIssue] = useState(false);
  const [reason, setReason] = useState("");
  const [manualValue, setManualValue] = useState("");

  useEffect(() => {
    if (open) {
      setShowIssue(false);
      setReason("");
      setManualValue("");
    }
  }, [open, field?.id]);

  if (!field) return null;
  const meta = QUESTIONNAIRE_FIELD_META[field.fieldId];
  const needsManual = field.status === "awaiting_evidence";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <FileText className="size-3.5" />
            {field.evidenceFileName}
          </div>
          <DialogTitle className="sr-only">Verify {meta.label}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 px-6 py-4 md:grid-cols-2 md:gap-6">
          <div className="h-[65vh]">
            {field.evidenceId ? (
              <EvidenceFileViewer evidenceId={field.evidenceId} fileName={field.evidenceFileName ?? "document"} />
            ) : (
              <div className="flex h-full items-center justify-center rounded-lg border border-border-subtle bg-bg-surface-sunken text-sm text-text-tertiary">
                No source document on file
              </div>
            )}
          </div>

          <div className="flex flex-col justify-between overflow-y-auto">
            <div>
              <p className="text-sm text-text-secondary">{meta.label}</p>

              {needsManual ? (
                <div className="mt-2">
                  <div className="mb-4 flex items-start gap-2 rounded-md border border-status-insufficient/30 bg-status-insufficient-bg px-3 py-2.5 text-sm text-text-secondary">
                    <PenLine className="mt-0.5 size-4 shrink-0 text-status-insufficient" />
                    Extraction couldn&apos;t confidently read a value from this document — check the source
                    on the left and enter the correct value manually.
                  </div>
                  {!readOnly && (
                    <div>
                      <label className="text-xs font-medium text-text-secondary">
                        Value ({meta.unit})
                      </label>
                      <input
                        value={manualValue}
                        onChange={(e) => setManualValue(e.target.value)}
                        type="number"
                        className="mt-1 w-full rounded-md border border-border-strong px-2.5 py-1.5 text-sm focus:border-accent-primary focus:outline-none"
                      />
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <p className="mt-1 text-3xl font-semibold tabular-nums text-text-primary">
                    {field.value?.toLocaleString()}{" "}
                    <span className="text-lg font-normal text-text-secondary">{field.unit}</span>
                  </p>
                  {field.extractionExcerpt && (
                    <p className="mt-2 rounded-md bg-bg-surface-sunken px-3 py-2 text-xs text-text-secondary">
                      Matched text: &ldquo;{field.extractionExcerpt}&rdquo;
                    </p>
                  )}
                  <div className="mt-3 space-y-1 text-xs text-text-tertiary">
                    <div className="flex justify-between">
                      <span>Confidence</span>
                      <span className="text-text-secondary">
                        {field.confidence != null ? `${Math.round(field.confidence * 100)}%` : "N/A"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Period</span>
                      <span className="text-text-secondary">{new Date(field.periodStart).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {!readOnly && (
                    <AnimatedIssuePanel
                      show={showIssue}
                      reason={reason}
                      setReason={setReason}
                      onReject={() => onReject(field.id, reason)}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          {readOnly ? (
            <span className="text-xs text-text-tertiary">Read-only</span>
          ) : needsManual ? (
            <Button disabled={!manualValue} onClick={() => onManualEntry(field.id, Number(manualValue))}>
              <Check className="size-4" /> Save &amp; Verify
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setShowIssue((v) => !v)}>
                Something&apos;s off
              </Button>
              <Button onClick={() => onValidate(field.id)}>
                <Check className="size-4" /> Looks right — Validate
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AnimatedIssuePanel({
  show,
  reason,
  setReason,
  onReject,
}: {
  show: boolean;
  reason: string;
  setReason: (v: string) => void;
  onReject: () => void;
}) {
  if (!show) return null;
  return (
    <div className="mt-4 space-y-2 rounded-md border border-border-subtle p-3">
      <label className="text-xs font-medium text-text-secondary">Reason for rejection (required)</label>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        className="w-full rounded-md border border-border-strong px-2.5 py-1.5 text-sm focus:border-accent-primary focus:outline-none"
      />
      <Button variant="destructiveSolid" size="sm" disabled={!reason} onClick={onReject}>
        <X className="size-3.5" /> Reject with this reason
      </Button>
    </div>
  );
}
