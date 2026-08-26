"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { DaybookWedgeSnapshot } from "@wedge/daybook/types/daybookWedgeRow";
import {
  DAYBOOK_WEDGE_THEME,
  formatSummaryMoney,
} from "@wedge/daybook/preview/daybookWedgePreviewUtils";
import type { DaybookWedgeAccountSummaryRow, DaybookWedgeDayBucket } from "@wedge/daybook/types/daybookWedgeRow";
import { ChevronDown, ChevronRight, Info, RotateCw } from "lucide-react";
import {
  resolveDaybookWedgeDay,
  shiftDaybookWedgeDayIso,
} from "@wedge/daybook/sync/buildDaybookSnapshot";
import { formatWedgeDayLabelFromIso } from "@wedge/daybook/sync/formatWedgeDates";

export type DaybookWedgePreviewProps = {
  snapshot: DaybookWedgeSnapshot | null;
  selectedDayIso?: string | null;
  onSelectDayIso?: (iso: string) => void;
  selectedCompanyId?: string | null;
  onSelectCompanyId?: (id: string) => void;
  dateSystem?: "AD" | "BS" | "Both";
  onDateSystemChange?: (v: "AD" | "BS" | "Both") => void;
  formatDate?: (d: Date) => string;
  formatDateBS?: (d: Date) => string;
  widthPx?: number;
  heightPx?: number;
  fillScreen?: boolean;
  className?: string;
};

function SummaryMoneyCells({
  opening,
  inn,
  out,
  bal,
  bold,
}: {
  opening: number;
  inn: number;
  out: number;
  bal: number;
  bold?: boolean;
}) {
  const cell = bold ? "font-bold" : "";
  return (
    <>
      <td
        className={`py-0.5 pr-1 text-right ${cell}`}
        style={{ color: opening >= 0 ? DAYBOOK_WEDGE_THEME.green : DAYBOOK_WEDGE_THEME.red }}
      >
        {formatSummaryMoney(opening)}
      </td>
      <td className={`py-0.5 pr-1 text-right ${cell}`} style={{ color: DAYBOOK_WEDGE_THEME.green }}>
        {formatSummaryMoney(inn)}
      </td>
      <td className={`py-0.5 pr-1 text-right ${cell}`} style={{ color: DAYBOOK_WEDGE_THEME.red }}>
        {formatSummaryMoney(out)}
      </td>
      <td
        className={`py-0.5 text-right ${cell}`}
        style={{ color: bal >= 0 ? DAYBOOK_WEDGE_THEME.green : DAYBOOK_WEDGE_THEME.red }}
      >
        {formatSummaryMoney(bal)}
      </td>
    </>
  );
}

