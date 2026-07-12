// Domain types mirror the evidence-first schema. A value can only exist here
// if it is attached to a source — there is no "value" field anywhere in this
// file that doesn't sit next to its provenance.

export type EvidenceStatus =
  | "uploaded"
  | "queued_for_extraction"
  | "extracted"
  | "verified"
  | "rejected"
  | "archived"
  | "duplicate";

export type DataPointStatus =
  | "proposed"
  | "verified"
  | "rejected"
  | "superseded"
  | "needs_manual_entry";

export interface EvidenceObject {
  id: string;
  fileName: string;
  documentType: string;
  businessUnit: string;
  periodStart: string;
  periodEnd: string;
  status: EvidenceStatus;
  uploadedBy: string;
  uploadedAt: string;
  fileSizeKb: number;
  /** Set only when automated processing genuinely failed (e.g. corrupt/unreadable file). */
  processingError?: string;
  /** SHA-256 of the raw file bytes — real dedup, not filename matching. */
  contentHash: string;
  /** Set when this upload's content hash matches an existing evidence item — points to the original. */
  duplicateOfEvidenceId?: string;
}

export interface DataPoint {
  id: string;
  metricName: string;
  value: number | null;
  unit: string | null;
  periodStart: string;
  periodEnd: string;
  status: DataPointStatus;
  confidence: number | null; // 0-1, null if manual entry
  extractionMethod: "ocr" | "manual_entry" | "api_import" | "file_parse";
  evidenceId: string;
  evidenceFileName: string;
  verifiedBy: string | null;
  verifiedAt: string | null;
}

export type GapType = "data_gap" | "performance_gap";
export type GapStatus = "open" | "in_progress" | "escalated" | "resolved";

export interface Gap {
  id: string;
  type: GapType;
  title: string;
  businessUnit: string;
  owner: string | null;
  dueDate: string | null;
  status: GapStatus;
}

/**
 * A calculated result is either a real number derived from verified inputs,
 * or an explicit "not calculable" state with the reason. There is no third
 * option — the UI must never render a blank or a zero standing in for either.
 */
export type CalculationResult =
  | { calculable: true; value: number; asOf: string; inputsUsed: number; inputsRequired: number }
  | { calculable: false; reason: "insufficient_data" | "no_evidence_uploaded"; missing: string[] };

/**
 * One evidence-derived statement inside a draft answer, paired with the
 * single source it came from. A draft answer is an ORDERED LIST of these —
 * one per cited document — never a single run-on paragraph, so a reviewer
 * can see exactly which fact came from which file at a glance.
 */
export interface DraftCitation {
  /** Deterministically assembled from real data — never invented prose. */
  statement: string;
  evidenceId: string;
  fileName: string;
}

export interface FrameworkItem {
  id: string;
  code: string;
  module: string;
  text: string;
  status: "unmapped" | "pending" | "ready";
  /** Data points linked as supporting evidence for this item — the actual mapping. */
  linkedDataPointIds: string[];
  /** Evidence documents cited generally (e.g. narrative/policy docs with no structured data point). */
  linkedEvidenceIds: string[];
  /** Subset of linkedEvidenceIds that were attached automatically (see cdp-engine.ts) rather than by a human — drives the "Auto-attached" badge and lets it stay distinguishable from a manually confirmed citation. */
  autoLinkedEvidenceIds?: string[];
  /** Evidence ids a human explicitly unlinked from this item — excluded from future auto-link passes so an unlink sticks instead of being silently re-applied on the next upload/report/open. */
  excludedFromAutoLink?: string[];
  /** What kind of document would satisfy this item — shown in the "upload evidence" alert. */
  requiredEvidenceHint: string;
  /** Deterministically assembled from real linked evidence — never invented. Null until evidence is linked. Kept as a flat string for callers (e.g. roadmap readiness checks) that only need to know a draft exists. */
  draftAnswer: string | null;
  /** The structured, source-attributed form of draftAnswer that the UI renders — one entry per cited document. Always regenerated together with draftAnswer so the two never drift apart. */
  draftCitations: DraftCitation[] | null;
  /** Set once an Admin has reviewed and approved the draft as the item's answer. */
  draftApprovedBy: string | null;
  draftApprovedAt: string | null;
}

export interface Framework {
  id: string;
  name: string;
  version: string;
  items: FrameworkItem[];
}

export interface AdvisoryRecommendation {
  id: string;
  text: string;
  basedOn: string; // e.g. "Gap Analysis dated Jul 10, 2026"
  relatedGapIds: string[];
}

export type ReportKind = "pwi" | "cdp";

/**
 * A persisted, generated report — the "PWI Assessment Reports" / "CDP
 * Assessment Reports" list on the Reports page reads from these instead of
 * a report only existing transiently in one browser tab's state.
 */
export interface ReportRecord {
  id: string;
  kind: ReportKind;
  title: string;
  status: "generated" | "failed";
  generatedAt: string;
  generatedBy: string;
  /** Full, self-contained report HTML — what Preview/Download render. */
  html: string;
  /** Small set of headline stats shown in the list row without opening the report (e.g. portfolio score, predicted CDP band). */
  summary: Record<string, string>;
}

export type UserRole = "admin" | "auditor" | "store_manager";

export interface AuthUser {
  email: string;
  name: string;
  role: UserRole;
  siteId: string | null;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorName: string;
  actorRole: UserRole;
  action: string; // e.g. "upload", "verify", "reject", "login", "logout", "framework_configured"
  entityType: string; // "evidence" | "data_point" | "gap" | "framework" | "session"
  entityLabel: string; // human-readable reference, e.g. a file name or metric name
  details?: string;
}
