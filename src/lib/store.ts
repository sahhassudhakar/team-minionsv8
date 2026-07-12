"use client";

import { create } from "zustand";
import type {
  EvidenceObject,
  DataPoint,
  Gap,
  Framework,
  FrameworkItem,
  AuditLogEntry,
  ReportRecord,
} from "./types";
import type { Site, QuestionnaireField } from "./water-types";

/**
 * Thin client-side cache of the real, server-side, file-backed application
 * state (see src/lib/server/data-store.ts). Nothing here is persisted to
 * localStorage anymore — every mutation is a real HTTP call to the server,
 * and the resulting state is shared across every browser/device/session,
 * not just the one that made the change.
 */

interface AppDataShape {
  evidence: EvidenceObject[];
  dataPoints: DataPoint[];
  gaps: Gap[];
  frameworks: Framework[];
  auditLog: AuditLogEntry[];
  sites: Site[];
  questionnaireFields: QuestionnaireField[];
  reports: ReportRecord[];
}

type Actor = { name: string; role: string };

interface AppState extends AppDataShape {
  loaded: boolean;
  fetchAll: () => Promise<void>;

  ensureDefaultFrameworks: () => void; // no-op client-side now; server seeds on GET

  addSite: (name: string, basinName: string, actor: Actor) => Promise<string>;
  setSiteBaseline: (
    siteId: string,
    baseline: { employeeCount: number; avgFamilySize: number; baselineReplenishmentNeededL: number },
    actor: Actor
  ) => Promise<void>;
  assignStoreManagerToSite: (siteId: string, email: string) => void; // handled server-side during user creation; kept as a no-op for API-compat

  /** categoryIds, when present, must be the same length as files — categoryIds[i] is the document category for files[i]. */
  uploadEvidence: (
    files: File[],
    actor: Actor,
    waterContext?: { siteId: string; categoryIds: string[] },
    adminContext?: { siteId: string; documentTypes: string[] }
  ) => Promise<void>;

  verifyDataPoint: (id: string, actor: Actor, correctedValue?: number) => Promise<void>;
  rejectDataPoint: (id: string, actor: Actor, reason: string) => Promise<void>;
  saveManualEntry: (id: string, value: number, unit: string, actor: Actor) => Promise<void>;

  validateQuestionnaireField: (fieldId: string, actor: Actor, correctedValue?: number) => Promise<void>;
  rejectQuestionnaireField: (fieldId: string, actor: Actor, reason: string) => Promise<void>;
  saveQuestionnaireFieldManually: (fieldId: string, value: number, actor: Actor) => Promise<void>;
  bulkValidateQuestionnaireFields: (fieldIds: string[], actor: Actor, edits?: Record<string, number>) => Promise<void>;
  bulkRejectQuestionnaireFields: (fieldIds: string[], actor: Actor, reason: string) => Promise<void>;

  addFramework: (name: string, version: string, actor: Actor) => Promise<string>;
  addFrameworkItem: (
    frameworkId: string,
    item: Omit<FrameworkItem, "id" | "status" | "linkedDataPointIds" | "linkedEvidenceIds" | "draftAnswer" | "draftCitations" | "draftApprovedBy" | "draftApprovedAt">,
    actor: Actor
  ) => Promise<void>;
  linkDataPointToItem: (frameworkId: string, itemId: string, dataPointId: string, actor: Actor) => Promise<void>;
  unlinkDataPointFromItem: (frameworkId: string, itemId: string, dataPointId: string, actor: Actor) => Promise<void>;
  linkEvidenceToItem: (frameworkId: string, itemId: string, evidenceId: string, actor: Actor) => Promise<void>;
  unlinkEvidenceFromItem: (frameworkId: string, itemId: string, evidenceId: string, actor: Actor) => Promise<void>;
  generateDraftAnswer: (frameworkId: string, itemId: string, actor: Actor) => Promise<void>;
  approveDraftAnswer: (frameworkId: string, itemId: string, actor: Actor) => Promise<void>;

  resolveGap: (gapId: string, actor: Actor) => Promise<void>;

  saveReport: (
    kind: "pwi" | "cdp",
    title: string,
    html: string,
    summary: Record<string, string>,
    actor: Actor,
    replaceId?: string
  ) => Promise<string>;
  deleteReport: (reportId: string, actor: Actor) => Promise<void>;
  reconcileCdpAutoLinks: (actor: Actor) => Promise<void>;

  resetDemoData: () => Promise<void>;
}

async function postAction(action: string, payload: Record<string, unknown>): Promise<AppDataShape> {
  const res = await fetch("/api/data/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Request failed");
  return json.data as AppDataShape;
}

