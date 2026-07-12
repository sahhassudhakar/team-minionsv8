import type { Framework, FrameworkItem } from "./types";

/**
 * Predicted CDP Water Security Score — RESEARCH SUMMARY
 * ======================================================
 * Grounded in CDP's own publicly published guidance (not reproduced
 * verbatim anywhere below — summarized in this app's own words):
 *
 *  - CDP's Full Corporate Scoring Methodology for Water Security scores
 *    each question, then rolls questions up into four cumulative,
 *    GATED levels: Disclosure -> Awareness -> Management -> Leadership.
 *    "Gated" is the key mechanic: a respondent is only ELIGIBLE for
 *    points at a level if they already earned full points at the level
 *    below it (e.g. "Full Disclosure points must be awarded to be
 *    eligible for Awareness points"). A response that is strong on
 *    Leadership-style detail but incomplete on basic Disclosure still
 *    scores low, because it never unlocks the higher gates.
 *  - Scores are expressed as letter bands: D-, D, C-, C, B-, B, A-, A
 *    (D/D- = Disclosure only; C/C- = Awareness reached; B/B- =
 *    Management reached; A-/A = Leadership reached).
 *  - CDP additionally applies "Essential Criteria" — specific mandatory
 *    data points (e.g. board oversight disclosed, company-wide water
 *    accounting, targets in place) — that CAP the achievable band
 *    regardless of point totals if unmet (e.g. missing an Essential
 *    Criterion at Leadership level caps the final score at a B).
 *  - The A List additionally requires clearing a Leadership point
 *    threshold AND having no significant, unexplained exclusions from
 *    disclosure.
 *  - CDP's real methodology is sector-specific, question-by-question,
 *    and proprietary (CDP Worldwide; not reproduced here) — a
 *    third-party tool can at best APPROXIMATE it from response
 *    completeness, never reproduce an official score.
 *
 * WHAT THIS ENGINE ACTUALLY DOES
 * -------------------------------
 * This app has no access to CDP's real per-question point tables, so
 * this engine builds a transparent, auditable PROXY using the same
 * gated-level shape as the real methodology, applied to data this app
 * actually has: which questions have verified, evidence-backed, human
 * -approved answers vs. which are still missing evidence:
 *
 *   1. Each CDP framework item is bucketed into one of the four levels
 *      by its module (see MODULE_LEVEL below) — e.g. basic Governance
 *      and Water Accounting disclosure map to "Disclosure", third-party
 *      Verification and value-chain Engagement map to "Leadership".
 *   2. A level's completion % = (approved-draft items in that level) /
 *      (total items in that level). An item only counts once an Admin
 *      has approved a draft built from real cited, verified evidence —
 *      exactly the same bar this app already uses to mark items "Ready"
 *      elsewhere (see cdp/page.tsx), so the score is never inflated by
 *      an unreviewed AI draft.
 *   3. Gating: a level only "unlocks" once the level below it clears a
 *      completion threshold (mirrors "full points required below to be
 *      eligible above"). The predicted band is the highest unlocked
 *      level, refined to a +/- by within-level completion.
 *   4. Essential-criteria-style caps: a small set of specific items
 *      (board oversight, company-wide accounting, targets) are flagged
 *      as "essential" — if unapproved, the predicted band cannot exceed
 *      B (mirrors CDP's real cap-at-B-if-missing-essential-criteria
 *      behavior), regardless of overall completion.
 *
 * This is explicitly a PREDICTION for internal planning, not a
 * submission or a guarantee of an official CDP score — CDP alone
 * determines the real grade. Only Water Security is modeled; Climate
 * Change and Forests are out of scope per the product requirement.
 */

export type CdpLevel = "disclosure" | "awareness" | "management" | "leadership";

const LEVEL_ORDER: CdpLevel[] = ["disclosure", "awareness", "management", "leadership"];
const LEVEL_LABEL: Record<CdpLevel, string> = {
  disclosure: "Disclosure",
  awareness: "Awareness",
  management: "Management",
  leadership: "Leadership",
};

/**
 * Maps this app's seeded CDP module names (see cdp-seed.ts) onto the level
 * they most resemble in CDP's real question structure. Governance and raw
 * water-accounting disclosure are baseline ("did you disclose it at all");
 * risk/strategy/targets reflect active management; third-party verification
 * and value-chain engagement are the hallmarks CDP itself treats as
 * Leadership-tier (see EC-W criteria on verification & engagement).
 */
const MODULE_LEVEL: Record<string, CdpLevel> = {
  Governance: "disclosure",
  "Water Accounting": "disclosure",
  "Risk Assessment": "awareness",
  "Water Quality": "awareness",
  Strategy: "management",
  Targets: "management",
  Verification: "leadership",
  Engagement: "leadership",
};

/** A small set of items whose module represents a real CDP "essential criteria" theme — unapproved, they cap the predicted band at B regardless of completion elsewhere. */
const ESSENTIAL_MODULES = new Set(["Governance", "Water Accounting", "Targets"]);

function levelForItem(item: FrameworkItem): CdpLevel {
  return MODULE_LEVEL[item.module] ?? "disclosure";
}

