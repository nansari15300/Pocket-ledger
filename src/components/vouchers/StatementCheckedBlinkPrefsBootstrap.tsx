"use client";

import { useEffect } from "react";
import {
  applyStatementCheckedBlinkPrefsToDocument,
  readStatementCheckedBlinkPrefs,
  STATEMENT_CHECKED_BLINK_CHANGED_EVENT,
} from "@/lib/statementCheckedBlinkPrefs";

/** Apply blink prefs on `document.documentElement` after hydration (avoids SSR mismatch on `<html>`). */
export function StatementCheckedBlinkPrefsBootstrap() {
  useEffect(() => {
    applyStatementCheckedBlinkPrefsToDocument(readStatementCheckedBlinkPrefs());
    const onChange = () => {
      applyStatementCheckedBlinkPrefsToDocument(readStatementCheckedBlinkPrefs());
    };
    window.addEventListener(STATEMENT_CHECKED_BLINK_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(STATEMENT_CHECKED_BLINK_CHANGED_EVENT, onChange);
  }, []);

  return null;
}
