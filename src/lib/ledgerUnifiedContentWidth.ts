/**
 * Entity ledger unified H-scroll: header ribbon, column sum, footer pagination, closing row —
 * jo band asli content me sabse lamba ho wahi `--pl-ledger-txn-table-min-px` / col scale.
 * Stretched tables / footer shell (min-width var) ko measure mat karo — loop + stall hota hai.
 */

export const LEDGER_UNIFIED_WIDTH_STABLE_EPS_PX = 2;

export function stabilizeLedgerUnifiedPx(px: number, prev: number, eps = LEDGER_UNIFIED_WIDTH_STABLE_EPS_PX): number {
  const rounded = Math.max(0, Math.round(px));
  if (prev > 0 && Math.abs(rounded - prev) <= eps) return prev;
  return rounded;
}

export function measureLedgerUnifiedBandPx(el: Element | null | undefined): number {
  if (!(el instanceof HTMLElement)) return 0;
  const scroll = Math.ceil(el.scrollWidth || 0);
  const rect = Math.ceil(el.getBoundingClientRect().width || 0);
  return Math.max(scroll, rect, 0);
}

/** Flex row jahan min-w-full / host stretch ho — bachon ka sum + gap (natural footer width). */
export function measureFlexRowChildrenNaturalPx(row: Element | null | undefined): number {
  if (!(row instanceof HTMLElement)) return 0;
  const style = getComputedStyle(row);
  const gap =
    parseFloat(style.columnGap || "0") ||
    parseFloat(style.gap || "0") ||
    0;
  const pad =
    parseFloat(style.paddingLeft || "0") +
    parseFloat(style.paddingRight || "0") +
    parseFloat(style.marginLeft || "0") +
    parseFloat(style.marginRight || "0");
  const children = row.children;
  if (children.length === 0) return measureLedgerUnifiedBandPx(row);

  let sum = 0;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (!(child instanceof HTMLElement)) continue;
    sum += Math.ceil(child.getBoundingClientRect().width || 0);
  }
  const gaps = Math.max(0, children.length - 1) * gap;
  return Math.ceil(sum + gaps + pad);
}

export function computeLedgerUnifiedTableMinPx(args: {
  host: HTMLElement;
  bodyTable: HTMLElement | null;
  baseColSum: number;
  hostViewportPx: number;
}): { tableMinPx: number; scaleTargetPx: number; winnerPx: number } {
  const { host, baseColSum, hostViewportPx } = args;

  const bandEls: (Element | null)[] = [
    host.querySelector(".pl-ledger-header-outer-row"),
    host.querySelector(".pl-ledger-header-ribbon-wrap"),
    host.querySelector("[data-pl-closing-balance-card]"),
    host.querySelector("[data-pl-footer-parent-pill]"),
  ];

  host.querySelectorAll("[data-pl-ledger-unified-width-band]").forEach((el) => {
    bandEls.push(el);
  });

  let winnerPx = Math.max(0, baseColSum);
  for (const el of bandEls) {
    winnerPx = Math.max(winnerPx, measureLedgerUnifiedBandPx(el));
  }

  const footerNatural = measureFlexRowChildrenNaturalPx(
    host.querySelector("[data-pl-ledger-footer-measure-row]")
  );
  const footerShellPad = host.querySelector(".pl-ledger-desktop-footer-shell");
  if (footerShellPad instanceof HTMLElement) {
    const shellStyle = getComputedStyle(footerShellPad);
    winnerPx = Math.max(
      winnerPx,
      footerNatural +
        parseFloat(shellStyle.paddingLeft || "0") +
        parseFloat(shellStyle.paddingRight || "0")
    );
  } else {
    winnerPx = Math.max(winnerPx, footerNatural);
  }

  let tableMinPx = winnerPx;
  if (hostViewportPx > 0 && winnerPx > 0 && winnerPx < hostViewportPx) {
    tableMinPx = hostViewportPx;
  }

  const scaleTargetPx = Math.max(winnerPx, tableMinPx);
  return { tableMinPx, scaleTargetPx, winnerPx };
}
