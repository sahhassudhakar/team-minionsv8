import fs from "fs";
import path from "path";
import crypto from "crypto";
import type {
  EvidenceObject,
  DataPoint,
  Gap,
  Framework,
  FrameworkItem,
  DraftCitation,
  AuditLogEntry,
  UserRole,
  ReportRecord,
} from "@/lib/types";
import type { Site, QuestionnaireField, QuestionnaireFieldId } from "@/lib/water-types";
import { QUESTIONNAIRE_FIELD_META } from "@/lib/water-types";
import { extractFromPdf, extractFromCsv, extractFromDocx, extractFromPptx, extractFromImage, extractFromTextFile, extractXlsxAsCsvText } from "@/lib/extraction";
import {
  extractWaterFieldsFromPdf,
  extractWaterFieldsFromDocx,
  extractWaterFieldsFromPptx,
  extractWaterFieldsFromImage,
  extractWaterFieldsFromXlsx,
  extractWaterFieldsFromTextFile,
  DOCUMENT_CATEGORIES,
} from "@/lib/water-extraction";
import { buildDefaultCdpFramework } from "@/lib/cdp-seed";
import { eligibleEvidenceForAutoLink, scoreEvidenceForItem, buildKeywordWeights, AUTO_LINK_THRESHOLD } from "@/lib/cdp-engine";

/**
 * Real, shared, server-side application state — the whole point of this
 * module. Every device, browser, and role now reads and writes the SAME
 * data file, instead of each browser holding its own localStorage copy.
 * This is the same file-backed pattern as user-store.ts; swapping this for
 * real Postgres later (per the schema already designed for this product)
 * means rewriting the functions in this file only — nothing that calls them
 * needs to change.
 */

export interface AppData {
  evidence: EvidenceObject[];
  dataPoints: DataPoint[];
  gaps: Gap[];
  frameworks: Framework[];
  auditLog: AuditLogEntry[];
  sites: Site[];
  questionnaireFields: QuestionnaireField[];
  reports: ReportRecord[];
}

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "app-data.json");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

function emptyData(): AppData {
  return {
    evidence: [],
    dataPoints: [],
    gaps: [],
    frameworks: [buildDefaultCdpFramework()],
    auditLog: [],
    sites: [],
    questionnaireFields: [],
    reports: [],
  };
}

function id() {
  return Math.random().toString(36).slice(2, 10);
}

// --- Real cross-request mutual exclusion via an OS-level lockfile.
//
// An in-memory Promise-chain mutex is correct in theory but not reliable
// here: Next.js's production server can dispatch concurrent requests onto
// separate worker threads that don't share module-level JS state. Verified
// directly in an earlier round of this project — 5 concurrent uploads kept
// only 1 with an in-memory queue; all 5 survived once switched to this.
//
// `fs.writeFileSync(path, data, { flag: "wx" })` is atomic at the OS level
// (fails if the file already exists) regardless of which thread/process
// calls it. A stale-lock buster guards against a crashed process leaving
// the lock held forever.
const LOCK_FILE = path.join(DATA_DIR, ".lock");
const LOCK_STALE_MS = 15_000;

async function acquireLock(): Promise<void> {
  const start = Date.now();
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  while (true) {
    try {
      fs.writeFileSync(LOCK_FILE, `${process.pid}:${Date.now()}`, { flag: "wx" });
      return;
    } catch {
      try {
        const heldSince = Number(fs.readFileSync(LOCK_FILE, "utf-8").split(":")[1] ?? 0);
        if (Date.now() - heldSince > LOCK_STALE_MS) {
          fs.unlinkSync(LOCK_FILE); // previous holder likely crashed — bust the stale lock
          continue;
        }
      } catch {
        // lock file vanished between the failed create and this read — just retry
      }
      if (Date.now() - start > 20_000) throw new Error("Timed out waiting for the data store lock.");
      await new Promise((r) => setTimeout(r, 15 + Math.random() * 20));
    }
  }
}

function releaseLock(): void {
  try {
    fs.unlinkSync(LOCK_FILE);
  } catch {
    // already gone — fine
  }
}

async function serialize<T>(fn: () => T): Promise<T> {
  await acquireLock();
  try {
    return fn();
  } finally {
    releaseLock();
  }
}

function readData(): AppData {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    const fresh = emptyData();
    fs.writeFileSync(DATA_FILE, JSON.stringify(fresh, null, 2));
    return fresh;
  }
  const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  // Backfill fields added after this data file may have been created —
  // avoids a hard crash for anyone with an existing app-data.json.
  if (!Array.isArray(parsed.reports)) parsed.reports = [];
  return parsed as AppData;
}

function writeData(data: AppData) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

export function getAppData(): AppData {
  return readData();
}

type Actor = { name: string; role: UserRole };

function logAction(data: AppData, entry: Omit<AuditLogEntry, "id" | "timestamp">) {
  data.auditLog.unshift({ id: id(), timestamp: new Date().toISOString(), ...entry });
}

export function ensureDefaultFrameworks(): AppData {
  return serialize(() => {
    const data = readData();
    if (!data.frameworks.some((f) => f.name.toLowerCase().includes("cdp"))) {
      data.frameworks.unshift(buildDefaultCdpFramework());
      writeData(data);
    }
    return data;
  }) as unknown as AppData;
}

export async function logSessionEvent(action: "login" | "logout", actor: Actor & { email: string }): Promise<void> {
  return serialize(() => {
    const data = readData();
    logAction(data, { actorName: actor.name, actorRole: actor.role, action, entityType: "session", entityLabel: actor.email });
    writeData(data);
  });
}

