import { describe, expect, it } from "vitest";
import { LINK_BLUE, typedLinkChange } from "./typed-link";

const PLAIN = "#1e1e1e";
const A = "https://maple.test";
const B = "https://oak.test";
const text = (originalText: string, strokeColor = PLAIN) => ({ originalText, strokeColor });

describe("typedLinkChange", () => {
  it("links new text that is only an address, in blue", () => {
    expect(typedLinkChange("", text(A), { link: null }, PLAIN)).toEqual({
      link: A,
      strokeColor: LINK_BLUE,
    });
  });

  it("leaves a sentence with an address in it plain", () => {
    expect(typedLinkChange("", text(`see ${A} now`), { link: null }, PLAIN)).toBeNull();
  });

  it("does nothing when the text did not change, so a removed link stays removed", () => {
    expect(typedLinkChange(A, text(A), { link: null }, PLAIN)).toBeNull();
  });

  it("leaves a link set by hand on the box", () => {
    expect(typedLinkChange("", text(A), { link: B }, PLAIN)).toBeNull();
    expect(typedLinkChange(A, text("words"), { link: B }, PLAIN)).toBeNull();
  });

  it("follows an address edited into another", () => {
    expect(typedLinkChange(A, text(B, LINK_BLUE), { link: A }, PLAIN)).toEqual({
      link: B,
      strokeColor: LINK_BLUE,
    });
  });

  it("keeps a colour the owner chose when one address becomes another", () => {
    expect(typedLinkChange(A, text(B, "#e03131"), { link: A }, PLAIN)).toEqual({
      link: B,
      strokeColor: "#e03131",
    });
  });

  it("takes the link and the blue off an address edited into words", () => {
    expect(typedLinkChange(A, text("words", LINK_BLUE), { link: A }, PLAIN)).toEqual({
      link: null,
      strokeColor: PLAIN,
    });
  });

  it("keeps a colour the owner chose when an address is edited into words", () => {
    expect(typedLinkChange(A, text("words", "#e03131"), { link: A }, PLAIN)).toEqual({
      link: null,
      strokeColor: "#e03131",
    });
  });

  it("leaves words edited into other words alone", () => {
    expect(typedLinkChange("old", text("new"), { link: null }, PLAIN)).toBeNull();
  });
});
