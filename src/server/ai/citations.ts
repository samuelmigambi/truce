import "server-only";

/**
 * The drafter marks every factual sentence with the evidence it rests on, like "[E3]" or
 * "[E2, E5]". The marks never reach the buyer: they're taken out of the text as it streams, and
 * kept per sentence so the check knows what each sentence claims to rest on.
 */

const ID = "E\\d{1,3}";
const BODY = `${ID}(?:\\s*[,;]\\s*${ID})*`;
const MARK = new RegExp(`[ \\t]*\\[(${BODY})\\]`, "g");
const MARKS_AFTER_STOP = new RegExp(`([.!?])((?:[ \\t]*\\[${BODY}\\])+)`, "g");
const PARTIAL_MARK = /\[(E\d{0,3}(\s*[,;]\s*(E\d{0,3})?)*)?$/;
const PARTIAL_AT_END = /[ \t]*\[(E\d{0,3}(\s*[,;]\s*(E\d{0,3})?)*)?$/;
// Full stops that don't end a sentence: "18 Linden St. Apt 4", "e.g. this".
const SENTENCE_END =
  /(?<!\b(?:St|Ave|Apt|Rd|Blvd|Dr|Ln|Ct|Ste|Mr|Mrs|Ms|No|Inc|Co|Jr|Sr|vs|approx|e\.g|i\.e|U\.S)\.)(?<=[.!?]["'”’)\]]?)\s+(?=\S)/;

export interface CitedSentence {
  sentence: string;
  evidence: string[];
}

function idsIn(text: string): string[] {
  return [...new Set(text.match(/E\d{1,3}/g) ?? [])];
}

/** Marks written after a full stop belong to the sentence before it: "Oct 23. [E3]" is "Oct 23 [E3]." */
function pullMarksBack(raw: string): string {
  return raw.replace(MARKS_AFTER_STOP, "$2$1");
}

/** Spaces left where marks were taken out. Line breaks stay. */
function tidy(text: string): string {
  return text
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,!?;:])/g, "$1")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

/** The draft as the buyer or PayPal reads it: no marks. */
export function stripCitations(raw: string): string {
  return tidy(pullMarksBack(raw).replace(MARK, ""));
}

/** The clean text, and each sentence with the evidence IDs it cites. */
export function splitCitations(raw: string): { text: string; sentences: CitedSentence[] } {
  const moved = pullMarksBack(raw);
  const sentences: CitedSentence[] = [];
  for (const paragraph of moved.split(/\n+/)) {
    for (const piece of paragraph.split(SENTENCE_END)) {
      const sentence = tidy(piece.replace(MARK, ""));
      if (sentence)
        sentences.push({
          sentence,
          evidence: idsIn([...piece.matchAll(MARK)].map((m) => m[1]).join(",")),
        });
    }
  }
  return { text: stripCitations(raw), sentences };
}

/**
 * Takes marks out of streamed text as it arrives. An unfinished "[E…" (and the spaces before
 * it) waits until it's clearly a mark or clearly not.
 */
export class CitationFilter {
  private held = "";

  push(delta: string): string {
    this.held += delta;
    return this.release(false);
  }

  flush(): string {
    return this.release(true);
  }

  private release(final: boolean): string {
    let text = this.held.replace(MARK, "");
    let keep = "";
    if (final) {
      text = text.replace(PARTIAL_AT_END, "");
    } else {
      const open = text.lastIndexOf("[");
      if (open >= 0 && text.length - open <= 24 && PARTIAL_MARK.test(text.slice(open))) {
        let start = open;
        while (start > 0 && (text[start - 1] === " " || text[start - 1] === "\t")) start--;
        keep = text.slice(start);
        text = text.slice(0, start);
      } else {
        const trailing = /[ \t]+$/.exec(text);
        if (trailing) {
          keep = trailing[0];
          text = text.slice(0, trailing.index);
        }
      }
    }
    this.held = keep;
    return text;
  }
}