export async function addSite(name: string, basinName: string, actor: Actor): Promise<{ data: AppData; siteId: string }> {
  return serialize(() => {
    const data = readData();
    const siteId = id();
    const site: Site = {
      id: siteId,
      name,
      basinName,
      storeManagerEmail: null,
      baseline: { employeeCount: null, avgFamilySize: null, baselineReplenishmentNeededL: null, setBy: null, setAt: null },
      createdAt: new Date().toISOString(),
    };
    data.sites.push(site);
    logAction(data, { actorName: actor.name, actorRole: actor.role, action: "site_created", entityType: "site", entityLabel: name });
    writeData(data);
    return { data, siteId };
  });
}

export async function setSiteBaseline(
  siteId: string,
  baseline: { employeeCount: number; avgFamilySize: number; baselineReplenishmentNeededL: number },
  actor: Actor
): Promise<AppData> {
  return serialize(() => {
    const data = readData();
    const now = new Date().toISOString();
    data.sites = data.sites.map((s) => (s.id === siteId ? { ...s, baseline: { ...baseline, setBy: actor.name, setAt: now } } : s));
    logAction(data, {
      actorName: actor.name,
      actorRole: actor.role,
      action: "site_baseline_set",
      entityType: "site",
      entityLabel: siteId,
      details: `Employees: ${baseline.employeeCount}, Avg family size: ${baseline.avgFamilySize}, Baseline Replenishment Needed: ${baseline.baselineReplenishmentNeededL} L`,
    });
    writeData(data);
    return data;
  });
}

export async function assignStoreManagerToSite(siteId: string, email: string): Promise<AppData> {
  return serialize(() => {
    const data = readData();
    data.sites = data.sites.map((s) => (s.id === siteId ? { ...s, storeManagerEmail: email } : s));
    writeData(data);
    return data;
  });
}

function guessDocumentType(fileName: string): string {
  const n = fileName.toLowerCase();
  if (n.includes("bill") || n.includes("utility")) return "Utility Bill";
  if (n.includes("invoice")) return "Supplier Invoice";
  if (n.includes("charter") || n.includes("policy") || n.includes("governance")) return "Policy Document";
  if (n.endsWith(".csv") || n.endsWith(".xlsx")) return "Tabular Dataset";
  return "Unclassified";
}

