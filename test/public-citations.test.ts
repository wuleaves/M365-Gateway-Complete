import { describe, expect, it } from "vitest";
import { CitationMarkerStreamFilter, stripInternalCitationMarkers } from "../src/public-citations";

describe("public citation marker cleanup", () => {
  it("removes private, HTML and glyph internal references", () => {
    const privateMarker = "\uE200cite\uE202turn0search1\uE201";
    expect(stripInternalCitationMarkers(`a${privateMarker}b`)).toBe("ab");
    expect(stripInternalCitationMarkers("a<cite>turn2news3</cite>b")).toBe("ab");
    expect(stripInternalCitationMarkers("aciteturn1search2turn1image3b")).toBe("ab");
  });

  it("preserves ordinary cite markup and removes a marker split across chunks", () => {
    expect(stripInternalCitationMarkers("<cite>ordinary source</cite>")).toBe("<cite>ordinary source</cite>");
    const filter = new CitationMarkerStreamFilter();
    const output = [
      filter.push("hello \uE200ci"),
      filter.push("te\uE202turn0"),
      filter.push("search1\uE201 world"),
      filter.flush(),
    ].join("");
    expect(output).toBe("hello  world");
  });
});
