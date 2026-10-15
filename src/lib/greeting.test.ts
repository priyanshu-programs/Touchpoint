import { describe, expect, it } from "vitest";
import { greeting } from "./greeting";

const LATE = [
  "Hello, night owl",
  "Burning the midnight oil, Priyanshu?",
  "Still up, Priyanshu?",
  "Quiet hours, Priyanshu",
];
const EARLY = [
  "Up with the sun, Priyanshu",
  "Early start, Priyanshu",
  "Good morning, early bird",
  "A fresh day, Priyanshu",
];
const MORNING = [
  "Good morning, Priyanshu",
  "Morning, Priyanshu. Coffee's on",
  "Ready when you are, Priyanshu",
  "Let's make today count, Priyanshu",
];
const MIDDAY = [
  "Good afternoon, Priyanshu",
  "Halfway there, Priyanshu",
  "Lunch break, Priyanshu?",
];
const AFTERNOON = [
  "Good afternoon, Priyanshu",
  "Keep it rolling, Priyanshu",
  "The afternoon push, Priyanshu",
];
const EVENING = [
  "Good evening, Priyanshu",
  "Winding down, Priyanshu?",
  "Nice work today, Priyanshu",
];
const NIGHT = [
  "Evening, Priyanshu",
  "Wrapping up, Priyanshu?",
  "Late shift, Priyanshu?",
  "Hello, night owl",
];

// 2026-10-14 is a Wednesday, which has no day-specific lines.
const at = (time: string, date = "2026-10-14") =>
  greeting("Priyanshu Roy", "UTC", new Date(`${date}T${time}:00Z`));

describe("greeting", () => {
  it.each([
    ["00:00", LATE],
    ["04:59", LATE],
    ["05:00", EARLY],
    ["07:59", EARLY],
    ["08:00", MORNING],
    ["11:59", MORNING],
    ["12:00", MIDDAY],
    ["13:59", MIDDAY],
    ["14:00", AFTERNOON],
    ["16:59", AFTERNOON],
    ["17:00", EVENING],
    ["20:59", EVENING],
    ["21:00", NIGHT],
    ["23:59", NIGHT],
  ])("at %s picks from that part of the day", (time, lines) => {
    expect(lines).toContain(at(time));
  });

  it("reads the hour in the owner's zone, not the server's", () => {
    const instant = new Date("2026-10-14T03:30:00Z");
    expect(LATE).toContain(greeting("Priyanshu", "UTC", instant));
    expect(MORNING).toContain(greeting("Priyanshu", "Asia/Kolkata", instant));
  });

  it("holds one line all day and moves to another the next day", () => {
    expect(at("08:00")).toBe(at("11:59"));
    const week = ["12", "13", "14", "15"].map((day) =>
      at("12:30", `2026-10-${day}`),
    );
    expect(new Set(week).size).toBeGreaterThan(1);
  });

  it("has its own lines for Monday morning, Friday afternoon and weekend days", () => {
    expect(at("09:00", "2026-10-12")).toBe("A fresh week, Priyanshu");
    expect(at("15:00", "2026-10-16")).toBe("Almost the weekend, Priyanshu");
    expect(at("10:00", "2026-10-17")).toBe("Weekend hustle, Priyanshu?");
    expect(at("10:00", "2026-10-18")).toBe("Weekend hustle, Priyanshu?");
    expect(LATE).toContain(at("02:00", "2026-10-17"));
  });

  it("greets by first name, and without one when there is no name", () => {
    expect(at("09:00")).not.toContain("Roy");
    const line = greeting("  ", "UTC", new Date("2026-10-14T09:00:00Z"));
    expect(line).not.toContain("{name}");
    expect(line).not.toMatch(/, ?$|, \.|\s{2}/);
  });
});
