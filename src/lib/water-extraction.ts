import type { QuestionnaireFieldId } from "./water-types";
import { extractPdfLines, hasHedgeNearby, extractDocxText, extractXlsxAsCsvText, extractPptxText, extractImageText } from "./extraction";

/**
 * The document categories a Floor Manager chooses from when uploading
 * evidence, and which questionnaire field(s) each category is capable of
 * auto-filling. This is the taxonomy referenced on the Evidence page so
 * a Floor Manager knows what to upload to build a complete PWI report.
 */
export interface DocumentCategory {
  id: string;
  label: string;
  description: string;
  feedsFields: QuestionnaireFieldId[];
}

export const DOCUMENT_CATEGORIES: DocumentCategory[] = [
  {
    id: "water_utility_bill",
    label: "Water utility bill / meter log",
    description: "Municipal, ground, surface, rainwater, or condensate withdrawal records.",
    feedsFields: ["freshwater_withdrawal_l"],
  },
  {
    id: "wastewater_discharge_record",
    label: "Wastewater discharge record",
    description: "Volume of wastewater returned to the basin.",
    feedsFields: ["wastewater_discharged_l"],
  },
  {
    id: "recycling_reuse_log",
    label: "Recycling / reuse log",
    description: "Recycled and reclaimed/grey water volumes, and on-site rainwater harvesting.",
    feedsFields: ["reused_water_l", "p1_rainwater_harvested_l"],
  },
  {
    id: "subbasin_project_report",
    label: "Sub-basin project report",
    description: "Groundwater recharge, community rainwater harvesting, or landscaping projects.",
    feedsFields: ["p2_water_offset_l"],
  },
  {
    id: "basin_project_report",
    label: "Basin project report",
    description: "Nature-based solutions, wetlands restoration, or other basin-scale projects.",
    feedsFields: ["p3_water_offset_l"],
  },
  {
    id: "water_quality_lab_report",
    label: "Water quality lab report",
    description: "Influent/effluent TSS, Total-N, and Total-P concentrations from site testing.",
    feedsFields: ["influent_tss_mgl", "influent_tn_mgl", "influent_tp_mgl", "effluent_tss_mgl", "effluent_tn_mgl", "effluent_tp_mgl"],
  },
  {
    id: "subbasin_quality_project",
    label: "Sub-basin water quality project report",
    description: "Documented pollutant mass removed via a sub-basin treatment/quality project.",
    feedsFields: ["p2_pollutant_removed_kg"],
  },
  {
    id: "basin_quality_project",
    label: "Basin water quality project report",
    description: "Documented pollutant mass removed via a basin-scale treatment/quality project.",
    feedsFields: ["p3_pollutant_removed_kg"],
  },
  {
    id: "employee_headcount_record",
    label: "Employee headcount record",
    description: "Total employee count and count of employees with WASH access.",
    feedsFields: ["employees_with_wash_access"],
  },
  {
    id: "wash_access_record",
    label: "WASH access record",
    description: "People given water, sanitation, and hygiene access in the sub-basin or basin.",
    feedsFields: ["p2_wash_people", "p3_wash_people"],
  },
];

/**
 * Generic document types offered to Admins uploading evidence outside the
 * Floor Manager's site-specific PWI flow (e.g. company-wide CDP Water
 * Security evidence — governance charters, risk methodologies, disclosures).
 * These are plain classification labels, not tied to a PWI field-extraction
 * category — picking one only sets EvidenceObject.documentType, it does not
 * change which extraction path runs.
 */
export const ADMIN_DOCUMENT_TYPES: string[] = [
  "Board / Governance Policy",
  "Risk Assessment Methodology",
  "Corporate Water Strategy Document",
  "Water Targets & Goals Document",
  "Water Accounting Data (Withdrawal / Discharge / Consumption)",
  "Water Quality Report",
  "Third-Party Verification / Assurance Statement",
  "Stakeholder / Value Chain Engagement Report",
  "Utility Bill",
  "Supplier Invoice",
  "Policy Document",
  "Tabular Dataset",
  "Other Supporting Document",
];