export async function uploadEvidence(
  fileName: string,
  bytes: Uint8Array,
  actor: Actor,
  waterContext?: { siteId: string; categoryId: string },
  adminContext?: { siteId?: string; documentType: string }
): Promise<AppData> {
  const now = new Date().toISOString();
  const evidenceId = id();
  const contentHash = crypto.createHash("sha256").update(bytes).digest("hex");

  // Persist the raw file to local disk (production would use S3/GCS instead;
  // same idea — a durable store the evidenceId can always resolve back to).
  const storedName = `${evidenceId}-${fileName}`;
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOADS_DIR, storedName), bytes);

  // Real dedup: check by actual file content, not filename. If this exact
  // content was already uploaded, skip extraction entirely — no wasted
  // parsing work, no duplicate data points/fields cluttering the validation
  // queue. Fast pre-check here (extraction is expensive); the authoritative
  // check happens again inside the atomic commit below in case another
  // identical upload lands in the meantime.
  const preCheckMatch = readData().evidence.find((e) => e.contentHash === contentHash && e.status !== "duplicate");
  if (preCheckMatch) {
    return serialize(() => {
      const data = readData();
      const stillExists = data.evidence.find((e) => e.contentHash === contentHash && e.status !== "duplicate");
      const evidence: EvidenceObject = {
        id: evidenceId,
        fileName,
        documentType: stillExists?.documentType ?? adminContext?.documentType ?? guessDocumentType(fileName),
        businessUnit: waterContext
          ? data.sites.find((s) => s.id === waterContext.siteId)?.name ?? "Unassigned"
          : adminContext?.siteId
            ? data.sites.find((s) => s.id === adminContext.siteId)?.name ?? "Unassigned"
            : "Unassigned",
        periodStart: now,
        periodEnd: now,
        status: "duplicate",
        uploadedBy: actor.name,
        uploadedAt: now,
        fileSizeKb: Math.round(bytes.byteLength / 1024),
        contentHash,
        duplicateOfEvidenceId: stillExists?.id,
      };
      data.evidence.unshift(evidence);
      logAction(data, {
        actorName: actor.name,
        actorRole: actor.role,
        action: "duplicate_detected",
        entityType: "evidence",
        entityLabel: fileName,
        details: stillExists
          ? `Identical content already uploaded as ${stillExists.fileName} — extraction skipped, no new data points created.`
          : "Identical content already uploaded — extraction skipped.",
      });
      writeData(data);
      return data;
    });
  }

  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  const isPdf = ext === "pdf";
  const isCsv = ext === "csv";
  const isDocx = ext === "docx";
  const isXlsx = ext === "xlsx";
  const isPptx = ext === "pptx";
  const isTxt = ext === "txt";
  const isImage = ["png", "jpg", "jpeg"].includes(ext);

  // Run extraction FIRST — touches no shared state, so safe to run
  // concurrently across uploads. Only the actual commit below (which reads
  // and rewrites app-data.json) needs to be serialized.
  type PendingResult =
    | { kind: "water_ok"; fields: QuestionnaireField[]; rawNote: string }
    | { kind: "water_no_extraction_path" }
    | { kind: "error"; message: string }
    | { kind: "csv_ok"; dataPoints: DataPoint[]; gaps: Gap[] }
    | { kind: "generic_ok"; dataPoints: DataPoint[]; rawNote: string; extractionMethod: DataPoint["extractionMethod"] }
    | { kind: "no_extraction_path" };

  let pending: PendingResult;

  try {
    if (waterContext) {
      if (!isPdf && !isDocx && !isXlsx && !isPptx && !isTxt && !isImage) {
        pending = { kind: "water_no_extraction_path" };
      } else {
        const outcome = isPdf
          ? await extractWaterFieldsFromPdf(bytes, waterContext.categoryId)
          : isDocx
            ? await extractWaterFieldsFromDocx(bytes, waterContext.categoryId)
            : isPptx
              ? await extractWaterFieldsFromPptx(bytes, waterContext.categoryId)
              : isImage
                ? await extractWaterFieldsFromImage(bytes, waterContext.categoryId)
                : isXlsx
                  ? extractWaterFieldsFromXlsx(bytes, waterContext.categoryId)
                  : extractWaterFieldsFromTextFile(bytes, waterContext.categoryId);

        if (outcome.processingError) {
          pending = { kind: "error", message: outcome.processingError };
        } else {
          const fields: QuestionnaireField[] = outcome.fields.map((f) => ({
            id: id(),
            siteId: waterContext.siteId,
            fieldId: f.fieldId,
            value: f.value,
            unit: f.unit,
            status: "proposed",
            evidenceId,
            evidenceFileName: fileName,
            extractionExcerpt: f.excerpt,
            confidence: f.confidence,
            periodStart: now,
            periodEnd: now,
            proposedAt: now,
            validatedBy: null,
            validatedAt: null,
            rejectionReason: null,
          }));
          for (const fid of outcome.needsManualEntryFieldIds) {
            fields.push({
              id: id(),
              siteId: waterContext.siteId,
              fieldId: fid,
              value: null,
              unit: "",
              status: "awaiting_evidence",
              evidenceId,
              evidenceFileName: fileName,
              extractionExcerpt: null,
              confidence: null,
              periodStart: now,
              periodEnd: now,
              proposedAt: now,
              validatedBy: null,
              validatedAt: null,
              rejectionReason: null,
            });
          }
          pending = { kind: "water_ok", fields, rawNote: outcome.rawNote };
        }
      }
    } else if (isCsv || isXlsx) {
      try {
        const text = isCsv ? Buffer.from(bytes).toString("utf-8") : extractXlsxAsCsvText(bytes);
        const { metrics, missingFields } = extractFromCsv(text);
        const dataPoints: DataPoint[] = metrics.map((m) => ({
          id: id(),
          metricName: m.metricName,
          value: m.value,
          unit: m.unit,
          periodStart: now,
          periodEnd: now,
          status: "proposed",
          confidence: m.confidence,
          extractionMethod: "file_parse",
          evidenceId,
          evidenceFileName: fileName,
          verifiedBy: null,
          verifiedAt: null,
        }));
        const gaps: Gap[] = missingFields.map((f) => ({
          id: id(),
          type: "data_gap",
          title: `Missing ${f.context} — ${f.label}`,
          businessUnit: "Unassigned",
          owner: null,
          dueDate: null,
          status: "open",
        }));
        pending = { kind: "csv_ok", dataPoints, gaps };
      } catch (err) {
        pending = { kind: "error", message: err instanceof Error ? err.message : "Unable to read this file as an Excel workbook." };
      }
    } else if (isPdf || isDocx || isPptx || isImage || isTxt) {
      const outcome = isPdf
        ? await extractFromPdf(bytes)
        : isDocx
          ? await extractFromDocx(bytes)
          : isPptx
            ? await extractFromPptx(bytes)
            : isImage
              ? await extractFromImage(bytes)
              : extractFromTextFile(bytes);
      const extractionMethod: DataPoint["extractionMethod"] = isImage ? "ocr" : isPdf ? "ocr" : "file_parse";

      if (outcome.processingError) {
        pending = { kind: "error", message: outcome.processingError };
      } else {
        const dataPoints: DataPoint[] = outcome.metrics.map((m) => ({
          id: id(),
          metricName: m.metricName,
          value: m.value,
          unit: m.unit,
          periodStart: now,
          periodEnd: now,
          status: "proposed",
          confidence: m.confidence,
          extractionMethod,
          evidenceId,
          evidenceFileName: fileName,
          verifiedBy: null,
          verifiedAt: null,
        }));
        if (outcome.needsManualEntry) {
          dataPoints.push({
            id: id(),
            metricName: "Reported Value (low-confidence extraction)",
            value: null,
            unit: null,
            periodStart: now,
            periodEnd: now,
            status: "needs_manual_entry",
            confidence: null,
            extractionMethod,
            evidenceId,
            evidenceFileName: fileName,
            verifiedBy: null,
            verifiedAt: null,
          });
        }
        pending = { kind: "generic_ok", dataPoints, rawNote: outcome.rawNote, extractionMethod };
      }
    } else {
      pending = { kind: "no_extraction_path" };
    }
  } catch (err) {
    pending = { kind: "error", message: err instanceof Error ? err.message : "Unknown processing error" };
  }

  // Single atomic commit: create the evidence record AND apply extraction
  // results in one read-modify-write, so no concurrent upload's write can
  // land in between and clobber this one.
  return serialize(() => {
    const data = readData();

    // Authoritative re-check — another identical upload could have committed
    // between the pre-check above and this lock actually being acquired.
    const raceMatch = data.evidence.find((e) => e.contentHash === contentHash && e.status !== "duplicate");
    if (raceMatch) {
      const evidence: EvidenceObject = {
        id: evidenceId,
        fileName,
        documentType: raceMatch.documentType,
        businessUnit: waterContext
          ? data.sites.find((s) => s.id === waterContext.siteId)?.name ?? "Unassigned"
          : adminContext?.siteId
            ? data.sites.find((s) => s.id === adminContext.siteId)?.name ?? "Unassigned"
            : "Unassigned",
        periodStart: now,
        periodEnd: now,
        status: "duplicate",
        uploadedBy: actor.name,
        uploadedAt: now,
        fileSizeKb: Math.round(bytes.byteLength / 1024),
        contentHash,
        duplicateOfEvidenceId: raceMatch.id,
      };
      data.evidence.unshift(evidence);
      logAction(data, {
        actorName: actor.name,
        actorRole: actor.role,
        action: "duplicate_detected",
        entityType: "evidence",
        entityLabel: fileName,
        details: `Identical content uploaded concurrently as ${raceMatch.fileName} — extraction discarded, no new data points created.`,
      });
      writeData(data);
      return data;
    }

    const evidence: EvidenceObject = {
      id: evidenceId,
      fileName,
      documentType: waterContext
        ? DOCUMENT_CATEGORIES.find((c) => c.id === waterContext.categoryId)?.label ?? guessDocumentType(fileName)
        : adminContext?.documentType ?? guessDocumentType(fileName),
      businessUnit: waterContext
        ? data.sites.find((s) => s.id === waterContext.siteId)?.name ?? "Unassigned"
        : adminContext?.siteId
          ? data.sites.find((s) => s.id === adminContext.siteId)?.name ?? "Unassigned"
          : "Unassigned",
      periodStart: now,
      periodEnd: now,
      status: "queued_for_extraction",
      uploadedBy: actor.name,
      uploadedAt: now,
      fileSizeKb: Math.round(bytes.byteLength / 1024),
      contentHash,
    };
    data.evidence.unshift(evidence);
    logAction(data, {
      actorName: actor.name,
      actorRole: actor.role,
      action: "upload",
      entityType: "evidence",
      entityLabel: fileName,
      details: `${(bytes.byteLength / 1024).toFixed(0)} KB`,
    });

    const setEvidenceStatus = (status: EvidenceObject["status"], processingError?: string) => {
      data.evidence = data.evidence.map((e) => (e.id === evidenceId ? { ...e, status, ...(processingError ? { processingError } : {}) } : e));
    };

    switch (pending.kind) {
      case "water_no_extraction_path":
        setEvidenceStatus("extracted");
        logAction(data, { actorName: actor.name, actorRole: actor.role, action: "extract", entityType: "evidence", entityLabel: fileName, details: "No automated extraction path for this file type — evidence stored for manual reference." });
        break;
      case "water_ok":
        data.questionnaireFields.unshift(...pending.fields);
        setEvidenceStatus("extracted");
        logAction(data, { actorName: actor.name, actorRole: actor.role, action: "extract", entityType: "evidence", entityLabel: fileName, details: `${pending.rawNote} (${pending.fields.length} questionnaire field(s) proposed)` });
        break;
      case "csv_ok":
        data.dataPoints.unshift(...pending.dataPoints);
        data.gaps.unshift(...pending.gaps);
        setEvidenceStatus("extracted");
        logAction(data, { actorName: actor.name, actorRole: actor.role, action: "extract", entityType: "evidence", entityLabel: fileName, details: `${pending.dataPoints.length} data point(s) extracted, ${pending.gaps.length} gap(s) raised for missing fields` });
        break;
      case "generic_ok":
        data.dataPoints.unshift(...pending.dataPoints);
        setEvidenceStatus("extracted");
        logAction(data, { actorName: actor.name, actorRole: actor.role, action: "extract", entityType: "evidence", entityLabel: fileName, details: pending.rawNote });
        break;
      case "no_extraction_path":
        setEvidenceStatus("extracted");
        logAction(data, { actorName: actor.name, actorRole: actor.role, action: "extract", entityType: "evidence", entityLabel: fileName, details: "No automated extraction path for this file type in this build." });
        break;
      case "error":
        setEvidenceStatus("rejected", pending.message);
        logAction(data, { actorName: actor.name, actorRole: actor.role, action: "processing_failed", entityType: "evidence", entityLabel: fileName, details: pending.message });
        break;
    }

    // Trigger: "New evidence is uploaded" — reconcile CDP auto-links in the
    // same atomic commit as the upload itself.
    autoLinkEvidenceForCdp(data, actor);
    data.frameworks = recomputeFrameworks(data.frameworks, data.dataPoints);

    writeData(data);
    return data;
  });
}


