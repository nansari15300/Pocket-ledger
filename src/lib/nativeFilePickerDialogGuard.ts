"use client";

/** Radix Dialog `onFocusOutside` — native OS file picker focus bahar le jata hai; dismiss rokne ke liye grace window. */
let openUntilMs = 0;
let listenersInstalled = false;

export function markNativeFilePickerOpening(graceMs = 5_000): void {
  openUntilMs = Date.now() + graceMs;
  installNativeFilePickerListeners();
}

export function isNativeFilePickerLikelyOpen(): boolean {
  return Date.now() < openUntilMs;
}

function onFileInputPointer(e: Event): void {
  const t = e.target;
  if (t instanceof HTMLInputElement && t.type === "file") {
    markNativeFilePickerOpening();
  }
}

export function installNativeFilePickerListeners(): void {
  if (typeof document === "undefined" || listenersInstalled) return;
  listenersInstalled = true;
  document.addEventListener("click", onFileInputPointer, true);
  document.addEventListener("focusin", onFileInputPointer, true);
  document.addEventListener(
    "change",
    (e) => {
      const t = e.target;
      if (t instanceof HTMLInputElement && t.type === "file") {
        // Picker band hone ke baad bhi focus wapas aane me thoda time lag sakta hai.
        openUntilMs = Date.now() + 800;
      }
    },
    true
  );
}
