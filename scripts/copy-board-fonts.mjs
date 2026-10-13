import { cpSync, rmSync } from "node:fs";

// The whiteboard would fetch its fonts from a CDN. They are served from this app
// instead, so the page contacts no other site and the font policy stays `self`.
const target = "public/excalidraw/fonts";
rmSync(target, { recursive: true, force: true });
cpSync("node_modules/@excalidraw/excalidraw/dist/prod/fonts", target, {
  recursive: true,
});
