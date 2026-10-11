const AGENT = "touchpoint";

// "*" stands for any run of characters and a final "$" pins the end of the path.
// Matched by hand, since a pattern from someone else's site must not become a regex.
function matches(pattern: string, path: string) {
  const anchored = pattern.endsWith("$");
  const parts = (anchored ? pattern.slice(0, -1) : pattern).split("*");
  if (!path.startsWith(parts[0])) return false;
  let at = parts[0].length;
  for (let index = 1; index < parts.length; index++) {
    const part = parts[index];
    const last = anchored && index === parts.length - 1;
    const found = last
      ? path.length - part.length >= at && path.endsWith(part)
        ? path.length - part.length
        : -1
      : path.indexOf(part, at);
    if (found < 0) return false;
    at = found + part.length;
  }
  return !anchored || parts.length > 1 || at === path.length;
}

// Follows RFC 9309: the group naming this reader applies, otherwise the "*" group,
// and within it the longest matching rule wins, with Allow winning a tie.
export function robotsAllows(robotsTxt: string, path: string) {
  const groups: { agents: string[]; rules: { allow: boolean; pattern: string }[] }[] =
    [];
  let current: (typeof groups)[number] | null = null;
  let inAgents = false;

  for (const raw of robotsTxt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "");
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === "user-agent") {
      if (!current || !inAgents) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      inAgents = true;
    } else if (key === "allow" || key === "disallow") {
      inAgents = false;
      // An empty Disallow means nothing is disallowed.
      if (current && value) {
        current.rules.push({ allow: key === "allow", pattern: value });
      }
    }
  }

  const group =
    groups.find(({ agents }) => agents.some((agent) => agent.includes(AGENT))) ??
    groups.find(({ agents }) => agents.includes("*"));
  if (!group) return true;

  let verdict = true;
  let longest = -1;
  for (const rule of group.rules) {
    if (!matches(rule.pattern, path)) continue;
    const length = rule.pattern.length;
    if (length > longest || (length === longest && rule.allow)) {
      longest = length;
      verdict = rule.allow;
    }
  }
  return verdict;
}
