import { Fragment, type ReactNode } from "react";

/**
 * Just enough Markdown for chat answers: paragraphs, lists, bold, italics and code. Everything
 * becomes React elements, so nothing the model writes is ever treated as HTML.
 */

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;
  let last = 0;
  let i = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const token = match[0];
    const k = `${key}-${i++}`;
    if (token.startsWith("**"))
      out.push(
        <strong key={k} className="text-ink font-semibold">
          {token.slice(2, -2)}
        </strong>,
      );
    else if (token.startsWith("`"))
      out.push(
        <code key={k} className="bg-ink/[0.06] rounded-[5px] px-1 py-px text-[0.92em]">
          {token.slice(1, -1)}
        </code>,
      );
    else out.push(<em key={k}>{token.slice(1, -1)}</em>);
    last = at + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block =
  | { kind: "p"; text: string }
  | { kind: "h"; text: string }
  | { kind: "ul" | "ol"; items: string[] };

function blocks(source: string): Block[] {
  const result: Block[] = [];
  const lines = source.replace(/\r/g, "").split("\n");
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) result.push({ kind: "p", text: paragraph.join(" ") });
    paragraph = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    const numbered = line.match(/^\d+[.)]\s+(.*)$/);
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    if (bullet || numbered) {
      flush();
      const kind = bullet ? "ul" : "ol";
      const text = (bullet ?? numbered)![1] ?? "";
      const prev = result[result.length - 1];
      if (prev && prev.kind === kind) prev.items.push(text);
      else result.push({ kind, items: [text] });
    } else if (heading) {
      flush();
      result.push({ kind: "h", text: heading[1] ?? "" });
    } else {
      paragraph.push(line);
    }
  }
  flush();
  return result;
}

export function Markdown({ text }: { text: string }) {
  return (
    <div className="text-ink space-y-2.5 text-[14.5px] leading-relaxed">
      {blocks(text).map((block, b) => {
        const key = `b${b}`;
        if (block.kind === "p") return <p key={key}>{inline(block.text, key)}</p>;
        if (block.kind === "h")
          return (
            <p key={key} className="font-semibold">
              {inline(block.text, key)}
            </p>
          );
        const items = block.items.map((item, i) => (
          <li key={i} className="pl-0.5">
            <Fragment>{inline(item, `${key}-${i}`)}</Fragment>
          </li>
        ));
        return block.kind === "ul" ? (
          <ul key={key} className="marker:text-ink-3 list-disc space-y-1 pl-5">
            {items}
          </ul>
        ) : (
          <ol key={key} className="marker:text-ink-3 list-decimal space-y-1 pl-5">
            {items}
          </ol>
        );
      })}
    </div>
  );
}