export async function verifyDataPoint(dpId: string, actor: Actor, correctedValue: number | undefined): Promise<AppData> {
  return serialize(() => {
    const data = readData();
    const now = new Date().toISOString();
    data.dataPoints = data.dataPoints.map((d) =>
      d.id === dpId ? { ...d, status: "verified", value: correctedValue ?? d.value, verifiedBy: actor.name, verifiedAt: now } : d
    );
    const dp = data.dataPoints.find((d) => d.id === dpId);
    logAction(data, {
      actorName: actor.name,
      actorRole: actor.role,
      action: "verify",
      entityType: "data_point",
      entityLabel: dp?.metricName ?? dpId,
      details: correctedValue != null ? `Corrected to ${correctedValue}` : undefined,
    });
    writeData(data);
    return data;
  });
}

export async function rejectDataPoint(dpId: string, actor: Actor, reason: string): Promise<AppData> {
  return serialize(() => {
    const data = readData();
    data.dataPoints = data.dataPoints.map((d) => (d.id === dpId ? { ...d, status: "rejected" } : d));
    const dp = data.dataPoints.find((d) => d.id === dpId);
    logAction(data, {
      actorName: actor.name,
      actorRole: actor.role,
      action: "reject",
      entityType: "data_point",
      entityLabel: dp?.metricName ?? dpId,
      details: reason,
    });
    writeData(data);
    return data;
  });
}

