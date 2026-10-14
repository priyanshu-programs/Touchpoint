// Files as they would be uploaded, small enough to write out by hand.

export const pdf = (text = "") => Buffer.from(`%PDF-1.4\n${text}\n%%EOF\n`);

// A zip holding an empty file under each name, stored without compression.
export function zip(names: string[]) {
  const files: Buffer[] = [];
  const directory: Buffer[] = [];
  let at = 0;
  for (const name of names) {
    const file = Buffer.alloc(30 + name.length);
    file.writeUInt32LE(0x04034b50, 0);
    file.writeUInt16LE(20, 4);
    file.writeUInt16LE(name.length, 26);
    file.write(name, 30, "latin1");

    const entry = Buffer.alloc(46 + name.length);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(at, 42);
    entry.write(name, 46, "latin1");

    files.push(file);
    directory.push(entry);
    at += file.length;
  }
  const listed = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(names.length, 8);
  end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(listed.length, 12);
  end.writeUInt32LE(at, 16);
  return Buffer.concat([...files, listed, end]);
}

const PARTS = "[Content_Types].xml";
export const docx = () => zip([PARTS, "_rels/.rels", "word/document.xml"]);
export const xlsx = () => zip([PARTS, "_rels/.rels", "xl/workbook.xml"]);
export const pptx = () => zip([PARTS, "_rels/.rels", "ppt/presentation.xml"]);
