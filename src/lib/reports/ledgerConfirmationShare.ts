"use client";

import { Capacitor } from "@capacitor/core";
import {
  sanitizeAttachmentShareFileName,
  shareAttachmentBlob,
} from "@/lib/shareAttachmentBlob";
import type { MasterAccountContactChannel } from "@/lib/reports/masterAccountContactTier";

export function ledgerConfirmationPrintVisibleColumns(
  visible: Partial<
    Record<
      "date" | "type" | "voucherNo" | "user" | "file" | "dr" | "cr" | "status" | "runningBalance",
      boolean
    >
  >
): Partial<
  Record<
    "date" | "type" | "voucherNo" | "user" | "file" | "dr" | "cr" | "status" | "runningBalance",
    boolean
  >
> {
  return {
    date: visible.date !== false,
    type: visible.type !== false,
    voucherNo: visible.voucherNo !== false,
    user: false,
    file: false,
    dr: visible.dr !== false,
    cr: visible.cr !== false,
    runningBalance: visible.runningBalance !== false,
    status: false,
  };
}

export function buildLedgerConfirmationPdfFileName(
  entityName: string | undefined,
  confirmationRunning: boolean,
  fyKey: string
): string {
  const safe = sanitizeAttachmentShareFileName(entityName || "account").replace(/\s+/g, "_");
  const kind = confirmationRunning ? "confirmation" : "statement";
  const fy = fyKey.replace(/[^\w-]+/g, "_");
  return `${safe}_${kind}_${fy}.pdf`;
}

export function buildLedgerConfirmationShareMessage(opts: {
  entityName?: string;
  companyName?: string;
  confirmationRunning: boolean;
  fyKey: string;
  attachHint?: boolean;
}): string {
  const kind = opts.confirmationRunning ? "confirmation" : "statement";
  const who = opts.entityName?.trim() || "there";
  const company = opts.companyName?.trim();
  const intro = company
    ? `Please find your account ${kind} PDF from ${company}.`
    : `Please find your account ${kind} PDF.`;
  const lines = [`Hello ${who},`, intro, `FY: ${opts.fyKey}`];
  if (opts.attachHint) {
    lines.push("", "PDF is downloaded — please attach it using the paperclip (📎) button.");
  }
  return lines.join("\n");
}

export function normalizePhoneForWhatsApp(phone: string, country?: string): string {
  let digits = String(phone || "").replace(/[^\d]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  const normalizedCountry = (country || "").trim().toLowerCase();
  if (
    (normalizedCountry === "nepal" || normalizedCountry === "np") &&
    digits.length === 10 &&
    !digits.startsWith("977")
  ) {
    digits = `977${digits}`;
  }
  return digits;
}

function isCapacitorNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** Desktop browser — Windows share sheet with files often fails; use download + WhatsApp Web. */
export function isDesktopWebBrowser(): boolean {
  if (typeof window === "undefined") return true;
  if (isCapacitorNative()) return false;
  const ua = navigator.userAgent || "";
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return false;
  return true;
}

function openExternalUrlSync(url: string): boolean {
  const u = String(url || "").trim();
  if (!u) return false;
  try {
    const opened = window.open(u, "_blank", "noopener,noreferrer");
    if (opened) return true;
  } catch {
    /* fallback below */
  }
  try {
    const anchor = document.createElement("a");
    anchor.href = u;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return true;
  } catch {
    return false;
  }
}

export function downloadPdfBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}

function openWhatsAppWithMessage(phone: string, text: string, country?: string): boolean {
  const digits = normalizePhoneForWhatsApp(phone, country);
  if (!digits) return false;
  return openExternalUrlSync(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`);
}

function openEmailWithMessage(email: string, subject: string, body: string): boolean {
  const trimmed = String(email || "").trim();
  if (!trimmed) return false;
  return openExternalUrlSync(
    `mailto:${encodeURIComponent(trimmed)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  );
}

async function sharePdfViaMobileNative(
  pdfBlob: Blob,
  fileName: string,
  dialogTitle: string
): Promise<void> {
  await shareAttachmentBlob(pdfBlob, fileName, { dialogTitle });
}

async function shareLedgerConfirmationOnDesktopWeb(opts: {
  channels: MasterAccountContactChannel[];
  pdfBlob: Blob;
  fileName: string;
  confirmationRunning: boolean;
  phone?: string | null;
  email?: string | null;
  country?: string;
  entityName?: string;
  companyName?: string;
  fyKey: string;
}): Promise<{ sharedPhone: boolean; sharedEmail: boolean }> {
  downloadPdfBlob(opts.pdfBlob, opts.fileName);

  const message = buildLedgerConfirmationShareMessage({
    entityName: opts.entityName,
    companyName: opts.companyName,
    confirmationRunning: opts.confirmationRunning,
    fyKey: opts.fyKey,
    attachHint: true,
  });
  const subject = opts.confirmationRunning ? "Account Confirmation" : "Account Statement";

  let sharedPhone = false;
  let sharedEmail = false;

  if (opts.channels.includes("phone")) {
    const phone = String(opts.phone ?? "").trim();
    if (phone) {
      sharedPhone = openWhatsAppWithMessage(phone, message, opts.country);
    }
  }

  if (opts.channels.includes("email")) {
    const email = String(opts.email ?? "").trim();
    if (email) {
      sharedEmail = openEmailWithMessage(email, subject, message);
    }
  }

  return { sharedPhone, sharedEmail };
}

export async function shareLedgerConfirmationPdfChannels(opts: {
  channels: MasterAccountContactChannel[];
  pdfBlob: Blob;
  fileName: string;
  confirmationRunning: boolean;
  phone?: string | null;
  email?: string | null;
  country?: string;
  entityName?: string;
  companyName?: string;
  fyKey: string;
}): Promise<{ sharedPhone: boolean; sharedEmail: boolean; usedDesktopFallback: boolean }> {
  if (isDesktopWebBrowser()) {
    const result = await shareLedgerConfirmationOnDesktopWeb(opts);
    return { ...result, usedDesktopFallback: true };
  }

  const dialogTitle = opts.confirmationRunning
    ? "Send confirmation PDF"
    : "Send statement PDF";

  let sharedPhone = false;
  let sharedEmail = false;

  if (opts.channels.includes("phone")) {
    try {
      await sharePdfViaMobileNative(opts.pdfBlob, opts.fileName, dialogTitle);
      sharedPhone = true;
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") throw e;
    }
  }

  if (opts.channels.includes("email")) {
    try {
      await sharePdfViaMobileNative(opts.pdfBlob, opts.fileName, "Send PDF via email");
      sharedEmail = true;
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") throw e;
    }
  }

  return { sharedPhone, sharedEmail, usedDesktopFallback: false };
}
