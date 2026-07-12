"use client";

import { useMemo, useState, useRef } from "react";
import {
  Download, FileText, CheckCircle2, AlertTriangle, Info,
  Droplets, BarChart3, ClipboardList, Shield, Search, Eye, RefreshCw, Trash2, Cloud,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAppStore } from "@/lib/store";
import { useAuthStore } from "@/lib/auth-store";
import { computeSitePWI, computePortfolioPWI } from "@/lib/pwi-methodology";
import { buildPwiRoadmap, buildCdpRoadmap } from "@/lib/roadmap-engine";
import { buildCdpReportHTML } from "@/lib/cdp-report";
import { predictCdpWaterScore } from "@/lib/cdp-score-engine";
import { PILLAR_LABEL, DIMENSION_LABEL, DIMENSION_WEIGHT, QUESTIONNAIRE_FIELD_META } from "@/lib/water-types";
import type { Site, QuestionnaireField } from "@/lib/water-types";
import type { EvidenceObject, ReportRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pct(v: number | null): string {
  if (v == null) return "—";
  return `${Math.round(v * 100)}%`;
}

function scoreColor(v: number | null): string {
  if (v == null) return "#6B7280";
  if (v >= 0.8) return "#059669";
  if (v >= 0.5) return "#D97706";
  return "#DC2626";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

// ---------------------------------------------------------------------------
// Report HTML builder — pure string, no React, safe to inject into iframe
// ---------------------------------------------------------------------------

function buildReportHTML(
  sites: Site[],
  questionnaireFields: QuestionnaireField[],
  evidence: EvidenceObject[],
  assessmentPeriod: string,
  generatedBy: string,
  frameworks: ReturnType<typeof useAppStore.getState>["frameworks"]
): string {
  const siteResults = sites.map((s) => computeSitePWI(s, questionnaireFields));
  const portfolio = computePortfolioPWI(siteResults);
  const pwiRoadmap = buildPwiRoadmap(sites, questionnaireFields);
  const cdpRoadmap = buildCdpRoadmap(frameworks);
  const allRoadmap = [...pwiRoadmap, ...cdpRoadmap];

  const verifiedFields = questionnaireFields.filter((f) => f.status === "verified");
  const pendingFields = questionnaireFields.filter((f) => f.status === "proposed" || f.status === "awaiting_evidence");

  // Cited evidence — every document that contributed a verified field
  const citedEvidenceIds = new Set(verifiedFields.map((f) => f.evidenceId).filter(Boolean) as string[]);
  const citedEvidence = evidence.filter((e) => citedEvidenceIds.has(e.id));

  // Strengths: any PWI cell that has a verified score > 0.7
  const strengths: string[] = [];
  const improvements: string[] = [];
  const risks: string[] = [];

  for (const sr of siteResults) {
    const site = sites.find((s) => s.id === sr.siteId);
    for (const pr of sr.pillars) {
      for (const cell of pr.cells) {
        const label = `${PILLAR_LABEL[pr.pillar]} ${DIMENSION_LABEL[cell.dimension]}`;
        if (cell.score.value != null && cell.score.value >= 0.7) {
          strengths.push(`${label} at ${site?.name}: score ${pct(cell.score.value)} — strong evidence of benefit.`);
        } else if (cell.score.value != null && cell.score.value < 0.5) {
          improvements.push(`${label} at ${site?.name}: only ${pct(cell.score.value)} of target. Additional evidence or intervention needed.`);
        } else if (cell.score.value == null) {
          risks.push(`${label} at ${site?.name}: Insufficient Evidence — score cannot be calculated.`);
        }
      }
    }
  }

  if (sites.length === 0) risks.push("No sites have been configured. The PWI Portfolio Score cannot be calculated without at least one site.");
  if (evidence.length === 0) risks.push("No evidence has been uploaded. All scores are currently non-calculable.");
  if (pendingFields.length > 0) risks.push(`${pendingFields.length} field value(s) are pending Admin validation — scores may improve once validated.`);

  const scoreHTML = portfolio.value != null
    ? `<span style="font-size:48px;font-weight:700;color:${scoreColor(portfolio.value / 100)}">${portfolio.value.toFixed(1)}%</span>`
    : `<span style="font-size:24px;font-weight:600;color:#DC2626">Unable to Calculate</span>`;

  const siteBreakdownHTML = siteResults.map((sr) => {
    const site = sites.find((s) => s.id === sr.siteId);
    return `
      <div style="margin-bottom:28px;">
        <h4 style="font-size:13px;font-weight:600;color:#374151;margin:0 0 10px">${site?.name ?? sr.siteId} — ${site?.basinName ?? ""}</h4>
        <table style="width:100%;border-collapse:collapse;font-size:11px;">
          <thead>
            <tr style="background:#F9FAFB;border-bottom:1px solid #E5E7EB;">
              <th style="text-align:left;padding:6px 8px;font-weight:600;color:#6B7280;text-transform:uppercase;font-size:10px;letter-spacing:.05em">Dimension</th>
              ${(["P1", "P2", "P3"] as const).map((p) => `<th style="text-align:right;padding:6px 8px;font-weight:600;color:#6B7280;text-transform:uppercase;font-size:10px;letter-spacing:.05em">${PILLAR_LABEL[p]}</th>`).join("")}
              <th style="text-align:right;padding:6px 8px;font-weight:600;color:#6B7280;text-transform:uppercase;font-size:10px;letter-spacing:.05em">Weight</th>
            </tr>
          </thead>
          <tbody>
            ${(["availability", "accessibility", "water_quality"] as const).map((dim) => `
              <tr style="border-bottom:1px solid #F3F4F6;">
                <td style="padding:7px 8px;font-weight:500;color:#374151">${DIMENSION_LABEL[dim]}</td>
                ${(["P1", "P2", "P3"] as const).map((p) => {
                  const pr = sr.pillars.find((x) => x.pillar === p)!;
                  const cell = pr.cells.find((c) => c.dimension === dim)!;
                  const v = cell.score.value;
                  return `<td style="text-align:right;padding:7px 8px;font-weight:600;color:${scoreColor(v)}">${v != null ? pct(v) : "—"}</td>`;
                }).join("")}
                <td style="text-align:right;padding:7px 8px;color:#6B7280">${DIMENSION_WEIGHT[dim] * 100}%</td>
              </tr>
            `).join("")}
            <tr style="background:#F9FAFB;font-weight:600;">
              <td style="padding:8px;color:#111827">Pillar Score</td>
              ${sr.pillars.map((p) => `<td style="text-align:right;padding:8px;color:${scoreColor(p.score.value)}">${p.score.value != null ? pct(p.score.value) : "—"}</td>`).join("")}
              <td></td>
            </tr>
          </tbody>
        </table>
        <div style="margin-top:8px;padding:8px 10px;background:#F9FAFB;border-radius:6px;font-size:11px;color:#374151;">
          <strong>Site PWI Score:</strong>
          <span style="margin-left:8px;font-size:18px;font-weight:700;color:${scoreColor(sr.score.value != null ? sr.score.value : null)}">
            ${sr.score.value != null ? pct(sr.score.value) : "Unable to Calculate"}
          </span>
          ${sr.score.value == null ? `<span style="margin-left:8px;color:#6B7280;font-size:10px">${sr.score.missing.join(" · ")}</span>` : ""}
        </div>
      </div>
    `;
  }).join("");

  const indicatorRows = questionnaireFields.map((f) => {
    const meta = QUESTIONNAIRE_FIELD_META[f.fieldId];
    const ev = evidence.find((e) => e.id === f.evidenceId);
    const statusColor: Record<string, string> = {
      verified: "#059669", proposed: "#D97706", awaiting_evidence: "#DC2626", rejected: "#DC2626",
    };
    return `
      <tr style="border-bottom:1px solid #F3F4F6;">
        <td style="padding:7px 8px;font-weight:500;color:#374151">${meta?.label ?? f.fieldId}</td>
        <td style="padding:7px 8px;color:#6B7280">${f.value != null ? `${f.value.toLocaleString()} ${f.unit}` : "—"}</td>
        <td style="padding:7px 8px;font-weight:600;color:${statusColor[f.status] ?? "#6B7280"}">${f.status.replace(/_/g, " ")}</td>
        <td style="padding:7px 8px;color:#6B7280">${f.confidence != null ? `${Math.round(f.confidence * 100)}%` : "Manual"}</td>
        <td style="padding:7px 8px;color:#6B7280;font-size:10px">${ev?.fileName ?? "—"}</td>
      </tr>
    `;
  }).join("");

  const roadmapHTML = allRoadmap.slice(0, 15).map((r) => {
    const prColor: Record<string, string> = { Critical: "#DC2626", High: "#D97706", Medium: "#D97706", Low: "#6B7280" };
    return `
      <tr style="border-bottom:1px solid #F3F4F6;">
        <td style="padding:7px 8px;font-weight:600;font-size:10px;color:${prColor[r.priority] ?? "#6B7280"}">${r.priority}</td>
        <td style="padding:7px 8px;font-size:11px;font-weight:500;color:#374151">${r.title}</td>
        <td style="padding:7px 8px;font-size:10px;color:#6B7280">${r.group}</td>
        <td style="padding:7px 8px;font-size:10px;color:#6B7280">${r.evidenceStatus}</td>
        <td style="padding:7px 8px;font-size:10px;color:#374151">${r.recommendedActions[0] ?? "—"}</td>
      </tr>
    `;
  }).join("");

  const citationsHTML = citedEvidence.map((e, i) => {
    const supportedFields = verifiedFields.filter((f) => f.evidenceId === e.id);
    return `
      <tr style="border-bottom:1px solid #F3F4F6;">
        <td style="padding:7px 8px;color:#6B7280;font-size:10px">[${i + 1}]</td>
        <td style="padding:7px 8px;font-weight:500;color:#374151;font-size:11px">${e.fileName}</td>
        <td style="padding:7px 8px;color:#6B7280;font-size:10px">${e.documentType}</td>
        <td style="padding:7px 8px;color:#6B7280;font-size:10px">${supportedFields.map((f) => QUESTIONNAIRE_FIELD_META[f.fieldId]?.label ?? f.fieldId).join(", ")}</td>
        <td style="padding:7px 8px;color:#6B7280;font-size:10px">${supportedFields.length > 0 ? `${Math.round((supportedFields.reduce((s, f) => s + (f.confidence ?? 0.8), 0) / supportedFields.length) * 100)}%` : "—"}</td>
      </tr>
    `;
  }).join("");

  const now = new Date();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>PWI Assessment Report</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', ui-sans-serif, Arial, sans-serif; color: #111827; background: #fff; font-size: 12px; line-height: 1.65; -webkit-font-smoothing: antialiased; }
  @media print {
    .no-print { display: none !important; }
    body { font-size: 11px; }
    .page-break { page-break-before: always; }
  }
  .cover { min-height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; background: linear-gradient(135deg, #1e3a5f 0%, #2563EB 100%); color: #fff; padding: 60px; }
  .cover-logo { font-family: 'Inter', sans-serif; font-size: 12px; font-weight: 600; letter-spacing: .18em; text-transform: uppercase; opacity: .8; margin-bottom: 48px; }
  .cover h1 { font-family: 'Source Serif 4', Georgia, serif; font-size: 38px; font-weight: 600; letter-spacing: -.01em; line-height: 1.15; margin-bottom: 14px; }
  .cover .subtitle { font-family: 'Source Serif 4', Georgia, serif; font-size: 17px; font-style: italic; opacity: .85; margin-bottom: 48px; }
  .cover-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; text-align: left; max-width: 480px; }
  .cover-meta-item label { font-size: 10px; text-transform: uppercase; letter-spacing: .12em; opacity: .6; display: block; }
  .cover-meta-item span { font-size: 14px; font-weight: 600; }
  .section { padding: 40px 48px; border-bottom: 1px solid #E5E7EB; }
  .section:last-child { border-bottom: none; }
  h2 { font-family: 'Source Serif 4', Georgia, serif; font-size: 22px; font-weight: 600; color: #111827; letter-spacing: -.01em; margin-bottom: 4px; }
  h3 { font-family: 'Source Serif 4', Georgia, serif; font-size: 15px; font-weight: 600; color: #374151; margin: 0 0 10px; }
  .section-label { font-family: 'Inter', sans-serif; font-size: 10px; text-transform: uppercase; letter-spacing: .14em; color: #6B7280; font-weight: 600; margin-bottom: 8px; }
  .score-box { display: inline-flex; flex-direction: column; align-items: center; padding: 20px 32px; border-radius: 12px; background: #F9FAFB; border: 1px solid #E5E7EB; margin-bottom: 16px; }
  .caveat { background: #FFF8F0; border-left: 3px solid #D97706; padding: 10px 14px; border-radius: 4px; font-size: 11px; color: #92400E; margin: 16px 0; }
  .strength { background: #ECFDF5; border-left: 3px solid #059669; padding: 8px 12px; border-radius: 4px; font-size: 11px; color: #065F46; margin-bottom: 6px; }
  .improvement { background: #FFFBEB; border-left: 3px solid #D97706; padding: 8px 12px; border-radius: 4px; font-size: 11px; color: #78350F; margin-bottom: 6px; }
  .risk { background: #FEF2F2; border-left: 3px solid #DC2626; padding: 8px 12px; border-radius: 4px; font-size: 11px; color: #991B1B; margin-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; padding: 8px; background: #F9FAFB; font-family: 'Inter', sans-serif; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; color: #6B7280; border-bottom: 1px solid #E5E7EB; }
  td { font-variant-numeric: tabular-nums; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 100px; font-size: 10px; font-weight: 600; }
  footer { text-align: center; padding: 20px; font-size: 10px; color: #9CA3AF; border-top: 1px solid #E5E7EB; }
</style>
</head>
<body>

<!-- COVER PAGE -->
<div class="cover page-break">
  <div class="cover-logo">Hydris AI · PWI Assessment Platform</div>
  <h1>Positive Water Impact<br>Assessment Report</h1>
  <div class="subtitle">Evidence-Based Water Stewardship Disclosure</div>
  <div class="cover-meta">
    <div class="cover-meta-item"><label>Assessment Period</label><span>${assessmentPeriod}</span></div>
    <div class="cover-meta-item"><label>Report Date</label><span>${formatDate(now.toISOString())}</span></div>
    <div class="cover-meta-item"><label>Sites Assessed</label><span>${sites.length}</span></div>
    <div class="cover-meta-item"><label>Generated By</label><span>${generatedBy}</span></div>
  </div>
</div>

<!-- EXECUTIVE SUMMARY -->
<div class="section page-break">
  <div class="section-label">Section 1</div>
  <h2>Executive Summary</h2>
  <p style="color:#6B7280;margin-bottom:24px;">This report presents the Positive Water Impact (PWI) assessment for the reporting period based exclusively on uploaded and verified evidence. All scores are derived from the Hydris Water Stewardship Methodology (3 Pillars × 3 Dimensions). No values are estimated or fabricated.</p>

  <div class="score-box">
    <div style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Portfolio PWI Score</div>
    ${scoreHTML}
    ${portfolio.value == null ? `<div style="font-size:10px;color:#DC2626;margin-top:6px">${portfolio.missing.join(" · ")}</div>` : ""}
  </div>

  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:16px 0;">
    <div style="padding:12px;background:#F9FAFB;border-radius:8px;text-align:center;">
      <div style="font-size:10px;color:#6B7280;text-transform:uppercase;letter-spacing:.06em">Evidence Files</div>
      <div style="font-size:22px;font-weight:700;color:#111827;margin-top:4px">${evidence.length}</div>
    </div>
    <div style="padding:12px;background:#F9FAFB;border-radius:8px;text-align:center;">
      <div style="font-size:10px;color:#6B7280;text-transform:uppercase;letter-spacing:.06em">Verified Fields</div>
      <div style="font-size:22px;font-weight:700;color:#059669;margin-top:4px">${verifiedFields.length}</div>
    </div>
    <div style="padding:12px;background:#F9FAFB;border-radius:8px;text-align:center;">
      <div style="font-size:10px;color:#6B7280;text-transform:uppercase;letter-spacing:.06em">Pending Validation</div>
      <div style="font-size:22px;font-weight:700;color:#D97706;margin-top:4px">${pendingFields.length}</div>
    </div>
  </div>

  <div class="caveat">
    <strong>Important:</strong> This report reflects only the data that has been uploaded to and verified within the Hydris PWI platform. Missing evidence is explicitly marked. Any score showing "Unable to Calculate" or "Insufficient Evidence" indicates absent or unverified data — not a zero score.
  </div>
</div>

<!-- PWI SCORE BREAKDOWN -->
<div class="section page-break">
  <div class="section-label">Section 2</div>
  <h2>PWI Score Breakdown</h2>
  <p style="color:#6B7280;margin-bottom:20px;">Scores across the 3 Pillars (Site, Sub-Basin, Basin) × 3 Dimensions (Availability, Accessibility, Water Quality). Each cell is calculated from verified evidence only.</p>
  ${sites.length === 0
    ? `<div class="risk">No sites configured. Navigate to Admin → Sites to add sites before scores can be calculated.</div>`
    : siteBreakdownHTML
  }
</div>

<!-- EVIDENCE SUMMARY -->
<div class="section page-break">
  <div class="section-label">Section 3</div>
  <h2>Evidence Summary</h2>
  <p style="color:#6B7280;margin-bottom:16px;">Every indicator value below is traceable to an uploaded evidence document. Values marked "awaiting evidence" or "proposed" have not yet been Admin-validated and do not contribute to the current PWI score.</p>
  ${questionnaireFields.length === 0
    ? `<div class="risk">No questionnaire fields have been populated yet. Upload evidence via the Evidence page to begin.</div>`
    : `<table>
        <thead>
          <tr>
            <th>Indicator</th>
            <th>Value</th>
            <th>Status</th>
            <th>Confidence</th>
            <th>Source Document</th>
          </tr>
        </thead>
        <tbody>${indicatorRows}</tbody>
      </table>`
  }
</div>

<!-- AI FINDINGS -->
<div class="section page-break">
  <div class="section-label">Section 4</div>
  <h2>Assessment Findings</h2>
  <p style="color:#6B7280;margin-bottom:16px;">Findings derived exclusively from uploaded evidence and calculated scores. No findings are invented.</p>

  ${strengths.length > 0 ? `<h3 style="margin-top:16px">Key Strengths</h3>${strengths.map((s) => `<div class="strength">${s}</div>`).join("")}` : ""}
  ${improvements.length > 0 ? `<h3 style="margin-top:16px">Areas Requiring Improvement</h3>${improvements.map((s) => `<div class="improvement">${s}</div>`).join("")}` : ""}
  ${risks.length > 0 ? `<h3 style="margin-top:16px">Risks & Gaps</h3>${risks.map((s) => `<div class="risk">${s}</div>`).join("")}` : ""}
  ${strengths.length === 0 && improvements.length === 0 && risks.length === 0
    ? `<div class="caveat">Insufficient evidence to generate findings. Upload and verify evidence to enable this section.</div>`
    : ""}
</div>

<!-- IMPROVEMENT ROADMAP -->
<div class="section page-break">
  <div class="section-label">Section 5</div>
  <h2>Improvement Roadmap</h2>
  <p style="color:#6B7280;margin-bottom:16px;">Evidence-grounded improvement recommendations. No recommendation is invented — each derives from a calculable gap or missing evidence state.</p>
  ${allRoadmap.length === 0
    ? `<div class="caveat">No recommendations available yet. Configure sites and upload evidence to generate roadmap items.</div>`
    : `<table>
        <thead>
          <tr>
            <th style="width:70px">Priority</th>
            <th>Recommendation</th>
            <th style="width:130px">Group</th>
            <th style="width:130px">Evidence Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>${roadmapHTML}</tbody>
      </table>`
  }
</div>

<!-- CITATIONS -->
<div class="section page-break">
  <div class="section-label">Section 6</div>
  <h2>References & Citations</h2>
  <p style="color:#6B7280;margin-bottom:16px;">Every document that contributed a verified data point to this assessment. Documents with no verified fields (e.g. narrative evidence) are not listed here.</p>
  ${citedEvidence.length === 0
    ? `<div class="caveat">No verified evidence citations yet. Upload and validate evidence documents to populate this section.</div>`
    : `<table>
        <thead>
          <tr>
            <th style="width:32px">#</th>
            <th>Document Name</th>
            <th>Type</th>
            <th>Indicators Supported</th>
            <th style="width:80px">Avg. Confidence</th>
          </tr>
        </thead>
        <tbody>${citationsHTML}</tbody>
      </table>`
  }
</div>

<footer>
  Generated by Hydris AI PWI Assessment Platform · ${now.toISOString()} · All scores derived from verified evidence only. This report does not constitute official PWI certification.
</footer>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

type SortMode = "newest" | "oldest";
type StatusFilter = "all" | ReportRecord["status"];

/** Renders a report's HTML into an off-screen iframe and triggers the print dialog — lets "Download" work directly from a list row without first opening Preview. */
function printReportHTML(html: string) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);
  iframe.onload = () => {
    iframe.contentWindow?.print();
    setTimeout(() => document.body.removeChild(iframe), 1000);
  };
  iframe.srcdoc = html;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * "11. Separate Report Sections" — one of these renders "PWI Assessment
 * Reports" and the other "CDP Assessment Reports". Each is a fully
 * self-contained list: search, status filter, sort, preview, download,
 * delete, regenerate — so users always know which section a report
 * belongs to instead of one undifferentiated report list.
 */
function ReportSection({
  kind,
  title,
  icon: Icon,
  accentClass,
  reports,
  canManage,
  canGenerate,
  generateLabel,
  disabledReason,
  onGenerate,
  onRegenerate,
  onDelete,
  generating,
}: {
  kind: ReportRecord["kind"];
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  accentClass: string;
  reports: ReportRecord[];
  canManage: boolean;
  canGenerate: boolean;
  generateLabel: string;
  disabledReason?: string;
  onGenerate: () => void;
  onRegenerate: (report: ReportRecord) => void;
  onDelete: (report: ReportRecord) => void;
  generating: boolean;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortMode>("newest");
  const [previewing, setPreviewing] = useState<ReportRecord | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ReportRecord | null>(null);
  const previewIframeRef = useRef<HTMLIFrameElement>(null);

  const filtered = useMemo(() => {
    let list = reports.filter((r) => r.kind === kind);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((r) => r.title.toLowerCase().includes(q) || r.generatedBy.toLowerCase().includes(q));
    }
    if (statusFilter !== "all") list = list.filter((r) => r.status === statusFilter);
    list = [...list].sort((a, b) => {
      const diff = new Date(a.generatedAt).getTime() - new Date(b.generatedAt).getTime();
      return sort === "newest" ? -diff : diff;
    });
    return list;
  }, [reports, kind, query, statusFilter, sort]);

  return (
    <div className="mb-10">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className={cn("size-4", accentClass)} />
          <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
          <span className="text-xs text-text-tertiary">({reports.filter((r) => r.kind === kind).length})</span>
        </div>
        {canGenerate && (
          <Button size="sm" onClick={onGenerate} loading={generating} disabled={generating}>
            <ClipboardList className="size-3.5" /> {generateLabel}
          </Button>
        )}
        {!canGenerate && disabledReason && <span className="text-xs text-text-tertiary">{disabledReason}</span>}
      </div>

      {reports.filter((r) => r.kind === kind).length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-subtle bg-bg-surface px-4 py-6 text-center text-sm text-text-tertiary">
          No {title.toLowerCase()} generated yet.
        </div>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text-tertiary" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title or author…"
                className="w-56 rounded-md border border-border-strong py-1.5 pl-8 pr-2.5 text-xs focus:border-accent-primary focus:outline-none"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="rounded-md border border-border-strong px-2 py-1.5 text-xs focus:border-accent-primary focus:outline-none"
            >
              <option value="all">All statuses</option>
              <option value="generated">Generated</option>
              <option value="failed">Failed</option>
            </select>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortMode)}
              className="rounded-md border border-border-strong px-2 py-1.5 text-xs focus:border-accent-primary focus:outline-none"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </div>

          <div className="overflow-hidden rounded-lg border border-border-subtle bg-bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                  <th className="px-4 py-2.5">Title</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Generated</th>
                  <th className="px-4 py-2.5">Highlights</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-border-subtle last:border-0 hover:bg-bg-surface-sunken">
                    <td className="px-4 py-3 text-text-primary">{r.title}</td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={r.status === "generated" ? "confirmed" : "blocked"}>{r.status}</StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-text-tertiary">
                      {formatDateTime(r.generatedAt)} · {r.generatedBy}
                    </td>
                    <td className="px-4 py-3 text-xs text-text-tertiary">
                      {Object.entries(r.summary).map(([k, v]) => (
                        <span key={k} className="mr-2 whitespace-nowrap">
                          <span className="font-medium text-text-secondary">{k}:</span> {v}
                        </span>
                      ))}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setPreviewing(r)} title="Preview">
                          <Eye className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => printReportHTML(r.html)} title="Download">
                          <Download className="size-3.5" />
                        </Button>
                        {canManage && (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => onRegenerate(r)} title="Regenerate" disabled={generating}>
                              <RefreshCw className="size-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(r)} title="Delete">
                              <Trash2 className="size-3.5 text-status-insufficient" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-sm text-text-tertiary">
                      No reports match this search/filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Dialog open={previewing != null} onOpenChange={(v) => !v && setPreviewing(null)}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2">
              <span>{previewing?.title}</span>
              {previewing && (
                <Button size="sm" onClick={() => previewIframeRef.current?.contentWindow?.print()}>
                  <Download className="size-3.5" /> Download PDF
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="h-[75vh] px-6 pb-6">
            {previewing && (
              <iframe ref={previewIframeRef} srcDoc={previewing.html} className="h-full w-full rounded-md border border-border-subtle bg-white" title={previewing.title} />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete != null} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Delete &quot;{confirmDelete?.title}&quot;?</DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-2 text-sm text-text-secondary">This can&apos;t be undone. The generated report file will be permanently removed.</div>
          <div className="flex justify-end gap-2 px-6 pb-6 pt-4">
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (confirmDelete) onDelete(confirmDelete);
                setConfirmDelete(null);
              }}
            >
              <Trash2 className="size-3.5" /> Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ReportsPage() {
  const user = useAuthStore((s) => s.user);
  const sites = useAppStore((s) => s.sites);
  const questionnaireFields = useAppStore((s) => s.questionnaireFields);
  const evidence = useAppStore((s) => s.evidence);
  const frameworks = useAppStore((s) => s.frameworks);
  const reports = useAppStore((s) => s.reports);
  const saveReport = useAppStore((s) => s.saveReport);
  const deleteReport = useAppStore((s) => s.deleteReport);
  const reconcileCdpAutoLinks = useAppStore((s) => s.reconcileCdpAutoLinks);

  const isAdmin = user?.role === "admin";
  const actor = user ? { name: user.name, role: user.role } : null;
  const cdp = frameworks.find((f) => f.name.toLowerCase().includes("cdp"));

  const [generatingPwi, setGeneratingPwi] = useState(false);
  const [generatingCdp, setGeneratingCdp] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const verifiedFields = questionnaireFields.filter((f) => f.status === "verified");
  const hasSufficientPwiData = sites.length > 0 && evidence.length > 0;

  const siteResults = useMemo(() => sites.map((s) => computeSitePWI(s, questionnaireFields)), [sites, questionnaireFields]);
  const portfolio = useMemo(() => computePortfolioPWI(siteResults), [siteResults]);

  const assessmentPeriod = useMemo(() => {
    if (evidence.length === 0) return new Date().getFullYear().toString();
    const dates = evidence.map((e) => new Date(e.uploadedAt).getFullYear());
    const min = Math.min(...dates);
    const max = Math.max(...dates);
    return min === max ? String(min) : `${min}–${max}`;
  }, [evidence]);

  async function generatePwiReport(replaceId?: string) {
    if (!actor) return;
    setGenError(null);
    setGeneratingPwi(true);
    try {
      const html = buildReportHTML(sites, questionnaireFields, evidence, assessmentPeriod, actor.name, frameworks);
      const title = `PWI Assessment Report — ${assessmentPeriod}`;
      const summary: Record<string, string> = {
        "Portfolio Score": portfolio.value != null ? `${portfolio.value.toFixed(1)}%` : "Unable to calculate",
        Sites: String(sites.length),
        "Verified Fields": String(verifiedFields.length),
      };
      await saveReport("pwi", title, html, summary, actor, replaceId);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Could not generate the PWI report.");
    } finally {
      setGeneratingPwi(false);
    }
  }

  async function generateCdpReport(replaceId?: string) {
    if (!actor || !cdp) return;
    setGenError(null);
    setGeneratingCdp(true);
    try {
      // Trigger: "A report is generated" — reconcile auto-links first so the
      // report reflects any evidence that already qualifies.
      await reconcileCdpAutoLinks(actor);
      const latestCdp = useAppStore.getState().frameworks.find((f) => f.name.toLowerCase().includes("cdp")) ?? cdp;
      const latestEvidence = useAppStore.getState().evidence;
      const html = buildCdpReportHTML(latestCdp, latestEvidence, actor.name);
      const prediction = predictCdpWaterScore(latestCdp);
      const readyCount = latestCdp.items.filter((i) => i.status === "ready").length;
      const title = `CDP Water Security Assessment Report — ${new Date().getFullYear()}`;
      const summary: Record<string, string> = {
        "Predicted Band": prediction.band,
        "Questions Ready": `${readyCount}/${latestCdp.items.length}`,
      };
      await saveReport("cdp", title, html, summary, actor, replaceId);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Could not generate the CDP report.");
    } finally {
      setGeneratingCdp(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Generate audit-ready assessment reports from verified evidence — kept separate by assessment type."
      />

      {genError && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-status-insufficient/30 bg-status-insufficient-bg px-4 py-3 text-sm text-status-insufficient">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {genError}
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Sites", value: sites.length, icon: Droplets, ok: sites.length > 0 },
          { label: "Evidence Files", value: evidence.length, icon: FileText, ok: evidence.length > 0 },
          { label: "Verified PWI Fields", value: verifiedFields.length, icon: CheckCircle2, ok: verifiedFields.length > 0 },
          { label: "Portfolio PWI Score", value: portfolio.value != null ? `${portfolio.value.toFixed(1)}%` : "—", icon: BarChart3, ok: portfolio.value != null },
        ].map(({ label, value, icon: Icon, ok }) => (
          <Card key={label}>
            <CardContent className="py-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-text-secondary">{label}</p>
                <Icon className={cn("size-4", ok ? "text-status-verified" : "text-text-tertiary")} />
              </div>
              <p className={cn("mt-1 text-2xl font-semibold tabular-nums", ok ? "text-text-primary" : "text-text-tertiary")}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {!hasSufficientPwiData && (
        <div className="mb-6 flex items-start gap-2 rounded-md border border-status-proposed/30 bg-status-proposed-bg px-4 py-3 text-sm text-text-secondary">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-proposed" />
          <span>
            {sites.length === 0
              ? "No sites have been configured. Ask an Admin to add at least one site under Admin → Sites before generating a PWI report."
              : "No evidence has been uploaded yet. Upload and verify evidence to generate a meaningful PWI report."}
          </span>
        </div>
      )}

      <div className="mb-8 flex items-start gap-2 rounded-md border border-ai-advisory/30 bg-ai-advisory-bg px-4 py-3 text-sm text-text-secondary">
        <Info className="mt-0.5 size-4 shrink-0 text-ai-advisory" />
        <span>
          Reports are assembled from verified data only. Missing sections show
          <strong className="text-status-insufficient"> &quot;Insufficient Evidence&quot;</strong> or
          <strong className="text-status-insufficient"> &quot;Unable to Calculate&quot;</strong> — never estimated values.
        </span>
      </div>

      <ReportSection
        kind="pwi"
        title="PWI Assessment Reports"
        icon={Shield}
        accentClass="text-accent-primary"
        reports={reports}
        canManage={isAdmin}
        canGenerate={isAdmin}
        generateLabel="Generate PWI Report"
        disabledReason={!isAdmin ? "Only Admins can generate reports." : undefined}
        generating={generatingPwi}
        onGenerate={() => generatePwiReport()}
        onRegenerate={(r) => generatePwiReport(r.id)}
        onDelete={(r) => actor && deleteReport(r.id, actor)}
      />

      <ReportSection
        kind="cdp"
        title="CDP Assessment Reports"
        icon={Cloud}
        accentClass="text-ai-advisory"
        reports={reports}
        canManage={isAdmin}
        canGenerate={isAdmin && !!cdp}
        generateLabel="Generate CDP Report"
        disabledReason={!isAdmin ? "Only Admins can generate reports." : !cdp ? "No CDP questionnaire loaded." : undefined}
        generating={generatingCdp}
        onGenerate={() => generateCdpReport()}
        onRegenerate={(r) => generateCdpReport(r.id)}
        onDelete={(r) => actor && deleteReport(r.id, actor)}
      />
    </div>
  );
}
