"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FY_OPENING_PILL_FORMAT_CHANGED_EVENT,
  readFyOpeningPillFormat,
  writeFyOpeningPillFormat,
  type FyOpeningPillFormat,
} from "@/lib/fyOpeningPillFormat";

export function useFyOpeningPillFormat() {
  const [format, setFormatState] = useState<FyOpeningPillFormat>(() => readFyOpeningPillFormat());

  useEffect(() => {
    const onChange = () => setFormatState(readFyOpeningPillFormat());
    window.addEventListener(FY_OPENING_PILL_FORMAT_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(FY_OPENING_PILL_FORMAT_CHANGED_EVENT, onChange);
  }, []);

  const setFormat = useCallback((next: FyOpeningPillFormat) => {
    writeFyOpeningPillFormat(next);
    setFormatState(next);
  }, []);

  return { format, setFormat };
}
