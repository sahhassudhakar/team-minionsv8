// Types for the Positive Water Impact (PWI) methodology, per the Hydris
// Water Stewardship Methodology & Calculation Guide. Every numeric field
// here is either a real, evidence-linked QuestionnaireField value or an
// explicit non-calculable state — nothing is a bare number with no source.

export type Pillar = "P1" | "P2" | "P3";
export type Dimension = "availability" | "accessibility" | "water_quality";

export const PILLAR_LABEL: Record<Pillar, string> = {
  P1: "Site",
  P2: "Sub-Basin",
  P3: "Basin",
};

export const DIMENSION_LABEL: Record<Dimension, string> = {
  availability: "Availability",
  accessibility: "Accessibility",
  water_quality: "Water Quality",
};

export const DIMENSION_WEIGHT: Record<Dimension, number> = {
  availability: 0.4,
  accessibility: 0.3,
  water_quality: 0.3,
};

/** The 9 Pillar × Dimension cells, in the fixed order the methodology defines them. */
export const ALL_CELLS: { pillar: Pillar; dimension: Dimension }[] = [
  { pillar: "P1", dimension: "availability" },
  { pillar: "P2", dimension: "availability" },
  { pillar: "P3", dimension: "availability" },
  { pillar: "P1", dimension: "accessibility" },
  { pillar: "P2", dimension: "accessibility" },
  { pillar: "P3", dimension: "accessibility" },
  { pillar: "P1", dimension: "water_quality" },
  { pillar: "P2", dimension: "water_quality" },
  { pillar: "P3", dimension: "water_quality" },
];

export interface Site {
  id: string;
  name: string;
  basinName: string;
  storeManagerEmail: string | null;
  /** Baseline-year figures, set once by Admin and held constant through the target period. */
  baseline: {
    employeeCount: number | null;
    avgFamilySize: number | null;
    baselineReplenishmentNeededL: number | null; // freshwater withdrawal - wastewater discharged, baseline year
    setBy: string | null;
    setAt: string | null;
  };
  createdAt: string;
}

/** Every questionnaire field a Store Manager's evidence can fill. Field IDs are stable strings used by the auto-fill mapper. */
export type QuestionnaireFieldId =
  | "freshwater_withdrawal_l"
  | "wastewater_discharged_l"
  | "reused_water_l"
  | "p1_rainwater_harvested_l"
  | "p2_water_offset_l"
  | "p3_water_offset_l"
  | "employees_with_wash_access"
  | "p2_wash_people"
  | "p3_wash_people"
  | "influent_tss_mgl"
  | "influent_tn_mgl"
  | "influent_tp_mgl"
  | "effluent_tss_mgl"
  | "effluent_tn_mgl"
  | "effluent_tp_mgl"
  | "p2_pollutant_removed_kg"
  | "p3_pollutant_removed_kg";

export type FieldStatus = "awaiting_evidence" | "proposed" | "verified" | "rejected";

export interface QuestionnaireField {
  id: string; // unique row id
  siteId: string;
  fieldId: QuestionnaireFieldId;
  value: number | null;
  unit: string;
  status: FieldStatus;
  /** Real evidence provenance — the whole point of the system. */
  evidenceId: string | null;
  evidenceFileName: string | null;
  extractionExcerpt: string | null;
  confidence: number | null;
  periodStart: string;
  periodEnd: string;
  proposedAt: string | null;
  validatedBy: string | null;
  validatedAt: string | null;
  rejectionReason: string | null;
}

export const QUESTIONNAIRE_FIELD_META: Record<
  QuestionnaireFieldId,
  { label: string; unit: string; category: string }
> = {
  freshwater_withdrawal_l: { label: "Freshwater Withdrawal", unit: "L", category: "Foundational" },
  wastewater_discharged_l: { label: "Wastewater Discharged", unit: "L", category: "Foundational" },
  reused_water_l: { label: "Reused Water (recycled + reclaimed/grey)", unit: "L", category: "Foundational + Availability P1" },
  p1_rainwater_harvested_l: { label: "On-site Rainwater Harvested", unit: "L", category: "Availability P1" },
  p2_water_offset_l: { label: "P2 Sub-Basin Water Offset", unit: "L", category: "Availability" },
  p3_water_offset_l: { label: "P3 Basin Water Offset", unit: "L", category: "Availability" },
  employees_with_wash_access: { label: "Employees with WASH access", unit: "people", category: "Accessibility" },
  p2_wash_people: { label: "People given WASH access — sub-basin", unit: "people", category: "Accessibility" },
  p3_wash_people: { label: "People given WASH access — basin", unit: "people", category: "Accessibility" },
  influent_tss_mgl: { label: "Influent TSS", unit: "mg/L", category: "Water Quality" },
  influent_tn_mgl: { label: "Influent Total-N", unit: "mg/L", category: "Water Quality" },
  influent_tp_mgl: { label: "Influent Total-P", unit: "mg/L", category: "Water Quality" },
  effluent_tss_mgl: { label: "Effluent TSS", unit: "mg/L", category: "Water Quality" },
  effluent_tn_mgl: { label: "Effluent Total-N", unit: "mg/L", category: "Water Quality" },
  effluent_tp_mgl: { label: "Effluent Total-P", unit: "mg/L", category: "Water Quality" },
  p2_pollutant_removed_kg: { label: "P2 Sub-Basin pollutant removed", unit: "kg", category: "Water Quality" },
  p3_pollutant_removed_kg: { label: "P3 Basin pollutant removed", unit: "kg", category: "Water Quality" },
};

/** Every computed figure carries its own working — never just a bare number. */
export interface ComputedFigure {
  value: number | null;
  formula: string;
  assumptions: string[];
  confidence: "high" | "medium" | "low" | null;
  missing: string[];
}

export interface CellResult {
  pillar: Pillar;
  dimension: Dimension;
  benefit: ComputedFigure;
  target: ComputedFigure;
  score: ComputedFigure; // 0-1, capped at 1.0
}

export interface PillarResult {
  pillar: Pillar;
  cells: CellResult[];
  score: ComputedFigure;
}

export interface SitePWIResult {
  siteId: string;
  pillars: PillarResult[];
  score: ComputedFigure; // 0-1
}
