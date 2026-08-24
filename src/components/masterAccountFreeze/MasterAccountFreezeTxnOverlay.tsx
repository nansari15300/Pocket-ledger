"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { saveMasterAccountFreeze } from "@/lib/masterAccountFreeze/saveMasterAccountFreeze";
import {
  MASTER_ACCOUNT_FREEZE_BANNER_TITLE,
  MASTER_ACCOUNT_FREEZE_MESSAGE_PLACEHOLDER,
} from "@/lib/masterAccountFreeze/labels";
import type { MasterAccountFreezeCollection } from "@/lib/masterAccountFreeze/types";
import { useMasterAccountFreezeFeature } from "@/hooks/useMasterAccountFreezeFeature";
import { MasterAccountFreezeBannerTopActions } from "@/components/masterAccountFreeze/MasterAccountFreezeBannerTopActions";
import { publicAssetUrl } from "@/lib/webAppBasePath";

const FREEZE_BANNER_DOVE_SRC = publicAssetUrl("/images/master-account-freeze-dove.png");

function FreezeBannerDove({ mirrored = false }: { mirrored?: boolean }) {
  return (
    <img
      src={FREEZE_BANNER_DOVE_SRC}
      alt=""
      width={154}
      height={154}
      className={cn(
        "h-[5.4rem] w-[5.4rem] shrink-0 object-contain sm:h-[7.2rem] sm:w-[7.2rem] md:h-[8.4rem] md:w-[8.4rem]",
        "[image-rendering:-webkit-optimize-contrast]",
        mirrored && "scale-x-[-1]"
      )}
      aria-hidden
      draggable={false}
      decoding="sync"
    />
  );
}

/** Warning-style yellow banner — pale fill + bold amber border. */
const FREEZE_BANNER_SURFACE_CN =
  "rounded-[20mm] border-[3px] border-amber-500 bg-gradient-to-r from-amber-50 via-yellow-50 to-lime-50 shadow-md dark:border-amber-400 dark:from-amber-950/70 dark:via-yellow-950/50 dark:to-lime-950/40";

const FREEZE_MESSAGE_TEXT_CN =
  "text-xl font-bold italic leading-normal sm:text-2xl";

const FREEZE_MESSAGE_BOX_CN = cn(
  "box-border rounded-md border-[3px] border-amber-500 bg-amber-50/95 px-4 py-2.5 text-center text-amber-950 shadow-sm",
  "transition-[border-color,box-shadow] duration-150",
  "focus-visible:border-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/45",
  "dark:border-amber-400 dark:bg-amber-950/50 dark:text-amber-50",
  "dark:focus-visible:border-amber-300 dark:focus-visible:ring-amber-300/35"
);

const FREEZE_MESSAGE_FIELD_CN = cn(
  FREEZE_MESSAGE_BOX_CN,
  "block resize-none placeholder:text-center placeholder:text-base placeholder:font-normal placeholder:not-italic placeholder:text-amber-800/70 dark:placeholder:text-amber-200/60",
  FREEZE_MESSAGE_TEXT_CN
);

const FREEZE_MESSAGE_MIN_W_PX = 120;
const FREEZE_MESSAGE_MIN_H_PX = 52;
const FREEZE_BANNER_TEXT_MAX_RATIO = 0.7;

type MessageLayout = {
  widthPx: number;
  heightPx: number;
  wrap: boolean;
};

function measureMessageLayout(
  content: string,
  maxW: number,
  mirror: HTMLTextAreaElement
): MessageLayout {
  const sample = content || " ";

  mirror.style.overflow = "hidden";
  mirror.style.width = "auto";
  mirror.style.maxWidth = "none";
  mirror.style.whiteSpace = "nowrap";
  mirror.style.wordBreak = "normal";
  mirror.style.overflowWrap = "normal";
  mirror.value = sample;

  const nowrapNeed = mirror.scrollWidth;
  const wrap = nowrapNeed > maxW || content.includes("\n");
  const widthPx = wrap
    ? maxW
    : Math.max(FREEZE_MESSAGE_MIN_W_PX, Math.min(nowrapNeed, maxW));

  mirror.style.width = `${widthPx}px`;
  mirror.style.maxWidth = `${widthPx}px`;
  mirror.style.whiteSpace = wrap ? "pre-wrap" : "nowrap";
  mirror.style.wordBreak = wrap ? "break-word" : "normal";
  mirror.style.overflowWrap = wrap ? "anywhere" : "normal";
  mirror.value = sample;
  mirror.style.height = "0px";

  const heightPx = Math.max(
    FREEZE_MESSAGE_MIN_H_PX,
    mirror.scrollHeight
  );

  return { widthPx, heightPx, wrap };
}

