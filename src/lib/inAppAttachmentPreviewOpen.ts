/**
 * PDF/image in-app overlays (`inAppPdfPreview` / `inAppImagePreview`) body par portal hote hain —
 * Radix Dialog unhe "outside" maanch kar band ho jata tha (approval state / double-close bug).
 */

/** Close dabte hi `root.remove()` sync ma Radix `onPointerDownOutside` ko "preview band" dikhai dincha — grace rakhnnu. */
let previewClosingGraceUntilMs = 0;
const PREVIEW_CLOSE_GRACE_MS = 480;

/**
 * Root hataisake pachi matra — deferred `click`/tap niche Save ma lagna bata roknu.
 * Shield *preview khula* bela rakhnu hudaina (Close / scroll block / 2-tap).
 */
const PREVIEW_CLICK_SHIELD_MS = 380;

/** `globals.css`: Edit voucher Radix dialog background ma pointer/focus — preview matra top layer. */
export const IN_APP_ATTACHMENT_PREVIEW_BODY_CLASS = "pl-in-app-attachment-preview";

/** Ghost-click eater DOM — `isInAppAttachmentPreviewOpen` / dialog dismiss guard */
export const IN_APP_ATTACHMENT_PREVIEW_CLICK_SHIELD = "data-in-app-attachment-preview-click-shield";

let inAppAttachmentPreviewLayerDepth = 0;

/**
 * Preview khula: body class → Radix voucher niche `pointer-events: none` (globals.css).
 * Yaha `focusin` trap / `blur()` *nahin*: Radix Dialog FocusScope sanga infinite focus fight = page freeze.
 * Focus `showInAppImagePreview` / `showInAppPdfPreview` ko rAF ma `root.focus()` le garchha.
 */
export function pushInAppAttachmentPreviewLayer(_previewRoot: HTMLElement): void {
  if (typeof document === "undefined") return;
  inAppAttachmentPreviewLayerDepth++;
  if (inAppAttachmentPreviewLayerDepth === 1) {
    document.body.classList.add(IN_APP_ATTACHMENT_PREVIEW_BODY_CLASS);
  }
}

/** Preview DOM hataisake — `pointer-events` background ma farkaaune; shield agadi nai. */
export function popInAppAttachmentPreviewLayer(): void {
  if (typeof document === "undefined") return;
  inAppAttachmentPreviewLayerDepth = Math.max(0, inAppAttachmentPreviewLayerDepth - 1);
  if (inAppAttachmentPreviewLayerDepth === 0) {
    document.body.classList.remove(IN_APP_ATTACHMENT_PREVIEW_BODY_CLASS);
  }
}

export function markInAppAttachmentPreviewClosing(): void {
  previewClosingGraceUntilMs = Math.max(previewClosingGraceUntilMs, Date.now() + PREVIEW_CLOSE_GRACE_MS);
}

/** Multi-file gallery overlay (voucher / entity docs) — hardware back + `isInAppAttachmentPreviewOpen` */
const previewLayerSelector = `[data-in-app-pdf-preview], [data-in-app-image-preview], [data-in-app-attachment-gallery], [${IN_APP_ATTACHMENT_PREVIEW_CLICK_SHIELD}]`;

/**
 * DOM hataune lai aglo frame samma — same gesture ma dismiss pipeline pura huda samma `[data-in-app-*]` rahos.
 * Ghost tap: root hataisake *pachi* chadai transparent shield (Close sanga agadi overlap hudaina).
 */
export function scheduleInAppAttachmentPreviewRootRemoval(
  root: HTMLElement,
  onFinally?: () => void
): void {
  previewClosingGraceUntilMs = Math.max(
    previewClosingGraceUntilMs,
    Date.now() + PREVIEW_CLICK_SHIELD_MS + PREVIEW_CLOSE_GRACE_MS
  );

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        onFinally?.();
      } catch {
        /* ignore */
      }
      try {
        root.remove();
      } catch {
        /* ignore */
      }
      // Background dialog feri clickable — tara shield le ~380ms ghost hit khaunchha
      popInAppAttachmentPreviewLayer();

      let shield: HTMLElement | null = null;
      if (typeof document !== "undefined") {
        shield = document.createElement("div");
        shield.setAttribute(IN_APP_ATTACHMENT_PREVIEW_CLICK_SHIELD, "1");
        shield.setAttribute("aria-hidden", "true");
        Object.assign(shield.style, {
          position: "fixed",
          inset: "0",
          zIndex: "2147483647",
          background: "transparent",
          pointerEvents: "auto",
          touchAction: "none",
        } as CSSStyleDeclaration);
        shield.tabIndex = -1;
        const swallow = (e: Event) => {
          e.preventDefault();
          e.stopPropagation();
        };
        const cap = { capture: true, passive: false } as const;
        shield.addEventListener("pointerdown", swallow, cap);
        shield.addEventListener("pointerup", swallow, cap);
        shield.addEventListener("click", swallow, cap);
        shield.addEventListener("touchend", swallow, cap);
        document.body.appendChild(shield);
        queueMicrotask(() => {
          try {
            shield?.focus({ preventScroll: true });
          } catch {
            try {
              shield?.focus();
            } catch {
              /* ignore */
            }
          }
        });
      }

      window.setTimeout(() => {
        try {
          shield?.remove();
        } catch {
          /* ignore */
        }
      }, PREVIEW_CLICK_SHIELD_MS);
    });
  });
}

/** APK hardware back: pehle PDF/image overlay band; natra `tryConsumeDialogHardwareBack` le Edit Transaction khuldincha */
let attachmentPreviewHardwareBackClose: (() => void) | null = null;

export function setAttachmentPreviewHardwareBackHandler(fn: (() => void) | null): void {
  attachmentPreviewHardwareBackClose = fn;
}

export function tryConsumeAttachmentPreviewHardwareBack(): boolean {
  if (typeof document === "undefined") return false;
  const hasOverlay = Boolean(document.querySelector(previewLayerSelector));
  if (!hasOverlay && Date.now() >= previewClosingGraceUntilMs) return false;
  const close = attachmentPreviewHardwareBackClose;
  if (typeof close === "function") {
    close();
    return true;
  }
  return false;
}

export function isInAppAttachmentPreviewOpen(): boolean {
  if (typeof document === "undefined") return false;
  if (Date.now() < previewClosingGraceUntilMs) return true;
  return Boolean(document.querySelector(previewLayerSelector));
}

/**
 * Close button: touch ma `pointerup` le euta gesture; `click` niche Save / Radix lai pathauna nadeu.
 */
export function attachPreviewCloseInteraction(btn: HTMLButtonElement, safeClose: () => void): void {
  const onUp = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    safeClose();
  };
  btn.addEventListener("pointerup", onUp, { passive: false });
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
}
