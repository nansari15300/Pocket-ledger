"use client";

import { useEffect, useState } from "react";
import {
  getCompanyBackupRunState,
  subscribeCompanyBackupRun,
  type CompanyBackupRunState,
} from "@/lib/companyBackupRunner";

/** BackupRestore + global banner — same live runner state. */
export function useCompanyBackupRun(): CompanyBackupRunState {
  const [run, setRun] = useState<CompanyBackupRunState>(() =>
    typeof window !== "undefined" ? getCompanyBackupRunState() : ({ status: "idle" } as CompanyBackupRunState)
  );
  useEffect(() => subscribeCompanyBackupRun(setRun), []);
  return run;
}
