"use client";

import { useState } from "react";
import Link from "next/link";
import { Inbox, Plus, AlertTriangle, Info } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { UploadEvidenceDialog } from "@/components/upload-evidence-dialog";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useAppStore } from "@/lib/store";
import { useAuthStore } from "@/lib/auth-store";
import { DOCUMENT_CATEGORIES } from "@/lib/water-extraction";
import type { EvidenceObject, DataPoint } from "@/lib/types";
import type { QuestionnaireField } from "@/lib/water-types";

/**
 * The Evidence object's own `status` field only tracks processing
 * (uploaded/extracted/rejected) — it says nothing about whether the
 * extraction actually produced anything reviewable, or whether that's
 * already been reviewed. This derives the status a person actually cares
 * about by looking at what's really linked to this evidence.
 */
function getEvidenceReviewInfo(
  evidence: EvidenceObject,
  dataPoints: DataPoint[],
  questionnaireFields: QuestionnaireField[]
): { tone: StatusTone; label: string; href: string | null; actionLabel: string | null } {
  if (evidence.status === "rejected") {
    return { tone: "blocked", label: "Rejected", href: null, actionLabel: null };
  }
  if (evidence.status === "duplicate") {
    return { tone: "neutral", label: "Duplicate — not reprocessed", href: null, actionLabel: null };
  }
  if (evidence.status === "uploaded" || evidence.status === "queued_for_extraction") {
    return { tone: "neutral", label: "Processing", href: null, actionLabel: null };
  }

  const linkedDataPoints = dataPoints.filter((d) => d.evidenceId === evidence.id);
  const linkedFields = questionnaireFields.filter((f) => f.evidenceId === evidence.id);

  const pendingDataPoints = linkedDataPoints.filter((d) => d.status === "proposed" || d.status === "needs_manual_entry");
  const pendingFields = linkedFields.filter((f) => f.status === "proposed" || f.status === "awaiting_evidence");
  const pendingCount = pendingDataPoints.length + pendingFields.length;

  if (pendingCount > 0) {
    // Water-context evidence (has questionnaire fields) reviews on /pwi;
    // generic evidence (has data points) reviews on /data-points.
    const href = linkedFields.length > 0 ? "/pwi" : "/data-points";
    return { tone: "attention", label: `Needs review (${pendingCount})`, href, actionLabel: "Review" };
  }

  if (linkedDataPoints.length + linkedFields.length > 0) {
    return { tone: "confirmed", label: "Reviewed", href: null, actionLabel: null };
  }

  // Processed successfully but matched no known field pattern — genuinely
  // nothing to review, and the label must say that plainly rather than
  // implying an action is pending.
  return { tone: "neutral", label: "No data extracted", href: null, actionLabel: null };
}

