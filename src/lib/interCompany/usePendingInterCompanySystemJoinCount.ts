"use client";

import { useEffect, useState } from "react";
import { subscribeIncomingSystemJoinRequests } from "@/lib/interCompany/interCompanySystemJoinRequest";

/** Selected company par pending Inter Com System join requests — ribbon / header badge */
export function usePendingInterCompanySystemJoinCount(args: {
  ownerUserId?: string | null;
  companyId?: string | null;
}): number {
  const ownerUserId = String(args.ownerUserId || "").trim();
  const companyId = String(args.companyId || "").trim();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!ownerUserId || !companyId) {
      setCount(0);
      return;
    }
    return subscribeIncomingSystemJoinRequests(
      { targetOwnerUserId: ownerUserId, targetCompanyId: companyId },
      (rows) => setCount(rows.length)
    );
  }, [ownerUserId, companyId]);

  return count;
}
