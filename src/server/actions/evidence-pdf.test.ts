import { describe, expect, it } from "vitest";
import { evidencePdf, pdfSafe, wrap } from "./evidence-pdf";

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("evidencePdf", () => {
  it("writes a valid PDF whose cross-reference table points at each object", () => {
    const pdf = text(
      evidencePdf("Evidence for PayPal dispute PP-D-1", [
        { heading: "Shipping", lines: ["Delivered (Parcel Locker) \\ ok"] },
      ]),
    );
    expect(pdf.startsWith("%PDF-1.4\n")).toBe(true);
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(pdf).toContain("(Delivered \\(Parcel Locker\\) \\\\ ok) Tj");
    const xref = Number(/startxref\n(\d+)/.exec(pdf)![1]);
    expect(pdf.slice(xref, xref + 4)).toBe("xref");
    const offsets = [...pdf.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    offsets.forEach((offset, i) =>
      expect(pdf.slice(offset).startsWith(`${i + 1} 0 obj`)).toBe(true),
    );
  });

  it("runs onto more pages when the scans are many", () => {
    const lines = Array.from(
      { length: 120 },
      (_, i) => `Scan ${i + 1}: In Transit to Next Facility`,
    );
    const pdf = text(evidencePdf("Evidence", [{ heading: "Scans", lines }]));
    expect(/\/Count (\d+)/.exec(pdf)![1]).toBe("3");
  });

  it("keeps to characters the built-in fonts can show", () => {
    expect(pdfSafe("2 × Honey & Tobacco — “delivered” café")).toBe(
      '2 x Honey & Tobacco - "delivered" caf?',
    );
  });

  it("wraps long lines at word boundaries", () => {
    const lines = wrap("one two three four five six", 9);
    expect(lines).toEqual(["one two", "three", "four five", "six"]);
  });
});
