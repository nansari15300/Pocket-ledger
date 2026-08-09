/** Adjust Balance pill — user pointing-hand pic (Closing Balance ki taraf). */
export function AdjustBalancePillLabel() {
  return (
    <>
      Adjust Balance
      <img
        src="/adjust-balance-point.png"
        alt=""
        width={18}
        height={18}
        className="ml-1 inline-block h-[18px] w-[18px] shrink-0 object-contain"
        aria-hidden
        draggable={false}
      />
    </>
  );
}
