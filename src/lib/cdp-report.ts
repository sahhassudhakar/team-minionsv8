import type { Framework, EvidenceObject } from "./types";
import { predictCdpWaterScore } from "./cdp-score-engine";
import { buildCdpRoadmap } from "./roadmap-engine";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function bandColor(band: string): string {
  if (band.startsWith("A")) return "#059669";
  if (band.startsWith("B")) return "#2563EB";
  if (band.startsWith("C")) return "#D97706";
  return "#DC2626";
}

/**
 * "11. Separate Report Sections" (CDP half) + "12. Predicted CDP Water
 * Score" — a standalone CDP Assessment Report, structurally parallel to the
 * PWI report builder in reports/page.tsx but scoped entirely to the CDP
 * Water Security framework: readiness by module, the predicted score with
 * its full level breakdown, evidence citations, and outstanding gaps.
 */
export function buildCdpReportHTML(framework: Framework, evidence: EvidenceObject[], generatedBy: string): string {
  const prediction = predictCdpWaterScore(framework);
  const roadmap = buildCdpRoadmap([framework]);
  const now = new Date();

  const modules = Array.from(new Set(framework.items.map((i) => i.module)));
  const readyCount = framework.items.filter((i) => i.status === "ready").length;

  const moduleRows = modules.map((m) => {
    const items = framework.items.filter((i) => i.module === m);
    const ready = items.filter((i) => i.status === "ready").length;
    const pct = items.length > 0 ? Math.round((ready / items.length) * 100) : 0;
    return `
      <tr style="border-bottom:1px solid #F3F4F6;">
        <td style="padding:7px 8px;font-weight:500;color:#374151">${m}</td>
        <td style="padding:7px 8px;color:#6B7280">${ready}/${items.length}</td>
        <td style="padding:7px 8px;font-weight:600;color:${pct >= 70 ? "#059669" : pct >= 30 ? "#D97706" : "#DC2626"}">${pct}%</td>
      </tr>`;
  }).join("");

  const levelRows = prediction.levels.map((l) => `
    <tr style="border-bottom:1px solid #F3F4F6;">
      <td style="padding:7px 8px;font-weight:500;color:#374151">${l.label}</td>
      <td style="padding:7px 8px;color:#6B7280">${l.approvedItems}/${l.totalItems}</td>
      <td style="padding:7px 8px;color:#6B7280">${l.completionPct}%</td>
      <td style="padding:7px 8px;font-weight:600;color:${l.unlocked ? "#059669" : "#9CA3AF"}">${l.unlocked ? "Unlocked" : "Not reached"}</td>
    </tr>`).join("");

  const itemRows = framework.items.map((item) => {
    const statusColor: Record<string, string> = { ready: "#059669", pending: "#D97706", unmapped: "#DC2626" };
    const statusLabel: Record<string, string> = { ready: "Ready", pending: "Pending approval", unmapped: "Insufficient Evidence" };
    return `
      <tr style="border-bottom:1px solid #F3F4F6;">
        <td style="padding:7px 8px;font-family:monospace;font-size:10px;color:#6B7280">${item.code}</td>
        <td style="padding:7px 8px;color:#6B7280;font-size:10px">${item.module}</td>
        <td style="padding:7px 8px;color:#374151;font-size:11px">${item.text}</td>
        <td style="padding:7px 8px;font-weight:600;font-size:10px;color:${statusColor[item.status] ?? "#6B7280"}">${statusLabel[item.status] ?? item.status}</td>
        <td style="padding:7px 8px;color:#6B7280;font-size:10px">${item.linkedEvidenceIds.length}</td>
      </tr>`;
  }).join("");

  const citedEvidenceIds = new Set(framework.items.flatMap((i) => i.linkedEvidenceIds));
  const citedEvidence = evidence.filter((e) => citedEvidenceIds.has(e.id));
  const citationRows = citedEvidence.map((e, i) => {
    const supportedItems = framework.items.filter((it) => it.linkedEvidenceIds.includes(e.id));
    return `
      <tr style="border-bottom:1px solid #F3F4F6;">
        <td style="padding:7px 8px;color:#6B7280;font-size:10px">[${i + 1}]</td>
        <td style="padding:7px 8px;font-weight:500;color:#374151;font-size:11px">${e.fileName}</td>
        <td style="padding:7px 8px;color:#6B7280;font-size:10px">${e.documentType}</td>
        <td style="padding:7px 8px;color:#6B7280;font-size:10px">${supportedItems.map((it) => it.code).join(", ")}</td>
      </tr>`;
  }).join("");

  const roadmapRows = roadmap.slice(0, 15).map((r) => {
    const prColor: Record<string, string> = { Critical: "#DC2626", High: "#D97706", Medium: "#D97706", Low: "#6B7280" };
    return `
      <tr style="border-bottom:1px solid #F3F4F6;">
        <td style="padding:7px 8px;font-weight:600;font-size:10px;color:${prColor[r.priority] ?? "#6B7280"}">${r.priority}</td>
        <td style="padding:7px 8px;font-size:11px;font-weight:500;color:#374151">${r.title}</td>
        <td style="padding:7px 8px;font-size:10px;color:#6B7280">${r.evidenceStatus}</td>
        <td style="padding:7px 8px;font-size:10px;color:#374151">${r.recommendedActions[0] ?? "—"}</td>
      </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>CDP Water Security Assessment Report</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', ui-sans-serif, Arial, sans-serif; color: #111827; background: #fff; font-size: 12px; line-height: 1.65; -webkit-font-smoothing: antialiased; }
  @media print { .no-print { display: none !important; } body { font-size: 11px; } .page-break { page-break-before: always; } }
  .cover { min-height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; background: linear-gradient(135deg, #0f2942 0%, #0e7490 100%); color: #fff; padding: 60px; }
  .cover-logo { font-family: 'Inter', sans-serif; font-size: 12px; font-weight: 600; letter-spacing: .18em; text-transform: uppercase; opacity: .8; margin-bottom: 48px; }
  .cover h1 { font-family: 'Source Serif 4', Georgia, serif; font-size: 36px; font-weight: 600; letter-spacing: -.01em; line-height: 1.15; margin-bottom: 14px; }
  .cover .subtitle { font-family: 'Source Serif 4', Georgia, serif; font-size: 16px; font-style: italic; opacity: .85; margin-bottom: 48px; }
  .cover-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; text-align: left; max-width: 480px; }
  .cover-meta-item label { font-size: 10px; text-transform: uppercase; letter-spacing: .12em; opacity: .6; display: block; }
  .cover-meta-item span { font-size: 14px; font-weight: 600; }
  .section { padding: 40px 48px; border-bottom: 1px solid #E5E7EB; }
  .section:last-child { border-bottom: none; }
  h2 { font-family: 'Source Serif 4', Georgia, serif; font-size: 22px; font-weight: 600; color: #111827; letter-spacing: -.01em; margin-bottom: 4px; }
  .section-label { font-family: 'Inter', sans-serif; font-size: 10px; text-transform: uppercase; letter-spacing: .14em; color: #6B7280; font-weight: 600; margin-bottom: 8px; }
  .score-box { display: inline-flex; flex-direction: column; align-items: center; padding: 20px 40px; border-radius: 12px; background: #F9FAFB; border: 1px solid #E5E7EB; margin-bottom: 16px; }
  .caveat { background: #FFF8F0; border-left: 3px solid #D97706; padding: 10px 14px; border-radius: 4px; font-size: 11px; color: #92400E; margin: 16px 0; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; padding: 8px; background: #F9FAFB; font-family: 'Inter', sans-serif; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; color: #6B7280; border-bottom: 1px solid #E5E7EB; }
  td { font-variant-numeric: tabular-nums; }
  footer { text-align: center; padding: 20px; font-size: 10px; color: #9CA3AF; border-top: 1px solid #E5E7EB; }
</style>
</head>
<body>

<div class="cover page-break">
  <div class="cover-logo">Hydris AI · CDP Water Security Assessment</div>
  <h1>CDP Water Security<br>Assessment Report</h1>
  <div class="subtitle">${framework.name} · ${framework.version}</div>
  <div class="cover-meta">
    <div class="cover-meta-item"><label>Report Date</label><span>${formatDate(now.toISOString())}</span></div>
    <div class="cover-meta-item"><label>Questions Ready</label><span>${readyCount} / ${framework.items.length}</span></div>
    <div class="cover-meta-item"><label>Predicted Band</label><span>${prediction.band}</span></div>
    <div class="cover-meta-item"><label>Generated By</label><span>${generatedBy}</span></div>
  </div>
</div>

<div class="section page-break">
  <div class="section-label">Section 1</div>
  <h2>Predicted CDP Water Security Score</h2>
  <p style="color:#6B7280;margin-bottom:16px;">Modeled on the public shape of CDP's own Disclosure → Awareness → Management → Leadership methodology, applied to this workspace's evidence-completeness data. See the disclaimer below — this is an internal planning estimate, not an official CDP score.</p>
  <div class="score-box">
    <div style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Predicted Band</div>
    <span style="font-size:48px;font-weight:700;color:${bandColor(prediction.band)}">${prediction.band}</span>
  </div>
  <table style="margin-top:8px;">
    <thead><tr><th>Level</th><th>Approved</th><th>Completion</th><th>Status</th></tr></thead>
    <tbody>${levelRows}</tbody>
  </table>
  ${prediction.narrative.map((n) => `<div class="caveat">${n}</div>`).join("")}
  <div class="caveat" style="border-left-color:#6B7280;color:#374151;background:#F3F4F6;">${prediction.disclaimer}</div>
</div>

<div class="section page-break">
  <div class="section-label">Section 2</div>
  <h2>Readiness by Module</h2>
  <table><thead><tr><th>Module</th><th>Ready</th><th>%</th></tr></thead><tbody>${moduleRows}</tbody></table>
</div>

<div class="section page-break">
  <div class="section-label">Section 3</div>
  <h2>Question-Level Detail</h2>
  <table><thead><tr><th>Code</th><th>Module</th><th>Question</th><th>Status</th><th>Evidence</th></tr></thead><tbody>${itemRows}</tbody></table>
</div>

<div class="section page-break">
  <div class="section-label">Section 4</div>
  <h2>Improvement Roadmap</h2>
  ${roadmap.length === 0
    ? `<div class="caveat">No outstanding CDP recommendations — every question either has cited evidence or hasn't been reached yet.</div>`
    : `<table><thead><tr><th style="width:70px">Priority</th><th>Recommendation</th><th style="width:140px">Evidence Status</th><th>Action</th></tr></thead><tbody>${roadmapRows}</tbody></table>`
  }
</div>

<div class="section page-break">
  <div class="section-label">Section 5</div>
  <h2>References & Citations</h2>
  <p style="color:#6B7280;margin-bottom:16px;">Every document cited by at least one CDP question, including documents attached automatically by evidence auto-linking.</p>
  ${citedEvidence.length === 0
    ? `<div class="caveat">No evidence cited yet.</div>`
    : `<table><thead><tr><th style="width:32px">#</th><th>Document</th><th>Type</th><th>Cited By</th></tr></thead><tbody>${citationRows}</tbody></table>`
  }
</div>

<footer>
  Generated by Hydris AI · ${now.toISOString()} · CDP Water Security only — Climate Change and Forests are out of scope. Not an official CDP submission or score.
</footer>
</body>
</html>`;
}
