const PRIVATE_CITATION_OPEN = "\uE200cite\uE202";
const PRIVATE_CITATION_CLOSE = "\uE201";
const GLYPH_CITATION_OPEN = "cite";
const GLYPH_CITATION_CLOSE = "";
const HTML_CITATION_OPEN = "<cite>";
const HTML_CITATION_CLOSE = "</cite>";
const ENTITY_NAMES = "Organization|Product|Person|Event|Location|DateTime|Quantity|URL|Reference|Topic|Skill|File|Image|Video|Audio|Code|Table|Math|Citation|Source|Query|Intent|Domain|Brand|Technology|Company|Team|Project|Tool|Model|Service|API|Dataset|Repository|Term|Definition|Entity|Concept".split("|");
const ENTITY_TAG = new RegExp(`</?(?:${ENTITY_NAMES.join("|")})\\b[^>]*>`, "gu");
const ENTITY_PREFIXES = ENTITY_NAMES.flatMap((name) => [`<${name}`, `</${name}`]);
const MAX_PENDING_MARKER_CHARACTERS = 1_024;

export function stripEntityTags(value: string): string { return value.replace(ENTITY_TAG, ""); }

/** Hold only a possible tag, never its text body. Ordinary HTML and partial
 * non-markup text are retained; split Microsoft entity tags are removed. */
class EntityTagStreamFilter {
  private pending = "";
  push(fragment: string): string {
    this.pending += fragment;
    let output = "";
    while (this.pending) {
      const start = this.pending.indexOf("<");
      if (start < 0) { output += this.pending; this.pending = ""; break; }
      output += this.pending.slice(0, start);
      this.pending = this.pending.slice(start);
      const end = this.pending.indexOf(">");
      if (end >= 0) {
        output += stripEntityTags(this.pending.slice(0, end + 1));
        this.pending = this.pending.slice(end + 1);
        continue;
      }
      const possible = ENTITY_PREFIXES.some((prefix) => prefix.startsWith(this.pending)
        || (this.pending.startsWith(prefix) && /^[\s/]/u.test(this.pending.slice(prefix.length, prefix.length + 1))));
      if (possible && this.pending.length <= MAX_PENDING_MARKER_CHARACTERS) break;
      output += "<";
      this.pending = this.pending.slice(1);
    }
    return output;
  }
  flush(): string { const rest = this.pending; this.pending = ""; return rest; }
}

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
  return stripEntityTags(text.replace(HTML_CITATION_PATTERN, "").replace(GLYPH_CITATION_PATTERN, ""));
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
  private readonly entities = new EntityTagStreamFilter();

  push(fragment: string): string {
    this.pending += fragment;
    let output = "";
    for (;;) {
      const found = firstMarker(this.pending);
      if (!found) {
        const keep = trailingMarkerPrefixLength(this.pending);
        output += this.pending.slice(0, this.pending.length - keep);
        this.pending = keep ? this.pending.slice(-keep) : "";
        return this.entities.push(output);
      }
      output += this.pending.slice(0, found.index);
      const contentStart = found.index + found.marker.open.length;
      const end = this.pending.indexOf(found.marker.close, contentStart);
      if (end < 0) {
        this.pending = this.pending.slice(found.index);
        if (this.pending.length > MAX_PENDING_MARKER_CHARACTERS) {
          output += found.marker.alwaysInternal ? "" : this.pending;
          this.pending = "";
        }
        return this.entities.push(output);
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
    const final = cleaned.includes(PRIVATE_CITATION_OPEN)
      ? cleaned.slice(0, cleaned.indexOf(PRIVATE_CITATION_OPEN))
      : PRIVATE_CITATION_OPEN.startsWith(cleaned) || GLYPH_CITATION_OPEN.startsWith(cleaned) ? "" : cleaned;
    return this.entities.push(final) + this.entities.flush();
  }
}
