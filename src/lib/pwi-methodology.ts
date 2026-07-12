import type {
  Site,
  QuestionnaireField,
  QuestionnaireFieldId,
  Pillar,
  Dimension,
  CellResult,
  PillarResult,
  SitePWIResult,
  ComputedFigure,
} from "./water-types";
import { DIMENSION_WEIGHT } from "./water-types";

const DAYS_PER_MONTH = 30.4375; // per the guide's §5.4 formula

function ok(value: number, formula: string, assumptions: string[] = [], confidence: ComputedFigure["confidence"] = "high"): ComputedFigure {
  return { value, formula, assumptions, confidence, missing: [] };
}
function missing(formula: string, missing: string[], assumptions: string[] = []): ComputedFigure {
  return { value: null, formula, assumptions, confidence: null, missing };
}

function verifiedValue(fields: QuestionnaireField[], id: QuestionnaireFieldId): number | null {
  const f = fields.find((f) => f.fieldId === id && f.status === "verified");
  return f?.value ?? null;
}

/** kg/month of a pollutant, per the guide's §5.4 mass-balance formula. */
function pollutantMassKg(concentrationMgL: number, freshwaterWithdrawalL: number): number {
  return (concentrationMgL / 1_000_000) * 1000 * freshwaterWithdrawalL * DAYS_PER_MONTH;
}

// ---------------------------------------------------------------------------
// Availability (40% pillar weight)
// ---------------------------------------------------------------------------
function availabilityCell(pillar: Pillar, site: Site, fields: QuestionnaireField[]): CellResult {
  const baseline = site.baseline.baselineReplenishmentNeededL;
  const targetFraction = pillar === "P1" ? 0.2 : 0.4;

  const target: ComputedFigure =
    baseline != null
      ? ok(
          targetFraction * baseline,
          `${targetFraction} × Replenishment Needed (baseline)`,
          ["Baseline Replenishment Needed set by Admin from baseline-year Freshwater Withdrawal − Wastewater Discharged"]
        )
      : missing(`${targetFraction} × Replenishment Needed (baseline)`, [
          "Baseline Replenishment Needed has not been set for this site by an Admin",
        ]);

  let benefit: ComputedFigure;
  if (pillar === "P1") {
    // Per the methodology: "Water Savings = Recycled + Reclaimed/Grey + Rainwater
    // harvested" — a real sum of two independently-evidenced quantities, not a
    // single pre-computed total trusted from one document.
    const reused = verifiedValue(fields, "reused_water_l");
    const rainwater = verifiedValue(fields, "p1_rainwater_harvested_l");
    if (reused == null && rainwater == null) {
      benefit = missing("Reused Water + On-site Rainwater Harvested (both verified)", [
        "No verified data point yet for reused water or on-site rainwater harvesting",
      ]);
    } else {
      const includedParts: string[] = [];
      if (reused != null) includedParts.push("Reused Water");
      if (rainwater != null) includedParts.push("On-site Rainwater Harvested");
      const missingParts = ["Reused Water", "On-site Rainwater Harvested"].filter((p) => !includedParts.includes(p));
      benefit = ok(
        (reused ?? 0) + (rainwater ?? 0),
        "Reused Water + On-site Rainwater Harvested",
        missingParts.length > 0
          ? [`Only includes: ${includedParts.join(", ")}. ${missingParts.join(", ")} not yet evidenced — not assumed to be zero, may understate total savings.`]
          : [],
        "medium"
      );
    }
  } else {
    const benefitFieldId: QuestionnaireFieldId = pillar === "P2" ? "p2_water_offset_l" : "p3_water_offset_l";
    const benefitValue = verifiedValue(fields, benefitFieldId);
    benefit =
      benefitValue != null
        ? ok(benefitValue, "Verified project-reported water offset for this pillar", [], "high")
        : missing("Verified project-reported water offset for this pillar", [
            "No verified data point yet for this field — evidence not uploaded, or awaiting Admin validation",
          ]);
  }

  const score = cellScore(benefit, target);
  return { pillar, dimension: "availability", benefit, target, score };
}

