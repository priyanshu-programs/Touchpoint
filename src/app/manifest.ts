import type { MetadataRoute } from "next";

const TILE = "#171717";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Touchpoint",
    short_name: "Touchpoint",
    description: "Personal business operating system",
    start_url: "/",
    scope: "/",
    display: "fullscreen",
    display_override: ["fullscreen", "standalone"],
    background_color: TILE,
    theme_color: TILE,
    icons: [
      { src: "/Images/touchpoint-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/Images/touchpoint-icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/Images/touchpoint-icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
