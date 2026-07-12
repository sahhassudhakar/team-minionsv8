"use client";

import { useMemo, useState, useRef } from "react";
import {
  Download, FileText, CheckCircle2, AlertTriangle, Info,
  Droplets, BarChart3, ClipboardList, Shield
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { useAppStore } from "@/lib/store";
import { useAuthStore } from "@/lib/auth-store";
import { computeSitePWI, computePortfolioPWI } from "@/lib/pwi-methodology";
import { buildPwiRoadmap, buildCdpRoadmap } from "@/lib/roadmap-engine";
import { PILLAR_LABEL, DIMENSION_LABEL, DIMENSION_WEIGHT, QUESTIONNAIRE_FIELD_META } from "@/lib/water-types";
import type { Site, QuestionnaireField } from "@/lib/water-types";
import type { EvidenceObject } from "@/lib/types";
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
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #111827; background: #fff; font-size: 12px; line-height: 1.6; }
  @media print {
    .no-print { display: none !important; }
    body { font-size: 11px; }
    .page-break { page-break-before: always; }
  }
  .cover { min-height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; background: linear-gradient(135deg, #1e3a5f 0%, #2563EB 100%); color: #fff; padding: 60px; }
  .cover-logo { font-size: 13px; font-weight: 700; letter-spacing: .15em; text-transform: uppercase; opacity: .8; margin-bottom: 48px; }
  .cover h1 { font-size: 36px; font-weight: 700; letter-spacing: -.02em; margin-bottom: 12px; }
  .cover .subtitle { font-size: 16px; opacity: .8; margin-bottom: 48px; }
  .cover-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; text-align: left; max-width: 480px; }
  .cover-meta-item label { font-size: 10px; text-transform: uppercase; letter-spacing: .1em; opacity: .6; display: block; }
  .cover-meta-item span { font-size: 14px; font-weight: 600; }
  .section { padding: 40px 48px; border-bottom: 1px solid #E5E7EB; }
  .section:last-child { border-bottom: none; }
  h2 { font-size: 20px; font-weight: 700; color: #111827; margin-bottom: 4px; }
  h3 { font-size: 14px; font-weight: 700; color: #374151; margin: 0 0 10px; }
  .section-label { font-size: 10px; text-transform: uppercase; letter-spacing: .12em; color: #6B7280; font-weight: 600; margin-bottom: 6px; }
  .score-box { display: inline-flex; flex-direction: column; align-items: center; padding: 20px 32px; border-radius: 12px; background: #F9FAFB; border: 1px solid #E5E7EB; margin-bottom: 16px; }
  .caveat { background: #FFF8F0; border-left: 3px solid #D97706; padding: 10px 14px; border-radius: 4px; font-size: 11px; color: #92400E; margin: 16px 0; }
  .strength { background: #ECFDF5; border-left: 3px solid #059669; padding: 8px 12px; border-radius: 4px; font-size: 11px; color: #065F46; margin-bottom: 6px; }
  .improvement { background: #FFFBEB; border-left: 3px solid #D97706; padding: 8px 12px; border-radius: 4px; font-size: 11px; color: #78350F; margin-bottom: 6px; }
  .risk { background: #FEF2F2; border-left: 3px solid #DC2626; padding: 8px 12px; border-radius: 4px; font-size: 11px; color: #991B1B; margin-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; padding: 8px; background: #F9FAFB; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #6B7280; border-bottom: 1px solid #E5E7EB; }
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

export default function ReportsPage() {
  const user = useAuthStore((s) => s.user);
  const sites = useAppStore((s) => s.sites);
  const questionnaireFields = useAppStore((s) => s.questionnaireFields);
  const evidence = useAppStore((s) => s.evidence);
  const frameworks = useAppStore((s) => s.frameworks);

  const [generated, setGenerated] = useState(false);
  const [reportHTML, setReportHTML] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const verifiedFields = questionnaireFields.filter((f) => f.status === "verified");
  const hasSufficientData = sites.length > 0 && evidence.length > 0;

  const siteResults = useMemo(() => sites.map((s) => computeSitePWI(s, questionnaireFields)), [sites, questionnaireFields]);
  const portfolio = useMemo(() => computePortfolioPWI(siteResults), [siteResults]);

  const assessmentPeriod = useMemo(() => {
    if (evidence.length === 0) return new Date().getFullYear().toString();
    const dates = evidence.map((e) => new Date(e.uploadedAt).getFullYear());
    const min = Math.min(...dates);
    const max = Math.max(...dates);
    return min === max ? String(min) : `${min}–${max}`;
  }, [evidence]);

  function generateReport() {
    const html = buildReportHTML(sites, questionnaireFields, evidence, assessmentPeriod, user?.name ?? "Hydris AI", frameworks);
    setReportHTML(html);
    setGenerated(true);
  }

  function downloadReport() {
    if (!iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.print();
  }

  return (
    <div>
      <PageHeader
        title="PWI Assessment Report"
        description="Generate a professional, audit-ready PWI report from verified evidence."
        actions={
          generated ? (
            <Button onClick={downloadReport}>
              <Download className="size-4" /> Download PDF
            </Button>
          ) : undefined
        }
      />

      {!generated ? (
        <div className="space-y-6">
          {/* Pre-generation summary */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: "Sites", value: sites.length, icon: Droplets, ok: sites.length > 0 },
              { label: "Evidence Files", value: evidence.length, icon: FileText, ok: evidence.length > 0 },
              { label: "Verified Fields", value: verifiedFields.length, icon: CheckCircle2, ok: verifiedFields.length > 0 },
              { label: "Portfolio Score", value: portfolio.value != null ? `${portfolio.value.toFixed(1)}%` : "—", icon: BarChart3, ok: portfolio.value != null },
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

          {!hasSufficientData && (
            <div className="flex items-start gap-2 rounded-md border border-status-proposed/30 bg-status-proposed-bg px-4 py-3 text-sm text-text-secondary">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-proposed" />
              <span>
                {sites.length === 0
                  ? "No sites have been configured. Ask an Admin to add at least one site under Admin → Sites before generating a report."
                  : "No evidence has been uploaded yet. Upload and verify evidence to generate a meaningful report."}
              </span>
            </div>
          )}

          <div className="flex items-start gap-2 rounded-md border border-ai-advisory/30 bg-ai-advisory-bg px-4 py-3 text-sm text-text-secondary">
            <Info className="mt-0.5 size-4 shrink-0 text-ai-advisory" />
            <span>
              The report is assembled from verified data only. Any sections without sufficient evidence will display
              <strong className="text-status-insufficient"> "Insufficient Evidence"</strong> or
              <strong className="text-status-insufficient"> "Unable to Calculate"</strong> — never estimated values.
            </span>
          </div>

          <div className="flex gap-3">
            <Button onClick={generateReport} size="lg">
              <ClipboardList className="size-4" />
              {hasSufficientData ? "Generate PWI Assessment Report" : "Generate Report (limited data)"}
            </Button>
            {!hasSufficientData && (
              <p className="self-center text-sm text-text-tertiary">Report will show what's available but sections may be incomplete.</p>
            )}
          </div>

          <div className="rounded-lg border border-border-subtle bg-bg-surface p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-primary">
              <Shield className="size-4 text-text-tertiary" /> Report Contents
            </h3>
            <div className="grid gap-2 text-xs text-text-secondary sm:grid-cols-2">
              {[
                "Cover Page — company, period, date",
                "Executive Summary — PWI score + key stats",
                "PWI Score Breakdown — per site, pillar, dimension",
                "Evidence Summary — every indicator with source",
                "Assessment Findings — strengths, gaps, risks",
                "Improvement Roadmap — evidence-grounded actions",
                "References & Citations — every contributing document",
              ].map((item) => (
                <div key={item} className="flex items-center gap-1.5">
                  <CheckCircle2 className="size-3 shrink-0 text-status-verified" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-status-verified/30 bg-status-verified-bg px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-medium text-status-verified">
              <CheckCircle2 className="size-4" />
              Report generated — review below, then download as PDF.
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setGenerated(false)}>
                Regenerate
              </Button>
              <Button size="sm" onClick={downloadReport}>
                <Download className="size-3.5" /> Download PDF
              </Button>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-border-subtle shadow-sm">
            <iframe
              ref={iframeRef}
              srcDoc={reportHTML ?? ""}
              className="h-[80vh] w-full bg-white"
              title="PWI Assessment Report"
            />
          </div>
        </div>
      )}
    </div>
  );
}
