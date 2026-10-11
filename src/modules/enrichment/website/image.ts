// Keeps a thousand logos well inside the free database tier.
export const MAX_LOGO_BYTES = 100_000;

const starts = (bytes: Buffer, signature: number[], at = 0) =>
  signature.every((byte, index) => bytes[at + index] === byte);

// The type is read from the bytes themselves; a server's Content-Type is only a claim.
// SVG is left out on purpose: it can carry script.
export function imageType(bytes: Buffer) {
  if (starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (starts(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (
    starts(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    starts(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "image/webp";
  }
  if (starts(bytes, [0x00, 0x00, 0x01, 0x00])) return "image/x-icon";
  return null;
}