export async function saveManualEntry(dpId: string, value: number, unit: string, actor: Actor): Promise<AppData> {
  return serialize(() => {
    const data = readData();
    const now = new Date().toISOString();
    data.dataPoints = data.dataPoints.map((d) =>
      d.id === dpId
        ? { ...d, value, unit, status: "verified", extractionMethod: "manual_entry", verifiedBy: actor.name, verifiedAt: now }
        : d
    );
    logAction(data, { actorName: actor.name, actorRole: actor.role, action: "manual_entry", entityType: "data_point", entityLabel: dpId, details: `${value} ${unit}` });
    writeData(data);
    return data;
  });
}

export async function validateQuestionnaireField(fieldId: string, actor: Actor, correctedValue?: number): Promise<AppData> {
  return serialize(() => {
    const data = readData();
    const now = new Date().toISOString();
    data.questionnaireFields = data.questionnaireFields.map((f) =>
      f.id === fieldId ? { ...f, value: correctedValue ?? f.value, status: "verified", validatedBy: actor.name, validatedAt: now } : f
    );
    const field = data.questionnaireFields.find((f) => f.id === fieldId);
    logAction(data, {
      actorName: actor.name,
      actorRole: actor.role,
      action: "pwi_field_validated",
      entityType: "questionnaire_field",
      entityLabel: field?.fieldId ?? fieldId,
      details: correctedValue != null ? `Corrected to ${correctedValue} ${field?.unit ?? ""}`.trim() : field ? `${field.value} ${field.unit}` : undefined,
    });
    writeData(data);
    return data;
  });
}

/**
 * "6. Improve the Evidence Verification Workflow" — approve/reject a whole
 * group of fields (e.g. a category section) in one call instead of N
 * separate round trips, so a bulk "Approve section" click is one write, not
 * one write per row. `edits` carries any inline corrections made before
 * approval, keyed by field id — same semantics as the single-field
 * `correctedValue` above, just applied to many rows atomically.
 */
export async function bulkValidateQuestionnaireFields(fieldIds: string[], actor: Actor, edits?: Record<string, number>): Promise<AppData> {
  return serialize(() => {
    const data = readData();
    const now = new Date().toISOString();
    const idSet = new Set(fieldIds);
    data.questionnaireFields = data.questionnaireFields.map((f) =>
      idSet.has(f.id) ? { ...f, value: edits?.[f.id] ?? f.value, status: "verified", validatedBy: actor.name, validatedAt: now } : f
    );
    logAction(data, {
      actorName: actor.name,
      actorRole: actor.role,
      action: "pwi_bulk_validated",
      entityType: "questionnaire_field",
      entityLabel: `${fieldIds.length} field(s)`,
      details: edits && Object.keys(edits).length > 0 ? `${Object.keys(edits).length} corrected before approval` : undefined,
    });
    writeData(data);
    return data;
  });
}

export async function bulkRejectQuestionnaireFields(fieldIds: string[], actor: Actor, reason: string): Promise<AppData> {
  return serialize(() => {
    const data = readData();
    const idSet = new Set(fieldIds);
    data.questionnaireFields = data.questionnaireFields.map((f) => (idSet.has(f.id) ? { ...f, status: "rejected", rejectionReason: reason } : f));
    logAction(data, {
      actorName: actor.name,
      actorRole: actor.role,
      action: "pwi_bulk_rejected",
      entityType: "questionnaire_field",
      entityLabel: `${fieldIds.length} field(s)`,
      details: reason,
    });
    writeData(data);
    return data;
  });
}

export async function rejectQuestionnaireField(fieldId: string, actor: Actor, reason: string): Promise<AppData> {
  return serialize(() => {
    const data = readData();
    data.questionnaireFields = data.questionnaireFields.map((f) =>
      f.id === fieldId ? { ...f, status: "rejected", rejectionReason: reason } : f
    );
    const field = data.questionnaireFields.find((f) => f.id === fieldId);
    logAction(data, {
      actorName: actor.name,
      actorRole: actor.role,
      action: "pwi_field_rejected",
      entityType: "questionnaire_field",
      entityLabel: field?.fieldId ?? fieldId,
      details: reason,
    });
    writeData(data);
    return data;
  });
}

export async function saveQuestionnaireFieldManually(fieldId: string, value: number, actor: Actor): Promise<AppData> {
  return serialize(() => {
    const data = readData();
    const now = new Date().toISOString();
    data.questionnaireFields = data.questionnaireFields.map((f) =>
      f.id === fieldId
        ? { ...f, value, unit: QUESTIONNAIRE_FIELD_META[f.fieldId as QuestionnaireFieldId].unit, status: "verified", validatedBy: actor.name, validatedAt: now }
        : f
    );
    logAction(data, { actorName: actor.name, actorRole: actor.role, action: "pwi_field_manual_entry", entityType: "questionnaire_field", entityLabel: fieldId, details: `${value}` });
    writeData(data);
    return data;
  });
}

export async function addFramework(name: string, version: string, actor: Actor): Promise<{ data: AppData; frameworkId: string }> {
  return serialize(() => {
    const data = readData();
    const frameworkId = id();
    const framework: Framework = { id: frameworkId, name, version, items: [] };
    data.frameworks.push(framework);
    logAction(data, { actorName: actor.name, actorRole: actor.role, action: "framework_configured", entityType: "framework", entityLabel: `${name} ${version}` });
    writeData(data);
    return { data, frameworkId };
  });
}

