import { describe, expect, it } from "vitest";
import {
  countryFromDomain,
  countryFromPhone,
  countryName,
  guessIndustry,
} from "./guess";

describe("countryName", () => {
  it("spells out a two-letter code and leaves anything else as written", () => {
    expect(countryName("IN")).toBe("India");
    expect(countryName("gb")).toBe("United Kingdom");
    expect(countryName("India")).toBe("India");
    expect(countryName("XX")).toBe("XX");
    expect(countryName("USA")).toBe("USA");
    expect(countryName(null)).toBeNull();
  });
});

describe("countryFromPhone", () => {
  it("reads the country from a number's international code", () => {
    expect(countryFromPhone("+91 (20) 5550-1234")).toBe("India");
    expect(countryFromPhone(" +44 20 7946 0000")).toBe("United Kingdom");
    expect(countryFromPhone("+971 4 555 0000")).toBe("United Arab Emirates");
    expect(countryFromPhone("+65-6555-0000")).toBe("Singapore");
  });

  it("says nothing for a shared code, a local number or no number", () => {
    expect(countryFromPhone("+1 555 000 0000")).toBeNull();
    expect(countryFromPhone("+7 495 555 0000")).toBeNull();
    expect(countryFromPhone("020 5550 1234")).toBeNull();
    expect(countryFromPhone("91 20 5550 1234")).toBeNull();
    expect(countryFromPhone("+")).toBeNull();
    expect(countryFromPhone(null)).toBeNull();
    expect(countryFromPhone(undefined)).toBeNull();
  });
});

describe("countryFromDomain", () => {
  it("reads the country from a country domain", () => {
    expect(countryFromDomain("acme.in")).toBe("India");
    expect(countryFromDomain("www.acme.co.uk")).toBe("United Kingdom");
    expect(countryFromDomain("ACME.DE")).toBe("Germany");
  });

  it("says nothing for a general domain or one sold as a catchy name", () => {
    for (const host of ["acme.com", "acme.io", "acme.ai", "acme.co", "acme.tv", "acme.eu"]) {
      expect(countryFromDomain(host)).toBeNull();
    }
    expect(countryFromDomain("localhost")).toBeNull();
    expect(countryFromDomain("203.0.113.7")).toBeNull();
    expect(countryFromDomain("acme.xx")).toBeNull();
  });
});

describe("guessIndustry", () => {
  it("names the industry whose words the text uses most", () => {
    expect(guessIndustry("KBRS & Associates | Chartered Accountants")).toBe("Accounting");
    expect(
      guessIndustry("Audit, GST and bookkeeping for growing companies. Design-led reports."),
    ).toBe("Accounting");
    expect(guessIndustry("A law firm of advocates and solicitors")).toBe("Legal");
    expect(guessIndustry("Luxury lipsticks, skincare and makeup")).toBe(
      "Beauty & Cosmetics",
    );
    expect(guessIndustry("Organization Accounting Service: tax returns filed")).toBe(
      "Accounting",
    );
    // One word that names the trade is enough, and outweighs a hint at another.
    expect(
      guessIndustry("Indian Luxury Cosmetics: shop for lips, eyes, and face"),
    ).toBe("Beauty & Cosmetics");
    // Plurals and hyphens are the same word.
    expect(guessIndustry("Hotels, resorts and holidays")).toBe("Hospitality & Travel");
    expect(guessIndustry("An e-commerce store")).toBe("Retail");
  });

  it("says nothing on a passing mention, a tie or no words at all", () => {
    expect(guessIndustry("We love our accountant")).toBeNull();
    expect(guessIndustry("Free shipping on every order")).toBeNull();    expect(guessIndustry("Lawyers and attorneys. Hotels and resorts.")).toBeNull();
    expect(guessIndustry("Anvils, made and mended")).toBeNull();
    // A word inside another word is not that word.
    expect(guessIndustry("Taxidermy and auditoriums")).toBeNull();
    expect(guessIndustry("")).toBeNull();
  });

  it("does not slow down on a hostile page", () => {
    const started = Date.now();
    guessIndustry("chartered ".repeat(200_000));
    guessIndustry("a".repeat(1_000_000));
    guessIndustry(" ".repeat(1_000_000));
    expect(Date.now() - started).toBeLessThan(500);
  });
});
