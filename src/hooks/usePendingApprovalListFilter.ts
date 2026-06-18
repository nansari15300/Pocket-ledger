import { useEffect, useState } from "react";

/** Master list pink badge — click se pending-only; sab approve hone par auto show-all. */
export function usePendingApprovalListFilter(totalPendingCount: number) {
  const [showOnlyEntities, setShowOnlyEntities] = useState(false);
  const [showOnlyGroups, setShowOnlyGroups] = useState(false);

  useEffect(() => {
    if (totalPendingCount <= 0) {
      setShowOnlyEntities(false);
      setShowOnlyGroups(false);
    }
  }, [totalPendingCount]);

  return {
    showOnlyEntities,
    setShowOnlyEntities,
    showOnlyGroups,
    setShowOnlyGroups,
  };
}
