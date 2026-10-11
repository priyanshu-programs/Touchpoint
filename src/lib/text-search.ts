// Turns free text into a prefix tsquery ("pri:* & sha:*"). Tokens are letters and digits only,
// so nothing the user types can be read as tsquery syntax.
export function prefixTsQuery(input: string) {
  const tokens = input.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return tokens
    .slice(0, 8)
    .map((token) => `${token}:*`)
    .join(" & ");
}

export function likePrefix(input: string) {
  return `${input.trim().replace(/[\\%_]/g, "\\$&")}%`;
}
