"use client";

import { useRef } from "react";
import { readCompanyInterCompanyCode } from "@/lib/interCompany/interCompanyCompanyCode";

/**
 * Company code field blink na kare — Firestore/local sync ke beech empty frame mat dikhao.
 */
export function useStickyInterCompanyCompanyCode(
  company: { interCompanyCompanyCode?: string | null } | null | undefined
): string {
  const lastRef = useRef("");
  const current = readCompanyInterCompanyCode(company);
  if (current) lastRef.current = current;
  return current || lastRef.current;
}
