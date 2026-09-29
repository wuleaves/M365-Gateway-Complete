const PRIVATE_CITATION_OPEN = "\uE200cite\uE202";
const PRIVATE_CITATION_CLOSE = "\uE201";
const GLYPH_CITATION_OPEN = "cite";
const GLYPH_CITATION_CLOSE = "";
const HTML_CITATION_OPEN = "<cite>";
const HTML_CITATION_CLOSE = "</cite>";

const INTERNAL_TURN_REFERENCE = String.raw`turn\d+(?:search|news|image)\d+`;
const HTML_CITATION_PATTERN = new RegExp(
  String.raw`<cite>\s*${INTERNAL_TURN_REFERENCE}(?:\s*[,;]?\s*${INTERNAL_TURN_REFERENCE})*\s*</cite>`,
  "giu",
);
const GLYPH_CITATION_PATTERN = new RegExp(
  String.raw`cite(?:${INTERNAL_TURN_REFERENCE})+`,
  "giu",
);

/** Remove only Microsoft-internal citation control markers from public text. */
export function stripInternalCitationMarkers(value: string): string {
  let text = value;
  for (;;) {
    const start = text.indexOf(PRIVATE_CITATION_OPEN);
    if (start < 0) break;
    const end = text.indexOf(PRIVATE_CITATION_CLOSE, start + PRIVATE_CITATION_OPEN.length);
    if (end < 0) break;
    text = text.slice(0, start) + text.slice(end + PRIVATE_CITATION_CLOSE.length);
  }
  return text.replace(HTML_CITATION_PATTERN, "").replace(GLYPH_CITATION_PATTERN, "");
}

interface MarkerDefinition {
  open: string;
  close: string;
  alwaysInternal: boolean;
}

const STREAM_MARKERS: readonly MarkerDefinition[] = [
  { open: PRIVATE_CITATION_OPEN, close: PRIVATE_CITATION_CLOSE, alwaysInternal: true },
  { open: GLYPH_CITATION_OPEN, close: GLYPH_CITATION_CLOSE, alwaysInternal: false },
  { open: HTML_CITATION_OPEN, close: HTML_CITATION_CLOSE, alwaysInternal: false },
];

function firstMarker(value: string): { index: number; marker: MarkerDefinition } | null {
  let found: { index: number; marker: MarkerDefinition } | null = null;
  for (const marker of STREAM_MARKERS) {
    const index = value.indexOf(marker.open);
    if (index >= 0 && (!found || index < found.index)) found = { index, marker };
  }
  return found;
}

function trailingMarkerPrefixLength(value: string): number {
  let keep = 0;
  for (const marker of STREAM_MARKERS) {
    const maximum = Math.min(value.length, marker.open.length - 1);
    for (let length = maximum; length > keep; length -= 1) {
      if (value.endsWith(marker.open.slice(0, length))) {
        keep = length;
        break;
      }
    }
  }
  return keep;
}

function knownPublicMarker(marker: MarkerDefinition, complete: string): boolean {
  if (marker.alwaysInternal) return true;
  const pattern = marker.open === HTML_CITATION_OPEN ? HTML_CITATION_PATTERN : GLYPH_CITATION_PATTERN;
  pattern.lastIndex = 0;
  const matched = pattern.test(complete);
  pattern.lastIndex = 0;
  return matched;
}

/**
 * Citation control markers can be split across ChatHub frames. This filter
 * holds only a possible marker prefix and emits ordinary text immediately.
 */
export class CitationMarkerStreamFilter {
  private pending = "";

  push(fragment: string): string {
    this.pending += fragment;
    let output = "";
    for (;;) {
      const found = firstMarker(this.pending);
      if (!found) {
        const keep = trailingMarkerPrefixLength(this.pending);
        output += this.pending.slice(0, this.pending.length - keep);
        this.pending = keep ? this.pending.slice(-keep) : "";
        return output;
      }
      output += this.pending.slice(0, found.index);
      const contentStart = found.index + found.marker.open.length;
      const end = this.pending.indexOf(found.marker.close, contentStart);
      if (end < 0) {
        this.pending = this.pending.slice(found.index);
        return output;
      }
      const completeEnd = end + found.marker.close.length;
      const complete = this.pending.slice(found.index, completeEnd);
      if (!knownPublicMarker(found.marker, complete)) output += complete;
      this.pending = this.pending.slice(completeEnd);
    }
  }

  flush(): string {
    const pending = this.pending;
    this.pending = "";
    const cleaned = stripInternalCitationMarkers(pending);
    if (cleaned.includes(PRIVATE_CITATION_OPEN)) {
      return cleaned.slice(0, cleaned.indexOf(PRIVATE_CITATION_OPEN));
    }
    if (PRIVATE_CITATION_OPEN.startsWith(cleaned) || GLYPH_CITATION_OPEN.startsWith(cleaned)) return "";
    return cleaned;
  }
}
