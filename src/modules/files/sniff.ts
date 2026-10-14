import { imageType } from "@/modules/enrichment/website/image";

const PDF = "application/pdf";
const OFFICE = [
  ["word/", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ["xl/", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  [
    "ppt/",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
] as const;

// What a browser may show in a tab of its own. Everything else is downloaded.
export const SHOWN_INLINE: ReadonlySet<string> = new Set([
  PDF,
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

const END_OF_DIRECTORY = 0x06054b50;
const DIRECTORY_ENTRY = 0x02014b50;
// The record that ends a zip is 22 bytes and may be followed by a comment.
const END_BYTES = 22;
const MAX_COMMENT = 0xffff;
const MAX_ENTRIES = 5_000;

// The names of what a zip holds, read from the list at its end and never by
// unpacking anything. Null when the bytes are not a zip that can be walked.
function zipNames(bytes: Buffer) {
  let end = -1;
  const lowest = Math.max(0, bytes.length - END_BYTES - MAX_COMMENT);
  for (let at = bytes.length - END_BYTES; at >= lowest; at--) {
    if (bytes.readUInt32LE(at) === END_OF_DIRECTORY) {
      end = at;
      break;
    }
  }
  if (end < 0) return null;

  const count = Math.min(bytes.readUInt16LE(end + 10), MAX_ENTRIES);
  let at = bytes.readUInt32LE(end + 16);
  const names: string[] = [];
  for (let entry = 0; entry < count; entry++) {
    if (at + 46 > bytes.length || bytes.readUInt32LE(at) !== DIRECTORY_ENTRY) {
      return null;
    }
    const name = bytes.readUInt16LE(at + 28);
    if (at + 46 + name > bytes.length) return null;
    names.push(bytes.toString("latin1", at + 46, at + 46 + name));
    at += 46 + name + bytes.readUInt16LE(at + 30) + bytes.readUInt16LE(at + 32);
  }
  return names;
}

// The kind of file, read from the bytes themselves: the name and the type a
// browser sends with an upload are only claims. Null for anything not kept,
// which includes whatever can carry script (SVG, HTML) and plain archives.
export function fileType(bytes: Buffer) {
  if (bytes.subarray(0, 5).toString("latin1") === "%PDF-") return PDF;
  const image = imageType(bytes);
  if (image) return image === "image/x-icon" ? null : image;
  if (bytes.subarray(0, 4).toString("latin1") !== "PK\u0003\u0004") return null;

  // A Word, Excel or PowerPoint file is a zip with a list of its parts and a
  // folder named for the program.
  const names = zipNames(bytes);
  if (!names?.includes("[Content_Types].xml")) return null;
  return (
    OFFICE.find(([folder]) => names.some((name) => name.startsWith(folder)))?.[1] ??
    null
  );
}
