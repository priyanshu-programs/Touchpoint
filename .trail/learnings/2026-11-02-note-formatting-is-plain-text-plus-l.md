---
title: "Note formatting is plain text plus checked ranges, never HTML; the editor's document is converted at the edge"
author: L
date: 2026-11-02
branch: feat/note-formatting
cost: { minutes: 1, tokens: 2541 }
id: l-d3d09d7a
scope: repo
status: active
src: agent
touches:
  - src/modules/workflows/note-marks.ts
---

## Decided
- Owner's choice and security sign-off, 2026-11-02: workflow_notes.body stays plain text and `marks` holds {from, to, style} ranges, with style one of bold, italic or underline (src/modules/workflows/note-marks.ts). Tiptap 3.32.2 is the editor; note-doc.ts turns its JSON into body plus marks, and back. `LinkedText` draws marks as strong, em and u, and the card preview stays plain.
- Ranges count JavaScript string positions, and paragraphs join with "\n". A style that crosses a line break comes back as one range per line.
## Tried and ruled out
- Storing the editor's HTML, or markdown in body: HTML needs a sanitiser and breaks the plain-text rule, and markdown changes what a typed "*" means. A plain text box with B, I and U buttons and no formatting while typing: offered, the owner picked Tiptap.
## Watch out
- noteInput trims spaces and moves the marks with the words (trimNote), so marks from a client may not match the stored ones.
- In e2e the editor mounts after a render (immediatelyRender: false): wait for the textbox to have focus before pressing keys. Choose words with a DOM Range, not arrow presses, which got lost on the owner's PC.