export async function addFrameworkItem(
  frameworkId: string,
  item: Omit<FrameworkItem, "id" | "status" | "linkedDataPointIds" | "linkedEvidenceIds" | "draftAnswer" | "draftCitations" | "draftApprovedBy" | "draftApprovedAt">,
  actor: Actor
): Promise<AppData> {
  return serialize(() => {
    const data = readData();
    data.frameworks = data.frameworks.map((f) =>
      f.id === frameworkId
        ? {
            ...f,
            items: [
              ...f.items,
              {
                ...item,
                id: id(),
                status: "unmapped",
                linkedDataPointIds: [],
                linkedEvidenceIds: [],
                requiredEvidenceHint: (item as { requiredEvidenceHint?: string }).requiredEvidenceHint ?? "",
                draftAnswer: null,
                draftCitations: null,
                draftApprovedBy: null,
                draftApprovedAt: null,
              },
            ],
          }
        : f
    );
    logAction(data, { actorName: actor.name, actorRole: actor.role, action: "framework_item_added", entityType: "framework", entityLabel: item.code });
    writeData(data);
    return data;
  });
}

function computeItemStatus(item: FrameworkItem, dataPoints: DataPoint[]): FrameworkItem["status"] {
  if (item.draftApprovedBy) return "ready";
  const linkedDPs = item.linkedDataPointIds.map((did) => dataPoints.find((d) => d.id === did)).filter(Boolean) as DataPoint[];
  if (linkedDPs.some((d) => d.status === "verified")) return "ready";
  if (linkedDPs.length > 0 || (item.linkedEvidenceIds?.length ?? 0) > 0) return "pending";
  return "unmapped";
}
function recomputeFrameworks(frameworks: Framework[], dataPoints: DataPoint[]): Framework[] {
  return frameworks.map((f) => ({ ...f, items: f.items.map((it) => ({ ...it, status: computeItemStatus(it, dataPoints) })) }));
}

/**
 * "4. Automatically Link Existing Evidence" — mutates `data.frameworks` in
 * place (CDP framework(s) only) so that any evidence already satisfying a
 * question gets cited without a human ever opening the "Link evidence"
 * modal. Runs at every trigger the spec calls for: new upload, evidence
 * library change, report generation, and questionnaire open (see call
 * sites: uploadEvidence, generateCdpReport, and the GET /api/data route).
 *
 * Rules mirrored from the spec:
 *  - One document can satisfy multiple questions (no "claim" exclusivity —
 *    the same evidence id can be pushed onto many items' linkedEvidenceIds).
 *  - Never relies on filename alone (see cdp-engine's scoring weights).
 *  - Never re-attaches evidence a human explicitly unlinked
 *    (FrameworkItem.excludedFromAutoLink).
 *  - Never silently overwrites — it only ever ADDS to linkedEvidenceIds;
 *    approved drafts are invalidated the same way a manual link would
 *    invalidate them (new evidence changes what the draft should say), but
 *    only when something genuinely new was attached this pass, so a
 *    no-op reconciliation (e.g. on every page load) never clobbers an
 *    Admin's approval.
 *
 * Returns the count of newly-created (item, evidence) links, for logging.
 */
function autoLinkEvidenceForCdp(data: AppData, actor: Actor): number {
  const eligible = eligibleEvidenceForAutoLink(data.evidence);
  let linksAdded = 0;

  data.frameworks = data.frameworks.map((f) => {
    if (!f.name.toLowerCase().includes("cdp")) return f;
    const keywordWeights = buildKeywordWeights(f);
    return {
      ...f,
      items: f.items.map((item) => {
        const already = new Set(item.linkedEvidenceIds);
        const excluded = new Set(item.excludedFromAutoLink ?? []);
        const newlyLinked: string[] = [];
        const newlyLinkedReasons: string[] = [];

        for (const ev of eligible) {
          if (already.has(ev.id) || excluded.has(ev.id)) continue;
          const { score, reasons } = scoreEvidenceForItem(item, ev, data.dataPoints, data.questionnaireFields, keywordWeights);
          if (score >= AUTO_LINK_THRESHOLD) {
            newlyLinked.push(ev.id);
            newlyLinkedReasons.push(`${ev.fileName} (${reasons.join("; ")})`);
          }
        }

        if (newlyLinked.length === 0) return item;
        linksAdded += newlyLinked.length;
        logAction(data, {
          actorName: actor.name,
          actorRole: actor.role,
          action: "auto_link_evidence",
          entityType: "framework",
          entityLabel: item.code,
          details: `Automatically attached ${newlyLinked.length} document(s): ${newlyLinkedReasons.join(" | ")}`,
        });
        return {
          ...item,
          linkedEvidenceIds: [...item.linkedEvidenceIds, ...newlyLinked],
          autoLinkedEvidenceIds: [...(item.autoLinkedEvidenceIds ?? []), ...newlyLinked],
          // Same rule as a manual link: new cited evidence invalidates any
          // existing draft/approval so it can't go stale silently.
          draftAnswer: null,
          draftCitations: null,
          draftApprovedBy: null,
          draftApprovedAt: null,
        };
      }),
    };
  });

  return linksAdded;
}

/** System actor used when auto-linking runs off a passive trigger (page load) rather than a specific person's action. */
const SYSTEM_ACTOR: Actor = { name: "System (auto-link)", role: "admin" };

/**
 * Public entry point for the passive triggers — "evidence library changes"
 * and "a questionnaire is opened" — that aren't already inside another
 * serialize()'d mutation. Safe/cheap to call on every GET: it's a no-op
 * write when nothing new matches.
 */
