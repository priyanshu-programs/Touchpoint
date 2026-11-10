import { describe, expect, it } from "vitest";
import { audioType } from "@/modules/files/sniff";
import { sceneSave } from "@/modules/workflows/schema";
import {
  safeFileName,
  uniqueNames,
  voiceCards,
  voiceFileName,
  voiceZipName,
} from "./voice";

const mark = { key: "k1", title: "Pricing idea", seconds: 42, format: "webm" };
const card = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  version: 1,
  x: 0,
  y: 0,
  width: 300,
  height: 88,
  angle: 0,
  isDeleted: false,
  customData: { voice: mark },
  ...over,
});
const screen = { x: -100, y: -100, width: 1000, height: 800 };

describe("voice note files", () => {
  it("names a file 'Board - Heading', without characters a computer refuses", () => {
    expect(voiceFileName("Maple Studio", "Pricing idea", "webm")).toBe(
      "Maple Studio - Pricing idea.webm",
    );
    expect(voiceFileName("Q3: plans", 'Call w/ "Ana"?', "m4a")).toBe(
      "Q3 plans - Call w Ana.m4a",
    );
    expect(safeFileName("  ...  ")).toBe("Voice note");
    expect(safeFileName("ends with dots...")).toBe("ends with dots");
    expect(voiceZipName("Maple Studio")).toBe("Maple Studio - voice notes.zip");
  });

  it("numbers a name met again, ignoring case", () => {
    expect(uniqueNames(["A - x.webm", "a - X.webm", "A - x.webm", "B.webm"])).toEqual([
      "A - x.webm",
      "a - X (2).webm",
      "A - x (3).webm",
      "B.webm",
    ]);
  });
});

describe("voice cards on the screen", () => {
  it("finds the cards on the screen with their mark", () => {
    expect(voiceCards([card()], screen)).toEqual([
      { id: "c1", version: 1, x: 0, y: 0, width: 300, height: 88, angle: 0, ...mark },
    ]);
  });

  it("leaves out deleted cards, cards off the screen, and boxes with a broken mark", () => {
    expect(
      voiceCards(
        [
          card({ isDeleted: true }),
          card({ x: 5000 }),
          card({ customData: { voice: { ...mark, title: "" } } }),
          card({ customData: { sticky: true } }),
        ],
        screen,
      ),
    ).toEqual([]);
  });
});

describe("a voice card pasted on a workflow", () => {
  it("saves as a plain box", () => {
    const parsed = sceneSave.parse({
      version: 1,
      elements: [{ ...card(), type: "rectangle" }],
    });
    expect(JSON.parse(JSON.stringify(parsed.elements[0].customData))).toEqual({});
  });
});

describe("telling a recording by its bytes", () => {
  const webm = Buffer.concat([
    Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0x82, 0x84]),
    Buffer.from("webm"),
    Buffer.alloc(32),
  ]);
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from("ftypM4A "), Buffer.alloc(32)]);

  it("knows WebM and MP4", () => {
    expect(audioType(webm)).toBe("audio/webm");
    expect(audioType(mp4)).toBe("audio/mp4");
  });

  it("refuses anything else, Matroska video included", () => {
    const mkv = Buffer.from(webm.toString("latin1").replace("webm", "mkv "), "latin1");
    expect(audioType(mkv)).toBeNull();
    expect(audioType(Buffer.from("<svg onload=alert(1)>....................."))).toBeNull();
    expect(audioType(Buffer.from([0x1a, 0x45]))).toBeNull();
  });
});
