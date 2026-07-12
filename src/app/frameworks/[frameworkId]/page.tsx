"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Link2, X } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge, dataPointStatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAppStore } from "@/lib/store";
import { useAuthStore } from "@/lib/auth-store";
import { cn } from "@/lib/utils";
import { Settings } from "lucide-react";
import type { FrameworkItem } from "@/lib/types";

const STATUS_TONE = { ready: "confirmed", pending: "attention", unmapped: "neutral" } as const;
const STATUS_LABEL = { ready: "Ready", pending: "Pending verification", unmapped: "Unmapped" } as const;

export default function FrameworkDetailPage({ params }: { params: Promise<{ frameworkId: string }> }) {
  const { frameworkId } = use(params);
  const frameworks = useAppStore((s) => s.frameworks);
  const dataPoints = useAppStore((s) => s.dataPoints);
  const linkDataPointToItem = useAppStore((s) => s.linkDataPointToItem);
  const unlinkDataPointFromItem = useAppStore((s) => s.unlinkDataPointFromItem);
  const user = useAuthStore((s) => s.user);
  const canEdit = user?.role === "admin";

  const [linkModalItem, setLinkModalItem] = useState<FrameworkItem | null>(null);

  const framework = frameworks.find((f) => f.id === frameworkId);

  if (!framework) {
    return (
      <div>
        <Link href="/frameworks" className="mb-4 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary">
          <ArrowLeft className="size-4" /> Back to Frameworks
        </Link>
        <EmptyState icon={Settings} title="Framework not found" description="It may have been removed, or this link is out of date." />
      </div>
    );
  }

  const actor = user ? { name: user.name, role: user.role } : null;
  const readyCount = framework.items.filter((i) => i.status === "ready").length;

  return (
    <div>
      <Link href="/frameworks" className="mb-4 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary">
        <ArrowLeft className="size-4" /> Back to Frameworks
      </Link>
      <PageHeader
        title={`${framework.name} ${framework.version}`}
        description={`${readyCount} of ${framework.items.length} items have verified evidence mapped.`}
      />

      {framework.items.length === 0 ? (
        <EmptyState
          icon={Settings}
          title="No items yet"
          description={
            canEdit
              ? "Add items to this framework under Admin → Frameworks."
              : "Your Admin hasn't added items to this framework yet."
          }
        />
      ) : (
        <div className="space-y-2">
          {framework.items.map((item) => {
            const linked = item.linkedDataPointIds
              .map((id) => dataPoints.find((d) => d.id === id))
              .filter(Boolean) as typeof dataPoints;
            return (
              <div key={item.id} className="rounded-lg border border-border-subtle bg-bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-text-tertiary">{item.code}</span>
                      <span className="text-xs text-text-tertiary">· {item.module}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-text-primary">{item.text}</p>
                  </div>
                  <StatusBadge tone={STATUS_TONE[item.status]} className="shrink-0">
                    {STATUS_LABEL[item.status]}
                  </StatusBadge>
                </div>

                {linked.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {linked.map((dp) => {
                      const badge = dataPointStatusBadge(dp.status);
                      return (
                        <div
                          key={dp.id}
                          className="flex items-center justify-between rounded-md bg-bg-surface-sunken px-3 py-1.5 text-sm"
                        >
                          <span className="text-text-primary">
                            📎 {dp.metricName} <span className="text-text-tertiary">({dp.evidenceFileName})</span>
                          </span>
                          <div className="flex items-center gap-2">
                            <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
                            {canEdit && (
                              <button
                                onClick={() =>
                                  actor && unlinkDataPointFromItem(framework.id, item.id, dp.id, actor)
                                }
                                className="rounded p-0.5 text-text-tertiary hover:bg-border-subtle hover:text-status-insufficient"
                                title="Unlink"
                              >
                                <X className="size-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {canEdit && (
                  <button
                    onClick={() => setLinkModalItem(item)}
                    className="mt-3 flex items-center gap-1.5 text-xs font-medium text-accent-primary hover:underline"
                  >
                    <Link2 className="size-3.5" /> Link evidence
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <LinkEvidenceModal
        item={linkModalItem}
        open={linkModalItem != null}
        onOpenChange={(v) => !v && setLinkModalItem(null)}
        onLink={(dataPointId) => {
          if (linkModalItem && actor) linkDataPointToItem(framework.id, linkModalItem.id, dataPointId, actor);
        }}
        alreadyLinkedIds={linkModalItem?.linkedDataPointIds ?? []}
      />
    </div>
  );
}

function LinkEvidenceModal({
  item,
  open,
  onOpenChange,
  onLink,
  alreadyLinkedIds,
}: {
  item: FrameworkItem | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onLink: (dataPointId: string) => void;
  alreadyLinkedIds: string[];
}) {
  const dataPoints = useAppStore((s) => s.dataPoints);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Link evidence to {item?.code}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[420px] overflow-y-auto px-6 py-4">
          {dataPoints.length === 0 ? (
            <p className="text-sm text-text-secondary">
              No data points exist yet — upload and process some evidence first.
            </p>
          ) : (
            <div className="space-y-1.5">
              {dataPoints.map((dp) => {
                const badge = dataPointStatusBadge(dp.status);
                const isLinked = alreadyLinkedIds.includes(dp.id);
                return (
                  <div
                    key={dp.id}
                    className={cn(
                      "flex items-center justify-between rounded-md border px-3 py-2 text-sm",
                      isLinked ? "border-status-verified/30 bg-status-verified-bg/40" : "border-border-subtle"
                    )}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-text-primary">{dp.metricName}</p>
                      <p className="truncate text-xs text-text-tertiary">{dp.evidenceFileName}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
                      <Button size="sm" variant={isLinked ? "ghost" : "secondary"} disabled={isLinked} onClick={() => onLink(dp.id)}>
                        {isLinked ? "Linked" : "+ Link"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
