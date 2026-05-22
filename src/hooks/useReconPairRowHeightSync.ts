import * as React from "react";

/** Opening row sync key — left/right tbody me same attribute */
export const RECON_PAIR_OPENING_KEY = "opening";

function getReconPairSegmentHeight(trs: HTMLTableRowElement[]): number {
  let h = 0;
  for (const tr of trs) h += tr.getBoundingClientRect().height;
  return h;
}

function resetReconPairSegmentSizing(trs: HTMLTableRowElement[]) {
  for (const tr of trs) {
    tr.style.height = "";
    tr.style.minHeight = "";
    tr.querySelectorAll("td").forEach((cell) => {
      cell.style.height = "";
      cell.style.minHeight = "";
      cell.style.paddingBottom = "";
    });
  }
}

/** Chhoti side — last tr ki height badhao (h-[32px] td pe padding kaam nahi karta) */
function stretchReconPairSegment(trs: HTMLTableRowElement[], targetTotal: number) {
  if (trs.length === 0 || targetTotal <= 0) return;
  const current = getReconPairSegmentHeight(trs);
  const diff = targetTotal - current;
  if (diff <= 0.5) return;
  const last = trs[trs.length - 1];
  if (!last) return;
  const lastH = last.getBoundingClientRect().height;
  last.style.height = `${lastH + diff}px`;
}

/**
 * Left/right pair row height sync:
 * - ek side filled, doosri empty → filled height dono pe
 * - dono filled → max height dono pe
 */
export function useReconPairRowHeightSync(
  leftBodyRef: React.RefObject<HTMLTableSectionElement | null>,
  rightBodyRef: React.RefObject<HTMLTableSectionElement | null>,
  pairCount: number,
  syncKey: string
) {
  React.useLayoutEffect(() => {
    const leftBody = leftBodyRef.current;
    const rightBody = rightBodyRef.current;
    if (!leftBody || !rightBody) return;

    let raf2 = 0;

    const sync = () => {
      // Height sync se scroll jump na ho — user jahan scroll kiya wahi rahe
      const scrollHost = leftBody.closest("[data-recon-scroll-host]") as HTMLElement | null;
      const savedScrollTop = scrollHost?.scrollTop ?? null;

      const keys = [RECON_PAIR_OPENING_KEY, ...Array.from({ length: pairCount }, (_, i) => String(i))];
      for (const key of keys) {
        const leftTrs = Array.from(
          leftBody.querySelectorAll<HTMLTableRowElement>(`tr[data-recon-pair="${key}"]`)
        );
        const rightTrs = Array.from(
          rightBody.querySelectorAll<HTMLTableRowElement>(`tr[data-recon-pair="${key}"]`)
        );
        resetReconPairSegmentSizing(leftTrs);
        resetReconPairSegmentSizing(rightTrs);
        const maxH = Math.max(getReconPairSegmentHeight(leftTrs), getReconPairSegmentHeight(rightTrs));
        stretchReconPairSegment(leftTrs, maxH);
        stretchReconPairSegment(rightTrs, maxH);
      }

      if (scrollHost != null && savedScrollTop != null) {
        scrollHost.scrollTop = savedScrollTop;
      }
    };

    sync();
    const raf1 = requestAnimationFrame(() => {
      sync();
      raf2 = requestAnimationFrame(sync);
    });

    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => sync()) : null;
    ro?.observe(leftBody);
    ro?.observe(rightBody);
    window.addEventListener("resize", sync);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      ro?.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, [leftBodyRef, rightBodyRef, pairCount, syncKey]);
}