export const useAppStore = create<AppState>()((set, get) => ({
  evidence: [],
  dataPoints: [],
  gaps: [],
  frameworks: [],
  auditLog: [],
  sites: [],
  questionnaireFields: [],
  reports: [],
  loaded: false,

  fetchAll: async () => {
    try {
      const res = await fetch("/api/data");
      if (!res.ok) return;
      const json = await res.json();
      set({ ...json.data, loaded: true });
    } catch {
      // Network error — keep whatever we had; the UI shows empty/stale
      // rather than crashing, and the next poll will retry.
    }
  },

  ensureDefaultFrameworks: () => {}, // server seeds this on every GET /api/data

  addSite: async (name, basinName, actor) => {
    const res = await fetch("/api/data/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "addSite", payload: { name, basinName, actor } }),
    });
    const json = await res.json();
    if (res.ok) set(json.data);
    return json.siteId as string;
  },

  setSiteBaseline: async (siteId, baseline, actor) => {
    const data = await postAction("setSiteBaseline", { siteId, baseline, actor });
    set(data);
  },

  assignStoreManagerToSite: () => {}, // performed server-side by /api/admin/users on account creation

  uploadEvidence: async (files, actor, waterContext, adminContext) => {
    // All files ride in one multipart request (repeated "file" fields) —
    // one round trip for the whole batch instead of one request per file.
    const form = new FormData();
    for (const file of files) form.append("file", file);
    if (waterContext) {
      form.append("siteId", waterContext.siteId);
      // One category per file, aligned by index with the repeated "file"
      // fields above — each document in a mixed batch gets extracted
      // against its own category rather than one category for everything.
      form.append("categoryIds", JSON.stringify(waterContext.categoryIds));
    }
    if (adminContext) {
      if (adminContext.siteId) form.append("siteId", adminContext.siteId);
      // Plain classification labels, one per file — sets documentType only,
      // does not select a PWI extraction category.
      form.append("documentTypes", JSON.stringify(adminContext.documentTypes));
    }
    const res = await fetch("/api/data/upload", { method: "POST", body: form });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Upload failed.");

    const failed: string[] = (json.results ?? []).filter((r: { ok: boolean }) => !r.ok).map((r: { fileName: string }) => r.fileName);

    // Single authoritative state update via a fresh GET — avoids the
    // duplicate-evidence bug that arose from calling set(json.data) here
    // AND then fetchAll(), which caused two overlapping state writes that
    // could briefly render the same evidence row twice.
    await get().fetchAll();


    if (failed.length > 0) {
      throw new Error(`${failed.length} of ${files.length} file(s) failed to process: ${failed.join(", ")}`);
    }
  },

  verifyDataPoint: async (id, actor, correctedValue) => {
    const data = await postAction("verifyDataPoint", { id, correctedValue, actor });
    set(data);
  },
  rejectDataPoint: async (id, actor, reason) => {
    const data = await postAction("rejectDataPoint", { id, reason, actor });
    set(data);
  },
  saveManualEntry: async (id, value, unit, actor) => {
    const data = await postAction("saveManualEntry", { id, value, unit, actor });
    set(data);
  },

  validateQuestionnaireField: async (fieldId, actor, correctedValue) => {
    const data = await postAction("validateQuestionnaireField", { id: fieldId, actor, correctedValue });
    set(data);
  },
  rejectQuestionnaireField: async (fieldId, actor, reason) => {
    const data = await postAction("rejectQuestionnaireField", { id: fieldId, reason, actor });
    set(data);
  },
  saveQuestionnaireFieldManually: async (fieldId, value, actor) => {
    const data = await postAction("saveQuestionnaireFieldManually", { id: fieldId, value, actor });
    set(data);
  },
  bulkValidateQuestionnaireFields: async (fieldIds, actor, edits) => {
    const data = await postAction("bulkValidateQuestionnaireFields", { fieldIds, actor, edits });
    set(data);
  },
  bulkRejectQuestionnaireFields: async (fieldIds, actor, reason) => {
    const data = await postAction("bulkRejectQuestionnaireFields", { fieldIds, reason, actor });
    set(data);
  },

  addFramework: async (name, version, actor) => {
    const res = await fetch("/api/data/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "addFramework", payload: { name, version, actor } }),
    });
    const json = await res.json();
    if (res.ok) set(json.data);
    return json.frameworkId as string;
  },
  addFrameworkItem: async (frameworkId, item, actor) => {
    const data = await postAction("addFrameworkItem", { frameworkId, item, actor });
    set(data);
  },
  linkDataPointToItem: async (frameworkId, itemId, dataPointId, actor) => {
    const data = await postAction("linkDataPointToItem", { frameworkId, itemId, dataPointId, actor });
    set(data);
  },
  unlinkDataPointFromItem: async (frameworkId, itemId, dataPointId, actor) => {
    const data = await postAction("unlinkDataPointFromItem", { frameworkId, itemId, dataPointId, actor });
    set(data);
  },
  linkEvidenceToItem: async (frameworkId, itemId, evidenceId, actor) => {
    const data = await postAction("linkEvidenceToItem", { frameworkId, itemId, evidenceId, actor });
    set(data);
  },
  unlinkEvidenceFromItem: async (frameworkId, itemId, evidenceId, actor) => {
    const data = await postAction("unlinkEvidenceFromItem", { frameworkId, itemId, evidenceId, actor });
    set(data);
  },
  generateDraftAnswer: async (frameworkId, itemId, actor) => {
    const data = await postAction("generateDraftAnswer", { frameworkId, itemId, actor });
    set(data);
  },
  approveDraftAnswer: async (frameworkId, itemId, actor) => {
    const data = await postAction("approveDraftAnswer", { frameworkId, itemId, actor });
    set(data);
  },

  resolveGap: async (gapId, actor) => {
    const data = await postAction("resolveGap", { gapId, actor });
    set(data);
  },

  saveReport: async (kind, title, html, summary, actor, replaceId) => {
    const res = await fetch("/api/data/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "saveReport", payload: { kind, title, html, summary, actor, replaceId } }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Could not save report.");
    set(json.data);
    return json.reportId as string;
  },
  deleteReport: async (reportId, actor) => {
    const data = await postAction("deleteReport", { reportId, actor });
    set(data);
  },
  reconcileCdpAutoLinks: async (actor) => {
    const data = await postAction("reconcileCdpAutoLinks", { actor });
    set(data);
  },

  resetDemoData: async () => {
    const res = await fetch("/api/data/reset", { method: "POST" });
    const json = await res.json();
    if (res.ok) set(json.data);
  },
}));
