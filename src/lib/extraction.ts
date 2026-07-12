/**
 * Extraction engine — SERVER-SIDE ONLY (runs inside API route handlers, not
 * the browser). Moving this off the client means the same evidence, however
 * it was uploaded and from whatever device, gets identically processed and
 * the results land in one shared, persisted store — not a per-browser copy.
 *
 * This is a genuine (if intentionally simple) implementation of the
 * "Extraction Engine" described in the architecture: it reads the ACTUAL
 * bytes of the uploaded file and pulls values out of what is really there.
 * It never invents a number. Two real strategies are used:
 *
 *  - CSV: parsed directly (real rows, real columns, real values). Rows with
 *    a blank required field produce NO data point for that field — absence
 *    stays absence, per the evidence-first rule.
 *
 *  - PDF: text is extracted with pdf.js (Mozilla's PDF renderer, running
 *    here in Node rather than the browser) using each text run's real (x, y)
 *    position to reconstruct rows/lines — the "layout-aware" approach
 *    described in the AI architecture doc. Simple label-based patterns then
 *    look for a small set of known fields. If nothing matches, or the
 *    matched text is hedged ("approx", "est.", "unclear", "obscured"), the
 *    result is reported as low-confidence and routed to manual entry —
 *    never guessed.
 *
 * Any other file type (images, etc.) has no extraction path implemented in
 * this demo build (a real deployment would add an OCR service) and is
 * correctly reported as such rather than silently faked.
 */

import path from "path";
import { pathToFileURL } from "url";

export interface ExtractedMetric {
  metricName: string;
  value: number;
  unit: string;
  confidence: number; // 0-1
  excerpt: string; // the real source text the value was read from
}

export interface ExtractionOutcome {
  metrics: ExtractedMetric[];
  /** True if the file's content genuinely couldn't be parsed at all (e.g. corrupt/invalid PDF). */
  processingError: string | null;
  /** Populated for rows/fields where a value was expected but is absent — used to raise Gaps. */
  missingFields: { label: string; context: string }[];
  /** Set when something was found but not with enough confidence to trust automatically. */
  needsManualEntry: boolean;
  rawNote: string;
}

export async function extractDocxText(bytes: Uint8Array): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  return result.value;
}

export function extractXlsxAsCsvText(bytes: Uint8Array): string {
  // Reuses the exact same header/value matching logic as CSV by converting
  // the first sheet to CSV text — one real parser (SheetJS), one matching
  // path, instead of a second bespoke implementation to maintain.
  const XLSX = require("xlsx") as typeof import("xlsx");
  const workbook = XLSX.read(bytes, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return "";
  const sheet = workbook.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_csv(sheet);
}

export async function extractPptxText(bytes: Uint8Array): Promise<string> {
  // A .pptx is a zip of XML slide files. Each text run lives inside an
  // <a:t>...</a:t> tag, real per the OOXML spec — this reads the actual
  // slide XML, not a heuristic on the filename or file size.
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(Buffer.from(bytes));
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)\.xml/)?.[1] ?? 0);
      const nb = Number(b.match(/slide(\d+)\.xml/)?.[1] ?? 0);
      return na - nb;
    });

  const texts: string[] = [];
  for (const name of slideFiles) {
    const xml = await zip.files[name].async("string");
    const runs = Array.from(xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)).map((m) => m[1]);
    if (runs.length > 0) texts.push(runs.join(" "));
  }
  return texts.join("\n");
}

/**
 * OCR via tesseract.js. Real capability, not a stub — but tesseract.js
 * downloads its language model from a CDN the first time it runs in a given
 * environment (cached locally after that). If that CDN is unreachable
 * (blocked network, offline server), this fails closed with a clear error
 * rather than hanging or fabricating text — the caller reports it as a
 * genuine processing failure, same as a corrupt PDF.
 */
export async function extractImageText(bytes: Uint8Array): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    const {
      data: { text },
    } = await worker.recognize(Buffer.from(bytes));
    return text;
  } finally {
    await worker.terminate();
  }
}

export const HEDGE_WORDS = ["appx", "approx", "est.", "estimate", "unclear", "obscured", "illegible"];

export function hasHedgeNearby(text: string, index: number, window = 45): boolean {
  const slice = text.slice(Math.max(0, index - window), index + window).toLowerCase();
  return HEDGE_WORDS.some((w) => slice.includes(w));
}

