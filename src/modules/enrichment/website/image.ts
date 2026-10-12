import sharp from "sharp";

// What may be downloaded. What is kept is far smaller: see compressImage.
export const MAX_LOGO_DOWNLOAD = 1_000_000;
// Keeps a thousand logos well inside the free database tier.
export const MAX_LOGO_BYTES = 100_000;
// A picture claiming more pixels than this is not unpacked.
const MAX_PIXELS = 40_000_000;
const COMPRESS_SECONDS = 5;

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

// An icon file is the one kind kept that cannot be re-encoded.
const COMPRESSIBLE = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export type StoredImage = { contentType: string; bytes: Buffer };

// Shrinks a picture to fit a square of `side` pixels and re-encodes it as WebP. The
// new file also leaves out what the old one said about where and how it was taken.
// Null when the bytes are not a picture that can be read.
export async function compressImage(
  bytes: Buffer,
  { side, quality }: { side: number; quality: number },
): Promise<StoredImage | null> {
  const contentType = imageType(bytes);
  if (!contentType || !COMPRESSIBLE.has(contentType)) return null;
  try {
    return {
      contentType: "image/webp",
      bytes: await sharp(bytes, { limitInputPixels: MAX_PIXELS, failOn: "error" })
        // Turned the way it was meant to be seen, before the note saying so is dropped.
        .rotate()
        .resize({ width: side, height: side, fit: "inside", withoutEnlargement: true })
        .webp({ quality })
        .timeout({ seconds: COMPRESS_SECONDS })
        .toBuffer(),
    };
  } catch {
    // Cut short, malformed or too large to unpack: not something to keep.
    return null;
  }
}
