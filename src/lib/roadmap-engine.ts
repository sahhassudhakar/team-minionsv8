import type { Framework, FrameworkItem } from "./types";
import type { Site, QuestionnaireField, Pillar, Dimension } from "./water-types";
import { PILLAR_LABEL, DIMENSION_LABEL, DIMENSION_WEIGHT } from "./water-types";
import { computeSitePWI } from "./pwi-methodology";
import { DOCUMENT_CATEGORIES } from "./water-extraction";

export type RoadmapPriority = "Critical" | "High" | "Medium" | "Low";
export type RoadmapGroup = "Governance" | "Operations" | "Environmental" | "Social" | "Documentation & Evidence";
export type RoadmapStatus = "Not Started" | "In Progress" | "Awaiting Evidence" | "Complete";

export interface RoadmapItem {
  id: string;
  domain: "pwi" | "cdp";
  group: RoadmapGroup;
  title: string;
  /** Why this gap exists, based only on uploaded evidence state. */
  reason: string;
  /** What a reviewer should actually do. Never invented. */
  recommendedActions: string[];
  /** Which PWI indicator or CDP code this maps to. */
  relatedIndicator: string;
  /** Current evidence upload/validation state. */
  evidenceStatus: "Insufficient Evidence" | "Pending Validation" | "Partially Evidenced" | "Evidenced";
  /** Files already uploaded that are relevant, empty if none. */
  supportingEvidence: string[];
  /** What's still missing — empty means everything is covered. */
  missingEvidence: string[];
  /** Impact statement — mathematical ceiling from formula, or qualitative for CDP. Never a made-up number. */
  expectedImpact: string;
  suggestedOwner: string;
  estimatedTimeline: string;
  status: RoadmapStatus;
  priority: RoadmapPriority;
  /** Legacy compat for any callers that just need a number for sorting. */
  potentialImpact: { valuePct: number; basis: string } | null;
  siteId?: string;
  siteName?: string;
}

const PILLAR_ORDER: Pillar[] = ["P1", "P2", "P3"];
const DIMENSION_ORDER: Dimension[] = ["availability", "accessibility", "water_quality"];

function fieldsForCell(pillar: Pillar, dimension: Dimension): string[] {
  if (dimension === "availability") {
    if (pillar === "P1") return ["reused_water_l", "p1_rainwater_harvested_l"];
    if (pillar === "P2") return ["p2_water_offset_l"];
    return ["p3_water_offset_l"];
  }
  if (dimension === "accessibility") {
    if (pillar === "P1") return ["employees_with_wash_access"];
    if (pillar === "P2") return ["p2_wash_people"];
    return ["p3_wash_people"];
  }
  if (pillar === "P1") return ["influent_tss_mgl", "influent_tn_mgl", "influent_tp_mgl", "effluent_tss_mgl", "effluent_tn_mgl", "effluent_tp_mgl"];
  if (pillar === "P2") return ["p2_pollutant_removed_kg"];
  return ["p3_pollutant_removed_kg"];
}

function documentHintForFields(fieldIds: string[]): string[] {
  const cats = DOCUMENT_CATEGORIES.filter((c) => c.feedsFields.some((f) => fieldIds.includes(f)));
  return cats.length > 0 ? cats.map((c) => c.label) : ["Supporting evidence document"];
}

function dimensionToGroup(dimension: Dimension): RoadmapGroup {
  if (dimension === "availability") return "Environmental";
  if (dimension === "accessibility") return "Social";
  return "Operations";
}

function cdpModuleToGroup(module: string): RoadmapGroup {
  const m = module.toLowerCase();
  if (m.includes("govern")) return "Governance";
  if (m.includes("risk") || m.includes("strategy") || m.includes("target")) return "Operations";
  if (m.includes("water account") || m.includes("water quality") || m.includes("verif")) return "Documentation & Evidence";
  if (m.includes("community") || m.includes("social") || m.includes("engagement")) return "Social";
  return "Environmental";
}

