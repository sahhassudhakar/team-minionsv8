"use client";

import { useMemo, useState } from "react";
import { Check, X, AlertTriangle, PenLine, ChevronDown, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { QUESTIONNAIRE_FIELD_META } from "@/lib/water-types";
import type { QuestionnaireField } from "@/lib/water-types";

/** Below this, an extraction is flagged for review rather than silently bulk-approved. */
const LOW_CONFIDENCE_THRESHOLD = 0.7;

/**
 * "6. Improve the Evidence Verification Workflow" — replaces one-row-at-a-
 * time modal review with grouped, bulk-capable approval:
 *   - Fields are grouped into the same logical categories the methodology
 *     already uses (Foundational, Availability, Accessibility, Water
 *     Quality) instead of one flat list.
 *   - A checkbox selection model lets a whole section (or a hand-picked
 *     subset) be approved or rejected in ONE request via
 *     bulkValidateQuestionnaireFields / bulkRejectQuestionnaireFields.
 *   - Low-confidence extractions get a visible highlight and are excluded
 *     from "Select all" by default so a bulk click can't silently wave
 *     through something that needs a second look.
 *   - Values are inline-editable before approval — no separate modal trip.
 */
export function EvidenceVerificationPanel({
  fields,
  onBulkValidate,
  onBulkReject,
  onManualEntry,
  onOpenDetail,
}: {
  fields: QuestionnaireField[];
  onBulkValidate: (fieldIds: string[], edits: Record<string, number>) => void;
  onBulkReject: (fieldIds: string[], reason: string) => void;
  onManualEntry: (fieldId: string, value: number) => void;
  onOpenDetail: (field: QuestionnaireField) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectFor, setShowRejectFor] = useState<"selection" | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    const byCategory = new Map<string, QuestionnaireField[]>();
    for (const f of fields) {
      const category = f.status === "awaiting_evidence" ? "Needs Manual Entry" : QUESTIONNAIRE_FIELD_META[f.fieldId]?.category ?? "Other";
      if (!byCategory.has(category)) byCategory.set(category, []);
      byCategory.get(category)!.push(f);
    }
    return Array.from(byCategory.entries());
  }, [fields]);

  const isLowConfidence = (f: QuestionnaireField) => f.confidence != null && f.confidence < LOW_CONFIDENCE_THRESHOLD;
  const autoApprovable = fields.filter((f) => f.status === "proposed" && !isLowConfidence(f));

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGroup = (groupFields: QuestionnaireField[], selectAll: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const f of groupFields) {
        if (f.status === "awaiting_evidence") continue; // these need a value before they can be approved
        if (selectAll) next.add(f.id);
        else next.delete(f.id);
      }
      return next;
    });
  };

  const collectEdits = (ids: string[]): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const id of ids) {
      const raw = edits[id];
      if (raw !== undefined && raw !== "" && !Number.isNaN(Number(raw))) out[id] = Number(raw);
    }
    return out;
  };

  const approveAllAutoApprovable = () => {
    if (autoApprovable.length === 0) return;
    onBulkValidate(autoApprovable.map((f) => f.id), collectEdits(autoApprovable.map((f) => f.id)));
    setSelected((prev) => {
      const next = new Set(prev);
      autoApprovable.forEach((f) => next.delete(f.id));
      return next;
    });
  };

  const approveSelected = () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    onBulkValidate(ids, collectEdits(ids));
    setSelected(new Set());
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border-subtle bg-bg-surface-sunken px-3 py-2.5">
        <p className="text-xs text-text-secondary">
          {fields.length} field(s) awaiting review · {selected.size} selected
          {autoApprovable.length > 0 && <span className="ml-1 text-text-tertiary">· {autoApprovable.length} high-confidence, ready for one-click approval</span>}
        </p>
        <div className="flex flex-wrap gap-2">
          {autoApprovable.length > 0 && (
            <Button size="sm" variant="secondary" onClick={approveAllAutoApprovable}>
              <Check className="size-3.5" /> Approve all high-confidence ({autoApprovable.length})
            </Button>
          )}
          <Button size="sm" onClick={approveSelected} disabled={selected.size === 0}>
            <Check className="size-3.5" /> Approve selected ({selected.size})
          </Button>
          <Button size="sm" variant="ghost" disabled={selected.size === 0} onClick={() => setShowRejectFor("selection")}>
            <X className="size-3.5" /> Reject selected
          </Button>
        </div>
      </div>

      {showRejectFor === "selection" && (
        <div className="space-y-2 rounded-md border border-status-insufficient/30 bg-status-insufficient-bg px-3 py-2.5">
          <label className="text-xs font-medium text-text-secondary">Reason for rejecting {selected.size} field(s) (required)</label>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-border-strong px-2.5 py-1.5 text-sm focus:border-accent-primary focus:outline-none"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructiveSolid"
              disabled={!rejectReason}
              onClick={() => {
                onBulkReject(Array.from(selected), rejectReason);
                setSelected(new Set());
                setRejectReason("");
                setShowRejectFor(null);
              }}
            >
              Reject {selected.size} field(s)
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowRejectFor(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {groups.map(([category, groupFields]) => {
        const isCollapsed = collapsed.has(category);
        const groupSelectableIds = groupFields.filter((f) => f.status !== "awaiting_evidence").map((f) => f.id);
        const allGroupSelected = groupSelectableIds.length > 0 && groupSelectableIds.every((id) => selected.has(id));
        const lowConfCount = groupFields.filter(isLowConfidence).length;

        return (
          <div key={category} className="overflow-hidden rounded-lg border border-border-subtle bg-bg-surface">
            <div className="flex items-center justify-between gap-2 border-b border-border-subtle bg-bg-surface-sunken px-3 py-2">
              <button
                className="flex items-center gap-2 text-left"
                onClick={() =>
                  setCollapsed((prev) => {
                    const next = new Set(prev);
                    if (next.has(category)) next.delete(category);
                    else next.add(category);
                    return next;
                  })
                }
              >
                <ChevronDown className={cn("size-3.5 text-text-tertiary transition-transform", isCollapsed && "-rotate-90")} />
                <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{category}</span>
                <span className="text-xs text-text-tertiary">({groupFields.length})</span>
                {lowConfCount > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-status-insufficient-bg px-2 py-0.5 text-[11px] font-medium text-status-insufficient">
                    <AlertTriangle className="size-3" /> {lowConfCount} low confidence
                  </span>
                )}
              </button>
              {groupSelectableIds.length > 0 && (
                <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <input type="checkbox" checked={allGroupSelected} onChange={(e) => toggleGroup(groupFields, e.target.checked)} />
                  Select section
                </label>
              )}
            </div>

            {!isCollapsed && (
              <div className="divide-y divide-border-subtle">
                {groupFields.map((f) => {
                  const meta = QUESTIONNAIRE_FIELD_META[f.fieldId];
                  const needsManual = f.status === "awaiting_evidence";
                  const lowConf = isLowConfidence(f);
                  const isEditing = editingId === f.id;

                  return (
                    <div
                      key={f.id}
                      className={cn("flex items-center gap-3 px-3 py-2.5", lowConf && "bg-status-insufficient-bg/40")}
                    >
                      {!needsManual && (
                        <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggle(f.id)} className="shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium text-text-primary">{meta.label}</p>
                          {lowConf && (
                            <span className="flex items-center gap-1 rounded-full bg-status-insufficient-bg px-1.5 py-0.5 text-[10px] font-medium text-status-insufficient">
                              <AlertTriangle className="size-2.5" /> Low confidence
                            </span>
                          )}
                        </div>
                        <button onClick={() => onOpenDetail(f)} className="flex items-center gap-1 text-xs text-text-tertiary hover:text-accent-primary hover:underline">
                          <FileText className="size-3" /> {f.evidenceFileName ?? "source document"}
                        </button>
                      </div>

                      <div className="flex shrink-0 items-center gap-3">
                        {needsManual ? (
                          <ManualEntryInline onSave={(v) => onManualEntry(f.id, v)} unit={meta.unit} />
                        ) : isEditing ? (
                          <input
                            autoFocus
                            defaultValue={edits[f.id] ?? String(f.value ?? "")}
                            onChange={(e) => setEdits((prev) => ({ ...prev, [f.id]: e.target.value }))}
                            onBlur={() => setEditingId(null)}
                            type="number"
                            className="w-28 rounded-md border border-accent-primary px-2 py-1 text-sm focus:outline-none"
                          />
                        ) : (
                          <button
                            onClick={() => setEditingId(f.id)}
                            title="Click to edit before approving"
                            className="flex items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold tabular-nums text-text-primary hover:bg-bg-surface-sunken"
                          >
                            {edits[f.id] !== undefined && edits[f.id] !== "" ? Number(edits[f.id]).toLocaleString() : f.value?.toLocaleString()}{" "}
                            <span className="text-xs font-normal text-text-tertiary">{f.unit}</span>
                            <PenLine className="size-3 text-text-tertiary" />
                          </button>
                        )}
                        {!needsManual && (
                          <span className={cn("text-xs tabular-nums", lowConf ? "font-semibold text-status-insufficient" : "text-text-tertiary")}>
                            {f.confidence != null ? `${Math.round(f.confidence * 100)}%` : "—"}
                          </span>
                        )}
                        {!needsManual && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onBulkValidate([f.id], collectEdits([f.id]))}
                            title="Approve this field"
                          >
                            <Check className="size-3.5 text-status-verified" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ManualEntryInline({ onSave, unit }: { onSave: (value: number) => void; unit: string }) {
  const [value, setValue] = useState("");
  return (
    <div className="flex items-center gap-1.5">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        type="number"
        placeholder={`Value (${unit})`}
        className="w-32 rounded-md border border-status-insufficient/40 bg-status-insufficient-bg px-2 py-1 text-sm focus:border-accent-primary focus:outline-none"
      />
      <Button size="sm" variant="secondary" disabled={!value} onClick={() => onSave(Number(value))}>
        Save
      </Button>
    </div>
  );
}
