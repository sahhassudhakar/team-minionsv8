import type { EvidenceObject, FrameworkItem } from "./types";

const STOPWORDS = new Set([
  "the", "and", "for", "with", "this", "that", "your", "have", "from", "into", "will", "describe", "report",
  "including", "reporting", "period", "such", "used", "used", "used", "used",
]);

function keywordsFor(item: FrameworkItem): string[] {
  const text = `${item.module} ${item.text} ${item.requiredEvidenceHint}`.toLowerCase();
  return Array.from(new Set(text.split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !STOPWORDS.has(w))));
}

/**
 * A transparent keyword-overlap heuristic — not a claim of true semantic
 * relevance. Surfaced as "Suggested" for a human to confirm, exactly like
 * every other AI-touched suggestion in this app: never auto-accepted.
 */
export function suggestEvidenceForItem(item: FrameworkItem, evidence: EvidenceObject[]): EvidenceObject[] {
  const keywords = keywordsFor(item);
  if (keywords.length === 0) return [];
  return evidence
    .filter((e) => e.status !== "rejected")
    .filter((e) => {
      const haystack = `${e.documentType} ${e.fileName}`.toLowerCase();
      return keywords.some((k) => haystack.includes(k));
    });
}
