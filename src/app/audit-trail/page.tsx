"use client";

import { useMemo, useState } from "react";
import { History, Download } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";

const ACTION_LABELS: Record<string, string> = {
  upload: "Upload",
  extract: "Extraction",
  processing_failed: "Processing failed",
  verify: "Verify",
  reject: "Reject",
  manual_entry: "Manual entry",
  framework_configured: "Framework configured",
  framework_item_added: "Framework item added",
  resolve: "Gap resolved",
  login: "Sign in",
  logout: "Sign out",
};

function actionTextColor(action: string) {
  if (action === "reject" || action === "processing_failed") return "text-status-insufficient";
  if (action === "verify" || action === "resolve") return "text-status-verified";
  return "text-text-primary";
}

export default function AuditTrailPage() {
  const auditLog = useAppStore((s) => s.auditLog);
  const [actionFilter, setActionFilter] = useState<string>("all");

  const uniqueActions = useMemo(() => Array.from(new Set(auditLog.map((e) => e.action))), [auditLog]);
  const filtered = actionFilter === "all" ? auditLog : auditLog.filter((e) => e.action === actionFilter);

  const exportCsv = () => {
    const header = "timestamp,actor,role,action,entity_type,entity,details\n";
    const rows = auditLog
      .map((e) =>
        [e.timestamp, e.actorName, e.actorRole, e.action, e.entityType, e.entityLabel, e.details ?? ""]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `team-minions-audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        title="Audit Trail"
        description="Every action across the platform, logged and reconstructable."
        actions={
          auditLog.length > 0 ? (
            <Button variant="secondary" onClick={exportCsv}>
              <Download className="size-4" /> Export CSV
            </Button>
          ) : undefined
        }
      />

      {auditLog.length === 0 ? (
        <EmptyState
          icon={History}
          title="No activity recorded yet"
          description="Actions across the platform — uploads, extractions, verifications, sign-ins — will appear here as they happen."
        />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-1.5">
            <button
              onClick={() => setActionFilter("all")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                actionFilter === "all" ? "bg-accent-primary text-white" : "bg-bg-surface-sunken text-text-secondary"
              }`}
            >
              All
            </button>
            {uniqueActions.map((a) => (
              <button
                key={a}
                onClick={() => setActionFilter(a)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                  actionFilter === a ? "bg-accent-primary text-white" : "bg-bg-surface-sunken text-text-secondary"
                }`}
              >
                {ACTION_LABELS[a] ?? a}
              </button>
            ))}
          </div>

          <div className="overflow-hidden rounded-lg border border-border-subtle bg-bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
                  <th className="px-4 py-2.5">Timestamp</th>
                  <th className="px-4 py-2.5">Actor</th>
                  <th className="px-4 py-2.5">Action</th>
                  <th className="px-4 py-2.5">Entity</th>
                  <th className="px-4 py-2.5">Details</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id} className="border-b border-border-subtle text-[13px] last:border-0 hover:bg-bg-surface-sunken">
                    <td className="whitespace-nowrap px-4 py-2 font-mono text-[11px] text-text-secondary">
                      {new Date(e.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-text-secondary">
                      {e.actorName} <span className="text-text-tertiary">({e.actorRole})</span>
                    </td>
                    <td className={`px-4 py-2 font-medium ${actionTextColor(e.action)}`}>
                      {ACTION_LABELS[e.action] ?? e.action}
                    </td>
                    <td className="px-4 py-2 text-text-secondary">
                      {e.entityType}: {e.entityLabel}
                    </td>
                    <td className="px-4 py-2 text-text-tertiary">{e.details ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
