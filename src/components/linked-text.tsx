import { linkParts } from "@/lib/autolink";

// Only for text the owner typed: a stranger's text (a fetched page, an email) stays plain.
export function LinkedText({ text }: { text: string }) {
  return linkParts(text).map(({ text: part, href }, index) =>
    href ? (
      <a
        key={index}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 underline underline-offset-2 dark:text-blue-400"
      >
        {part}
      </a>
    ) : (
      part
    ),
  );
}
