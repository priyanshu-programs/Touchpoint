---
title: "Excalidraw's reconcile can raise an element's version in place, so a synced board must read versions before merging and keep deleted elements in the scene"
author: L
date: 2026-11-01
branch: feat/live-board
cost: { minutes: 1, tokens: 3165 }
id: l-97d88549
scope: repo
status: active
src: agent
---

## Decided
- src/app/(board)/brainstorm/[id]/board-sync.ts merge() reads each remote element's version and nonce before reconcileElements. A renumbered element then counts as this device's own change and is sent on, because otherwise the devices drift apart at one version and a delete can lose by the nonce.

## Watch out
- reconcileElements calls syncInvalidIndices, which calls mutateElement, so a clash in fractional `index` raises the version and draws a new nonce, in place, on the remote object being merged. Comparing "kept" against `restored` afterwards always matches, so the bump looks like what arrived and is never sent. The devices then hold different copies at one version, and the next edit on the other device ties and is settled by the nonce: about half the time a delete loses and a note stays on one screen until reload.
- The clash came from `api.getSceneElements()` in addSticky, which drops deleted elements from the scene, so a new note reused an index a tombstone still held on the other device. Use getSceneElementsIncludingDeleted when passing a whole scene to updateScene on a synced board. board-editor.tsx still uses the other form, which is safe only while workflow boards aren't synced per element.
- Only shows on a board with deleted elements: the two-window test passes alone and fails after earlier tests in e2e/19 leave tombstones. e2e/36 forces it every time.
