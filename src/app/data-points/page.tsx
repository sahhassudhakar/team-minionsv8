"use client";

import { useState } from "react";
import Link from "next/link";
import { CircleDot, Droplets } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge, dataPointStatusBadge } from "@/components/status-badge";
import { VerificationModal } from "@/components/verification-modal";
import { useAppStore } from "@/lib/store";
import { useAuthStore } from "@/lib/auth-store";
import type { DataPoint } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function DataPointsPage() {
  const items = useAppStore((s) => s.dataPoints);
  const questionnaireFields = useAppStore((s) => s.questionnaireFields);
  const verifyDataPoint = useAppStore((s) => s.verifyDataPoint);
  const rejectDataPoint = useAppStore((s) => s.rejectDataPoint);
  const saveManualEntry = useAppStore((s) => s.saveManualEntry);
  const user = useAuthStore((s) => s.user);

  const [selected, setSelected] = useState<DataPoint | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const readOnly = user?.role !== "admin";

  const openVerify = (dp: DataPoint) => {
    setSelected(dp);
    setModalOpen(true);
  };

  const actor = user ? { name: user.name, role: user.role } : null;

  const actionable = items.filter((d) => d.status === "proposed" || d.status === "needs_manual_entry").length;

  return (
    <div>
      <PageHeader
        title="Data Points"
        description={actionable > 0 ? `${actionable} awaiting your review` : "Extracted values, sourced from evidence."}
      />

      {questionnaireFields.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-ai-advisory/30 bg-ai-advisory-bg px-3 py-2.5 text-sm text-text-secondary">
          <Droplets className="mt-0.5 size-4 shrink-0 text-ai-advisory" />
          <span>
            Water/PWI evidence (uploaded with a Site + document category) is tracked separately —
            see <Link href="/pwi" className="font-medium text-accent-primary hover:underline">PWI</Link> for
            that validation queue. This page only shows evidence uploaded without a site (the general
            disclosure framework pipeline).
          </span>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={CircleDot}
          title="No data points yet"
          description="Data points are created automatically once uploaded evidence is processed. Upload evidence to get started."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border-subtle bg-bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-left text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                <th className="px-4 py-3">Metric</th>
                <th className="px-4 py-3">Value</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((d) => {
                const badge = dataPointStatusBadge(d.status);
                const actionableRow = d.status === "proposed" || d.status === "needs_manual_entry";
                return (
                  <tr
                    key={d.id}
                    onClick={() => openVerify(d)}
                    className="cursor-pointer border-b border-border-subtle last:border-0 hover:bg-bg-surface-sunken"
                  >
                    <td className="px-4 py-3 font-medium text-text-primary">{d.metricName}</td>
                    <td
                      className={cn(
                        "px-4 py-3 tabular-nums",
                        d.status === "proposed" ? "font-normal text-text-secondary" : "font-semibold text-text-primary"
                      )}
                    >
                      {d.value ?? "—"} {d.unit}
                    </td>
                    <td className="px-4 py-3 text-accent-primary">📎 {d.evidenceFileName}</td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {actionableRow && !readOnly && (
                        <span className="text-xs font-medium text-accent-primary">
                          {d.status === "needs_manual_entry" ? "Enter value →" : "Verify →"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <VerificationModal
        dataPoint={selected}
        open={modalOpen}
        onOpenChange={setModalOpen}
        readOnly={readOnly}
        onVerified={(id, correctedValue) => actor && verifyDataPoint(id, actor, correctedValue)}
        onRejected={(id, reason) => actor && rejectDataPoint(id, actor, reason)}
        onManualEntry={(id, value, unit) => actor && saveManualEntry(id, value, unit, actor)}
      />
    </div>
  );
}
