"use client";

import { publicAssetUrl } from "@/lib/webAppBasePath";

/** Adjust Balance pill — pointing-hand pic (Closing Balance ki taraf). */
export function AdjustBalancePillLabel() {
  return (
    <>
      Adjust Balance
      <img
        src={publicAssetUrl("/adjust-balance-point.png")}
        alt=""
        width={18}
        height={18}
        className="ml-1 inline-block h-[18px] w-[18px] shrink-0 object-contain align-middle"
        aria-hidden
        draggable={false}
      />
    </>
  );
}
