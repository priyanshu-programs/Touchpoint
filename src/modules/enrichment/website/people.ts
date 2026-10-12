import { Parser } from "htmlparser2";
import { clean, photoUrl } from "./extract";

export type Person = {
  name: string;
  title: string | null;
  // The address of a picture shown beside the name, not the picture itself.
  photo: string | null;
};

const MAX_PEOPLE = 12;
const MAX_PAIRS = 200;
const MAX_IMAGES = 500;
// Places are compared from the outside in; past this depth every card looks the same and gets no picture.
const MAX_DEPTH = 128;
export const MAX_NAME = 60;
export const MAX_TITLE = 150;
// How far up from a name its card can reach; further up is the page, not the card.
const CARD_REACH = 4;
const MIN_PHOTO_SIDE = 40;
const HEADING = /^h[1-6]$/;
const HONORIFIC = /^(mr|mrs|ms|miss|dr|prof)\.?\s+/i;
// A chartered accountant's prefix; in capitals only, so nobody called Ca loses a name.
const CHARTERED = /^CA\.?\s+/;
// Two to four words, each starting with a capital: how a name is written and few headings are.
export const NAME = /^\p{Lu}[\p{L}'’.-]*(?: \p{Lu}[\p{L}'’.-]*){1,3}$/u;
const POSITION =
  /\b(founder|owner|director|chief|ceo|partner|head|lead|manager|president)\b/i;
// A heading that says the names under it are the company's own people.
const TEAM_SECTION =
  /\b(team|leadership|founders?|management|directors|our people)\b/i;
// "Join our team" is followed by openings, not by people.
const RECRUITING = /\b(join|careers?|hiring|jobs?|vacanc(y|ies)|openings?)\b/i;
// Headings here name sections of the site, not people.
const CHROME = new Set(["footer", "nav", "header", "aside"]);
const UNSEEN = new Set(["script", "style"]);

export const plainName = (name: string) =>
  name.replace(HONORIFIC, "").replace(CHARTERED, "");

// A team page lists people wherever someone at that heading level holds a named
// position. Any other page mixes people with services and customers, so there a
// name counts only under a heading that says it introduces the team.
export type Scope = "page" | "section";

export function staffOnly<
  T extends { level: string; title: string | null; section: string | null },
>(pairs: T[], scope: Scope): T[] {
  if (scope === "section") {
    return pairs.filter(
      ({ section }) =>
        section !== null && TEAM_SECTION.test(section) && !RECRUITING.test(section),
    );
  }
  const staffed = new Set(
    pairs
      .filter((pair) => pair.title && POSITION.test(pair.title))
      .map((pair) => pair.level),
  );
  return pairs.filter((pair) => staffed.has(pair.level));
}

// One list from every source: honorifics dropped, each person once.
export function listPeople(candidates: Person[]): Person[] {
  const seen = new Set<string>();
  const people: Person[] = [];
  for (const candidate of candidates) {
    const name = plainName(candidate.name);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    people.push({ ...candidate, name });
    if (people.length === MAX_PEOPLE) break;
  }
  return people;
}

// Where an element sits: the numbers of the elements around it, outermost first.
type Place = number[];

function shared(a: Place, b: Place) {
  let length = 0;
  while (length < a.length && length < b.length && a[length] === b[length]) {
    length += 1;
  }
  return length;
}

// Lazy-loading pages keep the real address out of `src` until the picture scrolls into view.
function imageAddress(attributes: Record<string, string>, baseUrl: string) {
  const declared = [attributes.width, attributes.height]
    .map((side) => Number.parseInt(side ?? "", 10))
    .filter((side) => !Number.isNaN(side));
  if (declared.some((side) => side < MIN_PHOTO_SIDE)) return null;
  const candidates = [
    attributes.src,
    attributes["data-src"],
    attributes["data-lazy-src"],
    attributes.srcset?.trim().split(/[\s,]/)[0],
  ];
  for (const candidate of candidates) {
    const url = photoUrl(candidate, baseUrl);
    if (url) return url;
  }
  return null;
}

// Reads a page laid out as a name in a heading with the role under it,
// and the picture in the same card when there is one.
export function extractPeople(
  html: string,
  baseUrl: string,
  scope: Scope = "page",
): Person[] {
  const pairs: {
    level: string;
    name: string;
    title: string | null;
    section: string | null;
    place: Place;
  }[] = [];
  const images: { place: Place; url: string }[] = [];
  let heading: { level: string; text: string; place: Place } | null = null;
  // A name waiting for its role; `within` is how deep the role's first words sit.
  let pending: {
    level: string;
    name: string;
    text: string;
    within: number | null;
    section: string | null;
    place: Place;
  } | null = null;
  // The latest heading at each level above the one being read.
  const sections = new Map<number, string>();
  const place: Place = [];
  let opened = 0;
  let chrome = 0;
  let unseen = false;

  const read = (text: string) => {
    if (heading) {
      if (heading.text.length < 200) heading.text += text;
    } else if (pending && pending.text.length < 400) {
      if (pending.within === null && text.trim()) pending.within = place.length;
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
        section: pending.section,
        place: pending.place,
      });
    }
    pending = null;
  };

  const parser = new Parser(
    {
      onopentag(name, attributes) {
        opened += 1;
        place.push(opened);
        if (CHROME.has(name)) chrome += 1;
        else if (UNSEEN.has(name)) unseen = true;
        else if (HEADING.test(name)) {
          settle();
          if (chrome === 0) {
            heading = { level: name, text: "", place: place.slice(0, MAX_DEPTH) };
          }
        } else {
          if (name === "img" && chrome === 0 && images.length < MAX_IMAGES) {
            const url = imageAddress(attributes, baseUrl);
            if (url) images.push({ place: place.slice(0, MAX_DEPTH), url });
          }
          // Words on either side of a tag are separate words.
          read(" ");
        }
      },
      ontext(text) {
        if (!unseen) read(text);
      },
      onclosetag(name) {
        const closing = place.length;
        place.pop();
        if (CHROME.has(name)) chrome = Math.max(0, chrome - 1);
        else if (UNSEEN.has(name)) unseen = false;
        else if (heading && name === heading.level) {
          const said = clean(heading.text, 80) ?? "";
          const stated = plainName(said);
          const at = heading.place;
          heading = null;
          const depth = Number(name[1]);
          let section: string | null = null;
          for (let above = depth - 1; above >= 1 && section === null; above--) {
            section = sections.get(above) ?? null;
          }
          for (const level of [...sections.keys()]) {
            if (level >= depth) sections.delete(level);
          }
          if (said) sections.set(depth, said);
          // The page's own title is never one of its people.
          if (depth > 1 && stated.length <= MAX_NAME && NAME.test(stated)) {
            pending = {
              level: name,
              name: stated,
              text: "",
              within: null,
              section,
              place: at,
            };
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

  return staffOnly(pairs, scope).map((pair) => {
    // The card is whatever holds this name and no other; its first picture is the person's.
    const others = Math.max(
      0,
      ...pairs
        .filter((other) => other !== pair)
        .map((other) => shared(pair.place, other.place)),
    );
    const own = images.find((image) => {
      const common = shared(pair.place, image.place);
      return common > others && pair.place.length - common <= CARD_REACH;
    });
    return { name: pair.name, title: pair.title, photo: own?.url ?? null };
  });
}
