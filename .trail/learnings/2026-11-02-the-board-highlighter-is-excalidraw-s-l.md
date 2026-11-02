---
title: "The board highlighter is Excalidraw's own pen with marker settings, given back when the tool changes"
author: L
date: 2026-11-02
branch: feat/board-highlighter
cost: { minutes: 17, tokens: 23214 }
id: l-98b96f68
scope: repo
status: active
src: agent
---

## Decided
- Owner's choice, 2026-11-02: a highlighter pen, not a background on a whole text block. `useHighlighter` (src/app/(board)/workflows/[id]/highlighter.tsx) saves the pen's currentItemStrokeColor, StrokeWidth and Opacity, sets #fab005 / 6 / 40 and the freedraw tool, and puts the saved ones back when the button is pressed again or `api.onChange` shows another tool. A highlight is an ordinary freedraw stroke, so nothing on the server changed.
## Tried and ruled out
- Highlighting a few words inside board text: Excalidraw draws a text element in one style.
## Watch out
- Excalidraw's own pen button also sets the freedraw tool, so choosing it while the highlighter is on keeps the marker settings until the highlighter is turned off.
- In e2e, click a tool through `label:has([data-testid="toolbar-…"])`: the icon covers the radio input. Strokes come back from the server in id order, not drawing order.
