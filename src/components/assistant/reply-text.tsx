import { Fragment, type ReactNode } from "react";

// The small part of Markdown a reply uses, drawn as React elements: never as HTML, so
// nothing a model writes can become markup.
type Block =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; lines: string[] }
  | { kind: "list"; ordered: boolean; items: string[] };

const BULLET = /^\s*(?:[-*•])\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;
// A line that is bold and nothing else reads as a heading.
const BOLD_LINE = /^\s*\*\*([^*]+?)\*\*:?\s*$/;

function blocksOf(text: string): Block[] {
  const blocks: Block[] = [];
  for (const line of text.split("\n")) {
    const last = blocks[blocks.length - 1];
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    const heading = HEADING.exec(line) ?? BOLD_LINE.exec(line);
    if (!line.trim()) {
      blocks.push({ kind: "paragraph", lines: [] });
    } else if (bullet || numbered) {
      const ordered = Boolean(numbered);
      const item = (bullet ?? numbered)![1];
      if (last?.kind === "list" && last.ordered === ordered) last.items.push(item);
      else blocks.push({ kind: "list", ordered, items: [item] });
    } else if (heading) {
      blocks.push({ kind: "heading", text: heading[1] });
    } else if (last?.kind === "paragraph") {
      last.lines.push(line);
    } else if (last?.kind === "list" && /^\s+/.test(line)) {
      last.items[last.items.length - 1] += ` ${line.trim()}`;
    } else {
      blocks.push({ kind: "paragraph", lines: [line] });
    }
  }
  return blocks.filter((block) => block.kind !== "paragraph" || block.lines.length > 0);
}

const INLINE = /(\*\*[^*]+?\*\*|__[^_]+?__|`[^`]+?`|\*[^*\s][^*]*?\*|_[^_\s][^_]*?_)/g;

function inline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, index) => {
    if (/^(\*\*|__).+\1$/.test(part)) {
      return (
        <strong key={index} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (/^`.+`$/.test(part)) {
      return (
        <code key={index} className="rounded bg-background/60 px-1 py-0.5 font-mono text-[0.85em]">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (/^([*_]).+\1$/.test(part)) return <em key={index}>{part.slice(1, -1)}</em>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}

export function ReplyText({ text }: { text: string }) {
  return (
    <div className="grid gap-2.5">
      {blocksOf(text).map((block, index) => {
        if (block.kind === "heading") {
          return (
            <p key={index} className="font-semibold text-foreground">
              {inline(block.text)}
            </p>
          );
        }
        if (block.kind === "list") {
          const List = block.ordered ? "ol" : "ul";
          return (
            <List
              key={index}
              className={
                block.ordered
                  ? "grid list-decimal gap-1 pl-5 marker:text-muted-foreground"
                  : "grid list-disc gap-1 pl-5 marker:text-chart-bar dark:marker:text-primary"
              }
            >
              {block.items.map((item, at) => (
                <li key={at} className="pl-1">
                  {inline(item)}
                </li>
              ))}
            </List>
          );
        }
        return (
          <p key={index} className="whitespace-pre-wrap">
            {inline(block.lines.join("\n"))}
          </p>
        );
      })}
    </div>
  );
}
