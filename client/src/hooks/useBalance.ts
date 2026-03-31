import { useState, useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "hideBalance";

// External store for cross-component sync
let listeners: Array<() => void> = [];
function subscribe(listener: () => void) {
  listeners = [...listeners, listener];
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}
function getSnapshot() {
  return localStorage.getItem(STORAGE_KEY) === "true";
}
function notify() {
  listeners.forEach((l) => l());
}

export function useBalance() {
  const isHidden = useSyncExternalStore(subscribe, getSnapshot, () => false);

  const toggle = useCallback(() => {
    const newValue = !getSnapshot();
    localStorage.setItem(STORAGE_KEY, String(newValue));
    notify();
  }, []);

  return { isHidden, toggle };
}
