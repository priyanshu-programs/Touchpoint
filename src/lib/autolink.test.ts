import { describe, expect, it } from "vitest";
import { linkParts, onlyAddress } from "./autolink";

describe("onlyAddress", () => {
  it.each([
    ["https://maple.test/pricing", "https://maple.test/pricing"],
    ["http://maple.test", "http://maple.test"],
    ["HTTPS://maple.test", "HTTPS://maple.test"],
    ["www.maple.test", "https://www.maple.test"],
    ["maple.com", "https://maple.com"],
    ["maple.co.in/about?x=1#top", "https://maple.co.in/about?x=1#top"],
    ["  https://maple.test  ", "https://maple.test"],
    ["https://en.wikipedia.org/wiki/Maple_(tree)", "https://en.wikipedia.org/wiki/Maple_(tree)"],
  ])("reads %s as an address", (text, href) => {
    expect(onlyAddress(text)).toBe(href);
  });

  it.each([
    "see https://maple.test for pricing",
    "https://maple.test https://oak.test",
    "Node.js",
    "notes.md",
    "maple.com.au",
    "hello@maple.com",
    "first.co@maple.com",
    "javascript:alert(1)",
    "data:text/html,hello",
    "https://",
    "",
  ])("leaves %j alone", (text) => {
    expect(onlyAddress(text)).toBeNull();
  });

  it("leaves what ends a sentence outside the address", () => {
    expect(onlyAddress("https://maple.test.")).toBeNull();
    expect(linkParts("https://maple.test.")).toEqual([
      { text: "https://maple.test", href: "https://maple.test" },
      { text: "." },
    ]);
  });

  it("refuses an address past the length a link may have", () => {
    expect(onlyAddress(`https://maple.test/${"a".repeat(2000)}`)).toBeNull();
  });
});

describe("linkParts", () => {
  it("keeps the words around the addresses, exactly as typed", () => {
    expect(linkParts("Call (see maple.com), then\nhttps://oak.test/a!")).toEqual([
      { text: "Call (see " },
      { text: "maple.com", href: "https://maple.com" },
      { text: "), then\n" },
      { text: "https://oak.test/a", href: "https://oak.test/a" },
      { text: "!" },
    ]);
  });

  it("gives text with no address back whole", () => {
    expect(linkParts("Nothing here.")).toEqual([{ text: "Nothing here." }]);
    expect(linkParts("")).toEqual([]);
  });

  it("does not read markup as anything but text", () => {
    expect(linkParts('<a href="javascript:alert(1)">x</a>')).toEqual([
      { text: '<a href="javascript:alert(1)">x</a>' },
    ]);
  });
});
