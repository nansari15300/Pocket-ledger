import type { Anusuchi13ReportMemory } from "@/lib/reports/anusuchi13Confirmation";

export const ANUSUCHI13_STATE_EVENT = "pl-anusuchi13-state-changed";
export const REPORT_ANUSUCHI13_MEMORY_KEY = "reportAnusuchi13State";

export function readAnusuchi13ReportMemory(): Anusuchi13ReportMemory {
  try {
    const raw =
      typeof window !== "undefined" ? localStorage.getItem(REPORT_ANUSUCHI13_MEMORY_KEY) : null;
    return raw ? (JSON.parse(raw) as Anusuchi13ReportMemory) : {};
  } catch {
    return {};
  }
}

export function writeAnusuchi13ReportMemory(patch: Partial<Anusuchi13ReportMemory>) {
  try {
    const prev = readAnusuchi13ReportMemory();
    localStorage.setItem(
      REPORT_ANUSUCHI13_MEMORY_KEY,
      JSON.stringify({ ...prev, ...patch })
    );
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(ANUSUCHI13_STATE_EVENT));
    }
  } catch (_) {}
}
