"use client";

import { Maximize, Minimize } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Older Safari and iPad versions only have the prefixed names.
type WebkitDocument = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type WebkitElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};
type Mode = "hidden" | "off" | "on";

const INSTALLED = "(display-mode: fullscreen), (display-mode: standalone)";

function subscribe(onChange: () => void) {
  const installed = window.matchMedia(INSTALLED);
  document.addEventListener("fullscreenchange", onChange);
  document.addEventListener("webkitfullscreenchange", onChange);
  installed.addEventListener("change", onChange);
  return () => {
    document.removeEventListener("fullscreenchange", onChange);
    document.removeEventListener("webkitfullscreenchange", onChange);
    installed.removeEventListener("change", onChange);
  };
}

function currentMode(): Mode {
  const doc = document as WebkitDocument;
  if (doc.fullscreenElement ?? doc.webkitFullscreenElement) return "on";
  // Checked second: a page fullscreened by this button also matches display-mode: fullscreen.
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone;
  if (standalone || window.matchMedia(INSTALLED).matches) return "hidden";
  return "off";
}

async function enterFullscreen() {
  const doc = document as WebkitDocument;
  if (!doc.fullscreenEnabled && !doc.webkitFullscreenEnabled) return false;
  // The whole page, so dialogs, menus and panels drawn at its end still show.
  const root = document.documentElement as WebkitElement;
  try {
    await (root.requestFullscreen
      ? root.requestFullscreen()
      : root.webkitRequestFullscreen?.());
    return true;
  } catch {
    return false;
  }
}

function exitFullscreen() {
  const doc = document as WebkitDocument;
  void (doc.exitFullscreen ? doc.exitFullscreen() : doc.webkitExitFullscreen?.());
}

export function FullscreenButton() {
  const mode = useSyncExternalStore(subscribe, currentMode, () => "hidden" as Mode);
  const [helpOpen, setHelpOpen] = useState(false);

  if (mode === "hidden") return null;

  const label = mode === "on" ? "Exit fullscreen" : "Enter fullscreen";
  const Icon = mode === "on" ? Minimize : Maximize;

  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={async () => {
          if (mode === "on") exitFullscreen();
          else if (!(await enterFullscreen())) setHelpOpen(true);
        }}
        className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Icon aria-hidden className="size-4" />
      </button>
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Use Touchpoint fullscreen</DialogTitle>
            <DialogDescription>
              This browser can&apos;t hide its own bars for a website. Add Touchpoint to your
              Home Screen and it opens fullscreen, like an app.
            </DialogDescription>
          </DialogHeader>
          <ol className="grid list-decimal gap-1 pl-5 text-sm">
            <li>Tap the Share button in your browser.</li>
            <li>Tap &ldquo;Add to Home Screen&rdquo;.</li>
            <li>Open Touchpoint from the new icon, and sign in once more.</li>
          </ol>
        </DialogContent>
      </Dialog>
    </>
  );
}