// ---------------------------------------------------------------------------
// Accessibility (30% pillar weight)
// ---------------------------------------------------------------------------
function accessibilityCell(pillar: Pillar, site: Site, fields: QuestionnaireField[]): CellResult {
  const { employeeCount, avgFamilySize } = site.baseline;

  let target: ComputedFigure;
  if (pillar === "P1") {
    target =
      employeeCount != null
        ? ok(employeeCount, "Employee count (current year)", [])
        : missing("Employee count (current year)", ["Employee count has not been set for this site"]);
  } else {
    target =
      employeeCount != null && avgFamilySize != null
        ? ok(
            employeeCount * ((avgFamilySize - 1) / 2),
            "Employees × ((Avg. family size − 1) ÷ 2)",
            ["Avg. family size taken from most recent census as of the baseline year"]
          )
        : missing("Employees × ((Avg. family size − 1) ÷ 2)", [
            employeeCount == null ? "Employee count not set" : "",
            avgFamilySize == null ? "Average family size not set" : "",
          ].filter(Boolean));
  }

  const benefitFieldId: QuestionnaireFieldId =
    pillar === "P1" ? "employees_with_wash_access" : pillar === "P2" ? "p2_wash_people" : "p3_wash_people";
  const benefitValue = verifiedValue(fields, benefitFieldId);
  const benefit: ComputedFigure =
    benefitValue != null
      ? ok(
          benefitValue,
          pillar === "P1"
            ? "Verified count of employees with WASH access"
            : "Verified count of people given WASH access via evidence",
          pillar === "P1" ? ["WASH access for all employees is required by the supplier code of conduct"] : []
        )
      : missing("Verified count of people with WASH access", [
          "No verified data point yet for this field",
        ]);

  const score = cellScore(benefit, target);
  return { pillar, dimension: "accessibility", benefit, target, score };
}

// ---------------------------------------------------------------------------
// Water Quality (30% pillar weight)
// ---------------------------------------------------------------------------
function waterQualityCell(pillar: Pillar, site: Site, fields: QuestionnaireField[]): CellResult {
  const withdrawal = verifiedValue(fields, "freshwater_withdrawal_l");
  const inTss = verifiedValue(fields, "influent_tss_mgl");
  const inTn = verifiedValue(fields, "influent_tn_mgl");
  const inTp = verifiedValue(fields, "influent_tp_mgl");
  const outTss = verifiedValue(fields, "effluent_tss_mgl");
  const outTn = verifiedValue(fields, "effluent_tn_mgl");
  const outTp = verifiedValue(fields, "effluent_tp_mgl");

  const haveAllP1Inputs = [withdrawal, inTss, inTn, inTp, outTss, outTn, outTp].every((v) => v != null);

  let totalInfluentKg: number | null = null;
  let totalRemovedKg: number | null = null;
  let pctReduction: number | null = null;

  if (haveAllP1Inputs) {
    const influentMass = [inTss!, inTn!, inTp!].map((c) => pollutantMassKg(c, withdrawal!));
    const effluentMass = [outTss!, outTn!, outTp!].map((c) => pollutantMassKg(c, withdrawal!));
    totalInfluentKg = influentMass.reduce((a, b) => a + b, 0);
    totalRemovedKg = influentMass.reduce((a, b, i) => a + (b - effluentMass[i]), 0);
    pctReduction = totalInfluentKg > 0 ? (totalRemovedKg / totalInfluentKg) * 100 : null;
  }

  const formulaNote =
    "% Reduction = Σ(removed kg per pollutant) ÷ Σ(influent kg per pollutant) × 100, where removed kg = [(influent mg/L ÷ 1,000,000) × 1,000 × Freshwater Withdrawal L − (effluent mg/L ÷ 1,000,000) × 1,000 × Freshwater Withdrawal L] × 30.4375";

  if (pillar === "P1") {
    const benefit: ComputedFigure =
      pctReduction != null
        ? ok(pctReduction, formulaNote, [
            "Interpretation: 'Freshwater Withdrawal L' in this formula is read as the site's reported period-total withdrawal (the same figure used elsewhere) — the guide's ×30.4375 (days/month) factor would more precisely apply to a daily withdrawal rate, which this build does not collect separately. Flagged for methodology review against the official technical guidance.",
          ], "medium")
        : missing(formulaNote, ["Missing one or more of: freshwater withdrawal, influent/effluent TSS, Total-N, Total-P"]);
    const target = ok(90, "Fixed threshold per methodology (P1 = 90% pollutant reduction)");
    const score = cellScore(benefit, target);
    return { pillar, dimension: "water_quality", benefit, target, score };
  }

  // P2/P3: the guide does not fully specify a separate data source for these
  // two cells — only that they represent "+5% incremental" cumulative
  // reduction. We interpret the incremental 5 percentage points as 5% of the
  // same influent mass base used for P1, and treat the benefit as pollutant
  // mass removed via a documented sub-basin/basin water-quality project.
  // This is a stated methodology assumption, not a silent guess.
  const projectFieldId: QuestionnaireFieldId = pillar === "P2" ? "p2_pollutant_removed_kg" : "p3_pollutant_removed_kg";
  const projectRemoved = verifiedValue(fields, projectFieldId);

  const target: ComputedFigure =
    totalInfluentKg != null
      ? ok(0.05 * totalInfluentKg, "5% of total influent pollutant mass (incremental target)", [
          "Interpretation: the guide specifies '+5% incremental' without a separate P2/P3 data source — modeled here as 5% of the same influent mass base computed for P1",
        ])
      : missing("5% of total influent pollutant mass (incremental target)", [
          "P1 influent mass could not be computed (see P1 Water Quality cell)",
        ]);

  const benefit: ComputedFigure =
    projectRemoved != null
      ? ok(projectRemoved, `Verified pollutant mass removed via ${pillar === "P2" ? "sub-basin" : "basin"} project`, [])
      : missing(`Verified pollutant mass removed via ${pillar === "P2" ? "sub-basin" : "basin"} project`, [
          "No verified project evidence uploaded for this pillar yet",
        ]);

  const score = cellScore(benefit, target);
  return { pillar, dimension: "water_quality", benefit, target, score };
}