export interface ExtractedField {
  fieldId: QuestionnaireFieldId;
  value: number;
  unit: string;
  confidence: number;
  excerpt: string;
}

export interface WaterExtractionOutcome {
  fields: ExtractedField[];
  processingError: string | null;
  needsManualEntryFieldIds: QuestionnaireFieldId[];
  rawNote: string;
}

function toLitres(value: number, unit: string): number {
  const u = unit.toLowerCase();
  if (u === "kl" || u === "m3" || u === "m³" || u === "cbm") return value * 1000;
  if (u === "gal" || u === "gallons") return value * 3.78541;
  return value; // assume already litres
}

/** One regex per field this category can plausibly contain. Matches only real text in the document. */
const PATTERNS: { fieldId: QuestionnaireFieldId; regex: RegExp; unitGroup?: boolean }[] = [
  { fieldId: "freshwater_withdrawal_l", regex: /(?:total withdrawal|freshwater withdrawal|water consumption)[:\s]+([\d,]+\.?\d*)\s*(kl|m3|m³|l|litres|liters|gal)/i },
  { fieldId: "wastewater_discharged_l", regex: /(?:wastewater discharged|effluent volume|discharge volume)[:\s]+([\d,]+\.?\d*)\s*(kl|m3|m³|l|litres|liters|gal)/i },
  { fieldId: "reused_water_l", regex: /(?:recycled|reclaimed|grey water|reused water)[:\s]+([\d,]+\.?\d*)\s*(kl|m3|m³|l|litres|liters|gal)/i },
  { fieldId: "p1_rainwater_harvested_l", regex: /rainwater harvest\w*[:\s]+([\d,]+\.?\d*)\s*(kl|m3|m³|l|litres|liters|gal)/i },
  { fieldId: "p2_water_offset_l", regex: /(?:sub-basin water offset|groundwater recharge|landscap\w+ offset)[:\s]+([\d,]+\.?\d*)\s*(kl|m3|m³|l|litres|liters|gal)/i },
  { fieldId: "p3_water_offset_l", regex: /(?:(?<!sub-)basin water offset|nature-based solution\w*|wetlands? restoration)[:\s]+([\d,]+\.?\d*)\s*(kl|m3|m³|l|litres|liters|gal)/i },
  { fieldId: "employees_with_wash_access", regex: /employees? with wash access[:\s]+([\d,]+)/i },
  { fieldId: "p2_wash_people", regex: /(?:sub-basin|community) wash access[:\s]+([\d,]+)\s*people/i },
  { fieldId: "p3_wash_people", regex: /(?<!sub-)basin wash access[:\s]+([\d,]+)\s*people/i },
  { fieldId: "influent_tss_mgl", regex: /influent tss[:\s]+([\d,]+\.?\d*)\s*mg\/l/i },
  { fieldId: "influent_tn_mgl", regex: /influent total-?n[:\s]+([\d,]+\.?\d*)\s*mg\/l/i },
  { fieldId: "influent_tp_mgl", regex: /influent total-?p[:\s]+([\d,]+\.?\d*)\s*mg\/l/i },
  { fieldId: "effluent_tss_mgl", regex: /effluent tss[:\s]+([\d,]+\.?\d*)\s*mg\/l/i },
  { fieldId: "effluent_tn_mgl", regex: /effluent total-?n[:\s]+([\d,]+\.?\d*)\s*mg\/l/i },
  { fieldId: "effluent_tp_mgl", regex: /effluent total-?p[:\s]+([\d,]+\.?\d*)\s*mg\/l/i },
  { fieldId: "p2_pollutant_removed_kg", regex: /sub-basin pollutant removed[:\s]+([\d,]+\.?\d*)\s*kg/i },
  { fieldId: "p3_pollutant_removed_kg", regex: /(?<!sub-)basin pollutant removed[:\s]+([\d,]+\.?\d*)\s*kg/i },
];

