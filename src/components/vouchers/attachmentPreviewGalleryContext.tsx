"use client";

import * as React from "react";

export type AttachmentPreviewGalleryState = {
  urls: readonly string[];
  index: number;
  setIndex: (index: number) => void;
  goPrev: () => void;
  goNext: () => void;
};

export const AttachmentPreviewGalleryContext =
  React.createContext<AttachmentPreviewGalleryState | null>(null);

export function useAttachmentPreviewGallery(): AttachmentPreviewGalleryState | null {
  return React.useContext(AttachmentPreviewGalleryContext);
}
