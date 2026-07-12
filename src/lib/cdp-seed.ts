import type { Framework } from "./types";

/**
 * A representative CDP Water Security-style question structure, organized
 * around the same broad categories CDP's own public methodology documents
 * describe (governance, risk assessment, business impact, targets, water
 * accounting, water quality, verification, value chain and community
 * engagement). The item text below is written originally for this app — it
 * is NOT a reproduction of CDP's proprietary questionnaire wording. For the
 * authoritative, current questionnaire, an organization should always refer
 * to CDP's official portal directly.
 *
 * This is deliberately water-focused (not climate) since that's the actual
 * domain this product's PWI methodology addresses — a company assessed for
 * Positive Water Impact is the same company answering CDP Water Security.
 *
 * Ships as an empty skeleton (no answers, no evidence, no scores) — the
 * point is that a team can start mapping evidence to it immediately without
 * building a framework from scratch in Admin.
 */
function blankItem(code: string, module: string, text: string, requiredEvidenceHint: string) {
  return {
    id: `seed-cdp-${code.toLowerCase()}`,
    code,
    module,
    text,
    status: "unmapped" as const,
    linkedDataPointIds: [],
    linkedEvidenceIds: [],
    requiredEvidenceHint,
    draftAnswer: null,
    draftCitations: null,
    draftApprovedBy: null,
    draftApprovedAt: null,
  };
}

export function buildDefaultCdpFramework(): Framework {
  return {
    id: "seed-cdp-water",
    name: "CDP Water Security (representative)",
    version: "2026",
    items: [
      blankItem(
        "GOV-1",
        "Governance",
        "Describe the board-level (or equivalent) oversight of water-related risks and opportunities.",
        "Board/committee charter or governance policy document covering water stewardship oversight."
      ),
      blankItem(
        "GOV-2",
        "Governance",
        "Describe management's role in assessing and managing water-related issues, including reporting frequency to the board.",
        "Management structure document, meeting minutes, or reporting cadence record."
      ),
      blankItem(
        "RISK-1",
        "Risk Assessment",
        "Describe the process used to identify, assess, and prioritize water-related risks across owned and operated assets.",
        "Water risk assessment methodology document or basin risk screening report."
      ),
      blankItem(
        "RISK-2",
        "Business Impact",
        "Disclose any substantive water-related risks identified with the potential for significant business impact.",
        "Risk register extract or facility-level water stress assessment."
      ),
      blankItem(
        "STRAT-1",
        "Business Strategy",
        "Describe how water-related risks and opportunities have influenced business strategy and financial planning.",
        "Strategy document, capital allocation record, or board presentation referencing water."
      ),
      blankItem(
        "TGT-1",
        "Targets",
        "Disclose water-related targets, including scope, boundary, base year, and target year.",
        "Board-approved target statement or public commitment document."
      ),
      blankItem(
        "TGT-2",
        "Targets",
        "Report progress against active water-related targets for the current reporting period.",
        "Progress report comparing current-period performance to the stated target."
      ),
      blankItem(
        "WA-1",
        "Water Accounting",
        "Report total water withdrawal by source for the reporting period.",
        "Water utility bill or meter log covering the reporting period."
      ),
      blankItem(
        "WA-2",
        "Water Accounting",
        "Report total water discharge and consumption for the reporting period.",
        "Wastewater discharge record for the reporting period."
      ),
      blankItem(
        "WQ-1",
        "Water Quality",
        "Report effluent water quality data and the methodology used to assess pollutant reduction.",
        "Water quality lab report with influent/effluent TSS, Total-N, and Total-P."
      ),
      blankItem(
        "VER-1",
        "Verification",
        "Indicate whether reported water figures have received third-party verification or assurance, and to what standard.",
        "Third-party assurance statement or verification certificate."
      ),
      blankItem(
        "ENG-1",
        "Value Chain Engagement",
        "Describe engagement with suppliers on water-related requirements or assessments.",
        "Supplier water risk assessment or engagement record."
      ),
      blankItem(
        "ENG-2",
        "Community Engagement",
        "Describe engagement with local communities on water access, sanitation, and hygiene (WASH).",
        "WASH access record or community engagement report."
      ),
    ],
  };
}
