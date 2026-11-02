---
title: "The note editor shows addresses as links with decorations, not Tiptap's Link package or a link mark"
author: L
date: 2026-11-02
branch: feat/note-panel-inline-edit
cost: { minutes: 9, tokens: 142319 }
id: l-d2fdf7ad
scope: repo
status: active
src: agent
touches:
  - src/lib/autolink.ts
---

## Decided
- Owner's choice, 2026-11-02: the stage-note panel is always the editor (no Edit button). Addresses look like links there, a plain click places the cursor, and Ctrl+click or Cmd+click opens them. src/app/(board)/workflows/[id]/note-editor.tsx adds an `Addresses` extension whose ProseMirror plugin draws `Decoration.inline` over what `linkParts` (src/lib/autolink.ts) finds in each line, and its handleClick opens only that href with noopener. Decorations aren't in the document, so `docToNote` and the stored marks stay unchanged.
- Unsaved changes: Save and Cancel show only while the draft differs from the stored note, compared after `tidyMarks`. Closing or opening another note with changes asks "Discard your changes to this note?" first. Cancel and Save remount the editor through a `resets` key.
## Tried and ruled out
- @tiptap/extension-link: it's a new package, and its link mark would have to be stripped at the edge, outside the plain text plus three styles rule.
## Watch out
- The panel no longer renders through `LinkedText`, so e2e reads the note through the textbox's `p` elements and `[data-href]`, not `getByRole("link")`.
