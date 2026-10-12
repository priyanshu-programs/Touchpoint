import sharp, { type Color } from "sharp";

type Format = "jpeg" | "png" | "webp" | "gif";

// A real picture of one colour, which packs down to almost nothing.
export const solid = (
  format: Format,
  width: number,
  height: number,
  background: Color = "#cc3333",
) =>
  sharp({ create: { width, height, channels: 4, background } })
    .toFormat(format)
    .toBuffer();

// A real picture of grain, which stays large however it is packed: a stand-in for a photograph.
export const grainy = (format: Format, width: number, height: number) =>
  sharp({
    create: {
      width,
      height,
      channels: 3,
      background: "#808080",
      noise: { type: "gaussian", mean: 128, sigma: 40 },
    },
  })
    .toFormat(format)
    .toBuffer();

export const shape = async (bytes: Buffer) => {
  const { format, width, height, hasAlpha, exif } = await sharp(bytes).metadata();
  return { format, width, height, hasAlpha, exif: Boolean(exif) };
};
