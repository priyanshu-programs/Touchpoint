import { useSyncExternalStore } from "react";

// What is under way in the browser: a page on its way, and server actions still running.
// The bar across the top shows for as long as either is.
let navigating = false;
let actions = 0;
const listeners = new Set<() => void>();

function changed() {
  for (const listener of listeners) listener();
}

export function navigationStarted() {
  navigating = true;
  changed();
}

export function navigationEnded() {
  if (!navigating) return;
  navigating = false;
  changed();
}

export function actionStarted() {
  actions += 1;
  changed();
}

export function actionEnded() {
  actions -= 1;
  changed();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const useBusy = () =>
  useSyncExternalStore(
    subscribe,
    () => navigating || actions > 0,
    () => false,
  );
