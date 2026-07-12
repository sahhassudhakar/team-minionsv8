import type { DataPoint, EvidenceObject, Framework, FrameworkItem } from "./types";
import type { QuestionnaireField } from "./water-types";
import { QUESTIONNAIRE_FIELD_META } from "./water-types";

// Generic terms that show up across almost every CDP Water Security
// question regardless of topic (governance, risk, targets, quality...) —
// matching on these alone tells you almost nothing about which SPECIFIC
// question a document answers, so they're excluded before scoring even
// begins rather than just downweighted.
const STOPWORDS = new Set([
  "the", "and", "for", "with", "this", "that", "your", "have", "from", "into", "will", "describe", "report",
  "including", "reporting", "period", "such", "used", "water", "company", "companys", "business", "process",
  "processes", "information", "provide", "related", "across", "level", "document", "policy", "assess",
]);

function keywordsFor(item: FrameworkItem): string[] {
  const text = `${item.module} ${item.text} ${item.requiredEvidenceHint}`.toLowerCase();
  return Array.from(new Set(text.split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !STOPWORDS.has(w))));
}

export interface EvidenceMatchScore {
  score: number;
  reasons: string[];
}

/**
 * "1. CDP – Improve Document Auto-Matching" — a keyword shared by many
 * questions (e.g. "targets", "management") barely distinguishes between
 * them; a keyword unique to one or two questions (e.g. "wastewater",
 * "boardlevel", "thirdparty") is a much stronger signal that a document
 * genuinely answers THAT specific question. This computes an inverse
 * document-frequency-style weight per keyword across the whole framework
 * so common words count for little and specific ones count for a lot —
 * the closest approximation to "read and understand each question" this
 * app can do without a real embeddings/LLM call (this app has no such
 * integration; see cdp-seed.ts).
 */
export function buildKeywordWeights(framework: Framework): Map<string, number> {
  const perItemKeywords = framework.items.map((it) => keywordsFor(it));
  const docFreq = new Map<string, number>();
  for (const kws of perItemKeywords) {
    for (const k of new Set(kws)) docFreq.set(k, (docFreq.get(k) ?? 0) + 1);
  }
  const weights = new Map<string, number>();
  for (const [k, freq] of docFreq) weights.set(k, 1 / freq); // unique to 1 item -> weight 1; shared by 5 items -> weight 0.2
  return weights;
}

/**
 * Multi-signal relevance score between a CDP framework item and one piece
 * of evidence. Combines three independent, transparent, IDF-weighted
 * signals per the "Automatically Link Existing Evidence" spec:
 *
 *  1. Metadata — the evidence's documentType/businessUnit against the
 *     item's module/question text/evidence hint.
 *  2. Extracted content — data points / questionnaire fields already
 *     extracted FROM that evidence. This is the "don't rely solely on
 *     filenames" signal: it looks at what was actually read out of the
 *     document, not just its name.
 *  3. Filename — contributes ONLY as a supplement to signal 1 or 2; a
 *     filename match with nothing else present scores zero, so a document
 *     can never get auto-attached on a coincidental filename word alone.
 *
 * Every matched keyword is weighted by how specific it is to this
 * question (see buildKeywordWeights) rather than counted flatly, so a
 * document that happens to share one generic word with a question no
 * longer clears the same bar as one that shares a rare, distinguishing
 * term. Returns the score AND the specific overlapping terms so a
 * reviewer (or an audit log entry) can see exactly why a document was
 * suggested/attached — never an opaque black-box number.
 */
