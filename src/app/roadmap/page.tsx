"use client";

import { useMemo, useState } from "react";
import {
  TrendingUp, CheckCircle2, ChevronDown, ChevronUp, FileText,
  AlertTriangle, Clock, User, Zap, Info, Filter
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";
import { buildPwiRoadmap, buildCdpRoadmap } from "@/lib/roadmap-engine";
import type { RoadmapItem, RoadmapGroup, RoadmapPriority, RoadmapStatus } from "@/lib/roadmap-engine";
import { cn } from "@/lib/utils";

const PRIORITY_CONFIG: Record<RoadmapPriority, { color: string; bg: string; dot: string }> = {
  Critical: { color: "text-red-700", bg: "bg-red-50 border-red-200", dot: "bg-red-500" },
  High:     { color: "text-orange-700", bg: "bg-orange-50 border-orange-200", dot: "bg-orange-500" },
  Medium:   { color: "text-amber-700", bg: "bg-amber-50 border-amber-200", dot: "bg-amber-500" },
  Low:      { color: "text-slate-600", bg: "bg-slate-50 border-slate-200", dot: "bg-slate-400" },
};

const STATUS_CONFIG: Record<RoadmapStatus, { label: string; color: string }> = {
  "Not Started":      { label: "Not Started",      color: "text-status-neutral bg-status-neutral-bg" },
  "In Progress":      { label: "In Progress",       color: "text-status-proposed bg-status-proposed-bg" },
  "Awaiting Evidence":{ label: "Awaiting Evidence", color: "text-ai-advisory bg-ai-advisory-bg" },
  "Complete":         { label: "Complete",           color: "text-status-verified bg-status-verified-bg" },
};

const EVIDENCE_STATUS_CONFIG: Record<string, string> = {
  "Insufficient Evidence": "text-status-insufficient",
  "Pending Validation":    "text-status-proposed",
  "Partially Evidenced":   "text-status-proposed",
  "Evidenced":             "text-status-verified",
};

const ALL_GROUPS: RoadmapGroup[] = ["Governance", "Operations", "Environmental", "Social", "Documentation & Evidence"];

function RoadmapCard({ item }: { item: RoadmapItem }) {
  const [expanded, setExpanded] = useState(false);
  const pConf = PRIORITY_CONFIG[item.priority];
  const sConf = STATUS_CONFIG[item.status];
  const eColor = EVIDENCE_STATUS_CONFIG[item.evidenceStatus] ?? "text-text-tertiary";

  return (
    <div className={cn("rounded-lg border bg-bg-surface transition-shadow hover:shadow-sm", pConf.bg)}>
      {/* Header row */}
      <div className="flex items-start gap-3 p-4">
        <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", pConf.dot)} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide", pConf.color, pConf.bg)}>
              {item.priority}
            </span>
            <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-medium", sConf.color)}>
              {sConf.label}
            </span>
            <span className="rounded-md bg-bg-surface-sunken px-2 py-0.5 text-[11px] text-text-tertiary">
              {item.domain.toUpperCase()}
            </span>
          </div>
          <h3 className="mt-1.5 text-sm font-semibold text-text-primary">{item.title}</h3>
          <p className="mt-1 text-xs text-text-secondary">{item.reason}</p>

          {/* Quick stats row */}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-text-tertiary">
            <span className="flex items-center gap-1">
              <FileText className="size-3" />
              <span className={cn("font-medium", eColor)}>{item.evidenceStatus}</span>
            </span>
            <span className="flex items-center gap-1">
              <User className="size-3" />
              {item.suggestedOwner}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="size-3" />
              {item.estimatedTimeline}
            </span>
            <span className="flex items-center gap-1 font-mono text-[11px]">
              <Zap className="size-3" />
              {item.relatedIndicator}
            </span>
          </div>
        </div>

        <button
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 rounded-md p-1 text-text-tertiary transition-colors hover:bg-bg-surface-sunken hover:text-text-primary"
        >
          {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border-subtle/60 px-4 pb-4 pt-3">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Recommended actions */}
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-tertiary">Recommended Actions</p>
              <ol className="space-y-1">
                {item.recommendedActions.map((a, i) => (
                  <li key={i} className="flex gap-2 text-xs text-text-secondary">
                    <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-accent-primary/10 text-[10px] font-bold text-accent-primary">
                      {i + 1}
                    </span>
                    {a}
                  </li>
                ))}
              </ol>
            </div>

            {/* Expected impact */}
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-tertiary">Expected Impact</p>
              <p className="text-xs text-text-secondary">{item.expectedImpact}</p>

              {/* Supporting evidence */}
              {item.supportingEvidence.length > 0 && (
                <div className="mt-3">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-tertiary">Supporting Evidence</p>
                  <div className="space-y-0.5">
                    {item.supportingEvidence.map((f, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs text-status-verified">
                        <FileText className="size-3" /> {f}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Missing evidence */}
              {item.missingEvidence.length > 0 && (
                <div className="mt-3">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-tertiary">Missing Evidence</p>
                  <div className="space-y-0.5">
                    {item.missingEvidence.map((m, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs text-status-insufficient">
                        <AlertTriangle className="size-3" /> {m}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RoadmapPage() {
  const sites = useAppStore((s) => s.sites);
  const questionnaireFields = useAppStore((s) => s.questionnaireFields);
  const frameworks = useAppStore((s) => s.frameworks);

  const [groupFilter, setGroupFilter] = useState<RoadmapGroup | "All">("All");
  const [priorityFilter, setPriorityFilter] = useState<RoadmapPriority | "All">("All");
  const [domainFilter, setDomainFilter] = useState<"all" | "pwi" | "cdp">("all");
  const [showFilters, setShowFilters] = useState(false);

  const pwiItems = useMemo(() => buildPwiRoadmap(sites, questionnaireFields), [sites, questionnaireFields]);
  const cdpItems = useMemo(() => buildCdpRoadmap(frameworks), [frameworks]);

  const allItems = useMemo(() => {
    const rank: Record<RoadmapPriority, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
    return [...pwiItems, ...cdpItems].sort((a, b) => rank[a.priority] - rank[b.priority]);
  }, [pwiItems, cdpItems]);

  const filtered = allItems.filter((i) => {
    if (domainFilter !== "all" && i.domain !== domainFilter) return false;
    if (groupFilter !== "All" && i.group !== groupFilter) return false;
    if (priorityFilter !== "All" && i.priority !== priorityFilter) return false;
    return true;
  });

  const byGroup = ALL_GROUPS.map((g) => ({
    group: g,
    items: filtered.filter((i) => i.group === g),
  })).filter((g) => g.items.length > 0);

  const critCount = allItems.filter((i) => i.priority === "Critical").length;
  const highCount = allItems.filter((i) => i.priority === "High").length;

  return (
    <div>
      <PageHeader
        title="Improvement Roadmap"
        description="Evidence-grounded recommendations — derived only from uploaded documents and verified data. No fabricated metrics."
      />

      {/* Integrity notice */}
      <div className="mb-5 flex items-start gap-2 rounded-md border border-ai-advisory/30 bg-ai-advisory-bg px-3 py-2.5 text-xs text-text-secondary">
        <Info className="mt-0.5 size-3.5 shrink-0 text-ai-advisory" />
        <span>
          Every recommendation below is derived directly from the actual state of your uploaded evidence and verified PWI/CDP data.
          Where evidence is absent, the status shows <strong className="text-status-insufficient">Insufficient Evidence</strong> — no improvement is invented or estimated without a real data foundation.
        </span>
      </div>

      {/* Summary chips */}
      {allItems.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {critCount > 0 && (
            <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
              {critCount} Critical
            </span>
          )}
          {highCount > 0 && (
            <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-medium text-orange-700">
              {highCount} High Priority
            </span>
          )}
          <span className="rounded-full border border-border-subtle bg-bg-surface-sunken px-3 py-1 text-xs text-text-secondary">
            {allItems.length} total recommendations
          </span>
        </div>
      )}

      {/* Filter bar */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {(["all", "pwi", "cdp"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDomainFilter(d)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium",
                domainFilter === d ? "bg-accent-primary text-white" : "bg-bg-surface-sunken text-text-secondary"
              )}
            >
              {d === "all" ? "All" : d.toUpperCase()}
            </button>
          ))}
        </div>

        <Button size="sm" variant="secondary" onClick={() => setShowFilters((v) => !v)}>
          <Filter className="size-3.5" /> Filters {showFilters ? "▲" : "▼"}
        </Button>

        {(groupFilter !== "All" || priorityFilter !== "All") && (
          <button
            onClick={() => { setGroupFilter("All"); setPriorityFilter("All"); }}
            className="text-xs font-medium text-accent-primary hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {showFilters && (
        <div className="mb-5 flex flex-wrap gap-4 rounded-lg border border-border-subtle bg-bg-surface p-4">
          <div>
            <p className="mb-1.5 text-xs font-medium text-text-tertiary">Priority</p>
            <div className="flex gap-1.5">
              {(["All", "Critical", "High", "Medium", "Low"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPriorityFilter(p)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium",
                    priorityFilter === p ? "bg-accent-primary text-white" : "bg-bg-surface-sunken text-text-secondary hover:text-text-primary"
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-text-tertiary">Group</p>
            <div className="flex flex-wrap gap-1.5">
              {(["All", ...ALL_GROUPS] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setGroupFilter(g)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium",
                    groupFilter === g ? "bg-accent-primary text-white" : "bg-bg-surface-sunken text-text-secondary hover:text-text-primary"
                  )}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          tone="positive"
          icon={CheckCircle2}
          title={allItems.length === 0 ? "Nothing to recommend yet" : "No items match this filter"}
          description={
            allItems.length === 0
              ? "Add sites, upload evidence, and configure PWI baselines to generate evidence-grounded improvement recommendations."
              : "Try adjusting the filter selection above."
          }
        />
      ) : (
        <div className="space-y-8">
          {byGroup.map(({ group, items }) => (
            <div key={group}>
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-xs font-bold uppercase tracking-widest text-text-tertiary">{group}</h2>
                <span className="text-xs text-text-tertiary">({items.length})</span>
                <div className="h-px flex-1 bg-border-subtle" />
              </div>
              <div className="space-y-2.5">
                {items.map((item) => (
                  <RoadmapCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
