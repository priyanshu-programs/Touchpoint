import { describe, expect, it } from "vitest";
import { currencyDigits, formatMoney, minorToInput, toMinor } from "./money";

describe("currencyDigits", () => {
  it("knows how many minor units make one unit", () => {
    expect(currencyDigits("JPY")).toBe(0);
    expect(currencyDigits("INR")).toBe(2);
    expect(currencyDigits("KWD")).toBe(3);
  });
});

describe("toMinor", () => {
  it.each([
    ["150000", "INR", 15_000_000],
    ["1,50,000", "INR", 15_000_000],
    ["150,000.5", "USD", 15_000_050],
    ["₹ 12,000.25", "INR", 1_200_025],
    ["1 234", "EUR", 123_400],
    ["1'234", "CHF", 123_400],
    ["0", "INR", 0],
    ["2500", "JPY", 2500],
    ["1.234", "KWD", 1234],
    ["12.", "USD", 1200],
  ])("reads %s %s", (typed, currency, minor) => {
    expect(toMinor(typed, currency)).toBe(minor);
  });

  it.each([
    ["", "INR"],
    ["-500", "INR"],
    ["12abc", "INR"],
    ["1.234", "INR"],
    ["2500.5", "JPY"],
    ["1.2.3", "USD"],
    ["99999999999999999", "INR"],
  ])("refuses %s %s", (typed, currency) => {
    expect(toMinor(typed, currency)).toBeNull();
  });
});

describe("formatMoney", () => {
  it("groups rupees in lakhs and other currencies in thousands", () => {
    expect(formatMoney(15_000_000, "INR")).toBe("₹1,50,000");
    expect(formatMoney(15_000_050, "USD")).toBe("US$150,000.50");
    expect(formatMoney(2500, "JPY")).toBe("JP¥2,500");
  });
});

describe("minorToInput", () => {
  it("gives back what can be typed again", () => {
    expect(minorToInput(15_000_000, "INR")).toBe("150000");
    expect(minorToInput(15_000_050, "USD")).toBe("150000.50");
    expect(minorToInput(1234, "KWD")).toBe("1.234");
    expect(minorToInput(2500, "JPY")).toBe("2500");
    expect(toMinor(minorToInput(1_200_025, "INR"), "INR")).toBe(1_200_025);
  });
});
