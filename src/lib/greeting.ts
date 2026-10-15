import { dateIn, daysBetween } from "@/lib/time";

const BANDS: { until: number; lines: string[] }[] = [
  {
    until: 5,
    lines: [
      "Hello, night owl",
      "Burning the midnight oil, {name}?",
      "Still up, {name}?",
      "Quiet hours, {name}",
    ],
  },
  {
    until: 8,
    lines: [
      "Up with the sun, {name}",
      "Early start, {name}",
      "Good morning, early bird",
      "A fresh day, {name}",
    ],
  },
  {
    until: 12,
    lines: [
      "Good morning, {name}",
      "Morning, {name}. Coffee's on",
      "Ready when you are, {name}",
      "Let's make today count, {name}",
    ],
  },
  {
    until: 14,
    lines: [
      "Good afternoon, {name}",
      "Halfway there, {name}",
      "Lunch break, {name}?",
    ],
  },
  {
    until: 17,
    lines: [
      "Good afternoon, {name}",
      "Keep it rolling, {name}",
      "The afternoon push, {name}",
    ],
  },
  {
    until: 21,
    lines: [
      "Good evening, {name}",
      "Winding down, {name}?",
      "Nice work today, {name}",
    ],
  },
  {
    until: 24,
    lines: [
      "Evening, {name}",
      "Wrapping up, {name}?",
      "Late shift, {name}?",
      "Hello, night owl",
    ],
  },
];

function special(weekday: string, hour: number) {
  if (weekday === "Mon" && hour >= 5 && hour < 12)
    return "A fresh week, {name}";
  if (weekday === "Fri" && hour >= 14 && hour < 21)
    return "Almost the weekend, {name}";
  if ((weekday === "Sat" || weekday === "Sun") && hour >= 8 && hour < 17)
    return "Weekend hustle, {name}?";
}

// The line is picked by the date in the owner's zone, so it holds all day and changes the next.
export function greeting(name: string, timezone: string, instant = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    hour: "2-digit",
    weekday: "short",
  }).formatToParts(instant);
  const hour = Number(parts.find((part) => part.type === "hour")!.value);
  const weekday = parts.find((part) => part.type === "weekday")!.value;
  const day = daysBetween("1970-01-01", dateIn(timezone, instant));

  const { lines } = BANDS.find((band) => hour < band.until)!;
  const line = special(weekday, hour) ?? lines[day % lines.length];
  const first = name.trim().split(/\s+/)[0];
  return first
    ? line.replace("{name}", first)
    : line.replace(/,? \{name\}/, "");
}
