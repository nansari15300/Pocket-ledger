/** Long sync loops ke beech UI / Electron ko paint + input ka mauka do — "Page Unresponsive" kam. */
export function yieldToMain(): Promise<void> {
  const sched = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (sched?.yield) return sched.yield();
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}
