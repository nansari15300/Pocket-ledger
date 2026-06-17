"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Cloud OAuth return removed — redirect home. */
export default function OAuthReturnPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/");
  }, [router]);
  return null;
}
