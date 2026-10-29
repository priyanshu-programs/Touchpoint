import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Zip, ZipDeflate } from "fflate";
import { pool } from "@/db/client";
import { settings, user } from "@/db/schema";
import { dateIn } from "@/lib/time";
import { SHEETS, type Reader } from "./sheets";
import { EXPORTED_TABLES, tableName, tableRows } from "./tables";

type Piece = { file: string; text: string; end: boolean };

export const exportFileName = (today: string) => `touchpoint-export-${today}.zip`;

function readme(exportedAt: string, timezone: string, baseCurrency: string | null) {
  return [
    "Touchpoint export",
    "",
    `Made ${exportedAt}. Times in the spreadsheets are in ${timezone}.`,
    baseCurrency ? `Base currency: ${baseCurrency}.` : "",
    "",
    "data.json holds everything you keep in Touchpoint, table by table as it is stored,",
    "drawings included. It is the copy to keep as a backup.",
    "",
    "The csv folder holds the same records as spreadsheets that open in Excel or Google",
    "Sheets: companies, people, tasks, activities, materials and their sends, invoices",
    "and their lines, payments, workflows, brainstorm boards and the files you added.",
    "Amounts are plain numbers in the currency named beside them.",
    "",
    "Not included: your password and sign-in sessions, your Google client and the access",
    "it granted, and the contents of the files and pictures you uploaded (files.csv",
    "lists them; open them in Touchpoint).",
    "A cell that starts with = + - or @ has a ' put in front so a spreadsheet",
    "shows it as text instead of running it.",
    "",
  ].join("\r\n");
}

// Everything the export holds, file by file and a page of rows at a time. It reads
// from one snapshot, so data.json and the spreadsheets agree even while the owner
// keeps working in another tab.
async function* pieces(ownerId: string): AsyncGenerator<Piece> {
  const client = await pool.connect();
  let finished = false;
  try {
    await client.query("begin isolation level repeatable read read only");
    const db: Reader = drizzle(client);
    const [[owner], [setting]] = await Promise.all([
      db.select({ name: user.name, email: user.email }).from(user).where(eq(user.id, ownerId)),
      db.select().from(settings).where(eq(settings.ownerId, ownerId)),
    ]);
    const timezone = setting?.timezone ?? "UTC";
    const now = new Date();
    const context = { ownerId, timezone, today: dateIn(timezone, now) };

    yield {
      file: "README.txt",
      text: readme(now.toISOString(), timezone, setting?.baseCurrency ?? null),
      end: true,
    };

    const header = {
      format: "touchpoint-export",
      formatVersion: 1,
      exportedAt: now.toISOString(),
      timezone,
      baseCurrency: setting?.baseCurrency ?? null,
      owner,
    };
    yield { file: "data.json", text: `${JSON.stringify(header).slice(0, -1)},"tables":{`, end: false };
    for (const [index, table] of EXPORTED_TABLES.entries()) {
      yield { file: "data.json", text: `${index ? "," : ""}${JSON.stringify(tableName(table))}:[`, end: false };
      let first = true;
      for await (const rows of tableRows(db, table, ownerId)) {
        const text = rows.map((row) => JSON.stringify(row)).join(",");
        yield { file: "data.json", text: first ? text : `,${text}`, end: false };
        first = false;
      }
      yield { file: "data.json", text: "]", end: false };
    }
    yield { file: "data.json", text: "}}", end: true };

    for (const sheet of SHEETS) {
      const file = `csv/${sheet.file}`;
      for await (const text of sheet.lines(db, context)) yield { file, text, end: false };
      yield { file, text: "", end: true };
    }
    finished = true;
  } finally {
    await client.query(finished ? "commit" : "rollback").catch(() => undefined);
    client.release();
  }
}

// The export as a zip, written while it is read: each pull takes the next piece, so
// only one page of rows is ever held, and a download stopped part way ends the read.
export function exportZip(ownerId: string): ReadableStream<Uint8Array> {
  const source = pieces(ownerId);
  const encoder = new TextEncoder();
  let output!: ReadableStreamDefaultController<Uint8Array>;
  let sent = 0;
  const zip = new Zip((error, chunk, final) => {
    if (error) return output.error(error);
    sent += 1;
    output.enqueue(chunk);
    if (final) output.close();
  });
  let current: { name: string; file: ZipDeflate } | null = null;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      output = controller;
    },
    // A stream asks again only after a pull that gave it something, and the zip
    // holds small pieces back until it has enough to compress, so a pull goes on
    // until a chunk is out.
    async pull() {
      const before = sent;
      while (sent === before) {
        const next = await source.next();
        if (next.done) return zip.end();
        const { file, text, end } = next.value;
        if (current?.name !== file) {
          current = { name: file, file: new ZipDeflate(file, { level: 6 }) };
          zip.add(current.file);
        }
        current.file.push(encoder.encode(text), end);
        if (end) current = null;
      }
    },
    async cancel() {
      await source.return(undefined);
    },
  });
}
