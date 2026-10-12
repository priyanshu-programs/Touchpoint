import { FetchError, type Fetcher } from "@/lib/safe-fetch";
import {
  clean,
  CONTACT_PATH,
  decoded,
  email,
  ownEmail,
  phone,
  photoUrl,
  TEAM_PATH,
  webUrl,
} from "./extract";
import {
  MAX_NAME,
  MAX_TITLE,
  NAME,
  plainName,
  staffOnly,
  type Person,
  type Scope,
} from "./people";

// Jina Reader draws a page in a browser of its own and answers with what a visitor
// would read, as markdown. Free and keyless; it learns the address it is asked for.
const READER = "https://r.jina.ai/";
const RENDER_TIMEOUT_MS = 10_000;
const MAX_RENDER_BYTES = 500_000;
// The answer opens with the page's title and address, then this line, then the page.
const BODY_MARK = "Markdown Content:";

const MAX_LINES = 5_000;
const MAX_LINE = 2_000;
const MAX_PAIRS = 200;
const MAX_IMAGES = 500;
const MAX_CONTACT_LINKS = 20;
const MAX_LABEL = 300;
const MAX_ABOUT_HEADINGS = 20;
const HEADING = /^(#{1,6})\s+(.+)$/;
// How the reader labels a picture ahead of its own description.
const IMAGE_LABEL = /^Image \d+:?\s*/;

type Link = {
  start: number;
  end: number;
  image: boolean;
  label: string;
  target: string;
};

// Finds [label](target) and ![label](target) by walking the line once. A pattern
// would do it in one expression, and take minutes over a line written to make it.
function links(line: string) {
  const found: Link[] = [];
  let from = 0;
  for (;;) {
    const middle = line.indexOf("](", from);
    if (middle === -1) break;
    const close = line.indexOf(")", middle + 2);
    // No bracket closes after this point, so no later link can end either.
    if (close === -1) break;
    const reach = Math.max(from, middle - MAX_LABEL);
    const open = line.slice(reach, middle).lastIndexOf("[");
    if (open === -1) {
      from = middle + 2;
      continue;
    }
    const start = reach + open;
    const image = start > from && line[start - 1] === "!";
    found.push({
      start: image ? start - 1 : start,
      end: close + 1,
      image,
      label: line.slice(start + 1, middle),
      // A title in quotes may follow the address.
      target: line.slice(middle + 2, close).trim().split(/\s/, 1)[0],
    });
    from = close + 1;
  }
  return found;
}

// The page as a browser draws it, or null when the reader cannot or will not say.
export async function renderedPage(
  url: string,
  fetcher: Fetcher,
  deadline: number,
) {
  try {
    const answer = await fetcher(READER + url, {
      maxBytes: MAX_RENDER_BYTES,
      deadline,
      accept: "text/plain",
      timeoutMs: RENDER_TIMEOUT_MS,
    });
    if (answer.status < 200 || answer.status >= 300 || answer.truncated) {
      return null;
    }
    const text = answer.body.toString("utf8");
    const at = text.indexOf(BODY_MARK);
    return at === -1 ? text : text.slice(at + BODY_MARK.length);
  } catch (error) {
    // The site itself was read; going without its drawn page is only less to show.
    if (error instanceof FetchError) return null;
    throw error;
  }
}

export type Drawn = {
  phone: string | null;
  email: string | null;
  contactPage: string | null;
  teamPage: string | null;
  people: Person[];
  // The page's first headings: how it introduces the company, for the industry guess.
  about: string | null;
};

// Link and emphasis marks off, so a heading or a role reads as its words.
function words(line: string, found: Link[]) {
  let text = "";
  let at = 0;
  for (const link of found) {
    text += line.slice(at, link.start) + (link.image ? " " : link.label);
    at = link.end;
  }
  return (text + line.slice(at)).replace(/[*_`]+/g, "");
}

// Reads a drawn page for what the HTML reader takes from tags: contact links, the
// site's own team and contact pages, and names in headings with the role under each.
export function readMarkdown(markdown: string, baseUrl: string, scope: Scope): Drawn {
  const site = new URL(baseUrl).hostname.toLowerCase();
  const phones: string[] = [];
  const emails: string[] = [];
  const images: { label: string; url: string }[] = [];
  const pairs: {
    level: string;
    name: string;
    title: string | null;
    section: string | null;
  }[] = [];
  const sections = new Map<number, string>();
  const headings: string[] = [];
  let contactPage: string | null = null;
  let teamPage: string | null = null;
  // The name whose role has not been read yet.
  let awaiting: (typeof pairs)[number] | null = null;

  for (const raw of markdown.split("\n", MAX_LINES)) {
    const line = raw.slice(0, MAX_LINE).trim();
    if (!line) continue;

    const found = links(line);
    for (const { image, label, target } of found) {
      if (!target) continue;
      if (image) {
        const url = photoUrl(target, baseUrl);
        if (url && images.length < MAX_IMAGES) {
          images.push({ label: label.replace(IMAGE_LABEL, "").toLowerCase(), url });
        }
      } else if (/^tel:/i.test(target)) {
        if (phones.length < MAX_CONTACT_LINKS) phones.push(decoded(target));
      } else if (/^mailto:/i.test(target)) {
        if (emails.length < MAX_CONTACT_LINKS) emails.push(decoded(target));
      } else if (!contactPage || !teamPage) {
        const url = webUrl(target, baseUrl);
        const page = url && new URL(url);
        if (!page || page.hostname.toLowerCase() !== site) continue;
        page.hash = "";
        if (CONTACT_PATH.test(page.pathname)) contactPage ??= page.href;
        else if (TEAM_PATH.test(page.pathname)) teamPage ??= page.href;
      }
    }

    const heading = HEADING.exec(line);
    if (heading) {
      awaiting = null;
      const depth = heading[1].length;
      const said =
        clean(words(line, found).replace(/^#+\s+/, "").replace(/\s#+$/, ""), 80) ?? "";
      const stated = plainName(said);
      let section: string | null = null;
      for (let above = depth - 1; above >= 1 && section === null; above--) {
        section = sections.get(above) ?? null;
      }
      for (const level of [...sections.keys()]) {
        if (level >= depth) sections.delete(level);
      }
      if (said) sections.set(depth, said);
      if (said && headings.length < MAX_ABOUT_HEADINGS) headings.push(said);
      if (
        depth > 1 &&
        stated.length <= MAX_NAME &&
        NAME.test(stated) &&
        pairs.length < MAX_PAIRS
      ) {
        awaiting = { level: `h${depth}`, name: stated, title: null, section };
        pairs.push(awaiting);
      }
    } else if (awaiting) {
      const title = clean(words(line, found), MAX_TITLE + 1);
      // A line that is only a picture says nothing yet; the role may follow it.
      if (!title) continue;
      // Longer than a role: a biography or the next section's opening line.
      if (title.length <= MAX_TITLE) awaiting.title = title;
      awaiting = null;
    }
  }

  return {
    phone: phones.map(phone).find((value) => value !== null) ?? null,
    email: ownEmail(
      emails.map(email).filter((address) => address !== null),
      site,
    ),
    contactPage,
    teamPage,
    people: staffOnly(pairs, scope).map(({ name, title }) => ({
      name,
      title,
      // No cards to go by here, only what each picture is described as.
      photo:
        images.find(({ label }) => label.endsWith(name.toLowerCase()))?.url ?? null,
    })),
    about: headings.join(" ") || null,
  };
}
