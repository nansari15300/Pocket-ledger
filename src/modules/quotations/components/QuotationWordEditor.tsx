"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { FilePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import AdCalendar from "@/components/ui/ad-calendar";
import NepaliCalendar from "@/components/ui/nepali-calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDate } from "@/hooks/useDate";
import { VOUCHER_DIALOG_CALENDAR_POPOVER_CN } from "@/lib/dialogShellChrome";
import { clientRandomUUID } from "@/lib/clientRandomUUID";
import { cn } from "@/lib/utils";
import {
  QUOTATION_DEFAULT_ADDRESS_FONT_SIZE,
  QUOTATION_DEFAULT_AMOUNT_WORDS_COLOR,
  QUOTATION_DEFAULT_AMOUNT_WORDS_FONT_SIZE,
  QUOTATION_DEFAULT_COMPANY_NAME_FONT_SIZE,
  QUOTATION_FONT_SIZES,
} from "../constants";
import { setEditableContent } from "../html";
import { letterLangFromCountry, asQuotationLetterLang, QT_NO_LABELS, SUBJECT_LABELS, DATE_LABELS, PAN_LABEL_OPTIONS, PHONE_LABEL_OPTIONS, resolvePanLabelOption, resolvePhoneLabelOption, phoneLabelOptionsForCountry } from "../letterhead";
import {
  bodyHasLayoutContent,
  extraBodyIsPlaceholderHtml,
  normalizeRowSplits,
  pageContentBottom,
  pullUnderflowBack,
  pushOverflowForward,
  rowsFittingBelowBody,
  sameRowSplits,
} from "../quotationPageFlow";
import { retagQuotationNumberFy, type QuotationFyCompany } from "../quotationNumber";
import type {
  QuotationDraft,
  QuotationLetterhead,
  QuotationPageImage,
  QuotationTableCellTarget,
  QuotationTableTextStyle,
} from "../types";
import { DEFAULT_QUOTATION_SIDE_TYPING_LINK_ID } from "../quotationOnlineTypingLinks";
import { QuotationSideTypingPanel } from "./QuotationSideTypingPanel";
import { applyTableStyleToDraft, quotationTableCellTargets } from "../tableTextStyle";
import { QuotationLetterLangMenu } from "./QuotationLetterLangMenu";
import { QuotationWordToolbar } from "./QuotationWordToolbar";
import { QuotationItemsTable, quotationGrandTotal } from "./QuotationItemsTable";
import { QuotationPagePictures } from "./QuotationPagePictures";
import "../quotation-letter.css";

type SavedSel = { range: Range; editable: HTMLElement };

function QuotationAddPageBar({ onAddPage }: { onAddPage: () => void }) {
  return (
    <div className="quotation-letter-add-page-bar quotation-letter-ui-only">
      <Button type="button" variant="chromePill" size="sm" className="h-8 px-3 text-xs" title="Add page" onClick={onAddPage}>
        <FilePlus className="mr-1 h-3.5 w-3.5" />
        Add page
      </Button>
    </div>
  );
}