export default function EvidencePage() {
  const items = useAppStore((s) => s.evidence);
  const sites = useAppStore((s) => s.sites);
  const dataPoints = useAppStore((s) => s.dataPoints);
  const questionnaireFields = useAppStore((s) => s.questionnaireFields);
  const uploadEvidence = useAppStore((s) => s.uploadEvidence);
  const user = useAuthStore((s) => s.user);
  const [uploadOpen, setUploadOpen] = useState(false);
  const canUpload = user?.role === "admin" || user?.role === "store_manager";
  const isStoreManager = user?.role === "store_manager";
  const isAdmin = user?.role === "admin";

  const handleUploaded = async (
    files: File[],
    waterContext?: { siteId: string; categoryIds: string[] },
    adminContext?: { siteId: string; documentTypes: string[] }
  ) => {
    if (!user) return;
    await uploadEvidence(files, { name: user.name, role: user.role }, waterContext, adminContext);
  };

  return (
    <div>
      <PageHeader
        title="Evidence"
        description="Source documents that back every number in this workspace."
        actions={
          canUpload ? (
            <Button
              onClick={() => setUploadOpen(true)}
              disabled={isStoreManager && sites.length === 0}
              title={isAdmin && sites.length === 0 ? "You can still upload company-wide evidence with no site attached." : undefined}
            >
              <Plus className="size-4" /> Upload Evidence
            </Button>
          ) : (
            <span className="text-xs font-medium text-text-tertiary">Read-only — Auditor access</span>
          )
        }
      />

      {isStoreManager && sites.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-ai-advisory/30 bg-ai-advisory-bg px-3 py-2.5 text-sm text-text-secondary">
          <Info className="mt-0.5 size-4 shrink-0 text-ai-advisory" />
          <span>
            After upload, extracted values appear on the{" "}
            <a href="/pwi" className="font-medium text-accent-primary hover:underline">PWI</a> page,
            awaiting your Admin&apos;s validation — not on Data Points (that page is for a separate,
            non-site evidence pipeline).
          </span>
        </div>
      )}

      {isStoreManager && sites.length === 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-status-proposed/30 bg-status-proposed-bg px-3 py-2 text-sm text-text-secondary">
          <Info className="size-4 text-status-proposed" />
          No sites exist yet — ask your Admin to create one under Admin → Sites before you can upload.
        </div>
      )}

      {isStoreManager && (
        <details className="mb-4 rounded-md border border-border-subtle bg-bg-surface">
          <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-text-primary">
            What documents do I need to build a PWI report?
          </summary>
          <div className="border-t border-border-subtle px-4 py-3">
            <ul className="space-y-1.5 text-sm text-text-secondary">
              {DOCUMENT_CATEGORIES.map((c) => (
                <li key={c.id}>
                  <span className="font-medium text-text-primary">{c.label}</span> — {c.description}
                </li>
              ))}
            </ul>
          </div>
        </details>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No evidence uploaded yet"
          description={
            canUpload
              ? "Upload utility bills, lab reports, or project reports to begin building a PWI report."
              : "No evidence has been uploaded by your organization yet."
          }
          actionLabel={canUpload && !(isStoreManager && sites.length === 0) ? "Upload Evidence" : undefined}
          onAction={canUpload ? () => setUploadOpen(true) : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border-subtle bg-bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-left text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                <th className="px-4 py-3">File name</th>
                <th className="px-4 py-3">Document type</th>
                <th className="px-4 py-3">Site / Business unit</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Uploaded</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((e) => {
                const review = getEvidenceReviewInfo(e, dataPoints, questionnaireFields);
                return (
                  <tr key={e.id} className="border-b border-border-subtle last:border-0 hover:bg-bg-surface-sunken">
                    <td className="px-4 py-3 text-text-primary">{e.fileName}</td>
                    <td className="px-4 py-3 text-text-secondary">{e.documentType}</td>
                    <td className="px-4 py-3 text-text-secondary">{e.businessUnit}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <StatusBadge tone={review.tone}>{review.label}</StatusBadge>
                        {e.processingError && (
                          <Tooltip>
                            <TooltipTrigger>
                              <AlertTriangle className="size-3.5 text-status-insufficient" />
                            </TooltipTrigger>
                            <TooltipContent>{e.processingError}</TooltipContent>
                          </Tooltip>
                        )}
                        {e.status === "duplicate" && e.duplicateOfEvidenceId && (
                          <Tooltip>
                            <TooltipTrigger>
                              <Info className="size-3.5 text-text-tertiary" />
                            </TooltipTrigger>
                            <TooltipContent>
                              Identical content already uploaded as{" "}
                              {items.find((x) => x.id === e.duplicateOfEvidenceId)?.fileName ?? "another file"} — not
                              re-extracted.
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-text-tertiary">
                      {new Date(e.uploadedAt).toLocaleDateString()} · {e.uploadedBy}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {review.href && (
                        <Link href={review.href} className="text-xs font-medium text-accent-primary hover:underline">
                          {review.actionLabel} →
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {canUpload && (
        <UploadEvidenceDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          onUploaded={handleUploaded}
          sites={sites}
          mode={isStoreManager ? "water" : "generic"}
          defaultSiteId={sites.find((s) => s.storeManagerEmail === user?.email)?.id}
        />
      )}
    </div>
  );
}
