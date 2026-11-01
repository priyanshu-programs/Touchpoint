import { isHttpUrl } from "./url";

const MAX_ADDRESS = 2000;

// Only endings people really type bare, so "Node.js" and "notes.md" stay words.
const BARE_DOMAIN = String.raw`(?:[a-z0-9-]+\.)+(?:com|org|net|io|co|in|ai|app|dev)(?![\w@-]|\.\w)(?:[/?#][^\s<>]*)?`;
const ADDRESS = new RegExp(
  String.raw`(?<![\w@.-])(?:https?://[^\s<>]+|www\.[^\s<>]+|${BARE_DOMAIN})`,
  "gi",
);

// What ends a sentence is not part of the address, nor a bracket opened before it.
function withoutTrailing(found: string) {
  let address = found;
  for (;;) {
    const last = address.at(-1);
    const unopened =
      (last === ")" && !address.includes("(")) ||
      (last === "]" && !address.includes("["));
    if (!unopened && !".,;:!?'\"".includes(last ?? "")) return address;
    address = address.slice(0, -1);
  }
}

function hrefOf(address: string) {
  const href = /^https?:\/\//i.test(address) ? address : `https://${address}`;
  return href.length <= MAX_ADDRESS && isHttpUrl(href) ? href : null;
}

export type LinkPart = { text: string; href?: string };

export function linkParts(text: string): LinkPart[] {
  const parts: LinkPart[] = [];
  let plain = "";
  let from = 0;
  for (const match of text.matchAll(ADDRESS)) {
    const address = withoutTrailing(match[0]);
    const href = hrefOf(address);
    if (!href) continue;
    plain += text.slice(from, match.index);
    if (plain) parts.push({ text: plain });
    plain = "";
    parts.push({ text: address, href });
    from = match.index + address.length;
  }
  plain += text.slice(from);
  if (plain) parts.push({ text: plain });
  return parts;
}

// The address, when the text is that and nothing else.
export function onlyAddress(text: string) {
  const parts = linkParts(text.trim());
  return parts.length === 1 ? (parts[0].href ?? null) : null;
}