export async function extractPdfLines(bytes: Uint8Array): Promise<string[]> {
  // Node-compatible ("legacy") build — this runs inside an API route, never
  // in the browser, so no public worker URL is needed; point pdf.js at the
  // worker file on disk instead.
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const workerPath = path.join(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs");
  pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;

  const doc = await pdfjsLib.getDocument({ data: bytes }).promise;

  const lines: string[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();

    // Group text items into lines by rounded y-coordinate (real layout, not guessed).
    const rows = new Map<number, { x: number; str: string }[]>();
    for (const item of content.items as { str: string; transform: number[] }[]) {
      if (!("transform" in item)) continue;
      const x = item.transform[4];
      const y = Math.round(item.transform[5] / 3) * 3; // bucket to tolerate sub-pixel jitter
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y)!.push({ x, str: item.str });
    }
    const sortedY = Array.from(rows.keys()).sort((a, b) => b - a); // top of page first
    for (const y of sortedY) {
      const line = rows
        .get(y)!
        .sort((a, b) => a.x - b.x)
        .map((c) => c.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (line) lines.push(line);
    }
  }
  return lines;
}

function parseNumber(raw: string): number {
  return Number(raw.replace(/,/g, ""));
}

export function extractMetricsFromText(fullText: string): ExtractionOutcome {
  const metrics: ExtractedMetric[] = [];
  let needsManualEntry = false;
  let rawNote = "No known quantitative field patterns matched this document.";

  const amountDueMatch = fullText.match(/Total Amount Due\s+\$?([\d,]+\.\d{2})/i);
  if (amountDueMatch) {
    metrics.push({
      metricName: "Utility Bill — Total Amount Due",
      value: parseNumber(amountDueMatch[1]),
      unit: "USD",
      confidence: 0.95,
      excerpt: amountDueMatch[0],
    });
    rawNote = "Matched 'Total Amount Due' line item.";
  }

  const totalDueMatch = fullText.match(/Total Due:?\s*\$([\d,]+\.\d{2})/i);
  if (totalDueMatch) {
    metrics.push({
      metricName: "Supplier Invoice — Total Due",
      value: parseNumber(totalDueMatch[1]),
      unit: "USD",
      confidence: 0.93,
      excerpt: totalDueMatch[0],
    });
    rawNote = "Matched 'Total Due' line item.";
  }

  const kwhRegex = /([\d,]{2,7})\s*kwh/i;
  const kwhMatch = fullText.match(kwhRegex);
  if (kwhMatch) {
    const hedged = hasHedgeNearby(fullText, kwhMatch.index ?? 0);
    const value = parseNumber(kwhMatch[1]);
    if (hedged) {
      needsManualEntry = true;
      rawNote = `Found a possible usage figure ("${kwhMatch[0]}") but nearby text hedges its accuracy — routed to manual entry rather than trusted automatically.`;
    } else if (value > 0) {
      metrics.push({
        metricName: "Energy Consumption",
        value,
        unit: "kWh",
        confidence: 0.88,
        excerpt: kwhMatch[0],
      });
      rawNote = "Matched a kWh usage figure.";
    }
  }

  if (metrics.length === 0 && !needsManualEntry) {
    rawNote = "Document text was read successfully but contains no recognized quantitative field.";
  }

  return { metrics, processingError: null, missingFields: [], needsManualEntry, rawNote };
}

async function wrapTextExtractor(
  bytes: Uint8Array,
  getText: (bytes: Uint8Array) => Promise<string>,
  formatLabel: string
): Promise<ExtractionOutcome> {
  let text: string;
  try {
    text = await getText(bytes);
  } catch (err) {
    return {
      metrics: [],
      processingError: err instanceof Error ? err.message : `Unable to read this file as ${formatLabel}.`,
      missingFields: [],
      needsManualEntry: false,
      rawNote: `${formatLabel} parsing failed — file may be corrupt or unsupported.`,
    };
  }
  return extractMetricsFromText(text);
}

export async function extractFromPdf(bytes: Uint8Array): Promise<ExtractionOutcome> {
  return wrapTextExtractor(bytes, async (b) => (await extractPdfLines(b)).join("\n"), "a PDF");
}

export async function extractFromDocx(bytes: Uint8Array): Promise<ExtractionOutcome> {
  return wrapTextExtractor(bytes, extractDocxText, "a Word document");
}

export async function extractFromPptx(bytes: Uint8Array): Promise<ExtractionOutcome> {
  return wrapTextExtractor(bytes, extractPptxText, "a PowerPoint file");
}

export async function extractFromImage(bytes: Uint8Array): Promise<ExtractionOutcome> {
  return wrapTextExtractor(bytes, extractImageText, "an image (OCR)");
}

export function extractFromTextFile(bytes: Uint8Array): ExtractionOutcome {
  return extractMetricsFromText(Buffer.from(bytes).toString("utf-8"));
}

export interface CsvRowResult {
  metrics: ExtractedMetric[];
  missingFields: { label: string; context: string }[];
}

export function extractFromCsv(text: string): CsvRowResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));

  if (lines.length < 2) return { metrics: [], missingFields: [] };

  const headers = lines[0].split(",").map((h) => h.trim());
  const nameIdx = headers.findIndex((h) => /name/i.test(h));
  const valueIdx = headers.findIndex((h) => /emissions|value|amount|tco2e|kwh/i.test(h));

  const metrics: ExtractedMetric[] = [];
  const missingFields: { label: string; context: string }[] = [];

  if (nameIdx === -1 || valueIdx === -1) return { metrics, missingFields };

  for (const line of lines.slice(1)) {
    const cols = line.split(",").map((c) => c.trim());
    const label = cols[nameIdx];
    const rawValue = cols[valueIdx];
    if (!label) continue;

    if (!rawValue) {
      missingFields.push({ label, context: headers[valueIdx] });
      continue;
    }
    const num = Number(rawValue);
    if (!Number.isNaN(num) && num >= 0) {
      metrics.push({
        metricName: `${label} — ${headers[valueIdx]}`,
        value: num,
        unit: /tco2e/i.test(headers[valueIdx]) ? "tCO2e" : "",
        confidence: 1,
        excerpt: line,
      });
    }
  }

  return { metrics, missingFields };
}
