"use client";

import { useEffect, useState } from "react";
import { greeting } from "@/lib/greeting";

// Starts from the server's line so hydration matches, then follows the clock,
// since the layout is not rendered again on navigation.
export function Greeting({
  name,
  timezone,
  initial,
}: {
  name: string;
  timezone: string;
  initial: string;
}) {
  const [line, setLine] = useState(initial);

  useEffect(() => {
    const id = setInterval(() => setLine(greeting(name, timezone)), 60_000);
    return () => clearInterval(id);
  }, [name, timezone]);

  return <span title={line}>{line}</span>;
}