function cellScore(benefit: ComputedFigure, target: ComputedFigure): ComputedFigure {
  if (benefit.value == null || target.value == null) {
    return missing("Benefit ÷ Target (capped at 1.0)", [...benefit.missing, ...target.missing]);
  }
  if (target.value === 0) {
    return missing("Benefit ÷ Target (capped at 1.0)", ["Target is zero — cannot compute a ratio"]);
  }
  const raw = benefit.value / target.value;
  return ok(Math.min(raw, 1.0), "Benefit ÷ Target (capped at 1.0)", [], benefit.confidence ?? "medium");
}

export function computeCell(pillar: Pillar, dimension: Dimension, site: Site, fields: QuestionnaireField[]): CellResult {
  if (dimension === "availability") return availabilityCell(pillar, site, fields);
  if (dimension === "accessibility") return accessibilityCell(pillar, site, fields);
  return waterQualityCell(pillar, site, fields);
}

export function computePillar(pillar: Pillar, site: Site, fields: QuestionnaireField[]): PillarResult {
  const dims: Dimension[] = ["availability", "accessibility", "water_quality"];
  const cells = dims.map((d) => computeCell(pillar, d, site, fields));

  const anyMissing = cells.some((c) => c.score.value == null);
  if (anyMissing) {
    return {
      pillar,
      cells,
      score: missing(
        "Availability×0.40 + Accessibility×0.30 + Water Quality×0.30",
        cells.filter((c) => c.score.value == null).map((c) => `${c.dimension} score not calculable`)
      ),
    };
  }

  const weighted = cells.reduce((sum, c) => sum + c.score.value! * DIMENSION_WEIGHT[c.dimension], 0);
  return {
    pillar,
    cells,
    score: ok(weighted, "Availability×0.40 + Accessibility×0.30 + Water Quality×0.30"),
  };
}

export function computeSitePWI(site: Site, fields: QuestionnaireField[]): SitePWIResult {
  const pillars = (["P1", "P2", "P3"] as Pillar[]).map((p) => computePillar(p, site, fields));
  const anyMissing = pillars.some((p) => p.score.value == null);

  if (anyMissing) {
    return {
      siteId: site.id,
      pillars,
      score: missing(
        "(P1 + P2 + P3) ÷ 3",
        pillars.filter((p) => p.score.value == null).map((p) => `${p.pillar} pillar score not calculable`)
      ),
    };
  }

  const avg = pillars.reduce((sum, p) => sum + p.score.value!, 0) / 3;
  return { siteId: site.id, pillars, score: ok(avg, "(P1 + P2 + P3) ÷ 3") };
}

export function computePortfolioPWI(siteResults: SitePWIResult[]): ComputedFigure {
  if (siteResults.length === 0) {
    return missing("(Σ Site PWI scores ÷ number of sites) × 100", ["No sites configured yet"]);
  }
  const calculable = siteResults.filter((s) => s.score.value != null);
  if (calculable.length < siteResults.length) {
    return missing(
      "(Σ Site PWI scores ÷ number of sites) × 100",
      siteResults.filter((s) => s.score.value == null).map((s) => `Site ${s.siteId} not yet calculable`)
    );
  }
  const avg = (calculable.reduce((sum, s) => sum + s.score.value!, 0) / calculable.length) * 100;
  return ok(avg, "(Σ Site PWI scores ÷ number of sites) × 100");
}