function LetterBsDateText({
  value,
  label,
  onChange,
}: {
  value: Date;
  label: string;
  onChange: (d: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <button type="button" className="quotation-letter-date-trigger">
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        collisionPadding={16}
        className={cn("w-auto p-0", VOUCHER_DIALOG_CALENDAR_POPOVER_CN)}
      >
        <NepaliCalendar
          isRange={false}
          numberOfMonths={1}
          valueAD={value}
          onSelect={(_bs, adDate) => {
            const next = new Date(adDate.getFullYear(), adDate.getMonth(), adDate.getDate(), 12, 0, 0, 0);
            onChange(next);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function LetterAdDateText({
  value,
  label,
  onChange,
}: {
  value: Date;
  label: string;
  onChange: (d: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <button type="button" className="quotation-letter-date-trigger">
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        collisionPadding={16}
        className={cn("w-auto p-0", VOUCHER_DIALOG_CALENDAR_POPOVER_CN)}
      >
        <AdCalendar
          isRange={false}
          numberOfMonths={1}
          valueAD={value}
          onSelect={(d) => {
            const next = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
            onChange(next);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function exec(cmd: string, value?: string) {
  try {
    document.execCommand(cmd, false, value);
  } catch {
    /* ignore */
  }
}

function nearestFontSize(px: number): number {
  let best: number = QUOTATION_FONT_SIZES[0];
  let dist = Math.abs(px - best);
  for (const size of QUOTATION_FONT_SIZES) {
    const d = Math.abs(px - size);
    if (d < dist) {
      best = size;
      dist = d;
    }
  }
  return best;
}

function selectionEditable(): HTMLElement | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const node = sel.getRangeAt(0).commonAncestorContainer;
  const el = node instanceof HTMLElement ? node : node.parentElement;
  return el?.closest('[contenteditable="true"]') as HTMLElement | null;
}

function isAmountWordsField(el: HTMLElement | null): boolean {
  if (!el) return false;
  return el.getAttribute("data-q-field") === "amount-words" || !!el.closest('[data-q-field="amount-words"]');
}

function amountWordsRowFrom(el: HTMLElement | null): HTMLElement | null {
  if (!el) return null;
  if (el.getAttribute("data-q-field") === "amount-words") return el;
  return el.closest('[data-q-field="amount-words"]') as HTMLElement | null;
}

function captureSelection(root: HTMLElement | null): SavedSel | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) {
    const active = document.activeElement;
    if (active instanceof HTMLElement) {
      const amount = amountWordsRowFrom(active);
      if (amount && (!root || root.contains(amount))) {
        const range = document.createRange();
        range.selectNodeContents(amount);
        return { range, editable: amount };
      }
      const table = active.closest(".quotation-letter-items-table") as HTMLElement | null;
      if (table && (!root || root.contains(table))) {
        const range = document.createRange();
        try {
          range.selectNodeContents(active.closest("td, th") || table);
        } catch {
          range.selectNodeContents(table);
        }
        return { range, editable: table };
      }
    }
    return null;
  }
  const range = sel.getRangeAt(0);
  const node = range.commonAncestorContainer;
  const el = node instanceof HTMLElement ? node : node.parentElement;
  const amountWords = amountWordsRowFrom(el);
  if (amountWords && (!root || root.contains(amountWords))) {
    const table = amountWords.closest(".quotation-letter-items-table");
    if (table && (range.commonAncestorContainer instanceof Element ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement)?.closest("thead, tbody")) {
      return { range: range.cloneRange(), editable: table as HTMLElement };
    }
    return { range: range.cloneRange(), editable: amountWords };
  }
  const table = el?.closest(".quotation-letter-items-table") as HTMLElement | null;
  if (table && (!root || root.contains(table))) {
    return { range: range.cloneRange(), editable: table };
  }
  const editable = el?.closest('[contenteditable="true"]') as HTMLElement | null;
  if (!editable || (root && !root.contains(editable))) return null;
  return { range: range.cloneRange(), editable };
}

function restoreSelection(saved: SavedSel | null): boolean {
  if (!saved) return false;
  try {
    if (saved.editable.isContentEditable) saved.editable.focus();
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(saved.range);
    return true;
  } catch {
    return false;
  }
}

function stripInlineFontSize(root: HTMLElement) {
  root.querySelectorAll("font, span, [style]").forEach((node) => {
    const el = node as HTMLElement;
    if (el.style?.fontSize) el.style.removeProperty("font-size");
    if (el.getAttribute("size")) el.removeAttribute("size");
  });
  root.querySelectorAll("font").forEach((font) => {
    const span = document.createElement("span");
    while (font.firstChild) span.appendChild(font.firstChild);
    font.replaceWith(span);
  });
}

function constrainRangeToTypedText(range: Range): Range | null {
  const node = range.commonAncestorContainer;
  const el = node instanceof HTMLElement ? node : node.parentElement;
  const line = el?.closest(".quotation-letter-prefixed") as HTMLElement | null;
  const value = prefixedValueEl(line);
  if (value) {
    if (value.contains(range.startContainer) && value.contains(range.endContainer)) return range;
    if (!line?.contains(value)) return range;
    const next = document.createRange();
    try {
      next.selectNodeContents(value);
      if (value.contains(range.startContainer)) next.setStart(range.startContainer, range.startOffset);
      if (value.contains(range.endContainer)) next.setEnd(range.endContainer, range.endOffset);
      return next.collapsed ? null : next;
    } catch {
      return range;
    }
  }
  const table = el?.closest(".quotation-letter-items-table");
  if (table) {
    const startCell = (range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement)?.closest("td, th") as HTMLElement | null;
    const endCell = (range.endContainer instanceof Element ? range.endContainer : range.endContainer.parentElement)?.closest("td, th") as HTMLElement | null;
    if (!startCell || startCell !== endCell) return null;
    if (/^(TABLE|THEAD|TBODY|TFOOT|TR)$/.test((range.commonAncestorContainer instanceof Element ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement)?.tagName || "")) {
      return null;
    }
    return range;
  }
  return range;
}

function wrapSelectionCss(assign: (span: HTMLSpanElement) => void) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  let range = sel.getRangeAt(0);
  const bounded = constrainRangeToTypedText(range);
  if (!bounded) return;
  range = bounded;
  const ancestor = range.commonAncestorContainer;
  const ancestorEl = ancestor instanceof HTMLElement ? ancestor : ancestor.parentElement;
  if (ancestorEl && /^(TABLE|THEAD|TBODY|TFOOT|TR)$/.test(ancestorEl.tagName)) return;
  const span = document.createElement("span");
  assign(span);
  if (range.collapsed) {
    const editable = selectionEditable();
    if (!editable) return;
    span.appendChild(document.createTextNode("\u200b"));
    range.insertNode(span);
    const caret = document.createRange();
    caret.setStart(span.firstChild || span, 1);
    caret.collapse(true);
    sel.removeAllRanges();
    sel.addRange(caret);
    return;
  }
  try {
    range.surroundContents(span);
  } catch {
    span.appendChild(range.extractContents());
    range.insertNode(span);
  }
  sel.removeAllRanges();
  const next = document.createRange();
  next.selectNodeContents(span);
  sel.addRange(next);
}

function paintEditableContents(editable: HTMLElement, assign: (span: HTMLSpanElement) => void) {
  const only =
    editable.childElementCount === 1 && editable.firstElementChild instanceof HTMLSpanElement
      ? (editable.firstElementChild as HTMLSpanElement)
      : null;
  if (only && editable.childNodes.length === 1) {
    assign(only);
    return;
  }
  const span = document.createElement("span");
  assign(span);
  while (editable.firstChild) span.appendChild(editable.firstChild);
  if (!span.childNodes.length) span.appendChild(document.createElement("br"));
  editable.appendChild(span);
}

function wrapSelectionFontSize(px: number) {
  wrapSelectionCss((span) => {
    span.style.setProperty("font-size", `${px}px`);
  });
}

function selectionIsCollapsed(): boolean {
  const sel = window.getSelection();
  return !sel || sel.rangeCount === 0 || sel.getRangeAt(0).collapsed;
}

function applyFontColor(color: string, editable: HTMLElement | null) {
  const paint = (span: HTMLSpanElement) => {
    span.style.setProperty("color", color, "important");
  };
  if (!selectionIsCollapsed()) {
    wrapSelectionCss(paint);
    return;
  }
  const target = editable || selectionEditable();
  if (target && isLetterheadSizeField(target)) {
    paintEditableContents(target, paint);
    return;
  }
  wrapSelectionCss(paint);
}

function applyHighlightColor(color: string, editable: HTMLElement | null) {
  const bg = color || "transparent";
  const paint = (span: HTMLSpanElement) => {
    if (!color) {
      span.style.removeProperty("background-color");
      return;
    }
    span.style.setProperty("background-color", bg, "important");
  };
  if (!selectionIsCollapsed()) {
    wrapSelectionCss(paint);
    return;
  }
  const target = editable || selectionEditable();
  if (target && isLetterheadSizeField(target)) {
    paintEditableContents(target, paint);
    return;
  }
  wrapSelectionCss(paint);
}

function roughlySameHtml(a: string, b: string): boolean {
  const n = (s: string) =>
    String(s || "")
      .replace(/&nbsp;/gi, " ")
      .replace(/<br\s*\/?>/gi, "")
      .replace(/\s+/g, "")
      .trim();
  return n(a) === n(b);
}

function rgbToHex(color: string): string {
  const m = String(color || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!m) return color.startsWith("#") ? color.slice(0, 7) : "#111111";
  return `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`;
}

function rgbToHighlightHex(color: string): string {
  const raw = String(color || "").trim().toLowerCase();
  if (!raw || raw === "transparent") return "";
  const m = raw.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
  if (m && m[4] !== undefined && Number(m[4]) === 0) return "";
  const hex = rgbToHex(color);
  if (hex === "#ffffff" || hex === "#fff") return "";
  return hex;
}

function isLetterheadSizeField(el: HTMLElement | null): "name" | "address" | null {
  if (!el) return null;
  if (el.classList.contains("quotation-letter-name")) return "name";
  if (el.classList.contains("quotation-letter-address")) return "address";
  return null;
}

function applyFontSizePx(px: number, editable: HTMLElement | null) {
  if (!selectionIsCollapsed()) {
    wrapSelectionFontSize(px);
    return;
  }
  const target = editable || selectionEditable();
  if (!target) return;
  const field = isLetterheadSizeField(target);
  if (field) {
    target.style.fontSize = `${px}px`;
    stripInlineFontSize(target);
    return;
  }
  wrapSelectionFontSize(px);
}

function LetterEditable({
  className,
  style,
  value,
  placeholder,
  field,
  fieldRef,
  onSync,
  spellCheck = true,
}: {
  className?: string;
  style?: React.CSSProperties;
  value: string;
  placeholder?: string;
  field?: string;
  fieldRef: React.MutableRefObject<HTMLDivElement | null>;
  onSync: () => void;
  spellCheck?: boolean;
}) {
  return (
    <div
      ref={(node) => {
        fieldRef.current = node;
        if (node && node.dataset.hydrated !== "1") {
          setEditableContent(node, value);
          node.dataset.hydrated = "1";
        }
      }}
      className={className}
      style={style}
      data-q-field={field}
      contentEditable
      suppressContentEditableWarning
      spellCheck={spellCheck}
      data-placeholder={placeholder}
      onInput={onSync}
      onBlur={onSync}
    />
  );
}

function prefixedValueEl(line: HTMLElement | null): HTMLElement | null {
  return (line?.querySelector(".quotation-letter-prefixed-value") as HTMLElement | null) || null;
}

function prefixedValueHtml(line: HTMLElement | null, fallback: string): string {
  return prefixedValueEl(line)?.innerHTML ?? fallback;
}

function LetterPrefixedLine({
  lineRef,
  field,
  className,
  value,
  menu,
  onSync,
}: {
  lineRef: React.MutableRefObject<HTMLDivElement | null>;
  field: string;
  className?: string;
  value: string;
  menu: React.ReactNode;
  onSync: () => void;
}) {
  return (
    <div
      ref={(node) => {
        lineRef.current = node;
      }}
      className={cn("quotation-letter-prefixed quotation-letter-editable", className)}
      contentEditable
      suppressContentEditableWarning
      onInput={onSync}
      onBlur={onSync}
    >
      <span className="quotation-letter-prefixed-label" contentEditable={false}>
        {menu}
      </span>{" "}
      <span
        ref={(node) => {
          if (node && node.dataset.hydrated !== "1") {
            setEditableContent(node, value);
            node.dataset.hydrated = "1";
          }
        }}
        className="quotation-letter-prefixed-value"
        data-q-field={field}
      />
    </div>
  );
}

export function QuotationWordEditor({
  draft,
  onChange: pushParent,
  companyCountry,
  fyCompany,
}: {
  draft: QuotationDraft;
  onChange: (patch: Partial<QuotationDraft>) => void;
  companyCountry?: string;
  fyCompany?: QuotationFyCompany;
}) {
  const { dateSystem, formatDate, formatDateBS } = useDate();
  const pagesRootRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef<HTMLElement | null>(null);
  const extraBodyRefs = useRef<Array<HTMLDivElement | null>>([]);
  const extraPageRefs = useRef<Array<HTMLElement | null>>([]);
  const extraPageIdsRef = useRef<string[]>([]);
  const savedSelRef = useRef<SavedSel | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const panRef = useRef<HTMLDivElement | null>(null);
  const phoneRef = useRef<HTMLDivElement | null>(null);
  const nameRef = useRef<HTMLDivElement | null>(null);
  const addressRef = useRef<HTMLDivElement | null>(null);
  const recipientRef = useRef<HTMLDivElement | null>(null);
  const subjectRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const gapRef = useRef<HTMLDivElement | null>(null);
  const tailRef = useRef<HTMLDivElement | null>(null);
  const extraGapRefs = useRef<Array<HTMLDivElement | null>>([]);
  const extraTailRefs = useRef<Array<HTMLDivElement | null>>([]);
  const lastInsertPosRef = useRef<{ pageIndex: number; x: number; y: number } | null>(null);
  const picDraggingRef = useRef(false);
  const tableSelRef = useRef<QuotationTableCellTarget[]>([]);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const pushParentRef = useRef(pushParent);
  pushParentRef.current = pushParent;
  const applyingUndoRef = useRef(false);
  const skipHistoryRef = useRef(false);
  const coalescingRef = useRef(false);
  const coalesceTimerRef = useRef<number | null>(null);
  const historyRef = useRef<{ past: QuotationDraft[]; future: QuotationDraft[] }>({ past: [], future: [] });
  const [historyTick, setHistoryTick] = useState(0);
  const noteHistory = () => {
    if (applyingUndoRef.current || skipHistoryRef.current) return;
    if (!coalescingRef.current) {
      historyRef.current.past.push(JSON.parse(JSON.stringify(draftRef.current)) as QuotationDraft);
      if (historyRef.current.past.length > 80) historyRef.current.past.shift();
      historyRef.current.future = [];
      coalescingRef.current = true;
      setHistoryTick((n) => n + 1);
    }
    if (coalesceTimerRef.current) window.clearTimeout(coalesceTimerRef.current);
    coalesceTimerRef.current = window.setTimeout(() => {
      coalescingRef.current = false;
      coalesceTimerRef.current = null;
    }, 450);
  };
  const onChange = (patch: Partial<QuotationDraft>) => {
    noteHistory();
    pushParentRef.current(patch);
  };
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [fontSize, setFontSize] = useState(QUOTATION_DEFAULT_COMPANY_NAME_FONT_SIZE);
  const [textColor, setTextColor] = useState("#111111");
  const [highlightColor, setHighlightColor] = useState("");
  const extraPagesHtml = Array.isArray(draft.extraPagesHtml) ? draft.extraPagesHtml : [];
  const pageFlow = draft.pageFlow === "right" ? "right" : "bottom";
  const [sideTypingOpen, setSideTypingOpen] = useState(false);
  const [sideTypingLinkId, setSideTypingLinkId] = useState(DEFAULT_QUOTATION_SIDE_TYPING_LINK_ID);
  const lastDraftIdRef = useRef(draft.id);
  const itemPageRowsRef = useRef<number[]>([]);
  const userExtraCountRef = useRef(0);
  const [itemPageRows, setItemPageRowsState] = useState<number[]>([]);
  if (lastDraftIdRef.current !== draft.id) {
    lastDraftIdRef.current = draft.id;
    extraPageIdsRef.current = extraPagesHtml.map((_, i) => `pg-${i}-${draft.id || "new"}`);
    extraBodyRefs.current = [];
    extraPageRefs.current = [];
    itemPageRowsRef.current = [];
    userExtraCountRef.current = 0;
  }
  if (extraPageIdsRef.current.length < extraPagesHtml.length) {
    while (extraPageIdsRef.current.length < extraPagesHtml.length) {
      extraPageIdsRef.current.push(`pg-${extraPageIdsRef.current.length}-${Date.now()}`);
    }
  } else if (extraPageIdsRef.current.length > extraPagesHtml.length) {
    extraPageIdsRef.current.length = extraPagesHtml.length;
    extraBodyRefs.current.length = extraPagesHtml.length;
    extraPageRefs.current.length = extraPagesHtml.length;
  }
  const [selectedPicId, setSelectedPicId] = useState<string | null>(null);
  const pageImages = Array.isArray(draft.pageImages) ? draft.pageImages : [];
  const dateValue = draft.dateIso ? new Date(draft.dateIso) : new Date();
  const defaultLang = letterLangFromCountry(companyCountry);
  const numberLabelLang = draft.numberLabelLang || defaultLang;
  const subjectLabelLang = draft.subjectLabelLang || defaultLang;
  const dateLabelLang = draft.dateLabelLang || defaultLang;
  const amountWordsLang = draft.amountWordsLang || defaultLang;
  const amountWordsFontSize = draft.amountWordsFontSize || QUOTATION_DEFAULT_AMOUNT_WORDS_FONT_SIZE;
  const amountWordsColor = draft.amountWordsColor || QUOTATION_DEFAULT_AMOUNT_WORDS_COLOR;
  const panLabelOpt = resolvePanLabelOption(
    draft.panLabelLang,
    draft.panLabelKind,
    draft.letterhead.panLabel,
    companyCountry
  );
  const phoneLabelOpt = resolvePhoneLabelOption(
    draft.phoneLabelLang,
    draft.phoneLabelKind,
    draft.letterhead.phoneLabel,
    companyCountry
  );
  const nameFontSize = draft.letterhead.companyNameFontSize || QUOTATION_DEFAULT_COMPANY_NAME_FONT_SIZE;
  const addressFontSize = draft.letterhead.addressFontSize || QUOTATION_DEFAULT_ADDRESS_FONT_SIZE;
  const fySource = fyCompany ?? { country: companyCountry };

  const applyLetterDate = (d: Date) => {
    onChange({
      dateIso: d.toISOString(),
      quotationNumber: retagQuotationNumberFy(draft.quotationNumber, fySource, d),
    });
  };

  useEffect(() => {
    itemPageRowsRef.current = [];
    userExtraCountRef.current = 0;
    setItemPageRowsState([]);
    historyRef.current = { past: [], future: [] };
    coalescingRef.current = false;
    setHistoryTick((n) => n + 1);
    [bodyRef.current, gapRef.current, tailRef.current, panRef.current, phoneRef.current, subjectRef.current, ...extraBodyRefs.current, ...extraGapRefs.current, ...extraTailRefs.current].forEach(
      (el) => {
        if (el) delete el.dataset.hydrated;
        const val = prefixedValueEl(el);
        if (val) delete val.dataset.hydrated;
      }
    );
    if (gapRef.current) {
      setEditableContent(gapRef.current, draftRef.current.gapHtml || "<p><br></p>");
      gapRef.current.dataset.hydrated = "1";
    }
    if (tailRef.current) {
      setEditableContent(tailRef.current, draftRef.current.tailHtml || "<p><br></p>");
      tailRef.current.dataset.hydrated = "1";
    }
    const fillPrefixed = (line: HTMLElement | null, html: string) => {
      const val = prefixedValueEl(line);
      if (!val) return;
      setEditableContent(val, html);
      val.dataset.hydrated = "1";
    };
    fillPrefixed(panRef.current, draftRef.current.letterhead.pan);
    fillPrefixed(phoneRef.current, draftRef.current.letterhead.phone);
    fillPrefixed(subjectRef.current, draftRef.current.subject);
  }, [draft.id]);

  useEffect(() => {
    const d = draft.dateIso ? new Date(draft.dateIso) : new Date();
    const tagged = retagQuotationNumberFy(draft.quotationNumber, fyCompany ?? { country: companyCountry }, d);
    if (tagged && tagged !== draft.quotationNumber) {
      onChangeRef.current({ quotationNumber: tagged });
    }
  }, [draft.quotationNumber, draft.dateIso, fyCompany, companyCountry]);

  const preserveSelection = useCallback(() => {
    const saved = captureSelection(pagesRootRef.current);
    if (saved) {
      savedSelRef.current = saved;
      if (
        saved.editable.classList.contains("quotation-letter-items-table") ||
        saved.editable.closest(".quotation-letter-items-table")
      ) {
        tableSelRef.current = quotationTableCellTargets(saved.range);
      } else {
        tableSelRef.current = [];
      }
    }
  }, []);

  const syncFromDom = useCallback(() => {
    const current = draftRef.current;
    const namePx = parseFloat(nameRef.current?.style.fontSize || "");
    const addressPx = parseFloat(addressRef.current?.style.fontSize || "");
    const letterhead: QuotationLetterhead = {
      ...current.letterhead,
      pan: prefixedValueHtml(panRef.current, current.letterhead.pan),
      phone: prefixedValueHtml(phoneRef.current, current.letterhead.phone),
      companyName: nameRef.current?.innerHTML ?? current.letterhead.companyName,
      address: addressRef.current?.innerHTML ?? current.letterhead.address,
      companyNameFontSize: Number.isFinite(namePx) && namePx > 0 ? namePx : current.letterhead.companyNameFontSize,
      addressFontSize: Number.isFinite(addressPx) && addressPx > 0 ? addressPx : current.letterhead.addressFontSize,
    };
    onChangeRef.current({
      letterhead,
      recipientName: recipientRef.current?.innerHTML ?? current.recipientName,
      subject: prefixedValueHtml(subjectRef.current, current.subject),
      bodyHtml: bodyRef.current?.innerHTML ?? current.bodyHtml,
      extraPagesHtml: extraPagesHtml.map((_, i) => extraBodyRefs.current[i]?.innerHTML ?? current.extraPagesHtml?.[i] ?? ""),
      gapHtml: gapRef.current?.innerHTML ?? current.gapHtml ?? "",
      extraGapHtml: extraPagesHtml.map((_, i) => extraGapRefs.current[i]?.innerHTML ?? current.extraGapHtml?.[i] ?? ""),
      tailHtml: tailRef.current?.innerHTML ?? current.tailHtml ?? "",
      extraTailHtml: extraPagesHtml.map((_, i) => extraTailRefs.current[i]?.innerHTML ?? current.extraTailHtml?.[i] ?? ""),
    });
  }, [extraPagesHtml.length]);

  const addingPageRef = useRef(false);
  const reflowingRef = useRef(false);
  const extraDropStableRef = useRef(0);
  const pendingReflowRef = useRef(false);

  const persistPagesFromDom = useCallback((extraPagesHtmlNext?: string[]) => {
    const current = draftRef.current;
    const bodyHtml = bodyRef.current?.innerHTML ?? current.bodyHtml;
    const extraPagesHtml =
      extraPagesHtmlNext ||
      (current.extraPagesHtml || []).map(
        (html, i) => extraBodyRefs.current[i]?.innerHTML ?? html ?? ""
      );
    const gapHtml = gapRef.current?.innerHTML ?? current.gapHtml ?? "";
    const extraGapHtml = extraPagesHtml.map((_, i) => extraGapRefs.current[i]?.innerHTML ?? current.extraGapHtml?.[i] ?? "");
    const tailHtml = tailRef.current?.innerHTML ?? current.tailHtml ?? "";
    const extraTailHtml = extraPagesHtml.map((_, i) => extraTailRefs.current[i]?.innerHTML ?? current.extraTailHtml?.[i] ?? "");
    const prevExtras = current.extraPagesHtml || [];
    const sameBody = roughlySameHtml(bodyHtml, current.bodyHtml);
    const sameExtras =
      extraPagesHtml.length === prevExtras.length &&
      extraPagesHtml.every((html, i) => roughlySameHtml(html, prevExtras[i] || ""));
    const sameGap =
      roughlySameHtml(gapHtml, current.gapHtml || "") &&
      extraGapHtml.length === (current.extraGapHtml || []).length &&
      extraGapHtml.every((html, i) => roughlySameHtml(html, current.extraGapHtml?.[i] || ""));
    const sameTail =
      roughlySameHtml(tailHtml, current.tailHtml || "") &&
      extraTailHtml.length === (current.extraTailHtml || []).length &&
      extraTailHtml.every((html, i) => roughlySameHtml(html, current.extraTailHtml?.[i] || ""));
    if (sameBody && sameExtras && sameGap && sameTail) return;
    if (reflowingRef.current) skipHistoryRef.current = true;
    onChangeRef.current({ bodyHtml, extraPagesHtml, gapHtml, extraGapHtml, tailHtml, extraTailHtml });
    skipHistoryRef.current = false;
  }, []);

  const setItemPageRows = useCallback((next: number[]) => {
    if (sameRowSplits(itemPageRowsRef.current, next)) return;
    itemPageRowsRef.current = next;
    setItemPageRowsState(next);
  }, []);

  const addPage = useCallback(() => {
    const extras = [...(draftRef.current.extraPagesHtml || [])];
    extras.push("<p></p>");
    userExtraCountRef.current = extras.length;
    addingPageRef.current = true;
    persistPagesFromDom(extras);
  }, [persistPagesFromDom]);

  const removeExtraPage = useCallback((index: number) => {
    const extras = [...(draftRef.current.extraPagesHtml || [])];
    extras.splice(index, 1);
    extraBodyRefs.current.splice(index, 1);
    extraPageRefs.current.splice(index, 1);
    extraGapRefs.current.splice(index, 1);
    extraTailRefs.current.splice(index, 1);
    extraPageIdsRef.current.splice(index, 1);
    userExtraCountRef.current = Math.min(userExtraCountRef.current, extras.length);
    onChangeRef.current({ extraPagesHtml: extras });
  }, []);

  const collectPages = useCallback(() => {
    const extraCount = draftRef.current.extraPagesHtml?.length || 0;
    const pages = [pageRef.current, ...extraPageRefs.current.slice(0, extraCount)].filter(Boolean) as HTMLElement[];
    const bodies = [bodyRef.current, ...extraBodyRefs.current.slice(0, extraCount)].filter(Boolean) as HTMLElement[];
    return { pages, bodies };
  }, []);

  const reflowPages = useCallback(() => {
    if (reflowingRef.current) return;
    const { pages, bodies } = collectPages();
    if (pages.length === 0 || bodies.length === 0 || pages.length !== bodies.length) return;
    reflowingRef.current = true;
    try {
      const totalRows = Math.max((draftRef.current.lineItems || []).length, 1);
      const bodyResult = pushOverflowForward(pages, bodies);
      if (bodyResult === "need-page") {
        addingPageRef.current = true;
        const extras = (draftRef.current.extraPagesHtml || []).map(
          (html, i) => extraBodyRefs.current[i]?.innerHTML ?? html ?? ""
        );
        extras.push("<p></p>");
        persistPagesFromDom(extras);
        return;
      }
      pullUnderflowBack(pages, bodies);
      for (let i = 1; i < bodies.length; i++) {
        bodies[i].classList.toggle("is-placeholder", !bodyHasLayoutContent(bodies[i]));
      }

      const rawSplits: number[] = [];
      let remaining = totalRows;
      let needExtra = false;
      for (let p = 0; p < pages.length && remaining > 0; p++) {
        const keep = rowsFittingBelowBody(pages[p], bodies[p], remaining);
        rawSplits.push(keep);
        remaining -= keep;
        if (remaining > 0 && p === pages.length - 1) needExtra = true;
      }
      if (remaining > 0) {
        rawSplits.push(remaining);
        needExtra = true;
        remaining = 0;
      }
      const nextSplits = normalizeRowSplits(rawSplits, totalRows);
      const splitsStable = sameRowSplits(itemPageRowsRef.current, nextSplits);
      setItemPageRows(nextSplits);
      if (!splitsStable) pendingReflowRef.current = true;

      const extrasNow = (draftRef.current.extraPagesHtml || []).map(
        (html, i) => extraBodyRefs.current[i]?.innerHTML ?? html ?? ""
      );
      let extrasNeeded = Math.max(0, nextSplits.length - 1);
      extrasNow.forEach((html, i) => {
        if (bodyHasLayoutContent(bodies[i + 1]) || !extraBodyIsPlaceholderHtml(html)) {
          extrasNeeded = Math.max(extrasNeeded, i + 1);
        }
      });
      extrasNeeded = Math.max(extrasNeeded, userExtraCountRef.current);
      if (needExtra) extrasNeeded = Math.max(extrasNeeded, extrasNow.length + 1, 1);
      if (addingPageRef.current) extrasNeeded = Math.max(extrasNeeded, extrasNow.length);
      extrasNeeded = Math.min(extrasNeeded, 20);
      if (extrasNow.length < extrasNeeded) {
        extraDropStableRef.current = 0;
        addingPageRef.current = true;
        persistPagesFromDom([...extrasNow, "<p></p>"]);
        return;
      }
      if (extrasNow.length > extrasNeeded && splitsStable) {
        extraDropStableRef.current += 1;
        if (extraDropStableRef.current < 2) return;
        extraPageIdsRef.current.length = extrasNeeded;
        userExtraCountRef.current = Math.min(userExtraCountRef.current, extrasNeeded);
        extraDropStableRef.current = 0;
        persistPagesFromDom(extrasNow.slice(0, extrasNeeded));
        return;
      }
      extraDropStableRef.current = 0;
      persistPagesFromDom();
    } finally {
      window.requestAnimationFrame(() => {
        reflowingRef.current = false;
        if (pendingReflowRef.current) {
          pendingReflowRef.current = false;
          reflowPages();
        }
      });
    }
  }, [collectPages, persistPagesFromDom, setItemPageRows]);

  const scheduleReflow = useCallback(() => {
    window.requestAnimationFrame(() => reflowPages());
  }, [reflowPages]);

  const applySnapshotToDom = (snap: QuotationDraft) => {
    const fill = (el: HTMLElement | null, html: string) => {
      if (!el) return;
      setEditableContent(el, html);
      el.dataset.hydrated = "1";
    };
    fill(bodyRef.current, snap.bodyHtml || "");
    fill(gapRef.current, snap.gapHtml || "<p><br></p>");
    fill(tailRef.current, snap.tailHtml || "<p><br></p>");
    fill(nameRef.current, snap.letterhead?.companyName || "");
    fill(addressRef.current, snap.letterhead?.address || "");
    fill(panRef.current, snap.letterhead?.pan || "");
    fill(phoneRef.current, snap.letterhead?.phone || "");
    fill(recipientRef.current, snap.recipientName || "");
    fill(subjectRef.current, snap.subject || "");
    (snap.extraPagesHtml || []).forEach((html, i) => fill(extraBodyRefs.current[i], html || "<p></p>"));
    (snap.extraGapHtml || []).forEach((html, i) => fill(extraGapRefs.current[i], html || "<p><br></p>"));
    (snap.extraTailHtml || []).forEach((html, i) => fill(extraTailRefs.current[i], html || "<p><br></p>"));
  };

  const undoLetter = () => {
    const prev = historyRef.current.past.pop();
    if (!prev) return;
    historyRef.current.future.push(JSON.parse(JSON.stringify(draftRef.current)) as QuotationDraft);
    applyingUndoRef.current = true;
    skipHistoryRef.current = true;
    pushParentRef.current(prev);
    window.requestAnimationFrame(() => {
      applySnapshotToDom(prev);
      applyingUndoRef.current = false;
      skipHistoryRef.current = false;
      setHistoryTick((n) => n + 1);
      scheduleReflow();
    });
  };

  const redoLetter = () => {
    const next = historyRef.current.future.pop();
    if (!next) return;
    historyRef.current.past.push(JSON.parse(JSON.stringify(draftRef.current)) as QuotationDraft);
    applyingUndoRef.current = true;
    skipHistoryRef.current = true;
    pushParentRef.current(next);
    window.requestAnimationFrame(() => {
      applySnapshotToDom(next);
      applyingUndoRef.current = false;
      skipHistoryRef.current = false;
      setHistoryTick((n) => n + 1);
      scheduleReflow();
    });
  };

  const undoLetterRef = useRef(undoLetter);
  const redoLetterRef = useRef(redoLetter);
  undoLetterRef.current = undoLetter;
  redoLetterRef.current = redoLetter;

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undoLetterRef.current();
      } else if (key === "y" || (key === "z" && e.shiftKey)) {
        e.preventDefault();
        redoLetterRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const prepareLetterTyping = useCallback(() => {
    tableSelRef.current = [];
    try {
      document.execCommand("defaultParagraphSeparator", false, "p");
    } catch {
      /* ignore */
    }
  }, []);

  const pageEl = (pageIndex: number) =>
    pageIndex <= 0 ? pageRef.current : extraPageRefs.current[pageIndex - 1];
  const bodyEl = (pageIndex: number) =>
    pageIndex <= 0 ? bodyRef.current : extraBodyRefs.current[pageIndex - 1];
  const gapEl = (pageIndex: number) =>
    pageIndex <= 0 ? gapRef.current : extraGapRefs.current[pageIndex - 1];
  const tailEl = (pageIndex: number) =>
    pageIndex <= 0 ? tailRef.current : extraTailRefs.current[pageIndex - 1];

  const placeCaretAtEnd = (el: HTMLElement) => {
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  };

  const placeCaretFromPoint = (body: HTMLElement, clientX: number, clientY: number) => {
    const doc = document as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    };
    let range: Range | null = null;
    if (typeof doc.caretRangeFromPoint === "function") range = doc.caretRangeFromPoint(clientX, clientY);
    else if (typeof doc.caretPositionFromPoint === "function") {
      const pos = doc.caretPositionFromPoint(clientX, clientY);
      if (pos) {
        range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.collapse(true);
      }
    }
    if (!range || !body.contains(range.commonAncestorContainer)) return false;
    body.focus();
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    return true;
  };

  const rememberInsertPoint = (page: HTMLElement, pageIndex: number, clientX: number, clientY: number) => {
    const box = page.getBoundingClientRect();
    lastInsertPosRef.current = {
      pageIndex,
      x: Math.max(8, Math.min(box.width - 56, clientX - box.left)),
      y: Math.max(8, Math.min(box.height - 40, clientY - box.top)),
    };
  };

  const fillEditableToClientY = (el: HTMLElement, page: HTMLElement | null, clientX: number, clientY: number) => {
    prepareLetterTyping();
    const limit = page ? pageContentBottom(page) - 8 : clientY;
    const target = Math.min(clientY, limit);
    if (!el.querySelector("p,div,li")) {
      const seed = document.createElement("p");
      seed.appendChild(document.createElement("br"));
      el.appendChild(seed);
    }
    let guard = 0;
    while (guard++ < 80) {
      const last = (el.lastElementChild as HTMLElement) || el;
      const bottom = last.getBoundingClientRect().bottom;
      if (bottom >= target - 2 || bottom >= limit) break;
      const p = document.createElement("p");
      p.appendChild(document.createElement("br"));
      el.appendChild(p);
    }
    if (!placeCaretFromPoint(el, clientX, clientY)) placeCaretAtEnd(el);
  };

  const onFlowPadMouseDown = (e: ReactMouseEvent<HTMLElement>, pageIndex: number) => {
    e.stopPropagation();
    const page = pageEl(pageIndex);
    if (page) rememberInsertPoint(page, pageIndex, e.clientX, e.clientY);
    if (picDraggingRef.current || e.button !== 0) return;
    const el = e.currentTarget as HTMLElement;
    const last = (el.lastElementChild as HTMLElement) || el;
    if (e.clientY <= last.getBoundingClientRect().bottom + 4) return;
    e.preventDefault();
    fillEditableToClientY(el, page, e.clientX, e.clientY);
    persistPagesFromDom();
  };

  const onPageBlankMouseDown = (e: ReactMouseEvent<HTMLElement>, pageIndex: number) => {
    const page = pageEl(pageIndex);
    if (page) rememberInsertPoint(page, pageIndex, e.clientX, e.clientY);
    if (picDraggingRef.current) return;
    const t = e.target as HTMLElement;
    if (
      t.closest(
        ".quotation-letter-page-image, .quotation-letter-items, .quotation-letter-items-table, .quotation-letter-items-add, .quotation-letter-items-combobox-popover, .quotation-letter-head, .quotation-letter-date, .quotation-letter-lang-trigger, .quotation-letter-body-resize, button, input, textarea, select, [role='combobox'], [role='dialog'], [cmdk-root], [data-radix-popper-content-wrapper], [contenteditable='true']"
      )
    ) {
      return;
    }
    e.preventDefault();
    const items = t.closest(".quotation-letter-items");
    const table = page?.querySelector(".quotation-letter-items") as HTMLElement | null;
    const belowTable = table ? e.clientY > table.getBoundingClientRect().bottom : true;
    const target = belowTable && !items ? tailEl(pageIndex) : gapEl(pageIndex) || tailEl(pageIndex);
    if (!target) return;
    fillEditableToClientY(target, page, e.clientX, e.clientY);
    persistPagesFromDom();
    if (target === gapEl(pageIndex)) scheduleReflow();
  };

  const onLetterBodyKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "Enter" || e.shiftKey) return;
      prepareLetterTyping();
      window.requestAnimationFrame(() => reflowPages());
    },
    [prepareLetterTyping, reflowPages]
  );

  const runOnSelection = useCallback(
    (fn: () => void) => {
      restoreSelection(savedSelRef.current) || restoreSelection(captureSelection(pagesRootRef.current));
      fn();
      preserveSelection();
      syncFromDom();
    },
    [preserveSelection, syncFromDom]
  );

  useEffect(() => {
    const name = nameRef.current;
    const address = addressRef.current;
    if (!name && !address) return;
    if (name) {
      name.style.fontSize = `${draftRef.current.letterhead.companyNameFontSize || QUOTATION_DEFAULT_COMPANY_NAME_FONT_SIZE}px`;
      stripInlineFontSize(name);
    }
    if (address) {
      address.style.fontSize = `${draftRef.current.letterhead.addressFontSize || QUOTATION_DEFAULT_ADDRESS_FONT_SIZE}px`;
      stripInlineFontSize(address);
    }
    const current = draftRef.current;
    onChangeRef.current({
      letterhead: {
        ...current.letterhead,
        companyName: name?.innerHTML ?? current.letterhead.companyName,
        address: address?.innerHTML ?? current.letterhead.address,
      },
    });
  }, [draft.id]);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    if (el.dataset.hydrated !== "1") {
      setEditableContent(el, draft.bodyHtml);
      el.dataset.hydrated = "1";
    }
  }, [draft.id, draft.bodyHtml]);

  useEffect(() => {
    const root = pagesRootRef.current;
    if (!root) return;
    const onSel = () => {
      const saved = captureSelection(root);
      if (!saved) return;
      savedSelRef.current = saved;
      if (
        saved.editable.classList.contains("quotation-letter-items-table") ||
        saved.editable.closest(".quotation-letter-items-table")
      ) {
        tableSelRef.current = quotationTableCellTargets(saved.range);
      } else {
        tableSelRef.current = [];
      }
      if (isAmountWordsField(saved.editable)) {
        const d = draftRef.current;
        setFontSize(nearestFontSize(d.amountWordsFontSize || QUOTATION_DEFAULT_AMOUNT_WORDS_FONT_SIZE));
        setTextColor(d.amountWordsColor || QUOTATION_DEFAULT_AMOUNT_WORDS_COLOR);
        return;
      }
      const field = isLetterheadSizeField(saved.editable);
      if (field === "name" || field === "address") {
        const fromStyle = parseFloat(saved.editable.style.fontSize || "");
        const stored =
          field === "name"
            ? draftRef.current.letterhead.companyNameFontSize || QUOTATION_DEFAULT_COMPANY_NAME_FONT_SIZE
            : draftRef.current.letterhead.addressFontSize || QUOTATION_DEFAULT_ADDRESS_FONT_SIZE;
        setFontSize(nearestFontSize(Number.isFinite(fromStyle) && fromStyle > 0 ? fromStyle : stored));
      } else {
        const node = saved.range.startContainer;
        const el = node instanceof HTMLElement ? node : node.parentElement;
        if (el) {
          const px = parseFloat(window.getComputedStyle(el).fontSize);
          if (Number.isFinite(px) && px > 0) setFontSize(nearestFontSize(px));
        }
      }
      const colorNode = saved.range.startContainer;
      const colorEl = colorNode instanceof HTMLElement ? colorNode : colorNode.parentElement;
      if (colorEl) {
        const cs = window.getComputedStyle(colorEl);
        setTextColor(rgbToHex(cs.color));
        setHighlightColor(rgbToHighlightHex(cs.backgroundColor));
      }
    };
    document.addEventListener("selectionchange", onSel);
    const onTableDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const cell = t.closest(
        ".quotation-letter-items-table th[data-q-col], .quotation-letter-items-table td[data-q-col], .quotation-letter-items-table [data-q-field='amount-words'] td"
      ) as HTMLElement | null;
      if (!cell || cell.classList.contains("quotation-letter-items-remove-cell")) return;
      const table = cell.closest(".quotation-letter-items-table") as HTMLElement | null;
      if (!table) return;
      const range = document.createRange();
      try {
        range.selectNodeContents(cell);
      } catch {
        return;
      }
      savedSelRef.current = { range, editable: table };
      tableSelRef.current = quotationTableCellTargets(range);
      const styleEl = cell;
      const px = parseFloat(window.getComputedStyle(styleEl).fontSize);
      if (Number.isFinite(px) && px > 0) setFontSize(nearestFontSize(px));
      const cs = window.getComputedStyle(styleEl);
      setTextColor(rgbToHex(cs.color));
      setHighlightColor(rgbToHighlightHex(cs.backgroundColor));
    };
    root.addEventListener("mousedown", onTableDown);
    return () => {
      document.removeEventListener("selectionchange", onSel);
      root.removeEventListener("mousedown", onTableDown);
    };
  }, []);

  useEffect(() => {
    const root = pagesRootRef.current;
    if (!root) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest(".quotation-letter-page-image")) return;
      setSelectedPicId((cur) => (cur ? null : cur));
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [extraPagesHtml.length]);

  useLayoutEffect(() => {
    reflowPages();
    addingPageRef.current = false;
  }, [extraPagesHtml.length, (draft.lineItems || []).length, pageImages.length]);

  useEffect(() => {
    const pages = [pageRef.current, bodyRef.current, ...extraPageRefs.current, ...extraBodyRefs.current].filter(
      Boolean
    ) as HTMLElement[];
    if (pages.length === 0) return;
    const ro = new ResizeObserver(() => {
      if (reflowingRef.current) return;
      scheduleReflow();
    });
    pages.forEach((node) => ro.observe(node));
    scheduleReflow();
    return () => ro.disconnect();
  }, [scheduleReflow, extraPagesHtml.length]);

  const patchPageImage = useCallback((id: string, patch: Partial<QuotationPageImage>) => {
    const next = (draftRef.current.pageImages || []).map((row) => (row.id === id ? { ...row, ...patch } : row));
    onChangeRef.current({ pageImages: next });
  }, []);

  const removePageImage = useCallback(
    (id: string) => {
      onChangeRef.current({ pageImages: (draftRef.current.pageImages || []).filter((row) => row.id !== id) });
      setSelectedPicId((cur) => (cur === id ? null : cur));
      scheduleReflow();
    },
    [scheduleReflow]
  );

  const addPageImage = useCallback(
    (src: string) => {
      const flows: { pageIndex: number; el: HTMLElement | null }[] = [
        { pageIndex: 0, el: bodyRef.current },
        { pageIndex: 0, el: gapRef.current },
        { pageIndex: 0, el: tailRef.current },
        ...extraBodyRefs.current.map((el, i) => ({ pageIndex: i + 1, el })),
        ...extraGapRefs.current.map((el, i) => ({ pageIndex: i + 1, el })),
        ...extraTailRefs.current.map((el, i) => ({ pageIndex: i + 1, el })),
      ];
      const active = flows.find((row) => row.el && row.el.contains(document.activeElement));
      const pageIndex = active?.pageIndex ?? lastInsertPosRef.current?.pageIndex ?? 0;
      const page = pageEl(pageIndex);
      const body = bodyEl(pageIndex);
      const pageBox = page?.getBoundingClientRect();
      const typingInPage = Boolean(active?.el);
      let x = 32;
      let y = 160;
      const sel = window.getSelection();
      const caretRect =
        typingInPage && sel && sel.rangeCount > 0 && page && page.contains(sel.getRangeAt(0).commonAncestorContainer)
          ? sel.getRangeAt(0).getBoundingClientRect()
          : null;
      if (caretRect && pageBox && (caretRect.width || caretRect.height || caretRect.top)) {
        x = Math.max(8, caretRect.left - pageBox.left);
        y = Math.max(8, caretRect.top - pageBox.top);
      } else if (lastInsertPosRef.current && lastInsertPosRef.current.pageIndex === pageIndex) {
        x = lastInsertPosRef.current.x;
        y = lastInsertPosRef.current.y;
      } else if (pageBox) {
        const bodyBox = body && !body.classList.contains("is-placeholder") ? body.getBoundingClientRect() : null;
        y = Math.max(24, (bodyBox ? bodyBox.bottom - pageBox.top : 120) + 8);
      }
      if (pageBox) {
        x = Math.max(8, Math.min(pageBox.width - 56, x));
        y = Math.max(8, Math.min(pageBox.height - 40, y));
      }
      const next: QuotationPageImage = {
        id: clientRandomUUID(),
        pageIndex,
        src,
        x,
        y,
        width: 180,
        height: 120,
      };
      const probe = new Image();
      probe.onload = () => {
        const ratio = probe.naturalHeight / Math.max(1, probe.naturalWidth);
        const height = Math.max(40, Math.round(180 * ratio));
        onChangeRef.current({
          pageImages: [...(draftRef.current.pageImages || []).filter((row) => row.id !== next.id), { ...next, height }],
        });
        scheduleReflow();
      };
      probe.src = src;
      onChangeRef.current({ pageImages: [...(draftRef.current.pageImages || []), next] });
      setSelectedPicId(next.id);
      scheduleReflow();
    },
    [scheduleReflow]
  );

  const startBodyResize = useCallback(
    (e: MouseEvent, which: "main" | number) => {
      e.preventDefault();
      e.stopPropagation();
      const el = which === "main" ? bodyRef.current : extraBodyRefs.current[which];
      const page = which === "main" ? pageRef.current : extraPageRefs.current[which];
      if (!el || !page) return;
      const startY = e.clientY;
      const startH = el.offsetHeight;
      const move = (ev: globalThis.MouseEvent) => {
        const maxH = Math.max(56, pageContentBottom(page) - el.getBoundingClientRect().top);
        const next = Math.max(56, Math.min(maxH, startH + (ev.clientY - startY)));
        el.style.height = "auto";
        el.style.minHeight = `${next}px`;
      };
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        const h = el.offsetHeight;
        if (which === "main") onChangeRef.current({ bodyHeightPx: h });
        else {
          const heights = [...(draftRef.current.extraBodyHeights || [])];
          heights[which] = h;
          onChangeRef.current({ extraBodyHeights: heights });
        }
        scheduleReflow();
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    },
    [scheduleReflow]
  );

  const onInsertImage = () => {
    fileRef.current?.click();
  };

  const onFile = async (file: File | null) => {
    if (!file || !file.type.startsWith("image/")) return;
    let src = "";
    try {
      const { compressQuotationPageImageDataUrl } = await import("../quotationPageImageCompress");
      src = await compressQuotationPageImageDataUrl(file);
    } catch {
      src = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
    }
    if (src) addPageImage(src);
  };

  const totalItemRows = Math.max((draft.lineItems || []).length, 1);
  const itemSplits = itemPageRows.length > 0 ? itemPageRows : [totalItemRows];
  const page1ItemCount = Math.max(0, Math.min(itemSplits[0] ?? totalItemRows, totalItemRows));
  const patchItems = (lineItems: typeof draft.lineItems) => {
    const prevLen = (draft.lineItems || []).length;
    onChange({
      lineItems,
      amount: quotationGrandTotal(lineItems),
    });
    if (lineItems.length !== prevLen) {
      scheduleReflow();
    }
  };

  const activateAmountWords = () => {
    const row = pagesRootRef.current?.querySelector('[data-q-field="amount-words"]') as HTMLElement | null;
    if (!row) return;
    const native = captureSelection(pagesRootRef.current);
    if (native && isAmountWordsField(native.editable)) {
      savedSelRef.current = native;
    } else {
      const range = document.createRange();
      try {
        range.selectNodeContents(row);
      } catch {
        /* ignore */
      }
      savedSelRef.current = { range, editable: row };
    }
    tableSelRef.current = [{ kind: "words" }];
    const d = draftRef.current;
    setFontSize(nearestFontSize(d.amountWordsFontSize || QUOTATION_DEFAULT_AMOUNT_WORDS_FONT_SIZE));
    setTextColor(d.amountWordsColor || QUOTATION_DEFAULT_AMOUNT_WORDS_COLOR);
  };

  const applyItemsTableStyle = (patch: QuotationTableTextStyle): boolean => {
    let targets = tableSelRef.current;
    if (!targets.length) {
      const saved = savedSelRef.current || captureSelection(pagesRootRef.current);
      if (saved) targets = quotationTableCellTargets(saved.range);
    }
    if (!targets.length) return false;
    const d = draftRef.current;
    const applied = applyTableStyleToDraft(d.lineItems || [], d.tableHeaderStyles, targets, patch);
    if (!applied.touchedTable && !applied.touchedWords) return false;
    const next: Partial<QuotationDraft> = {};
    if (applied.touchedTable) {
      next.tableHeaderStyles = applied.tableHeaderStyles;
      next.lineItems = applied.lineItems;
    }
    if (applied.touchedWords) {
      if (applied.amountWordsFontSize) next.amountWordsFontSize = applied.amountWordsFontSize;
      if (applied.amountWordsColor) next.amountWordsColor = applied.amountWordsColor;
    }
    onChange(next);
    return true;
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <QuotationWordToolbar
        fontSize={fontSize}
        textColor={textColor}
        highlightColor={highlightColor}
        pageFlow={pageFlow}
        canUndo={historyTick >= 0 && historyRef.current.past.length > 0}
        canRedo={historyTick >= 0 && historyRef.current.future.length > 0}
        onUndo={undoLetter}
        onRedo={redoLetter}
        onPreserveSelection={preserveSelection}
        onFontSize={(px) => {
          setFontSize(px);
          if (applyItemsTableStyle({ fontSize: px })) return;
          const target = savedSelRef.current?.editable || selectionEditable();
          if (isAmountWordsField(target)) {
            onChange({ amountWordsFontSize: px });
            return;
          }
          runOnSelection(() => applyFontSizePx(px, target));
        }}
        onTextColor={(color) => {
          setTextColor(color);
          if (applyItemsTableStyle({ color })) return;
          const target = savedSelRef.current?.editable || selectionEditable();
          if (isAmountWordsField(target)) {
            onChange({ amountWordsColor: color });
            return;
          }
          runOnSelection(() => applyFontColor(color, target));
        }}
        onHighlightColor={(color) => {
          setHighlightColor(color);
          if (applyItemsTableStyle({ backgroundColor: color || "" })) return;
          const target = savedSelRef.current?.editable || selectionEditable();
          if (isAmountWordsField(target)) return;
          runOnSelection(() => applyHighlightColor(color, target));
        }}
        onBold={() => {
          const target = savedSelRef.current?.editable || selectionEditable();
          if (isAmountWordsField(target)) return;
          runOnSelection(() => exec("bold"));
        }}
        onItalic={() => {
          const target = savedSelRef.current?.editable || selectionEditable();
          if (isAmountWordsField(target)) return;
          runOnSelection(() => exec("italic"));
        }}
        onNormal={() => {
          const target = savedSelRef.current?.editable || selectionEditable();
          if (isAmountWordsField(target)) return;
          runOnSelection(() => exec("removeFormat"));
        }}
        onInsertImage={onInsertImage}
        onPageFlow={(flow) => onChange({ pageFlow: flow })}
        sideTypingPanelOpen={sideTypingOpen}
        onToggleSideTypingPanel={() => setSideTypingOpen((open) => !open)}
        onOpenSideTypingPanel={(linkId) => {
          setSideTypingLinkId(linkId);
          setSideTypingOpen(true);
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0] || null;
          e.target.value = "";
          void onFile(file);
        }}
      />
      <div className="flex min-h-0 flex-1 flex-row">
        <div className="quotation-letter-shell min-h-0 min-w-0 flex-1 overflow-auto">
        <div
          ref={pagesRootRef}
          className={cn("quotation-letter-print-root", pageFlow === "right" && "is-right")}
        >
          <div className={cn("quotation-letter-page-stack", extraPagesHtml.length === 0 && "has-add-page")}>
          <article
            ref={pageRef}
            className="quotation-letter-page"
            onMouseDown={(e) => onPageBlankMouseDown(e, 0)}
          >
            <header className="quotation-letter-head">
              <div className="quotation-letter-meta">
                <div className="quotation-letter-meta-left">
                  <LetterPrefixedLine
                    lineRef={panRef}
                    field="pan"
                    className="quotation-letter-meta-value"
                    value={draft.letterhead.pan}
                    onSync={syncFromDom}
                    menu={
                      <QuotationLetterLangMenu
                        value={panLabelOpt.id}
                        options={PAN_LABEL_OPTIONS.map((row) => ({
                          id: row.id,
                          label: row.label,
                          name: row.name,
                          isDeva: row.lang === "hi" || row.lang === "ne",
                        }))}
                        onChange={(id) => {
                          const opt = PAN_LABEL_OPTIONS.find((row) => row.id === id);
                          if (!opt) return;
                          onChange({
                            panLabelLang: opt.lang,
                            panLabelKind: opt.kind,
                            letterhead: { ...draft.letterhead, panLabel: opt.label },
                          });
                        }}
                        className="quotation-letter-meta-label"
                      />
                    }
                  />
                </div>
                <div className="quotation-letter-meta-right">
                  <LetterPrefixedLine
                    lineRef={phoneRef}
                    field="phone"
                    className="quotation-letter-meta-value"
                    value={draft.letterhead.phone}
                    onSync={syncFromDom}
                    menu={
                      <QuotationLetterLangMenu
                        value={phoneLabelOpt.id}
                        options={phoneLabelOptionsForCountry(companyCountry).map((row) => ({
                          id: row.id,
                          label: row.label,
                          name: row.name,
                          isDeva: row.lang !== "en",
                        }))}
                        onChange={(id) => {
                          const opt = PHONE_LABEL_OPTIONS.find((row) => row.id === id);
                          if (!opt) return;
                          onChange({
                            phoneLabelLang: opt.lang,
                            phoneLabelKind: opt.kind,
                            letterhead: { ...draft.letterhead, phoneLabel: opt.label },
                          });
                        }}
                        className="quotation-letter-meta-label"
                      />
                    }
                  />
                </div>
              </div>
              {draft.letterhead.logoUrl ? (
                <img className="quotation-letter-logo" src={draft.letterhead.logoUrl} alt="" />
              ) : null}
              <LetterEditable
                fieldRef={nameRef}
                field="companyName"
                className="quotation-letter-field quotation-letter-editable quotation-letter-name"
                style={{ fontSize: `${nameFontSize}px` }}
                value={draft.letterhead.companyName}
                placeholder="Company name"
                spellCheck={false}
                onSync={syncFromDom}
              />
              <LetterEditable
                fieldRef={addressRef}
                field="address"
                className="quotation-letter-field quotation-letter-editable quotation-letter-address"
                style={{ fontSize: `${addressFontSize}px` }}
                value={draft.letterhead.address}
                placeholder="Address"
                spellCheck={false}
                onSync={syncFromDom}
              />
            </header>
            <div className="quotation-letter-date">
              <span className="quotation-letter-qtno quotation-letter-prefixed quotation-letter-editable" contentEditable suppressContentEditableWarning>
                <span className="quotation-letter-prefixed-label" contentEditable={false}>
                  <QuotationLetterLangMenu
                    value={numberLabelLang}
                    labels={QT_NO_LABELS}
                    onChange={(lang) => onChange({ numberLabelLang: asQuotationLetterLang(lang) })}
                  />
                </span>{" "}
                <span className="quotation-letter-prefixed-value">{draft.quotationNumber || "QT-00-00-001"}</span>
              </span>
              <span className="quotation-letter-date-print">
                <QuotationLetterLangMenu
                  value={dateLabelLang}
                  labels={DATE_LABELS}
                  onChange={(lang) => onChange({ dateLabelLang: asQuotationLetterLang(lang) })}
                />{" "}
                {dateSystem === "AD" ? (
                  <LetterAdDateText value={dateValue} label={formatDate(dateValue)} onChange={applyLetterDate} />
                ) : dateSystem === "Both" ? (
                  <>
                    <LetterBsDateText value={dateValue} label={formatDateBS(dateValue)} onChange={applyLetterDate} />
                    {" ("}
                    <LetterAdDateText value={dateValue} label={formatDate(dateValue)} onChange={applyLetterDate} />
                    {")"}
                  </>
                ) : (
                  <LetterBsDateText value={dateValue} label={formatDateBS(dateValue)} onChange={applyLetterDate} />
                )}
              </span>
            </div>
            <LetterEditable
              fieldRef={recipientRef}
              field="recipientName"
              className="quotation-letter-field quotation-letter-editable quotation-letter-to font-semibold"
              value={draft.recipientName}
              placeholder="Recipient / account name"
              onSync={syncFromDom}
            />
            <LetterPrefixedLine
              lineRef={subjectRef}
              field="subject"
              className="quotation-letter-subject"
              value={draft.subject}
              onSync={syncFromDom}
              menu={
                <QuotationLetterLangMenu
                  className="quotation-letter-subject-label"
                  value={subjectLabelLang}
                  labels={SUBJECT_LABELS}
                  onChange={(lang) => onChange({ subjectLabelLang: asQuotationLetterLang(lang) })}
                />
              }
            />
            <div className="quotation-letter-body-shell">
              <div
                ref={bodyRef}
                className="quotation-letter-body quotation-letter-editable"
                data-q-field="body"
                style={draft.bodyHeightPx ? { minHeight: draft.bodyHeightPx } : undefined}
                contentEditable
                suppressContentEditableWarning
                onFocus={prepareLetterTyping}
                onKeyDown={onLetterBodyKeyDown}
                onInput={() => {
                  syncFromDom();
                  scheduleReflow();
                }}
                onBlur={syncFromDom}
                onPaste={(e) => {
                  const item = [...(e.clipboardData?.items || [])].find((it) => it.type.startsWith("image/"));
                  if (!item) return;
                  e.preventDefault();
                  const file = item.getAsFile();
                  void onFile(file);
                }}
              />
              <button
                type="button"
                className="quotation-letter-body-resize quotation-letter-ui-only"
                title="Resize typing box"
                onMouseDown={(e) => startBodyResize(e.nativeEvent, "main")}
              />
            </div>
            <div
              ref={(node) => {
                gapRef.current = node;
                if (node && node.dataset.hydrated !== "1") {
                  setEditableContent(node, draft.gapHtml || "<p><br></p>");
                  node.dataset.hydrated = "1";
                }
              }}
              className="quotation-letter-gap quotation-letter-pictures-slot quotation-letter-editable"
              data-q-field="gap"
              contentEditable
              suppressContentEditableWarning
              onFocus={prepareLetterTyping}
              onMouseDown={(e) => onFlowPadMouseDown(e, 0)}
              onKeyDown={onLetterBodyKeyDown}
              onInput={() => {
                syncFromDom();
                scheduleReflow();
              }}
              onBlur={syncFromDom}
            />
            {page1ItemCount > 0 ? (
              <QuotationItemsTable
                lineItems={Array.isArray(draft.lineItems) ? draft.lineItems : []}
                rowStart={0}
                rowCount={page1ItemCount}
                showFooter={page1ItemCount >= totalItemRows}
                showAdd={page1ItemCount >= totalItemRows}
                amountWordsLang={amountWordsLang}
                onAmountWordsLangChange={(lang) => onChange({ amountWordsLang: lang })}
                amountWordsFontSize={amountWordsFontSize}
                amountWordsColor={amountWordsColor}
                headerStyles={draft.tableHeaderStyles}
                onAmountWordsActivate={activateAmountWords}
                onChange={patchItems}
              />
            ) : null}
            <div
              ref={(node) => {
                tailRef.current = node;
                if (node && node.dataset.hydrated !== "1") {
                  setEditableContent(node, draft.tailHtml || "<p><br></p>");
                  node.dataset.hydrated = "1";
                }
              }}
              className="quotation-letter-tail quotation-letter-editable"
              data-q-field="tail"
              contentEditable
              suppressContentEditableWarning
              onFocus={prepareLetterTyping}
              onMouseDown={(e) => onFlowPadMouseDown(e, 0)}
              onKeyDown={onLetterBodyKeyDown}
              onInput={() => syncFromDom()}
              onBlur={syncFromDom}
            />
            <QuotationPagePictures
              images={pageImages.filter((img) => img.pageIndex === 0)}
              selectedId={selectedPicId}
              onSelect={setSelectedPicId}
              onChange={patchPageImage}
              onRemove={removePageImage}
              onDragStart={() => {
                picDraggingRef.current = true;
              }}
              onDragEnd={() => {
                window.setTimeout(() => {
                  picDraggingRef.current = false;
                }, 180);
              }}
            />
          </article>
          {extraPagesHtml.length === 0 ? <QuotationAddPageBar onAddPage={addPage} /> : null}
          </div>
          {extraPagesHtml.map((html, index) => {
            const extraRowStart = itemSplits.slice(0, index + 1).reduce((sum, n) => sum + n, 0);
            const extraRowCount = Math.max(0, itemSplits[index + 1] || 0);
            const extraEndsTable = extraRowStart + extraRowCount >= totalItemRows;
            const extraHeight = (draft.extraBodyHeights || [])[index];
            const extraPics = pageImages.filter((img) => img.pageIndex === index + 1);
            const isLastExtra = index === extraPagesHtml.length - 1;
            return (
            <div
              key={extraPageIdsRef.current[index] || `extra-page-wrap-${index}`}
              className={cn("quotation-letter-page-stack", isLastExtra && "has-add-page")}
            >
            <article
              ref={(node) => {
                extraPageRefs.current[index] = node;
              }}
              className="quotation-letter-page quotation-letter-page-extra"
              onMouseDown={(e) => onPageBlankMouseDown(e, index + 1)}
            >
              <div className="quotation-letter-page-label quotation-letter-ui-only">Page {index + 2}</div>
              <div
                className={cn(
                  "quotation-letter-body-shell",
                  extraBodyIsPlaceholderHtml(html) && "is-placeholder"
                )}
              >
                <div
                  ref={(node) => {
                    extraBodyRefs.current[index] = node;
                    if (node && node.dataset.hydrated !== "1") {
                      setEditableContent(node, html);
                      node.dataset.hydrated = "1";
                    }
                  }}
                  className={cn(
                    "quotation-letter-body quotation-letter-editable",
                    extraBodyIsPlaceholderHtml(html) && "is-placeholder"
                  )}
                  data-q-field="extra-body"
                  style={extraHeight ? { minHeight: extraHeight } : undefined}
                  contentEditable
                  suppressContentEditableWarning
                  data-placeholder="Continue quotation..."
                  onFocus={prepareLetterTyping}
                  onKeyDown={onLetterBodyKeyDown}
                  onInput={() => {
                    syncFromDom();
                    scheduleReflow();
                  }}
                  onBlur={syncFromDom}
                  onPaste={(e) => {
                    const item = [...(e.clipboardData?.items || [])].find((it) => it.type.startsWith("image/"));
                    if (!item) return;
                    e.preventDefault();
                    const file = item.getAsFile();
                    void onFile(file);
                  }}
                />
                <button
                  type="button"
                  className="quotation-letter-body-resize quotation-letter-ui-only"
                  title="Resize typing box"
                  onMouseDown={(e) => startBodyResize(e.nativeEvent, index)}
                />
              </div>
              <div
                ref={(node) => {
                  extraGapRefs.current[index] = node;
                  if (node && node.dataset.hydrated !== "1") {
                    setEditableContent(node, (draft.extraGapHtml || [])[index] || "<p><br></p>");
                    node.dataset.hydrated = "1";
                  }
                }}
                className="quotation-letter-gap quotation-letter-pictures-slot quotation-letter-editable"
                data-q-field="extra-gap"
                contentEditable
                suppressContentEditableWarning
                onFocus={prepareLetterTyping}
                onMouseDown={(e) => onFlowPadMouseDown(e, index + 1)}
                onKeyDown={onLetterBodyKeyDown}
                onInput={() => {
                  syncFromDom();
                  scheduleReflow();
                }}
                onBlur={syncFromDom}
              />
              {extraRowCount > 0 ? (
                <QuotationItemsTable
                  lineItems={Array.isArray(draft.lineItems) ? draft.lineItems : []}
                  rowStart={extraRowStart}
                  rowCount={extraRowCount}
                  showTitle={false}
                  showFooter={extraEndsTable}
                  showAdd={extraEndsTable}
                  amountWordsLang={amountWordsLang}
                  onAmountWordsLangChange={(lang) => onChange({ amountWordsLang: lang })}
                  amountWordsFontSize={amountWordsFontSize}
                  amountWordsColor={amountWordsColor}
                  headerStyles={draft.tableHeaderStyles}
                  onAmountWordsActivate={activateAmountWords}
                  onChange={patchItems}
                />
              ) : null}
              <div
                ref={(node) => {
                  extraTailRefs.current[index] = node;
                  if (node && node.dataset.hydrated !== "1") {
                    setEditableContent(node, (draft.extraTailHtml || [])[index] || "<p><br></p>");
                    node.dataset.hydrated = "1";
                  }
                }}
                className="quotation-letter-tail quotation-letter-editable"
                data-q-field="extra-tail"
                contentEditable
                suppressContentEditableWarning
                onFocus={prepareLetterTyping}
                onMouseDown={(e) => onFlowPadMouseDown(e, index + 1)}
                onKeyDown={onLetterBodyKeyDown}
                onInput={() => syncFromDom()}
                onBlur={syncFromDom}
              />
              <QuotationPagePictures
                images={extraPics}
                selectedId={selectedPicId}
                onSelect={setSelectedPicId}
                onChange={patchPageImage}
                onRemove={removePageImage}
                onDragStart={() => {
                  picDraggingRef.current = true;
                }}
              onDragEnd={() => {
                window.setTimeout(() => {
                  picDraggingRef.current = false;
                }, 180);
              }}
              />
              <button
                type="button"
                className="quotation-letter-remove-page quotation-letter-ui-only"
                onClick={() => removeExtraPage(index)}
              >
                Remove page
              </button>
            </article>
            {isLastExtra ? <QuotationAddPageBar onAddPage={addPage} /> : null}
            </div>
            );
          })}
        </div>
        </div>
        {sideTypingOpen ? (
          <QuotationSideTypingPanel
            linkId={sideTypingLinkId}
            onLinkIdChange={setSideTypingLinkId}
            onClose={() => setSideTypingOpen(false)}
          />
        ) : null}
      </div>
    </div>
  );
}