function DateNavRow({
  dayLabel,
  canOlder,
  canNewer,
  onPrev,
  onNext,
  onToday,
}: {
  dayLabel: string;
  canOlder: boolean;
  canNewer: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  return (
    <div
      className="mt-1 flex shrink-0 items-center gap-0.5 border-t border-solid pt-1"
      style={{ borderColor: DAYBOOK_WEDGE_THEME.summaryTableLine, borderTopWidth: 1 }}
    >
      <button
        type="button"
        disabled={!canOlder}
        onClick={onPrev}
        className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded text-lg font-bold leading-none disabled:opacity-30"
        style={{ color: DAYBOOK_WEDGE_THEME.accent }}
      >
        ‹
      </button>
      <div
        className="min-w-0 flex-1 truncate text-center text-[8px] font-medium"
        style={{ color: DAYBOOK_WEDGE_THEME.title }}
      >
        {dayLabel}
      </div>
      <button
        type="button"
        disabled={!canNewer}
        onClick={onNext}
        className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded text-lg font-bold leading-none disabled:opacity-30"
        style={{ color: DAYBOOK_WEDGE_THEME.accent }}
      >
        ›
      </button>
      <button
        type="button"
        className="shrink-0 rounded border bg-white px-1.5 py-0 text-[8px] font-medium"
        style={{ borderColor: DAYBOOK_WEDGE_THEME.divider, marginLeft: 10 }}
        onClick={onToday}
      >
        Today
      </button>
    </div>
  );
}

function SummaryCard({
  bucket,
  companyName,
  bankExpanded,
  cashExpanded,
  onToggleBank,
  onToggleCash,
  onToggleRotate,
  rotatedActive,
  dayLabel,
  canOlder,
  canNewer,
  onPrevDay,
  onNextDay,
  onToday,
}: {
  bucket: DaybookWedgeDayBucket;
  companyName: string;
  bankExpanded: boolean;
  cashExpanded: boolean;
  onToggleBank: () => void;
  onToggleCash: () => void;
  onToggleRotate: () => void;
  rotatedActive?: boolean;
  dayLabel: string;
  canOlder: boolean;
  canNewer: boolean;
  onPrevDay: () => void;
  onNextDay: () => void;
  onToday: () => void;
}) {
  const s = bucket.summary;
  const bankAccounts = s.bankAccounts || [];
  const cashAccounts = s.cashAccounts || [];
  const rowLine = "border-b border-solid";
  const headerBorder = rotatedActive ? 1 : 2;
  const rowLineStyle = { borderColor: DAYBOOK_WEDGE_THEME.summaryTableLine, borderBottomWidth: 1 };

  const renderAccountRow = (row: DaybookWedgeAccountSummaryRow) => (
    <tr key={row.id} className={rowLine} style={rowLineStyle}>
      <td className="truncate whitespace-nowrap py-0.5 pl-4 text-muted-foreground" title={row.name}>
        {row.name}
      </td>
      <SummaryMoneyCells opening={row.yesterday} inn={row.in} out={row.out} bal={row.today} />
    </tr>
  );

  return (
    <div
      className="flex h-full min-h-0 flex-col rounded-md border p-2 text-[9px]"
      style={{ background: DAYBOOK_WEDGE_THEME.summaryBg, borderColor: DAYBOOK_WEDGE_THEME.summaryBorder }}
    >
      <div className="mb-1 flex shrink-0 items-center gap-1">
        <div className="flex min-w-0 flex-1 items-center gap-1 font-semibold" style={{ color: DAYBOOK_WEDGE_THEME.summaryTitle }}>
          <Info className="h-3 w-3 shrink-0" />
          <span className="truncate">Daily Summary</span>
        </div>
        <div
          className="max-w-[42%] shrink-0 truncate rounded-md border bg-white px-2 py-0.5 text-[9px] font-medium shadow-sm"
          style={{ borderColor: DAYBOOK_WEDGE_THEME.summaryBorder, color: DAYBOOK_WEDGE_THEME.summaryTitle }}
          title={companyName}
        >
          {companyName}
        </div>
        <button
          type="button"
          className="shrink-0 rounded p-0.5 hover:bg-black/5"
          aria-label={rotatedActive ? "Exit fullscreen" : "Rotate fullscreen"}
          onClick={onToggleRotate}
        >
          <RotateCw
            className="h-3.5 w-3.5"
            style={{ color: rotatedActive ? DAYBOOK_WEDGE_THEME.accent : DAYBOOK_WEDGE_THEME.summaryTitle }}
          />
        </button>
      </div>
      <div className="mb-1 shrink-0" style={{ color: DAYBOOK_WEDGE_THEME.summarySub }}>
        Only showing bank and cash summary.
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full table-fixed border-collapse">
          <colgroup>
            <col style={{ width: "38%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "16%" }} />
          </colgroup>
          <thead>
            <tr
              className="border-b border-solid"
              style={{
                color: DAYBOOK_WEDGE_THEME.summaryTitle,
                borderColor: DAYBOOK_WEDGE_THEME.summaryTableLine,
                borderBottomWidth: headerBorder,
              }}
            >
              <th className="py-0.5 pr-1 font-bold">Account</th>
              <th className="py-0.5 pr-1 text-right font-bold">Opening</th>
              <th className="py-0.5 pr-1 text-right font-bold" style={{ color: DAYBOOK_WEDGE_THEME.green }}>
                Today In
              </th>
              <th className="py-0.5 pr-1 text-right font-bold" style={{ color: DAYBOOK_WEDGE_THEME.red }}>
                Today Out
              </th>
              <th className="py-0.5 text-right font-bold">Today Bal</th>
            </tr>
          </thead>
          <tbody>
            <tr className={rowLine} style={rowLineStyle}>
              <td className="truncate whitespace-nowrap py-0.5 pr-1 font-medium">
                <button type="button" className="flex max-w-full items-center gap-0.5 truncate text-left" onClick={onToggleBank}>
                  {bankExpanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                  Bank
                </button>
              </td>
              <SummaryMoneyCells opening={s.bankYesterday} inn={s.bankIn} out={s.bankOut} bal={s.bankToday} />
            </tr>
            {bankExpanded ? bankAccounts.map(renderAccountRow) : null}
            <tr className={rowLine} style={rowLineStyle}>
              <td className="truncate whitespace-nowrap py-0.5 pr-1 font-medium">
                <button type="button" className="flex max-w-full items-center gap-0.5 truncate text-left" onClick={onToggleCash}>
                  {cashExpanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                  Cash
                </button>
              </td>
              <SummaryMoneyCells opening={s.cashYesterday} inn={s.cashIn} out={s.cashOut} bal={s.cashToday} />
            </tr>
            {cashExpanded ? cashAccounts.map(renderAccountRow) : null}
            <tr className={`${rowLine} font-bold`} style={rowLineStyle}>
              <td className="py-0.5 pr-1">Total</td>
              <SummaryMoneyCells opening={s.totalYesterday} inn={s.totalIn} out={s.totalOut} bal={s.totalToday} bold />
            </tr>
          </tbody>
        </table>
      </div>
      <DateNavRow
        dayLabel={dayLabel}
        canOlder={canOlder}
        canNewer={canNewer}
        onPrev={onPrevDay}
        onNext={onNextDay}
        onToday={onToday}
      />
    </div>
  );
}

/** Dev / mock: Daybook wedge — Daily Summary card only (no transaction list). */
export function DaybookWedgePreview({
  snapshot,
  selectedDayIso,
  onSelectDayIso,
  formatDate,
  formatDateBS,
  widthPx = 340,
  heightPx = 640,
  fillScreen = false,
  className,
}: DaybookWedgePreviewProps) {
  const activeIso = selectedDayIso || snapshot?.defaultDayIso || snapshot?.selectedDayIso || "";
  const bucket = resolveDaybookWedgeDay(snapshot, activeIso);
  const dateSystem = snapshot?.isNepalCalendar ? "BS" : "AD";
  const canFormatDates = Boolean(formatDate && formatDateBS);
  const dayLabel =
    bucket && canFormatDates
      ? formatWedgeDayLabelFromIso(bucket.dayIso, dateSystem, formatDate!, formatDateBS!)
      : bucket?.dayLabel || "—";
  const companyName = snapshot?.companyName || "Company";

  const canOlder = Boolean(snapshot && activeIso && shiftDaybookWedgeDayIso(snapshot, activeIso, 1));
  const canNewer = Boolean(snapshot && activeIso && shiftDaybookWedgeDayIso(snapshot, activeIso, -1));

  const [bankExpanded, setBankExpanded] = useState(true);
  const [cashExpanded, setCashExpanded] = useState(true);
  const [summaryFullscreen, setSummaryFullscreen] = useState(false);
  const [summaryRotated, setSummaryRotated] = useState(false);
  const fullscreenShellRef = useRef<HTMLDivElement>(null);
  const [rotatedSize, setRotatedSize] = useState({ w: heightPx, h: widthPx });

  useLayoutEffect(() => {
    if (!summaryFullscreen || !summaryRotated || !fullscreenShellRef.current) return;
    const el = fullscreenShellRef.current;
    const update = () => {
      const r = el.getBoundingClientRect();
      setRotatedSize({ w: Math.max(0, r.height), h: Math.max(0, r.width) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [summaryFullscreen, summaryRotated, fillScreen, widthPx, heightPx]);

  const toggleSummaryRotate = () => {
    setSummaryRotated((v) => {
      const next = !v;
      setSummaryFullscreen(next);
      return next;
    });
  };

  const dateNavProps = {
    dayLabel,
    canOlder: canOlder && Boolean(onSelectDayIso),
    canNewer: canNewer && Boolean(onSelectDayIso),
    onPrevDay: () => {
      const n = shiftDaybookWedgeDayIso(snapshot, activeIso, 1);
      if (n) onSelectDayIso?.(n);
    },
    onNextDay: () => {
      const n = shiftDaybookWedgeDayIso(snapshot, activeIso, -1);
      if (n) onSelectDayIso?.(n);
    },
    onToday: () => {
      const today = snapshot?.defaultDayIso;
      if (today) onSelectDayIso?.(today);
    },
  };

  const cardProps = bucket
    ? {
        bucket,
        companyName,
        bankExpanded,
        cashExpanded,
        onToggleBank: () => setBankExpanded((v) => !v),
        onToggleCash: () => setCashExpanded((v) => !v),
        onToggleRotate: toggleSummaryRotate,
        rotatedActive: summaryRotated,
        ...dateNavProps,
      }
    : null;

  if (summaryFullscreen && cardProps) {
    return (
      <div
        ref={fullscreenShellRef}
        className={className}
        style={{
          width: fillScreen ? "100%" : widthPx,
          height: fillScreen ? "100%" : heightPx,
          minHeight: fillScreen ? 0 : undefined,
          background: DAYBOOK_WEDGE_THEME.bg,
          boxSizing: "border-box",
          borderRadius: fillScreen ? 12 : 16,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          className={summaryRotated ? "absolute left-1/2 top-1/2 h-full w-full" : "absolute inset-0 p-2"}
          style={
            summaryRotated
              ? {
                  transform: "translate(-50%, -50%) rotate(90deg)",
                  width: rotatedSize.w,
                  height: rotatedSize.h,
                }
              : undefined
          }
        >
          <SummaryCard {...cardProps} />
        </div>
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{
        width: fillScreen ? "100%" : widthPx,
        height: fillScreen ? "100%" : heightPx,
        minHeight: fillScreen ? 0 : undefined,
        background: DAYBOOK_WEDGE_THEME.bg,
        boxSizing: "border-box",
        borderRadius: fillScreen ? 12 : 16,
        boxShadow: fillScreen ? "none" : "0 4px 24px rgba(0,0,0,0.12)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        padding: 8,
      }}
    >
      <div className="min-h-0 flex-1">
        {cardProps ? (
          <SummaryCard {...cardProps} />
        ) : (
          <div className="flex h-full items-center justify-center text-xs" style={{ color: DAYBOOK_WEDGE_THEME.muted }}>
            No summary data
          </div>
        )}
      </div>
    </div>
  );
}
