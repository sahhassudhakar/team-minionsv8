"use client";

import { useState } from "react";
import Link from "next/link";
import { Info, Sparkles, Cloud, Check, X, Link2, FileText, ChevronDown, AlertTriangle, Quote } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EvidenceFileViewer } from "@/components/evidence-file-viewer";
import { useAppStore } from "@/lib/store";
import { useAuthStore } from "@/lib/auth-store";
import { suggestEvidenceForItem } from "@/lib/cdp-engine";
import { cn } from "@/lib/utils";
import type { FrameworkItem } from "@/lib/types";

/** Which single async action (if any) is currently in flight for which item — drives per-button loading state so a click always gives visible feedback, even when the resulting draft text is unchanged. */
type PendingAction = { itemId: string; kind: "generate" | "approve" } | null;

const STATUS_TONE = { ready: "confirmed", pending: "attention", unmapped: "neutral" } as const;
const STATUS_LABEL = { ready: "Ready", pending: "Draft pending approval", unmapped: "Insufficient Evidence" } as const;

type FilterMode = "all" | "not_ready" | "ready";

export default function CDPPage() {
  const user = useAuthStore((s) => s.user);
  const frameworks = useAppStore((s) => s.frameworks);
  const evidence = useAppStore((s) => s.evidence);
  const dataPoints = useAppStore((s) => s.dataPoints);
  const questionnaireFields = useAppStore((s) => s.questionnaireFields);
  const linkEvidenceToItem = useAppStore((s) => s.linkEvidenceToItem);
  const unlinkEvidenceFromItem = useAppStore((s) => s.unlinkEvidenceFromItem);
  const generateDraftAnswer = useAppStore((s) => s.generateDraftAnswer);
  const approveDraftAnswer = useAppStore((s) => s.approveDraftAnswer);

  const isAdmin = user?.role === "admin";
  const actor = user ? { name: user.name, role: user.role } : null;
  const cdp = frameworks.find((f) => f.name.toLowerCase().includes("cdp"));

  const [filter, setFilter] = useState<FilterMode>("not_ready");
  const [linkModalItem, setLinkModalItem] = useState<FrameworkItem | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [previewSource, setPreviewSource] = useState<{ evidenceId: string; fileName: string } | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});

  /**
   * Runs a Generate/Regenerate or Approve action with real loading and error
   * feedback. Both actions are otherwise silent — no spinner, no confirmation,
   * no surfaced failure — which is exactly why "Regenerate" could look broken
   * even when the request round-trips fine: a deterministic re-assembly of
   * unchanged evidence produces byte-identical text, so without this, a
   * successful click and a dropped one are visually indistinguishable.
   */
  const runItemAction = async (itemId: string, kind: "generate" | "approve", action: () => Promise<void>) => {
    setPending({ itemId, kind });
    setItemErrors((prev) => {
      if (!(itemId in prev)) return prev;
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    try {
      await action();
    } catch (err) {
      setItemErrors((prev) => ({ ...prev, [itemId]: err instanceof Error ? err.message : "Something went wrong — try again." }));
    } finally {
      setPending(null);
    }
  };

  if (!cdp) {
    return (
      <div>
        <PageHeader title="CDP" description="Draft-answer readiness against your active CDP questionnaire." />
        <EmptyState
          icon={Cloud}
          title="No CDP questionnaire loaded"
          description="An Admin needs to load a CDP questionnaire under Admin → Frameworks before readiness can be tracked."
        />
      </div>
    );
  }

  const readyCount = cdp.items.filter((i) => i.status === "ready").length;
  const totalCount = cdp.items.length;
  const readinessPct = totalCount > 0 ? (readyCount / totalCount) * 100 : 0;

  const filteredItems = cdp.items.filter((i) => {
    if (filter === "ready") return i.status === "ready";
    if (filter === "not_ready") return i.status !== "ready";
    return true;
  });

  const modules = Array.from(new Set(filteredItems.map((i) => i.module)));

  return (
    <div>
      <PageHeader title="CDP" description={`${cdp.name} ${cdp.version} — draft answers assembled only from your cited, verified evidence.`} />

      <Card className="mb-6">
        <CardContent className="py-6">
          <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-text-secondary">
            Internal Readiness Estimate
          </div>
          <div className="mb-2 h-2.5 w-full overflow-hidden rounded-full bg-bg-surface-sunken">
            <div className="h-full rounded-full bg-status-verified" style={{ width: `${readinessPct}%` }} />
          </div>
          <div className="flex items-center gap-1.5 text-sm text-text-secondary">
            <span>{readyCount} of {totalCount} questions ready ({Math.round(readinessPct)}%)</span>
            <Tooltip>
              <TooltipTrigger>
                <Info className="size-3.5 text-text-tertiary" />
              </TooltipTrigger>
              <TooltipContent>
                This reflects evidence completeness and approved-draft coverage only. It is <strong>not</strong> an
                official CDP score — CDP alone determines the official disclosure grade. A question counts as
                &quot;ready&quot; only once an Admin has approved a draft built from real cited evidence.
              </TooltipContent>
            </Tooltip>
          </div>
        </CardContent>
      </Card>

      <div className="mb-4 flex gap-1.5">
        {(["not_ready", "ready", "all"] as FilterMode[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium",
              filter === f ? "bg-accent-primary text-white" : "bg-bg-surface-sunken text-text-secondary"
            )}
          >
            {f === "not_ready" ? "Not ready" : f === "ready" ? "Ready" : "All"}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {modules.map((module) => (
          <div key={module}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">{module}</h3>
            <div className="space-y-2">
              {filteredItems
                .filter((i) => i.module === module)
                .map((item) => (
                  <CdpItemCard
                    key={item.id}
                    item={item}
                    evidence={evidence}
                    isAdmin={isAdmin}
                    expanded={expandedId === item.id}
                    generating={pending?.itemId === item.id && pending.kind === "generate"}
                    approving={pending?.itemId === item.id && pending.kind === "approve"}
                    error={itemErrors[item.id]}
                    onToggleExpand={() => setExpandedId(expandedId === item.id ? null : item.id)}
                    onLinkEvidence={() => setLinkModalItem(item)}
                    onUnlinkEvidence={(evId) => actor && unlinkEvidenceFromItem(cdp.id, item.id, evId, actor)}
                    onPreviewSource={(evId, fileName) => setPreviewSource({ evidenceId: evId, fileName })}
                    onGenerateDraft={() => actor && runItemAction(item.id, "generate", () => generateDraftAnswer(cdp.id, item.id, actor))}
                    onApproveDraft={() => actor && runItemAction(item.id, "approve", () => approveDraftAnswer(cdp.id, item.id, actor))}
                  />
                ))}
            </div>
          </div>
        ))}
        {filteredItems.length === 0 && (
          <p className="py-8 text-center text-sm text-text-tertiary">No items match this filter.</p>
        )}
      </div>

      <LinkEvidenceModal
        item={linkModalItem}
        evidence={evidence}
        dataPoints={dataPoints}
        questionnaireFields={questionnaireFields}
        open={linkModalItem != null}
        onOpenChange={(v) => !v && setLinkModalItem(null)}
        onLink={(evId) => {
          if (linkModalItem && actor) linkEvidenceToItem(cdp.id, linkModalItem.id, evId, actor);
        }}
      />

      <Dialog open={previewSource != null} onOpenChange={(v) => !v && setPreviewSource(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="size-3.5 text-text-tertiary" />
              {previewSource?.fileName}
            </DialogTitle>
          </DialogHeader>
          <div className="h-[65vh] px-6 pb-6">
            {previewSource && <EvidenceFileViewer evidenceId={previewSource.evidenceId} fileName={previewSource.fileName} />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CdpItemCard({
  item,
  evidence,
  isAdmin,
  expanded,
  generating,
  approving,
  error,
  onToggleExpand,
  onLinkEvidence,
  onUnlinkEvidence,
  onPreviewSource,
  onGenerateDraft,
  onApproveDraft,
}: {
  item: FrameworkItem;
  evidence: ReturnType<typeof useAppStore.getState>["evidence"];
  isAdmin: boolean;
  expanded: boolean;
  /** True only while THIS item's generate/regenerate request is in flight. */
  generating: boolean;
  /** True only while THIS item's approve request is in flight. */
  approving: boolean;
  /** Message from the most recent failed action on this item, if any. */
  error?: string;
  onToggleExpand: () => void;
  onLinkEvidence: () => void;
  onUnlinkEvidence: (evidenceId: string) => void;
  onPreviewSource: (evidenceId: string, fileName: string) => void;
  onGenerateDraft: () => void;
  onApproveDraft: () => void;
}) {
  const linkedEvidence = item.linkedEvidenceIds.map((id) => evidence.find((e) => e.id === id)).filter(Boolean) as typeof evidence;
  const hasNoEvidence = linkedEvidence.length === 0;

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-text-tertiary">{item.code}</span>
          </div>
          <p className="mt-0.5 text-sm text-text-primary">{item.text}</p>
        </div>
        <StatusBadge tone={STATUS_TONE[item.status]} className="shrink-0">
          {STATUS_LABEL[item.status]}
        </StatusBadge>
      </div>

      {hasNoEvidence ? (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-md border border-status-insufficient/30 bg-status-insufficient-bg px-3 py-2">
          <p className="text-xs text-text-secondary">
            <span className="font-medium text-status-insufficient">Insufficient Evidence.</span> Needed:{" "}
            {item.requiredEvidenceHint}
          </p>
          {isAdmin ? (
            <Button size="sm" variant="secondary" onClick={onLinkEvidence}>
              <Link2 className="size-3.5" /> Link evidence
            </Button>
          ) : (
            <Link href="/evidence" className="shrink-0 text-xs font-medium text-accent-primary hover:underline">
              Upload evidence →
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {linkedEvidence.map((ev) => {
              const wasAutoLinked = item.autoLinkedEvidenceIds?.includes(ev!.id);
              return (
                <span
                  key={ev!.id}
                  className={cn(
                    "flex items-center gap-1 rounded-md px-2 py-1 text-xs text-text-secondary",
                    wasAutoLinked ? "bg-ai-advisory-bg" : "bg-bg-surface-sunken"
                  )}
                >
                  {wasAutoLinked ? <Sparkles className="size-3 text-ai-advisory" /> : <FileText className="size-3" />}
                  {ev!.fileName}
                  {wasAutoLinked && (
                    <Tooltip>
                      <TooltipTrigger>
                        <span className="rounded-full bg-ai-advisory/15 px-1.5 text-[10px] font-medium text-ai-advisory">Auto</span>
                      </TooltipTrigger>
                      <TooltipContent>Attached automatically — matched on document metadata and/or extracted content, no manual linking required.</TooltipContent>
                    </Tooltip>
                  )}
                  {isAdmin && (
                    <button onClick={() => onUnlinkEvidence(ev!.id)} className="ml-1 text-text-tertiary hover:text-status-insufficient">
                      <X className="size-3" />
                    </button>
                  )}
                </span>
              );
            })}
            {isAdmin && (
              <button onClick={onLinkEvidence} className="text-xs font-medium text-accent-primary hover:underline">
                + Add more
              </button>
            )}
          </div>

          <button onClick={onToggleExpand} className="mt-3 flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-text-primary">
            {item.draftAnswer ? "Draft answer" : "No draft yet"}
            <ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
          </button>

          {expanded && (
            <div className="mt-2">
              {item.draftAnswer ? (
                <div className={cn("rounded-md border-l-2 px-3 py-2.5", item.draftApprovedBy ? "border-l-status-verified bg-status-verified-bg" : "border-l-ai-advisory bg-ai-advisory-bg")}>
                  <div className="mb-2 flex items-center gap-2">
                    {item.draftApprovedBy ? (
                      <>
                        <Check className="size-3.5 text-status-verified" />
                        <span className="text-xs font-medium text-status-verified">
                          Approved by {item.draftApprovedBy}
                        </span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="size-3.5 text-ai-advisory" />
                        <span className="text-xs font-medium text-ai-advisory">Draft — not yet approved</span>
                      </>
                    )}
                  </div>

                  {/* Response, then source — one block per cited document, instead of every fact and filename run together in one paragraph. */}
                  <div className="space-y-2.5">
                    {item.draftCitations
                      ? item.draftCitations.map((citation, idx) => (
                          <div key={`${citation.evidenceId}-${idx}`} className={idx > 0 ? "border-t border-border-subtle/70 pt-2.5" : undefined}>
                            <p className="text-sm text-text-primary">{citation.statement}</p>
                            <button
                              onClick={() => onPreviewSource(citation.evidenceId, citation.fileName)}
                              className="mt-1 flex items-center gap-1 text-xs font-medium text-text-tertiary hover:text-accent-primary hover:underline"
                            >
                              <Quote className="size-3 shrink-0" />
                              Source: {citation.fileName}
                            </button>
                          </div>
                        ))
                      : // Draft was generated before structured citations existed — fall back to the flat string rather than showing nothing.
                        <p className="text-sm text-text-primary">{item.draftAnswer}</p>}
                  </div>

                  {error && (
                    <div className="mt-2 flex items-start gap-1.5 rounded-md bg-status-insufficient-bg px-2.5 py-1.5 text-xs text-status-insufficient">
                      <AlertTriangle className="mt-0.5 size-3 shrink-0" /> {error}
                    </div>
                  )}

                  {isAdmin && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {!item.draftApprovedBy && (
                        <Button size="sm" onClick={onApproveDraft} disabled={generating || approving} loading={approving}>
                          <Check className="size-3.5" /> Approve as answer
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={onGenerateDraft} disabled={generating || approving} loading={generating}>
                        Regenerate
                      </Button>
                      {item.draftApprovedBy && (
                        <span className="text-xs text-text-tertiary">Regenerating reverts this to a draft awaiting approval.</span>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-border-subtle px-3 py-3 text-center">
                  <p className="mb-2 text-xs text-text-tertiary">
                    Evidence is linked but no draft has been assembled yet.
                  </p>
                  {error && (
                    <div className="mb-2 flex items-start gap-1.5 rounded-md bg-status-insufficient-bg px-2.5 py-1.5 text-left text-xs text-status-insufficient">
                      <AlertTriangle className="mt-0.5 size-3 shrink-0" /> {error}
                    </div>
                  )}
                  {isAdmin && (
                    <Button size="sm" variant="secondary" onClick={onGenerateDraft} disabled={generating} loading={generating}>
                      <Sparkles className="size-3.5" /> Generate draft
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function LinkEvidenceModal({
  item,
  evidence,
  dataPoints,
  questionnaireFields,
  open,
  onOpenChange,
  onLink,
}: {
  item: FrameworkItem | null;
  evidence: ReturnType<typeof useAppStore.getState>["evidence"];
  dataPoints: ReturnType<typeof useAppStore.getState>["dataPoints"];
  questionnaireFields: ReturnType<typeof useAppStore.getState>["questionnaireFields"];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onLink: (evidenceId: string) => void;
}) {
  if (!item) return null;
  const suggested = suggestEvidenceForItem(item, evidence, dataPoints, questionnaireFields);
  const suggestedIds = new Set(suggested.map((e) => e.id));
  const rest = evidence.filter((e) => !suggestedIds.has(e.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Link evidence to {item.code}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[420px] overflow-y-auto px-6 py-4">
          {evidence.length === 0 ? (
            <p className="text-sm text-text-secondary">No evidence uploaded yet.</p>
          ) : (
            <>
              {suggested.length > 0 && (
                <>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-tertiary">Suggested</p>
                  <div className="mb-3 space-y-1.5">
                    {suggested.map((e) => (
                      <EvidenceLinkRow key={e.id} evidence={e} suggested onLink={() => onLink(e.id)} linked={item!.linkedEvidenceIds.includes(e.id)} />
                    ))}
                  </div>
                </>
              )}
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-tertiary">All evidence</p>
              <div className="space-y-1.5">
                {rest.map((e) => (
                  <EvidenceLinkRow key={e.id} evidence={e} onLink={() => onLink(e.id)} linked={item!.linkedEvidenceIds.includes(e.id)} />
                ))}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EvidenceLinkRow({
  evidence,
  suggested,
  linked,
  onLink,
}: {
  evidence: { id: string; fileName: string; documentType: string };
  suggested?: boolean;
  linked: boolean;
  onLink: () => void;
}) {
  return (
    <div className={cn("flex items-center justify-between rounded-md border px-3 py-2 text-sm", linked ? "border-status-verified/30 bg-status-verified-bg/40" : "border-border-subtle")}>
      <div className="min-w-0">
        <p className="truncate text-text-primary">{evidence.fileName}</p>
        <p className="truncate text-xs text-text-tertiary">{evidence.documentType}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {suggested && <span className="rounded-full bg-ai-advisory-bg px-2 py-0.5 text-[11px] font-medium text-ai-advisory">Suggested</span>}
        <Button size="sm" variant={linked ? "ghost" : "secondary"} disabled={linked} onClick={onLink}>
          {linked ? "Linked" : "+ Link"}
        </Button>
      </div>
    </div>
  );
}
