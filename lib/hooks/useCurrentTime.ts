import { useSyncExternalStore } from "react";

let currentSecond = Math.floor(Date.now() / 1000);
const listeners = new Set<() => void>();
let timerId: ReturnType<typeof setInterval> | null = null;

function ensureTimerStarted(): void {
  if (timerId !== null) return;
  timerId = setInterval(() => {
    currentSecond = Math.floor(Date.now() / 1000);
    for (const listener of listeners) {
      listener();
    }
  }, 1000);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  ensureTimerStarted();

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
  };
}

function getSnapshot(): number {
  return currentSecond;
}

function getServerSnapshot(): number {
  return 0;
}

/**
 * React 19-safe module-level store for 1-second countdown tickers.
 * Returns a stable millisecond timestamp that updates strictly once per second,
 * preventing cascading renders and infinite update depth.
 */
export function useCurrentTime(): number {
  const second = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return second * 1000;
}
