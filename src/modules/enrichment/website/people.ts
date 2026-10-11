import { Parser } from "htmlparser2";
import { clean } from "./extract";

export type Person = { name: string; title: string | null };

const MAX_PEOPLE = 12;
const MAX_PAIRS = 200;
const MAX_NAME = 60;
const MAX_TITLE = 150;
const HEADING = /^h[2-6]$/;
const HONORIFIC = /^(mr|mrs|ms|miss|dr|prof)\.?\s+/i;
// Two to four words, each starting with a capital: how a name is written and few headings are.
const NAME = /^\p{Lu}[\p{L}'’.-]*(?: \p{Lu}[\p{L}'’.-]*){1,3}$/u;
const POSITION =
  /\b(founder|owner|director|chief|ceo|partner|head|lead|manager|president)\b/i;
// Headings here name sections of the site, not people.
const CHROME = new Set(["footer", "nav", "header", "aside"]);
const UNSEEN = new Set(["script", "style"]);

// One list from every source: honorifics dropped, each person once.
export function listPeople(candidates: Person[]): Person[] {
  const seen = new Set<string>();
  const people: Person[] = [];
  for (const candidate of candidates) {
    const name = candidate.name.replace(HONORIFIC, "");
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    people.push({ name, title: candidate.title });
    if (people.length === MAX_PEOPLE) break;
  }
  return people;
}

// Reads a team page laid out as a name in a heading with the role under it.
export function extractPeople(html: string): Person[] {
  const pairs: { level: string; name: string; title: string | null }[] = [];
  let heading: { level: string; text: string } | null = null;
  // A name waiting for its role; `within` is how deep the role's first words sit.
  let pending: {
    level: string;
    name: string;
    text: string;
    within: number | null;
  } | null = null;
  let depth = 0;
  let chrome = 0;
  let unseen = false;

  const read = (text: string) => {
    if (heading) {
      if (heading.text.length < 200) heading.text += text;
    } else if (pending && pending.text.length < 400) {
      if (pending.within === null && text.trim()) pending.within = depth;
      pending.text += text;
    }
  };

  const settle = () => {
    if (!pending) return;
    const title = clean(pending.text, MAX_TITLE + 1);
    if (pairs.length < MAX_PAIRS) {
      pairs.push({
        level: pending.level,
        name: pending.name,
        // Longer than a role: a biography or the next section's opening line.
        title: title && title.length <= MAX_TITLE ? title : null,
      });
    }
    pending = null;
  };

  const parser = new Parser(
    {
      onopentag(name) {
        depth += 1;
        if (CHROME.has(name)) chrome += 1;
        else if (UNSEEN.has(name)) unseen = true;
        else if (HEADING.test(name)) {
          settle();
          if (chrome === 0) heading = { level: name, text: "" };
        } else {
          // Words on either side of a tag are separate words.
          read(" ");
        }
      },
      ontext(text) {
        if (!unseen) read(text);
      },
      onclosetag(name) {
        const closing = depth;
        depth = Math.max(0, depth - 1);
        if (CHROME.has(name)) chrome = Math.max(0, chrome - 1);
        else if (UNSEEN.has(name)) unseen = false;
        else if (heading && name === heading.level) {
          const stated = clean(heading.text, 80)?.replace(HONORIFIC, "") ?? "";
          heading = null;
          if (stated.length <= MAX_NAME && NAME.test(stated)) {
            pending = { level: name, name: stated, text: "", within: null };
          }
        } else if (pending?.within === closing) {
          // The element holding the first words after the name has ended.
          settle();
        } else {
          read(" ");
        }
      },
    },
    { decodeEntities: true },
  );
  parser.end(html);
  settle();

  // A level of headings lists people when someone on it holds a named position.
  const staffed = new Set(
    pairs
      .filter((pair) => pair.title && POSITION.test(pair.title))
      .map((pair) => pair.level),
  );
  return pairs
    .filter((pair) => staffed.has(pair.level))
    .map(({ name, title }) => ({ name, title }));
}
