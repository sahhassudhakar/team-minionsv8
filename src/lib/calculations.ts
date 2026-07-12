import type { Framework } from "./types";

// Real PWI (Positive Water Impact) calculation now lives in
// pwi-methodology.ts, implementing the 3 Pillars x 3 Dimensions methodology
// exactly. This file keeps only the CDP readiness helper, which is a
// separate, still-active part of the app (the CDP disclosure/mapping side).

export function calculateCDPReadiness(frameworks: Framework[]): { ready: number; total: number } | null {
  const cdp = frameworks.find((f) => f.name.toLowerCase().includes("cdp"));
  if (!cdp || cdp.items.length === 0) return null;
  return {
    ready: cdp.items.filter((i) => i.status === "ready").length,
    total: cdp.items.length,
  };
}
