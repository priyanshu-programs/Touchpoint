import { describe, expect, it } from "vitest";
import { companyGraph, memoryGraph, YOU, type GraphMemory } from "./graph";

const memory = (id: string, content: string, about?: { scope: "person" | "company"; id: string; name: string }): GraphMemory => ({
  id,
  scope: about?.scope ?? "you",
  content,
  terms: null,
  recordId: about?.id ?? null,
  recordName: about?.name ?? null,
});

describe("memory graph", () => {
  it("hangs memories off you or their subject, ties people to their companies, and joins memories sharing a word", () => {
    const priya = { scope: "person" as const, id: "p1", name: "Priya Sharma" };
    const maple = { scope: "company" as const, id: "c1", name: "Maple Studio" };
    const { nodes, links } = memoryGraph(
      "Asha",
      [
        memory("m1", "Doesn't take calls on Fridays"),
        memory("m2", "Prefers WhatsApp for quick calls", priya),
        memory("m3", "Invoices go to the finance team", maple),
      ],
      [
        { contactId: "p1", organizationId: "c1", name: "Maple Studio" },
        { contactId: "p1", organizationId: "c2", name: "Harbor Bakery" },
        { contactId: "p9", organizationId: "c3", name: "Nobody's company" },
      ],
    );

    expect(nodes.map(({ id, kind, label }) => `${kind} ${id} ${label}`).sort()).toEqual([
      "company company:c1 Maple Studio",
      "company company:c2 Harbor Bakery",
      "memory memory:m1 Doesn't take calls on Fridays",
      "memory memory:m2 Prefers WhatsApp for quick calls",
      "memory memory:m3 Invoices go to the finance team",
      "person person:p1 Priya Sharma",
      `you ${YOU} Asha`,
    ]);
    const shown = links.map(({ source, target, kind, word }) => `${kind} ${source}-${target}${word ? ` ${word}` : ""}`);
    expect(shown).toEqual(
      expect.arrayContaining([
        `about ${YOU}-memory:m1`,
        `about ${YOU}-person:p1`,
        "about person:p1-memory:m2",
        `about ${YOU}-company:c1`,
        "about company:c1-memory:m3",
        "works person:p1-company:c1",
        "works person:p1-company:c2",
        "word memory:m1-memory:m2 calls",
      ]),
    );
    // Each pair once, whatever joins them.
    expect(new Set(links.map(({ source, target }) => [source, target].sort().join("|"))).size).toBe(links.length);
  });

  it("leaves out a word so common it says nothing", () => {
    const memories = Array.from({ length: 8 }, (_, index) => memory(`m${index}`, `Client ${index} wants updates`));
    const { links } = memoryGraph("Asha", memories, []);
    expect(links.filter(({ kind }) => kind === "word")).toEqual([]);
  });
});

describe("company memory graph", () => {
  it("puts the company in the middle, everyone at it around it, and hollow dots for people with nothing remembered", () => {
    const priya = { scope: "person" as const, id: "p1", name: "Priya Sharma" };
    const maple = { scope: "company" as const, id: "c1", name: "Maple Studio" };
    const { nodes, links } = companyGraph(
      { id: "c1", name: "Maple Studio" },
      [
        { id: "p1", name: "Priya Sharma" },
        { id: "p2", name: "Leo Park" },
      ],
      [
        memory("m1", "Invoices go to the finance team", maple),
        memory("m2", "Approves invoices on Mondays", priya),
      ],
    );

    expect(nodes.map(({ id, kind, centre, hollow }) => `${kind} ${id}${centre ? " centre" : ""}${hollow ? " hollow" : ""}`).sort()).toEqual([
      "company company:c1 centre",
      "memory memory:m1",
      "memory memory:m2",
      "person person:p1",
      "person person:p2 hollow",
    ]);
    expect(links.map(({ source, target, kind }) => `${kind} ${source}-${target}`)).toEqual(
      expect.arrayContaining([
        "works company:c1-person:p1",
        "works company:c1-person:p2",
        "about company:c1-memory:m1",
        "about person:p1-memory:m2",
        "word memory:m1-memory:m2",
      ]),
    );
  });
});
