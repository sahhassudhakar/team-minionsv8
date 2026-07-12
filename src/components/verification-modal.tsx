"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Check, FileText, Loader2, PenLine } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { DataPoint } from "@/lib/types";
import { cn } from "@/lib/utils";

export function VerificationModal({
  dataPoint,
  open,
  onOpenChange,
  onVerified,
  onRejected,
  onManualEntry,
  readOnly = false,
}: {
  dataPoint: DataPoint | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onVerified: (id: string, correctedValue?: number) => void;
  onRejected: (id: string, reason: string) => void;
  onManualEntry: (id: string, value: number, unit: string) => void;
  readOnly?: boolean;
}) {
  const [showIssue, setShowIssue] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [correctedValue, setCorrectedValue] = useState("");
  const [reason, setReason] = useState("");
  const [manualValue, setManualValue] = useState("");
  const [manualUnit, setManualUnit] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (open) {
      setShowIssue(false);
      setShowDetails(false);
      setCorrectedValue("");
      setReason("");
      setManualValue("");
      setManualUnit("");
      setVerifying(false);
      setVerified(false);
    }
  }, [open, dataPoint?.id]);

  if (!dataPoint) return null;

  const isManualEntry = dataPoint.status === "needs_manual_entry";

  const handleVerify = () => {
    setVerifying(true);
    setTimeout(() => {
      setVerifying(false);
      setVerified(true);
      setTimeout(() => {
        onVerified(dataPoint.id, correctedValue ? Number(correctedValue) : undefined);
        onOpenChange(false);
      }, 500);
    }, 500);
  };

  const handleManualSave = () => {
    if (!manualValue || !manualUnit) return;
    onManualEntry(dataPoint.id, Number(manualValue), manualUnit);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <FileText className="size-3.5" />
            {dataPoint.evidenceFileName}
          </div>
          <DialogTitle className="sr-only">
            {isManualEntry ? "Manual entry" : "Verify data point"}
          </DialogTitle>
        </DialogHeader>

        {isManualEntry ? (
          <div className="px-6 py-4">
            <div className="mb-4 flex items-start gap-3 rounded-md border border-status-insufficient/30 bg-status-insufficient-bg px-3 py-2.5">
              <PenLine className="mt-0.5 size-4 shrink-0 text-status-insufficient" />
              <p className="text-sm text-text-secondary">
                Automated extraction could not confidently read a value from this document
                (low-confidence or hedged source text). Enter the correct value manually from
                the source document.
              </p>
            </div>
            {!readOnly ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-text-secondary">Value</label>
                  <input
                    value={manualValue}
                    onChange={(e) => setManualValue(e.target.value)}
                    type="number"
                    className="mt-1 w-full rounded-md border border-border-strong px-2.5 py-1.5 text-sm focus:border-accent-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-text-secondary">Unit</label>
                  <input
                    value={manualUnit}
                    onChange={(e) => setManualUnit(e.target.value)}
                    placeholder="e.g. kWh"
                    className="mt-1 w-full rounded-md border border-border-strong px-2.5 py-1.5 text-sm focus:border-accent-primary focus:outline-none"
                  />
                </div>
              </div>
            ) : (
              <p className="text-sm text-text-tertiary">Read-only — only an Admin can enter this value.</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-0 px-6 py-4 md:grid-cols-2 md:gap-6">
            <div className="flex aspect-[3/4] items-center justify-center rounded-lg border border-border-subtle bg-bg-surface-sunken">
              <div className="relative m-6 w-full max-w-[220px] rounded border border-border-strong bg-white p-4 shadow-sm">
                <div className="mb-2 h-2 w-3/4 rounded bg-border-subtle" />
                <div className="mb-2 h-2 w-1/2 rounded bg-border-subtle" />
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 1, 0.6, 1] }}
                  transition={{ duration: 0.8 }}
                  className="my-3 rounded border-2 border-accent-primary bg-accent-primary/10 px-2 py-1.5"
                >
                  <p className="text-xs font-semibold text-text-primary">
                    {dataPoint.value} {dataPoint.unit}
                  </p>
                </motion.div>
                <div className="h-2 w-2/3 rounded bg-border-subtle" />
              </div>
            </div>

            <div className="flex flex-col justify-between pt-4 md:pt-0">
              <div>
                <p className="text-sm text-text-secondary">{dataPoint.metricName}</p>
                <AnimatePresence mode="wait">
                  {!verified ? (
                    <motion.p key="value" className="mt-1 text-3xl font-semibold tabular-nums text-text-primary">
                      {dataPoint.value} <span className="text-lg font-normal text-text-secondary">{dataPoint.unit}</span>
                    </motion.p>
                  ) : (
                    <motion.div
                      key="verified"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="mt-1 flex items-center gap-2 text-status-verified"
                    >
                      <Check className="size-6" />
                      <span className="text-lg font-semibold">Verified</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  onClick={() => setShowDetails((v) => !v)}
                  className="mt-4 flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-text-primary"
                >
                  Details
                  <ChevronDown className={cn("size-3.5 transition-transform", showDetails && "rotate-180")} />
                </button>
                <AnimatePresence>
                  {showDetails && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-2 space-y-1.5 rounded-md bg-bg-surface-sunken p-3 text-xs text-text-secondary">
                        <div className="flex justify-between">
                          <span>Period</span>
                          <span className="text-text-primary">{new Date(dataPoint.periodStart).toLocaleDateString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Extraction method</span>
                          <span className="text-text-primary">{dataPoint.extractionMethod}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Confidence</span>
                          <span className="text-text-primary">
                            {dataPoint.confidence != null ? `${Math.round(dataPoint.confidence * 100)}%` : "N/A"}
                          </span>
                        </div>
                        {dataPoint.verifiedBy && (
                          <div className="flex justify-between">
                            <span>Verified by</span>
                            <span className="text-text-primary">{dataPoint.verifiedBy}</span>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {!readOnly && (
                  <AnimatePresence>
                    {showIssue && !verified && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-4 space-y-3 rounded-md border border-border-subtle p-3">
                          <div>
                            <label className="text-xs font-medium text-text-secondary">Correct value</label>
                            <input
                              value={correctedValue}
                              onChange={(e) => setCorrectedValue(e.target.value)}
                              placeholder={String(dataPoint.value)}
                              className="mt-1 w-full rounded-md border border-border-strong px-2.5 py-1.5 text-sm focus:border-accent-primary focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-text-secondary">
                              Reason for correction (required)
                            </label>
                            <textarea
                              value={reason}
                              onChange={(e) => setReason(e.target.value)}
                              rows={2}
                              className="mt-1 w-full rounded-md border border-border-strong px-2.5 py-1.5 text-sm focus:border-accent-primary focus:outline-none"
                            />
                          </div>
                          <Button
                            variant="destructiveSolid"
                            size="sm"
                            disabled={!reason}
                            onClick={() => {
                              onRejected(dataPoint.id, reason);
                              onOpenChange(false);
                            }}
                          >
                            Reject with this reason
                          </Button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {isManualEntry ? (
            !readOnly && (
              <Button onClick={handleManualSave} disabled={!manualValue || !manualUnit}>
                <Check className="size-4" /> Save &amp; Verify
              </Button>
            )
          ) : (
            !verified &&
            !readOnly && (
              <>
                <Button variant="ghost" onClick={() => setShowIssue((v) => !v)}>
                  Something&apos;s off
                </Button>
                <Button onClick={handleVerify} disabled={verifying}>
                  {verifying ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                  Looks right — Verify
                </Button>
              </>
            )
          )}
          {readOnly && <span className="text-xs text-text-tertiary">Read-only — Auditor access</span>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