export async function reconcileCdpAutoLinks(actor: Actor = SYSTEM_ACTOR): Promise<AppData> {
  return serialize(() => {
    const data = readData();
    const added = autoLinkEvidenceForCdp(data, actor);
    if (added > 0) {
      data.frameworks = recomputeFrameworks(data.frameworks, data.dataPoints);
      writeData(data);
    }
    return data;
  });
}

export async function linkDataPointToItem(frameworkId: string, itemId: string, dataPointId: string, actor: Actor): Promise<AppData> {
  return serialize(() => {
    const data = readData();
    data.frameworks = data.frameworks.map((f) =>
      f.id === frameworkId
        ? { ...f, items: f.items.map((it) => (it.id === itemId && !it.linkedDataPointIds.includes(dataPointId) ? { ...it, linkedDataPointIds: [...it.linkedDataPointIds, dataPointId] } : it)) }
        : f
    );
    data.frameworks = recomputeFrameworks(data.frameworks, data.dataPoints);
    const dp = data.dataPoints.find((d) => d.id === dataPointId);
    const item = data.frameworks.find((f) => f.id === frameworkId)?.items.find((i) => i.id === itemId);
    logAction(data, { actorName: actor.name, actorRole: actor.role, action: "map_evidence", entityType: "framework", entityLabel: item?.code ?? itemId, details: `Linked data point: ${dp?.metricName ?? dataPointId}` });
    writeData(data);
    return data;
  });
}

export async function unlinkDataPointFromItem(frameworkId: string, itemId: string, dataPointId: string, actor: Actor): Promise<AppData> {
  return serialize(() => {
    const data = readData();
    data.frameworks = data.frameworks.map((f) =>
      f.id === frameworkId ? { ...f, items: f.items.map((it) => (it.id === itemId ? { ...it, linkedDataPointIds: it.linkedDataPointIds.filter((d) => d !== dataPointId) } : it)) } : f
    );
    data.frameworks = recomputeFrameworks(data.frameworks, data.dataPoints);
    logAction(data, { actorName: actor.name, actorRole: actor.role, action: "unmap_evidence", entityType: "framework", entityLabel: itemId });
    writeData(data);
    return data;
  });
}

export async function linkEvidenceToItem(frameworkId: string, itemId: string, evidenceId: string, actor: Actor): Promise<AppData> {
  return serialize(() => {
    const data = readData();
    data.frameworks = data.frameworks.map((f) =>
      f.id === frameworkId
        ? {
            ...f,
            items: f.items.map((it) =>
              it.id === itemId && !it.linkedEvidenceIds.includes(evidenceId)
                ? { ...it, linkedEvidenceIds: [...it.linkedEvidenceIds, evidenceId], draftAnswer: null, draftCitations: null, draftApprovedBy: null, draftApprovedAt: null }
                : it
            ),
          }
        : f
    );
    data.frameworks = recomputeFrameworks(data.frameworks, data.dataPoints);
    const ev = data.evidence.find((e) => e.id === evidenceId);
    const item = data.frameworks.find((f) => f.id === frameworkId)?.items.find((i) => i.id === itemId);
    logAction(data, {
      actorName: actor.name,
      actorRole: actor.role,
      action: "cite_evidence",
      entityType: "framework",
      entityLabel: item?.code ?? itemId,
      details: `Cited evidence: ${ev?.fileName ?? evidenceId}`,
    });
    writeData(data);
    return data;
  });
}

export async function unlinkEvidenceFromItem(frameworkId: string, itemId: string, evidenceId: string, actor: Actor): Promise<AppData> {
  return serialize(() => {
    const data = readData();
    data.frameworks = data.frameworks.map((f) =>
      f.id === frameworkId
        ? {
            ...f,
            items: f.items.map((it) =>
              it.id === itemId
                ? {
                    ...it,
                    linkedEvidenceIds: it.linkedEvidenceIds.filter((e) => e !== evidenceId),
                    autoLinkedEvidenceIds: (it.autoLinkedEvidenceIds ?? []).filter((e) => e !== evidenceId),
                    // A human explicitly removed this citation — auto-link must not silently re-add it on the next upload/report/open.
                    excludedFromAutoLink: Array.from(new Set([...(it.excludedFromAutoLink ?? []), evidenceId])),
                    draftAnswer: null,
                    draftCitations: null,
                    draftApprovedBy: null,
                    draftApprovedAt: null,
                  }
                : it
            ),
          }
        : f
    );
    data.frameworks = recomputeFrameworks(data.frameworks, data.dataPoints);
    logAction(data, { actorName: actor.name, actorRole: actor.role, action: "uncite_evidence", entityType: "framework", entityLabel: itemId });
    writeData(data);
    return data;
  });
}

/**
 * Deterministically assembles a draft answer from ONLY the real data tied to
 * the item's cited evidence — no generative model is involved (this app has
 * no LLM integration), so nothing here is invented prose. It cites real
 * filenames and real extracted values (from data points / questionnaire
 * fields whose evidenceId matches a cited document). Evidence with no
 * structured data (e.g. a narrative policy PDF) is cited by name only, with
 * an explicit note that a person should review it directly — the system
 * does not attempt to summarize text it hasn't actually parsed.
 *
 * The result is a DraftCitation PER cited document — a real "response, then
 * its source" pair — rather than one run-on paragraph with every filename
 * dumped at the end. draftAnswer is kept in lockstep as a flat string purely
 * for callers that only need a truthy "a draft exists" check (roadmap
 * readiness); the UI itself renders draftCitations.
 */
