"use client";

export type CompanyAttachmentMode = "local" | "server" | "online";

export type AttachmentDisplayOptions = {
  localLedgerOnly?: boolean;
  signal?: AbortSignal;
  companyId?: string;
  companyMode?: CompanyAttachmentMode;
};

export type AttachmentDisplayResult = {
  displayUrl: string | null;
  blob: Blob | null;
  contentType: string | null;
};