export function buildPwiRoadmap(sites: Site[], questionnaireFields: QuestionnaireField[]): RoadmapItem[] {
  const items: RoadmapItem[] = [];

  for (const site of sites) {
    if (site.baseline.baselineReplenishmentNeededL == null) {
      items.push({
        id: `pwi-baseline-${site.id}`,
        domain: "pwi",
        group: "Documentation & Evidence",
        title: `Set PWI Baseline — ${site.name}`,
        reason: "No PWI score can be calculated for this site until an Admin configures the baseline values (employee count, average family size, and baseline Replenishment Needed). All nine PWI cells depend on this single configuration step.",
        recommendedActions: [
          "Navigate to Admin → Sites and select this site",
          "Enter the baseline-year employee count and average family size",
          "Enter the baseline Replenishment Needed (Freshwater Withdrawal − Wastewater Discharged for the baseline year)",
        ],
        relatedIndicator: "All PWI indicators",
        evidenceStatus: "Insufficient Evidence",
        supportingEvidence: [],
        missingEvidence: ["Baseline employee count", "Average family size", "Baseline Replenishment Needed (L)"],
        expectedImpact: "Unlocks calculation of all nine PWI cells for this site. Without this, the site contributes 0% to the Portfolio PWI Score.",
        suggestedOwner: "Admin / Water Stewardship Manager",
        estimatedTimeline: "Immediate — admin configuration, no document upload needed",
        status: "Not Started",
        priority: "Critical",
        potentialImpact: { valuePct: 100, basis: "Unlocks this site's entire PWI score" },
        siteId: site.id,
        siteName: site.name,
      });
      continue;
    }

    const result = computeSitePWI(site, questionnaireFields);
    const siteFields = questionnaireFields.filter((f) => f.siteId === site.id);

    for (const pillar of PILLAR_ORDER) {
      const pillarResult = result.pillars.find((p) => p.pillar === pillar)!;
      for (const dimension of DIMENSION_ORDER) {
        const cell = pillarResult.cells.find((c) => c.dimension === dimension)!;
        if (cell.score.value != null && cell.score.value >= 1.0) continue;

        const currentScore = cell.score.value ?? 0;
        const gapFraction = 1.0 - currentScore;
        const ceilingSitePct = gapFraction * DIMENSION_WEIGHT[dimension] * (1 / 3) * 100;

        const relevantFieldIds = fieldsForCell(pillar, dimension);
        const relatedFields = siteFields.filter((f) => relevantFieldIds.includes(f.fieldId));
        const pendingFields = relatedFields.filter((f) => f.status === "proposed" || f.status === "awaiting_evidence");
        const verifiedFields = relatedFields.filter((f) => f.status === "verified");
        const hasPending = pendingFields.length > 0;
        const hasVerified = verifiedFields.length > 0;

        const requiredDocs = documentHintForFields(relevantFieldIds);
        const uploadedFileNames = relatedFields.map((f) => f.evidenceFileName).filter((n): n is string => !!n);
        const uniqueFiles = [...new Set(uploadedFileNames)];

        let evidenceStatus: RoadmapItem["evidenceStatus"];
        if (hasPending && hasVerified) evidenceStatus = "Partially Evidenced";
        else if (hasPending) evidenceStatus = "Pending Validation";
        else if (hasVerified) evidenceStatus = "Evidenced";
        else evidenceStatus = "Insufficient Evidence";

        const missingEvidence = evidenceStatus === "Insufficient Evidence" ? requiredDocs : [];

        let priority: RoadmapPriority = "Low";
        if (ceilingSitePct >= 8) priority = "Critical";
        else if (ceilingSitePct >= 5) priority = "High";
        else if (ceilingSitePct >= 2) priority = "Medium";

        let status: RoadmapStatus = "Not Started";
        if (evidenceStatus === "Pending Validation") status = "Awaiting Evidence";
        else if (evidenceStatus === "Partially Evidenced") status = "In Progress";
        else if (evidenceStatus === "Evidenced") status = "In Progress";

        const reason =
          cell.benefit.value == null
            ? `The ${DIMENSION_LABEL[dimension]} (${PILLAR_LABEL[pillar]}) cell has no verified evidence yet and cannot be scored. ${cell.benefit.missing.join("; ")}.`
            : `${DIMENSION_LABEL[dimension]} (${PILLAR_LABEL[pillar]}) is at ${Math.round(currentScore * 100)}% of its target. ${cell.target.value != null ? `${(cell.target.value - cell.benefit.value).toLocaleString(undefined, { maximumFractionDigits: 0 })} more units needed to close the gap fully.` : "Target not yet calculable."}`;

        const actions: string[] = [];
        if (evidenceStatus === "Insufficient Evidence") {
          actions.push(`Upload the following document(s): ${requiredDocs.join(", ")}`);
          actions.push("Assign the correct document category during upload so extraction targets the right fields");
        } else if (evidenceStatus === "Pending Validation") {
          actions.push("Review and validate the proposed field values extracted from uploaded evidence");
          actions.push("Navigate to PWI → pending fields to approve or correct extracted values");
        } else {
          actions.push("Verify that the uploaded values reflect the most recent reporting period");
          actions.push("Consider uploading additional evidence to increase field coverage");
        }

        items.push({
          id: `pwi-${site.id}-${pillar}-${dimension}`,
          domain: "pwi",
          group: dimensionToGroup(dimension),
          title: `${PILLAR_LABEL[pillar]} ${DIMENSION_LABEL[dimension]} — ${site.name}`,
          reason,
          recommendedActions: actions,
          relatedIndicator: `${PILLAR_LABEL[pillar]} × ${DIMENSION_LABEL[dimension]}`,
          evidenceStatus,
          supportingEvidence: uniqueFiles,
          missingEvidence,
          expectedImpact: `Mathematical ceiling: up to +${Math.round(ceilingSitePct * 10) / 10}% on Portfolio PWI Score if this cell reaches 100% (${DIMENSION_WEIGHT[dimension] * 100}% dimension weight ÷ 3 pillars).`,
          suggestedOwner: dimension === "accessibility" ? "HSE / WASH Officer" : dimension === "water_quality" ? "Environmental Manager" : "Water Stewardship Lead",
          estimatedTimeline: evidenceStatus === "Insufficient Evidence" ? "1–4 weeks (document collection)" : "1–2 weeks (validation)",
          status,
          priority,
          potentialImpact: { valuePct: Math.round(ceilingSitePct * 10) / 10, basis: `Ceiling if ${PILLAR_LABEL[pillar]} × ${DIMENSION_LABEL[dimension]} reaches 100%` },
          siteId: site.id,
          siteName: site.name,
        });
      }
    }
  }

  return items.sort((a, b) => (b.potentialImpact?.valuePct ?? 0) - (a.potentialImpact?.valuePct ?? 0));
}

