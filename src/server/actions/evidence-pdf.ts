import "server-only";

/**
 * A plain one-file PDF for PayPal's provide-evidence call: the order, the payment, the shipping
 * scans and the seller's statement, in Helvetica on US Letter. Text only, so it needs no library.
 */

export interface PdfSection {
  heading: string;
  lines: string[];
}

const PAGE = { width: 612, height: 792, margin: 56 };
const BODY = { size: 10.5, leading: 15 };
const HEADING = { size: 12, leading: 22 };
const TITLE = { size: 16, leading: 26 };
/** Helvetica averages about half an em per character; wrap a little inside that. */
const WRAP_AT = Math.floor((PAGE.width - 2 * PAGE.margin) / (BODY.size * 0.52));

/** PDF's built-in fonts take Latin text; anything else becomes its nearest plain form. */
export function pdfSafe(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/×/g, "x")
    .replace(/…/g, "...")
    .replace(/•/g, "-")
    .replace(/[^\x20-\x7E]/g, "?");
}

function escape(text: string): string {
  return pdfSafe(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** Splits a paragraph into lines that fit the page. */
export function wrap(text: string, width = WRAP_AT): string[] {
  const out: string[] = [];
  for (const paragraph of text.split(/\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && line.length + 1 + word.length > width) {
        out.push(line);
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
    }
    out.push(line);
  }
  return out;
}

type Run = { font: "F1" | "F2"; size: number; leading: number; text: string };

/** Lays the runs out top to bottom, starting a new page when one fills up. */
function paginate(runs: Run[]): Run[][] {
  const pages: Run[][] = [[]];
  let y = PAGE.height - PAGE.margin;
  for (const run of runs) {
    if (y - run.leading < PAGE.margin) {
      pages.push([]);
      y = PAGE.height - PAGE.margin;
    }
    pages.at(-1)!.push(run);
    y -= run.leading;
  }
  return pages;
}

function pageStream(runs: Run[]): string {
  let y = PAGE.height - PAGE.margin;
  const parts: string[] = [];
  for (const run of runs) {
    y -= run.leading;
    parts.push(
      `BT /${run.font} ${run.size} Tf ${PAGE.margin} ${y.toFixed(1)} Td (${escape(run.text)}) Tj ET`,
    );
  }
  return parts.join("\n");
}

export function evidencePdf(title: string, sections: PdfSection[]): Uint8Array {
  const runs: Run[] = [{ font: "F2", size: TITLE.size, leading: TITLE.leading, text: title }];
  for (const section of sections) {
    runs.push({ font: "F2", size: HEADING.size, leading: HEADING.leading, text: section.heading });
    for (const line of section.lines.flatMap((l) => wrap(l))) {
      runs.push({ font: "F1", size: BODY.size, leading: BODY.leading, text: line });
    }
  }
  const pages = paginate(runs);

  const objects: string[] = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[4] =
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  const kids: string[] = [];
  pages.forEach((page, i) => {
    const pageId = 5 + i * 2;
    const contentId = pageId + 1;
    const stream = pageStream(page);
    kids.push(`${pageId} 0 R`);
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  objects[2] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages.length} >>`;

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = out.length;
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++)
    out += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  // Everything above is plain ASCII, so string offsets are byte offsets.
  return new TextEncoder().encode(out);
}
