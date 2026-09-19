"use client";

import { useCallback, useEffect, useState } from "react";
import {
  readStatementCheckedBlinkPrefs,
  STATEMENT_CHECKED_BLINK_CHANGED_EVENT,
  STATEMENT_CHECKED_BLINK_CYCLE_DEFAULT_SEC,
  writeStatementCheckedBlinkPrefs,
  type StatementCheckedBlinkPrefs,
} from "@/lib/statementCheckedBlinkPrefs";

const SSR_DEFAULT_PREFS: StatementCheckedBlinkPrefs = {
  enabled: true,
  cycleSeconds: STATEMENT_CHECKED_BLINK_CYCLE_DEFAULT_SEC,
};

export function useStatementCheckedBlinkPrefs() {
  const [prefs, setPrefs] = useState<StatementCheckedBlinkPrefs>(SSR_DEFAULT_PREFS);

  useEffect(() => {
    setPrefs(readStatementCheckedBlinkPrefs());
    const onChange = () => setPrefs(readStatementCheckedBlinkPrefs());
    window.addEventListener(STATEMENT_CHECKED_BLINK_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(STATEMENT_CHECKED_BLINK_CHANGED_EVENT, onChange);
  }, []);

  const updatePrefs = useCallback((patch: Partial<StatementCheckedBlinkPrefs>) => {
    const next = { ...readStatementCheckedBlinkPrefs(), ...patch };
    writeStatementCheckedBlinkPrefs(next);
    setPrefs(next);
  }, []);

  return { prefs, updatePrefs };
}