export function buildCdpRoadmap(frameworks: Framework[]): RoadmapItem[] {
  const cdp = frameworks.find((f) => f.name.toLowerCase().includes("cdp"));
  if (!cdp) return [];

  const items: RoadmapItem[] = [];
  const notReady = cdp.items.filter((i) => i.status !== "ready");
  const moduleCounts = new Map<string, number>();
  for (const it of notReady) moduleCounts.set(it.module, (moduleCounts.get(it.module) ?? 0) + 1);

  for (const item of notReady) {
    const missingInModule = moduleCounts.get(item.module) ?? 1;
    let priority: RoadmapPriority = "Low";
    if (missingInModule >= 4) priority = "Critical";
    else if (missingInModule >= 3) priority = "High";
    else if (missingInModule >= 2) priority = "Medium";

    const hasLinkedEvidence = item.linkedEvidenceIds.length > 0;
    const hasDraft = !!item.draftAnswer;
    const isApproved = !!item.draftApprovedBy;

    let evidenceStatus: RoadmapItem["evidenceStatus"];
    if (isApproved) evidenceStatus = "Evidenced";
    else if (hasDraft) evidenceStatus = "Pending Validation";
    else if (hasLinkedEvidence) evidenceStatus = "Partially Evidenced";
    else evidenceStatus = "Insufficient Evidence";

    let status: RoadmapStatus = "Not Started";
    if (isApproved) status = "Complete";
    else if (hasDraft) status = "Awaiting Evidence";
    else if (hasLinkedEvidence) status = "In Progress";

    const actions: string[] = [];
    if (!hasLinkedEvidence) {
      actions.push(`Upload the required evidence: ${item.requiredEvidenceHint || "supporting document"}`);
      actions.push(`Navigate to CDP → ${item.code} and link the uploaded document`);
    } else if (!hasDraft) {
      actions.push("Generate a draft answer from the linked evidence on the CDP page");
      actions.push("Review the assembled facts against the source document");
    } else if (!isApproved) {
      actions.push("Admin to review the assembled draft answer on the CDP page");
      actions.push("Approve the draft to mark this question as Ready");
    }

    const missingEvidence = !hasLinkedEvidence ? [item.requiredEvidenceHint || "Supporting evidence document"] : [];

    items.push({
      id: `cdp-${cdp.id}-${item.id}`,
      domain: "cdp",
      group: cdpModuleToGroup(item.module),
      title: `${item.code} — ${item.module}`,
      reason: !hasLinkedEvidence
        ? `No evidence cited for this CDP question yet. ${missingInModule} question(s) in the ${item.module} module are outstanding, affecting disclosure readiness for this entire module.`
        : hasDraft && !isApproved
        ? `A draft answer has been assembled from cited evidence and is awaiting Admin approval. This is the only remaining step before this question is marked Ready.`
        : `Evidence is linked to this question but no draft answer has been generated yet.`,
      recommendedActions: actions,
      relatedIndicator: `${item.code} (${item.module})`,
      evidenceStatus,
      supportingEvidence: [],
      missingEvidence,
      expectedImpact: `Contributes to CDP ${item.module} module readiness. ${missingInModule} outstanding question(s) in this module currently prevent a complete disclosure for ${item.module}.`,
      suggestedOwner: item.module.toLowerCase().includes("govern") ? "Board / Executive Team" : item.module.toLowerCase().includes("social") || item.module.toLowerCase().includes("community") ? "HSE / Sustainability Team" : "Water Stewardship / ESG Manager",
      estimatedTimeline: !hasLinkedEvidence ? "2–6 weeks (evidence collection and review)" : "1–2 weeks (draft generation and approval)",
      status,
      priority,
      potentialImpact: { valuePct: 0, basis: "Contributes 1 of the outstanding questions to CDP readiness" },
    });
  }

  return items.sort((a, b) => {
    const rank = { Critical: 0, High: 1, Medium: 2, Low: 3 };
    return rank[a.priority] - rank[b.priority];
  });
}