/** Exact row height — width must already be set on the field. */
function measureTextareaContentHeight(el: HTMLTextAreaElement): number {
  el.style.overflow = "hidden";
  el.style.height = "0px";
  return Math.max(FREEZE_MESSAGE_MIN_H_PX, el.scrollHeight);
}

function useFreezeMessageFieldLayout(
  text: string,
  placeholder: string,
  bannerRef: React.RefObject<HTMLDivElement | null>,
  mirrorRef: React.RefObject<HTMLTextAreaElement | null>
) {
  const [bannerWidth, setBannerWidth] = React.useState(0);
  const [layout, setLayout] = React.useState<MessageLayout>({
    widthPx: FREEZE_MESSAGE_MIN_W_PX,
    heightPx: FREEZE_MESSAGE_MIN_H_PX,
    wrap: false,
  });

  React.useLayoutEffect(() => {
    const banner = bannerRef.current;
    if (!banner) return;
    const update = () => setBannerWidth(banner.offsetWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(banner);
    return () => ro.disconnect();
  }, [bannerRef]);

  React.useLayoutEffect(() => {
    const mirror = mirrorRef.current;
    if (!mirror || bannerWidth <= 0) return;

    const content = text.length > 0 ? text : placeholder;
    const maxW = Math.floor(bannerWidth * FREEZE_BANNER_TEXT_MAX_RATIO);
    setLayout(measureMessageLayout(content, maxW, mirror));
  }, [text, placeholder, bannerWidth, mirrorRef]);

  return { layout };
}

function FreezeBannerMessageMirror({
  mirrorRef,
}: {
  mirrorRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  return (
    <textarea
      ref={mirrorRef}
      readOnly
      tabIndex={-1}
      rows={1}
      aria-hidden
      className={cn(
        FREEZE_MESSAGE_FIELD_CN,
        "pointer-events-none absolute left-[-9999px] top-0 -z-10 opacity-0 box-border"
      )}
    />
  );
}

function FreezeBannerMessageField({
  fieldRef,
  layout,
  value,
  placeholder,
  readOnly,
  onChange,
  onFocus,
  onBlur,
  onPointerDown,
  onKeyDown,
}: {
  fieldRef: React.RefObject<HTMLTextAreaElement | null>;
  layout: MessageLayout;
  value: string;
  placeholder: string;
  readOnly?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onPointerDown?: (e: React.PointerEvent<HTMLTextAreaElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  const [focused, setFocused] = React.useState(false);
  const [fieldHeightPx, setFieldHeightPx] = React.useState(layout.heightPx);
  const wrapsText = layout.wrap || value.includes("\n") || value.length > 0;

  React.useLayoutEffect(() => {
    const el = fieldRef.current;
    if (!el) return;
    el.style.width = `${layout.widthPx}px`;
    el.style.maxWidth = `${layout.widthPx}px`;
    const next = measureTextareaContentHeight(el);
    el.style.height = `${next}px`;
    setFieldHeightPx(next);
  }, [fieldRef, value, layout.widthPx, layout.heightPx, layout.wrap, wrapsText]);

  return (
    <textarea
      ref={fieldRef}
      value={value}
      readOnly={readOnly}
      autoCapitalize="off"
      onChange={onChange}
      onFocus={() => {
        setFocused(true);
        onFocus?.();
      }}
      onBlur={() => {
        setFocused(false);
        onBlur?.();
      }}
      placeholder={placeholder}
      rows={1}
      style={{
        width: layout.widthPx,
        maxWidth: layout.widthPx,
        height: fieldHeightPx,
      }}
      className={cn(
        FREEZE_MESSAGE_FIELD_CN,
        "!flex-none !min-h-0 box-border overflow-hidden",
        readOnly && "pointer-events-none cursor-default",
        wrapsText
          ? "whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
          : "whitespace-nowrap",
        !readOnly &&
          focused &&
          "border-amber-700 ring-2 ring-amber-500/45 dark:border-amber-300 dark:ring-amber-300/35"
      )}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    />
  );
}

type MasterAccountFreezeTxnOverlayProps = {
  companyId: string;
  collection: MasterAccountFreezeCollection;
  entityId: string;
  isFrozen: boolean;
  freezeMessage?: string | null;
  onSaved: (patch: { freezeMessage?: string | null }) => void;
  /** Top-center banner control — e.g. unfreez toggle when frozen. */
  bannerTopActions?: React.ReactNode;
  /** Mobile: false when banner is too narrow for `bannerTopActions`. */
  onBannerToggleFitsChange?: (fits: boolean) => void;
  className?: string;
};

function normalizeFreezeMessage(value: string): string | null {
  return value.length > 0 ? value : null;
}

/** Capitalize first letter of each word as user types (after start or space). */
function autoCapitalizeOnSpace(value: string): string {
  return value.replace(/(^|\s)([a-z])/g, (_, sep, letter) => sep + letter.toUpperCase());
}

/** 45° diagonal overlay on txn list — frozen account view-only lock. */
export function MasterAccountFreezeTxnOverlay({
  companyId,
  collection,
  entityId,
  isFrozen,
  freezeMessage,
  onSaved,
  bannerTopActions,
  onBannerToggleFitsChange,
  className,
}: MasterAccountFreezeTxnOverlayProps) {
  const { canEditMessage } = useMasterAccountFreezeFeature();
  const [draft, setDraft] = React.useState(freezeMessage ?? "");
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const isEditingRef = React.useRef(false);
  const bannerRef = React.useRef<HTMLDivElement>(null);
  const mirrorRef = React.useRef<HTMLTextAreaElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (isEditingRef.current) return;
    setDraft(freezeMessage ?? "");
  }, [freezeMessage, entityId]);

  React.useEffect(
    () => () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    },
    []
  );

  if (!isFrozen) return null;

  const scheduleMessageSave = (next: string) => {
    if (!canEditMessage) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void (async () => {
        const result = await saveMasterAccountFreeze({
          companyId,
          collection,
          entityId,
          isFrozen: true,
          freezeMessage: next,
        });
        if (result.ok) {
          onSaved({ freezeMessage: normalizeFreezeMessage(next) });
        }
      })();
    }, 600);
  };

  const displayText = canEditMessage ? draft : (freezeMessage ?? "");
  const { layout } = useFreezeMessageFieldLayout(
    displayText,
    MASTER_ACCOUNT_FREEZE_MESSAGE_PLACEHOLDER,
    bannerRef,
    mirrorRef
  );

  return (
    <div
      className={cn("pointer-events-auto absolute inset-0 z-20 overflow-hidden", className)}
      data-pl-master-account-freeze-overlay=""
      aria-label={MASTER_ACCOUNT_FREEZE_BANNER_TITLE}
    >
      <div className="absolute inset-0 bg-amber-100/25 dark:bg-amber-950/20" />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div
          ref={bannerRef}
          data-pl-freeze-banner=""
          className={cn(
            "pointer-events-auto flex w-[min(150%,56rem)] max-w-none min-h-[5.5rem] flex-col items-center justify-center gap-3 overflow-visible origin-center px-8 py-5 text-center",
            FREEZE_BANNER_SURFACE_CN
          )}
          style={{ transform: "rotate(-45deg)" }}
        >
          {bannerTopActions ? (
            <MasterAccountFreezeBannerTopActions
              bannerRef={bannerRef}
              onFitsChange={onBannerToggleFitsChange}
            >
              {bannerTopActions}
            </MasterAccountFreezeBannerTopActions>
          ) : null}
          <div className="flex h-[4.5rem] w-full shrink-0 items-center justify-center gap-1 overflow-visible sm:h-24 sm:gap-2 md:h-28">
            <FreezeBannerDove />
            <p className="min-w-0 flex-1 text-center text-2xl font-bold italic leading-tight text-amber-950 sm:text-3xl dark:text-amber-50">
              {MASTER_ACCOUNT_FREEZE_BANNER_TITLE}
            </p>
            <FreezeBannerDove mirrored />
          </div>
          {canEditMessage || displayText ? (
            <div className="relative flex w-full max-w-full shrink-0 justify-center">
              <FreezeBannerMessageMirror mirrorRef={mirrorRef} />
              <FreezeBannerMessageField
                fieldRef={textareaRef}
                layout={layout}
                value={displayText}
                placeholder={MASTER_ACCOUNT_FREEZE_MESSAGE_PLACEHOLDER}
                readOnly={!canEditMessage}
                onChange={
                  canEditMessage
                    ? (e) => {
                        const next = autoCapitalizeOnSpace(e.target.value);
                        setDraft(next);
                        scheduleMessageSave(next);
                      }
                    : undefined
                }
                onFocus={
                  canEditMessage
                    ? () => {
                        isEditingRef.current = true;
                      }
                    : undefined
                }
                onBlur={
                  canEditMessage
                    ? () => {
                        isEditingRef.current = false;
                        scheduleMessageSave(draft);
                      }
                    : undefined
                }
                onPointerDown={canEditMessage ? (e) => e.stopPropagation() : undefined}
                onKeyDown={canEditMessage ? (e) => e.stopPropagation() : undefined}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
