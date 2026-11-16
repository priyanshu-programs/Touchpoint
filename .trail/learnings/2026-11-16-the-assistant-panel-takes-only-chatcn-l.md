---
title: "The assistant panel takes only chatcn's core pieces; replies keep our React-only formatting, not streamdown"
author: L
date: 2026-11-16
branch: feat/assistant-chat-look
cost: { minutes: 47, tokens: 247428 }
id: l-0e37b14e
scope: repo
status: active
src: agent
touches:
  - e2e/44-assistant.spec.ts
  - e2e/45-assistant-records.spec.ts
  - eslint.config.mjs
  - package.json
  - pnpm-lock.yaml
  - security.md
  - src/app/globals.css
  - src/components/assistant/chat.tsx
  - src/components/assistant/thinking-ball.tsx
  - src/components/crystalized-ball.tsx
---

## Decided
Owner's choice, 2026-11-16 (PR #75): the assistant panel uses chatcn's conversation, message, prompt-input, suggestions and scroll-to-bottom only (src/components/ui/chatcn/, src/hooks/use-chatcn-*, src/lib/chatcn-icons.tsx), kept as shipped and left out of ESLint. Replies are drawn by src/components/assistant/reply-text.tsx as React elements, never HTML or links. The thinking animation is React Bits' CrystalizedBall in mint #5bf2ab (owner's pick over the app's lime), with theme="light" in both themes.

## Tried and ruled out
- The whole chatcn chatbot block: ~12,000 lines in 35 pieces, mostly coding-agent tool cards, attachments and a model picker. It also brings in streamdown, a large package tree that renders any link the model writes, which breaks security.md's rule that only the app's own pages are links.
- CrystalizedBall's dark theme: it adds light up, and at 48 px the ball turns plain white (seen in headless Chromium).

## Watch out
- `shadcn add` from a registry like chatcn writes `@custom-variant dark (&:is(.dark *));` into src/app/globals.css and a `.dark {}` palette. Touchpoint's dark mode is the prefers-color-scheme media query, so that line silently breaks every `dark:` style. Remove it and move the palette under the media query after any registry install.
- chatcn's Conversation has a hidden live region that repeats a finished reply for screen readers, so e2e must find reply text inside the "Chat" log, not the whole panel.
- `shadcn add` runs plain `pnpm`; on this PC it needs the pnpm.cmd shim on PATH.
