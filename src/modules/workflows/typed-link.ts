import { onlyAddress } from "@/lib/autolink";

export const LINK_BLUE = "#1971c2";

// What writing `before` into `text` does to the text and to what holds its link:
// the text itself, or the box it is written in. Null leaves both as they are, so
// a link the owner removed or set by hand and a colour they chose are kept.
export function typedLinkChange(
  before: string,
  text: { originalText: string; strokeColor: string },
  holder: { link: string | null },
  plainColor: string,
): { link: string | null; strokeColor: string } | null {
  if (text.originalText === before) return null;
  const was = onlyAddress(before);
  const now = onlyAddress(text.originalText);
  const madeByAddress = was !== null && holder.link === was;
  if (now) {
    if (holder.link && !madeByAddress) return null;
    return {
      link: now,
      strokeColor: was && text.strokeColor !== LINK_BLUE ? text.strokeColor : LINK_BLUE,
    };
  }
  if (!madeByAddress) return null;
  return {
    link: null,
    strokeColor: text.strokeColor === LINK_BLUE ? plainColor : text.strokeColor,
  };
}