export function matchWaterFieldsFromText(fullText: string, categoryId: string): WaterExtractionOutcome {
  const category = DOCUMENT_CATEGORIES.find((c) => c.id === categoryId);
  const fields: ExtractedField[] = [];
  const needsManualEntryFieldIds: QuestionnaireFieldId[] = [];

  const relevantPatterns = category ? PATTERNS.filter((p) => category.feedsFields.includes(p.fieldId)) : PATTERNS;

  for (const pattern of relevantPatterns) {
    const match = fullText.match(pattern.regex);
    if (!match) continue;

    const rawNum = Number(match[1].replace(/,/g, ""));
    if (Number.isNaN(rawNum)) continue;

    const hedged = hasHedgeNearby(fullText, match.index ?? 0);
    if (hedged) {
      needsManualEntryFieldIds.push(pattern.fieldId);
      continue;
    }

    const unit = match[2];
    const isVolumeField = ["freshwater_withdrawal_l", "wastewater_discharged_l", "reused_water_l", "p1_rainwater_harvested_l", "p2_water_offset_l", "p3_water_offset_l"].includes(pattern.fieldId);
    const value = isVolumeField && unit ? toLitres(rawNum, unit) : rawNum;

    fields.push({ fieldId: pattern.fieldId, value, unit: isVolumeField ? "L" : unit ?? "", confidence: 0.9, excerpt: match[0] });
  }

  const rawNote =
    fields.length > 0
      ? `Matched ${fields.length} field(s) from document text.`
      : needsManualEntryFieldIds.length > 0
        ? "Found a candidate value but nearby text hedges its accuracy — routed to manual entry."
        : "No recognized field pattern matched this document's text.";

  return { fields, processingError: null, needsManualEntryFieldIds, rawNote };
}

async function wrapWaterTextExtractor(
  bytes: Uint8Array,
  categoryId: string,
  getText: (bytes: Uint8Array) => Promise<string>,
  formatLabel: string
): Promise<WaterExtractionOutcome> {
  let text: string;
  try {
    text = await getText(bytes);
  } catch (err) {
    return {
      fields: [],
      processingError: err instanceof Error ? err.message : `Unable to read this file as ${formatLabel}.`,
      needsManualEntryFieldIds: [],
      rawNote: `${formatLabel} parsing failed — file may be corrupt or unsupported.`,
    };
  }
  return matchWaterFieldsFromText(text, categoryId);
}

export async function extractWaterFieldsFromPdf(bytes: Uint8Array, categoryId: string): Promise<WaterExtractionOutcome> {
  return wrapWaterTextExtractor(bytes, categoryId, async (b) => (await extractPdfLines(b)).join("\n"), "a PDF");
}

export async function extractWaterFieldsFromDocx(bytes: Uint8Array, categoryId: string): Promise<WaterExtractionOutcome> {
  return wrapWaterTextExtractor(bytes, categoryId, extractDocxText, "a Word document");
}

export async function extractWaterFieldsFromPptx(bytes: Uint8Array, categoryId: string): Promise<WaterExtractionOutcome> {
  return wrapWaterTextExtractor(bytes, categoryId, extractPptxText, "a PowerPoint file");
}

export async function extractWaterFieldsFromImage(bytes: Uint8Array, categoryId: string): Promise<WaterExtractionOutcome> {
  return wrapWaterTextExtractor(bytes, categoryId, extractImageText, "an image (OCR)");
}

export function extractWaterFieldsFromXlsx(bytes: Uint8Array, categoryId: string): WaterExtractionOutcome {
  try {
    return matchWaterFieldsFromText(extractXlsxAsCsvText(bytes), categoryId);
  } catch (err) {
    return {
      fields: [],
      processingError: err instanceof Error ? err.message : "Unable to read this file as an Excel workbook.",
      needsManualEntryFieldIds: [],
      rawNote: "XLSX parsing failed — file may be corrupt or not a valid .xlsx.",
    };
  }
}

export function extractWaterFieldsFromTextFile(bytes: Uint8Array, categoryId: string): WaterExtractionOutcome {
  return matchWaterFieldsFromText(Buffer.from(bytes).toString("utf-8"), categoryId);
}
