import { describe, expect, it } from "vitest";
import { docx, pdf, pptx, xlsx, zip } from "@/test/files";
import { solid } from "@/test/pictures";
import { fileType } from "./sniff";

describe("fileType", () => {
  it("knows a PDF by how it begins", () => {
    expect(fileType(pdf())).toBe("application/pdf");
  });

  it.each(["png", "jpeg", "gif", "webp"] as const)("knows a %s picture", async (format) => {
    expect(fileType(await solid(format, 8, 8))).toBe(`image/${format}`);
  });

  it("tells Word, Excel and PowerPoint files apart by what the zip holds", () => {
    expect(fileType(docx())).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(fileType(xlsx())).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(fileType(pptx())).toBe(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    );
  });

  it.each([
    ["nothing", Buffer.alloc(0)],
    ["plain text", Buffer.from("Minutes of the meeting")],
    ["a text file that only says it is a PDF further in", Buffer.from("see %PDF-1.4")],
    ["a web page", Buffer.from("<!doctype html><script>alert(1)</script>")],
    ["an SVG", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')],
    ["a program", Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00])],
    ["an icon file", Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00])],
    ["an old Word file", Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])],
    ["a plain zip", zip(["notes.txt", "photo.png"])],
    ["a zip with a folder named for Word and no list of parts", zip(["word/a.xml"])],
    ["a zip with a list of parts and nothing a program made", zip(["[Content_Types].xml"])],
  ])("keeps no %s", (_label, bytes) => {
    expect(fileType(bytes)).toBeNull();
  });

  it("keeps no zip that is cut short or lies about what it holds", () => {
    const whole = docx();
    expect(fileType(whole.subarray(0, whole.length - 10))).toBeNull();
    expect(fileType(whole.subarray(0, 40))).toBeNull();

    // Its list is said to begin past the end of the file.
    const astray = Buffer.from(whole);
    astray.writeUInt32LE(0xffffff00, astray.length - 6);
    expect(fileType(astray)).toBeNull();

    // A name is said to be longer than what is left of the file.
    const long = Buffer.from(whole);
    long.writeUInt16LE(0xffff, long.readUInt32LE(long.length - 6) + 28);
    expect(fileType(long)).toBeNull();
  });

  it("is not slowed by a zip that claims more files than it has", () => {
    const greedy = Buffer.from(docx());
    greedy.writeUInt16LE(0xffff, greedy.length - 12);
    const began = Date.now();
    expect(fileType(greedy)).toBeNull();
    expect(Date.now() - began).toBeLessThan(100);
  });
});
