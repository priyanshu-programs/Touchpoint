// "Lead source" becomes lead_source; a name with no letters or digits becomes
// the fallback. A key already taken gets a number after it.
export function keyFor(label: string, taken: Set<string>, fallback: string) {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || fallback;
  let key = base;
  for (let count = 2; taken.has(key); count++) key = `${base}_${count}`;
  return key;
}