export async function generateDraftAnswer(frameworkId: string, itemId: string, actor: Actor): Promise<AppData> {
  return serialize(() => {
    const data = readData();
    const framework = data.frameworks.find((f) => f.id === frameworkId);
    const item = framework?.items.find((i) => i.id === itemId);
    if (!framework || !item) return data;

    if (item.linkedEvidenceIds.length === 0) {
      logAction(data, { actorName: actor.name, actorRole: actor.role, action: "draft_generation_skipped", entityType: "framework", entityLabel: item.code, details: "No cited evidence" });
      writeData(data);
      return data;
    }

    const citations: DraftCitation[] = [];

    for (const evId of item.linkedEvidenceIds) {
      const ev = data.evidence.find((e) => e.id === evId);
      if (!ev) continue;

      const relatedDataPoints = data.dataPoints.filter((d) => d.evidenceId === evId && d.status === "verified");
      const relatedFields = data.questionnaireFields.filter((f) => f.evidenceId === evId && f.status === "verified");

      const statement =
        relatedDataPoints.length === 0 && relatedFields.length === 0
          ? `Cited as supporting narrative evidence (${ev.documentType}) — no structured value was extracted from it; review the source document directly.`
          : [
              ...relatedDataPoints.map((d) => `${d.metricName}: ${d.value} ${d.unit ?? ""}`.trim()),
              ...relatedFields.map((f) => `${QUESTIONNAIRE_FIELD_META[f.fieldId].label}: ${f.value} ${f.unit}`.trim()),
            ].join("; ") + ".";

      citations.push({ statement, evidenceId: ev.id, fileName: ev.fileName });
    }

    const draftCitations = citations.length > 0 ? citations : null;
    const draft = draftCitations ? draftCitations.map((c) => `${c.statement} [${c.fileName}]`).join(" ") : null;

    data.frameworks = data.frameworks.map((f) =>
      f.id === frameworkId
        ? {
            ...f,
            items: f.items.map((it) =>
              it.id === itemId ? { ...it, draftAnswer: draft, draftCitations, draftApprovedBy: null, draftApprovedAt: null } : it
            ),
          }
        : f
    );
    // Regenerating always clears any existing approval above — recompute
    // status here too, so an item that was "Ready" purely because of that
    // approval correctly falls back to "pending" instead of showing a stale
    // Ready badge over an unapproved draft.
    data.frameworks = recomputeFrameworks(data.frameworks, data.dataPoints);
    logAction(data, { actorName: actor.name, actorRole: actor.role, action: "draft_generated", entityType: "framework", entityLabel: item.code });
    writeData(data);
    return data;
  });
}

export async function approveDraftAnswer(frameworkId: string, itemId: string, actor: Actor): Promise<AppData> {
  return serialize(() => {
    const data = readData();
    const now = new Date().toISOString();
    data.frameworks = data.frameworks.map((f) =>
      f.id === frameworkId
        ? { ...f, items: f.items.map((it) => (it.id === itemId ? { ...it, draftApprovedBy: actor.name, draftApprovedAt: now } : it)) }
        : f
    );
    data.frameworks = recomputeFrameworks(data.frameworks, data.dataPoints);
    const item = data.frameworks.find((f) => f.id === frameworkId)?.items.find((i) => i.id === itemId);
    logAction(data, { actorName: actor.name, actorRole: actor.role, action: "draft_approved", entityType: "framework", entityLabel: item?.code ?? itemId });
    writeData(data);
    return data;
  });
}

/**
 * "11. Separate Report Sections" — reports are generated client-side (pure
 * HTML string builders already exist for PWI in reports/page.tsx and now
 * for CDP in cdp-report.ts) but PERSISTED here so the Reports page can list,
 * search, filter, and re-open past reports across sessions instead of a
 * report only existing in one browser tab until it's closed.
 */
export async function saveReport(
  kind: ReportRecord["kind"],
  title: string,
  html: string,
  summary: Record<string, string>,
  actor: Actor,
  replaceId?: string
): Promise<{ data: AppData; reportId: string }> {
  return serialize(() => {
    const data = readData();
    const reportId = replaceId ?? id();
    const now = new Date().toISOString();
    const record: ReportRecord = {
      id: reportId,
      kind,
      title,
      status: "generated",
      generatedAt: now,
      generatedBy: actor.name,
      html,
      summary,
    };
    if (replaceId && data.reports.some((r) => r.id === replaceId)) {
      data.reports = data.reports.map((r) => (r.id === replaceId ? record : r));
    } else {
      data.reports.unshift(record);
    }
    logAction(data, {
      actorName: actor.name,
      actorRole: actor.role,
      action: replaceId ? "report_regenerated" : "report_generated",
      entityType: "report",
      entityLabel: title,
      details: `${kind.toUpperCase()} assessment report`,
    });
    writeData(data);
    return { data, reportId };
  });
}

export async function deleteReport(reportId: string, actor: Actor): Promise<AppData> {
  return serialize(() => {
    const data = readData();
    const report = data.reports.find((r) => r.id === reportId);
    data.reports = data.reports.filter((r) => r.id !== reportId);
    logAction(data, { actorName: actor.name, actorRole: actor.role, action: "report_deleted", entityType: "report", entityLabel: report?.title ?? reportId });
    writeData(data);
    return data;
  });
}

export async function resolveGap(gapId: string, actor: Actor): Promise<AppData> {
  return serialize(() => {
    const data = readData();
    data.gaps = data.gaps.map((g) => (g.id === gapId ? { ...g, status: "resolved" } : g));
    logAction(data, { actorName: actor.name, actorRole: actor.role, action: "resolve", entityType: "gap", entityLabel: gapId });
    writeData(data);
    return data;
  });
}

export async function resetDemoData(): Promise<AppData> {
  return serialize(() => {
    const fresh = emptyData();
    writeData(fresh);
    return fresh;
  });
}