export function scoreEvidenceForItem(
  item: FrameworkItem,
  ev: EvidenceObject,
  dataPoints: DataPoint[],
  questionnaireFields: QuestionnaireField[],
  keywordWeights?: Map<string, number>
): EvidenceMatchScore {
  const keywords = keywordsFor(item);
  const reasons: string[] = [];
  if (keywords.length === 0) return { score: 0, reasons };

  const weightOf = (k: string) => keywordWeights?.get(k) ?? 1;
  const weightedSum = (hits: string[]) => hits.reduce((s, k) => s + weightOf(k), 0);

  const metaHaystack = `${ev.documentType} ${ev.businessUnit}`.toLowerCase();
  const metaHits = keywords.filter((k) => metaHaystack.includes(k));
  const metaWeight = Math.min(2, weightedSum(metaHits));
  if (metaWeight > 0) reasons.push(`Document type/metadata matches: ${metaHits.slice(0, 3).join(", ")}`);

  // Content signal — what was actually extracted from this document,
  // not what it's named. This is what lets one document satisfy
  // multiple questions even when its filename is generic.
  const relatedDataPoints = dataPoints.filter((d) => d.evidenceId === ev.id);
  const relatedFields = questionnaireFields.filter((f) => f.evidenceId === ev.id);
  const contentHaystack = [
    ...relatedDataPoints.map((d) => d.metricName),
    ...relatedFields.map((f) => QUESTIONNAIRE_FIELD_META[f.fieldId]?.label ?? f.fieldId),
  ].join(" ").toLowerCase();
  const contentHits = keywords.filter((k) => contentHaystack.includes(k));
  const contentWeight = Math.min(2.5, weightedSum(contentHits) * 1.5);
  if (contentWeight > 0) reasons.push(`Extracted content matches: ${contentHits.slice(0, 3).join(", ")}`);

  // Filename — never an independent signal (spec: "do not rely solely on
  // filenames"). It only ever adds a small boost on top of an existing
  // metadata or content match; with neither present it contributes zero.
  const nameHits = keywords.filter((k) => ev.fileName.toLowerCase().includes(k));
  const nameWeight = metaWeight > 0 || contentWeight > 0 ? Math.min(0.5, weightedSum(nameHits) * 0.4) : 0;
  if (nameWeight > 0) reasons.push(`Filename also matches: ${nameHits.slice(0, 2).join(", ")}`);

  // A genuine match needs more than one throwaway generic word: require
  // either one meaningfully specific keyword (weight >= 0.5, i.e. shared
  // by no more than ~2 questions) or at least two distinct overlapping
  // keywords across signals — a single common word overlapping by
  // coincidence must never be enough on its own.
  const distinctHits = new Set([...metaHits, ...contentHits]);
  const hasSpecificHit = [...distinctHits].some((k) => weightOf(k) >= 0.5);
  if (!hasSpecificHit && distinctHits.size < 2) return { score: 0, reasons: [] };

  return { score: metaWeight + contentWeight + nameWeight, reasons };
}

/**
 * A transparent keyword-overlap heuristic used for the manual "Link
 * evidence" picker's "Suggested" section — a lower bar than auto-link,
 * since a human confirms every entry here before it's cited.
 */
export function suggestEvidenceForItem(
  item: FrameworkItem,
  evidence: EvidenceObject[],
  dataPoints: DataPoint[] = [],
  questionnaireFields: QuestionnaireField[] = []
): EvidenceObject[] {
  return evidence
    .filter((e) => e.status !== "rejected" && e.status !== "duplicate")
    .filter((e) => scoreEvidenceForItem(item, e, dataPoints, questionnaireFields).score > 0)
    .sort((a, b) => scoreEvidenceForItem(item, b, dataPoints, questionnaireFields).score - scoreEvidenceForItem(item, a, dataPoints, questionnaireFields).score);
}

/**
 * The bar for AUTOMATIC attachment (no human step) is deliberately high —
 * it takes a specific, meaningfully-weighted match (not a shared generic
 * word) between the document and the exact question, so evidence is never
 * force-matched to every question just to fill a gap. Any question that
 * doesn't clear this bar for ANY document stays unmapped and is reported
 * as "Insufficient Evidence" (see cdp/page.tsx) rather than being given a
 * weak, assumption-based citation.
 */
export const AUTO_LINK_THRESHOLD = 2.2;

export interface AutoLinkCandidate {
  item: FrameworkItem;
  match: EvidenceMatchScore & { evidence: EvidenceObject };
}

/** Evidence eligible to be considered for auto-linking at all — never rejected/duplicate content. */
export function eligibleEvidenceForAutoLink(evidence: EvidenceObject[]): EvidenceObject[] {
  return evidence.filter((e) => e.status !== "rejected" && e.status !== "duplicate");
}