export interface LevelBreakdown {
  level: CdpLevel;
  label: string;
  totalItems: number;
  approvedItems: number;
  completionPct: number; // 0-100
  unlocked: boolean;
}

export interface PredictedCdpScore {
  band: string; // e.g. "B-", "A", "D"
  highestUnlockedLevel: CdpLevel | null;
  levels: LevelBreakdown[];
  essentialCriteriaMet: boolean;
  missingEssentialItems: { code: string; text: string }[];
  cappedAtB: boolean;
  narrative: string[];
  disclaimer: string;
}

/** Completion required within a level before the next level is considered "unlocked" — mirrors "full points required below" without demanding literal 100%, since this app's completeness bar (Admin-approved draft) is already strict. */
const UNLOCK_THRESHOLD_PCT = 60;

export function predictCdpWaterScore(framework: Framework): PredictedCdpScore {
  const items = framework.items;

  const levels: LevelBreakdown[] = LEVEL_ORDER.map((level) => {
    const levelItems = items.filter((it) => levelForItem(it) === level);
    const approved = levelItems.filter((it) => !!it.draftApprovedBy);
    const completionPct = levelItems.length > 0 ? Math.round((approved.length / levelItems.length) * 100) : 0;
    return {
      level,
      label: LEVEL_LABEL[level],
      totalItems: levelItems.length,
      approvedItems: approved.length,
      completionPct,
      unlocked: false, // filled in below, sequentially
    };
  });

  // Sequential gating: level N is unlocked only if level N-1 is unlocked
  // AND meets the threshold. Disclosure always attempts to unlock first.
  let highestUnlockedLevel: CdpLevel | null = null;
  for (let i = 0; i < levels.length; i++) {
    const prevOk = i === 0 || levels[i - 1].unlocked;
    if (prevOk && levels[i].totalItems > 0 && levels[i].completionPct >= UNLOCK_THRESHOLD_PCT) {
      levels[i].unlocked = true;
      highestUnlockedLevel = levels[i].level;
    } else if (prevOk && levels[i].totalItems === 0) {
      // No items seeded for this level in this framework — treat as
      // trivially passable so a thinner custom framework isn't unfairly
      // capped by a level it doesn't even have questions for.
      levels[i].unlocked = true;
    }
  }

  const essentialItems = items.filter((it) => ESSENTIAL_MODULES.has(it.module));
  const missingEssentialItems = essentialItems.filter((it) => !it.draftApprovedBy).map((it) => ({ code: it.code, text: it.text }));
  const essentialCriteriaMet = missingEssentialItems.length === 0;

  // Band: highest unlocked level, refined +/- by completion within it;
  // capped at B if essential criteria aren't met, mirroring CDP's real
  // "unmet essential criteria caps the score" behavior.
  const bandForLevel = (level: CdpLevel | null): string => {
    if (!level) return "D-";
    const lb = levels.find((l) => l.level === level)!;
    const within = lb.completionPct;
    const table: Record<CdpLevel, [string, string]> = {
      disclosure: ["D-", "D"],
      awareness: ["C-", "C"],
      management: ["B-", "B"],
      leadership: ["A-", "A"],
    };
    const [minus, plain] = table[level];
    return within >= 85 ? plain : minus;
  };

  let band = bandForLevel(highestUnlockedLevel);
  let cappedAtB = false;
  if (!essentialCriteriaMet && ["A-", "A"].includes(band)) {
    band = "B";
    cappedAtB = true;
  }

  const narrative: string[] = [];
  narrative.push(
    highestUnlockedLevel
      ? `Highest reached level: ${LEVEL_LABEL[highestUnlockedLevel]} (${levels.find((l) => l.level === highestUnlockedLevel)!.completionPct}% of that level's questions have an Admin-approved, evidence-backed answer).`
      : `Disclosure level has not been reached yet — fewer than ${UNLOCK_THRESHOLD_PCT}% of Disclosure-level questions have an approved answer.`
  );
  const nextLocked = levels.find((l) => !l.unlocked);
  if (nextLocked) {
    narrative.push(
      `${LEVEL_LABEL[nextLocked.level]} is not yet unlocked — ${nextLocked.approvedItems}/${nextLocked.totalItems} questions approved (${UNLOCK_THRESHOLD_PCT}% needed).`
    );
  }
  if (!essentialCriteriaMet) {
    narrative.push(
      `${missingEssentialItems.length} essential-style item(s) still need an approved answer (${missingEssentialItems.map((m) => m.code).join(", ")}) — CDP caps scores at B when core disclosures like board oversight, company-wide water accounting, or targets are missing.`
    );
  }

  return {
    band,
    highestUnlockedLevel,
    levels,
    essentialCriteriaMet,
    missingEssentialItems,
    cappedAtB,
    narrative,
    disclaimer:
      "Predicted score only — an internal estimate derived from this platform's own evidence-completeness data, modeled on the public shape of CDP's Disclosure/Awareness/Management/Leadership methodology. It is not an official CDP score, not a CDP submission, and not affiliated with or endorsed by CDP Worldwide. Covers CDP Water Security only (not Climate Change or Forests).",
  };
}
